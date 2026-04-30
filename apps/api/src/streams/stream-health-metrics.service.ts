import { Injectable, Logger } from '@nestjs/common';

/**
 * Per-camera health record kept in memory. Tracks the recent operational
 * history we use to:
 *
 *   - detect crash loops (`recordExit` events within a short rolling window),
 *   - tune miss tolerance adaptively (`stableSince` resets on transition to
 *     online; resets again only after we've held that status for the dwell
 *     time configured in CameraHealthService),
 *   - calculate adaptive backoff for the BullMQ stream-ffmpeg queue
 *     (longer base delay for cameras that recently flapped).
 *
 * Records are never persisted — they reset on api restart, which is the
 * desired behaviour: a fresh process should not inherit a degraded judgment
 * from the previous process.
 */
interface CameraHealthRecord {
  exits: number[];
  fastExits: number[];
  transitions: { at: number; from: string; to: string }[];
  stableSince: number | null;
  consecutiveFastExits: number;
  customMissTolerance: number | null;
  degradedSince: number | null;
}

export interface StreamHealthSnapshot {
  transitionsPerMinute: number;
  suspectedCrashLoop: string[];
  topFlapping5min: { cameraId: string; flaps: number }[];
  stuckReconnectingOver5min: string[];
  degradedCameras: string[];
}

@Injectable()
export class StreamHealthMetricsService {
  private readonly logger = new Logger(StreamHealthMetricsService.name);

  private readonly records = new Map<string, CameraHealthRecord>();

  // Rolling windows.
  private readonly CRASH_WINDOW_MS = 10 * 60_000; // 10 min
  private readonly FAST_EXIT_THRESHOLD_MS = 10_000; // exit within 10s of start
  private readonly CRASH_LOOP_THRESHOLD = 5; // > 5 fast exits in 10 min
  private readonly FLAP_WINDOW_MS = 5 * 60_000; // 5 min
  private readonly STUCK_RECONNECTING_MS = 5 * 60_000; // 5 min
  private readonly STABLE_DWELL_MS = 5 * 60_000; // 5 min stable before tolerance resets

  // Per-camera adaptive tolerance bounds.
  private readonly DEFAULT_MISS_TOLERANCE = 2;
  private readonly MAX_MISS_TOLERANCE = 4;

  // FFmpeg-start timestamps so we can classify subsequent exits as
  // "fast" (likely crash loop signal) vs "long-lived" (one-off death).
  private readonly startTimes = new Map<string, number>();

  /**
   * Record FFmpeg start. Called by FfmpegService.startStream just before the
   * fluent-ffmpeg `'start'` callback fires.
   */
  recordStart(cameraId: string): void {
    this.startTimes.set(cameraId, Date.now());
  }

  /**
   * Record FFmpeg exit (graceful or otherwise). Classifies as fast-exit when
   * the process lived for less than FAST_EXIT_THRESHOLD_MS — that's the
   * signal that the underlying RTMP/RTSP/SRS layer rejected immediately
   * rather than a long-running stream finally dying.
   */
  recordExit(cameraId: string, intentional: boolean): void {
    const now = Date.now();
    const startedAt = this.startTimes.get(cameraId);
    this.startTimes.delete(cameraId);

    // Intentional stops (SIGTERM from gracefulRestart, profile change, manual
    // stop) MUST NOT count toward crash-loop detection — those are operator
    // actions, not process failures.
    if (intentional) return;

    const record = this.getOrCreateRecord(cameraId);
    record.exits.push(now);

    if (startedAt && now - startedAt < this.FAST_EXIT_THRESHOLD_MS) {
      record.fastExits.push(now);
      record.consecutiveFastExits += 1;
    } else {
      record.consecutiveFastExits = 0;
    }

    // Trim the rolling window to keep memory bounded.
    record.fastExits = record.fastExits.filter(
      (t) => now - t <= this.CRASH_WINDOW_MS,
    );
    record.exits = record.exits.filter(
      (t) => now - t <= this.CRASH_WINDOW_MS,
    );
  }

  /**
   * Record a status transition. Called by StatusService.transition.
   */
  recordTransition(cameraId: string, from: string, to: string): void {
    const record = this.getOrCreateRecord(cameraId);
    const now = Date.now();
    record.transitions.push({ at: now, from, to });
    record.transitions = record.transitions.filter(
      (t) => now - t.at <= this.FLAP_WINDOW_MS,
    );

    if (to === 'online') {
      record.stableSince = now;
    } else if (from === 'online') {
      // Camera left online — clear stable timestamp.
      record.stableSince = null;
    }

    // Auto-clear degraded marker the moment a real transition lands. Once a
    // human or external trigger pushes the camera back into 'online' or even
    // 'connecting', the auto-degrade cooldown should let the recovery loop
    // try again.
    if (to !== 'degraded' && record.degradedSince !== null) {
      record.degradedSince = null;
      record.consecutiveFastExits = 0;
    }
  }

  /**
   * Crash-loop check. Returns true when the camera has logged more than
   * CRASH_LOOP_THRESHOLD fast exits inside the rolling window.
   */
  isInCrashLoop(cameraId: string): boolean {
    const record = this.records.get(cameraId);
    if (!record) return false;
    return record.fastExits.length > this.CRASH_LOOP_THRESHOLD;
  }

  /**
   * Mark a camera as degraded so the stream-ffmpeg queue stops re-enqueuing
   * fresh attempts. Called when isInCrashLoop becomes true.
   */
  markDegraded(cameraId: string): void {
    const record = this.getOrCreateRecord(cameraId);
    if (record.degradedSince === null) {
      record.degradedSince = Date.now();
      this.logger.warn(
        `StreamHealth: camera ${cameraId} entered crash-loop — degraded (fastExits=${record.fastExits.length})`,
      );
    }
  }

  isDegraded(cameraId: string): boolean {
    const record = this.records.get(cameraId);
    return record?.degradedSince !== null && record?.degradedSince !== undefined;
  }

  /**
   * Adaptive miss tolerance — increases when the camera flaps quickly after
   * coming online, resets toward the default after the camera has been
   * stable for STABLE_DWELL_MS. Bounded by MAX_MISS_TOLERANCE so a truly
   * dead camera still gets caught, just two ticks later.
   */
  getMissTolerance(cameraId: string): number {
    const record = this.records.get(cameraId);
    if (!record) return this.DEFAULT_MISS_TOLERANCE;
    const now = Date.now();
    if (
      record.stableSince !== null &&
      now - record.stableSince >= this.STABLE_DWELL_MS
    ) {
      record.customMissTolerance = null;
      return this.DEFAULT_MISS_TOLERANCE;
    }
    return record.customMissTolerance ?? this.DEFAULT_MISS_TOLERANCE;
  }

  /**
   * Bump the camera's tolerance one step. Called by CameraHealthService
   * when a camera is killed within the STABLE_DWELL_MS window of last
   * coming online — that's the classic "tolerance was too tight" signal.
   */
  bumpMissTolerance(cameraId: string): void {
    const record = this.getOrCreateRecord(cameraId);
    const current = record.customMissTolerance ?? this.DEFAULT_MISS_TOLERANCE;
    if (current >= this.MAX_MISS_TOLERANCE) return;
    record.customMissTolerance = current + 1;
    this.logger.debug(
      `StreamHealth: bumped miss tolerance for ${cameraId} to ${record.customMissTolerance}`,
    );
  }

  /**
   * Adaptive base delay (in ms) for the BullMQ exponential backoff. Cameras
   * with a recent crash history get a larger floor so the system does not
   * pound them with retry storms.
   */
  getBackoffBaseMs(cameraId: string): number {
    const record = this.records.get(cameraId);
    if (!record) return 1_000;
    if (record.consecutiveFastExits >= 3) return 30_000;
    if (record.consecutiveFastExits >= 1) return 5_000;
    return 1_000;
  }

  /**
   * Snapshot for the metrics endpoint. Synchronous + cheap — meant to be
   * called per-request by SrsCallbackController.metrics.
   */
  snapshot(): StreamHealthSnapshot {
    const now = Date.now();
    const suspectedCrashLoop: string[] = [];
    const flapping: { cameraId: string; flaps: number }[] = [];
    const stuckReconnecting: string[] = [];
    const degraded: string[] = [];

    let totalTransitions = 0;

    for (const [cameraId, record] of this.records.entries()) {
      // Trim windows on read so the snapshot is always fresh.
      record.fastExits = record.fastExits.filter(
        (t) => now - t <= this.CRASH_WINDOW_MS,
      );
      record.transitions = record.transitions.filter(
        (t) => now - t.at <= this.FLAP_WINDOW_MS,
      );

      if (record.fastExits.length > this.CRASH_LOOP_THRESHOLD) {
        suspectedCrashLoop.push(cameraId);
      }
      if (record.degradedSince !== null) {
        degraded.push(cameraId);
      }

      const flaps = record.transitions.filter(
        (t) => t.from === 'online' && t.to === 'reconnecting',
      ).length;
      if (flaps > 0) {
        flapping.push({ cameraId, flaps });
      }

      // Stuck reconnecting heuristic — last transition into reconnecting
      // older than STUCK_RECONNECTING_MS and no transition out since.
      const lastIntoReconnecting = [...record.transitions]
        .reverse()
        .find((t) => t.to === 'reconnecting');
      const lastOut = [...record.transitions]
        .reverse()
        .find((t) => t.from === 'reconnecting');
      if (
        lastIntoReconnecting &&
        (!lastOut || lastOut.at < lastIntoReconnecting.at) &&
        now - lastIntoReconnecting.at > this.STUCK_RECONNECTING_MS
      ) {
        stuckReconnecting.push(cameraId);
      }

      totalTransitions += record.transitions.length;
    }

    flapping.sort((a, b) => b.flaps - a.flaps);

    return {
      transitionsPerMinute:
        Math.round((totalTransitions / 5) * 100) / 100, // 5-min window → /min
      suspectedCrashLoop,
      topFlapping5min: flapping.slice(0, 10),
      stuckReconnectingOver5min: stuckReconnecting,
      degradedCameras: degraded,
    };
  }

  /**
   * Test seam — clear all in-memory state. Production code never calls this.
   */
  resetForTest(): void {
    this.records.clear();
    this.startTimes.clear();
  }

  private getOrCreateRecord(cameraId: string): CameraHealthRecord {
    let record = this.records.get(cameraId);
    if (!record) {
      record = {
        exits: [],
        fastExits: [],
        transitions: [],
        stableSince: null,
        consecutiveFastExits: 0,
        customMissTolerance: null,
        degradedSince: null,
      };
      this.records.set(cameraId, record);
    }
    return record;
  }
}
