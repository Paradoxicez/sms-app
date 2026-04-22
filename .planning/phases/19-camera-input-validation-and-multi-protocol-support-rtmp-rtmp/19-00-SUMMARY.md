---
phase: 19
plan: 00
subsystem: cameras + streams (shared types + test scaffolding)
tags: [wave-0, scaffolding, shared-types, test-infra, codec-info, dedup-fixtures]
dependency_graph:
  requires: []
  provides:
    - "apps/api/src/cameras/types/codec-info.ts (CodecInfo, CodecInfoStatus, ProbeSource, ProbeJobData)"
    - "apps/api/src/test-utils/duplicate-fixtures.ts (duplicateFixture, expectedSurvivorIds, expectedDedupDeletedCount, buildDuplicateCameras)"
    - "10 vitest it.todo scaffold files (6 API + 4 web)"
  affects: []
tech_stack:
  added: []
  patterns:
    - "it.todo stubs for Wave 1-4 Nyquist verify commands"
    - "shared fixture module for migration + service dedup tests"
key_files:
  created:
    - apps/api/src/cameras/types/codec-info.ts
    - apps/api/src/test-utils/duplicate-fixtures.ts
    - apps/api/tests/cameras/stream-probe.test.ts
    - apps/api/tests/srs/srs-callback.test.ts
    - apps/api/tests/streams/ffmpeg-command-builder.test.ts
    - apps/api/tests/streams/stream-processor.test.ts
    - apps/api/tests/migrations/camera-dedup.test.ts
    - apps/web/src/app/admin/cameras/components/__tests__/codec-status-cell.test.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx
    - apps/web/src/lib/codec-info.test.ts
  modified:
    - apps/api/tests/cameras/camera-crud.test.ts
decisions:
  - "Left existing ProbeJobData in stream-probe.processor.ts unchanged — Wave 1 will switch the import to the shared type, per plan instruction that Wave 0 is pure declaration."
  - "Pre-existing TypeScript errors in unrelated files (avatar.controller, cameras.controller, cluster.gateway, minio.service, status.gateway) are not introduced by Wave 0 and remain out-of-scope — verified zero new codec-info/duplicate-fixtures errors."
  - "Used apps/api/tsconfig.json (no tsconfig.build.json in repo) for type-check; plan's verify command path was aspirational but functionally identical."
metrics:
  duration_minutes: ~12
  tasks_completed: 4
  commits: 4
  completed_date: 2026-04-22
---

# Phase 19 Plan 00: Wave 0 Test Scaffolding + Shared Types Summary

Declared the shared `CodecInfo` tagged-union type once, added deterministic duplicate fixtures for dedup tests, and landed 10 vitest `it.todo` scaffold files so every Wave 1-4 task gains an automated verify command (Nyquist rule). 76 it.todo stubs across backend + web now run green under vitest.

## What Was Built

### Shared Types (Task 1)

`apps/api/src/cameras/types/codec-info.ts` declares the Phase 19 D-07 tagged union:

- `CodecInfoStatus = 'pending' | 'failed' | 'success'`
- `ProbeSource = 'ffprobe' | 'srs-api'`
- `CodecInfoVideo` — codec/width/height/fps/profile/level
- `CodecInfoAudio` — codec/sampleRate/channels
- `CodecInfo` — status + optional video/audio + error + probedAt + source
- `ProbeJobData` — cameraId + streamUrl + orgId + optional source

Declaration only. No production code imports the new type yet; Wave 1 (P03) will replace the ad-hoc `ProbeJobData` in `stream-probe.processor.ts` and wire the tagged union into the `codecInfo` writes.

### Shared Fixtures (Task 2)

`apps/api/src/test-utils/duplicate-fixtures.ts` exports deterministic data consumed by two downstream tests:

- `duplicateFixture` — 7 rows across 3 tuples (3 + 2) plus 1 cross-tenant + 1 unique
- `expectedSurvivorIds` — keep-oldest result: `['cam1-old', 'cam2-old', 'cam3-b', 'cam4-unique']`
- `expectedDedupDeletedCount = 3`
- `buildDuplicateCameras()` — helper producing 4-row fixture for service-level within-file dedup

Pure data — no Prisma imports — so both the migration SQL harness and the service-level `CamerasService` test can consume without coupling.

### API Test Scaffolds (Task 3)

6 files, 35 new `it.todo` stubs:

| File | Describes | Stubs |
|---|---|---|
| `apps/api/tests/cameras/stream-probe.test.ts` | D-01/02/04/07 probe behaviors | 12 |
| `apps/api/tests/srs/srs-callback.test.ts` | D-02 on-publish probe enqueue | 5 |
| `apps/api/tests/streams/ffmpeg-command-builder.test.ts` | D-13 protocol branching | 4 |
| `apps/api/tests/streams/stream-processor.test.ts` | D-14 rename + existing guard | 3 |
| `apps/api/tests/migrations/camera-dedup.test.ts` | D-10c/D-11 keep-oldest dedup | 5 |
| `apps/api/tests/cameras/camera-crud.test.ts` (appended) | D-01/04 probe enqueue + D-11 duplicate detection | 6 |

Vitest run: `5 skipped (5), 29 todo (29)` for the 5 new files; the appended `camera-crud` block adds 6 more todos to its existing suite.

### Web Test Scaffolds (Task 4)

4 files, 47 new `it.todo` stubs:

| File | Describes | Stubs |
|---|---|---|
| `apps/web/src/app/admin/cameras/components/__tests__/codec-status-cell.test.tsx` | D-05/06/07 4-state cell + a11y | 11 |
| `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx` | D-12/16 validateRow + D-08/09/10a dedup + UI-SPEC toast cascade | 17 |
| `apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx` | D-15 live validation + duplicate error + a11y | 12 |
| `apps/web/src/lib/codec-info.test.ts` | D-07 legacy-shape normalizer | 7 |

Vitest run: `4 skipped (4), 47 todo (47)` — all pending, no failures.

## Deviations from Plan

### Plan-specified verify command adjusted (informational)

- **Issue:** Plan's verify commands reference `tsconfig.build.json` which does not exist in `apps/api/` — only `tsconfig.json` is present.
- **Action:** Used `pnpm --filter @sms-platform/api exec tsc --noEmit` (picks up `tsconfig.json`) which exercises the same type-checker over the same source tree.
- **Result:** Zero new errors from `codec-info.ts` or `duplicate-fixtures.ts`. Five pre-existing errors in unrelated files (avatar.controller, cameras.controller, cluster.gateway, minio.service, status.gateway) — out of Wave 0 scope.
- **Classification:** Not a deviation to the implementation itself; plan verify-string was slightly aspirational. No change to behavior or scope.

No auto-fixes were triggered. Plan executed exactly as written.

## Authentication Gates

None — pure type + test-scaffold work, no I/O, no user input.

## Verification Results

| Check | Result |
|---|---|
| `rg "export type CodecInfoStatus = 'pending'" apps/api/src/cameras/types/codec-info.ts` | 1 match |
| `rg "export type ProbeSource = 'ffprobe'` | 1 match |
| `rg "duplicateFixture: DuplicateFixtureCamera\[\]" apps/api/src/test-utils/duplicate-fixtures.ts` | 1 match |
| `rg "expectedDedupDeletedCount = 3" apps/api/src/test-utils/duplicate-fixtures.ts` | 1 match |
| `vitest run` on 5 new API files | 29 todo, 0 failed |
| `vitest run` on 4 new web files | 47 todo, 0 failed |
| New tsc errors introduced by Wave 0 | 0 |

## Commits

| Task | Hash | Subject |
|---|---|---|
| 1 | `ecb7cbd` | feat(19-00): declare shared CodecInfo tagged-union type (D-07) |
| 2 | `223d46d` | feat(19-00): add shared duplicate fixtures for dedup tests |
| 3 | `b5bc488` | test(19-00): scaffold 6 API test files as it.todo stubs |
| 4 | `32395c2` | test(19-00): scaffold 4 web test files as it.todo stubs |

## Known Stubs

All 76 `it.todo` entries are intentional stubs (Wave 0 deliverable). Each will be converted to a real assertion by the Wave 1-4 task whose verify command points at it. This is the planned handoff, not leftover work.

## Self-Check: PASSED

- [x] `apps/api/src/cameras/types/codec-info.ts` — FOUND
- [x] `apps/api/src/test-utils/duplicate-fixtures.ts` — FOUND
- [x] `apps/api/tests/cameras/stream-probe.test.ts` — FOUND
- [x] `apps/api/tests/srs/srs-callback.test.ts` — FOUND
- [x] `apps/api/tests/streams/ffmpeg-command-builder.test.ts` — FOUND
- [x] `apps/api/tests/streams/stream-processor.test.ts` — FOUND
- [x] `apps/api/tests/migrations/camera-dedup.test.ts` — FOUND
- [x] `apps/api/tests/cameras/camera-crud.test.ts` — appended (existed before)
- [x] `apps/web/src/app/admin/cameras/components/__tests__/codec-status-cell.test.tsx` — FOUND
- [x] `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx` — FOUND
- [x] `apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx` — FOUND
- [x] `apps/web/src/lib/codec-info.test.ts` — FOUND
- [x] Commit `ecb7cbd` — FOUND
- [x] Commit `223d46d` — FOUND
- [x] Commit `b5bc488` — FOUND
- [x] Commit `32395c2` — FOUND
