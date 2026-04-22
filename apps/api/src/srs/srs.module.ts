import { Module, forwardRef } from '@nestjs/common';
import { SrsCallbackController } from './srs-callback.controller';
import { SrsApiService } from './srs-api.service';
import { SrsLogGateway } from './srs-log.gateway';
import { PlaybackModule } from '../playback/playback.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { CamerasModule } from '../cameras/cameras.module';

@Module({
  imports: [
    PlaybackModule,
    RecordingsModule,
    // Phase 19 (D-02): SrsCallbackController.onPublish now calls
    // CamerasService.enqueueProbeFromSrs after status transition. Use
    // forwardRef because StreamsModule (imported by CamerasModule) also
    // imports SrsModule — without it Nest cannot resolve the cycle.
    forwardRef(() => CamerasModule),
  ],
  controllers: [SrsCallbackController],
  providers: [SrsApiService, SrsLogGateway],
  exports: [SrsApiService],
})
export class SrsModule {}
