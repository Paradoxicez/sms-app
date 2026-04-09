import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { FfmpegService } from './ffmpeg/ffmpeg.service';
import { StreamJobData, calculateBackoff, MAX_BACKOFF_MS } from './processors/stream.processor';

export interface StatusServiceInterface {
  transition(cameraId: string, orgId: string, newStatus: string): Promise<void>;
}

@Injectable()
export class StreamsService {
  private readonly logger = new Logger(StreamsService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    @InjectQueue('stream:ffmpeg') private readonly streamQueue: Queue,
    private readonly ffmpegService: FfmpegService,
    private readonly statusService: StatusServiceInterface,
  ) {}

  async startStream(cameraId: string): Promise<void> {
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
      include: { streamProfile: true },
    });

    if (!camera) {
      throw new NotFoundException('Camera not found');
    }

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
          codec: 'auto',
          audioCodec: 'aac',
        };

    const jobData: StreamJobData = {
      cameraId: camera.id,
      orgId: camera.orgId,
      rtspUrl: camera.streamUrl,
      profile,
      needsTranscode: camera.needsTranscode,
    };

    await this.streamQueue.add('start', jobData, {
      jobId: `stream:${cameraId}`,
      attempts: 20,
      backoff: {
        type: 'custom',
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

    // Remove the job from the queue
    const job = await this.streamQueue.getJob(`stream:${cameraId}`);
    if (job) {
      await job.remove();
    }

    // Kill the FFmpeg process if running
    if (this.ffmpegService.isRunning(cameraId)) {
      this.ffmpegService.stopStream(cameraId);
    }

    // Transition to offline
    await this.statusService.transition(cameraId, camera.orgId, 'offline');

    this.logger.log(`Stream stopped for camera ${cameraId}`);
  }
}
