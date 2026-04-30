/**
 * Quick task 260501-1n1 Task 1 — Smart camera probe + brand detection (Tier 1)
 *
 * Covers:
 *   - VFR detection (advertised vs computed framerate diff > 5%)
 *   - High-profile / level detection
 *   - Full-range pixel format (yuvj420p)
 *   - Brand-from-URL pattern matchers (uniview / hikvision / dahua / axis / generic-onvif)
 *   - Brand-from-encoder-tag matchers (Hisilicon shared SoC, Ambarella, Lavc skip)
 *   - Composite brand confidence (URL + encoder agreement)
 *   - recommendTranscode truth table
 *   - Backward-compat: healthy H.264 stream returns empty defaults for new fields
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FfprobeService,
  __test__ as ffprobeTest,
} from '../../src/cameras/ffprobe.service';

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

interface BuildStreamOpts {
  codec?: string;
  width?: number;
  height?: number;
  rFrameRate?: string;
  avgFrameRate?: string;
  profile?: string;
  level?: string | number;
  pixFmt?: string;
  audioCodec?: string;
  encoderTag?: string;
}

function buildFfprobeOutput(opts: BuildStreamOpts = {}): string {
  const {
    codec = 'h264',
    width = 1920,
    height = 1080,
    rFrameRate = '30/1',
    avgFrameRate = '30/1',
    profile,
    level,
    pixFmt = 'yuv420p',
    audioCodec = 'aac',
    encoderTag,
  } = opts;
  const videoStream: any = {
    codec_type: 'video',
    codec_name: codec,
    width,
    height,
    r_frame_rate: rFrameRate,
    avg_frame_rate: avgFrameRate,
    pix_fmt: pixFmt,
  };
  if (profile !== undefined) videoStream.profile = profile;
  if (level !== undefined) videoStream.level = level;
  const streams: any[] = [videoStream];
  if (audioCodec) {
    streams.push({ codec_type: 'audio', codec_name: audioCodec });
  }
  const payload: any = { streams };
  if (encoderTag !== undefined) {
    payload.format = { tags: { encoder: encoderTag } };
  }
  return JSON.stringify(payload);
}

describe('FfprobeService — Quick task 260501-1n1 (Tier 1)', () => {
  let service: FfprobeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FfprobeService();
  });

  // ─── ffprobe cmd line — must include -show_format ─────────────────────

  it('probeCamera invokes ffprobe with -show_format flag (so format.tags.encoder is read)', async () => {
    mockExecWithPromisify(buildFfprobeOutput());
    await service.probeCamera('rtsp://192.168.1.100/stream');
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain('-show_format');
    expect(cmd).toContain('-show_streams');
  });

  // ─── Backward compat — healthy H.264 stream — new fields use empty defaults ─

  it('healthy H.264 RTSP stream returns empty defaults for the new probe fields', async () => {
    mockExecWithPromisify(
      buildFfprobeOutput({
        codec: 'h264',
        width: 1920,
        height: 1080,
        rFrameRate: '30/1',
        avgFrameRate: '30/1',
        profile: 'Main',
        level: '40',
        pixFmt: 'yuv420p',
      }),
    );
    const result = await service.probeCamera('rtsp://cam/stream1');
    // Existing fields unchanged
    expect(result.codec).toBe('h264');
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.fps).toBe(30);
    expect(result.audioCodec).toBe('aac');
    expect(result.needsTranscode).toBe(false);
    // New fields — empty defaults
    expect(result.streamWarnings).toEqual([]);
    expect(result.brandHint).toBe('unknown');
    expect(result.brandConfidence).toBe('low');
    expect(result.brandEvidence).toEqual([]);
    expect(result.recommendTranscode).toBe(false);
  });

  // ─── VFR detection ────────────────────────────────────────────────────

  it("does NOT flag VFR when r_frame_rate=30/1 and avg_frame_rate=2997/100 (~0.1% diff)", async () => {
    mockExecWithPromisify(
      buildFfprobeOutput({ rFrameRate: '30/1', avgFrameRate: '2997/100' }),
    );
    const result = await service.probeCamera('rtsp://cam/stream1');
    expect(result.streamWarnings).not.toContain('vfr-detected');
  });

  it("flags 'vfr-detected' when r_frame_rate=30/1 and avg_frame_rate=15/1 (50% diff)", async () => {
    mockExecWithPromisify(
      buildFfprobeOutput({ rFrameRate: '30/1', avgFrameRate: '15/1' }),
    );
    const result = await service.probeCamera('rtsp://cam/stream1');
    expect(result.streamWarnings).toContain('vfr-detected');
  });

  // ─── High profile / level ─────────────────────────────────────────────

  it("flags 'high-profile' when profile='High 4:4:4 Predictive'", async () => {
    mockExecWithPromisify(
      buildFfprobeOutput({ profile: 'High 4:4:4 Predictive', level: '40' }),
    );
    const result = await service.probeCamera('rtsp://cam/stream1');
    expect(result.streamWarnings).toContain('high-profile');
  });

  it("flags 'high-profile' when level='51' (5.1)", async () => {
    mockExecWithPromisify(
      buildFfprobeOutput({ profile: 'Main', level: '51' }),
    );
    const result = await service.probeCamera('rtsp://cam/stream1');
    expect(result.streamWarnings).toContain('high-profile');
  });

  it("does NOT flag 'high-profile' for profile='Main', level='40'", async () => {
    mockExecWithPromisify(
      buildFfprobeOutput({ profile: 'Main', level: '40' }),
    );
    const result = await service.probeCamera('rtsp://cam/stream1');
    expect(result.streamWarnings).not.toContain('high-profile');
  });

  // ─── Full-range pixel format ──────────────────────────────────────────

  it("flags 'full-range-pixel-format' when pix_fmt='yuvj420p'", async () => {
    mockExecWithPromisify(buildFfprobeOutput({ pixFmt: 'yuvj420p' }));
    const result = await service.probeCamera('rtsp://cam/stream1');
    expect(result.streamWarnings).toContain('full-range-pixel-format');
  });

  it("does NOT flag 'full-range-pixel-format' when pix_fmt='yuv420p'", async () => {
    mockExecWithPromisify(buildFfprobeOutput({ pixFmt: 'yuv420p' }));
    const result = await service.probeCamera('rtsp://cam/stream1');
    expect(result.streamWarnings).not.toContain('full-range-pixel-format');
  });

  // ─── Brand from URL ───────────────────────────────────────────────────

  it("URL '/media/video2' → brandHint='uniview', confidence='high'", async () => {
    mockExecWithPromisify(buildFfprobeOutput());
    const result = await service.probeCamera('rtsp://demo:demo@10.0.0.5/media/video2');
    expect(result.brandHint).toBe('uniview');
    expect(result.brandConfidence).toBe('high');
    expect(result.brandEvidence.some((e) => e.startsWith('url-path:'))).toBe(true);
    expect(result.brandEvidence.some((e) => e.includes('/media/video2'))).toBe(true);
  });

  it("URL '/Streaming/Channels/101' → brandHint='hikvision'", async () => {
    mockExecWithPromisify(buildFfprobeOutput());
    const result = await service.probeCamera(
      'rtsp://10.0.0.5/Streaming/Channels/101',
    );
    expect(result.brandHint).toBe('hikvision');
    expect(result.brandConfidence).toBe('high');
  });

  it("URL '/cam/realmonitor?channel=1' → brandHint='dahua'", async () => {
    mockExecWithPromisify(buildFfprobeOutput());
    const result = await service.probeCamera(
      'rtsp://10.0.0.5/cam/realmonitor?channel=1&subtype=0',
    );
    expect(result.brandHint).toBe('dahua');
    expect(result.brandConfidence).toBe('high');
  });

  it("URL '/h264/ch1/main/av_stream' → brandHint='dahua'", async () => {
    mockExecWithPromisify(buildFfprobeOutput());
    const result = await service.probeCamera(
      'rtsp://10.0.0.5/h264/ch1/main/av_stream',
    );
    expect(result.brandHint).toBe('dahua');
    expect(result.brandConfidence).toBe('high');
  });

  it("URL '/axis-media/media.amp' → brandHint='axis'", async () => {
    mockExecWithPromisify(buildFfprobeOutput());
    const result = await service.probeCamera(
      'rtsp://10.0.0.5/axis-media/media.amp',
    );
    expect(result.brandHint).toBe('axis');
    expect(result.brandConfidence).toBe('high');
  });

  it("URL '/profile1' → brandHint='generic-onvif', confidence='medium'", async () => {
    mockExecWithPromisify(buildFfprobeOutput());
    const result = await service.probeCamera('rtsp://10.0.0.5/profile1');
    expect(result.brandHint).toBe('generic-onvif');
    expect(result.brandConfidence).toBe('medium');
  });

  // ─── Brand from encoder tag ───────────────────────────────────────────

  it("encoder='Hisilicon V200' → brandHint='uniview', confidence='medium', evidence flags shared SoC", async () => {
    mockExecWithPromisify(
      buildFfprobeOutput({ encoderTag: 'Hisilicon V200' }),
    );
    const result = await service.probeCamera('rtsp://cam/stream1');
    expect(result.brandHint).toBe('uniview');
    expect(result.brandConfidence).toBe('medium');
    expect(
      result.brandEvidence.some((e) => e === 'tags.encoder:Hisilicon V200'),
    ).toBe(true);
    expect(
      result.brandEvidence.some((e) =>
        /shared-soc:uniview\/hikvision\/dahua/i.test(e),
      ),
    ).toBe(true);
  });

  it("encoder='Lavc59.37.100' is SKIPPED — re-encoded marker is not a camera signature", async () => {
    mockExecWithPromisify(
      buildFfprobeOutput({ encoderTag: 'Lavc59.37.100' }),
    );
    const result = await service.probeCamera('rtsp://cam/stream1');
    expect(result.brandHint).toBe('unknown');
    expect(
      result.brandEvidence.some((e) => /tags\.encoder:Lavc/i.test(e)),
    ).toBe(false);
  });

  // ─── Composite confidence ─────────────────────────────────────────────

  it("URL '/media/video2' + encoder='Hisilicon' → brandHint='uniview', confidence='high'", async () => {
    mockExecWithPromisify(
      buildFfprobeOutput({ encoderTag: 'Hisilicon V300' }),
    );
    const result = await service.probeCamera('rtsp://10.0.0.5/media/video2');
    expect(result.brandHint).toBe('uniview');
    expect(result.brandConfidence).toBe('high');
  });

  it("Neither URL nor encoder match → brandHint='unknown', confidence='low', evidence=[]", async () => {
    mockExecWithPromisify(buildFfprobeOutput());
    const result = await service.probeCamera('rtsp://cam/stream-generic');
    expect(result.brandHint).toBe('unknown');
    expect(result.brandConfidence).toBe('low');
    expect(result.brandEvidence).toEqual([]);
  });

  // ─── recommendTranscode truth table ───────────────────────────────────

  it("recommendTranscode=true when needsTranscode=true (H.265)", async () => {
    mockExecWithPromisify(
      buildFfprobeOutput({ codec: 'hevc', width: 2560, height: 1440 }),
    );
    const result = await service.probeCamera('rtsp://cam/h265');
    expect(result.needsTranscode).toBe(true);
    expect(result.recommendTranscode).toBe(true);
  });

  it("recommendTranscode=true when brandHint='uniview' with confidence='high'", async () => {
    mockExecWithPromisify(buildFfprobeOutput());
    const result = await service.probeCamera('rtsp://10.0.0.5/media/video2');
    expect(result.brandHint).toBe('uniview');
    expect(result.recommendTranscode).toBe(true);
  });

  it("recommendTranscode=true when streamWarnings includes 'vfr-detected'", async () => {
    mockExecWithPromisify(
      buildFfprobeOutput({ rFrameRate: '30/1', avgFrameRate: '15/1' }),
    );
    const result = await service.probeCamera('rtsp://cam/stream1');
    expect(result.streamWarnings).toContain('vfr-detected');
    expect(result.recommendTranscode).toBe(true);
  });

  it("recommendTranscode=false when brandHint='unknown' and no warnings and H.264", async () => {
    mockExecWithPromisify(buildFfprobeOutput());
    const result = await service.probeCamera('rtsp://cam/stream-generic');
    expect(result.recommendTranscode).toBe(false);
  });

  it("recommendTranscode=false when brandHint='generic-onvif' with confidence='medium' (NOT in risk-tier list)", async () => {
    mockExecWithPromisify(buildFfprobeOutput());
    const result = await service.probeCamera('rtsp://10.0.0.5/profile1');
    expect(result.brandHint).toBe('generic-onvif');
    expect(result.recommendTranscode).toBe(false);
  });
});

// ─── Helper-level tests via __test__ export ─────────────────────────────

describe('FfprobeService helpers (260501-1n1)', () => {
  it('detectStreamWarnings is exposed via __test__', () => {
    expect(typeof ffprobeTest.detectStreamWarnings).toBe('function');
  });

  it('detectBrand is exposed via __test__', () => {
    expect(typeof ffprobeTest.detectBrand).toBe('function');
  });

  it('detectBrand returns unknown/low for non-matching URL and no encoder', () => {
    const out = ffprobeTest.detectBrand!('rtsp://cam/foo', undefined);
    expect(out.brandHint).toBe('unknown');
    expect(out.brandConfidence).toBe('low');
    expect(out.brandEvidence).toEqual([]);
  });
});
