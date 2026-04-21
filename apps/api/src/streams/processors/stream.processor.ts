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

// Concurrency=50: FfmpegService.startStream returns a Promise that only resolves
// when FFmpeg ENDS/ERRORS, so a live stream permanently occupies its worker slot.
// The default concurrency=1 means only ONE camera could ever stream per API instance.
// 50 parallel children are well within typical OS fd/process limits and FFmpeg is
// I/O-bound (network → disk), so the slots are mostly idle CPU-wise. Increase if
// a single instance must serve more than ~50 concurrent cameras.
@Processor('stream-ffmpeg', { concurrency: 50 })
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

    // Defensive guard: BullMQ has been observed enqueuing jobs with empty data
    // (see memory note 260421 — race between BootRecoveryService/CameraHealthService
    // + jobId dedup). Refuse such jobs at the choke point: log and return without
    // throwing so the job is marked complete and does NOT retry into a storm.
    if (!cameraId || !rtspUrl) {
      this.logger.error(
        `Refusing job with empty data: cameraId=${cameraId ?? '<undefined>'}, rtspUrl=${rtspUrl ? 'set' : 'empty'}, jobId=${job.id}`,
      );
      return;
    }

    const streamKey = `live/${orgId}/${cameraId}`;
    const srsHost = process.env.SRS_HOST || 'localhost';
    const outputUrl = `rtmp://${srsHost}:1935/${streamKey}`;

    this.logger.log(`Processing stream job for camera ${cameraId} (attempt ${job.attemptsMade + 1})`);

    await this.statusService.transition(cameraId, orgId, 'connecting');
    await this.ffmpegService.startStream(cameraId, rtspUrl, outputUrl, profile, needsTranscode);
  }
}
