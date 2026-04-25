import { describe, it, expect } from 'vitest';

describe('Phase 21 — D-01 profile fingerprint', () => {
  it.todo("fingerprintProfile(null) returns 'sha256:none' sentinel");
  it.todo('fingerprintProfile of two structurally identical profiles returns identical hash');
  it.todo('flipping codec changes the fingerprint');
  it.todo('flipping preset changes the fingerprint');
  it.todo('flipping resolution changes the fingerprint');
  it.todo('flipping fps changes the fingerprint');
  it.todo('flipping videoBitrate changes the fingerprint');
  it.todo('flipping audioCodec changes the fingerprint');
  it.todo('flipping audioBitrate changes the fingerprint');
  it.todo('name and description fields are NOT part of the fingerprint');
  it.todo("output starts with the literal prefix 'sha256:' and is 71 chars total ('sha256:' + 64 hex)");
  it.todo("Passthrough profile (codec='copy', audioCodec='copy', other fields null) yields a stable hash distinct from libx264 cases");
});
