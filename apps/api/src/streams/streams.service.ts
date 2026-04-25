import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { FfmpegService } from './ffmpeg/ffmpeg.service';
import { StatusService } from '../status/status.service';
import { AuditService } from '../audit/audit.service';
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
    // Phase 21 (D-07): direct AuditService.log call inside enqueueProfileRestart.
    // Optional so existing unit tests that don't construct an AuditService
    // (e.g. streams-service-push.test.ts) still build cleanly.
    @Optional() private readonly auditService?: AuditService,
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

  /**
   * Phase 21 D-01/D-02/D-03/D-04/D-07: profile-driven hot-reload restart.
   *
   * Two modes (selected by the optional `cameraId` arg):
   *   - Multi-camera (D-01): no `cameraId`. Finds every running,
   *     non-maintenance camera attached to `profileId` and fans out a
   *     restart for each. Used by StreamProfileService.update (Plan 02).
   *   - Single-camera (D-02): `cameraId` set. Targets exactly that one
   *     camera (still subject to the status + maintenance gate). Used by
   *     CamerasService.updateCamera when a profile reassign produces a
   *     fingerprint mismatch (Plan 03).
   *
   * Either way, writes a `camera.profile_hot_reload` audit row per
   * affected camera at enqueue time (so the audit survives any later
   * supersession via remove-then-add), then enqueues a stream-ffmpeg
   * job per camera with the canonical `camera:{id}:ffmpeg` jobId and
   * 0–30s jitter.
   *
   * Returns the count of affected cameras so the controller layer can
   * surface it as `affectedCameras` (D-01 toast input) or as
   * `restartTriggered: boolean` (D-02 single-camera reassign).
   *
   * Caller MUST have already committed the new profile row — fingerprints
   * are passed in by the caller, not recomputed here.
   *
   * Source: 21-RESEARCH.md §1 (jobId suffix), §2 (Phase 15 reuse), §7 Q5 (remove-then-add).
   */
  async enqueueProfileRestart(args: {
    profileId: string;
    oldFingerprint: string;
    newFingerprint: string;
    triggeredBy: { userId: string; userEmail: string } | { system: true };
    originPath: string;
    originMethod: string;
    // Plan 03 D-02: single-camera mode. When present, the where clause
    // targets exactly this cameraId instead of fanning out by profileId.
    cameraId?: string;
  }): Promise<{ affectedCameras: number }> {
    const where: any = args.cameraId
      ? {
          id: args.cameraId,
          status: { in: ['online', 'connecting', 'reconnecting', 'degraded'] },
          maintenanceMode: false,
        }
      : {
          streamProfileId: args.profileId,
          status: { in: ['online', 'connecting', 'reconnecting', 'degraded'] },
          maintenanceMode: false,
        };
    const cameras = await this.prisma.camera.findMany({
      where,
      select: {
        id: true,
        orgId: true,
        name: true,
        streamUrl: true,
        streamKey: true,
        ingestMode: true,
        needsTranscode: true,
      },
    });

    for (const cam of cameras) {
      // D-07: write audit row BEFORE queue.add so the row exists even if a
      // subsequent remove-then-add supersedes the job we are about to enqueue.
      if (this.auditService) {
        await this.auditService.log({
          orgId: cam.orgId,
          userId:
            'userId' in args.triggeredBy ? args.triggeredBy.userId : undefined,
          action: 'camera.profile_hot_reload',
          resource: 'camera',
          resourceId: cam.id,
          method: args.originMethod,
          path: args.originPath,
          details: {
            profileId: args.profileId,
            oldFingerprint: args.oldFingerprint,
            newFingerprint: args.newFingerprint,
            triggeredBy: args.triggeredBy,
          },
        });
      }

      // D-03 + Q5: remove-then-add (latest save wins). The literal jobId
      // pattern `camera:{id}:ffmpeg` is shared with startStream so the two
      // job names ('start' and 'restart') cannot coexist for one camera.
      const jobId = `camera:${cam.id}:ffmpeg`;
      const existingJob = await this.streamQueue.getJob(jobId);
      if (existingJob) {
        await existingJob.remove().catch(() => {});
      }

      // Fetch the up-to-date profile so the job carries fresh settings.
      // (StreamProcessor uses job.data.profile directly per stream.processor.ts:45.)
      // Plan 03 D-02: 'none-sentinel' marks the non-null → null reassignment
      // case where the camera now has no profile attached — skip the lookup
      // and fall through to the default {codec:'auto', audioCodec:'aac'} below.
      const profileRow =
        args.profileId === 'none-sentinel'
          ? null
          : await this.prisma.streamProfile.findUnique({
              where: { id: args.profileId },
            });
      const profile = profileRow
        ? {
            codec: profileRow.codec,
            preset: profileRow.preset,
            resolution: profileRow.resolution,
            fps: profileRow.fps,
            videoBitrate: profileRow.videoBitrate,
            audioCodec: profileRow.audioCodec,
            audioBitrate: profileRow.audioBitrate,
          }
        : { codec: 'auto' as const, audioCodec: 'aac' as const };

      const inputUrl =
        cam.ingestMode === 'push' && cam.streamKey
          ? `rtmp://127.0.0.1:1935/push/${cam.streamKey}`
          : (cam.streamUrl as string);

      await this.streamQueue.add(
        'restart',
        {
          cameraId: cam.id,
          orgId: cam.orgId,
          inputUrl,
          profile,
          needsTranscode: cam.needsTranscode,
        },
        {
          jobId,
          delay: Math.floor(Math.random() * 30_000),
          attempts: 20,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }

    return { affectedCameras: cameras.length };
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
