---
phase: 21-hot-reload-stream-profile-changes-to-running-cameras
plan: 01
subsystem: testing

tags: [vitest, it-todo, scaffold, nyquist, validation, phase-21, hot-reload]

requires:
  - phase: 21-research
    provides: "21-RESEARCH.md §8 Validation Architecture (decision-to-test mapping)"
  - phase: 21-context
    provides: "21-CONTEXT.md D-01..D-11 + B-1 collision-guard requirement"
provides:
  - "9 backend it.todo test scaffolds covering D-01..D-11 + maintenance-gate + status-filter + B-1 collision guard"
  - "1 frontend it.todo test scaffold covering D-06 ProfileFormDialog toast variants"
  - "21-VALIDATION.md per-task verification map filled with 11 task-ID rows (21-01-T1..21-06-T2)"
  - "Frontmatter signal: status=ready, nyquist_compliant=true, wave_0_complete=true"
affects: [21-02, 21-03, 21-04, 21-05, 21-06]

tech-stack:
  added: []
  patterns:
    - "it.todo (vitest) as Wave 0 scaffold idiom — files parse, tests report as todo, later plans flip them to real it() blocks"
    - "describe-block naming convention: 'Phase 21 — D-XX <name>' identifies decision under test at-a-glance"

key-files:
  created:
    - "apps/api/tests/streams/profile-fingerprint.test.ts (12 todos, 16 lines) — D-01"
    - "apps/api/tests/streams/stream-profile-restart.test.ts (9 todos, 13 lines) — D-01/D-04/maintenance/status"
    - "apps/api/tests/streams/profile-restart-audit.test.ts (7 todos, 11 lines) — D-07"
    - "apps/api/tests/streams/profile-restart-dedup.test.ts (5 todos, 9 lines) — D-03/Q5"
    - "apps/api/tests/streams/profile-restart-failure-fallthrough.test.ts (3 todos, 7 lines) — D-09"
    - "apps/api/tests/streams/ffmpeg-graceful-restart.test.ts (6 todos, 10 lines) — D-05"
    - "apps/api/tests/streams/stream-profile-delete-protection.test.ts (6 todos, 10 lines) — D-10"
    - "apps/api/tests/cameras/camera-profile-reassign.test.ts (9 todos, 13 lines) — D-02"
    - "apps/api/tests/resilience/camera-health-restart-collision.test.ts (4 todos, 8 lines) — B-1"
    - "apps/web/src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx (7 todos, 11 lines) — D-06"
  modified:
    - ".planning/phases/21-hot-reload-stream-profile-changes-to-running-cameras/21-VALIDATION.md (per-task map filled, frontmatter wave_0_complete=true / nyquist_compliant=true / status=ready, sign-off approved)"

key-decisions:
  - "Used describe-block naming 'Phase 21 — D-XX <name>' so future executors can grep decisions to tests in O(1)"
  - "All scaffolds intentionally skip importing production source — purely it.todo to avoid coupling to file paths that plans 02-06 may relocate"
  - "B-1 collision-guard scaffold lives in apps/api/tests/resilience/ alongside existing camera-health.test.ts — keeps related lifecycle tests co-located"

patterns-established:
  - "Wave 0 scaffold contract: files parse via vitest --run, every assertion is it.todo, files appear in numTodoTests count, 0 passing 0 failing"
  - "Nyquist closure idiom: VALIDATION.md per-task map column 'File Exists' references the Wave 0 task that created the scaffold (e.g. '✓ from 21-01-T1')"

requirements-completed: []  # Phase 21 has no REQUIREMENTS.md IDs — gap-closure phase, decisions tracked via D-01..D-11 in 21-CONTEXT.md

# Metrics
duration: 8min
completed: 2026-04-25
---

# Phase 21 Plan 01: Wave 0 Scaffolds + Nyquist Map Summary

**10 it.todo test scaffold files (9 backend + 1 frontend) plus a fully-filled 21-VALIDATION.md per-task verification map giving plans 02-06 a Nyquist-compliant automated-verify command for every code-producing task.**

## Performance

- **Duration:** ~8 min (including pnpm install bootstrap)
- **Started:** 2026-04-25T08:51:39Z
- **Completed:** 2026-04-25T08:59:39Z
- **Tasks:** 3
- **Files created:** 10
- **Files modified:** 1

## Accomplishments

- 9 backend it.todo scaffolds (61 todos total) covering every Phase 21 decision (D-01..D-11), the maintenance-gate, status-filter, and B-1 camera-health collision guard
- 1 frontend it.todo scaffold (7 todos) covering D-06 ProfileFormDialog affectedCameras toast variants
- 21-VALIDATION.md per-task map filled with 11 rows (21-01-T1..21-06-T2) — every code-producing task in plans 02-06 now has a concrete `pnpm --filter @sms-platform/api test ...` automated command pointing to a real Wave 0 file
- Frontmatter flipped: `status: ready`, `nyquist_compliant: true`, `wave_0_complete: true`, `last_updated: 2026-04-25`
- Validation Sign-Off: all 6 boxes checked, Approval pending → approved

## Task Commits

1. **Task 21-01-T1: Create 9 backend test scaffold files with it.todo stubs** — `1ecbbed` (test)
2. **Task 21-01-T2: Create frontend D-06 toast test scaffold** — `012f60a` (test)
3. **Task 21-01-T3: Fill 21-VALIDATION.md per-task map and set wave_0_complete** — `8ba459e` (docs)

## Files Created/Modified

### Created (backend, 9 files)

- `apps/api/tests/streams/profile-fingerprint.test.ts` — D-01 fingerprint hash-stability test scaffold (12 todos)
- `apps/api/tests/streams/stream-profile-restart.test.ts` — D-01/D-04/maintenance-gate/status-filter scaffold (9 todos)
- `apps/api/tests/streams/profile-restart-audit.test.ts` — D-07 audit row at enqueue time scaffold (7 todos)
- `apps/api/tests/streams/profile-restart-dedup.test.ts` — D-03/Q5 remove-then-add latest-wins scaffold (5 todos)
- `apps/api/tests/streams/profile-restart-failure-fallthrough.test.ts` — D-09 retry exhaustion → degraded scaffold (3 todos)
- `apps/api/tests/streams/ffmpeg-graceful-restart.test.ts` — D-05 SIGTERM→wait→SIGKILL helper scaffold (6 todos)
- `apps/api/tests/streams/stream-profile-delete-protection.test.ts` — D-10 service-layer 409 scaffold (6 todos)
- `apps/api/tests/cameras/camera-profile-reassign.test.ts` — D-02 reassign trigger + null-cases scaffold (9 todos)
- `apps/api/tests/resilience/camera-health-restart-collision.test.ts` — B-1 collision guard scaffold (4 todos)

### Created (frontend, 1 file)

- `apps/web/src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx` — D-06 ProfileFormDialog affectedCameras toast scaffold (7 todos)

### Modified (planning, 1 file)

- `.planning/phases/21-hot-reload-stream-profile-changes-to-running-cameras/21-VALIDATION.md` — replaced placeholder per-task row with 11 filled rows; flipped 3 frontmatter flags + added `last_updated`; checked all 6 sign-off boxes; updated Approval line

## 21-VALIDATION.md Per-Task Map Snapshot

| Task ID | Plan | Wave | Status |
|---------|------|------|--------|
| 21-01-T1 | 21-01 | 0 | ✅ green |
| 21-01-T2 | 21-01 | 0 | ✅ green |
| 21-02-T1 | 21-02 | 1 | ⬜ pending |
| 21-02-T2 | 21-02 | 1 | ⬜ pending |
| 21-03-T1 | 21-03 | 1 | ⬜ pending |
| 21-04-T1 | 21-04 | 2 | ⬜ pending |
| 21-04-T2 | 21-04 | 2 | ⬜ pending |
| 21-05-T1 | 21-05 | 3 | ⬜ pending |
| 21-05-T2 | 21-05 | 3 | ⬜ pending |
| 21-06-T1 | 21-06 | 4 | ⬜ pending |
| 21-06-T2 | 21-06 | 4 | ⬜ pending |

Subsequent plans (02-06) inherit a fully-mapped Nyquist contract: every code-producing task has a single-line automated command pointing at a real on-disk file, so feedback latency stays well under the 30s budget.

**Note:** B-1 collision-guard scaffold (`apps/api/tests/resilience/camera-health-restart-collision.test.ts`) was added in revision iter 1 to close the Phase 15 D-11 + Phase 21 jobId-collision gap. The 21-04-T2 row in the per-task map references this file alongside the dedup/failure scaffolds.

## Verification Output

### Backend (9 files)

```
Test Files  9 skipped (9)
     Tests  61 todo (61)
  Duration  1.43s
```

### Frontend (1 file)

```
Test Files  1 skipped (1)
     Tests  7 todo (7)
  Duration  0.79s
```

Plan success criterion `>= 54 todo and 0 failing` exceeded (61 todo). Frontend success criterion `7 todo and 0 failing` met exactly.

## Decisions Made

- **Co-locate B-1 scaffold under tests/resilience/** — file lives alongside existing `camera-health.test.ts` and other lifecycle tests rather than under `tests/streams/`, matching the existing repo convention where boot-recovery / shutdown / srs-restart-detection live together.
- **Do NOT import production source from Wave 0 scaffolds** — every scaffold is import-free except for `vitest`. This avoids coupling the scaffolds to file paths that plans 02-06 may relocate (e.g. `src/streams/utils/profile-fingerprint.util.ts` may end up under a slightly different path; the scaffold should still parse).
- **Use describe-block naming `Phase 21 — D-XX <name>`** — gives executors a one-grep mapping from decision IDs to test files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bootstrapped worktree node_modules + Prisma client**

- **Found during:** Task 21-01-T1 verify (`pnpm exec vitest --run`)
- **Issue:** Worktree at `.claude/worktrees/agent-a7a829d0/` had no `node_modules/` and no generated Prisma client, so vitest's `tests/setup.ts` (`import { PrismaClient } from '@prisma/client'`) failed with "Failed to load url @prisma/client". This blocked Task 1 verification.
- **Fix:** Copied `apps/api/.env.test` from the parent worktree (gitignored, so not committed), then ran `pnpm install --frozen-lockfile --prefer-offline` which used the pnpm store cache and triggered `prisma generate` via the apps/api postinstall hook. ~17s total.
- **Files modified:** None tracked in git — `.env.test`, `node_modules/`, and the generated Prisma client are all in `.gitignore`.
- **Verification:** Re-running the Task 1 verify command produced the expected `9 test files / 61 todo` output.
- **Committed in:** No commit needed — install artifacts are gitignored.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary worktree bootstrap, no behavior change, no scope creep.

## Issues Encountered

- Initial vitest run reported `numTotalTestSuites: 18, numPassedTestSuites: 18` while only 9 files were created. Investigation: vitest counts each top-level `describe()` block as a "test suite" in addition to the file (so 9 files × 2 suite-counts each = 18). The non-verbose human reporter correctly shows `Test Files 9 skipped (9)` — this is a vitest reporter quirk, not a problem. Plan success criterion is based on `Tests: ... todo` count, which was 61 (vs required >= 54).

## Next Phase Readiness

- All Wave 0 contracts satisfied — plans 02 (D-01 fingerprint util + D-07 update trigger), 03 (D-02 reassign), 04 (D-05 graceful restart + D-03/D-08/D-09 enqueue+execution + B-1 collision guard), 05 (D-10 delete + D-06 toast), 06 (regression suite + manual UAT) can begin in parallel where waves allow.
- 21-VALIDATION.md is now the canonical Nyquist contract — sub-30s feedback latency on every Wave 1+ task.
- No blockers.

## Self-Check: PASSED

Verified all created files exist on disk and all 3 task commits are present in git history:

- `apps/api/tests/streams/profile-fingerprint.test.ts` — FOUND
- `apps/api/tests/streams/stream-profile-restart.test.ts` — FOUND
- `apps/api/tests/streams/profile-restart-audit.test.ts` — FOUND
- `apps/api/tests/streams/profile-restart-dedup.test.ts` — FOUND
- `apps/api/tests/streams/profile-restart-failure-fallthrough.test.ts` — FOUND
- `apps/api/tests/streams/ffmpeg-graceful-restart.test.ts` — FOUND
- `apps/api/tests/streams/stream-profile-delete-protection.test.ts` — FOUND
- `apps/api/tests/cameras/camera-profile-reassign.test.ts` — FOUND
- `apps/api/tests/resilience/camera-health-restart-collision.test.ts` — FOUND
- `apps/web/src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx` — FOUND
- `.planning/phases/21-hot-reload-stream-profile-changes-to-running-cameras/21-VALIDATION.md` — MODIFIED

Commits: `1ecbbed`, `012f60a`, `8ba459e` — all FOUND in `git log`.

---
*Phase: 21-hot-reload-stream-profile-changes-to-running-cameras*
*Plan: 01*
*Completed: 2026-04-25*
