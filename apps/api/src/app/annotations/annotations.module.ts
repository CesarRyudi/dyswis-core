import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AnnotationsController } from './annotations.controller';
import { AnnotationsService } from './annotations.service';

@Module({
  controllers: [AnnotationsController],
  providers: [AnnotationsService, PrismaService],
  exports: [AnnotationsService],
})
export class AnnotationsModule {}
