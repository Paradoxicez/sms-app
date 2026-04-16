import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fluent-ffmpeg before imports
const mockFfmpegInstance = {
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
};

vi.mock('fluent-ffmpeg', () => ({
  default: vi.fn(() => ({ ...mockFfmpegInstance })),
}));

import {
  buildFfmpegCommand,
  StreamProfile,
} from '../../src/streams/ffmpeg/ffmpeg-command.builder';
import { FfmpegService } from '../../src/streams/ffmpeg/ffmpeg.service';

describe('FFmpeg Command Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should build passthrough command with -c:v copy', () => {
    const profile: StreamProfile = {
      codec: 'copy',
      audioCodec: 'aac',
    };

    const cmd = buildFfmpegCommand(
      'rtsp://192.168.1.100/stream',
      'rtmp://srs:1935/live/org-1/cam-1',
      profile,
      false,
    );

    expect(cmd.inputOptions).toHaveBeenCalledWith(['-rtsp_transport', 'tcp']);
    expect(cmd.output).toHaveBeenCalledWith('rtmp://srs:1935/live/org-1/cam-1');
    expect(cmd.outputFormat).toHaveBeenCalledWith('flv');
    expect(cmd.videoCodec).toHaveBeenCalledWith('copy');
    expect(cmd.audioCodec).toHaveBeenCalledWith('aac');
  });

  it('should build transcode command with -c:v libx264', () => {
    const profile: StreamProfile = {
      codec: 'libx264',
      preset: 'veryfast',
      resolution: '1920x1080',
      fps: 30,
      videoBitrate: '2000k',
      audioCodec: 'aac',
      audioBitrate: '128k',
    };

    const cmd = buildFfmpegCommand(
      'rtsp://192.168.1.100/stream',
      'rtmp://srs:1935/live/org-1/cam-1',
      profile,
      true,
    );

    expect(cmd.videoCodec).toHaveBeenCalledWith('libx264');
    expect(cmd.addOutputOptions).toHaveBeenCalledWith(['-preset', 'veryfast']);
    expect(cmd.videoBitrate).toHaveBeenCalledWith('2000k');
    expect(cmd.size).toHaveBeenCalledWith('1920x1080');
    expect(cmd.fps).toHaveBeenCalledWith(30);
    expect(cmd.audioBitrate).toHaveBeenCalledWith('128k');
    expect(cmd.addOutputOptions).toHaveBeenCalledWith(['-g', '60']);
    expect(cmd.addOutputOptions).toHaveBeenCalledWith(['-tune', 'zerolatency']);
  });

  it('should use default fps=15 for GOP size when fps not specified', () => {
    const profile: StreamProfile = {
      codec: 'libx264',
      audioCodec: 'aac',
    };

    const cmd = buildFfmpegCommand(
      'rtsp://192.168.1.100/stream',
      'rtmp://srs:1935/live/org-1/cam-1',
      profile,
      true,
    );

    expect(cmd.addOutputOptions).toHaveBeenCalledWith(['-g', '30']);
    expect(cmd.addOutputOptions).toHaveBeenCalledWith(['-tune', 'zerolatency']);
  });

  it('should use libx264 when needsTranscode=true and codec=auto', () => {
    const profile: StreamProfile = {
      codec: 'auto',
      audioCodec: 'aac',
    };

    const cmd = buildFfmpegCommand(
      'rtsp://192.168.1.100/stream',
      'rtmp://srs:1935/live/org-1/cam-1',
      profile,
      true,
    );

    expect(cmd.videoCodec).toHaveBeenCalledWith('libx264');
  });

  it('should use copy when needsTranscode=false and codec=auto', () => {
    const profile: StreamProfile = {
      codec: 'auto',
      audioCodec: 'aac',
    };

    const cmd = buildFfmpegCommand(
      'rtsp://192.168.1.100/stream',
      'rtmp://srs:1935/live/org-1/cam-1',
      profile,
      false,
    );

    expect(cmd.videoCodec).toHaveBeenCalledWith('copy');
  });
});

describe('FfmpegService', () => {
  let service: FfmpegService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FfmpegService();
  });

  it('should start a stream and store it in runningProcesses', async () => {
    const profile: StreamProfile = {
      codec: 'copy',
      audioCodec: 'aac',
    };

    // Mock the on/run to simulate start event
    const startPromise = service.startStream(
      'cam-1',
      'rtsp://192.168.1.100/stream',
      'rtmp://srs:1935/live/org-1/cam-1',
      profile,
      false,
    );

    expect(service.isRunning('cam-1')).toBe(true);

    // Simulate the 'end' event to resolve the promise
    service.simulateEnd('cam-1');
    await startPromise;

    expect(service.isRunning('cam-1')).toBe(false);
  });

  it('should stop a stream by killing the process', () => {
    const profile: StreamProfile = {
      codec: 'copy',
      audioCodec: 'aac',
    };

    // Start without awaiting (simulate running state)
    service.startStream(
      'cam-1',
      'rtsp://192.168.1.100/stream',
      'rtmp://srs:1935/live/org-1/cam-1',
      profile,
      false,
    );

    expect(service.isRunning('cam-1')).toBe(true);
    service.stopStream('cam-1');
    expect(service.isRunning('cam-1')).toBe(false);
  });

  it('should return false for isRunning when camera not started', () => {
    expect(service.isRunning('nonexistent')).toBe(false);
  });
});
