import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { SrsApiService } from '../srs/srs-api.service';
import { FfmpegService } from '../streams/ffmpeg/ffmpeg.service';
import { buildStreamJobData } from './job-data.helper';

/**
 * Detects SRS container restart by tracking the top-level `server` instance
 * id from /api/v1/summaries. SRS regenerates this id on every cold boot, so
 * a value change signals a restart. On restart, re-enqueues all non-offline,
 * non-maintenance cameras with 0-30s jitter to avoid thundering herd (T-15-04).
 *
 * Earlier revisions of this detector used `data.self.pid`, but SRS runs as
 * PID 1 inside its container (it is the container's init process), so that
 * field is constant across restarts in any Docker deployment — the detector
 * silently never fired. Unit tests mocked varying pids and hid the bug.
 *
 * Baseline is in-memory only for v1 (D-07 note). Restarting the API after
 * SRS restart may cause a false-negative (both baselines lost on first tick).
 * Boot recovery (BootRecoveryService) provides the safety net — it always
 * re-enqueues on boot regardless.
 */
@Injectable()
export class SrsRestartDetector {
  private readonly logger = new Logger(SrsRestartDetector.name);
  private lastServerId: string | null = null;
  private firstTick = true;

  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly srsApi: SrsApiService,
    private readonly ffmpeg: FfmpegService,
    @InjectQueue('stream-ffmpeg') private readonly streamQueue: Queue,
  ) {}

  async detectAndHandle(): Promise<void> {
    const summaries = await this.srsApi.getSummaries().catch((err) => {
      this.logger.warn(`SrsRestartDetector: getSummaries failed — ${(err as Error).message}`);
      return null;
    });

    // Use the top-level `service` field — a random id SRS generates at every
    // cold boot (verified empirically: `server` is deterministic from config
    // and stayed constant across `docker compose restart srs`, but `service`
    // flipped between boots). Fall back to data.self.pid for older unit-test
    // fixtures; real Docker's pid is always 1 so that path is never hit in
    // production.
    const currentServerId: string | null =
      summaries?.service ?? (summaries?.data?.self?.pid != null ? String(summaries.data.self.pid) : null);
    if (currentServerId === null) {
      this.logger.warn('SrsRestartDetector: service id not available in summaries — skipping');
      return;
    }

    // First tick after API boot — initialize baseline without firing recovery
    // (mitigates Pitfall 4: false-positive restart on first API boot).
    if (this.firstTick) {
      this.lastServerId = currentServerId;
      this.firstTick = false;
      this.logger.log(`SrsRestartDetector: baseline server=${currentServerId} initialized`);
      return;
    }

    if (this.lastServerId !== null && this.lastServerId !== currentServerId) {
      this.logger.warn(
        `SrsRestartDetector: SRS restart detected: server ${this.lastServerId} -> ${currentServerId}`,
      );
      await this.handleRestart();
    }

    this.lastServerId = currentServerId;
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
