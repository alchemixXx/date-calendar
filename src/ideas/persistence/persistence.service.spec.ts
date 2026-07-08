import { InternalServerErrorException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PersistenceService } from './persistence.service';
import { StoredData } from '../interfaces/idea.interface';

describe('PersistenceService', () => {
  let service: PersistenceService;
  let dataDir: string;
  let filePath: string;

  beforeEach(async () => {
    // Use a unique temp directory to avoid conflicts with parallel test suites
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'persistence-test-'));
    filePath = path.join(dataDir, 'ideas.json');
    service = new PersistenceService(dataDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(dataDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  describe('readData', () => {
    it('should return empty ideas array when file does not exist', async () => {
      // Ensure file doesn't exist
      try {
        await fs.unlink(filePath);
      } catch {
        // ignore
      }

      const result = await service.readData();
      expect(result).toEqual({ ideas: [] });
    });

    it('should read and parse existing data file', async () => {
      const testData: StoredData = {
        ideas: [
          {
            id: '123',
            letter: 'А',
            text: 'Test idea',
            done: false,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(testData), 'utf-8');

      const result = await service.readData();
      expect(result).toEqual(testData);
    });

    it('should throw InternalServerErrorException on parse error', async () => {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(filePath, 'invalid json content', 'utf-8');

      await expect(service.readData()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('writeData', () => {
    it('should write data to file', async () => {
      const testData: StoredData = {
        ideas: [
          {
            id: '456',
            letter: 'Б',
            text: 'Another idea',
            done: true,
            createdAt: '2024-02-01T00:00:00.000Z',
          },
        ],
      };

      await service.writeData(testData);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(JSON.parse(content)).toEqual(testData);
    });

    it('should create data directory if it does not exist', async () => {
      // Remove directory if it exists
      try {
        await fs.rm(dataDir, { recursive: true });
      } catch {
        // ignore
      }

      const testData: StoredData = { ideas: [] };
      await service.writeData(testData);

      const stat = await fs.stat(dataDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('round-trip', () => {
    it('should preserve data through write and read cycle', async () => {
      const testData: StoredData = {
        ideas: [
          {
            id: 'abc',
            letter: 'В',
            text: 'Round trip test',
            done: false,
            createdAt: '2024-03-01T12:00:00.000Z',
          },
          {
            id: 'def',
            letter: 'Г',
            text: 'Second idea',
            done: true,
            createdAt: '2024-03-02T12:00:00.000Z',
          },
        ],
      };

      await service.writeData(testData);
      const result = await service.readData();

      expect(result).toEqual(testData);
    });
  });

  describe('atomic write', () => {
    it('should not leave .tmp files after writeData()', async () => {
      const testData: StoredData = {
        ideas: [
          {
            id: 'tmp-check',
            letter: 'Д',
            text: 'Temp file check',
            done: false,
            createdAt: '2024-04-01T00:00:00.000Z',
          },
        ],
      };

      await service.writeData(testData);

      const files = await fs.readdir(dataDir);
      const tmpFiles = files.filter((f) => f.includes('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });
  });

  describe('SyncService integration', () => {
    it('should call notifyWrite() on SyncService after successful write', async () => {
      const mockSyncService = { notifyWrite: jest.fn() } as any;
      const serviceWithSync = new PersistenceService(dataDir, mockSyncService);

      const testData: StoredData = { ideas: [] };
      await serviceWithSync.writeData(testData);

      expect(mockSyncService.notifyWrite).toHaveBeenCalledTimes(1);
    });

    it('should not propagate errors from SyncService.notifyWrite()', async () => {
      const mockSyncService = {
        notifyWrite: jest.fn(() => {
          throw new Error('Sync failure');
        }),
      } as any;
      const serviceWithSync = new PersistenceService(dataDir, mockSyncService);

      const testData: StoredData = { ideas: [] };

      // writeData should resolve successfully even if notifyWrite throws
      await expect(
        serviceWithSync.writeData(testData),
      ).resolves.toBeUndefined();
    });

    it('should work without SyncService (backward compatibility)', async () => {
      // The existing service is constructed without SyncService
      const testData: StoredData = { ideas: [] };
      await expect(service.writeData(testData)).resolves.toBeUndefined();

      const result = await service.readData();
      expect(result).toEqual(testData);
    });
  });
});
