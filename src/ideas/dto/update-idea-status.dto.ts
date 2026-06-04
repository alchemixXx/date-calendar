import { IsBoolean } from 'class-validator';

export class UpdateIdeaStatusDto {
  @IsBoolean()
  done: boolean;
}
