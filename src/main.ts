import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SyncService } from './ideas/persistence/sync/sync.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // init() triggers OnApplicationBootstrap lifecycle hooks (including SyncService restore)
  await app.init();
  await app.get(SyncService).waitUntilReady();
  await app.listen(3000);
}
bootstrap();
