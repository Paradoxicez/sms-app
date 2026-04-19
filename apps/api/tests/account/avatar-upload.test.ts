// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-01 Task T5.
import { describe, it } from 'vitest';

describe('POST /api/users/me/avatar', () => {
  it.todo('accepts tiny.jpg and responds 201 { url } containing ?v=');
  it.todo('rejects oversize.jpg (3+ MB) with 413 or 422 before any MinIO write');
  it.todo('rejects text/plain with 422');
  it.todo('rejects image/gif with 422 (regex allows only jpeg/png/webp)');
  it.todo('rejects corrupt.png with 400 (sharp failOn error)');
  it.todo('returns 401 when unauthenticated');
  it.todo('writes object key {userId}.webp from req.user.id, ignoring any userId in multipart body');
});

describe('DELETE /api/users/me/avatar', () => {
  it.todo('returns 200 and removes object from MinIO');
  it.todo('returns 200 when object does not exist (idempotent)');
  it.todo('returns 401 when unauthenticated');
});
