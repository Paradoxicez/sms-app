import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import { StreamProcessor } from '../../src/streams/processors/stream.processor';

/**
 * Phase 21.1 D-12 Plan 02 — pin StreamProcessor's restart-signal subscriber
 * path + Mitigation 3 dedup.
 *
 * Coverage:
 *   1. signal on camera:{id}:restart triggers gracefulRestart(cameraId, 5000)
 *   2. Mitigation 3: two rapid signals while gracefulRestart is mid-flight →
 *      only ONE call (the second is dedup'd by the in-flight Set)
 *   3. After in-flight restart resolves, a third signal re-arms (Set is
 *      cleared in the finally block)
 *   4. Mitigation 1: subscriber lifecycle — quit/unsubscribe fire when
 *      process() returns, even on the success path
 *
 * Uses ioredis-mock so pub/sub is in-memory; .duplicate() on a RedisMock
 * instance returns a connected sibling that receives publish events.
 */

describe('Phase 21.1 — StreamProcessor restart-signal subscriber + Mitigation 3 dedup', () => {
  let ffmpegService: any;
  let statusService: any;
  let systemPrisma: any;
  let redis: any;
  let processor: StreamProcessor;
  let processPromise: Promise<void> | undefined;

  beforeEach(() => {
    ffmpegService = {
      // startStream returns a Promise that NEVER resolves — simulates a live
      // FFmpeg holding the BullMQ worker lock. process() will hang here so
      // the subscriber is alive when we publish.
      startStream: vi.fn(() => new Promise<void>(() => {})),
      gracefulRestart: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockReturnValue(true),
      stopStream: vi.fn(),
    };
    statusService = { transition: vi.fn().mockResolvedValue(undefined) };
    // Match safety net's expected DB profile so mismatch path is NOT
    // triggered by accident. Tests that want the safety-net firing should
    // override systemPrisma.camera.findUnique in their body.
    const matchingProfile = {
      codec: 'libx264',
      preset: 'veryfast',
      resolution: '1920x1080',
      fps: 30,
      videoBitrate: '2000k',
      audioCodec: 'aac',
      audioBitrate: '128k',
    };
    systemPrisma = {
      camera: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cam-1',
          streamProfile: matchingProfile,
        }),
      },
    };
    redis = new RedisMock();
    processor = new StreamProcessor(ffmpegService, statusService, redis, systemPrisma);
  });

  afterEach(async () => {
    await redis.quit().catch(() => {});
  });

  const buildJob = (overrides: any = {}) => ({
    id: 'j1',
    name: 'start',
    attemptsMade: 0,
    data: {
      cameraId: 'cam-1',
      orgId: 'org-1',
      inputUrl: 'rtsp://a',
      profile: {
        codec: 'libx264',
        preset: 'veryfast',
        resolution: '1920x1080',
        fps: 30,
        videoBitrate: '2000k',
        audioCodec: 'aac',
        audioBitrate: '128k',
      },
      needsTranscode: false,
    },
    ...overrides,
  });

  it('signal on camera:cam-1:restart triggers gracefulRestart("cam-1", 5000) once', async () => {
    // Run process() in the background — it will hang on ffmpegService.startStream
    processPromise = processor.process(buildJob() as any);

    // Wait for subscribe to register (RedisMock is fast; 50ms is generous).
    await new Promise((r) => setTimeout(r, 50));

    await redis.publish(
      'camera:cam-1:restart',
      JSON.stringify({
        profile: { videoBitrate: '2500k' },
        inputUrl: 'rtsp://a',
        needsTranscode: false,
        fingerprint: 'sha256:new',
      }),
    );

    // Wait for handler to run.
    await new Promise((r) => setTimeout(r, 50));

    expect(ffmpegService.gracefulRestart).toHaveBeenCalledTimes(1);
    expect(ffmpegService.gracefulRestart).toHaveBeenCalledWith('cam-1', 5_000);
  });

  it('Mitigation 3: two rapid signals while gracefulRestart is mid-flight → only ONE call', async () => {
    let resolveGraceful: (() => void) | null = null;
    ffmpegService.gracefulRestart = vi.fn(
      () => new Promise<void>((r) => {
        resolveGraceful = r;
      }),
    );

    processPromise = processor.process(buildJob() as any);

    await new Promise((r) => setTimeout(r, 50));

    // First signal — gracefulRestart starts, restartingCameras.add('cam-1')
    await redis.publish('camera:cam-1:restart', JSON.stringify({ profile: {} }));
    // Allow the message handler to enter gracefulRestart
    await new Promise((r) => setTimeout(r, 20));
    // Second signal — Mitigation 3: restartingCameras.has('cam-1') === true → no-op
    await redis.publish('camera:cam-1:restart', JSON.stringify({ profile: {} }));
    await new Promise((r) => setTimeout(r, 50));

    expect(ffmpegService.gracefulRestart).toHaveBeenCalledTimes(1);

    // Now resolve the in-flight restart and confirm a third signal re-arms
    expect(resolveGraceful).not.toBeNull();
    resolveGraceful!();
    await new Promise((r) => setTimeout(r, 30));

    await redis.publish('camera:cam-1:restart', JSON.stringify({ profile: {} }));
    await new Promise((r) => setTimeout(r, 50));

    expect(ffmpegService.gracefulRestart).toHaveBeenCalledTimes(2);
  });

  it('subscriber.unsubscribe and subscriber.quit fire when process() resolves (Mitigation 1)', async () => {
    // Spy on .duplicate() so we can capture the subscriber instance and
    // assert its lifecycle methods are invoked.
    const origDuplicate = redis.duplicate.bind(redis);
    let capturedSub: any = null;
    const unsubSpy = vi.fn();
    const quitSpy = vi.fn();
    redis.duplicate = () => {
      const sub = origDuplicate();
      const origUnsubscribe = sub.unsubscribe.bind(sub);
      const origQuit = sub.quit.bind(sub);
      sub.unsubscribe = (...args: any[]) => {
        unsubSpy(...args);
        return origUnsubscribe(...args);
      };
      sub.quit = (...args: any[]) => {
        quitSpy(...args);
        return origQuit(...args);
      };
      capturedSub = sub;
      return sub;
    };

    // Make startStream resolve immediately so process() returns and the
    // finally block runs.
    ffmpegService.startStream = vi.fn().mockResolvedValue(undefined);

    await processor.process(buildJob() as any);

    expect(capturedSub).not.toBeNull();
    expect(unsubSpy).toHaveBeenCalledTimes(1);
    expect(quitSpy).toHaveBeenCalledTimes(1);
    // Order: unsubscribe before quit (per finally-block ordering)
    expect(unsubSpy.mock.invocationCallOrder[0]).toBeLessThan(
      quitSpy.mock.invocationCallOrder[0],
    );
  });

  it('subscriber.unsubscribe and subscriber.quit still fire when startStream rejects', async () => {
    const origDuplicate = redis.duplicate.bind(redis);
    const unsubSpy = vi.fn();
    const quitSpy = vi.fn();
    redis.duplicate = () => {
      const sub = origDuplicate();
      const origUnsubscribe = sub.unsubscribe.bind(sub);
      const origQuit = sub.quit.bind(sub);
      sub.unsubscribe = (...args: any[]) => {
        unsubSpy(...args);
        return origUnsubscribe(...args);
      };
      sub.quit = (...args: any[]) => {
        quitSpy(...args);
        return origQuit(...args);
      };
      return sub;
    };

    // Reject startStream — exercises the finally cleanup on error path.
    ffmpegService.startStream = vi.fn().mockRejectedValue(new Error('FFmpeg died'));

    await expect(processor.process(buildJob() as any)).rejects.toThrow('FFmpeg died');

    expect(unsubSpy).toHaveBeenCalledTimes(1);
    expect(quitSpy).toHaveBeenCalledTimes(1);
  });

  it('signal on a different camera channel does NOT trigger gracefulRestart for cam-1', async () => {
    processPromise = processor.process(buildJob() as any);

    await new Promise((r) => setTimeout(r, 50));

    // Publish on a different camera's channel — should be ignored by cam-1's subscriber.
    await redis.publish('camera:cam-2:restart', JSON.stringify({ profile: {} }));
    await new Promise((r) => setTimeout(r, 50));

    expect(ffmpegService.gracefulRestart).not.toHaveBeenCalled();
  });
});
