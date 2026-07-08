import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { SYNC_CONFIG_TOKEN, SyncConfig } from './sync-config';
import { RemoteStoreClient } from './remote-store-client';
import { DATA_DIR_TOKEN } from '../constants';

@Injectable()
export class SyncService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SyncService.name);
  private readonly filePath: string;
  private readonly dataDir: string;

  private readyResolve!: () => void;
  private readonly readyPromise: Promise<void>;

  // Will be used by tasks 3.2 and 3.3
  private currentUploadAbort: AbortController | null = null;
  private pendingUploadTimer: NodeJS.Timeout | null = null;
  private periodicTimer: NodeJS.Timeout | null = null;
  private lastUploadedMtimeMs: number | null = null;
  private lastWriteSeq = 0;

  constructor(
    @Inject(SYNC_CONFIG_TOKEN) private readonly config: SyncConfig,
    private readonly remoteStoreClient: RemoteStoreClient,
    @Optional() @Inject(DATA_DIR_TOKEN) dataDir?: string,
  ) {
    this.dataDir = dataDir ?? path.join(process.cwd(), 'data');
    this.filePath = path.join(this.dataDir, 'ideas.json');
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /**
   * Resolves when the startup restore is complete (or skipped).
   */
  waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.warn(
        'Remote synchronization is disabled. Running in local-only mode.',
      );
      this.readyResolve();
      return;
    }

    try {
      await this.restoreFromRemote();
      this.startPeriodicTimer();

      // Requirement 2.6: If a local file exists after restore, trigger initial upload
      try {
        await fs.stat(this.filePath);
        this.notifyWrite();
      } catch {
        // File doesn't exist - no initial upload needed
      }
    } finally {
      this.readyResolve();
    }
  }

  /**
   * Called by PersistenceService after a successful local write.
   * Debounces uploads so bursty writes collapse into a single upload.
   */
  notifyWrite(): void {
    if (!this.config.enabled) {
      return;
    }

    this.lastWriteSeq++;

    if (this.pendingUploadTimer !== null) {
      clearTimeout(this.pendingUploadTimer);
      this.pendingUploadTimer = null;
    }

    this.pendingUploadTimer = setTimeout(() => {
      this.pendingUploadTimer = null;
      this.uploadCurrentFile('write');
    }, this.config.uploadDebounceMs);
  }

  /**
   * Uploads the current local file to the remote store with retry logic.
   * Aborts any in-flight upload before starting a new one.
   */
  private async uploadCurrentFile(
    reason: 'write' | 'periodic' | 'startup' | 'shutdown',
  ): Promise<void> {
    const seqAtStart = this.lastWriteSeq;

    // Abort any in-flight upload
    if (this.currentUploadAbort) {
      this.currentUploadAbort.abort();
      this.currentUploadAbort = null;
    }

    const abortController = new AbortController();
    this.currentUploadAbort = abortController;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      // Check if a newer write has arrived
      if (this.lastWriteSeq !== seqAtStart) {
        this.logger.log(
          `Upload (${reason}) aborted: newer write arrived (seq ${this.lastWriteSeq} > ${seqAtStart}).`,
        );
        this.currentUploadAbort = null;
        return;
      }

      // Check if aborted externally
      if (abortController.signal.aborted) {
        this.currentUploadAbort = null;
        return;
      }

      try {
        const body = await fs.readFile(this.filePath);
        const stat = await fs.stat(this.filePath);
        const sha256 = crypto.createHash('sha256').update(body).digest('hex');

        await this.remoteStoreClient.putObject(
          body,
          sha256,
          abortController.signal,
        );

        // Success
        this.lastUploadedMtimeMs = stat.mtimeMs;
        this.currentUploadAbort = null;
        this.logger.log(`Upload (${reason}) succeeded on attempt ${attempt}.`);
        return;
      } catch (err: unknown) {
        // If aborted (either externally or by a new write), stop retrying
        if (
          abortController.signal.aborted ||
          this.lastWriteSeq !== seqAtStart
        ) {
          this.currentUploadAbort = null;
          return;
        }

        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Upload (${reason}) attempt ${attempt}/${this.config.maxRetries} failed: ${errorMessage}`,
        );

        // If not the last attempt, wait with exponential backoff
        if (attempt < this.config.maxRetries) {
          const backoffMs =
            this.config.initialBackoffMs * Math.pow(2, attempt - 1);
          try {
            await this.delay(backoffMs, abortController.signal);
          } catch {
            // Delay was aborted (new write or external abort)
            this.currentUploadAbort = null;
            return;
          }

          // Re-check after waiting
          if (
            this.lastWriteSeq !== seqAtStart ||
            abortController.signal.aborted
          ) {
            this.currentUploadAbort = null;
            return;
          }
        }
      }
    }

    // All retries exhausted
    this.logger.error(
      `Upload (${reason}) failed after ${this.config.maxRetries} attempts. Continuing without remote backup.`,
    );
    this.currentUploadAbort = null;
  }

  /**
   * Returns a promise that resolves after `ms` milliseconds, or rejects if the signal is aborted.
   */
  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Aborted'));
        return;
      }

      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async onApplicationShutdown(_signal?: string): Promise<void> {
    // Stop periodic timer
    this.stopPeriodicTimer();

    // Cancel debounce timer
    if (this.pendingUploadTimer !== null) {
      clearTimeout(this.pendingUploadTimer);
      this.pendingUploadTimer = null;
    }

    // Abort any in-flight upload
    if (this.currentUploadAbort) {
      this.currentUploadAbort.abort();
      this.currentUploadAbort = null;
    }

    if (!this.config.enabled) {
      return;
    }

    // Perform final upload with shutdownTimeoutMs timeout
    try {
      const uploadPromise = this.uploadCurrentFile('shutdown');
      const timeoutPromise = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), this.config.shutdownTimeoutMs),
      );

      const result = await Promise.race([uploadPromise, timeoutPromise]);
      if (result === 'timeout') {
        this.logger.error(
          'Shutdown upload timed out. Data file may not be synced to remote store.',
        );
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Shutdown upload failed: ${errorMessage}. Data file may not be synced to remote store.`,
      );
    }
  }

  private startPeriodicTimer(): void {
    this.periodicTimer = setInterval(async () => {
      try {
        const stat = await fs.stat(this.filePath);
        if (
          this.lastUploadedMtimeMs !== null &&
          stat.mtimeMs <= this.lastUploadedMtimeMs
        ) {
          return; // No changes since last upload
        }
        await this.uploadCurrentFile('periodic');
      } catch (err) {
        // File doesn't exist or other error - skip this tick
        this.logger.warn(
          `Periodic sync skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }, this.config.intervalMs);
  }

  private stopPeriodicTimer(): void {
    if (this.periodicTimer !== null) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  private async restoreFromRemote(): Promise<void> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, this.config.startupTimeoutMs);

    try {
      // Step 1: Check local file existence and mtime
      let localExists = false;
      let localMtime: Date | undefined;
      try {
        const stat = await fs.stat(this.filePath);
        localExists = true;
        localMtime = stat.mtime;
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw err;
        }
        // ENOENT: local file doesn't exist
      }

      // Step 2: headObject to get remote metadata
      let remoteMeta: { lastModified?: Date; sha256?: string } | null;
      try {
        remoteMeta = await this.remoteStoreClient.headObject(
          abortController.signal,
        );
      } catch (err: unknown) {
        // Remote unreachable (timeout, network error, abort)
        this.logger.warn(`Error: ${err}`);
        if (localExists) {
          this.logger.warn(
            'Remote store is unreachable during startup. Continuing with local data file.',
          );
        } else {
          this.logger.error(
            'Remote store is unreachable during startup and no local data file exists. Starting with empty dataset.',
          );
        }
        return;
      }

      // Step 3: Decide whether to download
      if (remoteMeta === null) {
        // Remote object doesn't exist (404)
        if (localExists) {
          this.logger.log(
            'Remote object does not exist. Keeping local data file.',
          );
        } else {
          this.logger.log(
            'Remote object does not exist and no local file. Starting with empty dataset.',
          );
        }
        return;
      }

      const remoteLastModified = remoteMeta.lastModified;

      // If local exists and is newer or equal, keep local
      if (localExists && localMtime && remoteLastModified) {
        if (localMtime.getTime() >= remoteLastModified.getTime()) {
          this.logger.log(
            'Local file is up-to-date or newer than remote. Keeping local.',
          );
          return;
        }
      }

      // Download: remote is newer or local is missing
      this.logger.log(
        localExists
          ? 'Remote file is newer than local. Downloading...'
          : 'No local file exists. Downloading from remote...',
      );

      let remoteObject;
      try {
        remoteObject = await this.remoteStoreClient.getObject(
          abortController.signal,
        );
      } catch (err: unknown) {
        // Download failed (timeout, network error, abort)
        if (localExists) {
          this.logger.warn(
            'Failed to download from remote store. Continuing with local data file.',
          );
        } else {
          this.logger.error(
            'Failed to download from remote store and no local data file exists. Starting with empty dataset.',
          );
        }
        return;
      }

      if (!remoteObject) {
        // Object was deleted between head and get
        this.logger.warn(
          'Remote object disappeared between head and get. Keeping current state.',
        );
        return;
      }

      // Step 4: Verify SHA-256 integrity
      const expectedSha256 = remoteObject.sha256 ?? remoteMeta.sha256;
      if (expectedSha256) {
        const computedSha256 = crypto
          .createHash('sha256')
          .update(remoteObject.body)
          .digest('hex');

        if (computedSha256 !== expectedSha256) {
          if (localExists) {
            this.logger.error(
              `SHA-256 integrity check failed (expected: ${expectedSha256}, got: ${computedSha256}). Discarding download, keeping local file.`,
            );
          } else {
            this.logger.error(
              `SHA-256 integrity check failed (expected: ${expectedSha256}, got: ${computedSha256}). Discarding download, starting with empty dataset.`,
            );
          }
          return;
        }
      }

      // Step 5: Write to temp file then atomic rename
      await fs.mkdir(this.dataDir, { recursive: true });
      const tmpPath = path.join(
        this.dataDir,
        `ideas.json.tmp-restore-${process.pid}-${Date.now()}`,
      );
      try {
        await fs.writeFile(tmpPath, remoteObject.body);
        await fs.rename(tmpPath, this.filePath);
        this.logger.log('Successfully restored data from remote store.');
      } catch (err: unknown) {
        // Clean up temp file on failure
        try {
          await fs.unlink(tmpPath);
        } catch {
          // ignore cleanup errors
        }
        if (localExists) {
          this.logger.warn(
            'Failed to write restored data to local file. Continuing with existing local file.',
          );
        } else {
          this.logger.error(
            'Failed to write restored data to local file and no local data exists. Starting with empty dataset.',
          );
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
