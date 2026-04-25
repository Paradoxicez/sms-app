import { describe, it, expect } from 'vitest';
import { fingerprintProfile } from '../../src/streams/profile-fingerprint.util';

// Canonical reference profile shared by stability/flip-field tests below.
const base = {
  codec: 'libx264',
  preset: 'veryfast',
  resolution: '1920x1080',
  fps: 30,
  videoBitrate: '2000k',
  audioCodec: 'aac',
  audioBitrate: '128k',
} as const;

describe('Phase 21 — D-01 profile fingerprint', () => {
  it("fingerprintProfile(null) returns 'sha256:none' sentinel", () => {
    expect(fingerprintProfile(null)).toBe('sha256:none');
  });

  it('fingerprintProfile of two structurally identical profiles returns identical hash', () => {
    expect(fingerprintProfile({ ...base })).toBe(fingerprintProfile({ ...base }));
  });

  it('flipping codec changes the fingerprint', () => {
    expect(fingerprintProfile({ ...base })).not.toBe(
      fingerprintProfile({ ...base, codec: 'libx265' }),
    );
  });

  it('flipping preset changes the fingerprint', () => {
    expect(fingerprintProfile({ ...base })).not.toBe(
      fingerprintProfile({ ...base, preset: 'medium' }),
    );
  });

  it('flipping resolution changes the fingerprint', () => {
    expect(fingerprintProfile({ ...base })).not.toBe(
      fingerprintProfile({ ...base, resolution: '1280x720' }),
    );
  });

  it('flipping fps changes the fingerprint', () => {
    expect(fingerprintProfile({ ...base })).not.toBe(
      fingerprintProfile({ ...base, fps: 25 }),
    );
  });

  it('flipping videoBitrate changes the fingerprint', () => {
    expect(fingerprintProfile({ ...base })).not.toBe(
      fingerprintProfile({ ...base, videoBitrate: '4000k' }),
    );
  });

  it('flipping audioCodec changes the fingerprint', () => {
    expect(fingerprintProfile({ ...base })).not.toBe(
      fingerprintProfile({ ...base, audioCodec: 'copy' }),
    );
  });

  it('flipping audioBitrate changes the fingerprint', () => {
    expect(fingerprintProfile({ ...base })).not.toBe(
      fingerprintProfile({ ...base, audioBitrate: '256k' }),
    );
  });

  it('name and description fields are NOT part of the fingerprint', () => {
    const without = fingerprintProfile({ ...base });
    const with_ = fingerprintProfile({
      ...base,
      // Extra fields that exist on the DB row but should be ignored:
      name: 'Profile A',
      description: 'A description that should NOT affect hash',
    } as any);
    expect(with_).toBe(without);
  });

  it("output starts with the literal prefix 'sha256:' and is 71 chars total ('sha256:' + 64 hex)", () => {
    const fp = fingerprintProfile({ ...base });
    expect(fp).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(fp.length).toBe(71);
  });

  it("Passthrough profile (codec='copy', audioCodec='copy', other fields null) yields a stable hash distinct from libx264 cases", () => {
    const passthrough = fingerprintProfile({
      codec: 'copy',
      preset: null,
      resolution: null,
      fps: null,
      videoBitrate: null,
      audioCodec: 'copy',
      audioBitrate: null,
    });
    // Stable: re-call with same input gives same hash.
    expect(passthrough).toBe(
      fingerprintProfile({
        codec: 'copy',
        preset: null,
        resolution: null,
        fps: null,
        videoBitrate: null,
        audioCodec: 'copy',
        audioBitrate: null,
      }),
    );
    // Distinct: differs from a libx264 profile.
    expect(passthrough).not.toBe(fingerprintProfile({ ...base }));
    // Not the null sentinel — passthrough is a real profile, not "no profile".
    expect(passthrough).not.toBe('sha256:none');
  });
});
