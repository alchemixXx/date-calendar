export const SYNC_CONFIG_TOKEN = 'SYNC_CONFIG';

export interface SyncConfig {
  enabled: boolean;
  bucketName: string;
  region: string;
  keyPrefix: string;
  intervalMs: number;
  endpoint?: string;
  startupTimeoutMs: number;
  shutdownTimeoutMs: number;
  uploadDebounceMs: number;
  maxRetries: number;
  initialBackoffMs: number;
}

const DEFAULT_INTERVAL_MS = 60000;
const MIN_INTERVAL_MS = 5000;
const MAX_INTERVAL_MS = 3600000;

export function loadSyncConfig(): SyncConfig {
  const bucketName = process.env.SYNC_BUCKET_NAME ?? '';
  const enabled = bucketName.trim().length > 0;

  if (!enabled) {
    console.warn(
      '[SyncConfig] SYNC_BUCKET_NAME is not set or empty. Running in local-only mode — remote synchronization is disabled.',
    );
  }

  const region = process.env.SYNC_REGION || 'us-east-1';

  let keyPrefix = process.env.SYNC_KEY_PREFIX ?? 'data/';
  if (!keyPrefix.endsWith('/')) {
    keyPrefix += '/';
  }

  let intervalMs = DEFAULT_INTERVAL_MS;
  const rawInterval = process.env.SYNC_INTERVAL_MS;
  if (rawInterval !== undefined && rawInterval !== '') {
    const parsed = parseInt(rawInterval, 10);
    if (isNaN(parsed) || !Number.isFinite(parsed)) {
      console.warn(
        `[SyncConfig] SYNC_INTERVAL_MS value "${rawInterval}" is not a valid integer. Falling back to default ${DEFAULT_INTERVAL_MS}ms.`,
      );
    } else if (parsed < MIN_INTERVAL_MS || parsed > MAX_INTERVAL_MS) {
      console.warn(
        `[SyncConfig] SYNC_INTERVAL_MS value ${parsed} is outside the allowed range [${MIN_INTERVAL_MS}, ${MAX_INTERVAL_MS}]. Falling back to default ${DEFAULT_INTERVAL_MS}ms.`,
      );
      intervalMs = DEFAULT_INTERVAL_MS;
    } else {
      intervalMs = parsed;
    }
  }

  const endpoint = process.env.SYNC_ENDPOINT || undefined;

  return {
    enabled,
    bucketName,
    region,
    keyPrefix,
    intervalMs,
    endpoint,
    startupTimeoutMs: 30000,
    shutdownTimeoutMs: 10000,
    uploadDebounceMs: 250,
    maxRetries: 3,
    initialBackoffMs: 1000,
  };
}
