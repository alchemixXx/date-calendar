import { loadSyncConfig } from './sync-config';

describe('loadSyncConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Clear all SYNC_ env vars
    delete process.env.SYNC_BUCKET_NAME;
    delete process.env.SYNC_REGION;
    delete process.env.SYNC_KEY_PREFIX;
    delete process.env.SYNC_INTERVAL_MS;
    delete process.env.SYNC_ENDPOINT;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('default state with no env vars', () => {
    it('should return enabled=false, region=us-east-1, keyPrefix=data/, intervalMs=60000', () => {
      const config = loadSyncConfig();

      expect(config.enabled).toBe(false);
      expect(config.region).toBe('us-east-1');
      expect(config.keyPrefix).toBe('data/');
      expect(config.intervalMs).toBe(60000);
      expect(config.bucketName).toBe('');
      expect(config.endpoint).toBeUndefined();
    });
  });

  describe('SYNC_BUCKET_NAME', () => {
    it('should set enabled=true when SYNC_BUCKET_NAME is set', () => {
      process.env.SYNC_BUCKET_NAME = 'my-bucket';

      const config = loadSyncConfig();

      expect(config.enabled).toBe(true);
      expect(config.bucketName).toBe('my-bucket');
    });

    it('should set enabled=false when SYNC_BUCKET_NAME is empty string', () => {
      process.env.SYNC_BUCKET_NAME = '';

      const config = loadSyncConfig();

      expect(config.enabled).toBe(false);
    });

    it('should set enabled=false when SYNC_BUCKET_NAME is whitespace only', () => {
      process.env.SYNC_BUCKET_NAME = '   ';

      const config = loadSyncConfig();

      expect(config.enabled).toBe(false);
    });
  });

  describe('SYNC_INTERVAL_MS', () => {
    it('should use provided value when valid (e.g. 10000)', () => {
      process.env.SYNC_BUCKET_NAME = 'bucket';
      process.env.SYNC_INTERVAL_MS = '10000';

      const config = loadSyncConfig();

      expect(config.intervalMs).toBe(10000);
    });

    it('should fall back to 60000 with warning when value is too low (e.g. 1000)', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env.SYNC_BUCKET_NAME = 'bucket';
      process.env.SYNC_INTERVAL_MS = '1000';

      const config = loadSyncConfig();

      expect(config.intervalMs).toBe(60000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('outside the allowed range'),
      );
    });

    it('should fall back to 60000 with warning when value is too high (e.g. 5000000)', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env.SYNC_BUCKET_NAME = 'bucket';
      process.env.SYNC_INTERVAL_MS = '5000000';

      const config = loadSyncConfig();

      expect(config.intervalMs).toBe(60000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('outside the allowed range'),
      );
    });

    it('should fall back to 60000 with warning when value is non-numeric (e.g. abc)', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      process.env.SYNC_BUCKET_NAME = 'bucket';
      process.env.SYNC_INTERVAL_MS = 'abc';

      const config = loadSyncConfig();

      expect(config.intervalMs).toBe(60000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not a valid integer'),
      );
    });

    it('should accept boundary value of 5000 (minimum)', () => {
      process.env.SYNC_BUCKET_NAME = 'bucket';
      process.env.SYNC_INTERVAL_MS = '5000';

      const config = loadSyncConfig();

      expect(config.intervalMs).toBe(5000);
    });

    it('should accept boundary value of 3600000 (maximum)', () => {
      process.env.SYNC_BUCKET_NAME = 'bucket';
      process.env.SYNC_INTERVAL_MS = '3600000';

      const config = loadSyncConfig();

      expect(config.intervalMs).toBe(3600000);
    });
  });

  describe('SYNC_KEY_PREFIX', () => {
    it('should normalize keyPrefix without trailing slash by appending one', () => {
      process.env.SYNC_BUCKET_NAME = 'bucket';
      process.env.SYNC_KEY_PREFIX = 'custom/prefix';

      const config = loadSyncConfig();

      expect(config.keyPrefix).toBe('custom/prefix/');
    });

    it('should keep keyPrefix as-is when it already has a trailing slash', () => {
      process.env.SYNC_BUCKET_NAME = 'bucket';
      process.env.SYNC_KEY_PREFIX = 'custom/prefix/';

      const config = loadSyncConfig();

      expect(config.keyPrefix).toBe('custom/prefix/');
    });
  });

  describe('SYNC_ENDPOINT', () => {
    it('should include endpoint in config when SYNC_ENDPOINT is set', () => {
      process.env.SYNC_BUCKET_NAME = 'bucket';
      process.env.SYNC_ENDPOINT = 'http://localhost:9000';

      const config = loadSyncConfig();

      expect(config.endpoint).toBe('http://localhost:9000');
    });

    it('should have endpoint undefined when SYNC_ENDPOINT is not set', () => {
      process.env.SYNC_BUCKET_NAME = 'bucket';

      const config = loadSyncConfig();

      expect(config.endpoint).toBeUndefined();
    });
  });

  describe('SYNC_REGION', () => {
    it('should use provided region value', () => {
      process.env.SYNC_BUCKET_NAME = 'bucket';
      process.env.SYNC_REGION = 'eu-west-1';

      const config = loadSyncConfig();

      expect(config.region).toBe('eu-west-1');
    });

    it('should default to us-east-1 when SYNC_REGION is not set', () => {
      process.env.SYNC_BUCKET_NAME = 'bucket';

      const config = loadSyncConfig();

      expect(config.region).toBe('us-east-1');
    });
  });
});
