// Phase 19.1 Wave 0 scaffold — implemented by referenced plan.
import { describe, it } from 'vitest';

describe('StreamProbeProcessor codec-mismatch detection (D-16)', () => {
  it.todo('passthrough profile + H.265 writes codecInfo.status=mismatch — Plan 04, D-16');
  it.todo('passthrough profile + H.264/AAC writes status=success (no mismatch) — Plan 04, D-16');
  it.todo('transcode profile + H.265 writes status=success (no mismatch — transcode handles it) — Plan 04, D-16');
  it.todo('mismatch detection calls SrsApiService.kickPublisher on the active client — Plan 04, D-16');
  it.todo('mismatch emits camera.push.publish_rejected audit with codec detail — Plan 04, D-21');
});
