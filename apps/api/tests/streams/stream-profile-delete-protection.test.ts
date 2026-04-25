import { describe, it, expect } from 'vitest';

describe('Phase 21 — D-10 service-layer 409 protection (Option B, no schema change)', () => {
  it.todo('DELETE /api/stream-profiles/:id with 0 cameras using it returns 200 and removes the row');
  it.todo('DELETE /api/stream-profiles/:id with 1 camera using it throws ConflictException with status 409');
  it.todo('409 response body shape is { message: string, usedBy: [{ cameraId, name }] }');
  it.todo('409 response with 2+ cameras returns all of them in usedBy[]');
  it.todo("usedBy query is scoped to the requester's org (Camera.findMany via TENANCY_CLIENT) — cross-org camera names never appear (T-21-02)");
  it.todo('Prisma row is NOT deleted when ConflictException is thrown');
});
