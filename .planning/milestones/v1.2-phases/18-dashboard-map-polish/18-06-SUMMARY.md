---
phase: 18-dashboard-map-polish
plan: 06
subsystem: frontend-ui
tags: [nextjs, react, tanstack-table, shadcn, super-admin, dashboard, tdd]

# Dependency graph
requires:
  - phase: 18
    plan: 00
    provides: "it.todo stubs in platform-dashboard-page.test.tsx (5) + org-health-data-table.test.tsx (5)"
  - phase: 18
    plan: 01
    provides: "GET /api/admin/dashboard/active-streams, recordings-active, org-health endpoints"
  - phase: 18
    plan: 05
    provides: "PlatformIssuesPanel, ClusterNodesPanel, StorageForecastCard, RecentAuditHighlights widgets + usePlatformDashboard hook skeleton"
provides:
  - "Composed super-admin dashboard page — 7 stat cards + SystemMetrics + 4 widgets + OrgHealthDataTable + RecentAudit in D-07 priority stack"
  - "OrgHealthDataTable — Phase-14 DataTable wrapper with default sort by max(camera, storage) usage desc via hidden computed TanStack column"
  - "makeOrgHealthColumns factory — 7 visible columns + hidden maxUsagePct column for declarative initial sort"
  - "Extended DataTable wrapper with optional initialState prop (sorting + columnVisibility)"
  - "3 new sub-hooks on use-platform-dashboard — useActiveStreamsCount, useRecordingsActive, useOrgHealthOverview (30s polling, shared shape)"
affects: [18 — phase complete]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hidden TanStack computed column driving initialState.sorting — preserves sort-indicator arrow on visible columns and leaves `data` array unmutated (W6)"
    - "DataTable.initialState prop (sorting + columnVisibility) added to the shared wrapper; backward compatible (both default to empty)"
    - "Row-action dropdown wrapped in stopPropagation div so row onClick navigation doesn't double-fire when clicking the menu trigger"
    - "BigInt bytes → GB via divmod helper (preserves fractional precision past Number.MAX_SAFE_INTEGER)"

key-files:
  created:
    - apps/web/src/app/admin/dashboard/components/org-health-columns.tsx
    - apps/web/src/app/admin/dashboard/components/org-health-data-table.tsx
  modified:
    - apps/web/src/hooks/use-platform-dashboard.ts
    - apps/web/src/components/pages/platform-dashboard-page.tsx
    - apps/web/src/components/ui/data-table/data-table.tsx
    - apps/web/src/components/dashboard/storage-forecast-card.tsx
    - apps/web/src/__tests__/platform-dashboard-page.test.tsx
    - apps/web/src/app/admin/dashboard/components/org-health-data-table.test.tsx

key-decisions:
  - "Hidden computed column for default sort. The plan's W6 note was explicit — do NOT `.sort()` the data. I added a `maxUsagePct` column with enableHiding + accessorFn, then passed `initialState={{ sorting: [{ id: 'maxUsagePct', desc: true }], columnVisibility: { maxUsagePct: false } }}` to the DataTable wrapper. This keeps TanStack's sort-state fully in charge so the visible usage columns retain their sort-indicator arrow."
  - "Extended DataTable wrapper with `initialState` prop rather than duplicating the wrapper. Minimal addition — two optional fields used as initial useState values for existing `sorting` and new `columnVisibility` state. All existing consumers remain source-compatible."
  - "Row-click + Actions coexistence via stopPropagation wrapper on the actions cell. Clicking the dropdown trigger would otherwise bubble up to the `<tr onClick>`. The cell wraps the menu in a div that stops click + keydown propagation."
  - "Kept the existing `apiFetch` calls on `platform-dashboard-page.tsx` for `/stats` + `/system-metrics`. Did not migrate them to hook form — they remain wired to the same local state machine the page originally used. Scope of this plan is the structural refactor (D-05/07/12), not a hook-migration sweep."
  - "Fixed a pre-existing Plan 05 typing bug in `storage-forecast-card.tsx` Tooltip formatter. Was blocking `pnpm build` — `(value: number) =>` overly narrowed the recharts-typed `ValueType | undefined`. Replaced with a loose `value` arg and `Number()` coercion. This is Rule 3 (Blocking) — not architectural."

requirements-completed: [UI-05]

# Metrics
duration: ~12 min
completed: 2026-04-21
---

# Phase 18 Plan 06: Super-admin Dashboard Composition Summary

**Wire-up plan that closes UI-05 by composing 7 stat cards + SystemMetrics + 4 Plan-05 widgets + a new DataTable-migrated Organization Health table + Recent Activity into the refactored super-admin dashboard in D-07 priority order, extending the DataTable wrapper with declarative `initialState` support and adding a hidden-computed-column trick to drive max-usage-desc default sort without mutating the data array — flipping 10 Plan 00 it.todo stubs to green and unblocking the v1.2 super-admin surface.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-21T08:29:55Z
- **Completed:** 2026-04-21T08:41:31Z
- **Tasks:** 2
- **Files created:** 2 (org-health-columns.tsx, org-health-data-table.tsx)
- **Files modified:** 6 (hook, page, data-table wrapper, storage-forecast-card.tsx, 2 test files)
- **Commits:** 4 (2 TDD RED, 2 TDD GREEN)

## Accomplishments

- **Super-admin dashboard fully composed.** The page now renders (top → bottom): 7 stat cards (Organizations, Total Cameras, Cameras Online, Cameras Offline, Stream Bandwidth, Active Streams, Recordings Active) → 4-card SystemMetrics strip (unchanged per D-06) → PlatformIssuesPanel → ClusterNodesPanel → StorageForecastCard → OrgHealthDataTable → RecentAuditHighlights. This is the final UI-05 composition target.
- **Organization Summary Table migrated to DataTable (D-12).** Replaced with `OrgHealthDataTable` which uses the Phase-14 shared wrapper + a 7-visible-column factory (Organization, Plan, Cameras, Storage, Bandwidth today, Status, Actions) plus a hidden `maxUsagePct` column for default-sort-desc. Row click navigates to `/admin/organizations/{id}`; Actions ⋮ menu routes to `/admin/organizations/{id}` (View) and `/admin/organizations/{id}/settings` (Manage).
- **3 new sub-hooks on usePlatformDashboard.** `useActiveStreamsCount`, `useRecordingsActive`, `useOrgHealthOverview` — each GETs a Plan 01 endpoint with 30s polling, matching the existing `usePlatformIssues` / `useStorageForecast` / `useRecentAudit` shape. Exported `OrgHealth` interface colocated with the hook for re-use from the columns factory + tests.
- **DataTable wrapper extended.** Added an optional `initialState?: { sorting?: SortingState; columnVisibility?: VisibilityState }` prop. Backward compatible — existing consumers omit it. Wired into useState defaults so TanStack owns the state after first render.
- **Stub gate flipped.** All 10 Plan 00 `it.todo` stubs now real `it` assertions:
  - `org-health-data-table.test.tsx` — 5 (default sort, row click, cameras cell + Progress, View/Manage actions, status badges)
  - `platform-dashboard-page.test.tsx` — 5 (7 stat cards, grid classes, D-07 stack order, SystemMetrics kept, Organization Summary → Organization Health replacement)

## Task Commits

1. **Task 1 — TDD RED:** `test(18-06): add failing tests for OrgHealthDataTable` — `bcdd6e8`
2. **Task 1 — TDD GREEN:** `feat(18-06): add OrgHealthDataTable + extend hook + DataTable initialState` — `af92ebc`
3. **Task 2 — TDD RED:** `test(18-06): add failing tests for platform dashboard page refactor` — `9f9cb6a`
4. **Task 2 — TDD GREEN:** `feat(18-06): refactor platform dashboard page into D-07 priority stack` — `7820314`

## Files Created / Modified

### Created (2)
- `apps/web/src/app/admin/dashboard/components/org-health-columns.tsx` — `makeOrgHealthColumns(router): ColumnDef<OrgHealth, unknown>[]`. 7 visible columns + hidden `maxUsagePct` computed column. Re-exports `OrgHealth` from the hook for single-source typing.
- `apps/web/src/app/admin/dashboard/components/org-health-data-table.tsx` — Card-wrapped `OrgHealthDataTable` component. Consumes `useOrgHealthOverview`, wires router, passes `initialState={{ sorting: [{ id: 'maxUsagePct', desc: true }], columnVisibility: { maxUsagePct: false } }}`.

### Modified (6)
- `apps/web/src/hooks/use-platform-dashboard.ts` — appended `useActiveStreamsCount`, `useRecordingsActive`, `useOrgHealthOverview` + `OrgHealth` interface. Existing Plan 05 exports untouched.
- `apps/web/src/components/pages/platform-dashboard-page.tsx` — refactored. Removed the raw `<Table>` Org Summary block + related `orgs`/`orgsLoading`/`OrgSummary`/`loadOrgs`. Added `Activity` + `Circle` lucide icons and 2 new StatCards. Replaced grid classes with `lg:grid-cols-4 xl:grid-cols-7`. Skeleton count 5 → 7. Stacked Plan 05 widgets + OrgHealthDataTable in D-07 order.
- `apps/web/src/components/ui/data-table/data-table.tsx` — added `VisibilityState` import, `initialState` prop, `columnVisibility` state, wired into `useReactTable` state + handlers.
- `apps/web/src/components/dashboard/storage-forecast-card.tsx` — 1-line typing fix to pre-existing Plan 05 build blocker (see Deviations).
- `apps/web/src/__tests__/platform-dashboard-page.test.tsx` — 5 `it.todo` → 5 real `it`. Mocks all 6 dashboard hooks + `next/navigation` + `recharts.ResponsiveContainer`.
- `apps/web/src/app/admin/dashboard/components/org-health-data-table.test.tsx` — 5 `it.todo` → 5 real `it`. Fixture: Alpha (max 90%) + Beta (max 20%) assert sort, row click, cameras cell, View/Manage actions, status badges.

## Test Counts

| File | Before (Plan 00) | After (Plan 06) |
|------|------------------|------------------|
| `platform-dashboard-page.test.tsx` | 5 `it.todo` | **5 `it` green**, 0 todo |
| `org-health-data-table.test.tsx` | 5 `it.todo` | **5 `it` green**, 0 todo |

Plan 06 target stubs flipped: **10 / 10 (100%)**.

Full suite: `apps/web` vitest — **Test Files 37 passed | 1 skipped · Tests 210 passed | 1 skipped | 13 todo**. `apps/api` admin-dashboard suite — **17 / 17 passed** (Plan 01 unchanged).

## Decision Coverage Matrix

| Decision | Plan 06 delivered |
|----------|-------------------|
| D-05 (7 stat cards) | ✓ Active Streams + Recordings Active added, wired to 2 new hooks |
| D-06 (keep SystemMetrics) | ✓ 4-card strip unchanged |
| D-07 (vertical priority stack) | ✓ PlatformIssues → Cluster → Storage → OrgHealth → RecentAudit |
| D-12 (DataTable migration) | ✓ OrgHealthDataTable with columns per UI-SPEC + default sort + row click + Actions menu |

## Threat-Model Coverage

| Threat | Disposition | Coverage |
|--------|-------------|----------|
| T-18-AUTHZ-ADMIN | mitigate | All fetches hit `/api/admin/dashboard/*` which inherit Plan 01's class-level `@UseGuards(SuperAdminGuard)`. Frontend does not re-guard. |
| T-18-INFO-LEAK-STORAGE | accept | Super-admin scope by design. |
| T-18-XSS-ORG-NAME | mitigate | `{row.original.orgName}` flows through React text-child auto-escape. `grep -c dangerouslySetInnerHTML` on new files = 0. |
| T-18-DOS-DASH | accept | Three 30s-poll hooks (count + count + list) + existing 3 Plan 05 hooks. Seven hooks is below the baseline load. |
| T-18-SORT-OVERFLOW | accept | Client-side sort. Orgs scale ~tens. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Fixed pre-existing Plan 05 build error in storage-forecast-card.tsx**
- **Found during:** Task 2 verification (`pnpm build`).
- **Issue:** `<Tooltip formatter={(value: number) => [`${value} GB`, 'Storage']} />`. Recharts types `value` as `ValueType | undefined`; the explicit `number` annotation over-narrowed and Next.js strict typecheck rejected the file during `pnpm build`. Confirmed pre-existing on the pre-Plan-06 tree (git stash → build still fails).
- **Fix:** dropped the explicit annotation and wrapped with `Number(value)`. Kept behaviour identical for valid numeric inputs; coerces undefined to 0 instead of crashing.
- **Files modified:** `apps/web/src/components/dashboard/storage-forecast-card.tsx`
- **Commit:** `7820314` (folded into Task 2 GREEN commit; tests for storage-forecast-card still pass)

### Infrastructural (not committed, not production)

- **Symlinked node_modules from main repo** into worktree (`node_modules`, `apps/web/node_modules`, `apps/api/node_modules`). Worktree clones do not auto-install dependencies; symlinks are gitignored. Same pattern as prior Plan 00.
- **Copied `.env.test`** from main repo to `.claude/worktrees/.../apps/api/.env.test` so the api test suite could validate Plan 01 regression. Also gitignored.

No architectural changes (Rule 4) required.

## Issues Encountered

None that blocked completion. The one build-time type error surfaced is documented above and resolved inline.

## Known Stubs

None introduced. The new components render real data from real hooks (mocked only at test time). No hardcoded placeholder data, no "Coming soon", no TODO markers in production code.

## User Setup Required

None. The Plan 06 composition flows from Plan 01 endpoints + Plan 05 widgets with no new env vars, migrations, or tooling.

## Next Phase Readiness

- **Phase 18 is wave-complete** on the super-admin track. UI-05 requirement now fully delivered across Plan 01 (backend), Plan 03/05 (widgets), Plan 06 (composition).
- **DataTable.initialState** is a new general-purpose wrapper capability. Future plans that need declarative sort/visibility (e.g. Phase 14 follow-ups on Team page, Organizations page) can drop-in use this prop without further changes.

## Self-Check: PASSED

**Commit existence checks:**
- `bcdd6e8` (Task 1 RED) — FOUND via `git log --oneline HEAD~4..HEAD`
- `af92ebc` (Task 1 GREEN) — FOUND
- `9f9cb6a` (Task 2 RED) — FOUND
- `7820314` (Task 2 GREEN) — FOUND

**File existence checks:**
- `apps/web/src/app/admin/dashboard/components/org-health-columns.tsx` — FOUND
- `apps/web/src/app/admin/dashboard/components/org-health-data-table.tsx` — FOUND
- `apps/web/src/hooks/use-platform-dashboard.ts` — MODIFIED (3 new exports)
- `apps/web/src/components/pages/platform-dashboard-page.tsx` — MODIFIED (refactored)
- `apps/web/src/components/ui/data-table/data-table.tsx` — MODIFIED (initialState prop)
- `apps/web/src/__tests__/platform-dashboard-page.test.tsx` — MODIFIED (5 it assertions)
- `apps/web/src/app/admin/dashboard/components/org-health-data-table.test.tsx` — MODIFIED (5 it assertions)

**Acceptance-criteria grep checks (from PLAN.md):**
- `grep -c "export function useActiveStreamsCount" apps/web/src/hooks/use-platform-dashboard.ts` = 1 (≥1) — PASS
- `grep -c "export function useRecordingsActive" apps/web/src/hooks/use-platform-dashboard.ts` = 1 (≥1) — PASS
- `grep -c "export function useOrgHealthOverview" apps/web/src/hooks/use-platform-dashboard.ts` = 1 (≥1) — PASS
- `test -f apps/web/src/components/ui/progress.tsx` — PASS (pre-existing)
- `grep -c "makeOrgHealthColumns" apps/web/src/app/admin/dashboard/components/org-health-columns.tsx` = 1 (≥1) — PASS
- `grep -c "cameraUsagePct\|storageUsagePct" apps/web/src/app/admin/dashboard/components/org-health-columns.tsx` = 6 (≥2) — PASS
- `grep -c "Organization Health" apps/web/src/app/admin/dashboard/components/org-health-data-table.tsx` = 1 (≥1) — PASS
- `grep -c "/admin/organizations/" apps/web/src/app/admin/dashboard/components/org-health-data-table.tsx` = 1 (≥1) — PASS
- `grep -c "it.todo" apps/web/src/app/admin/dashboard/components/org-health-data-table.test.tsx` = 0 — PASS
- W6 (hidden computed column) — `grep -c "id: 'maxUsagePct'" apps/web/src/app/admin/dashboard/components/org-health-columns.tsx` = 1 (≥1) — PASS
- W6 (initialState sort) — `grep -c "initialState" apps/web/src/app/admin/dashboard/components/org-health-data-table.tsx` = 1 (≥1) — PASS
- W6 (no manual pre-sort) — `grep -cE "data\.sort\(|orgs\.sort\(" apps/web/src/app/admin/dashboard/components/org-health-data-table.tsx` = 0 — PASS
- `grep -c "Active Streams" apps/web/src/components/pages/platform-dashboard-page.tsx` = 1 (≥1) — PASS
- `grep -c "Recordings Active" apps/web/src/components/pages/platform-dashboard-page.tsx` = 1 (≥1) — PASS
- `grep -c "useActiveStreamsCount" apps/web/src/components/pages/platform-dashboard-page.tsx` = 2 (≥1) — PASS
- `grep -c "useRecordingsActive" apps/web/src/components/pages/platform-dashboard-page.tsx` = 2 (≥1) — PASS
- `grep -c "xl:grid-cols-7" apps/web/src/components/pages/platform-dashboard-page.tsx` = 2 (≥2) — PASS
- `grep -c "PlatformIssuesPanel\|ClusterNodesPanel\|StorageForecastCard\|OrgHealthDataTable\|RecentAuditHighlights" apps/web/src/components/pages/platform-dashboard-page.tsx` = 10 (≥5) — PASS
- `grep -c "Organization Summary" apps/web/src/components/pages/platform-dashboard-page.tsx` = 0 — PASS
- `grep -c "from '@/components/ui/table'" apps/web/src/components/pages/platform-dashboard-page.tsx` = 0 — PASS
- `grep -c "it.todo" apps/web/src/__tests__/platform-dashboard-page.test.tsx` = 0 — PASS

**Test-run checks:**
- `pnpm test -- --run src/app/admin/dashboard/components/org-health-data-table.test.tsx` → 5 passed / 0 todo — PASS
- `pnpm test -- --run src/__tests__/platform-dashboard-page.test.tsx` → 5 passed / 0 todo — PASS
- `pnpm test` (full web suite) → 210 passed, 1 skipped, 13 todo across 37 files — PASS
- `pnpm build` (apps/web) → optimized production build succeeds, all types validate — PASS
- `pnpm test -- --run tests/admin/admin-dashboard.test.ts` (apps/api) → 17 passed — PASS (no Plan 01 regression)

---
*Phase: 18-dashboard-map-polish*
*Completed: 2026-04-21*
