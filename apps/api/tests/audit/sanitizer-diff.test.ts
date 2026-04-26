import { describe, it, expect } from 'vitest';
import { sanitizeDetails } from '../../src/audit/audit.service';

/**
 * Phase 22 Plan 22-04 — sanitizeDetails preserves diff key (D-24, T-22-03).
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W1-SANITIZER — D-24 — sanitizeDetails preserves diff key (not in SENSITIVE_KEYS_PATTERN)
 *   threat: T-22-03 (info leak — diff must NOT be sanitized away)
 *
 * Why this test exists: the audit sanitizer at audit.service.ts:5-22 matches
 * KEY names (not values) against /password|secret|token|apiKey|keyHash/i.
 * `diff` is NOT in that pattern, so it survives. If a future contributor
 * tightens the sanitizer to match values OR adds `diff` to the redaction
 * list, this test catches the regression — Plan 22-04's audit diff would
 * silently start emitting [REDACTED] for tag/description changes.
 *
 * The 4 cases are scoped to the BEHAVIOR contract, not the implementation:
 *   1. diff key preserved (top-level)
 *   2. values that LOOK like sensitive key NAMES (as strings) are NOT redacted
 *      (sanitizer matches keys, not values — verified explicitly)
 *   3. sibling redaction of password/etc. still works alongside diff
 *   4. RECURSIVE redaction inside diff: a key matching the pattern IS
 *      still redacted even when nested under `diff` — Phase 22 only stores
 *      `diff.tags` and `diff.description`, neither matches the pattern, so
 *      this test documents the intentional behavior (wrapping under diff
 *      does NOT bypass key-based redaction).
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/api test -- tests/audit/sanitizer-diff.test.ts`)
 */
describe('Phase 22: sanitizeDetails preserves diff key', () => {
  it('preserves diff structure unchanged', () => {
    const input = { diff: { tags: { before: ['a'], after: ['b'] } } };
    expect(sanitizeDetails(input)).toEqual(input);
  });

  it('does not redact values that look like sensitive keys', () => {
    // Sanitizer matches KEY names against /password|secret|token|apiKey|keyHash/i.
    // The strings "apiKey", "secret", "token" appearing as VALUES (array
    // members here) MUST survive untouched — only key names trigger the
    // [REDACTED] replacement.
    const input = {
      diff: { tags: { before: ['apiKey'], after: ['secret', 'token'] } },
    };
    expect(sanitizeDetails(input)).toEqual(input);
  });

  it('redacts top-level password but preserves sibling diff', () => {
    const input = {
      password: 'foo',
      diff: { tags: { before: ['x'], after: ['y'] } },
    };
    const result = sanitizeDetails(input) as any;
    expect(result.password).toBe('[REDACTED]');
    expect(result.diff).toEqual({ tags: { before: ['x'], after: ['y'] } });
  });

  it('redacts apiKey AS A KEY inside diff (correct recursive behavior)', () => {
    // This documents that wrapping under `diff` does NOT bypass key-based
    // redaction — the sanitizer descends recursively. Phase 22 never stores
    // a literal "apiKey" key under diff (we only emit diff.tags and
    // diff.description), so this is defensive: if some other phase adds a
    // sensitive key under diff, the existing recursive redaction catches it.
    const input = {
      diff: { apiKey: 'leaked', tags: { before: ['a'], after: ['b'] } },
    };
    const result = sanitizeDetails(input) as any;
    expect(result.diff.apiKey).toBe('[REDACTED]');
    expect(result.diff.tags).toEqual({ before: ['a'], after: ['b'] });
  });
});
