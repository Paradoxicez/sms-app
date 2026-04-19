import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SrsApiService } from '../srs/srs-api.service';
import { FfmpegService } from '../streams/ffmpeg/ffmpeg.service';
import { buildStreamJobData } from './job-data.helper';

/**
 * Detects SRS container restart by tracking self.pid delta from
 * /api/v1/summaries. On restart, re-enqueues all non-offline, non-maintenance
 * cameras with 0-30s jitter to avoid thundering herd (T-15-04).
 *
 * Baseline is in-memory only for v1 (D-07 note). Restarting the API after
 * SRS restart may cause a false-negative (both pids reset, lastPid=null on
 * first tick). Boot recovery (BootRecoveryService) provides the safety net —
 * it always re-enqueues on boot regardless.
 */
@Injectable()
export class SrsRestartDetector {
  private readonly logger = new Logger(SrsRestartDetector.name);
  private lastPid: number | null = null;
  private firstTick = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly srsApi: SrsApiService,
    private readonly ffmpeg: FfmpegService,
    @InjectQueue('stream-ffmpeg') private readonly streamQueue: Queue,
  ) {}

  async detectAndHandle(): Promise<void> {
    const summaries = await this.srsApi.getSummaries().catch((err) => {
      this.logger.warn(`SrsRestartDetector: getSummaries failed — ${(err as Error).message}`);
      return null;
    });

    const currentPid: number | null = summaries?.data?.self?.pid ?? null;
    if (currentPid === null) {
      this.logger.warn('SrsRestartDetector: pid not available in summaries — skipping');
      return;
    }

    // First tick after API boot — initialize baseline without firing recovery
    // (mitigates Pitfall 4: false-positive restart on first API boot).
    if (this.firstTick) {
      this.lastPid = currentPid;
      this.firstTick = false;
      this.logger.log(`SrsRestartDetector: baseline pid=${currentPid} initialized`);
      return;
    }

    if (this.lastPid !== null && this.lastPid !== currentPid) {
      this.logger.warn(
        `SrsRestartDetector: SRS restart detected: pid ${this.lastPid} -> ${currentPid}`,
      );
      await this.handleRestart();
    }

    this.lastPid = currentPid;
  }

  private async handleRestart(): Promise<void> {
    const cameras = await this.prisma.camera.findMany({
      where: {
        NOT: { status: 'offline' },
        maintenanceMode: false,
      },
      include: { streamProfile: true },
    });

    this.logger.log(
      `SrsRestartDetector: re-enqueuing ${cameras.length} cameras with 0-30s jitter`,
    );

    for (const camera of cameras) {
      if (this.ffmpeg.isRunning(camera.id)) {
        this.ffmpeg.stopStream(camera.id);
      }

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
        `SrsRestartDetector: enqueued ${camera.id} (delay=${delay}ms)`,
      );
    }
  }
}
