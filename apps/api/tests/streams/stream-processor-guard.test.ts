import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamProcessor } from '../../src/streams/processors/stream.processor';
import { StreamGuardMetricsService } from '../../src/streams/stream-guard-metrics.service';

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
          inputUrl: 'rtsp://x/s',
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
        inputUrl: 'rtsp://x/s',
        profile: {},
        needsTranscode: false,
      }),
    );
    expect(ffmpegService.startStream).not.toHaveBeenCalled();
    expect(statusService.transition).not.toHaveBeenCalled();
  });

  it('refuses job when inputUrl is undefined', async () => {
    await processor.process(
      makeJob({
        cameraId: 'cam-1',
        orgId: 'org-1',
        inputUrl: undefined,
        profile: {},
        needsTranscode: false,
      }),
    );
    expect(ffmpegService.startStream).not.toHaveBeenCalled();
    expect(statusService.transition).not.toHaveBeenCalled();
  });

  it('refuses job when inputUrl is empty string', async () => {
    await processor.process(
      makeJob({
        cameraId: 'cam-1',
        orgId: 'org-1',
        inputUrl: '',
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
        inputUrl: 'rtsp://1.2.3.4/stream',
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
          inputUrl: undefined,
          profile: {},
          needsTranscode: false,
        }),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('StreamProcessor guard — DEBT-01 metric instrumentation', () => {
  beforeEach(() => {
    delete process.env.SRS_HOST;
  });

  it('records refusal with reason "undefined_cameraId" when cameraId is undefined', async () => {
    const ffmpegService = { startStream: vi.fn().mockResolvedValue(undefined) } as any;
    const statusService = { transition: vi.fn().mockResolvedValue(undefined) } as any;
    const metrics = new StreamGuardMetricsService();
    const recordSpy = vi.spyOn(metrics, 'recordRefusal');
    const processor = new StreamProcessor(ffmpegService, statusService, undefined, undefined, metrics);
    const job = {
      id: 'job-1',
      attemptsMade: 0,
      data: {
        cameraId: undefined,
        orgId: 'org-1',
        inputUrl: 'rtsp://x',
        profile: {},
        needsTranscode: false,
      },
    } as any;
    await processor.process(job);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith('undefined_cameraId');
    expect(ffmpegService.startStream).not.toHaveBeenCalled();
    expect(metrics.snapshot().refusals).toBe(1);
    expect(metrics.snapshot().byReason.undefined_cameraId).toBe(1);
  });

  it('records refusal with reason "empty_inputUrl" when inputUrl is empty string', async () => {
    const ffmpegService = { startStream: vi.fn().mockResolvedValue(undefined) } as any;
    const statusService = { transition: vi.fn().mockResolvedValue(undefined) } as any;
    const metrics = new StreamGuardMetricsService();
    const recordSpy = vi.spyOn(metrics, 'recordRefusal');
    const processor = new StreamProcessor(ffmpegService, statusService, undefined, undefined, metrics);
    const job = {
      id: 'job-2',
      attemptsMade: 0,
      data: {
        cameraId: 'cam-1',
        orgId: 'org-1',
        inputUrl: '',
        profile: {},
        needsTranscode: false,
      },
    } as any;
    await processor.process(job);
    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith('empty_inputUrl');
    expect(ffmpegService.startStream).not.toHaveBeenCalled();
    expect(metrics.snapshot().byReason.empty_inputUrl).toBe(1);
  });

  it('does not throw when metrics service is not injected (4-arg construction)', async () => {
    const ffmpegService = { startStream: vi.fn().mockResolvedValue(undefined) } as any;
    const statusService = { transition: vi.fn().mockResolvedValue(undefined) } as any;
    // Pre-DEBT-01 4-arg positional pattern; streamGuardMetrics is undefined.
    const processor = new StreamProcessor(ffmpegService, statusService, undefined, undefined);
    const job = {
      id: 'job-3',
      attemptsMade: 0,
      data: {
        cameraId: undefined,
        orgId: 'org-1',
        inputUrl: '',
        profile: {},
        needsTranscode: false,
      },
    } as any;
    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(ffmpegService.startStream).not.toHaveBeenCalled();
  });
});
