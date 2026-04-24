import { describe, it, expect } from 'vitest';
import {
  containsH264Keyframe,
  containsH264NalType,
} from '../../src/recordings/h264-utils';

/**
 * These tests cover the Phase 19.1 layer-7 fix: RTMP push recordings
 * produced ~1-in-4 TS segments with no IDR (mid-GOP continuation), which
 * jammed hls.js VOD playback on the very first fragment. The archive path
 * uses `containsH264Keyframe` to decide whether a segment is safe to serve
 * as the leading fragment; the manifest generator then skips leading
 * false-flagged rows.
 *
 * We validate both directions: scan correctness AND early-exit behaviour.
 */
describe('h264-utils', () => {
  describe('containsH264NalType', () => {
    it('returns false for empty / undersized buffers', () => {
      expect(containsH264NalType(Buffer.alloc(0), 5)).toBe(false);
      expect(containsH264NalType(Buffer.alloc(3), 5)).toBe(false);
      expect(containsH264NalType(undefined as any, 5)).toBe(false);
      expect(containsH264NalType(null as any, 5)).toBe(false);
    });

    it('detects a 4-byte-startcode NAL of the requested type', () => {
      // 00 00 00 01 | 0x65 (forbidden_zero=0, ref_idc=3, nal_unit_type=5=IDR)
      const buf = Buffer.from([
        0xff, 0xff, 0x00, 0x00, 0x00, 0x01, 0x65, 0xaa, 0xbb,
      ]);
      expect(containsH264NalType(buf, 5)).toBe(true);
      expect(containsH264NalType(buf, 7)).toBe(false); // SPS
    });

    it('detects a 3-byte-startcode NAL of the requested type', () => {
      // 00 00 01 | 0x67 (ref_idc=3, nal_unit_type=7=SPS)
      const buf = Buffer.from([0xff, 0x00, 0x00, 0x01, 0x67, 0xaa]);
      expect(containsH264NalType(buf, 7)).toBe(true);
      expect(containsH264NalType(buf, 5)).toBe(false);
    });

    it('only matches the nal_unit_type in the low 5 bits', () => {
      // 0x65 & 0x1f = 0x05, 0x85 & 0x1f = 0x05 — both IDR despite different
      // forbidden_zero_bit / nal_ref_idc. This guards against an earlier bug
      // where we accidentally compared the whole byte.
      const a = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x65]);
      const b = Buffer.from([0x00, 0x00, 0x00, 0x01, 0x85]);
      expect(containsH264NalType(a, 5)).toBe(true);
      expect(containsH264NalType(b, 5)).toBe(true);
    });

    it('does not false-positive on generic zero runs', () => {
      // A long run of zeros followed by random bytes — no start code + nal match.
      const buf = Buffer.concat([
        Buffer.alloc(100, 0x00),
        Buffer.from([0xff, 0xaa, 0x55]),
      ]);
      expect(containsH264NalType(buf, 5)).toBe(false);
    });

    it('returns true on the first match (does not scan the whole buffer)', () => {
      // If this hangs on a large buffer the early-exit is broken.
      const idrAtStart = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x01, 0x65]),
        Buffer.alloc(10 * 1024 * 1024, 0xaa), // 10 MB tail
      ]);
      const t0 = Date.now();
      const found = containsH264NalType(idrAtStart, 5);
      const elapsed = Date.now() - t0;
      expect(found).toBe(true);
      expect(elapsed).toBeLessThan(50); // sanity: early-exit works
    });
  });

  describe('containsH264Keyframe', () => {
    it('returns true for a buffer containing an IDR NAL', () => {
      const buf = Buffer.from([
        0x00, 0x00, 0x00, 0x01, 0x09, 0xf0, // AUD (not IDR)
        0x00, 0x00, 0x00, 0x01, 0x67, 0x42, // SPS (not IDR)
        0x00, 0x00, 0x00, 0x01, 0x68, 0xce, // PPS (not IDR)
        0x00, 0x00, 0x00, 0x01, 0x65, 0x88, // IDR
        0xff,
      ]);
      expect(containsH264Keyframe(buf)).toBe(true);
    });

    it('returns false for a buffer with only non-IDR slices', () => {
      // This mirrors the real "RTMP mid-GOP segment" shape that broke hls.js.
      const buf = Buffer.from([
        0x00, 0x00, 0x00, 0x01, 0x09, 0xf0, // AUD
        0x00, 0x00, 0x00, 0x01, 0x41, 0xe0, // non-IDR slice (type=1)
        0x00, 0x00, 0x00, 0x01, 0x41, 0xe1, // non-IDR slice
      ]);
      expect(containsH264Keyframe(buf)).toBe(false);
    });

    it('returns false for a buffer with SPS/PPS but no IDR', () => {
      // Defensive: some publishers emit stray SPS with no accompanying IDR
      // (observed in seg 190 of the bug repro). SPS alone ≠ decodable; we
      // still need IDR to initialise the decoder.
      const buf = Buffer.from([
        0x00, 0x00, 0x00, 0x01, 0x67, 0x42, // SPS
        0x00, 0x00, 0x00, 0x01, 0x41, 0xe0, // non-IDR slice
      ]);
      expect(containsH264Keyframe(buf)).toBe(false);
    });

    it('returns false for non-H.264 / garbage content', () => {
      const buf = Buffer.alloc(4096, 0xaa);
      expect(containsH264Keyframe(buf)).toBe(false);
    });
  });
});
