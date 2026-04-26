import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 1 stub — populated by Plan 22-06.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W1-WEBHOOK — D-22 — camera.online/camera.offline payload contains tags: string[]
 *
 * NOTE: VALIDATION.md flags this row as "extend if exists; create otherwise". This file did NOT
 * pre-exist in apps/api/tests/status/, so it is created fresh as a Phase 22 stub.
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/api test -- tests/status/notify-dispatch.test.ts -x`)
 */
describe('Phase 22: webhook tags', () => {
  it.todo('TODO Wave 1 — camera.online webhook payload includes tags: string[] from Camera.tags');
  it.todo('TODO Wave 1 — camera.offline webhook payload includes tags: string[] from Camera.tags');
  it.todo('TODO Wave 1 — empty tags emits tags: [] (not undefined / not omitted) for stable schema');
  it.todo('TODO Wave 1 — payload uses display tags (D-04 casing), not tagsNormalized');
});
