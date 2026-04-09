import { Module } from '@nestjs/common';
import { SrsCallbackController } from './srs-callback.controller';
import { SrsApiService } from './srs-api.service';
import { PlaybackModule } from '../playback/playback.module';

@Module({
  imports: [PlaybackModule],
  controllers: [SrsCallbackController],
  providers: [SrsApiService],
  exports: [SrsApiService],
})
export class SrsModule {}
