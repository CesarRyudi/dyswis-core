import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { StorageModule } from '../storage/storage.module';
import { SyncModule } from '../sync.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [StorageModule, forwardRef(() => SyncModule)],
  controllers: [RoomsController],
  providers: [RoomsService, PrismaService],
  exports: [RoomsService],
})
export class RoomsModule {}
