import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
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
  ) {}

  async startStream(cameraId: string): Promise<void> {
    this.logger.log(`Starting stream for camera ${cameraId}`);

    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      include: { streamProfile: true },
    });

    if (!camera) {
      throw new NotFoundException('Camera not found');
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

    const jobData: StreamJobData = {
      cameraId: camera.id,
      orgId: camera.orgId,
      rtspUrl: camera.streamUrl,
      profile,
      needsTranscode: camera.needsTranscode,
    };

    // Remove any existing job for this camera before adding new one
    const existingJob = await this.streamQueue.getJob(`camera:${cameraId}`);
    if (existingJob) {
      await existingJob.remove().catch(() => {});
    }

    await this.streamQueue.add('start', jobData, {
      jobId: `camera:${cameraId}`,
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
    const job = await this.streamQueue.getJob(`camera:${cameraId}`);
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
