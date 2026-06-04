import * as fc from 'fast-check';
import { BadRequestException } from '@nestjs/common';
import { IdeasService } from '../../src/ideas/ideas.service';
import { StoredData } from '../../src/ideas/interfaces/idea.interface';
import { PersistenceService } from '../../src/ideas/persistence/persistence.service';
import { UKRAINIAN_ALPHABET } from '../../src/ideas/constants/ukrainian-alphabet.constant';

/**
 * Property 2: Idea creation round-trip preserves data
 *
 * For any valid Ukrainian letter and any valid idea text (1-200 non-whitespace-only
 * characters), creating an idea SHALL return an object containing a unique id, the same
 * letter, the same text (trimmed), done set to false, and a valid ISO 8601 createdAt
 * timestamp; and subsequently retrieving ideas for that letter SHALL include the created
 * idea with all fields preserved.
 *
 * **Validates: Requirements 2.3, 6.2, 7.3**
 */
describe('Property 2: Idea creation round-trip preserves data', () => {
  let service: IdeasService;
  let store: StoredData;

  beforeEach(() => {
    store = { ideas: [] };

    const mockPersistenceService = {
      readData: jest.fn().mockImplementation(() => Promise.resolve(store)),
      writeData: jest.fn().mockImplementation((data: StoredData) => {
        store = data;
        return Promise.resolve();
      }),
    };

    service = new IdeasService(
      mockPersistenceService as unknown as PersistenceService,
    );
  });

  // Generator for a valid Ukrainian alphabet letter
  const validLetterArb = fc.constantFrom(...UKRAINIAN_ALPHABET);

  // Generator for valid idea text: 1-200 chars, not whitespace-only
  const validTextArb = fc
    .string({ minLength: 1, maxLength: 200 })
    .filter((s) => s.trim().length > 0 && s.trim().length <= 200);

  it('creating an idea and retrieving it preserves all fields', async () => {
    await fc.assert(
      fc.asyncProperty(validLetterArb, validTextArb, async (letter, text) => {
        // Reset store for each iteration
        store = { ideas: [] };

        // Create the idea
        const created = await service.createIdea(letter, text);

        // Verify created idea has correct fields
        expect(created.id).toBeDefined();
        expect(typeof created.id).toBe('string');
        expect(created.id.length).toBeGreaterThan(0);
        expect(created.letter).toBe(letter);
        expect(created.text).toBe(text.trim());
        expect(created.done).toBe(false);
        expect(created.createdAt).toBeDefined();
        // Verify createdAt is a valid ISO 8601 timestamp
        expect(new Date(created.createdAt).toISOString()).toBe(
          created.createdAt,
        );

        // Retrieve all letters with ideas
        const allLetters = await service.getAllLettersWithIdeas();

        // Find the letter entry
        const letterEntry = allLetters.find((l) => l.letter === letter);
        expect(letterEntry).toBeDefined();

        // Find the created idea in the letter's ideas
        const found = letterEntry!.ideas.find((i) => i.id === created.id);
        expect(found).toBeDefined();

        // Verify all fields are preserved
        expect(found!.id).toBe(created.id);
        expect(found!.letter).toBe(created.letter);
        expect(found!.text).toBe(created.text);
        expect(found!.done).toBe(created.done);
        expect(found!.createdAt).toBe(created.createdAt);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 3: Invalid text is rejected
 *
 * For any string that is empty, composed entirely of whitespace characters,
 * or exceeds 200 characters in length, attempting to create an idea SHALL be
 * rejected with a validation error and the set of stored ideas SHALL remain unchanged.
 *
 * **Validates: Requirements 2.5, 2.6, 6.7**
 */
describe('Property 3: Invalid text is rejected', () => {
  let service: IdeasService;
  let store: StoredData;

  beforeEach(() => {
    store = { ideas: [] };

    const mockPersistenceService = {
      readData: jest.fn().mockImplementation(() => Promise.resolve(store)),
      writeData: jest.fn().mockImplementation((data: StoredData) => {
        store = data;
        return Promise.resolve();
      }),
    };

    service = new IdeasService(
      mockPersistenceService as unknown as PersistenceService,
    );
  });

  // Generator for a valid Ukrainian letter
  const validLetterArb = fc.constantFrom(...UKRAINIAN_ALPHABET);

  // Generator for empty strings
  const emptyStringArb = fc.constant('');

  // Generator for whitespace-only strings (spaces, tabs, newlines)
  const whitespaceOnlyArb = fc
    .array(fc.constantFrom(' ', '\t', '\n', '\r', '  ', '\t\t'), {
      minLength: 1,
      maxLength: 20,
    })
    .map((chars) => chars.join(''));

  // Generator for strings exceeding 200 characters
  const tooLongStringArb = fc
    .string({ minLength: 201, maxLength: 500 })
    .filter((s) => s.trim().length > 200);

  // Combined generator for all invalid text types
  const invalidTextArb = fc.oneof(
    emptyStringArb,
    whitespaceOnlyArb,
    tooLongStringArb,
  );

  it('should reject empty strings and leave stored ideas unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(validLetterArb, emptyStringArb, async (letter, text) => {
        const ideasBefore = [...store.ideas];

        await expect(service.createIdea(letter, text)).rejects.toThrow(
          BadRequestException,
        );

        expect(store.ideas).toEqual(ideasBefore);
      }),
      { numRuns: 100 },
    );
  });

  it('should reject whitespace-only strings and leave stored ideas unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        validLetterArb,
        whitespaceOnlyArb,
        async (letter, text) => {
          const ideasBefore = [...store.ideas];

          await expect(service.createIdea(letter, text)).rejects.toThrow(
            BadRequestException,
          );

          expect(store.ideas).toEqual(ideasBefore);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject strings exceeding 200 characters and leave stored ideas unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        validLetterArb,
        tooLongStringArb,
        async (letter, text) => {
          const ideasBefore = [...store.ideas];

          await expect(service.createIdea(letter, text)).rejects.toThrow(
            BadRequestException,
          );

          expect(store.ideas).toEqual(ideasBefore);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject all invalid text types and leave stored ideas unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(validLetterArb, invalidTextArb, async (letter, text) => {
        const ideasBefore = [...store.ideas];

        await expect(service.createIdea(letter, text)).rejects.toThrow(
          BadRequestException,
        );

        expect(store.ideas).toEqual(ideasBefore);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 4: Invalid letter is rejected
 *
 * For any string that is not one of the 33 Ukrainian alphabet letters,
 * attempting to create an idea with that letter SHALL return a 400 Bad Request
 * error and no idea SHALL be persisted.
 *
 * **Validates: Requirements 6.5**
 */
describe('Property 4: Invalid letter is rejected', () => {
  let service: IdeasService;
  let store: StoredData;

  beforeEach(() => {
    store = { ideas: [] };

    const mockPersistenceService = {
      readData: jest.fn().mockImplementation(() => Promise.resolve(store)),
      writeData: jest.fn().mockImplementation((data: StoredData) => {
        store = data;
        return Promise.resolve();
      }),
    };

    service = new IdeasService(
      mockPersistenceService as unknown as PersistenceService,
    );
  });

  // Generator for strings that are NOT one of the 33 Ukrainian alphabet letters
  const invalidLetterArbitrary: fc.Arbitrary<string> = fc
    .string({ minLength: 0, maxLength: 10 })
    .filter((s) => !UKRAINIAN_ALPHABET.includes(s));

  // Generator for valid text (1-200 chars, not whitespace-only)
  const validTextArbitrary: fc.Arbitrary<string> = fc
    .string({ minLength: 1, maxLength: 200 })
    .filter((s) => s.trim().length > 0 && s.trim().length <= 200);

  it('createIdea throws BadRequestException for any invalid letter and does not change state', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidLetterArbitrary,
        validTextArbitrary,
        async (invalidLetter: string, validText: string) => {
          // Capture state before attempting creation
          const ideasBefore = [...store.ideas];

          // Attempt creation with invalid letter — should throw BadRequestException
          await expect(
            service.createIdea(invalidLetter, validText),
          ).rejects.toThrow(BadRequestException);

          // Verify no state change — store remains unchanged
          expect(store.ideas).toEqual(ideasBefore);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 5: Delete removes idea from store
 *
 * For any idea that has been successfully created, deleting that idea by its ID
 * SHALL result in the idea no longer appearing in any subsequent retrieval of
 * ideas for its letter.
 *
 * **Validates: Requirements 4.3, 6.8**
 */
describe('Property 5: Delete removes idea from store', () => {
  let service: IdeasService;
  let store: StoredData;

  beforeEach(() => {
    store = { ideas: [] };

    const mockPersistenceService = {
      readData: jest.fn().mockImplementation(() => Promise.resolve(store)),
      writeData: jest.fn().mockImplementation((data: StoredData) => {
        store = data;
        return Promise.resolve();
      }),
    };

    service = new IdeasService(
      mockPersistenceService as unknown as PersistenceService,
    );
  });

  // Generator for a valid Ukrainian alphabet letter
  const validLetterArb = fc.constantFrom(...UKRAINIAN_ALPHABET);

  // Generator for valid idea text: 1-200 chars, not whitespace-only
  const validTextArb = fc
    .string({ minLength: 1, maxLength: 200 })
    .filter((s) => s.trim().length > 0 && s.trim().length <= 200);

  // Generator for a list of ideas to create (letter + text pairs)
  const ideasListArb = fc.array(fc.tuple(validLetterArb, validTextArb), {
    minLength: 1,
    maxLength: 20,
  });

  it('deleting an idea removes it from subsequent retrieval', async () => {
    await fc.assert(
      fc.asyncProperty(
        ideasListArb,
        fc.nat(),
        async (ideaInputs, pickIndex) => {
          // Reset store for each iteration
          store = { ideas: [] };

          // Create all ideas
          const createdIdeas = [];
          for (const [letter, text] of ideaInputs) {
            const idea = await service.createIdea(letter, text);
            createdIdeas.push(idea);
          }

          // Pick a random idea to delete using the generated index
          const targetIndex = pickIndex % createdIdeas.length;
          const ideaToDelete = createdIdeas[targetIndex];

          // Delete the chosen idea
          await service.deleteIdea(ideaToDelete.id);

          // Retrieve all letters with ideas
          const allLetters = await service.getAllLettersWithIdeas();

          // Verify the deleted idea no longer appears anywhere
          for (const letterEntry of allLetters) {
            const found = letterEntry.ideas.find(
              (i) => i.id === ideaToDelete.id,
            );
            expect(found).toBeUndefined();
          }

          // Verify all other ideas still exist
          const remainingIds = allLetters.flatMap((l) =>
            l.ideas.map((i) => i.id),
          );
          for (const idea of createdIdeas) {
            if (idea.id !== ideaToDelete.id) {
              expect(remainingIds).toContain(idea.id);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 6: Status update sets completion state
 *
 * For any existing idea and any boolean value (true or false), updating the
 * idea's status with that value SHALL result in the idea's `done` field
 * equaling the provided value in both the response and subsequent retrievals.
 *
 * **Validates: Requirements 5.2, 6.4**
 */
describe('Property 6: Status update sets completion state', () => {
  let service: IdeasService;
  let store: StoredData;

  beforeEach(() => {
    store = { ideas: [] };

    const mockPersistenceService = {
      readData: jest.fn().mockImplementation(() => Promise.resolve(store)),
      writeData: jest.fn().mockImplementation((data: StoredData) => {
        store = data;
        return Promise.resolve();
      }),
    };

    service = new IdeasService(
      mockPersistenceService as unknown as PersistenceService,
    );
  });

  // Generator for a valid Ukrainian alphabet letter
  const validLetterArb = fc.constantFrom(...UKRAINIAN_ALPHABET);

  // Generator for valid idea text: 1-200 chars, not whitespace-only
  const validTextArb = fc
    .string({ minLength: 1, maxLength: 200 })
    .filter((s) => s.trim().length > 0 && s.trim().length <= 200);

  it('updateIdeaStatus response and subsequent retrieval match the provided done value', async () => {
    await fc.assert(
      fc.asyncProperty(
        validLetterArb,
        validTextArb,
        fc.boolean(),
        async (letter: string, text: string, doneValue: boolean) => {
          // Reset store for each iteration
          store = { ideas: [] };

          // Create an idea first
          const created = await service.createIdea(letter, text);

          // Update the status with the random boolean
          const updated = await service.updateIdeaStatus(created.id, doneValue);

          // Verify the response's done field matches
          expect(updated.done).toBe(doneValue);

          // Verify subsequent retrieval matches
          const allLetters = await service.getAllLettersWithIdeas();
          const letterEntry = allLetters.find(
            (entry) => entry.letter === letter,
          );
          const retrievedIdea = letterEntry!.ideas.find(
            (idea) => idea.id === created.id,
          );
          expect(retrievedIdea).toBeDefined();
          expect(retrievedIdea!.done).toBe(doneValue);
        },
      ),
      { numRuns: 100 },
    );
  });
});
