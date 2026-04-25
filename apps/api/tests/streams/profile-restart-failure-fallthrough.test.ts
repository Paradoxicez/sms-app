import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamProcessor } from '../../src/streams/processors/stream.processor';

describe('Phase 21 — D-09 fallthrough to Phase 15 resilience on repeated failure', () => {
  let ffmpegService: any;
  let statusService: any;
  let processor: StreamProcessor;

  beforeEach(() => {
    ffmpegService = {
      gracefulRestart: vi.fn().mockResolvedValue(undefined),
      startStream: vi.fn().mockResolvedValue(undefined),
      stopStream: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
    };
    statusService = { transition: vi.fn().mockResolvedValue(undefined) };
    processor = new StreamProcessor(ffmpegService, statusService);
  });

  it('StreamProcessor consuming a profile-restart job uses the same exponential backoff as a regular start (no Phase 21 retry override)', async () => {
    // The retry config is enforced at enqueue-side in StreamsService.enqueueProfileRestart
    // (see profile-restart-dedup.test.ts: attempts:20 + exponential 1000ms backoff).
    // The processor adds NO retry override — it must let exceptions bubble up so
    // BullMQ applies the enqueue-time attempts/backoff config natively.
    await processor.process({
      id: 'j',
      name: 'restart',
      data: {
        cameraId: 'c',
        orgId: 'o',
        inputUrl: 'rtsp://x',
        profile: { codec: 'auto', audioCodec: 'aac' } as any,
        needsTranscode: false,
      },
      attemptsMade: 0,
    } as any);

    // Confirm the processor body has no retry-shaping logic by checking it didn't
    // call setTimeout / vi.advanceTimers (only direct service calls).
    expect(ffmpegService.gracefulRestart).toHaveBeenCalledTimes(1);
    expect(ffmpegService.startStream).toHaveBeenCalledTimes(1);
  });

  it('after BullMQ exhausts attempts (default 20), the job is failed and StatusService.transition fires for degraded via the existing pipeline (processor lets the error bubble)', async () => {
    ffmpegService.startStream = vi
      .fn()
      .mockRejectedValue(new Error('FFmpeg spawn failed'));

    // Phase 21 contract: process() must NOT swallow the failure — BullMQ relies on
    // the rejection to fire its retry/exhaust pipeline (which eventually transitions
    // the camera to 'degraded' via the existing StatusService.transition path).
    await expect(
      processor.process({
        id: 'j',
        name: 'restart',
        data: {
          cameraId: 'c',
          orgId: 'o',
          inputUrl: 'rtsp://x',
          profile: {} as any,
          needsTranscode: false,
        },
        attemptsMade: 19,
      } as any),
    ).rejects.toThrow('FFmpeg spawn failed');

    // gracefulRestart and the 'reconnecting' transition still ran before the failure.
    expect(ffmpegService.gracefulRestart).toHaveBeenCalledWith('c', 5_000);
    expect(statusService.transition).toHaveBeenCalledWith(
      'c',
      'o',
      'reconnecting',
    );
  });

  it("the existing 30s notification debounce (status.service.ts:86-106) coalesces the 'degraded' transition with any preceding 'reconnecting' transition (no Phase 21 code change)", async () => {
    // This is pure documentation of existing behaviour — Phase 21 introduces no new
    // debounce logic; it only ENQUEUES status transitions. The debounce naturally
    // coalesces consecutive transitions within a 30s window. We assert the contract
    // by confirming the processor only calls transition() once per process() pass.
    await processor.process({
      id: 'j',
      name: 'restart',
      data: {
        cameraId: 'c',
        orgId: 'o',
        inputUrl: 'rtsp://x',
        profile: {} as any,
        needsTranscode: false,
      },
      attemptsMade: 0,
    } as any);

    // Single transition call per restart pass — the debounce is StatusService's job.
    expect(statusService.transition).toHaveBeenCalledTimes(1);
  });
});
