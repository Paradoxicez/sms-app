import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 2 stub — populated by Plan 22-08.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W2-TOOLTIP — D-17 / D-18 — Camera-name description tooltip; suppressed when empty; max-w-320
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/web test -- cameras-columns-tooltip -x`)
 */
describe('Phase 22: Camera-name description tooltip', () => {
  it.todo('TODO Wave 2 — hovering camera name shows tooltip with description text');
  it.todo('TODO Wave 2 — tooltip is suppressed when description is empty/null');
  it.todo('TODO Wave 2 — tooltip respects max-width 320px (D-18)');
  it.todo('TODO Wave 2 — long descriptions wrap inside tooltip; do not overflow viewport');
});
