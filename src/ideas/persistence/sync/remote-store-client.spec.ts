import { RemoteStoreClient } from './remote-store-client';
import { SyncConfig, SYNC_CONFIG_TOKEN } from './sync-config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
} from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
  };
});

describe('RemoteStoreClient', () => {
  let client: RemoteStoreClient;
  let mockSend: jest.Mock;
  const config: SyncConfig = {
    enabled: true,
    bucketName: 'test-bucket',
    region: 'us-west-2',
    keyPrefix: 'data/',
    intervalMs: 60000,
    endpoint: 'http://localhost:9000',
    startupTimeoutMs: 30000,
    shutdownTimeoutMs: 10000,
    uploadDebounceMs: 250,
    maxRetries: 3,
    initialBackoffMs: 1000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (S3Client as jest.Mock).mockClear();
    mockSend = jest.fn().mockResolvedValue({});
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
    client = new RemoteStoreClient(config);
  });

  describe('lazy S3Client instantiation', () => {
    it('should not create S3Client on construction', () => {
      expect(S3Client).not.toHaveBeenCalled();
    });

    it('should create S3Client on first call and reuse it on subsequent calls', async () => {
      const body = Buffer.from('{"ideas":[]}');
      const sha256 = 'abc123';

      await client.putObject(body, sha256);
      expect(S3Client).toHaveBeenCalledTimes(1);
      expect(S3Client).toHaveBeenCalledWith({
        region: 'us-west-2',
        endpoint: 'http://localhost:9000',
      });

      await client.putObject(body, sha256);
      expect(S3Client).toHaveBeenCalledTimes(1);
    });
  });

  describe('putObject', () => {
    it('should construct PutObjectCommand with correct Bucket, Key, Body, ContentType, and Metadata.sha256', async () => {
      const body = Buffer.from('{"ideas":[{"id":"1"}]}');
      const sha256 = 'e3b0c44298fc1c149afbf4c8996fb924';

      await client.putObject(body, sha256);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'data/ideas.json',
        Body: body,
        ContentType: 'application/json',
        Metadata: { sha256: 'e3b0c44298fc1c149afbf4c8996fb924' },
      });
    });

    it('should forward abortSignal to send()', async () => {
      const body = Buffer.from('{}');
      const sha256 = 'abc';
      const controller = new AbortController();

      await client.putObject(body, sha256, controller.signal);

      expect(mockSend).toHaveBeenCalledWith(
        expect.any(PutObjectCommand),
        expect.objectContaining({ abortSignal: controller.signal }),
      );
    });

    it('should not include abortSignal when signal is not provided', async () => {
      const body = Buffer.from('{}');
      const sha256 = 'abc';

      await client.putObject(body, sha256);

      expect(mockSend).toHaveBeenCalledWith(expect.any(PutObjectCommand), {});
    });
  });

  describe('getObject', () => {
    it('should return RemoteObject with body, sha256, and lastModified when object exists', async () => {
      const lastModified = new Date('2024-01-15T12:00:00Z');
      const bodyBytes = new Uint8Array(Buffer.from('{"ideas":[]}'));
      mockSend.mockResolvedValue({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(bodyBytes),
        },
        Metadata: { sha256: 'deadbeef' },
        LastModified: lastModified,
      });

      const result = await client.getObject();

      expect(result).not.toBeNull();
      expect(result!.body).toEqual(Buffer.from('{"ideas":[]}'));
      expect(result!.sha256).toBe('deadbeef');
      expect(result!.lastModified).toEqual(lastModified);
    });

    it('should return null when NoSuchKey is thrown', async () => {
      const error = new NoSuchKey({ message: 'Not found', $metadata: {} });
      mockSend.mockRejectedValue(error);

      const result = await client.getObject();

      expect(result).toBeNull();
    });

    it('should return null when error has name NoSuchKey', async () => {
      const error = new Error('Key not found');
      (error as any).name = 'NoSuchKey';
      mockSend.mockRejectedValue(error);

      const result = await client.getObject();

      expect(result).toBeNull();
    });

    it('should forward abortSignal to send()', async () => {
      mockSend.mockResolvedValue({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array(0)),
        },
        Metadata: {},
        LastModified: undefined,
      });
      const controller = new AbortController();

      await client.getObject(controller.signal);

      expect(mockSend).toHaveBeenCalledWith(
        expect.any(GetObjectCommand),
        expect.objectContaining({ abortSignal: controller.signal }),
      );
    });

    it('should rethrow non-NoSuchKey errors', async () => {
      const error = new Error('Network timeout');
      mockSend.mockRejectedValue(error);

      await expect(client.getObject()).rejects.toThrow('Network timeout');
    });
  });

  describe('headObject', () => {
    it('should return { lastModified, sha256 } when object exists', async () => {
      const lastModified = new Date('2024-03-10T08:30:00Z');
      mockSend.mockResolvedValue({
        LastModified: lastModified,
        Metadata: { sha256: 'cafebabe' },
      });

      const result = await client.headObject();

      expect(result).toEqual({
        lastModified,
        sha256: 'cafebabe',
      });
    });

    it('should return null when NotFound is thrown', async () => {
      const error = new NotFound({ message: 'Not found', $metadata: {} });
      mockSend.mockRejectedValue(error);

      const result = await client.headObject();

      expect(result).toBeNull();
    });

    it('should return null when NoSuchKey is thrown', async () => {
      const error = new NoSuchKey({ message: 'No such key', $metadata: {} });
      mockSend.mockRejectedValue(error);

      const result = await client.headObject();

      expect(result).toBeNull();
    });

    it('should return null on 404 httpStatusCode', async () => {
      const error = new Error('Not Found');
      (error as any).$metadata = { httpStatusCode: 404 };
      mockSend.mockRejectedValue(error);

      const result = await client.headObject();

      expect(result).toBeNull();
    });

    it('should forward abortSignal to send()', async () => {
      mockSend.mockResolvedValue({
        LastModified: new Date(),
        Metadata: {},
      });
      const controller = new AbortController();

      await client.headObject(controller.signal);

      expect(mockSend).toHaveBeenCalledWith(
        expect.any(HeadObjectCommand),
        expect.objectContaining({ abortSignal: controller.signal }),
      );
    });

    it('should rethrow non-404/NotFound/NoSuchKey errors', async () => {
      const error = new Error('Access denied');
      mockSend.mockRejectedValue(error);

      await expect(client.headObject()).rejects.toThrow('Access denied');
    });
  });
});
