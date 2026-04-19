import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { buildStreamJobData } from './job-data.helper';

/**
 * Re-enqueues desired-running cameras (status in [online, connecting,
 * reconnecting, degraded] AND maintenanceMode=false) on every API boot.
 *
 * Runs unconditionally — no crash detection (D-10). BullMQ jobId dedup
 * (D-11) handles races with SrsRestartDetector that might also fire.
 *
 * Jitter 0-30s mirrors SrsRestartDetector to prevent thundering herd
 * against SRS when multiple API instances boot simultaneously
 * (T-15-04 mitigation).
 */
@Injectable()
export class BootRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('stream-ffmpeg') private readonly streamQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const desiredRunning = await this.prisma.camera.findMany({
      where: {
        status: { in: ['online', 'connecting', 'reconnecting', 'degraded'] },
        maintenanceMode: false,
      },
      include: { streamProfile: true },
    });

    this.logger.log(
      `Boot recovery: re-enqueuing ${desiredRunning.length} streams`,
    );

    for (const camera of desiredRunning) {
      const delay = Math.floor(Math.random() * 30_000);
      await this.streamQueue.add(
        'start',
        buildStreamJobData(camera),
        {
          jobId: `camera:${camera.id}:ffmpeg`,
          delay,
          attempts: 20,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      this.logger.log(
        `Boot recovery enqueued ${camera.id} (delay=${delay}ms)`,
      );
    }
  }
}
