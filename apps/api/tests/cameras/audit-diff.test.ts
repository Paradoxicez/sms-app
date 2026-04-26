import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 1 stub — populated by Plan 22-05.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W1-AUDIT — D-24 — UPDATE diff in details.diff for changed fields only (tags + description)
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/api test -- tests/cameras/audit-diff.test.ts -x`)
 */
describe('Phase 22: Camera UPDATE diff in details.diff', () => {
  it.todo('TODO Wave 1 — UPDATE that changes tags emits diff.tags = {before, after}');
  it.todo('TODO Wave 1 — UPDATE that changes description emits diff.description = {before, after}');
  it.todo('TODO Wave 1 — UPDATE with no field change does NOT include unchanged keys in diff');
  it.todo('TODO Wave 1 — diff is shallow: nested objects appear as full before/after replacements');
  it.todo('TODO Wave 1 — diff present in details object alongside other audit metadata');
});
