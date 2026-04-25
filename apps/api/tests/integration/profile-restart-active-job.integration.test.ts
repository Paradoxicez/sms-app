import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import Redis from 'ioredis';
import { StreamProcessor } from '../../src/streams/processors/stream.processor';

/**
 * Phase 21.1 D-14 / Mitigation 4 — REAL Redis integration test that
 * reproduces the BKR06 + SD640 + 11-PATCH scenario from
 * `21-VALIDATION.md § "Manual UAT — 2026-04-25" → "DEFECT"`.
 *
 * Why this test exists:
 *   Phase 21's unit tests all mocked the BullMQ queue and never exercised
 *   the active+locked job state, so the active-job collision (BKR06) was
 *   only discovered at manual UAT. Pure mocks are not enough — this file
 *   is the always-runnable regression target that pins the BKR06 reproducer.
 *
 * What it proves:
 *   - The processor's pub/sub subscriber is wired against real ioredis,
 *     not just an in-memory mock.
 *   - 11 sequential PATCH-equivalent publishes to camera:{id}:restart →
 *     11 gracefulRestart invocations against the same StreamProcessor
 *     instance with a never-resolving startStream (mimicking a live FFmpeg
 *     holding the BullMQ worker lock).
 *
 * Skip-on-no-Redis:
 *   `describe.skipIf(!isRedisAvailable)` is evaluated at module-load time
 *   (vitest collects describe blocks before running beforeAll), so we must
 *   detect Redis synchronously at file load. Use a tiny TCP probe via Node's
 *   `net` socket through execSync of a bash one-liner — no async I/O. When
 *   Redis is unreachable the suite reports "skipped" rather than "failed",
 *   preserving CI green and matching D-14's "belt-and-suspenders" role
 *   (the 3 unit-level test files in tests/streams/ provide the always-on
 *   logic regression coverage).
 */

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

function detectRedisSync(): boolean {
  // Synchronous TCP probe via bash builtin /dev/tcp. Cross-platform fallback:
  // catch any error → false (skip the suite). Timeout 1s.
  try {
    execSync(
      `bash -c 'exec 3<>/dev/tcp/${REDIS_HOST}/${REDIS_PORT} && exec 3<&- && exec 3>&-' 2>/dev/null`,
      { timeout: 1_000, stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

const isRedisAvailable = detectRedisSync();

let mainRedis: Redis | undefined;

beforeAll(async () => {
  if (!isRedisAvailable) return;
  mainRedis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  await mainRedis.connect();
  await mainRedis.ping();
});

afterAll(async () => {
  if (mainRedis) await mainRedis.quit().catch(() => {});
});

describe.skipIf(!isRedisAvailable)(
  'Phase 21.1 — real-Redis integration: active-job pub/sub end-to-end',
  () => {
    let processor: StreamProcessor;
    let processorRedis: Redis;
    let ffmpegService: any;
    let statusService: any;
    let systemPrisma: any;
    let processPromise: Promise<void> | undefined;
    const cameraId = 'integration-cam-1';
    const orgId = 'integration-org-1';
    const matchingProfile = {
      codec: 'libx264',
      preset: 'veryfast',
      resolution: '1920x1080',
      fps: 30,
      videoBitrate: '2000k',
      audioCodec: 'aac',
      audioBitrate: '128k',
    };

    beforeEach(async () => {
      ffmpegService = {
        // startStream returns a Promise that NEVER resolves — simulates a live
        // FFmpeg holding the BullMQ worker lock. The integration test asserts
        // that gracefulRestart fires anyway, via the pub/sub channel.
        startStream: vi.fn(() => new Promise<void>(() => {})),
        gracefulRestart: vi.fn().mockResolvedValue(undefined),
        isRunning: vi.fn().mockReturnValue(true),
        stopStream: vi.fn(),
      };
      statusService = { transition: vi.fn().mockResolvedValue(undefined) };
      systemPrisma = {
        camera: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: cameraId, streamProfile: matchingProfile }),
        },
      };

      // Use a SEPARATE main client for the processor (not the same as mainRedis)
      // so we can independently quit it in afterEach without affecting beforeAll.
      processorRedis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      });
      processor = new StreamProcessor(
        ffmpegService,
        statusService,
        processorRedis,
        systemPrisma,
      );

      // Run process() in the background — startStream hangs, simulating live FFmpeg.
      processPromise = processor.process({
        id: `integration-${cameraId}`,
        name: 'start',
        attemptsMade: 0,
        data: {
          cameraId,
          orgId,
          inputUrl: 'rtsp://test',
          profile: matchingProfile,
          needsTranscode: false,
        },
      } as any);

      // Wait for subscribe-ready (real-Redis round trip; 250ms is generous for localhost).
      await new Promise((r) => setTimeout(r, 250));
    });

    afterEach(async () => {
      if (processorRedis) await processorRedis.quit().catch(() => {});
      // processPromise is intentionally orphaned — startStream never resolves,
      // so it stays pending. afterAll's mainRedis.quit() and processorRedis.quit()
      // are sufficient to reap connections. Vitest's process exit handles the rest.
    });

    it('single PATCH: publish to camera:{id}:restart triggers gracefulRestart within 5s', async () => {
      const channel = `camera:${cameraId}:restart`;
      const payload = JSON.stringify({
        profile: { ...matchingProfile, videoBitrate: '2500k' },
        inputUrl: 'rtsp://test',
        needsTranscode: false,
        fingerprint: 'sha256:test',
      });

      const start = Date.now();
      const subscribers = await mainRedis!.publish(channel, payload);
      // Sanity check: at least 1 subscriber on this channel (the processor's
      // duplicate connection). If 0, the subscribe-ready wait was too short.
      expect(subscribers).toBeGreaterThanOrEqual(1);

      // Poll for gracefulRestart to be called (max 5s).
      const deadline = start + 5_000;
      while (Date.now() < deadline) {
        if (ffmpegService.gracefulRestart.mock.calls.length > 0) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(ffmpegService.gracefulRestart).toHaveBeenCalledWith(cameraId, 5_000);
      expect(Date.now() - start).toBeLessThan(5_000);
    });

    it(
      'BKR06 reproducer: 11 sequential PATCH-equivalents → 11 gracefulRestart calls (proves the active-job defect is closed)',
      async () => {
        const channel = `camera:${cameraId}:restart`;
        let invocationCount = 0;

        // Reset gracefulRestart so each invocation increments the count + delay
        // is short enough that Mitigation 3 dedup does not collapse iterations.
        ffmpegService.gracefulRestart = vi.fn(async () => {
          invocationCount++;
          // 50ms < 100ms loop iteration delay, so dedup releases between iterations.
          await new Promise((r) => setTimeout(r, 50));
        });

        for (let i = 0; i < 11; i++) {
          await mainRedis!.publish(
            channel,
            JSON.stringify({
              profile: { ...matchingProfile, videoBitrate: `${2000 + i * 100}k` },
              inputUrl: 'rtsp://test',
              needsTranscode: false,
              fingerprint: `sha256:iter-${i}`,
            }),
          );
          // 100ms wait between publishes — exceeds the 50ms gracefulRestart delay
          // so each publish lands when the previous has resolved (Set is empty
          // again). This faithfully reproduces the 11-PATCH UAT scenario.
          await new Promise((r) => setTimeout(r, 100));
        }

        // Final wait for any in-flight handler to finish.
        await new Promise((r) => setTimeout(r, 200));

        expect(invocationCount).toBe(11);
      },
      // Per-test timeout: 11 * 100ms loop + 200ms tail + 50ms graceful = ~1.5s
      // worst case; 15s is generous against localhost Redis hiccups.
      15_000,
    );
  },
);
