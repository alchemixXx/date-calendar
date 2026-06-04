import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateIdeaDto } from './dto/create-idea.dto';
import { UpdateIdeaStatusDto } from './dto/update-idea-status.dto';
import { IdeasService } from './ideas.service';
import { Idea, LetterWithIdeas } from './interfaces/idea.interface';

@Controller('api/ideas')
export class IdeasController {
  constructor(private readonly ideasService: IdeasService) {}

  @Get()
  async getAllLettersWithIdeas(): Promise<LetterWithIdeas[]> {
    return this.ideasService.getAllLettersWithIdeas();
  }

  @Post(':letter')
  async createIdea(
    @Param('letter') letter: string,
    @Body() dto: CreateIdeaDto,
  ): Promise<Idea> {
    return this.ideasService.createIdea(letter, dto.text);
  }

  @Delete(':id')
  async deleteIdea(@Param('id') id: string): Promise<{ deleted: true }> {
    await this.ideasService.deleteIdea(id);
    return { deleted: true };
  }

  @Patch(':id/status')
  async updateIdeaStatus(
    @Param('id') id: string,
    @Body() dto: UpdateIdeaStatusDto,
  ): Promise<Idea> {
    return this.ideasService.updateIdeaStatus(id, dto.done);
  }
}
