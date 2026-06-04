import { IsNotEmpty, MaxLength } from 'class-validator';

export class CreateIdeaDto {
  @IsNotEmpty()
  @MaxLength(200)
  text: string;
}
