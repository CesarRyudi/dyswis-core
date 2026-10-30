import { Module, forwardRef } from '@nestjs/common';
import { SyncGateway } from './sync.gateway';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [forwardRef(() => RoomsModule)],
  providers: [SyncGateway],
  exports: [SyncGateway],
})
export class SyncModule {}
