import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 1 stub — populated by Plan 22-03.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   rows 22-W1-BULK / 22-W1-BULK-AUDIT — D-11 / D-12 / D-26 — POST /cameras/bulk/tags Add/Remove + per-camera audit
 *   threat: T-22-01 (RLS — bulk operation must not cross orgs)
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/api test -- tests/cameras/bulk-tags.test.ts -x`)
 */
describe('Phase 22: POST /cameras/bulk/tags', () => {
  it.todo('TODO Wave 1 — Add operation: union semantics (existing tags preserved, dedup case-insensitive)');
  it.todo('TODO Wave 1 — Remove operation: removes only specified tags, leaves others untouched');
  it.todo('TODO Wave 1 — idempotent: same Add request twice yields identical state (no duplicates)');
  it.todo('TODO Wave 1 — single transaction: failure on any camera rolls back all changes');
  it.todo('TODO Wave 1 — OrgAdminGuard blocks non-admin callers');
  it.todo('TODO Wave 1 — RLS enforced: Org A bulk request cannot mutate Org B cameras (T-22-01)');
});

describe('Phase 22: bulk-tags audit per-camera (D-26)', () => {
  it.todo('TODO Wave 1 — one audit row written per affected camera');
  it.todo('TODO Wave 1 — audit row.details.diff.tags shows {before, after}');
  it.todo('TODO Wave 1 — unaffected cameras (no change) produce no audit row');
});
