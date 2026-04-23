import { Module, forwardRef } from '@nestjs/common';
import { SrsCallbackController } from './srs-callback.controller';
import { SrsApiService } from './srs-api.service';
import { SrsLogGateway } from './srs-log.gateway';
import { PlaybackModule } from '../playback/playback.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { CamerasModule } from '../cameras/cameras.module';
import { StreamsModule } from '../streams/streams.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    PlaybackModule,
    RecordingsModule,
    // Phase 19 (D-02): SrsCallbackController.onPublish now calls
    // CamerasService.enqueueProbeFromSrs after status transition. Use
    // forwardRef because StreamsModule (imported by CamerasModule) also
    // imports SrsModule — without it Nest cannot resolve the cycle.
    forwardRef(() => CamerasModule),
    // Phase 19.1 (D-17): SrsCallbackController.onPublish push branch now
    // calls streamsService.startStream to start FFmpeg for push+transcode
    // cameras. StreamsModule already imports SrsModule (forwardRef) so we
    // mirror the forwardRef here.
    forwardRef(() => StreamsModule),
    // Phase 19.1 (D-21): SrsCallbackController injects AuditService for
    // camera.push.publish_rejected + camera.push.first_publish events.
    // AuditModule is @Global() but explicit import keeps the dependency
    // visible at the module boundary.
    AuditModule,
  ],
  controllers: [SrsCallbackController],
  providers: [SrsApiService, SrsLogGateway],
  exports: [SrsApiService],
})
export class SrsModule {}
