import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IdeasController } from './ideas.controller';
import { IdeasService } from './ideas.service';
import { Idea, LetterWithIdeas } from './interfaces/idea.interface';

describe('IdeasController', () => {
  let controller: IdeasController;
  let service: jest.Mocked<IdeasService>;

  beforeEach(async () => {
    const mockIdeasService = {
      getAllLettersWithIdeas: jest.fn(),
      createIdea: jest.fn(),
      deleteIdea: jest.fn(),
      updateIdeaStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdeasController],
      providers: [{ provide: IdeasService, useValue: mockIdeasService }],
    }).compile();

    controller = module.get<IdeasController>(IdeasController);
    service = module.get(IdeasService) as jest.Mocked<IdeasService>;
  });

  describe('getAllLettersWithIdeas', () => {
    it('should return an array of LetterWithIdeas', async () => {
      const mockResult: LetterWithIdeas[] = [
        { letter: 'А', ideas: [] },
        { letter: 'Б', ideas: [] },
      ];
      service.getAllLettersWithIdeas.mockResolvedValue(mockResult);

      const result = await controller.getAllLettersWithIdeas();

      expect(result).toEqual(mockResult);
      expect(service.getAllLettersWithIdeas).toHaveBeenCalledTimes(1);
    });

    it('should return LetterWithIdeas containing ideas with correct shape', async () => {
      const idea: Idea = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        letter: 'А',
        text: 'Аквапарк',
        done: false,
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      const mockResult: LetterWithIdeas[] = [{ letter: 'А', ideas: [idea] }];
      service.getAllLettersWithIdeas.mockResolvedValue(mockResult);

      const result = await controller.getAllLettersWithIdeas();

      expect(result[0].ideas[0]).toHaveProperty('id');
      expect(result[0].ideas[0]).toHaveProperty('letter');
      expect(result[0].ideas[0]).toHaveProperty('text');
      expect(result[0].ideas[0]).toHaveProperty('done');
      expect(result[0].ideas[0]).toHaveProperty('createdAt');
    });
  });

  describe('createIdea', () => {
    it('should return the created idea with correct shape', async () => {
      const createdIdea: Idea = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        letter: 'Б',
        text: 'Боулінг',
        done: false,
        createdAt: '2024-01-15T10:30:00.000Z',
      };
      service.createIdea.mockResolvedValue(createdIdea);

      const result = await controller.createIdea('Б', { text: 'Боулінг' });

      expect(result).toEqual(createdIdea);
      expect(result.id).toBeDefined();
      expect(result.letter).toBe('Б');
      expect(result.text).toBe('Боулінг');
      expect(result.done).toBe(false);
      expect(result.createdAt).toBeDefined();
      expect(service.createIdea).toHaveBeenCalledWith('Б', 'Боулінг');
    });

    it('should throw BadRequestException for invalid letter', async () => {
      service.createIdea.mockRejectedValue(
        new BadRequestException(
          'Invalid letter: must be one of the 33 Ukrainian alphabet letters',
        ),
      );

      await expect(
        controller.createIdea('X', { text: 'Some idea' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.createIdea('X', { text: 'Some idea' }),
      ).rejects.toThrow(
        'Invalid letter: must be one of the 33 Ukrainian alphabet letters',
      );
    });

    it('should throw BadRequestException for empty text', async () => {
      service.createIdea.mockRejectedValue(
        new BadRequestException(
          'Idea text must not be empty or whitespace-only',
        ),
      );

      await expect(controller.createIdea('А', { text: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for whitespace-only text', async () => {
      service.createIdea.mockRejectedValue(
        new BadRequestException(
          'Idea text must not be empty or whitespace-only',
        ),
      );

      await expect(controller.createIdea('А', { text: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for text exceeding 200 characters', async () => {
      service.createIdea.mockRejectedValue(
        new BadRequestException('Idea text must not exceed 200 characters'),
      );

      const longText = 'a'.repeat(201);
      await expect(
        controller.createIdea('А', { text: longText }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteIdea', () => {
    it('should return { deleted: true } on successful deletion', async () => {
      service.deleteIdea.mockResolvedValue(undefined);

      const result = await controller.deleteIdea('some-uuid');

      expect(result).toEqual({ deleted: true });
      expect(service.deleteIdea).toHaveBeenCalledWith('some-uuid');
    });

    it('should throw NotFoundException when idea does not exist', async () => {
      service.deleteIdea.mockRejectedValue(
        new NotFoundException('Idea not found'),
      );

      await expect(controller.deleteIdea('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.deleteIdea('non-existent-id')).rejects.toThrow(
        'Idea not found',
      );
    });
  });

  describe('updateIdeaStatus', () => {
    it('should return the updated idea with done=true', async () => {
      const updatedIdea: Idea = {
        id: 'idea-uuid-1',
        letter: 'В',
        text: 'Велопрогулянка',
        done: true,
        createdAt: '2024-02-01T12:00:00.000Z',
      };
      service.updateIdeaStatus.mockResolvedValue(updatedIdea);

      const result = await controller.updateIdeaStatus('idea-uuid-1', {
        done: true,
      });

      expect(result).toEqual(updatedIdea);
      expect(result.done).toBe(true);
      expect(service.updateIdeaStatus).toHaveBeenCalledWith(
        'idea-uuid-1',
        true,
      );
    });

    it('should return the updated idea with done=false', async () => {
      const updatedIdea: Idea = {
        id: 'idea-uuid-2',
        letter: 'Г',
        text: 'Гірські лижі',
        done: false,
        createdAt: '2024-02-10T08:00:00.000Z',
      };
      service.updateIdeaStatus.mockResolvedValue(updatedIdea);

      const result = await controller.updateIdeaStatus('idea-uuid-2', {
        done: false,
      });

      expect(result).toEqual(updatedIdea);
      expect(result.done).toBe(false);
      expect(service.updateIdeaStatus).toHaveBeenCalledWith(
        'idea-uuid-2',
        false,
      );
    });

    it('should throw NotFoundException when idea does not exist', async () => {
      service.updateIdeaStatus.mockRejectedValue(
        new NotFoundException('Idea not found'),
      );

      await expect(
        controller.updateIdeaStatus('non-existent-id', { done: true }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.updateIdeaStatus('non-existent-id', { done: true }),
      ).rejects.toThrow('Idea not found');
    });
  });
});
