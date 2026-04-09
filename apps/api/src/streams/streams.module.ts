import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { FfmpegService } from './ffmpeg/ffmpeg.service';
import { StreamProcessor } from './processors/stream.processor';
import { StreamProfileService } from './stream-profile.service';
import { StreamProfileController } from './stream-profile.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'stream-ffmpeg' }),
  ],
  controllers: [StreamsController, StreamProfileController],
  providers: [StreamsService, FfmpegService, StreamProcessor, StreamProfileService],
  exports: [StreamsService, FfmpegService, StreamProfileService],
})
export class StreamsModule {}
