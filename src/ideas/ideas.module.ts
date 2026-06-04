import { Module } from '@nestjs/common';
import { IdeasController } from './ideas.controller';
import { IdeasService } from './ideas.service';
import { PersistenceService } from './persistence/persistence.service';

@Module({
  controllers: [IdeasController],
  providers: [IdeasService, PersistenceService],
  exports: [IdeasService],
})
export class IdeasModule {}
