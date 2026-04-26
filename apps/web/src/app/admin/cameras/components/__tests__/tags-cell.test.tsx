import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 2 stub — populated by Plan 22-08.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W2-CELL — D-14 / D-15 — TagsCell ≤3 badges + overflow `+N` tooltip; empty cell when zero
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/web test -- tags-cell -x`)
 */
describe('Phase 22: TagsCell ≤3 + overflow tooltip', () => {
  it.todo('TODO Wave 2 — renders all tags as badges when count ≤ 3');
  it.todo('TODO Wave 2 — renders 3 badges + "+N" pill when count > 3');
  it.todo('TODO Wave 2 — hovering "+N" pill shows tooltip listing ALL tags (not just the overflow)');
  it.todo('TODO Wave 2 — empty array renders nothing visible (no placeholder dash)');
  it.todo('TODO Wave 2 — tag values render in display casing, not lowercased');
});
