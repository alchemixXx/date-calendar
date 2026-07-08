import * as fc from 'fast-check';
import { SyncService } from '../../src/ideas/persistence/sync/sync.service';
import { RemoteStoreClient } from '../../src/ideas/persistence/sync/remote-store-client';
import { SyncConfig } from '../../src/ideas/persistence/sync/sync-config';

jest.mock('fs/promises');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs/promises');

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

function createMockConfig(overrides?: Partial<SyncConfig>): SyncConfig {
  return {
    enabled: true,
    bucketName: 'test-bucket',
    region: 'us-east-1',
    keyPrefix: 'data/',
    intervalMs: 60000,
    endpoint: undefined,
    startupTimeoutMs: 30000,
    shutdownTimeoutMs: 10000,
    uploadDebounceMs: 250,
    maxRetries: 3,
    initialBackoffMs: 1000,
    ...overrides,
  };
}

function createMockRemoteStoreClient() {
  return {
    putObject: jest.fn().mockResolvedValue(undefined),
    getObject: jest.fn().mockResolvedValue(null),
    headObject: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<RemoteStoreClient>;
}

/**
 * Property 4: Debounce Coalescence
 *
 * For all sequences of N rapid notifyWrite() calls arriving within the
 * debounce window (250ms): exactly one upload attempt shall be initiated.
 *
 * **Validates: Requirements 2.4**
 */
describe('Property 4: Debounce Coalescence', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });

    const validData = JSON.stringify({ ideas: [] });
    fs.readFile.mockResolvedValue(Buffer.from(validData));
    fs.stat.mockResolvedValue({ mtimeMs: Date.now(), mtime: new Date() });
    fs.mkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('N rapid notifyWrite() calls within debounce window produce exactly one upload', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 50 }), async (n: number) => {
        const mockRemote = createMockRemoteStoreClient();
        mockRemote.headObject.mockResolvedValue(null);

        const config = createMockConfig();
        const service = new SyncService(config, mockRemote, '/tmp/test-data');

        // Bootstrap the service - make local file not exist so no initial upload
        fs.stat.mockRejectedValueOnce(
          Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );
        await service.onApplicationBootstrap();
        await flushMicrotasks();

        // Clear any calls from bootstrap
        mockRemote.putObject.mockClear();

        // Re-setup fs mocks for the actual test
        const validData = JSON.stringify({ ideas: [] });
        fs.readFile.mockResolvedValue(Buffer.from(validData));
        fs.stat.mockResolvedValue({ mtimeMs: Date.now(), mtime: new Date() });

        // Call notifyWrite() N times rapidly (no delays)
        for (let i = 0; i < n; i++) {
          service.notifyWrite();
        }

        // Advance past the debounce window
        jest.advanceTimersByTime(250);
        await flushMicrotasks();

        // Allow the upload promise to settle
        await flushMicrotasks();

        // Assert exactly one upload was initiated
        expect(mockRemote.putObject).toHaveBeenCalledTimes(1);

        // Cleanup
        await service.onApplicationShutdown();
      }),
      { numRuns: 50 },
    );
  });
});

/**
 * Property 5: Cancellation Safety
 *
 * For all sequences where notifyWrite() is called while an upload is in-flight:
 * the in-flight upload shall be aborted, and a new upload of the latest file
 * state shall be initiated after the debounce window.
 *
 * **Validates: Requirements 2.5**
 */
describe('Property 5: Cancellation Safety', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });

    const validData = JSON.stringify({ ideas: [] });
    fs.readFile.mockResolvedValue(Buffer.from(validData));
    fs.stat.mockResolvedValue({ mtimeMs: Date.now(), mtime: new Date() });
    fs.mkdir.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('notifyWrite() during in-flight upload aborts prior upload and initiates new one', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 10 }), async (_n: number) => {
        const mockRemote = createMockRemoteStoreClient();
        mockRemote.headObject.mockResolvedValue(null);

        // Track abort signals passed to putObject
        const abortSignals: AbortSignal[] = [];
        let putCallCount = 0;

        // Use a deferred pattern: putObject never resolves until aborted
        // This simulates an in-flight upload that stays pending
        mockRemote.putObject.mockImplementation(
          (
            _body: Buffer,
            _sha256: string,
            signal?: AbortSignal,
          ): Promise<void> => {
            putCallCount++;
            if (signal) {
              abortSignals.push(signal);
            }
            // Return a promise that rejects on abort, never resolves otherwise
            return new Promise<void>((resolve, reject) => {
              if (signal?.aborted) {
                reject(new Error('Aborted'));
                return;
              }
              signal?.addEventListener(
                'abort',
                () => {
                  reject(new Error('Aborted'));
                },
                { once: true },
              );
              // Intentionally never resolves — simulates slow in-flight upload
            });
          },
        );

        const config = createMockConfig();
        const service = new SyncService(config, mockRemote, '/tmp/test-data');

        // Bootstrap without triggering initial upload
        fs.stat.mockRejectedValueOnce(
          Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );
        await service.onApplicationBootstrap();
        await flushMicrotasks();

        // Clear state from bootstrap
        putCallCount = 0;
        abortSignals.length = 0;

        // Re-setup fs mocks
        const validData = JSON.stringify({ ideas: [] });
        fs.readFile.mockResolvedValue(Buffer.from(validData));
        fs.stat.mockResolvedValue({
          mtimeMs: Date.now(),
          mtime: new Date(),
        });

        // Step 1: Call notifyWrite() to start the first upload
        service.notifyWrite();

        // Advance past debounce to fire the upload
        jest.advanceTimersByTime(250);
        await flushMicrotasks();

        // The first putObject should have been called
        expect(putCallCount).toBeGreaterThanOrEqual(1);
        const firstSignal = abortSignals[0];
        expect(firstSignal).toBeDefined();

        // Step 2: While first upload is in-flight, call notifyWrite() again
        service.notifyWrite();

        // Advance past the second debounce window to trigger the new upload.
        // The abort happens at the start of uploadCurrentFile when the
        // debounce timer fires and the new upload begins.
        jest.advanceTimersByTime(250);
        await flushMicrotasks();

        // The first upload's signal should now be aborted
        expect(firstSignal.aborted).toBe(true);

        // A second putObject call should have been initiated
        expect(putCallCount).toBeGreaterThanOrEqual(2);

        // Cleanup: make putObject resolve for shutdown
        mockRemote.putObject.mockResolvedValue(undefined);
        await service.onApplicationShutdown();
        await flushMicrotasks();
      }),
      { numRuns: 50 },
    );
  }, 30000);
});
