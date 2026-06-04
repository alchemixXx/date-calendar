import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { IdeasModule } from './ideas/ideas.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
      exclude: ['/api/(.*)'],
    }),
    IdeasModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
