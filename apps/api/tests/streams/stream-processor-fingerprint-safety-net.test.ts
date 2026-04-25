import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import { StreamProcessor } from '../../src/streams/processors/stream.processor';

/**
 * Phase 21.1 Plan 02 Mitigation 2 — pin the fingerprint safety net.
 *
 * The signal channel has a fundamental loss window: a PATCH that arrives
 * between OLD-worker-death and NEW-worker-subscribe is published with no
 * subscriber and silently dropped. Mitigation 2 closes this window:
 *   - Once subscribe is ready, read the camera's current StreamProfile via
 *     SystemPrismaService and compute its fingerprint.
 *   - Compare with the fingerprint of the profile captured at job start.
 *   - On mismatch → call gracefulRestart so the next BullMQ retry sees the
 *     fresh profile data.
 *
 * Coverage:
 *   1. DB profile differs from job profile → gracefulRestart fires
 *   2. DB profile matches job profile → safety net does NOT fire
 *   3. Camera not found in DB → safety net no-op (no exception)
 *   4. systemPrisma not injected → safety net path skipped entirely
 *      (positional construction backwards compat)
 */

describe('Phase 21.1 — Plan 02 Mitigation 2 fingerprint safety net', () => {
  let ffmpegService: any;
  let statusService: any;
  let systemPrisma: any;
  let redis: any;
  let processor: StreamProcessor;

  const matchingProfile = {
    codec: 'libx264',
    preset: 'veryfast',
    resolution: '1920x1080',
    fps: 30,
    videoBitrate: '2000k',
    audioCodec: 'aac',
    audioBitrate: '128k',
  };
  const driftedProfile = { ...matchingProfile, videoBitrate: '2500k' };

  beforeEach(() => {
    ffmpegService = {
      // Resolve immediately so process() returns and we can inspect the
      // safety net's effects deterministically.
      startStream: vi.fn().mockResolvedValue(undefined),
      gracefulRestart: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockReturnValue(true),
      stopStream: vi.fn(),
    };
    statusService = { transition: vi.fn().mockResolvedValue(undefined) };
    systemPrisma = { camera: { findUnique: vi.fn() } };
    redis = new RedisMock();
    processor = new StreamProcessor(ffmpegService, statusService, redis, systemPrisma);
  });

  afterEach(async () => {
    await redis.quit().catch(() => {});
  });

  const buildJob = (profile: any, name = 'start') => ({
    id: 'j1',
    name,
    attemptsMade: 0,
    data: {
      cameraId: 'cam-1',
      orgId: 'org-1',
      inputUrl: 'rtsp://a',
      profile,
      needsTranscode: false,
    },
  });

  it('DB profile differs from job profile → gracefulRestart fires from safety net', async () => {
    systemPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam-1',
      streamProfile: driftedProfile,
    });

    await processor.process(buildJob(matchingProfile) as any);

    // Allow the fire-and-forget safety net continuation to run.
    await new Promise((r) => setTimeout(r, 50));

    expect(ffmpegService.gracefulRestart).toHaveBeenCalled();
    expect(ffmpegService.gracefulRestart).toHaveBeenCalledWith('cam-1', 5_000);
  });

  it('DB profile matches job profile → safety net does NOT fire (no false-positive restart)', async () => {
    systemPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam-1',
      streamProfile: matchingProfile,
    });

    // Use job.name = 'start' so the Phase 21 'restart' branch's gracefulRestart
    // call (which would also trigger gracefulRestart) does not pollute the
    // assertion. Only the safety net could call gracefulRestart in this path.
    await processor.process(buildJob(matchingProfile, 'start') as any);

    await new Promise((r) => setTimeout(r, 50));

    expect(ffmpegService.gracefulRestart).not.toHaveBeenCalled();
  });

  it('camera not found in DB → safety net no-op (no exception, no gracefulRestart)', async () => {
    systemPrisma.camera.findUnique.mockResolvedValue(null);

    await expect(
      processor.process(buildJob(matchingProfile, 'start') as any),
    ).resolves.not.toThrow();

    await new Promise((r) => setTimeout(r, 50));

    expect(ffmpegService.gracefulRestart).not.toHaveBeenCalled();
  });

  it('systemPrisma undefined → safety net is skipped, normal spawn proceeds', async () => {
    const procWithoutPrisma = new StreamProcessor(
      ffmpegService,
      statusService,
      redis,
      undefined,
    );

    await procWithoutPrisma.process(buildJob(matchingProfile, 'start') as any);

    expect(ffmpegService.startStream).toHaveBeenCalled();
    expect(ffmpegService.gracefulRestart).not.toHaveBeenCalled();
    // Verify systemPrisma.camera.findUnique was NEVER called (since we passed undefined)
    expect(systemPrisma.camera.findUnique).not.toHaveBeenCalled();
  });

  it('camera with NULL streamProfile in DB → safety net compares against sha256:none', async () => {
    // When the DB returns a camera with streamProfile=null and the job's
    // profile is a real one, the fingerprint comparison sees mismatch
    // (sha256:none vs sha256:<hex>) → gracefulRestart fires.
    systemPrisma.camera.findUnique.mockResolvedValue({
      id: 'cam-1',
      streamProfile: null,
    });

    await processor.process(buildJob(matchingProfile, 'start') as any);

    await new Promise((r) => setTimeout(r, 50));

    expect(ffmpegService.gracefulRestart).toHaveBeenCalledWith('cam-1', 5_000);
  });
});
