import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { SrsApiService } from '../srs/srs-api.service';
import { FfmpegService } from '../streams/ffmpeg/ffmpeg.service';
import { StatusService } from '../status/status.service';
import { SrsRestartDetector } from './srs-restart-detector';
import { buildStreamJobData } from './job-data.helper';
import { MAX_STREAM_ATTEMPTS } from '../streams/processors/stream.processor';
import { StreamHealthMetricsService } from '../streams/stream-health-metrics.service';

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

  // Cached SRS stream IDs to tolerate transient `getStreams()` failures.
  // Production smoke (2026-04-30) found SRS HTTP API drops connections
  // (`client disconnect peer. ret=1007`) under concurrent probe load — when
  // that happens, getStreams() throws → catch returns {streams: []} → every
  // camera looks dead → SIGTERM cascade → 12-min flap loop.
  // Strategy: keep the last successful stream-id snapshot, and only mark a
  // camera srsAlive=false after MISS_TOLERANCE consecutive ticks where SRS
  // also reports the stream missing. A single tick miss is tolerated.
  private srsStreamIdsCache: Set<string> = new Set();
  private srsCacheUpdatedAt = 0;
  private readonly missCounters = new Map<string, number>();
  private readonly MISS_TOLERANCE = 2;
  private readonly CACHE_STALE_MS = 5 * 60_000;

  // 2026-04-30 self-healing trio (G): periodic SRS rpc=reload counter.
  // Tick fires every 60s, so 30 ticks ≈ 30 min between reloads. The reload
  // is a SIGHUP equivalent — refreshes vhost/forward/callback config WITHOUT
  // disrupting active streams. Treats as a preventive cleanup of any cached
  // state SRS retained from previous publish lifecycles.
  private tickCount = 0;
  private readonly RELOAD_EVERY_N_TICKS = 30;

  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly srsApi: SrsApiService,
    private readonly ffmpeg: FfmpegService,
    private readonly statusService: StatusService,
    private readonly srsRestartDetector: SrsRestartDetector,
    @InjectQueue('camera-health') private readonly healthQueue: Queue,
    @InjectQueue('stream-ffmpeg') private readonly streamQueue: Queue,
    // 2026-04-30 self-healing trio (B): adaptive miss tolerance + degraded
    // camera skip. Optional so this module is safe to construct in tests
    // that do not wire the @Global() StreamHealthModule.
    @Optional()
    private readonly healthMetrics?: StreamHealthMetricsService,
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
    this.tickCount += 1;

    // 2026-04-30 self-healing trio (G): preventive SRS reload every
    // RELOAD_EVERY_N_TICKS ticks (30 min). Refreshes SRS vhost config
    // and clears any stale cache entries from previous publish lifecycles.
    // Safe — SRS does not disrupt active publishers/players on rpc=reload.
    if (this.tickCount % this.RELOAD_EVERY_N_TICKS === 0) {
      try {
        await this.srsApi.reloadConfig();
        this.logger.log(
          `CameraHealthService: preventive SRS reload (tick #${this.tickCount})`,
        );
      } catch (err) {
        this.logger.warn(
          `CameraHealthService: preventive SRS reload failed — ${(err as Error).message}`,
        );
      }
    }

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
    // Use last-known-good cache when getStreams() fails or returns empty under
    // load, so a transient SRS HTTP hiccup does not kill every healthy FFmpeg.
    let srsCallFailed = false;
    const srsStreamsResult = await this.srsApi.getStreams().catch((err) => {
      this.logger.warn(
        `CameraHealthService: getStreams failed — ${(err as Error).message} — falling back to cached stream set`,
      );
      srsCallFailed = true;
      return null;
    });
    let srsStreamIds: Set<string>;
    if (
      srsCallFailed ||
      !srsStreamsResult ||
      !Array.isArray(srsStreamsResult.streams)
    ) {
      // SRS API call failed — reuse cache if it is fresh enough.
      const cacheAge = Date.now() - this.srsCacheUpdatedAt;
      if (this.srsCacheUpdatedAt > 0 && cacheAge < this.CACHE_STALE_MS) {
        this.logger.debug(
          `CameraHealthService: using cached SRS stream set (age=${Math.round(cacheAge / 1000)}s, size=${this.srsStreamIdsCache.size})`,
        );
        srsStreamIds = this.srsStreamIdsCache;
      } else {
        // No usable cache — skip the dead-detection step entirely this tick.
        // Better to leak one missed kill than to nuke every working FFmpeg.
        this.logger.warn(
          'CameraHealthService: no fresh SRS cache available — skipping liveness pass this tick',
        );
        this.logger.debug('CameraHealthService: tick end (skipped)');
        return;
      }
    } else {
      srsStreamIds = new Set<string>(
        (srsStreamsResult.streams as Array<{ name: string }>).map(
          (s) => s.name,
        ),
      );
      // Refresh cache only on successful response with non-empty streams,
      // OR on a successful response whose emptiness is consistent with a
      // recent cache. (Empty-but-correct vs empty-due-to-bug is hard to
      // distinguish on a single tick — the miss-counter below handles it.)
      this.srsStreamIdsCache = srsStreamIds;
      this.srsCacheUpdatedAt = Date.now();
    }

    // Step 4 — detect dead streams + recover.
    for (const camera of cameras) {
      // 2026-04-30 self-healing trio (A): a camera that the StreamProcessor
      // has marked degraded (crash-loop) must NOT be re-enqueued. The
      // operator clears the degraded flag by transitioning the camera back
      // to 'connecting' (manual config edit) or by api restart.
      if (this.healthMetrics?.isDegraded(camera.id)) {
        this.logger.debug(
          `CameraHealthService: skipping degraded camera ${camera.id} (crash-loop active)`,
        );
        continue;
      }

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

      // 2026-04-30 self-healing trio (B): adaptive miss tolerance per
      // camera. Cameras that flap quickly after coming online get a
      // bumped tolerance so the SRS HTTP race does not chew through a
      // fresh online → reconnecting transition before the system
      // settles. The bump is bounded (MAX 4) so a truly dead camera is
      // still detected, just two ticks later.
      const tolerance =
        this.healthMetrics?.getMissTolerance(camera.id) ?? this.MISS_TOLERANCE;
      if (srsAlive) {
        this.missCounters.delete(camera.id);
      } else {
        const misses = (this.missCounters.get(camera.id) ?? 0) + 1;
        this.missCounters.set(camera.id, misses);
        if (!isPushPassthrough && ffmpegAlive && misses < tolerance) {
          this.logger.debug(
            `CameraHealthService: tolerating srs-miss for ${camera.id} (${misses}/${tolerance}) — ffmpeg still running`,
          );
          continue;
        }
      }

      const dead = isPushPassthrough ? !srsAlive : !ffmpegAlive || !srsAlive;

      if (!dead) continue;

      // 2026-04-30 self-healing trio (B): if we are about to kill a
      // camera that JUST came online, bump its tolerance so the next
      // cycle gives the SRS publish more grace. This is the classic
      // "tolerance was too tight" signal — the camera was healthy
      // moments ago and is being killed by a probe race.
      if (camera.status === 'online') {
        this.healthMetrics?.bumpMissTolerance(camera.id);
      }

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
    if (existing) {
      if (existing.name === 'restart') {
        this.logger.debug(
          `CameraHealthService: skipping enqueue for ${camera.id} — in-flight 'restart' job ${existing.id} preserved (will retry next tick)`,
        );
        return;
      }
      // 2026-04-30 hard-reset: BullMQ exponential backoff can stall a job
      // for tens of minutes between retries (atm=12 → ~34 min delay). When
      // the underlying RTMP issue (e.g. SRS phantom source from a killed
      // FFmpeg) has resolved, we want the next health tick to retry —
      // but BullMQ `add()` with the same jobId is a no-op when the existing
      // job is in the delayed/waiting set. Detect "stuck" by attemptsMade
      // ≥ STUCK_ATTEMPTS_THRESHOLD and remove the stale job so the fresh
      // add below produces a brand-new attempt cycle.
      const STUCK_ATTEMPTS_THRESHOLD = 3;
      const attemptsMade = (existing as any).attemptsMade ?? 0;
      if (attemptsMade >= STUCK_ATTEMPTS_THRESHOLD) {
        this.logger.warn(
          `CameraHealthService: removing stuck job for ${camera.id} (attemptsMade=${attemptsMade}) — re-enqueueing fresh`,
        );
        await existing.remove().catch((err) => {
          this.logger.warn(
            `CameraHealthService: failed to remove stuck job for ${camera.id}: ${(err as Error).message}`,
          );
        });
      }
    }

    // 2026-04-30 self-healing trio (F): adaptive backoff base. Cameras
    // with a recent crash history get a larger floor so retries do not
    // hammer them. Healthy cameras keep the original 1s start-of-curve
    // for fast recovery from transient errors.
    const backoffDelay =
      this.healthMetrics?.getBackoffBaseMs(camera.id) ?? 1_000;

    await this.streamQueue.add(
      'start',
      buildStreamJobData(camera),
      {
        jobId,
        attempts: MAX_STREAM_ATTEMPTS,
        backoff: { type: 'exponential', delay: backoffDelay },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    this.logger.log(
      `CameraHealthService: enqueued recovery for ${camera.id} (backoffBase=${backoffDelay}ms)`,
    );
  }
}
