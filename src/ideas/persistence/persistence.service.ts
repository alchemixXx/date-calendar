import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { StoredData } from '../interfaces/idea.interface';

export const DATA_DIR_TOKEN = 'DATA_DIR';

@Injectable()
export class PersistenceService {
  private readonly dataDir: string;
  private readonly filePath: string;

  constructor(@Optional() @Inject(DATA_DIR_TOKEN) dataDir?: string) {
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
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      throw new InternalServerErrorException(
        'Storage failure: unable to read/write data',
      );
    }
  }

  private async ensureDataDirectory(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
  }
}
