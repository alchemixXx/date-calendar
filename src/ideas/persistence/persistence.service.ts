import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StoredData } from '../interfaces/idea.interface';
import { SyncService } from './sync/sync.service';
import { DATA_DIR_TOKEN } from './constants';

export { DATA_DIR_TOKEN };

@Injectable()
export class PersistenceService {
  private readonly dataDir: string;
  private readonly filePath: string;

  constructor(
    @Optional() @Inject(DATA_DIR_TOKEN) dataDir?: string,
    @Optional() private readonly syncService?: SyncService,
  ) {
    this.dataDir = dataDir ?? path.join(process.cwd(), 'data');
    this.filePath = path.join(this.dataDir, 'ideas.json');
  }

  async readData(): Promise<StoredData> {
    try {
      await this.ensureDataDirectory();
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as StoredData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ideas: [] };
      }
      throw new InternalServerErrorException(
        'Storage failure: unable to read/write data',
      );
    }
  }

  async writeData(data: StoredData): Promise<void> {
    try {
      await this.ensureDataDirectory();
      const tmpPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tmpPath, this.filePath);
    } catch (error) {
      throw new InternalServerErrorException(
        'Storage failure: unable to read/write data',
      );
    }
    try {
      this.syncService?.notifyWrite();
    } catch {
      // Best-effort: sync errors never propagate into writeData() callers.
    }
  }

  private async ensureDataDirectory(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }
}
