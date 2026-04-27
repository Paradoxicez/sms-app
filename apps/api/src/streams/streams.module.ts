import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { FfmpegService } from './ffmpeg/ffmpeg.service';
import { StreamProcessor } from './processors/stream.processor';
import { StreamProbeProcessor } from './processors/stream-probe.processor';
import { StreamProfileService } from './stream-profile.service';
import { StreamGuardMetricsService } from './stream-guard-metrics.service';
import { StreamProfileController } from './stream-profile.controller';
import { FfprobeService } from '../cameras/ffprobe.service';
import { SrsModule } from '../srs/srs.module';
import { AuditModule } from '../audit/audit.module';
import { REDIS_CLIENT } from '../api-keys/api-keys.service';

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
    // Phase 23 DEBT-01: in-memory refusal counter consumed by StreamProcessor
    // (via @Optional() DI) and surfaced on /api/srs/callbacks/metrics by
    // SrsCallbackController. Exported below so SrsModule's controller can DI
    // it without re-providing.
    StreamGuardMetricsService,
    StreamProbeProcessor,
    StreamProfileService,
    FfprobeService, // needed by StreamProbeProcessor; FfprobeService has no
                    // module-level state, so re-providing here is safe even
                    // though CamerasModule also provides it.
    // Phase 21.1 (D-12): Redis publisher used by StreamsService.enqueueProfileRestart
    // to signal active+locked BullMQ jobs via pub/sub channel
    // `camera:{cameraId}:restart`. Module-local provider matching the same
    // factory shape used by ApiKeysModule, DashboardModule, and AccountModule —
    // each module owns its own Redis connection (cheap, isolated shutdown).
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        });
      },
    },
  ],
  exports: [
    StreamsService,
    FfmpegService,
    StreamProfileService,
    // Phase 23 DEBT-01: SrsCallbackController DI-resolves this through the
    // existing forwardRef(() => StreamsModule) import in SrsModule.
    StreamGuardMetricsService,
    BullModule, // exports the registered queues so CamerasModule can
                // @InjectQueue('stream-probe') from CamerasService.
  ],
})
export class StreamsModule {}
