import * as fc from 'fast-check';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PersistenceService } from '../../src/ideas/persistence/persistence.service';
import { Idea, StoredData } from '../../src/ideas/interfaces/idea.interface';
import { UKRAINIAN_ALPHABET } from '../../src/ideas/constants/ukrainian-alphabet.constant';

/**
 * Property 7: Persistence round-trip
 *
 * For any set of ideas created through the API, writing to the data store
 * and then reading back (simulating a server restart) SHALL return the same
 * set of ideas with identical id, letter, text, done, and createdAt values.
 *
 * **Validates: Requirements 7.1, 7.2**
 */
describe('Property 7: Persistence round-trip', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbt-persistence-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(dataDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  // Generator for a valid Idea with realistic fields
  const ideaArbitrary: fc.Arbitrary<Idea> = fc.record({
    id: fc.uuid(),
    letter: fc.constantFrom(...UKRAINIAN_ALPHABET),
    text: fc
      .string({ minLength: 1, maxLength: 200 })
      .filter((s) => s.trim().length > 0),
    done: fc.boolean(),
    createdAt: fc
      .date({
        min: new Date('2020-01-01T00:00:00.000Z'),
        max: new Date('2030-12-31T23:59:59.999Z'),
      })
      .map((d) => d.toISOString()),
  });

  const storedDataArbitrary: fc.Arbitrary<StoredData> = fc
    .array(ideaArbitrary, { minLength: 0, maxLength: 50 })
    .map((ideas) => ({ ideas }));

  it('writing and reading back should return identical data', async () => {
    await fc.assert(
      fc.asyncProperty(storedDataArbitrary, async (data: StoredData) => {
        const writeService = new PersistenceService(dataDir);
        await writeService.writeData(data);

        // Simulate server restart by creating a new instance
        const readService = new PersistenceService(dataDir);
        const result = await readService.readData();

        // Verify all ideas are identical
        expect(result.ideas.length).toBe(data.ideas.length);
        expect(result).toEqual(data);
      }),
      { numRuns: 100 },
    );
  });
});
