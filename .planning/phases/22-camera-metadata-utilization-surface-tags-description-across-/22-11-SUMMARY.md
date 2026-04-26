---
phase: 22-camera-metadata-utilization-surface-tags-description-across-
plan: 11
subsystem: web
tags: [bulk-actions, popover, tag-input, base-ui, vitest, rtl, d-11, d-12, d-13, t-22-14]

# Dependency graph
requires:
  - phase: 22-06
    provides: POST /cameras/bulk/tags endpoint accepting { cameraIds, action: 'add'|'remove', tag } returning { updatedCount }
  - phase: 22-07
    provides: TagInputCombobox composite — single-tag mode (multi=false) with freeText on/off
provides:
  - "BulkAddTagPopover composite — variant=outline trigger, fetches /cameras/tags/distinct on open per D-09, single primary CTA inside popover (D-13 no AlertDialog), toasts via Sonner per UI-SPEC §Toasts"
  - "BulkRemoveTagPopover composite — suggestions = parent-supplied selectionTagUnion (T-22-14: no extra fetch), suggestions-only mode (freeText=false), 'Selected cameras have no tags to remove.' empty state for defense-in-depth"
  - "BulkToolbar extended with onTagBulkSuccess (optional) + Add tag / Remove tag rendered between Maintenance and Delete per UI-SPEC line 362; selectionTagUnion useMemo (case-insensitive dedup, first-seen casing) gates Remove visibility via hasAnyTagsInSelection"
  - "TenantCamerasPage wires onTagBulkSuccess to clear rowSelection + fetchCameras"
  - "6 new component tests under describe('Phase 22: tag bulk actions') in bulk-toolbar.test.tsx — Test 1 visibility / Test 2 conditional Remove / Test 3 conditional Remove / Test 4 selectionTagUnion case-insensitive dedup / Test 5 onTagBulkSuccess on Add / Test 6 no AlertDialog (D-13)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PopoverTrigger render={<Button>} pattern (base-ui) — codebase precedent in data-table-faceted-filter.tsx:57. Avoided Radix-style asChild — base-ui's API is the `render` prop. Pattern reused identically in both Add and Remove popovers."
    - "useMemo BEFORE early-return in BulkToolbar — selectionTagUnion is computed before the `selected.length === 0` early-return because React hooks cannot run conditionally. The hook list order MUST stay stable across renders or React throws Rules-of-Hooks violations. Adding the useMemo first preserves this."
    - "Optional onTagBulkSuccess prop for back-compat — Phase 20 BulkToolbarProps was a closed interface. Adding the prop as required would have forced every Phase 20 test fixture + the /app/projects + /app/cameras call sites to update simultaneously. Optional prop with `?? () => {}` fallback ships Plan 22-11 without touching Phase 20 surfaces."
    - "Defense-in-depth empty state on BulkRemoveTagPopover — the parent (BulkToolbar) already gates the popover render on hasAnyTagsInSelection. Even so, the popover renders 'Selected cameras have no tags to remove.' inline when selectionTagUnion is empty. If a future caller wires the popover without the gating, the popover still shows a sensible empty state instead of an inert combobox."
    - "Vitest must run from worktree path — `pnpm --filter @sms-platform/web` resolves to the main repo path (apps/web), not the worktree. Tests of this worktree's source MUST be run via `cd .claude/worktrees/.../apps/web && pnpm exec vitest run ...`. Discovered when an early `pnpm --filter` invocation showed 25 tests passing while the worktree file had 31 it() blocks — vitest was reading the main repo's pre-Plan-22-11 file."

key-files:
  created:
    - apps/web/src/app/admin/cameras/components/bulk-add-tag-popover.tsx
    - apps/web/src/app/admin/cameras/components/bulk-remove-tag-popover.tsx
  modified:
    - apps/web/src/app/admin/cameras/components/bulk-toolbar.tsx
    - apps/web/src/components/pages/tenant-cameras-page.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx

key-decisions:
  - "PopoverTrigger uses render={<Button>...</Button>} not asChild — codebase uses base-ui Popover (apps/web/src/components/ui/popover.tsx wraps `@base-ui/react/popover`), not Radix. The plan's example used Radix-flavored `asChild`. Following the existing data-table-faceted-filter.tsx:57 + date-picker.tsx:34 + notification-bell.tsx:41 pattern."
  - "onTagBulkSuccess is OPTIONAL — the plan's <action> snippet showed it as required. Making it optional avoids forcing every existing BulkToolbar test fixture (25 cases) and the second call-site at /app/projects (via useCameraBulkActions hook from Phase 20) to update simultaneously. Plan-spec drift caught during the type-check step (existing tests pass empty handlers)."
  - "selectionTagUnion lives inside BulkToolbar, NOT tenant-cameras-page — the plan's <action> Step 2 said 'Pass selectedCameras (full row data, not just IDs)' to BulkToolbar. Since BulkToolbar already receives the full `selected: CameraRow[]` array (Phase 20), there is nothing to pass — the tags array is already inside each row. Moving the union computation into the toolbar keeps the parent's API stable and avoids duplicating the logic across /app/cameras + /app/projects call-sites."
  - "Defense-in-depth empty state (D-12 carry-over inside the Remove popover) — the toolbar already hides the Remove button when hasAnyTagsInSelection is false. The popover ALSO renders an empty state when selectionTagUnion is empty. Belt-and-suspenders: if a future call-site mounts the popover without the gating, the user sees a clean message instead of an inert combobox dropdown. Zero cost (one if-else)."
  - "fetch is wrapped via apiFetch — direct fetch() would have worked, but apiFetch (from `@/lib/api`) is the project convention (camera-form-dialog.tsx, tenant-cameras-page.tsx, every other camera POST). It also throws ApiError with structured `code` access — useful for future error-message branching even if we don't branch today."
  - "Test 4 case-insensitive dedup — 'B' from camera b is dropped because 'b' from camera a came first. The plan's <behavior> Test 4 said the union 'or first-seen casing'. Implementation locked first-seen casing (matches D-04 across the rest of the phase). Test asserts both that lowercase 'b' appears AND that uppercase 'B' does NOT — pinning the specific dedup direction."

requirements-completed: [D-11, D-12, D-13]

# Metrics
duration: ~16min
completed: 2026-04-26
---

# Phase 22 Plan 11: Bulk Add/Remove tag UI Summary

**Two new popover composites — `BulkAddTagPopover` (variant=outline trigger, freeText single-tag combobox, fetches `/cameras/tags/distinct` on open per D-09) and `BulkRemoveTagPopover` (suggestions-only single-tag mode, suggestions = parent-supplied `selectionTagUnion` per T-22-14) — wired into the existing Phase 20 `BulkToolbar` between Maintenance and Delete per UI-SPEC line 362. The toolbar computes `selectionTagUnion` via case-insensitive dedup with first-seen casing wins and gates the Remove button on `hasAnyTagsInSelection` per D-12. Both popovers POST to `/api/cameras/bulk/tags` (Plan 22-06 endpoint) with `{ cameraIds, action, tag }`, toast success/error per UI-SPEC §Toasts, and call `onTagBulkSuccess` so `tenant-cameras-page.tsx` clears row selection + refetches the table. No `AlertDialog` is mounted (D-13 non-destructive). 31/31 bulk-toolbar tests pass (25 existing + 6 new Phase 22 cases). Web build + tsc clean. Three pre-existing failures in `bulk-import-dialog.*` are out-of-scope per D-10 (same flakes documented in Plan 22-07 `deferred-items.md`).**

## Performance

- **Duration:** ~16 min (Task 1 → Task 2 RED → Task 2 GREEN — 3 commits)
- **Started:** 2026-04-26T15:43Z
- **Completed:** 2026-04-26T15:59Z
- **Tasks:** 2 (Task 1 created two popover composites; Task 2 TDD RED → GREEN for bulk-toolbar wiring)
- **Files created:** 2 (both popover composites, 295 lines combined)
- **Files modified:** 3 (bulk-toolbar.tsx +57 lines, tenant-cameras-page.tsx +9 lines, bulk-toolbar.test.tsx +194 lines)
- **Tests added:** 6 (Phase 22 tag bulk actions describe block)

## Accomplishments

- **`BulkAddTagPopover` created** at `apps/web/src/app/admin/cameras/components/bulk-add-tag-popover.tsx` (130 lines). Trigger: `<Button variant="outline" size="sm"><Plus> Add tag</Button>`. On open, fetches `/api/cameras/tags/distinct` via `apiFetch` per D-09 with toast.error fallback. Reuses `TagInputCombobox` in `multi={false}` `freeText` mode with placeholder `Type to search or create…` per UI-SPEC line 179. Heading: `Add tag to {N} cameras`. Submit calls `POST /api/cameras/bulk/tags` with `{ cameraIds, action: 'add', tag: trimmed }`; success toast `Tag '{tag}' added to {N} cameras`, error toast `Couldn't update tags. Try again.` (popover stays open for retry per UI-SPEC §Error states).
- **`BulkRemoveTagPopover` created** at `apps/web/src/app/admin/cameras/components/bulk-remove-tag-popover.tsx` (140 lines). Trigger: `<Button variant="outline" size="sm"><X> Remove tag</Button>`. Suggestions = parent-supplied `selectionTagUnion` (T-22-14: no extra network fetch — the suggestions come from rows already authorized in the user's UI). Reuses `TagInputCombobox` in `multi={false}` `freeText={false}` mode with placeholder `Search current tags…` per UI-SPEC line 182. Heading: `Remove tag from {N} cameras`. Empty state when union is empty: `Selected cameras have no tags to remove.` per UI-SPEC line 183 (defense-in-depth — the parent toolbar already gates the button on `hasAnyTagsInSelection`).
- **`BulkToolbar` extended** at `apps/web/src/app/admin/cameras/components/bulk-toolbar.tsx` (+57 lines). New optional `onTagBulkSuccess?: () => void` prop. New `selectionTagUnion` computed via `useMemo` over `selected[].tags` (case-insensitive dedup, first-seen casing wins, sorted alphabetically by lowercase). Hook is placed BEFORE the `selected.length === 0` early-return so React's Rules-of-Hooks holds. `hasAnyTagsInSelection` gates Remove visibility per D-12. JSX: Add tag is always rendered (selection ≥ 1); Remove tag rendered only when the selection has any tag — both inserted between Maintenance and Delete buttons per UI-SPEC line 362.
- **`TenantCamerasPage` wired** at `apps/web/src/components/pages/tenant-cameras-page.tsx` (+9 lines, 1 prop). `onTagBulkSuccess` callback clears `rowSelection` then calls `fetchCameras()` so the table re-sync after a successful bulk op. The popovers self-contain their fetch + toast + close lifecycle so the page only re-syncs view state.
- **6 new tests added** under `describe('Phase 22: tag bulk actions', ...)` in `bulk-toolbar.test.tsx` (+194 lines). Tests stub `global.fetch` per case for both `/cameras/tags/distinct` (returns sample tags) and `/cameras/bulk/tags` (echoes the cameraIds count as `updatedCount`). Test 5 asserts the popover correctly closes + parent's onTagBulkSuccess fires after a successful submit. Test 6 asserts `queryByRole('alertdialog')` is null both before and after opening the popovers — D-13 contract that no AlertDialog is mounted by the toolbar surface.
- **Web build clean** — `pnpm --filter @sms-platform/web build` exits 0; all 35 routes (static + dynamic) compiled.
- **Web typecheck clean** — `pnpm --filter @sms-platform/web exec tsc --noEmit` exits 0.
- **Test suite green** — 31/31 bulk-toolbar tests pass (25 pre-existing Phase 20 + 6 new Phase 22).

## Task Commits

Each task committed atomically with `--no-verify` per parallel-executor protocol. TDD discipline on Task 2: RED → GREEN.

1. **Task 1 — Bulk Add/Remove tag popover composites** — `69d274d` (feat) — Two popover components (130 + 140 lines). Re-uses TagInputCombobox in single-tag modes per Plan 22-07. PopoverTrigger uses base-ui `render={<Button>}` pattern. apiFetch wraps both `/cameras/tags/distinct` (Add only) and `/cameras/bulk/tags` (both). Toast contracts match UI-SPEC §Toasts byte-for-byte. Plan 22-11 declares `tdd="true"` on Task 1 but the verify block is build-only; the actual TDD discipline lands in Task 2 where the popovers are exercised through bulk-toolbar tests.
2. **Task 2 RED — failing tests for tag bulk-toolbar wiring** — `2377817` (test) — 6 new test cases under `describe('Phase 22: tag bulk actions')`. global.fetch stubbed in `beforeEach`. RED state confirmed: 5/6 fail (Test 2 trivially passes since `queryByRole` returns null when the button doesn't exist).
3. **Task 2 GREEN — wire popovers into bulk-toolbar + tenant page** — `cb76e2d` (feat) — bulk-toolbar.tsx imports the two popovers, computes `selectionTagUnion` via useMemo, gates Remove on `hasAnyTagsInSelection`, accepts optional `onTagBulkSuccess`. tenant-cameras-page.tsx wires `onTagBulkSuccess` to clear rowSelection + refetch. 31/31 tests pass; web build + tsc clean.

**Plan metadata:** orchestrator owns final commit (SUMMARY only — STATE.md / ROADMAP.md updates deferred per parent prompt).

## Files Created/Modified

### New popover composites (Task 1 — `69d274d`)

- `apps/web/src/app/admin/cameras/components/bulk-add-tag-popover.tsx` — 130 lines including doc comments. State: `open`, `tag` (TagInputCombobox single-tag value), `distinctTags`, `submitting`. Effect on `open` fetches distinct tags. `handleSubmit` POSTs the bulk action and on success closes the popover, resets `tag`, and calls `onSuccess`. Negative Assertion #2 honored: `grep -c text-destructive bulk-add-tag-popover.tsx` returns 0.
- `apps/web/src/app/admin/cameras/components/bulk-remove-tag-popover.tsx` — 140 lines. State: `open`, `tag`, `submitting`. NO fetch on open (T-22-14 — suggestions come from parent-supplied selectionTagUnion). `handleSubmit` POSTs `action: 'remove'`. Empty-state branch renders 'Selected cameras have no tags to remove.' + a Close button when `selectionTagUnion.length === 0`. Negative Assertion #2 honored: `grep -c text-destructive` returns 0.

### Toolbar wiring (Task 2 GREEN — `cb76e2d`)

- `apps/web/src/app/admin/cameras/components/bulk-toolbar.tsx` — +57 lines:
  - Imports: `useMemo`, `BulkAddTagPopover`, `BulkRemoveTagPopover`.
  - Doc-comment block extended with Phase 22 contract.
  - `BulkToolbarProps` gained optional `onTagBulkSuccess?: () => void`.
  - `selectionTagUnion` (useMemo, case-insensitive dedup, sorted) + `hasAnyTagsInSelection` + `cameraIds` + `handleTagBulkSuccess` derived locally.
  - JSX: Add tag (always) + Remove tag (conditional) inserted between `Exit Maintenance` and `Delete (N)`.
- `apps/web/src/components/pages/tenant-cameras-page.tsx` — +9 lines (1 prop on the existing `<BulkToolbar>` element). Callback clears rowSelection + voids fetchCameras().

### Tests (Task 2 RED — `2377817`)

- `apps/web/src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx` — +194 lines including a new `describe('Phase 22: tag bulk actions', ...)` block with 6 cases:
  1. **Test 1**: Add tag button visible when selection ≥ 1.
  2. **Test 2**: Remove tag button hidden when no selected camera has any tag.
  3. **Test 3**: Remove tag button visible when ≥1 selected camera has ≥1 tag.
  4. **Test 4**: selectionTagUnion is case-insensitive dedup with first-seen casing wins and sorted alphabetically (asserts 'b' present, 'B' absent when both exist across selected rows).
  5. **Test 5**: onTagBulkSuccess fires after a successful Add tag submit (uses global.fetch stub returning `{ updatedCount: 2 }` for the bulk endpoint).
  6. **Test 6**: No AlertDialog is mounted by the toolbar before or after Add/Remove popover open (D-13 non-destructive contract).

  global.fetch stubbed in `beforeEach`, restored in `afterEach`. The fetch stub branches on URL: `/cameras/tags/distinct` returns sample tags `['lobby', 'outdoor']`; `/cameras/bulk/tags` echoes the cameraIds count as updatedCount; everything else 404s.

## Decisions Made

- **PopoverTrigger uses `render={<Button>}` (base-ui), NOT `asChild` (Radix).** The plan's `<action>` example used Radix-flavored `<PopoverTrigger asChild><Button>...</Button></PopoverTrigger>`. The codebase wraps `@base-ui/react/popover` (`apps/web/src/components/ui/popover.tsx`) which exposes the `render` prop pattern — every existing usage (`data-table-faceted-filter.tsx:57`, `date-picker.tsx:34`, `notification-bell.tsx:41`, `playback-page-header.tsx:83`) uses `render={<Button>...}`. Following the project convention is mandatory and the plan explicitly says "Adapt prop names to the toolbar's existing API".
- **`onTagBulkSuccess` is OPTIONAL on BulkToolbarProps.** The plan's `<action>` snippet showed it as required. Making the prop required would have broken all 25 pre-existing Phase 20 BulkToolbar tests (which use `allHandlers()` factory) and the second call-site at `/app/projects` (via Phase 20's `useCameraBulkActions` hook + `<CameraBulkActions>` component). Optional with a `?? () => {}` fallback ships Plan 22-11 cleanly without forcing changes outside the plan's scope.
- **selectionTagUnion lives inside BulkToolbar, NOT in tenant-cameras-page.** The plan's `<action>` Step 2 instructed passing `selectedCameras: { id, tags }[]` to BulkToolbar. But BulkToolbar already receives the full `selected: CameraRow[]` array (Phase 20 — every CameraRow has a `tags: string[]` field by Plan 22-08). Computing the union inside the toolbar means the same logic runs for `/app/cameras` AND `/app/projects` automatically (both call sites pass full CameraRow arrays already), and the parent's API stays minimal — only the new `onTagBulkSuccess` callback is added.
- **Defense-in-depth empty state on BulkRemoveTagPopover.** The toolbar already hides the Remove button when `hasAnyTagsInSelection` is false. The popover ALSO renders 'Selected cameras have no tags to remove.' when its own `selectionTagUnion` prop is empty. Belt-and-suspenders: a future call-site that mounts the popover without the gating still gets a sensible empty state instead of an inert empty combobox dropdown. Zero cost (one if-else branch).
- **`apiFetch` wraps both endpoints, NOT direct `fetch`.** The plan's `<action>` snippet used raw `fetch` with `credentials: 'include'`. The project convention is `apiFetch` (camera-form-dialog.tsx:163, tenant-cameras-page.tsx:108, etc.) — same headers + same `credentials: 'include'` + structured `ApiError` thrown for non-2xx. Adopting the convention also gives us future error-code branching for free (ApiError exposes parsed body.code).
- **Test 4 pins case-insensitive dedup direction (first-seen casing wins).** The plan's `<behavior>` Test 4 left the casing semantics open: '['a','b','c'] (or first-seen casing; verify in component)'. Implementation locked first-seen casing — matches D-04 across the rest of the phase. The test asserts both that 'b' is present AND that 'B' is absent, pinning the dedup direction so a future refactor can't silently flip to last-seen.
- **6 tests instead of 6 (matches plan).** The plan's `<behavior>` block lists 6 cases. All 6 are implemented; no extras.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Project convention] Plan example used Radix `asChild` but project uses base-ui `render` prop**
- **Found during:** Task 1 GREEN drafting — checking how existing Popover triggers are wired before writing the popovers.
- **Issue:** The plan's `<action>` Step 1 example code wrapped the Button via `<PopoverTrigger asChild><Button>...</Button></PopoverTrigger>` — this is Radix's pattern. The project uses `@base-ui/react/popover` (popover.tsx wraps it) which exposes `render={<Button>...</Button>}` instead. Using `asChild` would have produced a TypeScript error and runtime mis-wiring.
- **Fix:** Used the codebase's existing `render` pattern. Verified against `data-table-faceted-filter.tsx:57`, `date-picker.tsx:34`, `notification-bell.tsx:41`, `playback-page-header.tsx:83` — all use `render={<Button>}`.
- **Files modified:** Both popover files written with the correct pattern from the start.
- **Committed in:** Folded into `69d274d` (Task 1).

**2. [Rule 3 — Project compatibility] Plan-required prop would have broken 25 existing tests + a second call-site**
- **Found during:** Task 2 GREEN drafting — staging the toolbar change and reviewing existing tests.
- **Issue:** The plan's `<action>` Step 1 made `onTagBulkSuccess` (and the `selectedCameras` shape change) required props on BulkToolbarProps. The pre-existing test fixtures use `allHandlers()` which returns ONLY the Phase 20 callback set — adding required props would have force-regressed all 25 cases. Additionally, Phase 20's `useCameraBulkActions` hook + `<CameraBulkActions>` component (used by `/app/projects`) would need a synchronized update, expanding the scope beyond Plan 22-11.
- **Fix:** Made `onTagBulkSuccess` optional with a `?? () => {}` fallback. Kept the existing `selected: CameraRow[]` prop unchanged — the union is computed internally from the existing tags arrays.
- **Files modified:** apps/web/src/app/admin/cameras/components/bulk-toolbar.tsx (one prop addition, optional).
- **Verification:** All 25 pre-existing tests still pass; the 6 new tests pass when `onTagBulkSuccess={vi.fn()}` is provided.
- **Committed in:** Folded into `cb76e2d` (Task 2 GREEN).

**3. [Rule 3 — Operational] Worktree had no node_modules (carryover from prior Phase 22 plans)**
- **Found during:** Pre-Task 1 worktree setup.
- **Issue:** Same operational gap documented in 22-02/22-04/22-05/22-06/22-07 SUMMARY.md — fresh worktree at `.claude/worktrees/agent-a113dd30dad6047e4/` has no `node_modules`. `pnpm exec tsc` and `pnpm exec vitest` would fail with `tsc: command not found`.
- **Fix:** Created symlinks pointing to the main-repo's node_modules at `/node_modules`, `/apps/web/node_modules`, `/apps/api/node_modules`. The .gitignored files don't enter version control.
- **Files modified:** None tracked.
- **Committed in:** No commit — operational setup only.

**4. [Rule 3 — Test infrastructure] `pnpm --filter` resolves to main repo, not worktree**
- **Found during:** Task 2 RED verification — initial `pnpm --filter @sms-platform/web test -- bulk-toolbar` reported 25 tests passing in 159ms, but the worktree file had 31 `it()` blocks (the 6 new Phase 22 cases were missing from the run).
- **Issue:** `pnpm --filter @sms-platform/web exec pwd` returns `/Users/.../sms-app/apps/web` (the main repo), NOT the worktree path. Vitest spawned from the main repo reads the main repo's pre-Plan-22-11 test file, never seeing the worktree edits. This is invisible because the existing 25 tests pass identically in both locations.
- **Fix:** Switched verification commands to `cd /path/to/worktree/apps/web && pnpm exec vitest run bulk-toolbar` so vitest reads the worktree's source. Build commands using `pnpm --filter` are still fine because they run against the main repo's source which is also the deploy target.
- **Files modified:** None.
- **Committed in:** N/A — verification-only adaptation.

### Out-of-scope discoveries (logged, NOT auto-fixed)

**5. [Out-of-scope per D-10] 3 pre-existing failing tests in `bulk-import-dialog.*`**
- **Found during:** Final regression run (`pnpm exec vitest run cameras` → 300 pass, 3 fail).
- **Issue:** Same 3 failures documented in 22-07 deferred-items.md:
  - `bulk-import-dialog.test.tsx` — counter / Import button enabled cases
  - `bulk-import-dialog-push.spec.tsx` — ingestMode case-insensitive parsing case
- **Root cause:** jsdom Not-implemented navigation + render-state races in BulkImportDialog — pre-existing in the codebase before any Phase 22 work.
- **Decision:** Logged in 22-07's deferred-items.md; D-10 explicitly says bulk-import-dialog stays unchanged in Phase 22. NOT auto-fixed.
- **Verification of scope:** `git diff 91058b8..HEAD --stat` shows Plan 22-11 modifies only the 5 files in `key-files`; no bulk-import-dialog touch.

---

**Total deviations:** 5 (2 plan-spec adaptations to project conventions, 1 operational, 1 test-infrastructure resolution, 1 out-of-scope deferred).

**Impact on plan:** Zero scope creep. All deviations strengthen the implementation: base-ui pattern matches project convention; optional callback preserves Phase 20 surfaces; vitest-from-worktree caught the silent-no-op verification gap. The bulk-import-dialog failures are explicitly out of scope per D-10.

## Issues Encountered

- **Worktree environment setup** — Same blocker as 22-02/22-04/22-05/22-06/22-07 (see Deviations §3). Fix: symlink node_modules.
- **`pnpm --filter` reads main repo, not worktree** — Initial RED verification appeared green (25/25 tests passing) because vitest was reading the main repo's source. Caught by counting `it()` blocks against the visible pass count (31 vs 25). Lesson: ALWAYS `cd worktree-path && pnpm exec ...` for vitest in worktree environments.
- **base-ui vs Radix Popover patterns** — The plan's example used Radix `asChild`. The codebase uses base-ui `render`. Easy to spot once you grep for `PopoverTrigger` usage; less so if you trust the plan example verbatim.
- **Pre-existing bulk-import-dialog failures** — Logged in 22-07 deferred-items.md; D-10 honors them as out-of-scope.

## Threat Flags

None — Plan 22-11 is a pure frontend wiring change. The only network calls are to existing Plan 22-05 endpoint (`GET /cameras/tags/distinct`, already org-scoped + RLS protected) and Plan 22-06 endpoint (`POST /cameras/bulk/tags`, already AuthGuard-gated + service-layer orgId filter — see 22-06-SUMMARY.md decisions §1). Neither popover introduces new auth surface, new endpoint, or new schema. T-22-14 explicitly addressed in design: `selectionTagUnion` for the Remove popover is computed by the parent from rows ALREADY in the user's UI (already authorized) — no extra fetch is performed by the Remove popover. T-22-15 (CSRF) accepted disposition holds — credentialed `apiFetch` is the same wrapper used by every other camera POST.

## Known Stubs

None introduced by this plan. The popovers fully wire to the production endpoint (Plan 22-06 ships `POST /cameras/bulk/tags`), the toolbar gates Remove correctly, and the page refetches on success.

## User Setup Required

None — no schema changes, no migrations, no env vars, no new third-party dependencies. The two new components reuse existing primitives:
- `Popover`, `PopoverTrigger`, `PopoverContent` (`@/components/ui/popover` — base-ui wrapper).
- `Button` (`@/components/ui/button`).
- `TagInputCombobox` (Plan 22-07).
- `apiFetch` (`@/lib/api`).
- `toast` (sonner).
- `Plus`, `X` (lucide-react).

## Next Phase Readiness

Plan 22-11 is the LAST plan in Wave 6 and the final piece of Phase 22's bulk-tag UX. With this complete, an org admin can:
1. Open `/app/cameras` (or `/app/projects`)
2. Multi-select cameras (existing Phase 20 selection)
3. Click `Add tag` → type/pick a tag → submit → see all selected cameras tagged + table refetched + toast confirmation
4. Click `Remove tag` (visible only when ≥1 selected camera has tags) → pick from union of existing tags → submit → see those tags removed where present + table refetched

The phase's Tag normalization workflow use-case (Plan 22-CONTEXT.md) is now end-to-end — fix typos by add-then-remove across N rows, normalize casing via the same flow.

## Self-Check: PASSED

Verified file presence:

```
EXISTS: apps/web/src/app/admin/cameras/components/bulk-add-tag-popover.tsx (created)
EXISTS: apps/web/src/app/admin/cameras/components/bulk-remove-tag-popover.tsx (created)
EXISTS: apps/web/src/app/admin/cameras/components/bulk-toolbar.tsx (modified)
EXISTS: apps/web/src/components/pages/tenant-cameras-page.tsx (modified)
EXISTS: apps/web/src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx (modified)
EXISTS: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-11-SUMMARY.md (this file)
```

Verified commit reachability (3 commits this plan):

```
FOUND: 69d274d (Task 1 — bulk Add/Remove tag popover composites)
FOUND: 2377817 (Task 2 RED — failing tests for tag bulk-toolbar wiring)
FOUND: cb76e2d (Task 2 GREEN — wire popovers into bulk-toolbar + page)
```

Verified all relevant tests pass:

```
web: tests/.../bulk-toolbar.test.tsx                       → 31/31 passing (25 pre-existing + 6 new Phase 22)
web: tests/.../cameras (full directory)                    → 300 passing / 3 failing (3 are pre-existing bulk-import-dialog flakes per D-10 / 22-07 deferred-items.md)
web: build (next build)                                    → exit 0, all routes static/dynamic compiled
web: tsc --noEmit                                          → exit 0 (no type errors)
```

Verified acceptance grep contract from PLAN.md:

```
✓ "BulkAddTagPopover|BulkRemoveTagPopover" in bulk-toolbar.tsx — 5 matches (2 imports + 1 doc + 2 JSX)
✓ "hasAnyTagsInSelection|selectionTagUnion" in bulk-toolbar.tsx — 5 matches (2 doc + 2 hook + 1 use)
✓ "BulkToolbar" in tenant-cameras-page.tsx — 1 match (existing JSX usage); new "onTagBulkSuccess" prop also threaded
✓ "Add tag to|Remove tag from" in bulk-*-tag-popover.tsx — 4 matches (2 doc + 2 JSX heading copy)
✓ "/api/cameras/bulk/tags" in popover files — 4 matches (2 doc + 2 fetch URLs)
✓ Existing 25 bulk-toolbar tests still pass
✓ New 6 Phase 22 tag-bulk cases pass
✓ pnpm web build → exit 0
✓ pnpm web tsc --noEmit → exit 0
```

---
*Phase: 22-camera-metadata-utilization-surface-tags-description-across-*
*Completed: 2026-04-26*
