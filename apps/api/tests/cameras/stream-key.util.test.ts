// Phase 19.1 — stream-key util tests (converted from Wave 0 todos).
import { describe, it, expect } from 'vitest';
import {
  generateStreamKey,
  maskStreamKey,
  streamKeyPrefix,
  buildPushUrl,
} from '../../src/cameras/stream-key.util';

describe('stream-key util', () => {
  it('generateStreamKey returns a 21-char URL-safe nanoid', () => {
    const key = generateStreamKey();
    expect(key).toHaveLength(21);
    expect(key).toMatch(/^[A-Za-z0-9_-]{21}$/);
  });

  it('generateStreamKey collision rate across 10k calls is zero', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(generateStreamKey());
    expect(seen.size).toBe(10_000);
  });

  it('maskStreamKey returns first-4 + ellipsis + last-4', () => {
    // Input: 'abcdefghijklmnopqrstu' (21 chars) → first-4 'abcd' + '…' + last-4 'rstu'.
    expect(maskStreamKey('abcdefghijklmnopqrstu')).toBe('abcd…rstu');
  });

  it('maskStreamKey returns ellipsis only when input ≤ 8 chars', () => {
    expect(maskStreamKey('short')).toBe('…');
    expect(maskStreamKey('')).toBe('…');
    expect(maskStreamKey('12345678')).toBe('…');
  });

  it('streamKeyPrefix returns first 4 chars', () => {
    expect(streamKeyPrefix('abcdefghij')).toBe('abcd');
    expect(streamKeyPrefix('')).toBe('');
  });

  it('buildPushUrl composes rtmp://{host}:1935/push/{key}', () => {
    expect(buildPushUrl('stream.example.com', 'abc123')).toBe(
      'rtmp://stream.example.com:1935/push/abc123',
    );
  });
});
