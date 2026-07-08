# Requirements Document

## Introduction

The dating-calendar application currently persists idea data to a local JSON file (`data/ideas.json`) via a `PersistenceService`. When the hosting server restarts or the file system is ephemeral (e.g., containerized deployments), all stored data is lost. This feature adds a cloud storage synchronization layer that keeps the simple file-based approach while ensuring data survives server restarts by backing up to and restoring from a remote object store (AWS S3 or compatible).

## Glossary

- **Persistence_Service**: The existing NestJS injectable service responsible for reading and writing `StoredData` to the local JSON file.
- **Sync_Service**: A new NestJS injectable service responsible for uploading the local data file to remote storage and downloading it back on startup.
- **Remote_Store**: An S3-compatible object storage bucket used as the durable backing store for the data file.
- **StoredData**: The JSON structure containing the array of ideas, as defined in `idea.interface.ts`.
- **Sync_Interval**: The configurable time period between automatic background uploads of the local file to the Remote_Store.
- **Startup_Restore**: The process of downloading the latest data file from the Remote_Store when the application starts and no local file exists or the local file is outdated.

## Requirements

### Requirement 1: Restore Data from Remote Store on Startup

**User Story:** As an application operator, I want the application to restore the most recent data from cloud storage on startup, so that data is not lost after a server restart.

#### Acceptance Criteria

1. WHEN the application starts AND no local data file exists, THE Sync_Service SHALL download the data file from the Remote_Store and write it to the local file path before the Persistence_Service handles any read requests. IF the download does not complete within 30 seconds, THEN THE Sync_Service SHALL treat the Remote_Store as unreachable.
2. WHEN the application starts AND a local data file exists, THE Sync_Service SHALL compare the last-modified timestamp of the local file with the remote object's last-modified metadata. IF the remote timestamp is more recent than the local timestamp, THEN THE Sync_Service SHALL download the remote file and overwrite the local file. IF the local timestamp is more recent than or equal to the remote timestamp, THEN THE Sync_Service SHALL retain the local file without modification.
3. IF the Remote_Store does not respond within 30 seconds during startup AND a local data file exists, THEN THE Sync_Service SHALL log a warning message indicating the Remote_Store was unreachable and continue using the local data file.
4. IF the Remote_Store does not respond within 30 seconds during startup AND no local data file exists, THEN THE Sync_Service SHALL log an error message indicating the Remote_Store was unreachable and start with an empty dataset containing zero ideas.
5. WHEN the Sync_Service restore operation completes, THE Sync_Service SHALL signal readiness before the application begins accepting incoming HTTP requests.

### Requirement 2: Upload Data to Remote Store After Writes

**User Story:** As an application operator, I want every data write to be backed up to cloud storage, so that the most recent state is always recoverable.

#### Acceptance Criteria

1. WHEN the Persistence_Service completes a write to the local file, THE Sync_Service SHALL upload the complete contents of the updated file to the Remote_Store within 5 seconds of write completion.
2. IF the upload to the Remote_Store fails, THEN THE Sync_Service SHALL retry the upload up to 3 times with exponential backoff starting at 1 second (1s, 2s, 4s intervals) and log each failure with the attempt number and failure reason.
3. IF all 3 retry attempts fail, THEN THE Sync_Service SHALL log an error with the failure reason and continue processing subsequent write events without blocking the application.
4. WHILE an upload or retry sequence is in progress, IF a new write completes, THEN THE Sync_Service SHALL cancel or supersede the in-progress upload and initiate a new upload of the latest file state, ensuring only the most recent file content is uploaded to the Remote_Store.
5. THE Sync_Service SHALL upload the file atomically such that the Remote_Store never contains a partially written file; if an upload fails mid-transfer, the previous complete version in the Remote_Store SHALL remain unchanged.
6. WHEN the Sync_Service starts and a local file exists, THE Sync_Service SHALL upload the current local file to the Remote_Store to ensure the remote copy reflects the latest local state.

### Requirement 3: Periodic Background Sync

**User Story:** As an application operator, I want the data file to be periodically synced to cloud storage, so that even if an upload-after-write is missed, the data is still backed up within a bounded time window.

#### Acceptance Criteria

1. WHILE the application is running, THE Sync_Service SHALL upload the local data file to the Remote_Store at a configurable Sync_Interval (default: 60 seconds, minimum: 5 seconds, maximum: 3600 seconds).
2. IF the local data file has not been modified since the last successful upload (determined by file modification timestamp), THEN THE Sync_Service SHALL skip the periodic upload for that interval.
3. WHEN the application receives a shutdown signal, THE Sync_Service SHALL perform a final upload of the local data file to the Remote_Store within a maximum of 10 seconds before the process exits.
4. IF a periodic upload to the Remote_Store fails, THEN THE Sync_Service SHALL log the failure and reattempt the upload at the next scheduled Sync_Interval without interrupting application operation.
5. IF the final shutdown upload fails or exceeds the 10-second timeout, THEN THE Sync_Service SHALL log an error indicating the data file was not synced and allow the process to exit.

### Requirement 4: Configuration via Environment Variables

**User Story:** As an application operator, I want to configure the remote storage connection through environment variables, so that I can deploy to different environments without code changes.

#### Acceptance Criteria

1. THE Sync_Service SHALL read the remote storage bucket name from the `SYNC_BUCKET_NAME` environment variable.
2. THE Sync_Service SHALL read the remote storage region from the `SYNC_REGION` environment variable with a default value of `us-east-1`.
3. THE Sync_Service SHALL read the remote object key prefix from the `SYNC_KEY_PREFIX` environment variable with a default value of `data/`.
4. THE Sync_Service SHALL read the sync interval from the `SYNC_INTERVAL_MS` environment variable with a default value of `60000` milliseconds. IF the value is not a valid integer or is outside the range of 5000–3600000, THEN THE Sync_Service SHALL fall back to the default value of `60000` and log a warning.
5. IF the `SYNC_BUCKET_NAME` environment variable is not set or is an empty string, THEN THE Sync_Service SHALL disable remote synchronization and log a warning that the application is running in local-only mode.
6. THE Sync_Service SHALL read all environment variables once at module initialization and SHALL NOT re-read them while the application is running.

### Requirement 5: Maintain Backward Compatibility

**User Story:** As a developer, I want the existing PersistenceService interface to remain unchanged, so that no other parts of the application need modification.

#### Acceptance Criteria

1. THE Persistence_Service SHALL continue to expose the same `readData(): Promise<StoredData>` and `writeData(data: StoredData): Promise<void>` public methods with unchanged signatures, return types, and error behavior (throwing InternalServerErrorException on storage failure).
2. THE Sync_Service SHALL be a separate injectable service that is invoked by the Persistence_Service after successful write operations, without adding parameters to `readData()` or `writeData()` and without requiring changes to existing consumers' imports or injection tokens.
3. IF remote synchronization is disabled (no bucket configured), THEN THE Persistence_Service SHALL complete `readData()` and `writeData()` calls with no more than 10ms of additional latency compared to the baseline implementation and SHALL not perform any network operations or write to any external resources.
4. IF the Sync_Service encounters an error during remote synchronization, THEN THE Persistence_Service SHALL still resolve `writeData()` successfully, ensuring local data is persisted and the error does not propagate to the calling service.

### Requirement 6: Data Integrity During Sync

**User Story:** As an application operator, I want guarantees that synchronization does not corrupt data, so that I can trust the backup is always valid.

#### Acceptance Criteria

1. WHEN uploading to the Remote_Store, THE Sync_Service SHALL compute a SHA-256 hash of the file content and include it in the upload metadata for integrity verification.
2. WHEN downloading from the Remote_Store, THE Sync_Service SHALL compute the SHA-256 hash of the downloaded content, compare it against the hash stored in the Remote_Store metadata, and discard the downloaded content if the hashes do not match.
3. IF a downloaded file fails integrity verification and a local file exists at the target path, THEN THE Sync_Service SHALL log an error, discard the corrupted download, and continue serving the existing local file.
4. IF a downloaded file fails integrity verification and no local file exists at the target path, THEN THE Sync_Service SHALL log an error, discard the corrupted download, and fall back to an empty dataset.
5. THE Sync_Service SHALL write downloaded data to a temporary file first and atomically rename it to the target path only after integrity verification succeeds, to prevent partial writes.
