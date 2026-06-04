import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { IdeasController } from '../src/ideas/ideas.controller';
import { IdeasService } from '../src/ideas/ideas.service';
import {
  DATA_DIR_TOKEN,
  PersistenceService,
} from '../src/ideas/persistence/persistence.service';

/**
 * Integration tests for the Ideas API.
 * Tests the full API workflow through HTTP using a temporary data directory.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2
 */

// Helper to make HTTP requests to the NestJS app
function request(
  app: INestApplication,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.getHttpServer();
    const address = server.address();
    const port = typeof address === 'object' ? address!.port : address;

    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode!, body: parsed });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function createTempDir(): string {
  const tmpDir = path.join(
    __dirname,
    '.tmp-test-data-' + Date.now() + '-' + Math.random().toString(36).slice(2),
  );
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function cleanupTempDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

async function createTestApp(dataDir: string): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    controllers: [IdeasController],
    providers: [
      IdeasService,
      PersistenceService,
      { provide: DATA_DIR_TOKEN, useValue: dataDir },
    ],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  await app.listen(0); // Random available port
  return app;
}

describe('Ideas API Integration Tests', () => {
  let app: INestApplication;
  let tempDataDir: string;

  beforeEach(async () => {
    tempDataDir = createTempDir();
    app = await createTestApp(tempDataDir);
  });

  afterEach(async () => {
    await app.close();
    cleanupTempDir(tempDataDir);
  });

  describe('Full CRUD cycle', () => {
    it('should create → read → update status → delete an idea', async () => {
      // CREATE: POST /api/ideas/А
      const createRes = await request(app, 'POST', '/api/ideas/%D0%90', {
        text: 'Аквапарк',
      });
      expect(createRes.status).toBe(201);
      const created = createRes.body as {
        id: string;
        letter: string;
        text: string;
        done: boolean;
        createdAt: string;
      };
      expect(created.id).toBeDefined();
      expect(created.letter).toBe('А');
      expect(created.text).toBe('Аквапарк');
      expect(created.done).toBe(false);
      expect(created.createdAt).toBeDefined();
      expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);

      // READ: GET /api/ideas
      const readRes = await request(app, 'GET', '/api/ideas');
      expect(readRes.status).toBe(200);
      const letters = readRes.body as Array<{
        letter: string;
        ideas: Array<{ id: string; text: string; done: boolean }>;
      }>;
      const letterA = letters.find((l) => l.letter === 'А');
      expect(letterA).toBeDefined();
      expect(letterA!.ideas.length).toBe(1);
      expect(letterA!.ideas[0].id).toBe(created.id);
      expect(letterA!.ideas[0].text).toBe('Аквапарк');
      expect(letterA!.ideas[0].done).toBe(false);

      // UPDATE STATUS: PATCH /api/ideas/:id/status
      const updateRes = await request(
        app,
        'PATCH',
        `/api/ideas/${created.id}/status`,
        { done: true },
      );
      expect(updateRes.status).toBe(200);
      const updated = updateRes.body as { id: string; done: boolean };
      expect(updated.id).toBe(created.id);
      expect(updated.done).toBe(true);

      // Verify via GET
      const verifyRes = await request(app, 'GET', '/api/ideas');
      const verifyLetters = verifyRes.body as Array<{
        letter: string;
        ideas: Array<{ id: string; done: boolean }>;
      }>;
      const verifyA = verifyLetters.find((l) => l.letter === 'А');
      expect(verifyA!.ideas[0].done).toBe(true);

      // DELETE: DELETE /api/ideas/:id
      const deleteRes = await request(
        app,
        'DELETE',
        `/api/ideas/${created.id}`,
      );
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body).toEqual({ deleted: true });

      // Verify deletion via GET
      const afterDeleteRes = await request(app, 'GET', '/api/ideas');
      const afterLetters = afterDeleteRes.body as Array<{
        letter: string;
        ideas: Array<{ id: string }>;
      }>;
      const afterA = afterLetters.find((l) => l.letter === 'А');
      expect(afterA!.ideas.length).toBe(0);
    });
  });

  describe('All 33 letters returned on GET even with no ideas', () => {
    it('should return exactly 33 letters with empty idea arrays', async () => {
      const res = await request(app, 'GET', '/api/ideas');
      expect(res.status).toBe(200);

      const letters = res.body as Array<{
        letter: string;
        ideas: unknown[];
      }>;
      expect(letters.length).toBe(33);

      const expectedLetters = [
        'А',
        'Б',
        'В',
        'Г',
        'Ґ',
        'Д',
        'Е',
        'Є',
        'Ж',
        'З',
        'И',
        'І',
        'Ї',
        'Й',
        'К',
        'Л',
        'М',
        'Н',
        'О',
        'П',
        'Р',
        'С',
        'Т',
        'У',
        'Ф',
        'Х',
        'Ц',
        'Ч',
        'Ш',
        'Щ',
        'Ь',
        'Ю',
        'Я',
      ];

      const returnedLetters = letters.map((l) => l.letter);
      expect(returnedLetters).toEqual(expectedLetters);

      // All ideas arrays should be empty
      for (const entry of letters) {
        expect(entry.ideas).toEqual([]);
      }
    });
  });

  describe('Error responses for invalid inputs', () => {
    it('should return 400 for invalid letter on create', async () => {
      const res = await request(app, 'POST', '/api/ideas/X', {
        text: 'Some idea',
      });
      expect(res.status).toBe(400);
      const body = res.body as { statusCode: number; message: string };
      expect(body.statusCode).toBe(400);
      expect(body.message).toContain('Invalid letter');
    });

    it('should return 400 for empty text on create', async () => {
      const res = await request(app, 'POST', '/api/ideas/%D0%90', {
        text: '',
      });
      expect(res.status).toBe(400);
      const body = res.body as { statusCode: number; message: unknown };
      expect(body.statusCode).toBe(400);
    });

    it('should return 400 for whitespace-only text on create', async () => {
      const res = await request(app, 'POST', '/api/ideas/%D0%90', {
        text: '   ',
      });
      expect(res.status).toBe(400);
      const body = res.body as { statusCode: number; message: string };
      expect(body.statusCode).toBe(400);
    });

    it('should return 400 for text exceeding 200 characters', async () => {
      const longText = 'a'.repeat(201);
      const res = await request(app, 'POST', '/api/ideas/%D0%90', {
        text: longText,
      });
      expect(res.status).toBe(400);
      const body = res.body as { statusCode: number; message: string };
      expect(body.statusCode).toBe(400);
    });

    it('should return 404 for deleting non-existent idea', async () => {
      const res = await request(app, 'DELETE', '/api/ideas/non-existent-uuid');
      expect(res.status).toBe(404);
      const body = res.body as { statusCode: number; message: string };
      expect(body.statusCode).toBe(404);
      expect(body.message).toContain('Idea not found');
    });

    it('should return 404 for updating status of non-existent idea', async () => {
      const res = await request(
        app,
        'PATCH',
        '/api/ideas/non-existent-uuid/status',
        { done: true },
      );
      expect(res.status).toBe(404);
      const body = res.body as { statusCode: number; message: string };
      expect(body.statusCode).toBe(404);
      expect(body.message).toContain('Idea not found');
    });

    it('should return 400 for missing done field on status update', async () => {
      // First create an idea
      const createRes = await request(app, 'POST', '/api/ideas/%D0%90', {
        text: 'Test idea',
      });
      const created = createRes.body as { id: string };

      // Try to update with invalid body
      const res = await request(
        app,
        'PATCH',
        `/api/ideas/${created.id}/status`,
        { done: 'not-a-boolean' },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('Persistence durability', () => {
    it('should persist data across service re-instantiation', async () => {
      // Create some ideas
      const createRes1 = await request(app, 'POST', '/api/ideas/%D0%90', {
        text: 'Аквапарк',
      });
      expect(createRes1.status).toBe(201);
      const idea1 = createRes1.body as {
        id: string;
        letter: string;
        text: string;
        done: boolean;
        createdAt: string;
      };

      const createRes2 = await request(app, 'POST', '/api/ideas/%D0%91', {
        text: 'Боулінг',
      });
      expect(createRes2.status).toBe(201);
      const idea2 = createRes2.body as {
        id: string;
        letter: string;
        text: string;
        done: boolean;
        createdAt: string;
      };

      // Mark one as done
      await request(app, 'PATCH', `/api/ideas/${idea1.id}/status`, {
        done: true,
      });

      // Close the app (simulating server restart)
      await app.close();

      // Re-create the app with the SAME data directory
      app = await createTestApp(tempDataDir);

      // Verify all data is preserved
      const res = await request(app, 'GET', '/api/ideas');
      expect(res.status).toBe(200);

      const letters = res.body as Array<{
        letter: string;
        ideas: Array<{
          id: string;
          letter: string;
          text: string;
          done: boolean;
          createdAt: string;
        }>;
      }>;

      // Find idea1 (letter А)
      const letterA = letters.find((l) => l.letter === 'А');
      expect(letterA).toBeDefined();
      expect(letterA!.ideas.length).toBe(1);
      expect(letterA!.ideas[0].id).toBe(idea1.id);
      expect(letterA!.ideas[0].text).toBe('Аквапарк');
      expect(letterA!.ideas[0].done).toBe(true); // was updated
      expect(letterA!.ideas[0].createdAt).toBe(idea1.createdAt);

      // Find idea2 (letter Б)
      const letterB = letters.find((l) => l.letter === 'Б');
      expect(letterB).toBeDefined();
      expect(letterB!.ideas.length).toBe(1);
      expect(letterB!.ideas[0].id).toBe(idea2.id);
      expect(letterB!.ideas[0].text).toBe('Боулінг');
      expect(letterB!.ideas[0].done).toBe(false); // not changed
      expect(letterB!.ideas[0].createdAt).toBe(idea2.createdAt);
    });
  });
});
