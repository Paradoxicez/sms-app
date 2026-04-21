import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamProcessor } from '../../src/streams/processors/stream.processor';

describe('StreamProcessor guard (defensive)', () => {
  let ffmpegService: any;
  let statusService: any;
  let processor: StreamProcessor;

  beforeEach(() => {
    // Ensure the happy-path URL assertion is deterministic regardless of host env.
    delete process.env.SRS_HOST;
    ffmpegService = { startStream: vi.fn().mockResolvedValue(undefined) };
    statusService = { transition: vi.fn().mockResolvedValue(undefined) };
    processor = new StreamProcessor(ffmpegService, statusService);
  });

  const makeJob = (data: any, id = 'job-1') =>
    ({
      id,
      data,
      attemptsMade: 0,
    }) as any;

  it('refuses job when cameraId is undefined (no throw, no side effects)', async () => {
    await expect(
      processor.process(
        makeJob({
          cameraId: undefined,
          orgId: 'org-1',
          rtspUrl: 'rtsp://x/s',
          profile: {},
          needsTranscode: false,
        }),
      ),
    ).resolves.toBeUndefined();
    expect(ffmpegService.startStream).not.toHaveBeenCalled();
    expect(statusService.transition).not.toHaveBeenCalled();
  });

  it('refuses job when cameraId is empty string', async () => {
    await processor.process(
      makeJob({
        cameraId: '',
        orgId: 'org-1',
        rtspUrl: 'rtsp://x/s',
        profile: {},
        needsTranscode: false,
      }),
    );
    expect(ffmpegService.startStream).not.toHaveBeenCalled();
    expect(statusService.transition).not.toHaveBeenCalled();
  });

  it('refuses job when rtspUrl is undefined', async () => {
    await processor.process(
      makeJob({
        cameraId: 'cam-1',
        orgId: 'org-1',
        rtspUrl: undefined,
        profile: {},
        needsTranscode: false,
      }),
    );
    expect(ffmpegService.startStream).not.toHaveBeenCalled();
    expect(statusService.transition).not.toHaveBeenCalled();
  });

  it('refuses job when rtspUrl is empty string', async () => {
    await processor.process(
      makeJob({
        cameraId: 'cam-1',
        orgId: 'org-1',
        rtspUrl: '',
        profile: {},
        needsTranscode: false,
      }),
    );
    expect(ffmpegService.startStream).not.toHaveBeenCalled();
    expect(statusService.transition).not.toHaveBeenCalled();
  });

  it('processes a valid job normally (guard is non-invasive)', async () => {
    const profile = { codec: 'auto' as const, audioCodec: 'aac' as const };
    await processor.process(
      makeJob({
        cameraId: 'cam-1',
        orgId: 'org-1',
        rtspUrl: 'rtsp://1.2.3.4/stream',
        profile,
        needsTranscode: false,
      }),
    );
    expect(statusService.transition).toHaveBeenCalledWith('cam-1', 'org-1', 'connecting');
    expect(ffmpegService.startStream).toHaveBeenCalledWith(
      'cam-1',
      'rtsp://1.2.3.4/stream',
      'rtmp://localhost:1935/live/org-1/cam-1',
      profile,
      false,
    );
  });

  it('guard path does not throw (so BullMQ marks job complete, no retry)', async () => {
    await expect(
      processor.process(
        makeJob({
          cameraId: undefined,
          orgId: 'org-1',
          rtspUrl: undefined,
          profile: {},
          needsTranscode: false,
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
