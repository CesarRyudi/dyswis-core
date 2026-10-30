import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { loggerConfig } from './logger.config';
import { LoggerController } from './logger.controller';

@Module({
  imports: [WinstonModule.forRoot(loggerConfig)],
  controllers: [LoggerController],
  exports: [WinstonModule],
})
export class LoggerModule {}
