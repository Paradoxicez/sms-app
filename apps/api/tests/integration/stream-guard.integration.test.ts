import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { Queue, QueueEvents, Worker } from 'bullmq';
import Redis from 'ioredis';
import { StreamProcessor } from '../../src/streams/processors/stream.processor';
import { StreamGuardMetricsService } from '../../src/streams/stream-guard-metrics.service';

/**
 * Phase 23 DEBT-01 — REAL Redis + BullMQ integration test.
 *
 * Closes the silent stuck-camera bug open since 2026-04-21 (memory note
 * 260421-g9o). The stuck-camera repro is: BullMQ enqueues a stream job with
 * empty cameraId / inputUrl → StreamProcessor.process() refuses (returns
 * void without throwing) → metric counter increments → FFmpeg child process
 * is NEVER spawned → BullMQ marks the job complete → no retry storm.
 *
 * Why this test exists:
 *   Pure mocks did not catch the original bug because the BullMQ Queue +
 *   Worker boundary was mocked away. This file exercises the FULL real-Redis
 *   path so any regression to the guard surfaces in CI on machines with
 *   Redis running.
 *
 * Skip-on-no-Redis:
 *   `describe.skipIf(!isRedisAvailable)` is evaluated at module-load time.
 *   Synchronous TCP probe via bash builtin /dev/tcp returns true/false. When
 *   Redis is unreachable the suite reports "skipped" rather than "failed",
 *   matching the existing `profile-restart-active-job.integration.test.ts`
 *   idiom.
 */

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

function detectRedisSync(): boolean {
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

describe.skipIf(!isRedisAvailable)(
  'StreamGuard integration: empty job → no FFmpeg, metric incremented',
  () => {
    const QUEUE_NAME = `test-stream-guard-${Date.now()}`;
    let queue: Queue;
    let worker: Worker;
    let queueEvents: QueueEvents;
    let metrics: StreamGuardMetricsService;
    let ffmpegSpy: ReturnType<typeof vi.fn>;
    let redisConnections: Redis[] = [];

    function newRedis(): Redis {
      const r = new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        maxRetriesPerRequest: null,
      });
      redisConnections.push(r);
      return r;
    }

    beforeAll(async () => {
      metrics = new StreamGuardMetricsService();
      ffmpegSpy = vi.fn().mockResolvedValue(undefined);
      const ffmpegService = { startStream: ffmpegSpy } as any;
      const statusService = { transition: vi.fn().mockResolvedValue(undefined) } as any;
      const processor = new StreamProcessor(
        ffmpegService,
        statusService,
        undefined,
        undefined,
        metrics,
      );

      queue = new Queue(QUEUE_NAME, { connection: newRedis() });
      worker = new Worker(QUEUE_NAME, async (job) => processor.process(job as any), {
        connection: newRedis(),
        concurrency: 1,
      });
      queueEvents = new QueueEvents(QUEUE_NAME, { connection: newRedis() });

      await Promise.all([
        new Promise<void>((resolve) => {
          let settled = false;
          worker.once('ready', () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          });
          // Defensive: the 'ready' event may have fired before listener attached.
          setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve();
            }
          }, 1_000);
        }),
        queueEvents.waitUntilReady(),
      ]);
    }, 10_000);

    afterAll(async () => {
      await worker?.close().catch(() => {});
      await queueEvents?.close().catch(() => {});
      await queue?.obliterate({ force: true }).catch(() => {});
      await queue?.close().catch(() => {});
      for (const r of redisConnections) await r.quit().catch(() => {});
    });

    it('enqueues empty job → worker refuses → metric counter increments and FFmpeg never spawns', async () => {
      const before = metrics.snapshot();
      expect(before.refusals).toBe(0);

      const job = await queue.add('stream', {
        cameraId: undefined as any,
        orgId: 'test-org',
        inputUrl: '',
        profile: {},
        needsTranscode: false,
      });

      await job.waitUntilFinished(queueEvents, 10_000);

      const after = metrics.snapshot();
      expect(after.refusals).toBe(1);
      expect(after.byReason.undefined_cameraId).toBe(1);
      expect(after.byReason.empty_inputUrl).toBe(0);
      expect(after.lastRefusalReason).toBe('undefined_cameraId');
      expect(ffmpegSpy).not.toHaveBeenCalled();
    }, 15_000);
  },
);
