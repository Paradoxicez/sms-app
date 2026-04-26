import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 1 stub — populated by Plan 22-01 follow-up / Wave 1 executor.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-WAVE0-02 — D-06 (write path) — extension populates tagsNormalized on every write
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/api test -- tests/cameras/tag-normalization.test.ts -x`)
 */
describe('Phase 22: Camera write paths populate tagsNormalized', () => {
  it.todo('TODO Wave 1 — create() persists lowercased + deduped tagsNormalized via Prisma extension');
  it.todo('TODO Wave 1 — update() rewrites tagsNormalized when tags array changes');
  it.todo('TODO Wave 1 — upsert() populates tagsNormalized on both create and update branches');
  it.todo('TODO Wave 1 — bulk import (per-row create) populates tagsNormalized for every row');
});
