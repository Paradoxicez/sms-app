import { describe, it } from 'vitest';

describe('normalizeCodecInfo — Phase 19 (D-07 legacy migration)', () => {
  // All entries are it.todo stubs — Wave 1-2 tasks convert them to real tests.
  it.todo('null/undefined input returns null (render em-dash)');
  it.todo('empty object {} returns null (never probed)');
  it.todo('legacy { error, probedAt } becomes { status: "failed", error, probedAt, source: "ffprobe" }');
  it.todo('legacy { codec, width, height, fps, audioCodec, probedAt } becomes { status: "success", video: {...}, audio: {...} }');
  it.todo('new shape { status: "pending", probedAt, source } returns as-is');
  it.todo('new shape { status: "success", video, audio } returns as-is');
  it.todo('malformed input (missing probedAt) returns null (invalid shape)');
});
