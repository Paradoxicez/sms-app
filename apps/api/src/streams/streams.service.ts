import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { FfmpegService } from './ffmpeg/ffmpeg.service';
import { StatusService } from '../status/status.service';
import { StreamJobData, calculateBackoff, MAX_BACKOFF_MS } from './processors/stream.processor';

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    @InjectQueue('stream-ffmpeg') private readonly streamQueue: Queue,
    private readonly ffmpegService: FfmpegService,
    private readonly statusService: StatusService,
    // Phase 19.1 (D-17): SRS on_publish callback has no CLS context,
    // so TENANCY_CLIENT returns zero rows. Fall back to systemPrisma
    // when the tenancy lookup fails. Optional so existing unit tests
    // that only inject the tenancy client still construct.
    @Optional() private readonly systemPrisma?: SystemPrismaService,
  ) {}

  async startStream(cameraId: string): Promise<void> {
    this.logger.log(`Starting stream for camera ${cameraId}`);

    let camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      include: { streamProfile: true },
    });

    // SRS-callback fallback: tenancy-bound lookup returns null when called
    // without CLS context (on_publish runs outside request lifecycle). Retry
    // via systemPrisma which bypasses RLS — safe because the only way to
    // reach this code path from SRS is via a validated stream key lookup
    // upstream in findByStreamKey.
    if (!camera && this.systemPrisma) {
      camera = await this.systemPrisma.camera.findUnique({
        where: { id: cameraId },
        include: { streamProfile: true },
      });
    }

    if (!camera) {
      throw new NotFoundException('Camera not found');
    }

    // Phase 19.1 D-17: push + passthrough is a no-op here — SRS `forward`
    // remaps `push/<key>` → `live/<orgId>/<cameraId>` natively, so no FFmpeg
    // process is needed. Enqueuing would create a duplicate-reader conflict
    // between FFmpeg-reading-push-key and SRS-forward-reading-push-key.
    if (camera.ingestMode === 'push' && !camera.needsTranscode) {
      this.logger.debug(
        `startStream: skip FFmpeg for push+passthrough camera ${cameraId} — SRS forward handles it`,
      );
      return;
    }

    this.logger.log(`Camera found: ${camera.name}, url: ${camera.streamUrl?.substring(0, 30)}...`);

    const profile = camera.streamProfile
      ? {
          codec: camera.streamProfile.codec,
          preset: camera.streamProfile.preset,
          resolution: camera.streamProfile.resolution,
          fps: camera.streamProfile.fps,
          videoBitrate: camera.streamProfile.videoBitrate,
          audioCodec: camera.streamProfile.audioCodec,
          audioBitrate: camera.streamProfile.audioBitrate,
        }
      : {
          codec: 'auto' as const,
          audioCodec: 'aac' as const,
        };

    // Phase 19.1 D-17: push + transcode reads from the SRS loopback stream
    // (the camera has already published to `push/<streamKey>`). Pull mode
    // reads the external camera URL directly as before.
    const inputUrl =
      camera.ingestMode === 'push' && camera.streamKey
        ? `rtmp://127.0.0.1:1935/push/${camera.streamKey}`
        : (camera.streamUrl as string);

    const jobData: StreamJobData = {
      cameraId: camera.id,
      orgId: camera.orgId,
      inputUrl,
      profile,
      needsTranscode: camera.needsTranscode,
    };

    // Remove any existing job for this camera before adding new one
    const existingJob = await this.streamQueue.getJob(`camera:${cameraId}:ffmpeg`);
    if (existingJob) {
      await existingJob.remove().catch(() => {});
    }

    await this.streamQueue.add('start', jobData, {
      jobId: `camera:${cameraId}:ffmpeg`,
      attempts: 20,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.log(`Stream job queued for camera ${cameraId}`);
  }

  async stopStream(cameraId: string): Promise<void> {
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
    });

    if (!camera) {
      throw new NotFoundException('Camera not found');
    }

    // Kill FFmpeg FIRST — this causes the BullMQ worker's await to resolve
    // and releases the job lock so we can safely remove it afterward.
    if (this.ffmpegService.isRunning(cameraId)) {
      this.ffmpegService.stopStream(cameraId);
    }

    // Best-effort remove the job. If it's still locked (worker not fully
    // released), that's fine — the worker will finish and removeOnComplete
    // flag from startStream() will clean it up.
    const job = await this.streamQueue.getJob(`camera:${cameraId}:ffmpeg`);
    if (job) {
      await job.remove().catch((err) => {
        this.logger.debug(
          `stopStream: job remove skipped (${(err as Error).message}) — will be reaped by worker`,
        );
      });
    }

    // Transition to offline
    await this.statusService.transition(cameraId, camera.orgId, 'offline');

    this.logger.log(`Stream stopped for camera ${cameraId}`);
  }
}
