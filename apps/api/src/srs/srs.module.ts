import { Module } from '@nestjs/common';
import { SrsCallbackController } from './srs-callback.controller';
import { SrsApiService } from './srs-api.service';
import { SrsLogGateway } from './srs-log.gateway';
import { PlaybackModule } from '../playback/playback.module';
import { RecordingsModule } from '../recordings/recordings.module';

@Module({
  imports: [PlaybackModule, RecordingsModule],
  controllers: [SrsCallbackController],
  providers: [SrsApiService, SrsLogGateway],
  exports: [SrsApiService],
})
export class SrsModule {}
