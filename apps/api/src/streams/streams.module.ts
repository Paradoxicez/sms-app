import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { FfmpegService } from './ffmpeg/ffmpeg.service';
import { StreamProcessor } from './processors/stream.processor';
import { StreamProbeProcessor } from './processors/stream-probe.processor';
import { StreamProfileService } from './stream-profile.service';
import { StreamProfileController } from './stream-profile.controller';
import { FfprobeService } from '../cameras/ffprobe.service';
import { SrsModule } from '../srs/srs.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'stream-ffmpeg' }),
    BullModule.registerQueue({ name: 'stream-probe' }),
    // Phase 19 (D-02): StreamProbeProcessor's srs-api branch injects
    // SrsApiService to pull ground-truth codec info from /api/v1/streams.
    // forwardRef because CamerasModule → StreamsModule → SrsModule →
    // CamerasModule forms a cycle (SrsCallbackController injects
    // CamerasService.enqueueProbeFromSrs).
    forwardRef(() => SrsModule),
    // Phase 21 (D-07): StreamsService.enqueueProfileRestart writes audit rows
    // directly via AuditService.log. AuditModule is @Global so the import is
    // declarative — listed here for readability and to mirror cameras.module.
    AuditModule,
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
