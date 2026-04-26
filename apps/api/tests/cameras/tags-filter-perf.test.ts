import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 1 stub (advisory) — populated by Plan 22-02.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W1-FILTER-PERF — D-02 (GIN index) — EXPLAIN ANALYZE shows Bitmap Index Scan, not Seq Scan
 *
 * Status: ADVISORY — skip if brittle on CI (see VALIDATION.md note).
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/api test -- tests/cameras/tags-filter-perf.test.ts -x`)
 */
describe('Phase 22: GIN bitmap scan EXPLAIN ANALYZE (advisory)', () => {
  it.todo('TODO Wave 1 — EXPLAIN ANALYZE on tagsNormalized && ARRAY[...] uses Bitmap Index Scan');
  it.todo('TODO Wave 1 — index name in plan output matches camera_tagsnormalized_idx');
});
