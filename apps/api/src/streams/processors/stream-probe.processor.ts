import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { FfprobeService } from '../../cameras/ffprobe.service';
import { SystemPrismaService } from '../../prisma/system-prisma.service';

export interface ProbeJobData {
  cameraId: string;
  streamUrl: string;
  orgId: string;
}

/**
 * StreamProbeProcessor — runs ffprobe against newly-imported cameras
 * to populate Camera.codecInfo + needsTranscode for transcode/passthrough
 * decisions.
 *
 * Background worker, no CLS context → uses SystemPrismaService (RLS-bypass).
 * Lookup by primary key (cameraId from job, originally produced by an
 * org-scoped bulkImport call).
 *
 * Concurrency=5: probe is short (15s timeout in FfprobeService); 5 parallel
 * ffprobe children are cheap and let bulk imports of ~50 cameras finish
 * within ~2 min worst case.
 *
 * Best-effort: probe failures (unreachable camera, bad creds) record an
 * error in codecInfo and do NOT throw — worker stays alive, BullMQ does
 * not retry needlessly.
 */
@Processor('stream-probe', { concurrency: 5 })
export class StreamProbeProcessor extends WorkerHost {
  private readonly logger = new Logger(StreamProbeProcessor.name);

  constructor(
    private readonly ffprobeService: FfprobeService,
    private readonly prisma: SystemPrismaService,
  ) {
    super();
  }

  async process(job: Job<ProbeJobData>): Promise<void> {
    const { cameraId, streamUrl } = job.data;

    try {
      const result = await this.ffprobeService.probeCamera(streamUrl);
      await this.prisma.camera.update({
        where: { id: cameraId },
        data: {
          needsTranscode: result.needsTranscode,
          codecInfo: {
            codec: result.codec,
            width: result.width,
            height: result.height,
            fps: result.fps,
            audioCodec: result.audioCodec,
            probedAt: new Date().toISOString(),
          },
        },
      });
      this.logger.log(
        `Probed camera ${cameraId}: codec=${result.codec}, transcode=${result.needsTranscode}`,
      );
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.warn(
        `ffprobe failed for camera ${cameraId}: ${message}`,
      );
      // Best-effort: record error but do not throw. We don't want BullMQ to
      // retry probes against unreachable cameras 20× per import.
      try {
        await this.prisma.camera.update({
          where: { id: cameraId },
          data: {
            codecInfo: {
              error: message,
              probedAt: new Date().toISOString(),
            },
          },
        });
      } catch (updateErr) {
        this.logger.error(
          `Failed to record probe error for camera ${cameraId}: ${(updateErr as Error).message}`,
        );
      }
    }
  }
}
