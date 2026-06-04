import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UKRAINIAN_ALPHABET } from './constants/ukrainian-alphabet.constant';
import { IdeasService } from './ideas.service';
import { StoredData } from './interfaces/idea.interface';
import { PersistenceService } from './persistence/persistence.service';

describe('IdeasService', () => {
  let service: IdeasService;
  let store: StoredData;

  beforeEach(async () => {
    store = { ideas: [] };

    const mockPersistenceService = {
      readData: jest.fn().mockImplementation(() => Promise.resolve(store)),
      writeData: jest.fn().mockImplementation((data: StoredData) => {
        store = data;
        return Promise.resolve();
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdeasService,
        { provide: PersistenceService, useValue: mockPersistenceService },
      ],
    }).compile();

    service = module.get<IdeasService>(IdeasService);
  });

  describe('getAllLettersWithIdeas', () => {
    it('should return exactly 33 letters when store is empty', async () => {
      const result = await service.getAllLettersWithIdeas();
      expect(result).toHaveLength(33);
      expect(result.map((r) => r.letter)).toEqual(UKRAINIAN_ALPHABET);
      result.forEach((entry) => {
        expect(entry.ideas).toEqual([]);
      });
    });

    it('should group ideas by letter and sort by createdAt ascending', async () => {
      store = {
        ideas: [
          {
            id: '1',
            letter: 'А',
            text: 'Second',
            done: false,
            createdAt: '2024-01-02T00:00:00.000Z',
          },
          {
            id: '2',
            letter: 'А',
            text: 'First',
            done: false,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: '3',
            letter: 'Б',
            text: 'Only',
            done: true,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const result = await service.getAllLettersWithIdeas();
      expect(result).toHaveLength(33);

      const letterA = result.find((r) => r.letter === 'А');
      expect(letterA.ideas).toHaveLength(2);
      expect(letterA.ideas[0].text).toBe('First');
      expect(letterA.ideas[1].text).toBe('Second');

      const letterB = result.find((r) => r.letter === 'Б');
      expect(letterB.ideas).toHaveLength(1);
      expect(letterB.ideas[0].text).toBe('Only');
    });
  });

  describe('createIdea', () => {
    it('should create an idea with correct fields', async () => {
      const idea = await service.createIdea('А', 'Test idea');
      expect(idea.id).toBeDefined();
      expect(idea.letter).toBe('А');
      expect(idea.text).toBe('Test idea');
      expect(idea.done).toBe(false);
      expect(idea.createdAt).toBeDefined();
      expect(new Date(idea.createdAt).toISOString()).toBe(idea.createdAt);
    });

    it('should trim whitespace from text', async () => {
      const idea = await service.createIdea('А', '  trimmed text  ');
      expect(idea.text).toBe('trimmed text');
    });

    it('should throw BadRequestException for invalid letter', async () => {
      await expect(service.createIdea('Z', 'text')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createIdea('Z', 'text')).rejects.toThrow(
        'Invalid letter: must be one of the 33 Ukrainian alphabet letters',
      );
    });

    it('should throw BadRequestException for empty text', async () => {
      await expect(service.createIdea('А', '')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createIdea('А', '')).rejects.toThrow(
        'Idea text must not be empty or whitespace-only',
      );
    });

    it('should throw BadRequestException for whitespace-only text', async () => {
      await expect(service.createIdea('А', '   ')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createIdea('А', '   ')).rejects.toThrow(
        'Idea text must not be empty or whitespace-only',
      );
    });

    it('should throw BadRequestException for text exceeding 200 characters', async () => {
      const longText = 'a'.repeat(201);
      await expect(service.createIdea('А', longText)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createIdea('А', longText)).rejects.toThrow(
        'Idea text must not exceed 200 characters',
      );
    });

    it('should persist the created idea', async () => {
      await service.createIdea('А', 'Persisted idea');
      expect(store.ideas).toHaveLength(1);
      expect(store.ideas[0].text).toBe('Persisted idea');
    });
  });

  describe('deleteIdea', () => {
    it('should delete an existing idea', async () => {
      const idea = await service.createIdea('А', 'To delete');
      await service.deleteIdea(idea.id);
      expect(store.ideas).toHaveLength(0);
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(service.deleteIdea('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.deleteIdea('non-existent')).rejects.toThrow(
        'Idea not found',
      );
    });
  });

  describe('updateIdeaStatus', () => {
    it('should update done status to true', async () => {
      const idea = await service.createIdea('А', 'To complete');
      const updated = await service.updateIdeaStatus(idea.id, true);
      expect(updated.done).toBe(true);
      expect(store.ideas[0].done).toBe(true);
    });

    it('should update done status to false', async () => {
      const idea = await service.createIdea('А', 'To uncomplete');
      await service.updateIdeaStatus(idea.id, true);
      const updated = await service.updateIdeaStatus(idea.id, false);
      expect(updated.done).toBe(false);
      expect(store.ideas[0].done).toBe(false);
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        service.updateIdeaStatus('non-existent', true),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateIdeaStatus('non-existent', true),
      ).rejects.toThrow('Idea not found');
    });

    it('should return the updated idea with all fields', async () => {
      const idea = await service.createIdea('Б', 'Status test');
      const updated = await service.updateIdeaStatus(idea.id, true);
      expect(updated.id).toBe(idea.id);
      expect(updated.letter).toBe('Б');
      expect(updated.text).toBe('Status test');
      expect(updated.done).toBe(true);
      expect(updated.createdAt).toBe(idea.createdAt);
    });
  });
});
