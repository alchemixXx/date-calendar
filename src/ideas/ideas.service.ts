import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { UKRAINIAN_ALPHABET } from './constants/ukrainian-alphabet.constant';
import { Idea, LetterWithIdeas } from './interfaces/idea.interface';
import { PersistenceService } from './persistence/persistence.service';

@Injectable()
export class IdeasService {
  constructor(private readonly persistenceService: PersistenceService) {}

  async getAllLettersWithIdeas(): Promise<LetterWithIdeas[]> {
    const data = await this.persistenceService.readData();

    const ideasByLetter = new Map<string, Idea[]>();

    for (const letter of UKRAINIAN_ALPHABET) {
      ideasByLetter.set(letter, []);
    }

    for (const idea of data.ideas) {
      const letterIdeas = ideasByLetter.get(idea.letter);
      if (letterIdeas) {
        letterIdeas.push(idea);
      }
    }

    return UKRAINIAN_ALPHABET.map((letter) => {
      const ideas = ideasByLetter.get(letter) || [];
      ideas.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      return { letter, ideas };
    });
  }

  async createIdea(letter: string, text: string): Promise<Idea> {
    if (!UKRAINIAN_ALPHABET.includes(letter)) {
      throw new BadRequestException(
        'Invalid letter: must be one of the 33 Ukrainian alphabet letters',
      );
    }

    const trimmedText = text.trim();

    if (!trimmedText || trimmedText.length === 0) {
      throw new BadRequestException(
        'Idea text must not be empty or whitespace-only',
      );
    }

    if (trimmedText.length > 200) {
      throw new BadRequestException('Idea text must not exceed 200 characters');
    }

    const idea: Idea = {
      id: uuidv4(),
      letter,
      text: trimmedText,
      done: false,
      createdAt: new Date().toISOString(),
    };

    const data = await this.persistenceService.readData();
    data.ideas.push(idea);
    await this.persistenceService.writeData(data);

    return idea;
  }

  async deleteIdea(id: string): Promise<void> {
    const data = await this.persistenceService.readData();
    const index = data.ideas.findIndex((idea) => idea.id === id);

    if (index === -1) {
      throw new NotFoundException('Idea not found');
    }

    data.ideas.splice(index, 1);
    await this.persistenceService.writeData(data);
  }

  async updateIdeaStatus(id: string, done: boolean): Promise<Idea> {
    const data = await this.persistenceService.readData();
    const idea = data.ideas.find((idea) => idea.id === id);

    if (!idea) {
      throw new NotFoundException('Idea not found');
    }

    idea.done = done;
    await this.persistenceService.writeData(data);

    return idea;
  }
}
