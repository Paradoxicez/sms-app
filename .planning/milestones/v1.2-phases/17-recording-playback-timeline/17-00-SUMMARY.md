---
phase: 17-recording-playback-timeline
plan: 00
subsystem: testing
tags: [vitest, react-testing-library, scaffold, mocks, recordings, hls, timeline]

# Dependency graph
requires:
  - phase: 14-foundation-fixes
    provides: DataTable component with FOUND-01a..01e tests + onRowClick groundwork
  - phase: 11-recordings
    provides: RecordingsService cross-camera-list mock-Prisma test pattern
provides:
  - "Six test scaffolds (5 new + 1 extended) for Phase 17 RED→GREEN flow"
  - "Wired mock contracts: useFeatures, useSession, next/navigation, @/lib/api"
  - "RecordingsService.getRecording mock-Prisma DI scaffold (T-17-V4)"
  - "useRecording hook contract scaffold (T-17-V7)"
  - "TimelineBar heatmap test scaffold (REC-03)"
  - "PlaybackPage REC-01/REC-02 + error-state scaffolds"
  - "DataTable FOUND-01f onRowClick scaffold"
affects: [17-01-recordings-page-rework, 17-02-playback-api-and-hook, 17-03-timeline-bar, 17-04-playback-page-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave-0 test scaffolding: stub it.todo first, fill assertions in implementation plan"
    - "Mock DI for service tests: tenancyClient + rawPrisma vi.fn() objects passed directly to RecordingsService constructor"
    - "Mock-Provider wiring at file top: vi.mock for @/hooks/use-features, @/lib/auth-client, next/navigation, @/lib/api"

key-files:
  created:
    - apps/web/src/__tests__/playback-page.test.tsx
    - apps/web/src/__tests__/playback-page-feature-gate.test.tsx
    - apps/web/src/__tests__/timeline-bar.test.tsx
    - apps/web/src/__tests__/use-recording-hook.test.ts
    - apps/api/tests/recordings/get-recording.test.ts
    - .planning/phases/17-recording-playback-timeline/deferred-items.md
  modified:
    - apps/web/src/__tests__/data-table.test.tsx

key-decisions:
  - "Use it.todo (not it.skip) so Vitest reports todos in summary and downstream agents can grep for them"
  - "Mirror cross-camera-list.test.ts mock-Prisma pattern verbatim — RecordingsService constructed directly with mock tenancyClient + rawPrisma + minioService"
  - "Hook test scaffold deliberately omits hook import — keeps 17-00 a pure scaffold; plan 17-02 adds the import alongside the implementation"

patterns-established:
  - "RED scaffolding pattern: full mock wiring + it.todo placeholders so suite stays green until implementation un-todos"
  - "Tag tests by validation ID: REC-01, REC-02, REC-03, FOUND-01f, T-17-V4, T-17-V7 — grep-friendly for downstream traceability"

requirements-completed: [REC-01, REC-02, REC-03]

# Metrics
duration: 3min
completed: 2026-04-19
---

# Phase 17 Plan 00: Wave 0 Test Scaffolds Summary

**Six test scaffolds (5 new + 1 extended) wired with mocks and `it.todo` placeholders so plans 17-01..17-04 can drive RED→GREEN by un-`todo`ing during implementation**

## Performance

- **Duration:** ~3 min (211s wall clock; one-time `pnpm install` ran in 12.5s but is amortized)
- **Started:** 2026-04-19T18:11:34Z
- **Completed:** 2026-04-19T18:15:05Z
- **Tasks:** 3 / 3
- **Files modified:** 7 (6 test scaffolds + 1 deferred-items doc)

## Accomplishments

- Created 5 new test files containing 21 `it.todo` stubs across REC-01, REC-02, REC-03, T-17-V4, T-17-V7 and supporting cases
- Extended `data-table.test.tsx` with the FOUND-01f onRowClick describe block (5 stubs) without touching any existing assertions
- Verified the full `apps/web` suite remains green: 132 tests pass, 24 todos reported, zero failures
- Verified the new `apps/api/tests/recordings/get-recording.test.ts` runs standalone (4 todos) using the established mock-Prisma DI pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Web test scaffolds (3 new + 1 extended)** — `bc3a861` (test)
2. **Task 2: API getRecording test scaffold** — `da99808` (test)
3. **Task 3: useRecording hook test scaffold** — `8eca7ea` (test)

**Plan metadata commit:** _to be added by orchestrator after this plan finishes._

## Files Created/Modified

- `apps/web/src/__tests__/playback-page.test.tsx` — REC-01 mount, REC-02 click-to-seek + empty hour no-op, date-change navigation, 3 error states (404/forbidden/network)
- `apps/web/src/__tests__/playback-page-feature-gate.test.tsx` — feature-gate stubs for the `[id]` route
- `apps/web/src/__tests__/timeline-bar.test.tsx` — REC-03 heatmap render stubs (3 cases)
- `apps/web/src/__tests__/use-recording-hook.test.ts` — useRecording contract: 7 cases (initial mount, success, 3 error states, undefined-id no-fetch, id-change refetch)
- `apps/api/tests/recordings/get-recording.test.ts` — 4 cases: camera include, cross-org 404, `_count.segments` preservation, NotFoundException
- `apps/web/src/__tests__/data-table.test.tsx` — appended FOUND-01f describe block with 5 `it.todo`s for onRowClick

## Decisions Made

- **Use `it.todo` (not `it.skip`)** — Vitest reports todos prominently in the summary line, making it trivial for downstream agents to grep `it.todo` and find scaffolds awaiting implementation.
- **Reuse cross-camera-list.test.ts mock-Prisma DI pattern verbatim** — keeps the API test pattern uniform across the recordings module so plan 17-02 can copy/adapt without re-inventing.
- **Hook test scaffold does NOT import `useRecording`** — the hook lives at `@/hooks/use-recordings` and will be added by plan 17-02. Keeping the import out of 17-00 preserves the scaffold's "no implementation references" property and prevents an import error at suite-load time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Installed missing pnpm dependencies in worktree**
- **Found during:** Task 1 verification (`pnpm test` failed with `vitest: command not found`)
- **Issue:** This worktree (`.claude/worktrees/agent-a516675c`) had no `node_modules` — fresh worktree without bootstrap.
- **Fix:** Ran `pnpm install --prefer-offline` at worktree root.
- **Files modified:** None (only `node_modules/` populated, which is gitignored)
- **Verification:** `pnpm test --run` then succeeded.
- **Committed in:** N/A — `node_modules/` is not committed.

**2. [Rule 1 — Bug] Adjusted plan-supplied snippet for TypeScript strict mode**
- **Found during:** Task 1 (writing `playback-page.test.tsx`)
- **Issue:** The plan's snippet had `isEnabled: (k: string) => createMockFeatures({ recordings: true })[k] === true` which would fail TypeScript strict-mode index-access checks (`Element implicitly has 'any' type` for arbitrary string keys).
- **Fix:** Cast the key with `k as keyof ReturnType<typeof createMockFeatures>` so the index access is type-safe. Behavior identical at runtime.
- **Files modified:** `apps/web/src/__tests__/playback-page.test.tsx`
- **Verification:** `pnpm test --run src/__tests__/playback-page.test.tsx` exits 0.
- **Committed in:** `bc3a861`

**3. [Rule 2 — Missing Critical] Removed unused `createMockFeatures` import in feature-gate scaffold**
- **Found during:** Task 1 (writing `playback-page-feature-gate.test.tsx`)
- **Issue:** Plan snippet imported `createMockFeatures` but never used it inside the `it.todo` stubs (assertions live in plan 17-04). Importing without use would trigger `noUnusedLocals` lint failure on CI.
- **Fix:** Imported only `useFeaturesMockFn` and `resetUseFeaturesMock`. Plan 17-04 will re-add `createMockFeatures` when filling the assertions.
- **Files modified:** `apps/web/src/__tests__/playback-page-feature-gate.test.tsx`
- **Verification:** Suite passes; no unused-import warnings.
- **Committed in:** `bc3a861`

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug, 1 missing-critical)
**Impact on plan:** All deviations were small surface adjustments to keep the suite + TypeScript strict mode + lint clean. Zero scope creep — every scaffold remains a pure `it.todo` placeholder for downstream plans.

## Issues Encountered

- **Pre-existing: `apps/api` recordings suite fails to load when run as a directory due to missing `DATABASE_URL`.** All 9 existing `tests/recordings/*.test.ts` files require `tests/setup.ts` to `$connect` to Postgres. This worktree has no `apps/api/.env` (the main repo has it as `apps/api/.env -> ../../.env`). The new `get-recording.test.ts` itself runs cleanly because all its dependencies are mocked and all 4 cases are `it.todo`. **Logged as out-of-scope in `deferred-items.md`** — this is a worktree-bootstrap concern, not a Phase 17 deliverable.

## Deferred Issues

See `.planning/phases/17-recording-playback-timeline/deferred-items.md`:
- Worktree missing `apps/api/.env` symlink (pre-existing, unrelated to 17-00 scope)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All Wave 0 scaffolds in place. Plans 17-01 through 17-04 can begin RED→GREEN immediately by un-`todo`ing the relevant cases and filling in assertions alongside their implementation work.
- Suggested traceability matrix for downstream plans:
  - **17-02** fills: `playback-page.test.tsx` (REC-01 mount, error states), `use-recording-hook.test.ts` (all 7), `get-recording.test.ts` (all 4)
  - **17-03** fills: `timeline-bar.test.tsx` (all 3 REC-03 cases) after the component move
  - **17-04** fills: `playback-page.test.tsx` (REC-02 click-to-seek, empty-hour no-op, date-change), `playback-page-feature-gate.test.tsx` (both cases), `data-table.test.tsx` (FOUND-01f cases)

## Self-Check

**Files claimed created/modified:**
- `apps/web/src/__tests__/playback-page.test.tsx` — FOUND
- `apps/web/src/__tests__/playback-page-feature-gate.test.tsx` — FOUND
- `apps/web/src/__tests__/timeline-bar.test.tsx` — FOUND
- `apps/web/src/__tests__/use-recording-hook.test.ts` — FOUND
- `apps/api/tests/recordings/get-recording.test.ts` — FOUND
- `apps/web/src/__tests__/data-table.test.tsx` — MODIFIED (FOUND-01f appended at line 280)
- `.planning/phases/17-recording-playback-timeline/deferred-items.md` — FOUND

**Commits claimed:**
- `bc3a861` — FOUND in `git log`
- `da99808` — FOUND in `git log`
- `8eca7ea` — FOUND in `git log`

**Verification commands:**
- `pnpm test -- --run` (apps/web): 132 passed, 24 todo, 0 failed
- `pnpm vitest run tests/recordings/get-recording.test.ts` (apps/api): 4 todo, 0 failed
- `grep -l "it.todo" <5 files>`: all 5 files contain it.todo
- `grep "FOUND-01f" data-table.test.tsx`: 6 occurrences (5 stubs + 1 describe label)

## Self-Check: PASSED

---
*Phase: 17-recording-playback-timeline*
*Completed: 2026-04-19*
