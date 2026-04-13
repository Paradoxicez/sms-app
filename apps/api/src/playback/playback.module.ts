import { Module, forwardRef } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ClusterModule } from '../cluster/cluster.module';
import { PlaybackService } from './playback.service';
import { PlaybackController } from './playback.controller';

@Module({
  imports: [ApiKeysModule, forwardRef(() => ClusterModule)],
  controllers: [PlaybackController],
  providers: [PlaybackService],
  exports: [PlaybackService],
})
export class PlaybackModule {}
