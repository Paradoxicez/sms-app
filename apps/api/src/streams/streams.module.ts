import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { FfmpegService } from './ffmpeg/ffmpeg.service';
import { StreamProcessor } from './processors/stream.processor';
import { StreamProbeProcessor } from './processors/stream-probe.processor';
import { StreamProfileService } from './stream-profile.service';
import { StreamProfileController } from './stream-profile.controller';
import { FfprobeService } from '../cameras/ffprobe.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'stream-ffmpeg' }),
    BullModule.registerQueue({ name: 'stream-probe' }),
  ],
  controllers: [StreamsController, StreamProfileController],
  providers: [
    StreamsService,
    FfmpegService,
    StreamProcessor,
    StreamProbeProcessor,
    StreamProfileService,
    FfprobeService, // needed by StreamProbeProcessor; FfprobeService has no
                    // module-level state, so re-providing here is safe even
                    // though CamerasModule also provides it.
  ],
  exports: [
    StreamsService,
    FfmpegService,
    StreamProfileService,
    BullModule, // exports the registered queues so CamerasModule can
                // @InjectQueue('stream-probe') from CamerasService.
  ],
})
export class StreamsModule {}
