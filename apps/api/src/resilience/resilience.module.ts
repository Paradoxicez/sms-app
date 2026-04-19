import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { StreamsModule } from '../streams/streams.module';
import { SrsModule } from '../srs/srs.module';

@Module({
  imports: [
    PrismaModule,
    StreamsModule,
    SrsModule,
    BullModule.registerQueue(
      { name: 'camera-health' },
      { name: 'stream-ffmpeg' },
    ),
  ],
  providers: [], // populated by Tasks 3-5
  exports: [],
})
export class ResilienceModule {}
