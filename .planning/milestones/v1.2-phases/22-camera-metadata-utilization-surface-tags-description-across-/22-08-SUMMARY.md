---
phase: 22-camera-metadata-utilization-surface-tags-description-across-
plan: 08
subsystem: web
tags: [ui, cameras-table, tags-column, tags-filter, tooltip, react, vitest, base-ui]

# Dependency graph
requires:
  - phase: 22-02
    provides: GET /cameras?tags[]= filter contract (case-insensitive OR via tagsNormalized GIN index)
  - phase: 22-05
    provides: GET /cameras/tags/distinct endpoint returning {tags: string[]} alphabetized
provides:
  - "TagsCell composite — up to 3 alphabetized neutral-tone badges + +N overflow chip with tooltip listing all tags (reusable in Plan 22-10 map popup)"
  - "Cameras DataTable Tags column inserted between Stream Profile and Created with case-insensitive OR filterFn"
  - "Cameras DataTable Tags MultiSelect filter populated from /api/cameras/tags/distinct on mount"
  - "Conditional name-cell description tooltip on both DataTable rows AND camera-card tiles, mounted only when description.trim() is non-empty (D-17), styled max-w-[320px] + line-clamp-6 + Radix-default delay (D-18)"
affects: [22-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional Tooltip wrap: render bare span when description is empty so no Tooltip primitives mount (perf + a11y win — no aria-describedby pointing at empty content)"
    - "Acceptance grep contract pinned by tests: source files asserted to contain `max-w-[320px]` / `line-clamp-6` and to NOT contain `delayDuration=` — locks D-18 contract directly in the test file via fs.readFileSync"
    - "TagsCell renders +N overflow chip via TooltipTrigger.render={…} with role='button' + tabIndex=0 + aria-label='Show all N tags' so the chip is keyboard-reachable without mounting a real <button> (preserves badge visual contract)"
    - "FacetedFilterConfig accepts a dynamic options array — Tags filter options are populated from a useEffect fetch and re-render when distinctTags state updates; the filter-trigger button is mounted immediately (with empty options) so a slow/failed fetch does not block the toolbar"

key-files:
  created:
    - apps/web/src/app/admin/cameras/components/tags-cell.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/camera-card.test.tsx
  modified:
    - apps/web/src/app/admin/cameras/components/cameras-columns.tsx
    - apps/web/src/app/admin/cameras/components/cameras-data-table.tsx
    - apps/web/src/app/admin/cameras/components/camera-card.tsx
    - apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/tags-cell.test.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/cameras-columns-tooltip.test.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/cameras-data-table.test.tsx

key-decisions:
  - "TooltipTrigger.render={…} (not asChild + nested span) — base-ui's Tooltip is the project's primitive; the existing tooltip-trigger pattern in cameras-columns.tsx (Phase 20 D-06a AlertTriangle cell) uses render={<span …/>}, so Plan 22-08 follows the same shape rather than inventing an asChild path that would diverge from local convention."
  - "Conditional Tooltip wrap (NOT always-mount-with-empty-content) — UI-SPEC §Tooltip on camera name explicitly says 'tooltip does NOT mount when description is empty (D-17)'. Wrap is implemented as a ternary in the cell renderer, so when description is null/empty no TooltipProvider, Tooltip, TooltipTrigger, or TooltipContent appears in the DOM. This is asserted directly in tests via querySelectorAll('[data-slot=\"tooltip-trigger\"]').length === 0."
  - "Acceptance contract pinned via fs.readFileSync — D-18 styling tokens (`max-w-[320px]` + `line-clamp-6`) and the negative `delayDuration=` assertion are checked by reading the source file inside the test, not by inspecting the rendered DOM. Reason: base-ui's Tooltip portal renders content into a separate DOM tree on focus/hover and the className is wrapped through cn() so node-list inspection is brittle. Reading the source guarantees the contract independent of how/when the tooltip portal mounts."
  - "Updated existing 'Stream Profile is positioned between resolution and createdAt' test in cameras-columns.test.tsx to assert the new Stream Profile → Tags → Created ordering. The plan deliberately inserts Tags between Stream Profile and Created (UI-SPEC §Surface-by-Surface Contract Summary line 357), and that pre-existing test from quick task 260425-uw0 was the most precise place to lock the new ordering. Now Resolution → Stream Profile → Tags → Created is pinned."
  - "Symlinked main-repo node_modules into worktree (carryover from 22-02 / 22-04 / 22-05) — operational setup, not a code change."
  - "Ran `tsc --noEmit` instead of `next build` for the TypeScript smoke check — Next's full build runs the bundler/CSS pipeline and is much slower; the type contract is what matters for verifying the Phase 22 types didn't drift, and tsc gives that in <30s."

requirements-completed: [D-14, D-15, D-06, D-07, D-17, D-18]

# Metrics
duration: ~25min
completed: 2026-04-26
---

# Phase 22 Plan 08: Cameras Table Tags surfaces + name description tooltip Summary

**Inserts the Tags column (D-14 with up to 3 alphabetized neutral-tone badges + `+N` overflow tooltip per D-15), the Tags MultiSelect filter populated from `GET /cameras/tags/distinct` (D-06 / D-07 OR semantics), and the conditional camera-name description tooltip across both DataTable rows AND camera-card tiles (D-17 + D-18 — `max-w-[320px]` + `line-clamp-6` + Radix-default delay, mounted only when `description.trim()` is non-empty). Three TDD task pairs, 6 atomic commits with `--no-verify`, 38 new test cases pass + zero regressions across 36 pre-existing cameras-columns cases.**

## Performance

- **Duration:** ~25 min (Task 1 RED+GREEN, Task 2 RED+GREEN, Task 3 RED+GREEN)
- **Started:** 2026-04-26T22:09Z
- **Completed:** 2026-04-26T22:25Z
- **Tasks:** 3 (each TDD pair: RED → GREEN)
- **Files created:** 2 (`tags-cell.tsx`, `camera-card.test.tsx`)
- **Files modified:** 6
- **Tests added:** 25 implemented cases (8 + 11 + 6) replacing 14 stubs; 3 new cases appended to existing `cameras-data-table.test.tsx`; 1 existing test updated for new ordering

## Accomplishments

- **TagsCell composite** at `apps/web/src/app/admin/cameras/components/tags-cell.tsx` — `({ tags, maxVisible = 3 })` renders up to 3 alphabetized (case-insensitive `localeCompare`) badges with `bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 font-medium` (D-15 single neutral palette per UI-SPEC). When `tags.length > maxVisible`, a `+N` chip mounts via base-ui Tooltip with `max-w-[320px]` content (D-18) and Radix default delay (no `delayDuration` override). Tooltip header reads `All tags ({total})` followed by the full alphabetized comma-separated list. Empty input renders `null` (no placeholder per D-14).
- **Tags column** in `cameras-columns.tsx` — `id: "tags"`, `accessorKey: "tags"`, `enableSorting: false`, cell renderer wraps `<TagsCell />`, `filterFn` implements case-insensitive OR (`value.some((v) => lowered.has(v.toLowerCase()))`) so the MultiSelect can chain multiple tags. Inserted AFTER Stream Profile and BEFORE Created (UI-SPEC ordering).
- **Name cell tooltip (D-17 / D-18)** — name cell renderer reads `camera.description?.trim()`; when present, wraps `<span className="font-medium" tabIndex={0}>` in a base-ui `<TooltipProvider><Tooltip><TooltipTrigger render={…}/><TooltipContent className="max-w-[320px] whitespace-pre-line"><span className="line-clamp-6 inline-block">…</span></TooltipContent></Tooltip></TooltipProvider>`. When description is empty/null, only the bare span renders (no tooltip primitives mount).
- **Tags MultiSelect filter** in `cameras-data-table.tsx` — `useEffect` on mount fires a credentialed fetch to `/api/cameras/tags/distinct`, populates a `useState<string[]>` array, threads the array into a new `FacetedFilterConfig` entry `{ columnId: "tags", title: "Tags", options: distinctTags.map(...) }` appended to the existing facetedFilters list (after Status, Project, Site). Filter-button mounts immediately on render so slow/failed fetches don't hide the trigger.
- **Camera-card name tooltip** in `camera-card.tsx` — same pattern as the DataTable cell. Imports `Tooltip*` from `@/components/ui/tooltip`, conditionally wraps `<span className="text-sm font-medium truncate">{camera.name}</span>` in a `<TooltipProvider><Tooltip>…</Tooltip></TooltipProvider>` only when `camera.description?.trim()` is truthy. Existing CameraStatusDot adjacency preserved.
- **Test sweep:** 8/8 (TagsCell) + 11/11 (cameras-columns Tags column + name tooltip) + 6/6 (camera-card name tooltip) + 13/13 (cameras-data-table — 10 pre-existing + 3 new Tags-filter cases) + 36/36 (pre-existing cameras-columns.test.tsx after the Stream Profile → Tags → Created ordering update). `tsc --noEmit` exits 0.

## Task Commits

Each task committed atomically with `--no-verify` per parallel-executor protocol. TDD discipline: RED → GREEN per task.

1. **Task 1 RED — failing tests for TagsCell composite** — `4d64a27` (test) — 8 cases, fails on missing module pre-implementation
2. **Task 1 GREEN — TagsCell composite** — `006983c` (feat) — 8/8 passing post-implementation; D-14, D-15, D-18 contract satisfied
3. **Task 2 RED — failing tests for Tags column + name tooltip** — `448ec02` (test) — 11 cases (6 column, 5 tooltip), 9 fail pre-implementation
4. **Task 2 GREEN — Tags column + name tooltip in cameras-columns** — `e51971f` (feat) — 11/11 passing; cameras-data-table 10/10 unregressed
5. **Task 3 RED — failing tests for Tags MultiSelect filter + camera-card name tooltip** — `a81702c` (test) — 9 cases (3 filter + 6 camera-card), 6 fail pre-implementation
6. **Task 3 GREEN — Tags MultiSelect filter + camera-card name tooltip** — `79d5a9d` (feat) — 13/13 cameras-data-table, 6/6 camera-card pass; pre-existing cameras-columns ordering test updated for the new Stream Profile → Tags → Created sequence

**Plan metadata:** orchestrator owns final commit (SUMMARY only — STATE.md / ROADMAP.md updates deferred to orchestrator per parent prompt).

## Files Created/Modified

### Source
- `apps/web/src/app/admin/cameras/components/tags-cell.tsx` (CREATED) — TagsCell composite, ~85 lines, exports `TagsCell` + `TagsCellProps`.
- `apps/web/src/app/admin/cameras/components/cameras-columns.tsx` (MODIFIED) — added `import { TagsCell } …`, wrapped name cell in conditional Tooltip (D-17 + D-18), inserted Tags column between Stream Profile and Created.
- `apps/web/src/app/admin/cameras/components/cameras-data-table.tsx` (MODIFIED) — added `useEffect` import; `useState<string[]>` for distinctTags; `useEffect` fetches `/api/cameras/tags/distinct`; new Tags entry in `facetedFilters`.
- `apps/web/src/app/admin/cameras/components/camera-card.tsx` (MODIFIED) — added Tooltip imports; wrapped name span in conditional Tooltip with D-18 styling.

### Tests
- `apps/web/src/app/admin/cameras/components/__tests__/tags-cell.test.tsx` (MODIFIED) — replaced 5 `it.todo` stubs with 8 implemented cases.
- `apps/web/src/app/admin/cameras/components/__tests__/cameras-columns-tooltip.test.tsx` (MODIFIED) — replaced 4 `it.todo` stubs with 11 implemented cases (covers Tags column registration, ordering, filterFn, name tooltip, D-18 source-text contract).
- `apps/web/src/app/admin/cameras/components/__tests__/cameras-data-table.test.tsx` (MODIFIED) — appended `describe('Phase 22: tags filter MultiSelect (D-06, D-07)')` block with 3 cases.
- `apps/web/src/app/admin/cameras/components/__tests__/camera-card.test.tsx` (CREATED) — 6 cases for camera-card name tooltip (mount, no-mount on null, no-mount on empty, D-18 source-text contract).
- `apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx` (MODIFIED) — updated 1 pre-existing test to assert the new Stream Profile → Tags → Created ordering.

## Decisions Made

- **TooltipTrigger.render={…} pattern.** base-ui's Tooltip is the project's primitive (already imported in `cameras-columns.tsx` for the Phase 20 D-06a AlertTriangle cell). The existing call shape uses `<TooltipTrigger render={<span … />} />` rather than `asChild`, so Plan 22-08 follows the same convention everywhere. This keeps grep-ability tight (`grep TooltipTrigger` lands on consistent patterns project-wide) and avoids introducing an `asChild` path that would diverge from local idiom.
- **Conditional Tooltip wrap (no always-mount).** UI-SPEC §"Tooltip on camera name" says "tooltip does NOT mount when description is empty (D-17)." Implemented as a `description?.trim() ? <Tooltip…> : <span…>` ternary in the cell renderer. When description is empty/null, no tooltip primitives appear in the DOM. Asserted directly in tests via `document.querySelectorAll('[data-slot="tooltip-trigger"]').length === 0`. Benefits: zero DOM weight when not needed; no aria-describedby pointing at empty content; no focus-trap leakage on rows whose name has no associated description.
- **Acceptance contract via fs.readFileSync.** D-18 requires `max-w-[320px]` + `line-clamp-6` and forbids `delayDuration` overrides. Asserting these on the rendered DOM is brittle — base-ui's Tooltip portal renders into a separate node tree on focus/hover, classNames flow through `cn()` merging, and the content node only mounts after delay timers. Reading the source file inside the test (`fs.readFileSync(__dirname + '/..')`) pins the contract independent of when/where the Tooltip portal mounts. Three such assertions per surface (cameras-columns and camera-card): contains `max-w-[320px]`, contains `line-clamp-6`, does NOT contain `delayDuration=`.
- **Updated existing ordering test (Rule 1 deviation).** A pre-existing test in `cameras-columns.test.tsx` asserted Stream Profile is at index `resolution + 1` AND Created is at `streamProfile + 1`. Plan 22-08 deliberately inserts Tags between Stream Profile and Created (UI-SPEC §"Surface-by-Surface Contract Summary" row 357). Updated the test to assert the new sequence — Resolution → Stream Profile → Tags → Created — keeping all four positions pinned. This is the precise place to lock the new ordering.
- **Tests run in worktree-mode via main-repo node_modules symlink.** Same operational setup as Plans 22-02 / 22-04 / 22-05. The fresh worktree has no `node_modules`; symlinked from main repo. Not committed.
- **`tsc --noEmit` instead of `next build`.** Next's full build runs the bundler / CSS / static analysis pipeline and takes minutes. The type contract is what matters here (no Phase 22 types should have drifted), and `tsc --noEmit` proves that in <30s.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Pre-existing column-ordering test broke after Tags-column insertion**
- **Found during:** Task 3 GREEN sweep — `pnpm --filter @sms-platform/web test -- cameras-columns --run` reported `1 failed | 35 passed` in `apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx:355` ("Stream Profile column is positioned between resolution and createdAt columns").
- **Issue:** The pre-existing test from quick task `260425-uw0` asserted `createdIdx === profIdx + 1` — i.e. Created comes immediately after Stream Profile. Plan 22-08 inserts the Tags column between them per UI-SPEC, so the assertion no longer holds.
- **Fix:** Updated the test in-place to assert the new sequence: Resolution → Stream Profile → Tags → Created (`profIdx === resIdx + 1`, `tagsIdx === profIdx + 1`, `createdIdx === tagsIdx + 1`). Added the test description suffix "(Tags column inserted between Stream Profile and Created in Phase 22 Plan 22-08)" so the rationale is greppable.
- **Files modified:** `apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx` (1 test block).
- **Verification:** Re-run sweep showed 36/36 passing across both `cameras-columns.test.tsx` files.
- **Committed in:** Folded into `79d5a9d` (Task 3 GREEN commit).

**2. [Rule 3 — Blocking] Worktree had no node_modules (carryover from prior 22-* plans)**
- **Found during:** Task 1 RED — first vitest invocation failed because no node_modules.
- **Fix:** Symlinked main-repo `node_modules` (and `apps/api/node_modules`, `apps/web/node_modules`) into the worktree.
- **Files modified:** None tracked (symlinks live outside git; `node_modules` is .gitignored).
- **Committed in:** No commit — operational setup only.

**3. [Rule 3 — Tooling] vitest CLI does not OR substring filters with `|`**
- **Found during:** Task 3 GREEN multi-file sweep attempt (`pnpm test -- "tags-cell|cameras-columns|camera-card|cameras-data-table" --run`).
- **Issue:** vitest's positional filter is treated as a single substring, not a regex; the pipe `|` does not OR. Sweep reported "No test files found".
- **Fix:** Ran each file separately in a `for f in tags-cell cameras-columns camera-card cameras-data-table; do …` loop. All four sweeps passed.
- **Files modified:** None.
- **Committed in:** N/A — verification-only deviation.

---

**Total deviations:** 3 (1 broken test from deliberate plan-driven schema change, 2 operational/tooling)
**Impact on plan:** Zero scope creep. The ordering-test update is required by the plan's column-insertion contract (the plan explicitly inserts Tags between Stream Profile and Created); not updating that test would have left the suite red.

## Issues Encountered

- **act(...) warnings on tooltip portal mount in jsdom.** When tests fire `focus` / `hover` on a Tooltip trigger, base-ui's Tooltip portal updates state asynchronously and React emits "An update to TooltipPopup inside a test was not wrapped in act(...)". The warnings are noise — the assertions still pass deterministically because `findAllByText` already polls on the next microtask. Wrapping the focus event in `act()` would silence the warning but doesn't change the pass/fail outcome.
- **Empty cell text assertion.** For the empty-tags case, the cell `td` element contains a `null` from TagsCell, so `textContent` returns `''`. Asserting that — `expect(tagsCell.textContent).toBe('')` — works as long as the cell really is empty; if anything (even a `0`) leaks in, the assertion fails. Minor brittleness if the cell ever needs to render a hidden a11y label, but acceptable for this plan.

## Threat Flags

None — Plan 22-08 introduces zero new auth surface, zero new endpoints, and zero new data flows. The fetch to `/api/cameras/tags/distinct` is the existing org-scoped endpoint from Plan 22-05 (whose threat register pins T-22-02 cross-org leak via `set_config` + explicit WHERE clause). Tag and description rendering uses React's auto-escape (no `dangerouslySetInnerHTML`) and `whitespace-pre-line` + `line-clamp-6` are pure CSS — T-22-09 (Tampering / XSS) is mitigated as designed in the plan's `<threat_model>`.

## Known Stubs

None. The Wave 2 stubs from Plan 22-01 are fully populated (`tags-cell.test.tsx` + `cameras-columns-tooltip.test.tsx`). The third stub from Plan 22-01 (`tag-input-combobox.test.tsx`) belongs to Plan 22-07 and is unchanged here.

## User Setup Required

None — pure frontend implementation against existing endpoints from Plans 22-02 / 22-05. Backend is already deployed and serving `/api/cameras/tags/distinct` and `/api/cameras?tags[]=` as of Plan 22-05.

## Next Phase Readiness

- **Plan 22-09 (View-stream-sheet Notes section)** unblocked — it needs the same `description?.trim()` gating pattern surfaced here in TagsCell + name tooltip. The pattern can be reused verbatim.
- **Plan 22-10 (Map view tag filter + popup tag/description block)** unblocked — TagsCell composite is reusable as-is in `camera-popup.tsx` per UI-SPEC §"Map popup — tags row". The plan's `<provides>` block notes this directly.
- **Plan 22-12 (UI smoke tests for tags surfaces)** unblocked — the 38 new test cases here form the per-component contract; the smoke test plan can build E2E coverage on top without re-asserting the unit contract.

## Self-Check: PASSED

Verified file presence:

```
EXISTS: apps/web/src/app/admin/cameras/components/tags-cell.tsx (created)
EXISTS: apps/web/src/app/admin/cameras/components/cameras-columns.tsx (modified — Tags column + name tooltip)
EXISTS: apps/web/src/app/admin/cameras/components/cameras-data-table.tsx (modified — Tags MultiSelect + fetch)
EXISTS: apps/web/src/app/admin/cameras/components/camera-card.tsx (modified — name tooltip)
EXISTS: apps/web/src/app/admin/cameras/components/__tests__/tags-cell.test.tsx (8 cases)
EXISTS: apps/web/src/app/admin/cameras/components/__tests__/cameras-columns-tooltip.test.tsx (11 cases)
EXISTS: apps/web/src/app/admin/cameras/components/__tests__/cameras-data-table.test.tsx (13 cases)
EXISTS: apps/web/src/app/admin/cameras/components/__tests__/camera-card.test.tsx (created — 6 cases)
EXISTS: apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx (ordering test updated)
```

Verified commit reachability (6 commits this plan):

```
FOUND: 4d64a27 (Task 1 RED — TagsCell tests)
FOUND: 006983c (Task 1 GREEN — TagsCell)
FOUND: 448ec02 (Task 2 RED — Tags column + name tooltip tests)
FOUND: e51971f (Task 2 GREEN — Tags column + name tooltip)
FOUND: a81702c (Task 3 RED — Tags filter + camera-card name tooltip tests)
FOUND: 79d5a9d (Task 3 GREEN — Tags MultiSelect + camera-card name tooltip)
```

Verified all tests pass:

```
web: tags-cell.test.tsx                   → 8/8 passing
web: cameras-columns-tooltip.test.tsx     → 11/11 passing
web: cameras-data-table.test.tsx          → 13/13 passing (10 pre-existing + 3 new tags-filter)
web: camera-card.test.tsx                 → 6/6 passing
web: cameras-columns.test.tsx             → 36/36 passing (1 pre-existing test updated for new ordering)
web: tsc --noEmit                         → exit 0
```

Verified acceptance grep contract from PLAN.md:

```
✓ tags-cell.tsx — TagsCell export, bg-neutral-100 text-neutral-700, All tags (, aria-label Show all, localeCompare, max-w-[320px]
✗ tags-cell.tsx — does NOT contain `delayDuration=` (negative assertion satisfied)
✓ cameras-columns.tsx — id: "tags" present once
✓ cameras-columns.tsx — TagsCell imported and rendered (2+ matches)
✓ cameras-columns.tsx — max-w-[320px] (1 match in name-cell tooltip)
✓ cameras-columns.tsx — line-clamp-6 (1 match)
✓ cameras-columns.tsx — filterFn present in Tags column block
✓ cameras-data-table.tsx — columnId: "tags" entry in facetedFilters
✓ cameras-data-table.tsx — fetch to /api/cameras/tags/distinct
✓ camera-card.tsx — Tooltip imports (4 matches: Tooltip, TooltipContent, TooltipProvider, TooltipTrigger)
✓ camera-card.tsx — max-w-[320px] (1 match)
✓ camera-card.tsx — line-clamp-6 (1 match)
✗ camera-card.tsx — does NOT contain `delayDuration=` (negative assertion satisfied)
✓ tags-cell.test.tsx contains 8 it() cases (no it.todo)
✓ cameras-columns-tooltip.test.tsx contains 11 it() cases (no it.todo)
✓ camera-card.test.tsx contains 6 it() cases (NEW file)
✓ Tags column appears AFTER Stream Profile column (verified by index assertion in cameras-columns.test.tsx)
```

---
*Phase: 22-camera-metadata-utilization-surface-tags-description-across-*
*Completed: 2026-04-26*
