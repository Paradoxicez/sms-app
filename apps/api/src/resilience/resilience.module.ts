import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { StreamsModule } from '../streams/streams.module';
import { SrsModule } from '../srs/srs.module';
import { CameraHealthService } from './camera-health.service';
import { CameraHealthProcessor } from './camera-health.processor';
import { SrsRestartDetector } from './srs-restart-detector';
import { BootRecoveryService } from './boot-recovery.service';

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
  providers: [
    CameraHealthService,
    CameraHealthProcessor,
    SrsRestartDetector,
    BootRecoveryService,
  ],
  exports: [CameraHealthService, SrsRestartDetector, BootRecoveryService],
})
export class ResilienceModule {}
