import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 1 stub — populated by Plan 22-05.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W1-SANITIZER — D-24 — sanitizeDetails preserves diff key (not in SENSITIVE_KEYS_PATTERN)
 *   threat: T-22-03 (info leak — diff must NOT be sanitized away)
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/api test -- tests/audit/sanitizer-diff.test.ts -x`)
 */
describe('Phase 22: sanitizeDetails preserves diff key', () => {
  it.todo('TODO Wave 1 — sanitizeDetails({diff: {tags: {...}}}) returns object with diff intact');
  it.todo('TODO Wave 1 — diff values are NOT redacted to [REDACTED]');
  it.todo('TODO Wave 1 — sibling secret fields (e.g., apiKey) still get redacted alongside diff');
  it.todo('TODO Wave 1 — nested diff.description preserves before/after literal values');
});
