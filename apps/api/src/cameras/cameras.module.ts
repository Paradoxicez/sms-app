import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';
import { FfprobeService } from './ffprobe.service';
import { SnapshotService } from './snapshot.service';
import { TagCacheService } from './tag-cache.service';
import { StreamsModule } from '../streams/streams.module';
import { SrsModule } from '../srs/srs.module';
import { AuditModule } from '../audit/audit.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { REDIS_CLIENT } from '../api-keys/api-keys.service';

@Module({
  imports: [
    // Phase 19 (D-02): forwardRef because CamerasModule → StreamsModule →
    // SrsModule → CamerasModule forms a cycle (SrsCallbackController now
    // injects CamerasService.enqueueProbeFromSrs).
    forwardRef(() => StreamsModule),
    // Phase 19.1 (D-20, D-22): SrsApiService.kickPublisher is called from
    // rotateStreamKey + deleteCamera (push branch). SrsModule imports
    // CamerasModule via forwardRef already, so we mirror that here.
    forwardRef(() => SrsModule),
    // Phase 19.1 (D-21): AuditService.log is called from createCamera (push)
    // and rotateStreamKey. AuditModule is Global so the import is mostly
    // declarative — kept explicit for clarity of dependency surface.
    AuditModule,
    // Quick task 260425-w7v: SnapshotService injects MinioService for the
    // shared `snapshots` bucket. RecordingsModule already exports MinioService;
    // mirroring AccountModule's pattern (account.module.ts imports
    // RecordingsModule for AvatarService).
    RecordingsModule,
    // Required so @InjectQueue('stream-probe') in CamerasService resolves.
    // The actual queue is registered in StreamsModule; this re-registration
    // is the standard NestJS pattern for cross-module queue injection.
    BullModule.registerQueue({ name: 'stream-probe' }),
  ],
  controllers: [CamerasController],
  providers: [
    CamerasService,
    FfprobeService,
    SnapshotService,
    // Phase 22 Plan 22-05 (D-09, D-28): TagCacheService backs GET
    // /cameras/tags/distinct with Redis-first read-through caching + an
    // in-memory fallback. Module-local REDIS_CLIENT factory matches the
    // pattern used by StreamsModule + ApiKeysModule (each module owns its
    // own Redis connection — cheap, isolated shutdown). TagCacheService
    // takes REDIS_CLIENT as `@Optional` so test harnesses constructing the
    // service directly with positional args (no Redis) still work.
    TagCacheService,
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
  exports: [CamerasService, FfprobeService, SnapshotService, TagCacheService],
})
export class CamerasModule {}
