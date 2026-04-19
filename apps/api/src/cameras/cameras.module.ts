import { Module } from '@nestjs/common';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';
import { FfprobeService } from './ffprobe.service';
import { StreamsModule } from '../streams/streams.module';

@Module({
  imports: [StreamsModule],
  controllers: [CamerasController],
  providers: [CamerasService, FfprobeService],
  exports: [CamerasService, FfprobeService],
})
export class CamerasModule {}
