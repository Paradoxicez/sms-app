import { describe, it, expect } from 'vitest';
import {
  buildDownloadPlaylist,
  buildRemuxArgs,
  computeTargetDuration,
  skipLeadingNonKeyframeSegments,
} from '../../src/recordings/download-playlist.util';

/**
 * Regression tests for the 2026-04-24 RTMP push recording download fix.
 *
 * Before the fix:
 *   - TARGETDURATION was hard-coded to 3, which violates HLS spec for RTMP
 *     push recordings whose GOP-aligned segments run 4s+ (4.12/4.22/3.25…).
 *   - FFmpeg ran without `-bsf:a aac_adtstoasc`, so RTMP's ADTS AAC couldn't
 *     be muxed into MP4 — FFmpeg aborted with "Malformed AAC bitstream
 *     detected" and wrote a ~1KB empty MP4.
 *
 * RTSP recordings survived because their pull-side FFmpeg pipeline normalises
 * both dimensions before the stream ever reaches SRS.
 */
describe('download-playlist util (REC-04 RTMP fix)', () => {
  describe('computeTargetDuration', () => {
    it('rounds the longest segment duration up to the next integer', () => {
      // Real RTMP push durations from the reproducing recording
      // (cb573d8a-72a3-4b1b-b417-14965944ab3a):
      expect(
        computeTargetDuration([
          { duration: 4.12, url: 'a' },
          { duration: 4.22, url: 'b' },
          { duration: 3.25, url: 'c' },
        ]),
      ).toBe(5);
    });

    it('returns 3 for RTSP FFmpeg-ingest segments (stable 2.56s)', () => {
      expect(
        computeTargetDuration([
          { duration: 2.56, url: 'a' },
          { duration: 2.56, url: 'b' },
        ]),
      ).toBe(3);
    });

    it('returns 1 when segments list is empty (degenerate-but-valid)', () => {
      expect(computeTargetDuration([])).toBe(1);
    });

    it('returns 1 when all durations are zero/missing', () => {
      expect(
        computeTargetDuration([
          { duration: 0, url: 'a' },
          { duration: 0, url: 'b' },
        ]),
      ).toBe(1);
    });
  });

  describe('buildDownloadPlaylist', () => {
    it('emits a TARGETDURATION that matches the longest segment (RTMP regression)', () => {
      const m3u8 = buildDownloadPlaylist([
        { duration: 4.22, url: 'https://minio/seg-188.ts' },
        { duration: 3.25, url: 'https://minio/seg-189.ts' },
      ]);
      expect(m3u8).toContain('#EXT-X-TARGETDURATION:5');
      expect(m3u8).not.toContain('#EXT-X-TARGETDURATION:3');
    });

    it('is a spec-compliant HLS v3 MPEG-TS VOD playlist', () => {
      const m3u8 = buildDownloadPlaylist([
        { duration: 2.56, url: 'https://minio/seg.ts' },
      ]);
      expect(m3u8).toContain('#EXTM3U');
      expect(m3u8).toContain('#EXT-X-VERSION:3');
      expect(m3u8).toContain('#EXT-X-PLAYLIST-TYPE:VOD');
      expect(m3u8).toContain('#EXT-X-ENDLIST');
      // EXT-X-MAP is fMP4-only and SRS v6 cannot produce fMP4; emitting it
      // breaks both FFmpeg transmux and hls.js playback.
      expect(m3u8).not.toContain('#EXT-X-MAP');
      expect(m3u8).not.toContain('#EXT-X-VERSION:7');
    });

    it('writes presigned URLs verbatim and formats EXTINF to six decimals', () => {
      const m3u8 = buildDownloadPlaylist([
        { duration: 4.12, url: 'https://minio/seg-188.ts?X-Amz-Signature=abc' },
      ]);
      expect(m3u8).toContain('#EXTINF:4.120000,');
      expect(m3u8).toContain('https://minio/seg-188.ts?X-Amz-Signature=abc');
    });
  });

  describe('buildRemuxArgs', () => {
    it('injects -bsf:a aac_adtstoasc (RTMP ADTS AAC fix)', () => {
      // This was the root cause of the 1KB empty MP4 bug on RTMP recordings.
      // Without this filter FFmpeg aborts with "Malformed AAC bitstream".
      const args = buildRemuxArgs('/tmp/x.m3u8', 'pipe:1');
      const idx = args.indexOf('-bsf:a');
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(args[idx + 1]).toBe('aac_adtstoasc');
    });

    it('uses stream copy (no transcode) and fragmented-MP4 muxer', () => {
      const args = buildRemuxArgs('/tmp/x.m3u8', '/tmp/out.mp4');
      const cIdx = args.indexOf('-c');
      expect(cIdx).toBeGreaterThanOrEqual(0);
      expect(args[cIdx + 1]).toBe('copy');

      const mvIdx = args.indexOf('-movflags');
      expect(args[mvIdx + 1]).toBe('frag_keyframe+empty_moov');

      const fIdx = args.indexOf('-f');
      expect(args[fIdx + 1]).toBe('mp4');
    });

    it('allows FFmpeg to read both the local playlist and remote MinIO URLs', () => {
      const args = buildRemuxArgs('/tmp/x.m3u8', 'pipe:1');
      const idx = args.indexOf('-protocol_whitelist');
      expect(idx).toBeGreaterThanOrEqual(0);
      // `file` for the playlist, `https` for presigned MinIO URLs inside.
      expect(args[idx + 1]).toContain('file');
      expect(args[idx + 1]).toContain('https');
    });

    it('threads the input playlist path and output target through unmodified', () => {
      const args = buildRemuxArgs('/tmp/download-abc.m3u8', '/tmp/out.mp4');
      const iIdx = args.indexOf('-i');
      expect(args[iIdx + 1]).toBe('/tmp/download-abc.m3u8');
      expect(args[args.length - 1]).toBe('/tmp/out.mp4');
    });
  });

  describe('skipLeadingNonKeyframeSegments (layer-7 mid-GOP trim)', () => {
    it('drops leading segments with hasKeyframe=false', () => {
      // Real RTMP scenario: recording started mid-GOP, seg 188 has no IDR,
      // seg 189 is the first IDR-bearing fragment. Without this trim hls.js
      // fatal-errors on fragment #0.
      const out = skipLeadingNonKeyframeSegments([
        { duration: 4.12, url: 'a', hasKeyframe: false },
        { duration: 4.22, url: 'b', hasKeyframe: true },
        { duration: 4.2, url: 'c', hasKeyframe: false }, // mid-GOP tail — keep
        { duration: 3.25, url: 'd', hasKeyframe: true },
      ]);
      expect(out.map((s) => s.url)).toEqual(['b', 'c', 'd']);
    });

    it('keeps segments with hasKeyframe=null (legacy RTSP rows)', () => {
      // Rows archived before we added the column: hasKeyframe comes back as
      // null/undefined. We MUST NOT drop those — RTSP recordings predate the
      // probe, have always been IDR-aligned, and must keep playing cleanly.
      const out = skipLeadingNonKeyframeSegments([
        { duration: 2.56, url: 'a', hasKeyframe: null },
        { duration: 2.56, url: 'b' }, // undefined
      ]);
      expect(out.map((s) => s.url)).toEqual(['a', 'b']);
    });

    it('returns [] when no segment has a keyframe (recording still in mid-GOP)', () => {
      const out = skipLeadingNonKeyframeSegments([
        { duration: 4.12, url: 'a', hasKeyframe: false },
        { duration: 4.22, url: 'b', hasKeyframe: false },
      ]);
      expect(out).toEqual([]);
    });

    it('returns input unchanged when the first segment already has a keyframe', () => {
      const input = [
        { duration: 2.56, url: 'a', hasKeyframe: true },
        { duration: 2.56, url: 'b', hasKeyframe: false },
        { duration: 2.56, url: 'c', hasKeyframe: true },
      ];
      const out = skipLeadingNonKeyframeSegments(input);
      expect(out).toEqual(input);
    });

    it('handles an empty input gracefully', () => {
      expect(skipLeadingNonKeyframeSegments([])).toEqual([]);
    });
  });
});
