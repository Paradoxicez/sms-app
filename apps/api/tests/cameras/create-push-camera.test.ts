// Phase 19.1 Wave 0 scaffold — implemented by referenced plan.
import { describe, it } from 'vitest';

describe('CamerasService.createCamera ingestMode=push', () => {
  it.todo('generates streamKey + full streamUrl and stores both — Plan 03, D-04, D-05');
  it.todo('returns full URL to owner perspective — Plan 03, D-09');
  it.todo('emits camera.push.key_generated audit with 4-char prefix — Plan 03, D-21');
  it.todo('translates P2002 on streamKey to DuplicateStreamKeyError — Plan 03, D-04');
  it.todo('enqueues probe with probe-{cameraId}-ffprobe jobId (same as pull) — Plan 03');
});
