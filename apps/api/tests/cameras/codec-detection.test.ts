import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FfprobeService } from '../../src/cameras/ffprobe.service';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'child_process';

const mockExec = exec as unknown as ReturnType<typeof vi.fn>;

function mockExecWithPromisify(stdout: string) {
  mockExec.mockImplementation((cmd: string, opts: any, cb: any) => {
    if (typeof cb === 'function') {
      cb(null, { stdout, stderr: '' });
    } else if (typeof opts === 'function') {
      opts(null, { stdout, stderr: '' });
    }
  });
}

describe('Codec Detection (H.265 auto-detection)', () => {
  let service: FfprobeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FfprobeService();
  });

  it('should detect h264 as NOT needing transcode', async () => {
    mockExecWithPromisify(
      JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1' },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
      }),
    );

    const result = await service.probeCamera('rtsp://1.1.1.1/stream');
    expect(result.needsTranscode).toBe(false);
    expect(result.codec).toBe('h264');
  });

  it('should detect hevc as needing transcode', async () => {
    mockExecWithPromisify(
      JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'hevc', width: 3840, height: 2160, r_frame_rate: '30/1' },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
      }),
    );

    const result = await service.probeCamera('rtsp://1.1.1.1/stream');
    expect(result.needsTranscode).toBe(true);
    expect(result.codec).toBe('hevc');
  });

  it('should detect h265 (alternate name) as needing transcode', async () => {
    mockExecWithPromisify(
      JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'h265', width: 1920, height: 1080, r_frame_rate: '25/1' },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
      }),
    );

    const result = await service.probeCamera('rtsp://1.1.1.1/stream');
    expect(result.needsTranscode).toBe(true);
  });

  it('should handle fractional frame rates correctly', async () => {
    mockExecWithPromisify(
      JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30000/1001' },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
      }),
    );

    const result = await service.probeCamera('rtsp://1.1.1.1/stream');
    expect(result.fps).toBe(30); // 30000/1001 ≈ 29.97, rounded to 30
  });

  it('should handle missing frame rate with default 30', async () => {
    mockExecWithPromisify(
      JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 640, height: 480 },
          { codec_type: 'audio', codec_name: 'pcm_alaw' },
        ],
      }),
    );

    const result = await service.probeCamera('rtsp://1.1.1.1/stream');
    expect(result.fps).toBe(30);
    expect(result.audioCodec).toBe('pcm_alaw');
  });

  it('should not log credentials from RTSP URL', async () => {
    const logSpy = vi.spyOn((service as any).logger, 'log');

    mockExecWithPromisify(
      JSON.stringify({
        streams: [
          { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1' },
        ],
      }),
    );

    await service.probeCamera('rtsp://admin:P@ssw0rd@192.168.1.100:554/stream');

    const logCalls = logSpy.mock.calls.flat().join(' ');
    expect(logCalls).not.toContain('admin');
    expect(logCalls).not.toContain('P@ssw0rd');
    expect(logCalls).toContain('***');
  });
});
