// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-01 Task T3.
import { describe, it } from 'vitest';

describe('MinioService avatars bucket', () => {
  it.todo('ensureAvatarsBucket creates bucket and applies public-read policy when missing');
  it.todo('ensureAvatarsBucket re-applies policy when bucket already exists');
  it.todo('uploadAvatar writes {userId}.webp with Cache-Control public max-age=31536000 immutable');
  it.todo('removeAvatar swallows NoSuchKey (idempotent)');
  it.todo('getAvatarUrl composes scheme://publicEndpoint:publicPort/avatars/{userId}.webp?v=X');
  it.todo('getAvatarUrl falls back to MINIO_ENDPOINT and MINIO_PORT when public overrides unset');
});
