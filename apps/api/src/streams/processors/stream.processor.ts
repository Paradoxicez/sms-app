import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { StreamProfile } from '../ffmpeg/ffmpeg-command.builder';
import { StatusService } from '../../status/status.service';

export const MAX_BACKOFF_MS = 300_000; // 5 minutes
const BASE_BACKOFF_MS = 1_000; // 1 second

export interface StreamJobData {
  cameraId: string;
  orgId: string;
  rtspUrl: string;
  profile: StreamProfile;
  needsTranscode: boolean;
}

/**
 * Calculate exponential backoff: 1s, 2s, 4s, 8s, ... capped at 5min.
 */
export function calculateBackoff(attempt: number): number {
  const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  return Math.min(backoff, MAX_BACKOFF_MS);
}

@Processor('stream-ffmpeg')
export class StreamProcessor extends WorkerHost {
  private readonly logger = new Logger(StreamProcessor.name);

  constructor(
    private readonly ffmpegService: FfmpegService,
    private readonly statusService: StatusService,
  ) {
    super();
  }

  async process(job: Job<StreamJobData>): Promise<void> {
    const { cameraId, orgId, rtspUrl, profile, needsTranscode } = job.data;
    const streamKey = `live/${orgId}/${cameraId}`;
    const srsHost = process.env.SRS_HOST || 'localhost';
    const outputUrl = `rtmp://${srsHost}:1935/${streamKey}`;

    this.logger.log(`Processing stream job for camera ${cameraId} (attempt ${job.attemptsMade + 1})`);

    await this.statusService.transition(cameraId, orgId, 'connecting');
    await this.ffmpegService.startStream(cameraId, rtspUrl, outputUrl, profile, needsTranscode);
  }
}
