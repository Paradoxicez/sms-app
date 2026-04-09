import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { FfmpegService } from './ffmpeg/ffmpeg.service';
import { StreamProcessor } from './processors/stream.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'stream:ffmpeg' }),
  ],
  controllers: [StreamsController],
  providers: [StreamsService, FfmpegService, StreamProcessor],
  exports: [StreamsService, FfmpegService],
})
export class StreamsModule {}
