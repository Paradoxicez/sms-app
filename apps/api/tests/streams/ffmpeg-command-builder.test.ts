import { describe, it, expect } from 'vitest';
import { shouldAddRtspTransport } from '../../src/streams/ffmpeg/ffmpeg-command.builder';

describe('buildFfmpegCommand protocol branching — Phase 19 (D-13)', () => {
  it('rtsp:// URL → shouldAddRtspTransport returns true', () => {
    expect(shouldAddRtspTransport('rtsp://host/s')).toBe(true);
  });

  it('rtmp:// URL → shouldAddRtspTransport returns false', () => {
    expect(shouldAddRtspTransport('rtmp://host/s')).toBe(false);
  });

  it('rtmps:// URL → shouldAddRtspTransport returns false', () => {
    expect(shouldAddRtspTransport('rtmps://host/s')).toBe(false);
  });

  it('srt:// URL → shouldAddRtspTransport returns false', () => {
    expect(shouldAddRtspTransport('srt://host:9000')).toBe(false);
  });
});
