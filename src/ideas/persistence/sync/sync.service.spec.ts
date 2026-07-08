import { SyncService } from './sync.service';
import { SyncConfig } from './sync-config';
import { RemoteStoreClient } from './remote-store-client';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

jest.mock('fs/promises');

const mockedFs = jest.mocked(fs);

function createConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
  return {
    enabled: true,
    bucketName: 'test-bucket',
    region: 'us-east-1',
    keyPrefix: 'data/',
    intervalMs: 60000,
    startupTimeoutMs: 30000,
    shutdownTimeoutMs: 10000,
    uploadDebounceMs: 250,
    maxRetries: 3,
    initialBackoffMs: 1000,
    ...overrides,
  };
}

function createMockRemoteClient(): jest.Mocked<RemoteStoreClient> {
  return {
    putObject: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn().mockResolvedValue(null),
    headObject: jest.fn().mockResolvedValue(null),
  } as any;
}

/**
 * Flush the microtask queue. Works with fake timers because
 * we excluded nextTick from being faked.
 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Advance fake timers by `ms` and flush microtask queue multiple times
 * to allow promise chains to resolve.
 */
async function advanceAndFlush(ms: number, cycles = 10): Promise<void> {
  jest.advanceTimersByTime(ms);
  for (let i = 0; i < cycles; i++) {
    await flushMicrotasks();
  }
}

describe('SyncService', () => {
  let config: SyncConfig;
  let mockRemoteClient: jest.Mocked<RemoteStoreClient>;

  beforeEach(() => {
    jest.useFakeTimers({
      doNotFake: ['setImmediate', 'nextTick'],
    });
    jest.clearAllMocks();
    config = createConfig();
    mockRemoteClient = createMockRemoteClient();

    // Default fs mocks - no local file
    mockedFs.stat.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );
    mockedFs.readFile.mockResolvedValue(Buffer.from('{"ideas":[]}'));
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.rename.mockResolvedValue(undefined);
    mockedFs.unlink.mockResolvedValue(undefined);
    mockedFs.mkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('disabled mode', () => {
    it('should resolve readyPromise immediately when config.enabled is false', async () => {
      const disabledConfig = createConfig({ enabled: false });
      const service = new SyncService(
        disabledConfig,
        mockRemoteClient,
        '/tmp/test-data',
      );

      await service.onApplicationBootstrap();
      await service.waitUntilReady();

      expect(mockRemoteClient.headObject).not.toHaveBeenCalled();
      expect(mockRemoteClient.getObject).not.toHaveBeenCalled();
      expect(mockRemoteClient.putObject).not.toHaveBeenCalled();
    });

    it('should not make network calls on notifyWrite when disabled', async () => {
      const disabledConfig = createConfig({ enabled: false });
      const service = new SyncService(
        disabledConfig,
        mockRemoteClient,
        '/tmp/test-data',
      );

      await service.onApplicationBootstrap();
      service.notifyWrite();

      await advanceAndFlush(1000);

      expect(mockRemoteClient.putObject).not.toHaveBeenCalled();
    });
  });

  describe('startup restore - remote newer than local', () => {
    it('should download and write file when remote is newer', async () => {
      const localMtime = new Date('2024-01-01T00:00:00Z');
      const remoteMtime = new Date('2024-01-02T00:00:00Z');
      const remoteBody = Buffer.from('{"ideas":[{"id":"1"}]}');
      const sha256 = crypto
        .createHash('sha256')
        .update(remoteBody)
        .digest('hex');

      mockedFs.stat.mockResolvedValue({
        mtime: localMtime,
        mtimeMs: localMtime.getTime(),
      } as any);

      mockRemoteClient.headObject.mockResolvedValue({
        lastModified: remoteMtime,
        sha256,
      });

      mockRemoteClient.getObject.mockResolvedValue({
        body: remoteBody,
        sha256,
        lastModified: remoteMtime,
      });

      const service = new SyncService(
        config,
        mockRemoteClient,
        '/tmp/test-data',
      );
      await service.onApplicationBootstrap();

      expect(mockRemoteClient.getObject).toHaveBeenCalled();
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('ideas.json.tmp-restore-'),
        remoteBody,
      );
      expect(mockedFs.rename).toHaveBeenCalled();
    });
  });

  describe('startup restore - local newer than remote', () => {
    it('should keep local file when local is newer', async () => {
      const localMtime = new Date('2024-01-02T00:00:00Z');
      const remoteMtime = new Date('2024-01-01T00:00:00Z');

      mockedFs.stat.mockResolvedValue({
        mtime: localMtime,
        mtimeMs: localMtime.getTime(),
      } as any);

      mockRemoteClient.headObject.mockResolvedValue({
        lastModified: remoteMtime,
        sha256: 'abc123',
      });

      const service = new SyncService(
        config,
        mockRemoteClient,
        '/tmp/test-data',
      );
      await service.onApplicationBootstrap();

      expect(mockRemoteClient.getObject).not.toHaveBeenCalled();
    });
  });

  describe('startup restore - remote unreachable with local present', () => {
    it('should log warning and keep local file when remote throws', async () => {
      const localMtime = new Date('2024-01-01T00:00:00Z');

      mockedFs.stat.mockResolvedValue({
        mtime: localMtime,
        mtimeMs: localMtime.getTime(),
      } as any);

      mockRemoteClient.headObject.mockRejectedValue(new Error('Network error'));

      const service = new SyncService(
        config,
        mockRemoteClient,
        '/tmp/test-data',
      );

      await service.onApplicationBootstrap();
      await service.waitUntilReady();

      expect(mockRemoteClient.getObject).not.toHaveBeenCalled();
    });
  });

  describe('startup restore - remote unreachable without local', () => {
    it('should log error and start with empty dataset', async () => {
      mockedFs.stat.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      mockRemoteClient.headObject.mockRejectedValue(new Error('Network error'));

      const service = new SyncService(
        config,
        mockRemoteClient,
        '/tmp/test-data',
      );

      await service.onApplicationBootstrap();
      await service.waitUntilReady();

      expect(mockRemoteClient.getObject).not.toHaveBeenCalled();
    });
  });

  describe('startup restore - SHA-256 mismatch', () => {
    it('should discard downloaded content when hash does not match', async () => {
      const remoteMtime = new Date('2024-01-02T00:00:00Z');
      const remoteBody = Buffer.from('{"ideas":[{"id":"1"}]}');
      const wrongSha256 =
        'deadbeef0000000000000000000000000000000000000000000000000000dead';

      mockedFs.stat.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      mockRemoteClient.headObject.mockResolvedValue({
        lastModified: remoteMtime,
        sha256: wrongSha256,
      });

      mockRemoteClient.getObject.mockResolvedValue({
        body: remoteBody,
        sha256: wrongSha256,
        lastModified: remoteMtime,
      });

      const service = new SyncService(
        config,
        mockRemoteClient,
        '/tmp/test-data',
      );
      await service.onApplicationBootstrap();

      // File should NOT be written because integrity check fails
      expect(mockedFs.writeFile).not.toHaveBeenCalled();
      expect(mockedFs.rename).not.toHaveBeenCalled();
    });
  });

  describe('debounce coalescence', () => {
    it('should call putObject exactly once when notifyWrite is called 5 times rapidly', async () => {
      const localMtime = new Date('2024-01-01T00:00:00Z');
      mockedFs.stat.mockResolvedValue({
        mtime: localMtime,
        mtimeMs: localMtime.getTime(),
      } as any);
      mockRemoteClient.headObject.mockResolvedValue(null);

      const service = new SyncService(
        config,
        mockRemoteClient,
        '/tmp/test-data',
      );
      await service.onApplicationBootstrap();

      // Bootstrap triggers notifyWrite() since local file exists.
      // Let that initial debounce fire and complete.
      await advanceAndFlush(300);

      // Clear any calls from bootstrap
      mockRemoteClient.putObject.mockClear();

      // Call notifyWrite 5 times rapidly (within debounce window)
      service.notifyWrite();
      service.notifyWrite();
      service.notifyWrite();
      service.notifyWrite();
      service.notifyWrite();

      // Advance past debounce window (250ms) and flush
      await advanceAndFlush(300);

      expect(mockRemoteClient.putObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancellation', () => {
    it('should abort in-flight upload when notifyWrite is called during upload', async () => {
      const localMtime = new Date('2024-01-01T00:00:00Z');
      mockedFs.stat.mockResolvedValue({
        mtime: localMtime,
        mtimeMs: localMtime.getTime(),
      } as any);
      mockRemoteClient.headObject.mockResolvedValue(null);

      const service = new SyncService(
        config,
        mockRemoteClient,
        '/tmp/test-data',
      );
      await service.onApplicationBootstrap();

      // Let bootstrap's initial upload fire and complete
      await advanceAndFlush(300);

      // Now set up a slow putObject for the first call of the next upload cycle
      let firstSignal: AbortSignal | undefined;
      let callCount = 0;
      mockRemoteClient.putObject.mockImplementation(
        async (_body, _sha, signal) => {
          callCount++;
          if (callCount === 1) {
            firstSignal = signal;
            // Simulate slow upload
            return new Promise<void>((resolve, reject) => {
              if (signal?.aborted) {
                reject(new Error('Aborted'));
                return;
              }
              const timer = setTimeout(resolve, 30000);
              signal?.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new Error('Aborted'));
              });
            });
          }
        },
      );

      // First notifyWrite → triggers debounce
      service.notifyWrite();
      // Advance past debounce to start the slow upload
      await advanceAndFlush(260);

      // The upload is now in-flight. Call notifyWrite again to abort it.
      service.notifyWrite();
      await advanceAndFlush(260);

      expect(firstSignal?.aborted).toBe(true);
    });
  });

  describe('periodic timer - no change', () => {
    it('should skip upload when mtime has not changed since last upload', async () => {
      const localMtime = new Date('2024-01-01T00:00:00Z');
      mockedFs.stat.mockResolvedValue({
        mtime: localMtime,
        mtimeMs: localMtime.getTime(),
      } as any);
      mockRemoteClient.headObject.mockResolvedValue(null);

      const service = new SyncService(
        config,
        mockRemoteClient,
        '/tmp/test-data',
      );
      await service.onApplicationBootstrap();

      // Let bootstrap's initial upload complete (sets lastUploadedMtimeMs)
      await advanceAndFlush(300);

      mockRemoteClient.putObject.mockClear();

      // Advance by one interval. Mtime hasn't changed, so periodic upload should skip.
      await advanceAndFlush(config.intervalMs);

      expect(mockRemoteClient.putObject).not.toHaveBeenCalled();
    });
  });

  describe('periodic timer - file changed', () => {
    it('should upload when mtime has changed since last upload', async () => {
      const localMtime = new Date('2024-01-01T00:00:00Z');
      mockedFs.stat.mockResolvedValue({
        mtime: localMtime,
        mtimeMs: localMtime.getTime(),
      } as any);
      mockRemoteClient.headObject.mockResolvedValue(null);

      const service = new SyncService(
        config,
        mockRemoteClient,
        '/tmp/test-data',
      );
      await service.onApplicationBootstrap();

      // Let bootstrap's initial upload complete
      await advanceAndFlush(300);

      mockRemoteClient.putObject.mockClear();

      // Now simulate that file mtime has changed
      const newMtime = new Date('2024-01-01T01:00:00Z');
      mockedFs.stat.mockResolvedValue({
        mtime: newMtime,
        mtimeMs: newMtime.getTime(),
      } as any);

      // Advance by one interval
      await advanceAndFlush(config.intervalMs);

      expect(mockRemoteClient.putObject).toHaveBeenCalled();
    });
  });

  describe('shutdown - successful upload', () => {
    it('should perform final upload on shutdown', async () => {
      const localMtime = new Date('2024-01-01T00:00:00Z');
      mockedFs.stat.mockResolvedValue({
        mtime: localMtime,
        mtimeMs: localMtime.getTime(),
      } as any);
      mockRemoteClient.headObject.mockResolvedValue(null);

      const service = new SyncService(
        config,
        mockRemoteClient,
        '/tmp/test-data',
      );
      await service.onApplicationBootstrap();

      // Let initial upload complete
      await advanceAndFlush(300);

      mockRemoteClient.putObject.mockClear();

      // Trigger shutdown
      const shutdownPromise = service.onApplicationShutdown('SIGTERM');
      await advanceAndFlush(config.shutdownTimeoutMs + 100);
      await shutdownPromise;

      expect(mockRemoteClient.putObject).toHaveBeenCalled();
    });
  });

  describe('shutdown - timeout exceeded', () => {
    it('should log error when shutdown upload exceeds timeout', async () => {
      const localMtime = new Date('2024-01-01T00:00:00Z');
      mockedFs.stat.mockResolvedValue({
        mtime: localMtime,
        mtimeMs: localMtime.getTime(),
      } as any);
      mockRemoteClient.headObject.mockResolvedValue(null);

      // Make putObject take very long (never resolves within timeout)
      mockRemoteClient.putObject.mockImplementation(
        async (_body, _sha, signal) => {
          return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 120000);
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('Aborted'));
            });
          });
        },
      );

      const service = new SyncService(
        config,
        mockRemoteClient,
        '/tmp/test-data',
      );
      await service.onApplicationBootstrap();

      // Let bootstrap's debounce fire (starts slow upload)
      await advanceAndFlush(300);

      const loggerSpy = jest.spyOn((service as any).logger, 'error');

      // Trigger shutdown - aborts in-flight upload, starts final upload (also slow)
      const shutdownPromise = service.onApplicationShutdown('SIGTERM');

      // Advance past shutdown timeout
      await advanceAndFlush(config.shutdownTimeoutMs + 500);
      await shutdownPromise;

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('timed out'),
      );
    });
  });
});
