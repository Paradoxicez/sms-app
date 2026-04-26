import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 1 stub — populated by Plan 22-04.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   rows 22-W1-DISTINCT / 22-W1-DISTINCT-RLS — D-28 — GET /cameras/tags/distinct + RLS isolation + cache hit
 *   threat: T-22-02 (cache leak between orgs)
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/api test -- tests/cameras/distinct-tags.test.ts -x`)
 */
describe('Phase 22: GET /cameras/tags/distinct', () => {
  it.todo('TODO Wave 1 — returns alphabetized distinct tags for current org');
  it.todo('TODO Wave 1 — display casing preserved (first-seen) per D-04');
  it.todo('TODO Wave 1 — empty org returns empty array');
  it.todo('TODO Wave 1 — second call hits cache (verify via timing or mock)');
});

describe('Phase 22: distinct-tags RLS isolation (T-22-02)', () => {
  it.todo("TODO Wave 1 — Org A's distinct cache MUST NOT be returned to Org B");
  it.todo('TODO Wave 1 — cache key includes orgId; cross-org collision impossible');
});
