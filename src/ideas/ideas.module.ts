import { Module } from '@nestjs/common';
import { IdeasController } from './ideas.controller';
import { IdeasService } from './ideas.service';
import { PersistenceService } from './persistence/persistence.service';
import { SyncService } from './persistence/sync/sync.service';
import { RemoteStoreClient } from './persistence/sync/remote-store-client';
import {
  SYNC_CONFIG_TOKEN,
  loadSyncConfig,
} from './persistence/sync/sync-config';

@Module({
  controllers: [IdeasController],
  providers: [
    IdeasService,
    PersistenceService,
    SyncService,
    RemoteStoreClient,
    { provide: SYNC_CONFIG_TOKEN, useFactory: loadSyncConfig },
  ],
  exports: [IdeasService],
})
export class IdeasModule {}
