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
  inputUrl: string;
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
    const { cameraId, orgId, inputUrl, profile, needsTranscode } = job.data;

    // Defensive guard: BullMQ has been observed enqueuing jobs with empty data
    // (see memory note 260421 — race between BootRecoveryService/CameraHealthService
    // + jobId dedup). Refuse such jobs at the choke point: log and return without
    // throwing so the job is marked complete and does NOT retry into a storm.
    if (!cameraId || !inputUrl) {
      this.logger.error(
        `Refusing job with empty data: cameraId=${cameraId ?? '<undefined>'}, inputUrl=${inputUrl ? 'set' : 'empty'}, jobId=${job.id}`,
      );
      return;
    }

    // Phase 19.1 (D-17): defensive guard — push+passthrough cameras must
    // never run FFmpeg. StreamsService.startStream short-circuits, but stray
    // jobs from BootRecoveryService or CameraHealthService could still land
    // here. Discriminator: push+passthrough jobs have needsTranscode=false
    // AND a loopback inputUrl (buildStreamJobData only writes that URL for
    // push cameras); pull+passthrough uses external URL, push+transcode has
    // needsTranscode=true.
    const isPushPassthrough =
      !needsTranscode &&
      typeof inputUrl === 'string' &&
      inputUrl.startsWith('rtmp://127.0.0.1:1935/push/');
    if (isPushPassthrough) {
      this.logger.warn(
        `Refusing FFmpeg job for push+passthrough camera ${cameraId} — SRS forward handles it`,
      );
      return;
    }

    const streamKey = `live/${orgId}/${cameraId}`;
    const srsHost = process.env.SRS_HOST || 'localhost';
    const outputUrl = `rtmp://${srsHost}:1935/${streamKey}`;

    // Phase 21 D-05 restart branch: kill the existing FFmpeg, transition
    // to 'reconnecting', then fall through to the normal spawn path so
    // the new profile values from job.data.profile take effect.
    //
    // After gracefulRestart returns, the FFmpeg process is GONE from
    // runningProcesses (because the 'error'/'end' handlers in
    // ffmpeg.service.ts:34-66 delete the entry on either intentional stop
    // or kill), so the subsequent startStream call will not short-circuit
    // at ffmpeg.service.ts:19 ("Stream already running").
    if (job.name === 'restart') {
      this.logger.log(
        `Processing RESTART job for camera ${cameraId} (attempt ${job.attemptsMade + 1})`,
      );
      await this.ffmpegService.gracefulRestart(cameraId, 5_000);
      await this.statusService.transition(cameraId, orgId, 'reconnecting');
    } else {
      this.logger.log(
        `Processing stream job for camera ${cameraId} (attempt ${job.attemptsMade + 1})`,
      );
      await this.statusService.transition(cameraId, orgId, 'connecting');
    }

    await this.ffmpegService.startStream(cameraId, inputUrl, outputUrl, profile, needsTranscode);
  }
}
