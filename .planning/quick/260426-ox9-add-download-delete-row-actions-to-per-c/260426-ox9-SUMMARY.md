---
phase: quick/260426-ox9
plan: 01
subsystem: ui
tags: [react, nextjs, datatable, recordings, vitest, alertdialog]

requires:
  - phase: foundation/data-table
    provides: shared DataTable + DataTableRowActions primitives reused here
provides:
  - Per-camera Recordings detail-page table migrated to shared DataTable
  - Download + Delete kebab actions wired to backend endpoints
  - AlertDialog confirm with specific copy (time range + size)
  - Lifecycle hook for "deleted-current" navigation in playback page
affects:
  - any-future-recordings-table-features
  - any-future-row-action-pattern-changes

tech-stack:
  added: []
  patterns:
    - "Detail-page tables consume shared DataTable + DataTableRowActions instead of raw <Table> primitives"
    - "Specific destructive-confirm copy (time range + size) reduces accidental deletes"
    - "Parent owns refetch + post-delete navigation; presentational table stays decoupled from data layer / router"

key-files:
  created:
    - apps/web/src/app/app/recordings/[id]/components/__tests__/recordings-list.test.tsx
  modified:
    - apps/web/src/app/app/recordings/[id]/components/recordings-list.tsx
    - apps/web/src/app/app/recordings/[id]/page.tsx

key-decisions:
  - "Drop the per-row bg-accent/40 highlight on the current recording — DataTable does not expose a per-row className API; the leading Play icon is sufficient indicator (matches CONTEXT.md)"
  - "Time-range assertions in tests use date-fns format() so specs are timezone-independent (CI runs UTC, devs run local)"
  - "After successful delete: refetch first, then call onDeleted — guarantees parent receives a fresh list when deciding navigation"

patterns-established:
  - "Per-camera detail-page tables follow main listings pattern (DataTable + DataTableRowActions + AlertDialog confirm)"
  - "Destructive AlertDialog body should be specific (include identifying detail like time range + size) so users have concrete confirmation context"

requirements-completed:
  - QUICK-260426-ox9

duration: ~12 min
completed: 2026-04-26
---

# Quick Task 260426-ox9: Add Download + Delete row actions to per-camera Recordings detail table — Summary

**Per-camera Recordings detail-page table migrated to shared DataTable + DataTableRowActions with Download + Delete actions, AlertDialog confirm, and "deleted-current" navigation in playback page.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-26T11:10:00Z
- **Completed:** 2026-04-26T11:22:00Z
- **Tasks:** 3
- **Files modified:** 2 modified, 1 created

## Accomplishments

- `recordings-list.tsx` no longer imports raw `Table*` / `Skeleton` primitives — fully migrated to the shared `DataTable` + `DataTableRowActions` pattern used by the main Recordings listings page.
- Per-row kebab now exposes Download (opens `/api/recordings/:id/download` in a new tab + toast) and Delete (destructive, AlertDialog confirm with title `"Delete recording?"` and a body that includes the row's time range + size).
- After confirming Delete: calls `deleteRecording(id)` from `@/hooks/use-recordings`, awaits `refetch()` (lifted from parent), then calls `onDeleted(deletedId)` so the parent can navigate when the currently-playing recording was the one removed.
- `page.tsx` lifts `refetch` from `useRecordingsList` and adds `handleListDeleted` — falls forward to the next available recording on the same date or back to `/app/recordings`.
- Existing UX preserved: row-click navigation, leading "now playing" `Play` icon for the current row, date-range `h2`, DataTable skeleton on `loading`, "No recordings on this date" empty state.
- Vitest unit-test suite locks the contract (8 cases, all passing).

## Task Commits

Each task was committed atomically (code only — orchestrator commits docs separately):

1. **Task 1: Migrate recordings-list.tsx to DataTable + DataTableRowActions** — `0f21b78` (refactor)
2. **Task 2: Wire page.tsx with refetch + deleted-current handler** — `2f06ca2` (feat)
3. **Task 3: Add unit tests for the new row actions** — `4f1a136` (test)

## Files Created/Modified

- `apps/web/src/app/app/recordings/[id]/components/recordings-list.tsx` (modified, +171 / -80) — DataTable migration + Download + Delete + AlertDialog confirm
- `apps/web/src/app/app/recordings/[id]/page.tsx` (modified, +22 / -1) — lifted `refetch` + `handleListDeleted` post-delete navigation
- `apps/web/src/app/app/recordings/[id]/components/__tests__/recordings-list.test.tsx` (created, 216 lines) — 8 vitest cases

## Test Cases (Task 3)

| # | Case | Status |
| - | ---- | ------ |
| 1 | Renders columns in the correct order including the kebab actions column | PASS |
| 2 | Now-playing icon renders only on the current row | PASS |
| 3 | Download action opens the download URL in a new tab and shows toast | PASS |
| 4 | Delete action opens AlertDialog with specific copy (time range + size) | PASS |
| 5 | Confirming Delete calls deleteRecording, refetch, and onDeleted with the deleted id | PASS |
| 6 | Kebab clicks do NOT trigger onRowClick (stopPropagation contract) | PASS |
| 7 | Loading state delegates to DataTable skeleton rows (no empty-state copy) | PASS |
| 8 | Empty state shows the expected copy when not loading and recordings is empty | PASS |

**Total:** 8/8 pass.

## Verification

- `cd apps/web && pnpm tsc --noEmit` — No errors
- `cd apps/web && pnpm vitest run src/app/app/recordings/[id]/components/__tests__/recordings-list.test.tsx` — 8/8 pass
- `cd apps/web && pnpm vitest run src/__tests__/playback-page.test.tsx` (regression guard) — 7/7 pass
- `cd apps/web && pnpm vitest run` (full suite) — 556 pass, 1 skipped, 3 pre-existing failures in unrelated `bulk-import-dialog*` tests (see deferred-items.md)

## Decisions Made

- **Drop per-row background highlight.** The old raw-table implementation used `bg-accent/40` on the current recording row. DataTable does not expose a per-row `className`, and forking it for one cosmetic accent would balloon scope. The leading `Play` icon is sufficient (and matches CONTEXT.md decision "leading 'now playing' icon"). Documented inline in the new file.
- **Test assertions use `format()` instead of hardcoded `08:00`.** The component formats UTC ISO strings via `format(new Date(...), 'HH:mm')`, which respects the local timezone. Hardcoded `08:00` would only pass in UTC timezones. Computing the expected `HH:mm` from the same formatter inside the test makes assertions timezone-independent (passes locally + UTC CI).
- **`refetch` runs before `onDeleted`.** This guarantees that when the parent's `handleListDeleted` reads `recordings`, it's already the post-delete list — making "pick the next recording" a simple `find()` (with a defensive `r.id !== deletedId` filter as a safety net, not a load-bearing requirement).

## Deviations from Plan

None substantial. The plan was executed exactly as written for all three tasks. Two minor in-task adjustments worth noting:

### Test-only adjustments

**1. [Rule 1 - Test bug] Timezone-independent time-range assertions**
- **Found during:** Task 3 first vitest run
- **Issue:** Initial test draft hardcoded `08:00 - 09:00` for a `2026-04-26T08:00:00.000Z` recording. The component uses `format(date, 'HH:mm')` which respects local timezone — the assertion failed in non-UTC environments (the local dev machine is UTC+7, rendering `15:00 - 16:00`).
- **Fix:** Imported `format` from `date-fns` in the test file and computed expected `HH:mm` strings with the same formatter the component uses. Now passes in any timezone.
- **Files modified:** `apps/web/src/app/app/recordings/[id]/components/__tests__/recordings-list.test.tsx`
- **Verification:** 8/8 pass locally (UTC+7).
- **Committed in:** `4f1a136` (Task 3 commit, never previously committed broken).

**2. [Rule 1 - Type bug] `mockedToast` type cast for `mockClear` access**
- **Found during:** Task 3 typecheck after vitest pass
- **Issue:** `vi.mocked(toast)` types `toast` as the actual `sonner` callable, which doesn't have `mockClear` in its public type — `tsc --noEmit` failed with TS2339.
- **Fix:** Replaced `vi.mocked(toast)` with an explicit cast to `ReturnType<typeof vi.fn> & { error: ReturnType<typeof vi.fn> }`. Matches what the `vi.mock('sonner', ...)` factory actually returns.
- **Files modified:** `apps/web/src/app/app/recordings/[id]/components/__tests__/recordings-list.test.tsx`
- **Verification:** `pnpm tsc --noEmit` clean.
- **Committed in:** `4f1a136` (Task 3 commit, never previously committed broken).

---

**Total deviations:** 2 auto-fixed (both Rule 1 — test/type bugs introduced and immediately corrected within the same task before commit).
**Impact on plan:** None. Plan deliverables are intact; both fixes are localized to the test file and ensure the suite is hermetic and portable across timezones.

## Issues Encountered

None during planned work. Pre-existing failures in `bulk-import-dialog*.test.tsx` (3 tests, in unrelated files modified before this task started) are out of scope per executor scope-boundary rules and have been logged in `deferred-items.md` for separate triage.

## User Setup Required

None — no environment, dependency, or schema changes.

## Next Phase Readiness

- Detail-page Recordings table is now feature-parity with the main listings table for row actions. Future enhancements (e.g. bulk select, sortable columns) are straightforward incremental additions on top of `DataTable`.
- The `onDeleted` callback pattern (parent decides navigation, child stays presentational) is reusable for any future detail-page table that supports row-level destructive actions.

## Self-Check: PASSED

- File `apps/web/src/app/app/recordings/[id]/components/recordings-list.tsx` exists (FOUND)
- File `apps/web/src/app/app/recordings/[id]/page.tsx` exists (FOUND)
- File `apps/web/src/app/app/recordings/[id]/components/__tests__/recordings-list.test.tsx` exists (FOUND)
- Commit `0f21b78` exists in git log (FOUND)
- Commit `2f06ca2` exists in git log (FOUND)
- Commit `4f1a136` exists in git log (FOUND)

---
*Quick task: 260426-ox9*
*Completed: 2026-04-26*
