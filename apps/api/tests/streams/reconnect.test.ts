import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fluent-ffmpeg
vi.mock('fluent-ffmpeg', () => ({
  default: vi.fn(() => ({
    inputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    outputFormat: vi.fn().mockReturnThis(),
    videoCodec: vi.fn().mockReturnThis(),
    audioCodec: vi.fn().mockReturnThis(),
    addOutputOptions: vi.fn().mockReturnThis(),
    videoBitrate: vi.fn().mockReturnThis(),
    size: vi.fn().mockReturnThis(),
    fps: vi.fn().mockReturnThis(),
    audioBitrate: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    run: vi.fn(),
    kill: vi.fn(),
  })),
}));

import { calculateBackoff, MAX_BACKOFF_MS } from '../../src/streams/processors/stream.processor';

describe('Reconnect Backoff', () => {
  it('should calculate 1s for attempt 1', () => {
    expect(calculateBackoff(1)).toBe(1000);
  });

  it('should calculate 2s for attempt 2', () => {
    expect(calculateBackoff(2)).toBe(2000);
  });

  it('should calculate 4s for attempt 3', () => {
    expect(calculateBackoff(3)).toBe(4000);
  });

  it('should calculate 8s for attempt 4', () => {
    expect(calculateBackoff(4)).toBe(8000);
  });

  it('should cap at 300s (5min) for high attempts', () => {
    // 2^9 * 1000 = 512000 > 300000
    expect(calculateBackoff(10)).toBe(300000);
  });

  it('should export MAX_BACKOFF_MS as 300000', () => {
    expect(MAX_BACKOFF_MS).toBe(300000);
  });

  it('should determine if max retries exhausted when backoff exceeds max', () => {
    // attempt 9: 2^8 * 1000 = 256000 < 300000 -> not exhausted
    expect(calculateBackoff(9)).toBe(256000);
    // attempt 10: 2^9 * 1000 = 512000 -> capped to 300000
    expect(calculateBackoff(10)).toBe(300000);
  });
});

describe('StreamProcessor', () => {
  it('should spawn FFmpeg via FfmpegService on process', async () => {
    // Import dynamically to avoid constructor issues
    const { StreamProcessor } = await import(
      '../../src/streams/processors/stream.processor'
    );

    const mockFfmpegService = {
      startStream: vi.fn().mockResolvedValue(undefined),
      stopStream: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
    };

    const mockStatusService = {
      transition: vi.fn().mockResolvedValue(undefined),
    };

    const processor = new StreamProcessor(mockFfmpegService as any, mockStatusService as any);

    const mockJob = {
      data: {
        cameraId: 'cam-1',
        orgId: 'org-1',
        rtspUrl: 'rtsp://192.168.1.100/stream',
        profile: { codec: 'copy', audioCodec: 'aac' },
        needsTranscode: false,
      },
      attemptsMade: 0,
    };

    await processor.process(mockJob as any);

    expect(mockStatusService.transition).toHaveBeenCalledWith('cam-1', 'org-1', 'connecting');
    expect(mockFfmpegService.startStream).toHaveBeenCalledWith(
      'cam-1',
      'rtsp://192.168.1.100/stream',
      'rtmp://srs:1935/live/org-1/cam-1',
      { codec: 'copy', audioCodec: 'aac' },
      false,
    );
  });
});
