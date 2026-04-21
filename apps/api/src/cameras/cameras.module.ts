import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';
import { FfprobeService } from './ffprobe.service';
import { StreamsModule } from '../streams/streams.module';

@Module({
  imports: [
    StreamsModule,
    // Required so @InjectQueue('stream-probe') in CamerasService resolves.
    // The actual queue is registered in StreamsModule; this re-registration
    // is the standard NestJS pattern for cross-module queue injection.
    BullModule.registerQueue({ name: 'stream-probe' }),
  ],
  controllers: [CamerasController],
  providers: [CamerasService, FfprobeService],
  exports: [CamerasService, FfprobeService],
})
export class CamerasModule {}
