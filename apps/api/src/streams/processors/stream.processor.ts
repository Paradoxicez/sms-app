import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import Redis from 'ioredis';
import { FfmpegService } from '../ffmpeg/ffmpeg.service';
import { StreamProfile } from '../ffmpeg/ffmpeg-command.builder';
import { StatusService } from '../../status/status.service';
import { REDIS_CLIENT } from '../../api-keys/api-keys.service';
import { SystemPrismaService } from '../../prisma/system-prisma.service';
import { SrsApiService } from '../../srs/srs-api.service';
import { fingerprintProfile } from '../profile-fingerprint.util';
import { StreamGuardMetricsService } from '../stream-guard-metrics.service';
import { StreamHealthMetricsService } from '../stream-health-metrics.service';

export const MAX_BACKOFF_MS = 300_000; // 5 minutes
const BASE_BACKOFF_MS = 1_000; // 1 second

/**
 * Cap on BullMQ attempts for stream-ffmpeg jobs. Lowered from 20 to 8 after
 * the 2026-04-30 production incident where FFmpegs killed mid-publish (by the
 * pre-fix CameraHealthService false-positive) left BKR02/05/06 stuck in
 * delayed state with `delay = 1000 * 2^11 ≈ 34 min` between retries. Each
 * exponential delay is `1000 * 2^(attempts-1)` so the new cap is `2^7 = 128s`
 * with cumulative max ~255s before BullMQ removes the job. CameraHealthService
 * Hard-reset re-enqueues fresh on its next 60s tick, so total worst-case
 * recovery time is ~5 min instead of >30 min.
 */
export const MAX_STREAM_ATTEMPTS = 8;

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

  // Phase 21.1 Mitigation 3: dedup concurrent restart signals for the same
  // camera. The signal handler is a no-op if the cameraId is already in the
  // set; adds on entry, removes after gracefulRestart resolves.
  private restartingCameras = new Set<string>();

  constructor(
    private readonly ffmpegService: FfmpegService,
    private readonly statusService: StatusService,
    // Phase 21.1: Redis subscriber + Prisma read for D-12 active-job signal
    // path. Optional so existing test files (stream-processor.test.ts,
    // stream-processor-guard.test.ts) that construct positionally with only
    // (ffmpeg, status) still build. When undefined, the subscriber wiring is
    // skipped and the processor reverts to its Phase 21 behavior — correct
    // for those existing tests which do not exercise the active-job path.
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional() private readonly systemPrisma?: SystemPrismaService,
    // Phase 23 DEBT-01: optional metrics injection. Existing test files
    // (stream-processor.test.ts, stream-processor-guard.test.ts) construct
    // positionally with 2-4 args — keeping this @Optional() preserves their
    // build per CLAUDE.md memory `verify_subagent_writes`.
    @Optional() private readonly streamGuardMetrics?: StreamGuardMetricsService,
    // 2026-04-30: SrsApiService for pre-flight kick of stale publishers in
    // the SRS source registry. Mitigates the StreamBusy (1028) cascade where
    // a previous FFmpeg crashed unclean (SIGKILL, OOM, network blip) and
    // SRS retains a phantom source that rejects new publishes. Optional to
    // preserve positional-construction tests.
    @Optional() private readonly srsApi?: SrsApiService,
    // 2026-04-30 self-healing trio (A): consult crash-loop verdict before
    // each spawn so we stop hammering a chronically-failing camera. The
    // service tracks recent fast-exits per camera; once threshold is
    // crossed, isDegraded() returns true and we skip the spawn entirely.
    @Optional() private readonly healthMetrics?: StreamHealthMetricsService,
  ) {
    super();
  }

  async process(job: Job<StreamJobData>): Promise<void> {
    // Phase 21.1: destructure as `let` for `inputUrl` and `profile` so the
    // signal handler + fingerprint safety net (below) can replace them with
    // fresh values before the spawn call.
    const { cameraId, orgId, needsTranscode } = job.data;
    let { inputUrl, profile } = job.data;

    // Defensive guard: BullMQ has been observed enqueuing jobs with empty data
    // (see memory note 260421 — race between BootRecoveryService/CameraHealthService
    // + jobId dedup). Refuse such jobs at the choke point: log and return without
    // throwing so the job is marked complete and does NOT retry into a storm.
    if (!cameraId || !inputUrl) {
      // Phase 23 DEBT-01: record refusal BEFORE the existing log/return so the
      // metric is in lockstep with the existing observability. The reason
      // discriminator is `!cameraId` first (undefined or empty cameraId is the
      // primary stuck-camera repro per memory note 260421-g9o); a non-empty
      // cameraId with empty inputUrl falls through to 'empty_inputUrl'.
      const reason: 'undefined_cameraId' | 'empty_inputUrl' =
        !cameraId ? 'undefined_cameraId' : 'empty_inputUrl';
      this.streamGuardMetrics?.recordRefusal(reason);
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

    // 2026-04-30 self-healing trio (A) — crash-loop circuit breaker. The
    // health metrics service raises isDegraded once a camera has logged
    // > CRASH_LOOP_THRESHOLD fast-exits inside the rolling window. While
    // degraded we refuse new spawn attempts so the system is not pinned
    // in a retry storm against a camera with bad RTSP/codec/auth.
    // Operator clears the degraded flag by transitioning the camera back
    // to 'connecting' (manual config edit) or by api restart.
    if (this.healthMetrics?.isDegraded(cameraId)) {
      this.logger.warn(
        `Skipping FFmpeg spawn for camera ${cameraId} — in degraded state (crash-loop)`,
      );
      // Best-effort transition so the UI reflects the degraded verdict.
      // Existing notify pipeline fires camera.degraded webhook — fulfills
      // task E with no extra wiring.
      await this.statusService
        .transition(cameraId, orgId, 'degraded')
        .catch(() => {});
      return;
    }

    const streamKey = `live/${orgId}/${cameraId}`;
    const srsHost = process.env.SRS_HOST || 'localhost';
    const outputUrl = `rtmp://${srsHost}:1935/${streamKey}`;

    // Phase 21.1 D-12: subscribe to per-camera restart channel so an active+locked
    // worker can be told to gracefulRestart by the publisher in StreamsService.
    // Skipped when this.redis is undefined (positional-construction tests).
    let subscriber: Redis | undefined;
    if (this.redis) {
      subscriber = this.redis.duplicate();
      const channel = `camera:${cameraId}:restart`;

      subscriber.on('message', async (_chan: string, message: string) => {
        // Mitigation 3: dedup concurrent signals — no-op if a restart is
        // already in flight for this camera.
        if (this.restartingCameras.has(cameraId)) {
          this.logger.debug(
            `Restart signal for ${cameraId} ignored — already restarting`,
          );
          return;
        }
        this.restartingCameras.add(cameraId);
        try {
          // Update local profile/inputUrl from the signal payload so the
          // post-retry spawn (when this attempt's startStream rejects from
          // the kill and BullMQ retries) sees fresh values via the safety
          // net's job.data short-circuit. Best-effort parse — payload errors
          // fall back to the safety-net Prisma read on the retry.
          try {
            const payload = JSON.parse(message) as {
              profile?: typeof profile;
              inputUrl?: string;
            };
            if (payload.profile) profile = payload.profile;
            if (payload.inputUrl) inputUrl = payload.inputUrl;
          } catch (err) {
            this.logger.warn(
              `Restart signal payload parse failed for ${cameraId}: ${(err as Error).message}`,
            );
          }
          this.logger.log(
            `Restart signal received for ${cameraId} — calling gracefulRestart`,
          );
          await this.ffmpegService.gracefulRestart(cameraId, 5_000);
        } finally {
          this.restartingCameras.delete(cameraId);
        }
      });

      // Mitigation 2: fingerprint safety net — once the subscription is
      // established, read the current profile from Prisma and compare its
      // fingerprint with the job's profile fingerprint. If they differ, a
      // PATCH landed during the worker death+retry window (signal lost
      // because no one was listening), so call gracefulRestart now to
      // pick up the new profile on the next retry.
      await new Promise<void>((resolve) => {
        subscriber!.subscribe(channel, (err) => {
          if (err) {
            this.logger.warn(
              `Restart subscribe failed for ${cameraId}: ${err.message} — continuing without signal channel`,
            );
            resolve();
            return;
          }
          // Fire-and-forget the safety net so subscribe-ready does not
          // block the spawn path. Errors are logged, not thrown.
          void this.runFingerprintSafetyNet(cameraId, profile)
            .then(resolve)
            .catch((sErr) => {
              this.logger.warn(
                `Fingerprint safety net failed for ${cameraId}: ${(sErr as Error).message}`,
              );
              resolve();
            });
        });
      });
    }

    try {
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

      // 2026-04-30 defensive pre-flight: kick any stale publisher for this
      // stream path before spawning FFmpeg. Mitigates the StreamBusy (1028)
      // cascade discovered during the camera-flap incident — when a previous
      // FFmpeg dies unclean (SIGKILL, container restart, network reset),
      // SRS may retain a phantom client/source registration that rejects
      // every subsequent publish with "Stream already exists or busy".
      // findPublisherClientId returns null when no stale entry exists, so
      // this is a no-op on the happy path. We only kick fmle-publish/publish/
      // rtmp-publish types so we never disturb a real concurrent viewer.
      if (this.srsApi) {
        try {
          const streamPath = `live/${orgId}/${cameraId}`;
          const stalePublisherId =
            await this.srsApi.findPublisherClientId(streamPath);
          if (stalePublisherId) {
            this.logger.warn(
              `Pre-flight kick: stale publisher ${stalePublisherId} for ${cameraId} — kicking before spawn`,
            );
            await this.srsApi.kickPublisher(stalePublisherId);
            // Brief pause so SRS finishes source teardown before our publish.
            // 500ms is empirically enough for ST coroutine cleanup; tested
            // against the StreamBusy repro on stream.magichouse.in.th.
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (err) {
          this.logger.warn(
            `Pre-flight kick failed for ${cameraId}: ${(err as Error).message} — proceeding to spawn anyway`,
          );
        }
      }

      try {
        await this.ffmpegService.startStream(cameraId, inputUrl, outputUrl, profile, needsTranscode);
      } catch (spawnErr) {
        // 2026-04-30 self-healing trio (A + C):
        //
        //  (A) After every startStream rejection, ask the health metrics
        //      service whether this exit pushed the camera over the crash-
        //      loop threshold. If yes, mark degraded + transition status
        //      to 'degraded'. The existing notify pipeline fires the
        //      camera.degraded webhook automatically (task E).
        //
        //  (C) Phantom-source cleanup: regardless of crash-loop verdict,
        //      try to kick any client that SRS still has registered for
        //      our stream path. A clean SIGTERM normally produces an
        //      on_unpublish callback that frees the source, but SIGKILL
        //      (OOM) and abrupt network failures can leave a phantom
        //      that rejects the next publish with StreamBusy 1028.
        //      findPublisherClientId returns null when the source is
        //      already clean, so this is a no-op on the happy path.
        if (this.healthMetrics?.isInCrashLoop(cameraId)) {
          this.healthMetrics.markDegraded(cameraId);
          await this.statusService
            .transition(cameraId, orgId, 'degraded')
            .catch(() => {});
        }
        if (this.srsApi) {
          try {
            const streamPath = `live/${orgId}/${cameraId}`;
            const stalePublisherId =
              await this.srsApi.findPublisherClientId(streamPath);
            if (stalePublisherId) {
              this.logger.warn(
                `Post-exit cleanup: kicking stale publisher ${stalePublisherId} for ${cameraId}`,
              );
              await this.srsApi.kickPublisher(stalePublisherId);
            }
          } catch (cleanupErr) {
            this.logger.warn(
              `Post-exit cleanup failed for ${cameraId}: ${(cleanupErr as Error).message}`,
            );
          }
        }
        throw spawnErr;
      }
    } finally {
      // Mitigation 1: lifecycle cleanup. Even if startStream rejects (FFmpeg
      // died from the signal-driven gracefulRestart), the subscriber must be
      // reaped so a long-running API process does not accumulate connections.
      if (subscriber) {
        await subscriber.unsubscribe().catch(() => {});
        await subscriber.quit().catch(() => {});
      }
    }
  }

  /**
   * Phase 21.1 Mitigation 2: fingerprint safety net.
   *
   * Called once per process() invocation, after the subscription is ready.
   * Reads the camera's current StreamProfile from Prisma, computes the
   * fingerprint over the 7 FFmpeg-affecting fields, and compares with the
   * fingerprint of the profile the worker captured at job start. If they
   * differ, a PATCH landed during the worker death+retry window — so call
   * gracefulRestart immediately to get the new profile on the next retry.
   *
   * Skipped when systemPrisma is undefined (positional-construction tests).
   * Errors are caught by the caller — never throws.
   */
  private async runFingerprintSafetyNet(
    cameraId: string,
    jobProfile: StreamProfile,
  ): Promise<void> {
    if (!this.systemPrisma) return;

    const camera = await this.systemPrisma.camera.findUnique({
      where: { id: cameraId },
      include: { streamProfile: true },
    });
    if (!camera) return;

    const dbProfileInput = camera.streamProfile
      ? {
          codec: camera.streamProfile.codec,
          preset: camera.streamProfile.preset,
          resolution: camera.streamProfile.resolution,
          fps: camera.streamProfile.fps,
          videoBitrate: camera.streamProfile.videoBitrate,
          audioCodec: camera.streamProfile.audioCodec,
          audioBitrate: camera.streamProfile.audioBitrate,
        }
      : null;

    const dbFingerprint = fingerprintProfile(dbProfileInput);
    const jobFingerprint = fingerprintProfile(jobProfile as any);

    if (dbFingerprint !== jobFingerprint) {
      this.logger.warn(
        `Fingerprint mismatch for ${cameraId}: job=${jobFingerprint.slice(0, 16)}... db=${dbFingerprint.slice(0, 16)}... — calling gracefulRestart`,
      );
      if (!this.restartingCameras.has(cameraId)) {
        this.restartingCameras.add(cameraId);
        try {
          await this.ffmpegService.gracefulRestart(cameraId, 5_000);
        } finally {
          this.restartingCameras.delete(cameraId);
        }
      }
    }
  }
}
