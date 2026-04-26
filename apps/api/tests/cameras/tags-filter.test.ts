import { describe, it } from 'vitest';

/**
 * Phase 22 Wave 1 stub — populated by Plan 22-02.
 *
 * Reference: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-VALIDATION.md
 *   row 22-W1-FILTER — D-06 (filter) — `?tags[]=Lobby` returns rows tagged lobby/LOBBY/Lobby
 *
 * Sampling rate: per-task quick run (`pnpm --filter @sms-platform/api test -- tests/cameras/tags-filter.test.ts -x`)
 */
describe('Phase 22: ?tags[]= filter case-insensitive OR semantics', () => {
  it.todo('TODO Wave 1 — single-tag filter matches case-insensitively against tagsNormalized');
  it.todo('TODO Wave 1 — multi-tag filter applies OR semantics (camera matches if ANY tag matches)');
  it.todo('TODO Wave 1 — filter respects RLS — Org A query never returns Org B cameras');
  it.todo('TODO Wave 1 — empty tags[] array does not break listing endpoint');
});
