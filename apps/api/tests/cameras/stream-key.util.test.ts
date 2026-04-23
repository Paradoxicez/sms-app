// Phase 19.1 Wave 0 scaffold — implemented by referenced plan.
import { describe, it } from 'vitest';

describe('stream-key util', () => {
  it.todo('generateStreamKey returns a 21-char URL-safe nanoid — Plan 01');
  it.todo('generateStreamKey collision rate across 100k calls is zero — Plan 01');
  it.todo('maskStreamKey returns first-4 + ellipsis + last-4 — Plan 01');
  it.todo('maskStreamKey returns ellipsis only when input ≤ 8 chars — Plan 01');
  it.todo('streamKeyPrefix returns first 4 chars — Plan 01');
  it.todo('buildPushUrl composes rtmp://{host}:1935/push/{key} — Plan 01');
});
