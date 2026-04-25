import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { SrsApiService } from '../srs/srs-api.service';
import { FfmpegService } from '../streams/ffmpeg/ffmpeg.service';
import { StatusService } from '../status/status.service';
import { SrsRestartDetector } from './srs-restart-detector';
import { buildStreamJobData } from './job-data.helper';

const NOTIFIABLE_CAMERA_STATUSES = ['online', 'connecting', 'reconnecting', 'degraded'];

/**
 * Runs every 60s on a BullMQ repeatable job. Each tick:
 *  1. Delegates to SrsRestartDetector for pid-delta detection + bulk re-enqueue
 *  2. Queries non-maintenance cameras that should be running
 *  3. Cross-checks FFmpeg.isRunning + SRS /api/v1/streams membership
 *  4. For any dead stream: SIGTERMs stale FFmpeg, transitions to 'reconnecting',
 *     and enqueues a single-camera recovery job (no jitter — this is per-camera)
 *
 * Concurrency 1 (BullMQ default for single-worker queue) ensures only one
 * instance runs even with multiple API replicas — mitigates T-15-03 (SRS DoS).
 */
@Injectable()
export class CameraHealthService implements OnModuleInit {
  private readonly logger = new Logger(CameraHealthService.name);

  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly srsApi: SrsApiService,
    private readonly ffmpeg: FfmpegService,
    private readonly statusService: StatusService,
    private readonly srsRestartDetector: SrsRestartDetector,
    @InjectQueue('camera-health') private readonly healthQueue: Queue,
    @InjectQueue('stream-ffmpeg') private readonly streamQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Single deterministic repeatable job — mitigates Pitfall 1 (duplicate repeaters on restart).
    await this.healthQueue.add(
      'tick',
      {},
      {
        jobId: 'camera-health-tick',
        repeat: { every: 60_000 },
        removeOnComplete: true,
        removeOnFail: 10,
      },
    );
    this.logger.log(
      `CameraHealthService: scheduled repeatable tick every 60000ms`,
    );
  }

  async runTick(): Promise<void> {
    this.logger.debug('CameraHealthService: tick start');

    // Step 1 — detect SRS restart + handle bulk re-enqueue (no per-camera work).
    await this.srsRestartDetector.detectAndHandle();

    // Step 2 — pull cameras that SHOULD be running (non-offline, non-maintenance).
    const cameras = await this.prisma.camera.findMany({
      where: {
        status: { in: NOTIFIABLE_CAMERA_STATUSES },
        maintenanceMode: false,
      },
      include: { streamProfile: true },
    });

    // Step 3 — single SRS probe for all cameras (not per-camera — mitigates T-15-03).
    const srsStreamsResult = await this.srsApi.getStreams().catch((err) => {
      this.logger.warn(
        `CameraHealthService: getStreams failed — ${(err as Error).message}`,
      );
      return { streams: [] };
    });
    const srsStreamIds = new Set<string>(
      (srsStreamsResult?.streams ?? []).map((s: { name: string }) => s.name),
    );

    // Step 4 — detect dead streams + recover.
    for (const camera of cameras) {
      // Phase 19.1 (D-17): push+passthrough cameras have NO FFmpeg process
      // by design — SRS `forward` directive remaps push/<key> → live/<orgId>/<cameraId>
      // natively. Treating ffmpegAlive=false as "dead" would loop: enqueue ffmpeg job
      // → FFmpeg starts a second publisher on push/<key> → conflicts with OBS → exit
      // → CameraHealthService detects "dead" again → repeat. Liveness for push+
      // passthrough is purely based on SRS stream presence.
      const isPushPassthrough =
        (camera as any).ingestMode === 'push' && !camera.needsTranscode;

      const ffmpegAlive = this.ffmpeg.isRunning(camera.id);
      const srsAlive = srsStreamIds.has(camera.id);
      const dead = isPushPassthrough ? !srsAlive : !ffmpegAlive || !srsAlive;

      if (!dead) continue;

      // Push+passthrough recovery path: no FFmpeg to stop, no FFmpeg to (re)start.
      // The encoder (OBS / camera) reconnects on its own. We only mark status
      // reconnecting so the UI reflects the gap; we do NOT enqueueStart.
      if (isPushPassthrough) {
        this.logger.warn(
          `CameraHealthService: push+passthrough camera ${camera.id} missing from SRS — waiting for encoder to reconnect`,
        );
        await this.statusService
          .transition(camera.id, camera.orgId, 'reconnecting')
          .catch(() => {});
        continue;
      }

      this.logger.warn(
        `CameraHealthService: dead stream detected for camera ${camera.id} (ffmpeg=${ffmpegAlive}, srs=${srsAlive})`,
      );

      if (ffmpegAlive) {
        this.ffmpeg.stopStream(camera.id);
      }

      await this.statusService
        .transition(camera.id, camera.orgId, 'reconnecting')
        .catch((err) => {
          this.logger.warn(
            `CameraHealthService: status transition to reconnecting failed for ${camera.id} — ${(err as Error).message}`,
          );
        });

      await this.enqueueStart(camera);
    }

    this.logger.debug('CameraHealthService: tick end');
  }

  private async enqueueStart(camera: any): Promise<void> {
    // Phase 21 B-1 collision guard: the camera-health tick and Phase 21
    // profile-restart enqueues share the SAME jobId (`camera:{id}:ffmpeg`)
    // because that is the canonical Phase 15 dedup contract (RESEARCH §1).
    // Without this guard, BullMQ same-jobId remove-then-add semantics would
    // SILENTLY replace an in-flight `'restart'` job (which carries the
    // SIGTERM+respawn-with-new-profile branch in StreamProcessor) with a
    // `'start'` job carrying the camera-health snapshot — and the OLD
    // FFmpeg profile would persist. We MUST preserve in-flight 'restart'.
    const jobId = `camera:${camera.id}:ffmpeg`;
    const existing = await this.streamQueue.getJob(jobId);
    if (existing && existing.name === 'restart') {
      this.logger.debug(
        `CameraHealthService: skipping enqueue for ${camera.id} — in-flight 'restart' job ${existing.id} preserved (will retry next tick)`,
      );
      return;
    }

    await this.streamQueue.add(
      'start',
      buildStreamJobData(camera),
      {
        jobId,
        attempts: 20,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    this.logger.log(`CameraHealthService: enqueued recovery for ${camera.id}`);
  }
}
