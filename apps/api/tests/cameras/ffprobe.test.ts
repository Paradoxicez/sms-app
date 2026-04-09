import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FfprobeService } from '../../src/cameras/ffprobe.service';

// Mock child_process.exec
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'child_process';

const mockExec = exec as unknown as ReturnType<typeof vi.fn>;

function mockExecResult(stdout: string) {
  mockExec.mockImplementation((_cmd: string, _opts: any, callback?: any) => {
    // promisify calls exec with (cmd, opts) and returns a promise
    // We need to handle the promisify pattern
    if (callback) {
      callback(null, { stdout, stderr: '' });
    }
    return { stdout, stderr: '' };
  });
}

function mockExecWithPromisify(stdout: string) {
  mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
    if (typeof cb === 'function') {
      cb(null, { stdout, stderr: '' });
    } else if (typeof opts === 'function') {
      opts(null, { stdout, stderr: '' });
    }
  });
}

function mockExecError(message: string) {
  mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
    const error = new Error(message);
    if (typeof cb === 'function') {
      cb(error, { stdout: '', stderr: message });
    } else if (typeof opts === 'function') {
      opts(error, { stdout: '', stderr: message });
    }
  });
}

const h264FfprobeOutput = JSON.stringify({
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264',
      width: 1920,
      height: 1080,
      r_frame_rate: '30/1',
    },
    {
      codec_type: 'audio',
      codec_name: 'aac',
    },
  ],
});

const h265FfprobeOutput = JSON.stringify({
  streams: [
    {
      codec_type: 'video',
      codec_name: 'hevc',
      width: 2560,
      height: 1440,
      r_frame_rate: '25/1',
    },
    {
      codec_type: 'audio',
      codec_name: 'aac',
    },
  ],
});

const noVideoOutput = JSON.stringify({
  streams: [
    {
      codec_type: 'audio',
      codec_name: 'aac',
    },
  ],
});

describe('FfprobeService', () => {
  let service: FfprobeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FfprobeService();
  });

  it('should probe H.264 camera and return correct info with needsTranscode=false', async () => {
    mockExecWithPromisify(h264FfprobeOutput);

    const result = await service.probeCamera('rtsp://192.168.1.100/stream');

    expect(result.codec).toBe('h264');
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.fps).toBe(30);
    expect(result.audioCodec).toBe('aac');
    expect(result.needsTranscode).toBe(false);
  });

  it('should detect H.265/HEVC and set needsTranscode=true', async () => {
    mockExecWithPromisify(h265FfprobeOutput);

    const result = await service.probeCamera('rtsp://192.168.1.200/stream');

    expect(result.codec).toBe('hevc');
    expect(result.width).toBe(2560);
    expect(result.height).toBe(1440);
    expect(result.fps).toBe(25);
    expect(result.needsTranscode).toBe(true);
  });

  it('should throw error when no video stream found', async () => {
    mockExecWithPromisify(noVideoOutput);

    await expect(
      service.probeCamera('rtsp://192.168.1.100/audio-only'),
    ).rejects.toThrow('No video stream found');
  });

  it('should throw error for unreachable camera', async () => {
    mockExecError('Connection refused');

    await expect(
      service.probeCamera('rtsp://10.0.0.1/unreachable'),
    ).rejects.toThrow();
  });

  it('should use 15 second timeout in exec options', async () => {
    mockExecWithPromisify(h264FfprobeOutput);

    await service.probeCamera('rtsp://192.168.1.100/stream');

    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeout: 15000 }),
      expect.any(Function),
    );
  });

  it('should redact credentials from RTSP URLs', () => {
    const redacted = (service as any).redactUrl(
      'rtsp://admin:secret123@192.168.1.100:554/stream',
    );
    expect(redacted).not.toContain('admin');
    expect(redacted).not.toContain('secret123');
    expect(redacted).toContain('***');
    expect(redacted).toContain('192.168.1.100');
  });

  it('should handle URLs without credentials gracefully', () => {
    const redacted = (service as any).redactUrl('rtsp://192.168.1.100/stream');
    expect(redacted).toContain('192.168.1.100');
    expect(redacted).not.toContain('***');
  });

  it('should handle audio-only stream with none audioCodec', async () => {
    const videoOnlyOutput = JSON.stringify({
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          width: 1280,
          height: 720,
          r_frame_rate: '15/1',
        },
      ],
    });
    mockExecWithPromisify(videoOnlyOutput);

    const result = await service.probeCamera('rtsp://192.168.1.100/stream');

    expect(result.audioCodec).toBe('none');
    expect(result.fps).toBe(15);
  });
});
