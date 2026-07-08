import * as fc from 'fast-check';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { PersistenceService } from '../../src/ideas/persistence/persistence.service';
import { SyncService } from '../../src/ideas/persistence/sync/sync.service';
import { RemoteStoreClient } from '../../src/ideas/persistence/sync/remote-store-client';
import { SyncConfig } from '../../src/ideas/persistence/sync/sync-config';
import { Idea, StoredData } from '../../src/ideas/interfaces/idea.interface';
import { UKRAINIAN_ALPHABET } from '../../src/ideas/constants/ukrainian-alphabet.constant';

/**
 * Property 1: Local Write Roundtrip
 *
 * For all valid StoredData values d:
 * writeData(d) followed by readData() shall return data structurally equal to d.
 *
 * **Validates: Requirements 5.1**
 */
describe('Property 1: Local Write Roundtrip', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbt-sync-roundtrip-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(dataDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  const ideaArbitrary: fc.Arbitrary<Idea> = fc.record({
    id: fc.uuid(),
    letter: fc.constantFrom(...UKRAINIAN_ALPHABET),
    text: fc
      .string({ minLength: 1, maxLength: 200 })
      .filter((s) => s.trim().length > 0),
    done: fc.boolean(),
    createdAt: fc
      .date({
        min: new Date('2020-01-01T00:00:00.000Z'),
        max: new Date('2030-12-31T23:59:59.999Z'),
      })
      .map((d) => d.toISOString()),
  });

  const storedDataArbitrary: fc.Arbitrary<StoredData> = fc
    .array(ideaArbitrary, { minLength: 0, maxLength: 50 })
    .map((ideas) => ({ ideas }));

  it('writeData followed by readData returns structurally equal data', async () => {
    await fc.assert(
      fc.asyncProperty(storedDataArbitrary, async (data: StoredData) => {
        // Instantiate PersistenceService without SyncService (local-only)
        const service = new PersistenceService(dataDir);
        await service.writeData(data);

        // Simulate restart by creating a fresh instance
        const readService = new PersistenceService(dataDir);
        const result = await readService.readData();

        expect(result).toEqual(data);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 2: Upload Integrity
 *
 * For all byte sequences b written to the local file:
 * When SyncService uploads b, the SHA-256 hash included in S3 metadata
 * shall equal SHA-256(b).
 *
 * **Validates: Requirements 6.1**
 */
describe('Property 2: Upload Integrity', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbt-sync-upload-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(dataDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it('uploaded sha256 metadata matches SHA-256 of file content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 2048 }),
        async (bytes: Uint8Array) => {
          const buffer = Buffer.from(bytes);
          const expectedHash = crypto
            .createHash('sha256')
            .update(buffer)
            .digest('hex');

          // Write the buffer to the local file path
          await fs.mkdir(dataDir, { recursive: true });
          const filePath = path.join(dataDir, 'ideas.json');
          await fs.writeFile(filePath, buffer);

          // Create a mock RemoteStoreClient that captures putObject args
          let capturedSha256: string | undefined;
          let capturedBody: Buffer | undefined;
          const mockRemoteClient = {
            putObject: jest.fn(
              async (body: Buffer, sha256: string, _signal?: AbortSignal) => {
                capturedSha256 = sha256;
                capturedBody = body;
              },
            ),
            getObject: jest.fn(async () => null),
            headObject: jest.fn(async () => null),
          } as unknown as RemoteStoreClient;

          const config: SyncConfig = {
            enabled: true,
            bucketName: 'test-bucket',
            region: 'us-east-1',
            keyPrefix: 'data/',
            intervalMs: 999999, // large so periodic timer doesn't interfere
            startupTimeoutMs: 30000,
            shutdownTimeoutMs: 1000,
            uploadDebounceMs: 10, // very short debounce for fast tests
            maxRetries: 1,
            initialBackoffMs: 10,
          };

          const syncService = new SyncService(
            config,
            mockRemoteClient,
            dataDir,
          );

          // Trigger upload via notifyWrite and wait for debounce + async upload
          syncService.notifyWrite();

          // Wait long enough for debounce (10ms) + async upload to complete
          // Use a retry loop to handle occasional timing variability
          let attempts = 0;
          while (
            !(mockRemoteClient.putObject as jest.Mock).mock.calls.length &&
            attempts < 20
          ) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            attempts++;
          }

          // Verify putObject was called with correct sha256
          expect(mockRemoteClient.putObject).toHaveBeenCalled();
          expect(capturedSha256).toBe(expectedHash);
          expect(capturedBody).toEqual(buffer);

          // Clean up: shutdown service to stop timers
          // Disable sync to avoid shutdown upload attempt
          (syncService as any).config = { ...config, enabled: false };
          await syncService.onApplicationShutdown();
        },
      ),
      { numRuns: 100 },
    );
  }, 60000);
});

/**
 * Property 3: Download Integrity Rejection
 *
 * For all payloads p and metadata hashes h where SHA-256(p) ≠ h:
 * SyncService shall not write p to the local file system.
 *
 * **Validates: Requirements 6.2, 6.3, 6.4**
 */
describe('Property 3: Download Integrity Rejection', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'pbt-sync-integrity-reject-'),
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(dataDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it('corrupted downloads are discarded and not written to local FS', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .tuple(
            fc.uint8Array({ minLength: 1, maxLength: 1024 }),
            fc.hexaString({ minLength: 64, maxLength: 64 }),
          )
          .filter(([payload, hash]) => {
            // Ensure the hash does NOT match the actual SHA-256 of the payload
            const actualHash = crypto
              .createHash('sha256')
              .update(Buffer.from(payload))
              .digest('hex');
            return actualHash !== hash;
          }),
        async ([payload, wrongHash]) => {
          const buffer = Buffer.from(payload);
          const filePath = path.join(dataDir, 'ideas.json');

          // Ensure no local file exists before restore
          try {
            await fs.unlink(filePath);
          } catch {
            // ignore
          }

          // Mock RemoteStoreClient that returns mismatched payload + hash
          const mockRemoteClient = {
            putObject: jest.fn(async () => {}),
            getObject: jest.fn(async () => ({
              body: buffer,
              sha256: wrongHash,
              lastModified: new Date(),
            })),
            headObject: jest.fn(async () => ({
              lastModified: new Date(),
              sha256: wrongHash,
            })),
          } as unknown as RemoteStoreClient;

          const config: SyncConfig = {
            enabled: true,
            bucketName: 'test-bucket',
            region: 'us-east-1',
            keyPrefix: 'data/',
            intervalMs: 999999, // large so periodic timer doesn't fire
            startupTimeoutMs: 30000,
            shutdownTimeoutMs: 100,
            uploadDebounceMs: 250,
            maxRetries: 1,
            initialBackoffMs: 10,
          };

          const syncService = new SyncService(
            config,
            mockRemoteClient,
            dataDir,
          );

          // Call onApplicationBootstrap which triggers restoreFromRemote
          await syncService.onApplicationBootstrap();

          // Verify the file was NOT written to the local file system
          let fileExists = true;
          try {
            await fs.access(filePath);
          } catch {
            fileExists = false;
          }

          expect(fileExists).toBe(false);

          // Clean up: shutdown service to stop timers
          // Disable config to avoid shutdown upload retries on non-existent file
          (syncService as any).config = { ...config, enabled: false };
          await syncService.onApplicationShutdown();
        },
      ),
      { numRuns: 100 },
    );
  }, 60000);
});
