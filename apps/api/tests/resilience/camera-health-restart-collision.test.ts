import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CameraHealthService } from '../../src/resilience/camera-health.service';

describe('Phase 21 — B-1 CameraHealthService.enqueueStart collision guard', () => {
  let streamQueue: any;
  let service: CameraHealthService;

  const makeCamera = (overrides: any = {}) => ({
    id: 'cam-1',
    orgId: 'org-1',
    name: 'A',
    streamUrl: 'rtsp://x',
    streamKey: null,
    ingestMode: 'pull',
    needsTranscode: false,
    ...overrides,
  });

  beforeEach(() => {
    streamQueue = {
      getJob: vi.fn(),
      add: vi.fn().mockResolvedValue({ id: 'j-new' }),
    };
    // Construct with positional args; only streamQueue is exercised by enqueueStart.
    service = new CameraHealthService(
      {} as any, // prisma (SystemPrismaService)
      {} as any, // srsApi
      {} as any, // ffmpeg
      {} as any, // statusService
      {} as any, // srsRestartDetector
      {} as any, // healthQueue
      streamQueue, // streamQueue (the only one we exercise)
    );
  });

  it("skips enqueue when in-flight job has name='restart' (preserves Phase 21 SIGTERM branch)", async () => {
    streamQueue.getJob.mockResolvedValue({ id: 'j1', name: 'restart' });

    await (service as any).enqueueStart(makeCamera({ id: 'cam-1' }));

    expect(streamQueue.getJob).toHaveBeenCalledWith('camera:cam-1:ffmpeg');
    expect(streamQueue.add).not.toHaveBeenCalled();
  });

  it("proceeds with enqueue when in-flight job has name='start' (normal recovery path)", async () => {
    streamQueue.getJob.mockResolvedValue({ id: 'j2', name: 'start' });

    await (service as any).enqueueStart(makeCamera({ id: 'cam-2' }));

    expect(streamQueue.add).toHaveBeenCalledTimes(1);
    expect(streamQueue.add).toHaveBeenCalledWith(
      'start',
      expect.anything(),
      expect.objectContaining({ jobId: 'camera:cam-2:ffmpeg' }),
    );
  });

  it('proceeds with enqueue when no in-flight job exists', async () => {
    streamQueue.getJob.mockResolvedValue(null);

    await (service as any).enqueueStart(makeCamera({ id: 'cam-3' }));

    expect(streamQueue.add).toHaveBeenCalledTimes(1);
    expect(streamQueue.add).toHaveBeenCalledWith(
      'start',
      expect.anything(),
      expect.objectContaining({ jobId: 'camera:cam-3:ffmpeg' }),
    );
  });

  it("B-1 contract: an in-flight 'restart' job is NEVER replaced by a 'start' job from a health tick", async () => {
    // Strong assertion — this is the core regression-guard for B-1.
    // If a future refactor accidentally drops the getJob lookup, this test fires.
    streamQueue.getJob.mockResolvedValue({
      id: 'j-restart-in-flight',
      name: 'restart',
    });

    await (service as any).enqueueStart(makeCamera({ id: 'cam-X' }));

    // Confirm: NO add call (would be the silent demotion).
    expect(streamQueue.add).not.toHaveBeenCalled();
    // The restart job stays in-flight. Next tick (60s later) will re-evaluate;
    // by then the restart job will have completed (success or failure) and
    // getJob will return null, allowing the normal recovery path to run.
  });
});
