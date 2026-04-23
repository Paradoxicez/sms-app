// Phase 19.1 Wave 0 scaffold — implemented by referenced plan.
import { describe, it } from 'vitest';

describe('SrsCallbackController on_forward (D-18)', () => {
  it.todo('app=push + passthrough → returns urls with rtmp://127.0.0.1:1935/live/{orgId}/{cameraId} — Plan 02');
  it.todo('app=push + needsTranscode → returns empty urls (FFmpeg handles forward) — Plan 02');
  it.todo('app=live → returns empty urls (no recursion) — Plan 02, RESEARCH Pitfall 3');
  it.todo('unknown streamKey → returns empty urls (on_publish is the auth chokepoint) — Plan 02');
});
