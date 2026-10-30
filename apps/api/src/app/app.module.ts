import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from './prisma.service';
import { RoomsModule } from './rooms/rooms.module';
import { SyncModule } from './sync.module';
import { LoggerModule } from './logger/logger.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './logger/logging.interceptor';
import { AnnotationsModule } from './annotations/annotations.module';
import { HighlightsModule } from './highlights/highlights.module';

@Module({
  imports: [AuthModule, RoomsModule, SyncModule, LoggerModule, AnnotationsModule, HighlightsModule],
  controllers: [AppController],
  providers: [
    AppService, 
    PrismaService, 
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
  exports: [PrismaService],
})
export class AppModule {}
