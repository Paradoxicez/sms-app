import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Quick task 260501-1n1 — Tier 1 brand-hint vocabulary. Mirrored on the web
 * side at apps/web/src/lib/codec-info.ts. Adding a new brand requires updates
 * in both places (no shared package — Pitfall 4 zod3/zod4 still applies).
 */
export type BrandHint =
  | 'uniview'
  | 'hikvision'
  | 'dahua'
  | 'axis'
  | 'generic-onvif'
  | 'unknown';

export interface ProbeResult {
  codec: string;
  width: number;
  height: number;
  fps: number;
  audioCodec: string;
  needsTranscode: boolean;
  /**
   * Quick task 260501-1n1 — soft warnings detected at probe time.
   * Members: 'vfr-detected' | 'high-profile' | 'full-range-pixel-format'
   * Order is detection order; consumers should treat this as a Set.
   */
  streamWarnings: string[];
  /** Best-guess camera vendor from URL pattern + encoder tag. */
  brandHint: BrandHint;
  brandConfidence: 'high' | 'medium' | 'low';
  /**
   * Human-readable evidence strings, e.g. 'url-path:/media/video2',
   * 'tags.encoder:Hisilicon V200', 'shared-soc:uniview/hikvision/dahua'.
   * NOT persisted in Tier 1 — surfaced by API/UI in a later tier.
   */
  brandEvidence: string[];
  /**
   * Composite recommendation — true when ANY of:
   *   - needsTranscode (codec is H.265/HEVC)
   *   - brandHint ∈ {uniview, hikvision, dahua} AND confidence ∈ {medium, high}
   *   - streamWarnings includes 'vfr-detected'
   * The UI uses this to gate StreamWarningBanner; the server does NOT
   * auto-flip the camera's stream profile (false-positive risk).
   */
  recommendTranscode: boolean;
}

/**
 * Parse "30/1", "2997/100" into a number; returns 0 on missing/malformed.
 * Pure function exported for unit testing via the __test__ block.
 */
function parseFraction(s: string | undefined): number {
  if (!s) return 0;
  const [n, d] = s.split('/').map(Number);
  if (!Number.isFinite(n)) return 0;
  if (d === undefined || !Number.isFinite(d) || d === 0) return n;
  return n / d;
}

/**
 * Detect soft stream warnings from a single ffprobe video-stream record.
 * - VFR: r_frame_rate (advertised) vs avg_frame_rate (computed) > 5% diff.
 * - High profile: 'High 4:4:4 Predictive' OR level >= 5.1 (>= 51 in raw form).
 * - Full-range pixel format: pix_fmt='yuvj420p' (PC-range vs TV-range).
 */
function detectStreamWarnings(videoStream: any): string[] {
  const warnings: string[] = [];

  // VFR check
  const r = parseFraction(videoStream?.r_frame_rate);
  const a = parseFraction(videoStream?.avg_frame_rate);
  if (r > 0 && a > 0 && Math.abs(r - a) / r > 0.05) {
    warnings.push('vfr-detected');
  }

  // High profile / level
  const profile = String(videoStream?.profile ?? '');
  const levelNum = Number(videoStream?.level);
  if (/High 4:4:4 Predictive/i.test(profile)) {
    warnings.push('high-profile');
  } else if (Number.isFinite(levelNum) && levelNum >= 51) {
    warnings.push('high-profile');
  }

  // Full-range pixel format (yuvj-prefixed = JPEG full range)
  if (videoStream?.pix_fmt === 'yuvj420p') {
    warnings.push('full-range-pixel-format');
  }

  return warnings;
}

/**
 * Detect camera brand from URL pattern + ffprobe format.tags.encoder.
 *
 * URL is the primary source — vendor URL paths are deterministic for major
 * brands. Encoder-tag is secondary because many SoCs are shared across
 * vendors (Hisilicon → Uniview/Hikvision/Dahua) — we record evidence of
 * the shared SoC explicitly so the UI can communicate uncertainty.
 *
 * Lavc/libavcodec encoder tags are SKIPPED (re-encoded streams are not a
 * camera signature — they're a relay/transcode marker).
 */
function detectBrand(
  streamUrl: string,
  encoderTag: string | undefined,
): {
  brandHint: BrandHint;
  brandConfidence: 'high' | 'medium' | 'low';
  brandEvidence: string[];
} {
  const evidence: string[] = [];

  // Extract pathname + query (URL constructor preserves the search string).
  let path = streamUrl;
  try {
    const parsed = new URL(streamUrl);
    path = parsed.pathname + (parsed.search ?? '');
  } catch {
    // Not a parseable URL — fall back to the raw input. The regex matchers
    // tolerate this (they search anywhere in the string).
  }

  // URL-path matchers — most specific first.
  let urlBrand: BrandHint = 'unknown';
  let urlConfidence: 'high' | 'medium' | 'low' = 'low';
  if (/\/media\/video\d+/i.test(path)) {
    urlBrand = 'uniview';
    urlConfidence = 'high';
    evidence.push(`url-path:${path}`);
  } else if (/\/Streaming\/Channels\//i.test(path)) {
    urlBrand = 'hikvision';
    urlConfidence = 'high';
    evidence.push(`url-path:${path}`);
  } else if (/\/cam\/realmonitor/i.test(path)) {
    urlBrand = 'dahua';
    urlConfidence = 'high';
    evidence.push(`url-path:${path}`);
  } else if (/\/h264\/ch\d+\/main\/av_stream/i.test(path)) {
    urlBrand = 'dahua';
    urlConfidence = 'high';
    evidence.push(`url-path:${path}`);
  } else if (/\/axis-media\/media\.amp/i.test(path)) {
    urlBrand = 'axis';
    urlConfidence = 'high';
    evidence.push(`url-path:${path}`);
  } else if (/\/profile\d+/i.test(path)) {
    urlBrand = 'generic-onvif';
    urlConfidence = 'medium';
    evidence.push(`url-path:${path}`);
  }

  // Encoder-tag matchers (T-260501-1n1-01: matched against fixed regex set).
  // Lavc/libavcodec is a transcoder marker, not a camera signature — skip.
  let encoderBrand: BrandHint = 'unknown';
  let encoderConfidence: 'high' | 'medium' | 'low' = 'low';
  if (encoderTag && !/Lavc|libavcodec/i.test(encoderTag)) {
    if (/Hisilicon/i.test(encoderTag)) {
      encoderBrand = 'uniview';
      encoderConfidence = 'medium';
      evidence.push(`tags.encoder:${encoderTag}`);
      evidence.push('shared-soc:uniview/hikvision/dahua');
    } else if (/Ambarella/i.test(encoderTag)) {
      encoderBrand = 'axis';
      encoderConfidence = 'low';
      evidence.push(`tags.encoder:${encoderTag}`);
    }
  }

  // Composite resolution.
  if (
    urlBrand !== 'unknown' &&
    encoderBrand !== 'unknown' &&
    urlBrand === encoderBrand
  ) {
    return { brandHint: urlBrand, brandConfidence: 'high', brandEvidence: evidence };
  }
  if (urlBrand !== 'unknown') {
    return { brandHint: urlBrand, brandConfidence: urlConfidence, brandEvidence: evidence };
  }
  if (encoderBrand !== 'unknown') {
    return {
      brandHint: encoderBrand,
      brandConfidence: encoderConfidence,
      brandEvidence: evidence,
    };
  }
  return { brandHint: 'unknown', brandConfidence: 'low', brandEvidence: [] };
}

@Injectable()
export class FfprobeService {
  private readonly logger = new Logger(FfprobeService.name);

  /** Returns the input-specific flags string for ffprobe. D-13 — only RTSP needs -rtsp_transport. */
  private inputFlagsFor(streamUrl: string): string {
    if (streamUrl.startsWith('rtsp://')) return '-rtsp_transport tcp ';
    // rtmp, rtmps, srt, http(s): no input flags needed
    return '';
  }

  async probeCamera(streamUrl: string): Promise<ProbeResult> {
    const redactedUrl = this.redactUrl(streamUrl);
    this.logger.log(`Probing camera: ${redactedUrl}`);

    const transportFlag = this.inputFlagsFor(streamUrl);
    // Quick task 260501-1n1: -show_format added so format.tags.encoder is
    // available for brand detection (the ffprobe success path on the
    // existing dev workflow keeps -show_streams; both flags compose).
    const cmd = `ffprobe -v quiet -print_format json -show_streams -show_format ${transportFlag}"${streamUrl}"`;
    const { stdout } = await execAsync(cmd, { timeout: 15000 });
    const data = JSON.parse(stdout);

    const videoStream = data.streams?.find(
      (s: any) => s.codec_type === 'video',
    );
    const audioStream = data.streams?.find(
      (s: any) => s.codec_type === 'audio',
    );

    if (!videoStream) {
      throw new Error('No video stream found in camera feed');
    }

    const codec = videoStream.codec_name;
    const needsTranscode = ['hevc', 'h265'].includes(codec.toLowerCase());

    const fpsStr = videoStream.r_frame_rate || '30/1';
    const [num, den] = fpsStr.split('/').map(Number);
    const fps = Math.round(num / (den || 1));

    // Quick task 260501-1n1 — Tier 1 derived fields.
    const streamWarnings = detectStreamWarnings(videoStream);
    const encoderTag = data.format?.tags?.encoder as string | undefined;
    const { brandHint, brandConfidence, brandEvidence } = detectBrand(
      streamUrl,
      encoderTag,
    );
    const brandIsRiskTier =
      ['uniview', 'hikvision', 'dahua'].includes(brandHint) &&
      (brandConfidence === 'medium' || brandConfidence === 'high');
    const recommendTranscode =
      needsTranscode || brandIsRiskTier || streamWarnings.includes('vfr-detected');

    return {
      codec,
      width: videoStream.width || 0,
      height: videoStream.height || 0,
      fps,
      audioCodec: audioStream?.codec_name || 'none',
      needsTranscode,
      streamWarnings,
      brandHint,
      brandConfidence,
      brandEvidence,
      recommendTranscode,
    };
  }

  private redactUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) {
        parsed.username = '***';
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      return url.replace(/:\/\/[^@]+@/, '://***:***@');
    }
  }
}

// test-only export — do not use in production code
export const __test__ = {
  inputFlagsFor: (service: FfprobeService, url: string): string =>
    (service as any).inputFlagsFor(url),
  detectStreamWarnings,
  detectBrand,
  parseFraction,
};
