import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 2 stub — populated by Plan 22-10.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W2-MAP-FILTER — D-20 / D-21 — Map toolbar tag MultiSelect narrows visible markers (OR semantics, independent state)
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/web test -- tenant-map-page -x`)
 */
describe('Phase 22: Map toolbar tag MultiSelect filter', () => {
  it.todo('TODO Wave 2 — selecting a tag in toolbar filter narrows visible map markers');
  it.todo('TODO Wave 2 — multiple selected tags apply OR semantics (marker visible if ANY tag matches)');
  it.todo('TODO Wave 2 — map filter state is independent from /admin/cameras filter state (D-21)');
  it.todo('TODO Wave 2 — clearing the filter restores all markers');
});
