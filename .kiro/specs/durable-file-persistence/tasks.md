# Implementation Plan: Durable File Persistence

## Overview

This plan implements cloud synchronization for the dating-calendar application by adding a `SyncService`, `RemoteStoreClient`, and `SyncConfig` provider. The build order starts with configuration and the S3 client wrapper, then builds the orchestrator (`SyncService`), wires it into `PersistenceService` and the module, and finishes by updating bootstrap and adding tests.

## Tasks

- [x] 1. Create sync configuration and constants
  - [x] 1.1 Create `src/ideas/persistence/sync/sync-config.ts`
    - Define the `SyncConfig` interface with all fields (enabled, bucketName, region, keyPrefix, intervalMs, endpoint, startupTimeoutMs, shutdownTimeoutMs, uploadDebounceMs, maxRetries, initialBackoffMs)
    - Export the `SYNC_CONFIG_TOKEN` constant
    - Implement `loadSyncConfig()` factory that reads from `process.env`, validates/clamps `SYNC_INTERVAL_MS` to [5000, 3600000], defaults region to `us-east-1`, defaults keyPrefix to `data/`, sets `enabled: false` when `SYNC_BUCKET_NAME` is missing or empty, normalizes trailing slash on keyPrefix, and logs warnings for invalid values
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 1.2 Write unit tests for `loadSyncConfig()` in `src/ideas/persistence/sync/sync-config.spec.ts`
    - Test default values when env vars are unset
    - Test `enabled: false` when `SYNC_BUCKET_NAME` is empty or missing
    - Test interval clamping for values outside [5000, 3600000] and non-integer values
    - Test keyPrefix trailing slash normalization
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 2. Implement RemoteStoreClient
  - [x] 2.1 Create `src/ideas/persistence/sync/remote-store-client.ts`
    - Implement `RemoteStoreClient` as an `@Injectable()` NestJS service
    - Inject `SYNC_CONFIG_TOKEN` to get bucket, region, endpoint, and key prefix
    - Lazily instantiate `S3Client` on first use with region and optional endpoint
    - Implement `putObject(body: Buffer, sha256: string, signal?: AbortSignal): Promise<void>` using `PutObjectCommand` with `ContentType: 'application/json'` and `Metadata: { sha256 }`
    - Implement `getObject(signal?: AbortSignal): Promise<RemoteObject | null>` using `GetObjectCommand`, returning `null` on NoSuchKey
    - Implement `headObject(signal?: AbortSignal): Promise<{ lastModified?: Date; sha256?: string } | null>` using `HeadObjectCommand`, returning `null` on NotFound
    - Derive object key as `${keyPrefix}ideas.json`
    - Forward `AbortSignal` to all SDK commands
    - _Requirements: 6.1, 2.5_

  - [x] 2.2 Write unit tests for `RemoteStoreClient` in `src/ideas/persistence/sync/remote-store-client.spec.ts`
    - Mock `S3Client.send()` to verify correct command construction
    - Verify SHA-256 is set in Metadata on put
    - Verify abort signal is forwarded
    - Verify `null` return on 404/NoSuchKey
    - _Requirements: 6.1, 2.5_

- [x] 3. Implement SyncService core
  - [x] 3.1 Create `src/ideas/persistence/sync/sync.service.ts` with startup restore logic
    - Implement `SyncService` as `@Injectable()` implementing `OnApplicationBootstrap` and `OnApplicationShutdown`
    - Inject `SYNC_CONFIG_TOKEN` and `RemoteStoreClient`
    - Implement `waitUntilReady(): Promise<void>` that resolves when `readyPromise` resolves
    - In `onApplicationBootstrap()`: if sync is disabled, resolve `readyPromise` immediately and return
    - Implement `restoreFromRemote()` with a 30s timeout: check local file existence and mtime, call `headObject()` to compare timestamps, download if remote is newer or local is missing, verify SHA-256 integrity, write to temp file then atomic rename, fall back to local or empty dataset on failure
    - Log warning when remote is unreachable but local file exists; log error when remote is unreachable and no local file
    - Discard downloaded content when SHA-256 verification fails (keep local if it exists, otherwise empty dataset)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.2, 6.3, 6.4, 6.5_

  - [x] 3.2 Add debounced write-triggered upload to `SyncService`
    - Implement `notifyWrite(): void` that increments `lastWriteSeq`, clears any pending debounce timer, and sets a new 250ms debounce timer
    - When the debounce timer fires: abort any in-flight upload via `currentUploadAbort`, read the local file, compute SHA-256, call `putObject()` with a new `AbortController` signal
    - Implement retry logic: up to 3 attempts with exponential backoff (1s, 2s, 4s), log each failure with attempt number and reason
    - If all retries fail, log error and continue (do not throw)
    - If a new `notifyWrite()` arrives during upload, abort the current upload and restart debounce
    - Track `lastUploadedMtimeMs` on successful upload
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 6.1_

  - [x] 3.3 Add periodic sync and shutdown logic to `SyncService`
    - Implement `startPeriodicTimer()` using `setInterval` at `config.intervalMs`
    - On each tick: stat local file, skip if mtime <= `lastUploadedMtimeMs`, otherwise call `uploadCurrentFile('periodic')`
    - On periodic upload failure: log and wait for next tick
    - Implement `onApplicationShutdown()`: stop periodic timer, cancel debounce timer, abort any in-flight upload, perform final upload with 10s timeout, log error if it fails or times out
    - After startup restore completes (or is skipped), call `startPeriodicTimer()` and trigger initial upload via `notifyWrite()` if a local file exists (Requirement 2.6)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 2.6_

  - [x] 3.4 Write unit tests for `SyncService` in `src/ideas/persistence/sync/sync.service.spec.ts`
    - Mock `RemoteStoreClient` and file system operations
    - Test startup restore: remote newer than local, local newer than remote, remote unreachable with local present, remote unreachable without local, integrity check failure
    - Test debounce: multiple rapid `notifyWrite()` calls result in single upload
    - Test cancellation: `notifyWrite()` during in-flight upload aborts it
    - Test periodic timer: skips upload when mtime unchanged, uploads when mtime changed
    - Test shutdown: final upload within timeout, timeout exceeded logs error
    - Test disabled mode: no network calls, readyPromise resolves immediately
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.5_

- [x] 4. Checkpoint - Core sync components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Integrate SyncService into PersistenceService and module
  - [x] 5.1 Update `src/ideas/persistence/persistence.service.ts`
    - Add `@Optional() private readonly syncService?: SyncService` to constructor (alongside existing `@Optional() @Inject(DATA_DIR_TOKEN) dataDir`)
    - Change `writeData()` to use atomic temp-file + rename pattern: write to `${filePath}.tmp-${process.pid}-${Date.now()}`, then `fs.rename()` to target path
    - After successful rename, call `this.syncService?.notifyWrite()` (fire-and-forget, no await, no try-catch needed since notifyWrite is sync and non-throwing)
    - Keep `readData()` unchanged
    - Keep error handling unchanged (throw `InternalServerErrorException` on write failure)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.2 Update `src/ideas/ideas.module.ts`
    - Import `SyncService`, `RemoteStoreClient`, and `SYNC_CONFIG_TOKEN` / `loadSyncConfig`
    - Add `SyncService`, `RemoteStoreClient`, and `{ provide: SYNC_CONFIG_TOKEN, useFactory: loadSyncConfig }` to providers array
    - _Requirements: 5.2_

  - [x] 5.3 Update `src/main.ts`
    - Import `SyncService` from the sync module
    - Add `app.enableShutdownHooks()` after app creation
    - Add `await app.get(SyncService).waitUntilReady()` before `app.listen()`
    - _Requirements: 1.5, 3.3_

  - [x] 5.4 Update `src/ideas/persistence/persistence.service.spec.ts`
    - Verify atomic write: assert temp file is created then renamed
    - Verify `notifyWrite()` is called on `SyncService` mock after successful write
    - Verify sync errors do not propagate from `writeData()`
    - Verify existing tests still pass with `SyncService` undefined (backward compat)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 6. Checkpoint - Integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Install dependency and add property-based tests
  - [x] 7.1 Install `@aws-sdk/client-s3` runtime dependency
    - Run `npm install @aws-sdk/client-s3`
    - Verify it appears in `package.json` under `dependencies`
    - _Requirements: (infrastructure prerequisite for all sync functionality)_

  - [x] 7.2 Write property tests for sync integrity in `test/property/sync-integrity.property.spec.ts`
    - **Property 1: Local Write Roundtrip** — generate arbitrary valid `StoredData`, write via `PersistenceService`, read back, assert structural equality
    - **Property 2: Upload Integrity** — generate arbitrary byte buffers, compute SHA-256, verify uploaded metadata matches computed hash
    - **Property 3: Download Integrity Rejection** — generate payload/hash pairs where `SHA-256(payload) ≠ hash`, verify `SyncService` does not write payload to local FS
    - **Validates: Requirements 5.1, 6.1, 6.2, 6.3, 6.4**

  - [x] 7.3 Write property tests for sync debounce in `test/property/sync-debounce.property.spec.ts`
    - **Property 4: Debounce Coalescence** — generate sequences of N rapid `notifyWrite()` calls within debounce window, assert exactly one upload is initiated
    - **Property 5: Cancellation Safety** — generate sequences where `notifyWrite()` is called during in-flight upload, assert prior upload is aborted and new upload contains latest state
    - **Validates: Requirements 2.4, 2.5**

- [x] 8. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `@aws-sdk/client-s3` install (task 7.1) is placed late because earlier tasks can be developed with mocked dependencies, but it must run before integration testing

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["3.3"] },
    { "id": 5, "tasks": ["3.4", "5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 7, "tasks": ["7.2", "7.3"] }
  ]
}
```
