import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 2 stub — populated by Plan 22-07.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W2-COMBOBOX — D-08 / D-09 — TagInputCombobox chip behavior
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/web test -- tag-input-combobox -x`)
 */
describe('Phase 22: TagInputCombobox chip behavior', () => {
  it.todo('TODO Wave 2 — Enter commits typed value as a chip');
  it.todo('TODO Wave 2 — Backspace on empty input removes the last chip');
  it.todo('TODO Wave 2 — case-insensitive dedup blocks adding duplicate chip ("Lobby" then "lobby")');
  it.todo('TODO Wave 2 — "+ Add" row visible only when typed value has no existing match');
  it.todo('TODO Wave 2 — selecting an existing tag from suggestions adds it as chip');
  it.todo('TODO Wave 2 — clicking chip × removes that chip from value');
});
