import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';
import { FfprobeService } from './ffprobe.service';
import { SnapshotService } from './snapshot.service';
import { StreamsModule } from '../streams/streams.module';
import { SrsModule } from '../srs/srs.module';
import { AuditModule } from '../audit/audit.module';
import { RecordingsModule } from '../recordings/recordings.module';

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
  providers: [CamerasService, FfprobeService, SnapshotService],
  exports: [CamerasService, FfprobeService, SnapshotService],
})
export class CamerasModule {}
