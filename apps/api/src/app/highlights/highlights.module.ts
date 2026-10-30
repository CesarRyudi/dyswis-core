import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { HighlightsController } from './highlights.controller';
import { HighlightsService } from './highlights.service';

@Module({
  controllers: [HighlightsController],
  providers: [HighlightsService, PrismaService],
  exports: [HighlightsService],
})
export class HighlightsModule {}
