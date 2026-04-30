import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { execSync } from 'child_process';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { buildStreamJobData } from './job-data.helper';
import { MAX_STREAM_ATTEMPTS } from '../streams/processors/stream.processor';

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
 *
 * Phase 19.1: also kills orphan FFmpeg processes (from a previous API
 * instance) before enqueuing — otherwise the new FFmpeg clashes with the
 * orphan on the RTMP output URL and loops on exit code 251.
 */
@Injectable()
export class BootRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootRecoveryService.name);

  constructor(
    private readonly prisma: SystemPrismaService,
    @InjectQueue('stream-ffmpeg') private readonly streamQueue: Queue,
  ) {}

  /**
   * Phase 19.1: FfmpegService tracks running processes in an in-memory Map
   * that does NOT survive API restart. FFmpegs spawned by the previous
   * instance keep publishing to `rtmp://.../live/<orgId>/<cameraId>` and
   * block the new instance from starting its own. Detect such orphans by
   * matching the output URL pattern against current camera IDs, SIGTERM
   * them, then the normal re-enqueue loop below starts fresh FFmpegs.
   */
  private killOrphanFfmpegs(cameraIds: Set<string>): void {
    // `pgrep -a` is Linux-only; on macOS it outputs bare PIDs. Use `ps` with
    // an explicit column format so the parser works on both OSes.
    let output: string;
    try {
      output = execSync('ps -eo pid=,command=', { encoding: 'utf8' });
    } catch {
      return;
    }
    const lines = output.split('\n').filter(Boolean);
    let killed = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.includes('ffmpeg') || !trimmed.includes('/live/')) continue;
      const spaceIdx = trimmed.indexOf(' ');
      if (spaceIdx < 1) continue;
      const pid = parseInt(trimmed.slice(0, spaceIdx), 10);
      const cmd = trimmed.slice(spaceIdx + 1);
      const match = cmd.match(/\/live\/[0-9a-f-]+\/([0-9a-f-]+)/i);
      if (!match) continue;
      const cameraId = match[1];
      if (!cameraIds.has(cameraId)) continue;
      try {
        process.kill(pid, 'SIGTERM');
        killed++;
        this.logger.warn(
          `Boot recovery: killed orphan FFmpeg PID=${pid} camera=${cameraId}`,
        );
      } catch (err) {
        this.logger.warn(
          `Boot recovery: failed to kill orphan PID=${pid}: ${(err as Error).message}`,
        );
      }
    }
    if (killed > 0) {
      this.logger.log(`Boot recovery: killed ${killed} orphan FFmpeg process(es)`);
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    const desiredRunning = await this.prisma.camera.findMany({
      where: {
        status: { in: ['online', 'connecting', 'reconnecting', 'degraded'] },
        maintenanceMode: false,
      },
      include: { streamProfile: true },
    });

    // Phase 19.1: clean orphan FFmpegs before re-enqueuing so the new
    // processes don't collide on the output RTMP URL.
    const allCameraIds = await this.prisma.camera.findMany({
      select: { id: true },
    });
    this.killOrphanFfmpegs(new Set(allCameraIds.map((c: { id: string }) => c.id)));

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
          attempts: MAX_STREAM_ATTEMPTS,
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
