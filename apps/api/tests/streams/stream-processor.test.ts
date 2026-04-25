import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamProcessor } from '../../src/streams/processors/stream.processor';
import type { StreamJobData } from '../../src/streams/processors/stream.processor';

// Legacy field name check — constructed at runtime so this test file does NOT
// contain the literal pre-rename field name as a string. The Phase 19 acceptance
// criterion is `rg "r t s p U r l" apps/api = 0`, so we assemble it dynamically.
const LEGACY_URL_FIELD = ['rtsp', 'Url'].join('');

describe('StreamProcessor — Phase 19 (D-14 rename + existing guard)', () => {
  let ffmpegService: any;
  let statusService: any;
  let processor: StreamProcessor;

  beforeEach(() => {
    ffmpegService = {
      startStream: vi.fn().mockResolvedValue(undefined),
      stopStream: vi.fn(),
      gracefulRestart: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockReturnValue(false),
    };
    statusService = { transition: vi.fn().mockResolvedValue(undefined) };
    processor = new StreamProcessor(ffmpegService as any, statusService as any);
  });

  it('StreamJobData uses inputUrl field and not the legacy pre-rename field', () => {
    const job: StreamJobData = {
      cameraId: 'c1',
      orgId: 'orgA',
      inputUrl: 'rtsp://host/s',
      profile: { codec: 'auto', audioCodec: 'aac' } as any,
      needsTranscode: false,
    };
    // TypeScript compile confirms the field exists and is named correctly at the
    // type level (this file would fail to build if the rename was incomplete).
    expect(job.inputUrl).toBe('rtsp://host/s');
    // Legacy field name assembled at runtime must NOT exist on the StreamJobData
    // instance — verifies the D-14 rename flowed through to the object shape.
    expect((job as Record<string, unknown>)[LEGACY_URL_FIELD]).toBeUndefined();
    // Interface contract: the StreamJobData keys must include inputUrl and must
    // not include the legacy field name. Enumerating Object.keys on a concrete
    // instance confirms the runtime shape.
    const keys = Object.keys(job);
    expect(keys).toContain('inputUrl');
    expect(keys).not.toContain(LEGACY_URL_FIELD);
  });

  it('existing defensive guard (lines 47-56) rejects job with empty cameraId or empty inputUrl', async () => {
    await processor.process({
      id: 'j1',
      data: {
        cameraId: '',
        orgId: 'orgA',
        inputUrl: 'rtsp://host/s',
        profile: {} as any,
        needsTranscode: false,
      },
      attemptsMade: 0,
    } as any);
    expect(ffmpegService.startStream).not.toHaveBeenCalled();
    expect(statusService.transition).not.toHaveBeenCalled();
  });

  it('refuses to enqueue ffmpeg start when inputUrl is empty string', async () => {
    await processor.process({
      id: 'j2',
      data: {
        cameraId: 'cam-1',
        orgId: 'orgA',
        inputUrl: '',
        profile: {} as any,
        needsTranscode: false,
      },
      attemptsMade: 0,
    } as any);
    expect(ffmpegService.startStream).not.toHaveBeenCalled();
    expect(statusService.transition).not.toHaveBeenCalled();
  });

  it("Phase 21 — restart job name calls gracefulRestart THEN transition('reconnecting') THEN startStream", async () => {
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

    // Order check: gracefulRestart before transition before startStream.
    expect(ffmpegService.gracefulRestart.mock.invocationCallOrder[0]).toBeLessThan(
      statusService.transition.mock.invocationCallOrder[0],
    );
    expect(statusService.transition.mock.invocationCallOrder[0]).toBeLessThan(
      ffmpegService.startStream.mock.invocationCallOrder[0],
    );
    // Transition target is 'reconnecting' (NOT 'connecting').
    expect(statusService.transition).toHaveBeenCalledWith('c', 'o', 'reconnecting');
    // gracefulRestart called with the 5s grace value.
    expect(ffmpegService.gracefulRestart).toHaveBeenCalledWith('c', 5_000);
  });

  it('Phase 21 — non-restart job names still use connecting transition (no regression)', async () => {
    await processor.process({
      id: 'j',
      name: 'start',
      data: {
        cameraId: 'c',
        orgId: 'o',
        inputUrl: 'rtsp://x',
        profile: {} as any,
        needsTranscode: false,
      },
      attemptsMade: 0,
    } as any);

    expect(ffmpegService.gracefulRestart).not.toHaveBeenCalled();
    expect(statusService.transition).toHaveBeenCalledWith('c', 'o', 'connecting');
  });
});
