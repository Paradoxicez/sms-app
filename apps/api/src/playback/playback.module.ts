import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { PlaybackService } from './playback.service';
import { PlaybackController } from './playback.controller';

@Module({
  imports: [ApiKeysModule],
  controllers: [PlaybackController],
  providers: [PlaybackService],
  exports: [PlaybackService],
})
export class PlaybackModule {}
