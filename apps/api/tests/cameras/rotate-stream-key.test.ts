// Phase 19.1 Wave 0 scaffold — implemented by referenced plan.
import { describe, it } from 'vitest';

describe('CamerasService.rotateStreamKey', () => {
  it.todo('generates new key + URL in a single transaction — Plan 03, D-20');
  it.todo('calls SrsApiService.kickPublisher with resolved client id — Plan 03, D-20');
  it.todo('tolerates kick failure — new key is live even if kick errors — Plan 03, D-20');
  it.todo('rejects rotation on pull cameras with 400 — Plan 03');
  it.todo('emits camera.push.key_rotated audit with old+new prefixes — Plan 03, D-21');
});
