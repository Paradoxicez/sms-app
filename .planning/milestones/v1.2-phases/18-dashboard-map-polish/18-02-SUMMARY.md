---
phase: 18-dashboard-map-polish
plan: 02
subsystem: frontend-dashboard
tags: [nextjs, react, vitest, dashboard, tenant, issues-panel, tdd, socket-io]

# Dependency graph
requires:
  - phase: 18
    plan: 00
    provides: "5 it.todo stubs in issues-panel.test.tsx + 6 it.todo stubs in tenant-dashboard-page.test.tsx; shared camera-fixtures module with DashboardCameraExt (adds isRecording, maintenanceMode, maintenanceEnteredBy/At, retentionDays)"
  - phase: 18
    plan: 01
    provides: "extended /api/dashboard/stats contract (+camerasRecording, +camerasInMaintenance) and /api/dashboard/cameras contract (+isRecording, +maintenanceMode, +maintenanceEnteredBy/At, +retentionDays)"
provides:
  - "IssuesPanel tenant dashboard component + useDashboardIssues composition hook (severity-sorted issues, reward empty state)"
  - "Extended DashboardStats + DashboardCamera TypeScript interfaces in apps/web"
  - "Refactored tenant dashboard page — 6 stat cards, no SystemMetrics, no CameraStatusTable, IssuesPanel wired"
affects: [18-03, 18-04, 18-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compose-only derivation hook (useDashboardIssues reads useCameraStatusList, returns sorted issues + onlineCount — no fetch side effects)"
    - "useMemo-based stable issue list to avoid re-sorting on unrelated re-renders"
    - "Panel rendering decoupled from sorting (hook sorts; panel just maps) — enables targeted sort tests in a dedicated hook test file"
    - "Mock hook return for component tests; mock raw camera list for hook tests (two-layer isolation keeps each test surface tiny)"

key-files:
  created:
    - apps/web/src/hooks/use-dashboard-issues.ts
    - apps/web/src/hooks/use-dashboard-issues.test.ts
    - apps/web/src/components/dashboard/issues-panel.tsx
  modified:
    - apps/web/src/hooks/use-dashboard-stats.ts
    - apps/web/src/components/pages/tenant-dashboard-page.tsx
    - apps/web/src/components/dashboard/issues-panel.test.tsx
    - apps/web/src/__tests__/tenant-dashboard-page.test.tsx

key-decisions:
  - "Sort lives in the hook, not the component. The panel test asserts render order matches hook output; the hook test asserts the canonical severity order. Rationale: two tightly-scoped test surfaces each covering one concern — avoids a single bloated test that renders DOM + exercises sort logic simultaneously."
  - "Added a dedicated use-dashboard-issues.test.ts (3 tests) beyond the 5 flipped panel stubs. The plan specified severity-sort coverage in the panel test, but the panel test mocks useDashboardIssues (so its sort never runs). Moving sort coverage to the hook test gives genuine sort-logic validation without coupling to DOM details."
  - "Kept useCameraStatusList + setCameras in the page even though IssuesPanel consumes its own copy internally. Reason: the page-level useCameraStatus Socket.IO subscription pushes status/viewer updates via setCameras — removing the page call would break real-time updates. Hooks are independent state (each call = its own state), so IssuesPanel's copy polls on its own 30s interval and the page's copy receives Socket.IO pushes. This duplication is a known trade-off; a future cleanup could hoist state to a context provider."
  - "Used data-testid + data-camera-id on issue rows rather than role-based queries. Rationale: rows are semantic <div>s with a nested action button; a single aria-labelled container proved brittle when testing order (the aria-label contains camera name which leaks into accessible-name matches for the outer row)."
  - "Wrench icon kept imported + sr-only rendered in empty state so lucide-react tree-shakes retain it. Alternative would be conditional import — rejected because lucide-react is already bundled and the hidden span costs zero bytes at runtime."

requirements-completed: [UI-05]

# Metrics
duration: ~11 min
completed: 2026-04-21
---

# Phase 18 Plan 02: Tenant Dashboard Refactor Summary

**Refactors the tenant dashboard to D-01..D-04: drops SystemMetrics (moved to /admin in a future plan), expands the stat strip from 4 to 6 cards (adds Recording + In Maintenance fed by Plan 01 counters), keeps BandwidthChart + ApiUsageChart, and replaces the CameraStatusTable with a severity-sorted IssuesPanel backed by a new useDashboardIssues composition hook — flipping 11 Plan 00 it.todo stubs to green assertions and closing the UI-05 tenant surface.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-04-21T08:11:07Z
- **Completed:** 2026-04-21T08:22:11Z (approx)
- **Tasks:** 2
- **Files created:** 3 (1 hook + 1 hook test + 1 component)
- **Files modified:** 4 (1 hook types, 1 page, 2 existing test files)
- **Commits:** 5 (2 RED + 2 GREEN + 1 chore)

## Accomplishments

- **IssuesPanel replaces CameraStatusTable on the tenant dashboard** (D-04). Empty state shows a CheckCircle2 reward + `{onlineCount} cameras online, 0 issues.` body. Loading state is 3 × Skeleton-h-14 rows. Error state is the project destructive banner + Retry. Issue rows render the camera name, a severity-specific meta line (`Offline · last seen {time}`, `Maintenance · by {user} · {time}`, `{Status} · {duration} since status change`), and a ghost Button that routes to `/app/cameras/{id}` via `next/navigation`.
- **useDashboardIssues hook** composes the existing `useCameraStatusList` (30s polling already in place from pre-Phase 18) and derives a severity-sorted `issues[]` plus an `onlineCount`. Severity order: offline → degraded → reconnecting → maintenance. `recording-failed` is deferred per RESEARCH OQ-01 with a named comment so a future plan can insert the missing rank without a refactor.
- **Tenant dashboard page refactored** (D-01 + D-02 + D-03 + D-04). SystemMetrics import dropped; `userRole` state + `isSuperAdmin` computation removed; loading skeleton now produces six placeholders; StatCard grid is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6` per UI-SPEC Layout §Tenant Dashboard; Recording (Video icon, `{N} active` badge) and In Maintenance (Wrench icon, no badge) added between the existing Offline and Total Viewers cards; BandwidthChart + ApiUsageChart grid untouched.
- **All 11 Plan 00 tenant stubs flipped green.**
  - `issues-panel.test.tsx` — 5/5 real tests (empty state reward, severity sort-order preservation, Investigate navigation, maintenance meta copy, `{N} cameras online` body).
  - `tenant-dashboard-page.test.tsx` — 6/6 real tests (no SystemMetrics, 6 stat-card labels, grid classes, charts preserved, IssuesPanel rendered, no role state).
  - Plus 3 bonus tests in `use-dashboard-issues.test.ts` for the sort + filter logic (severity rank contract, healthy filter, maintenance-is-an-issue filter).
- **Type contract aligned to Plan 01 backend.** `DashboardStats` extended with `camerasRecording` + `camerasInMaintenance`; `DashboardCamera` extended with `isRecording`, `maintenanceMode`, `maintenanceEnteredBy`, `maintenanceEnteredAt`, `retentionDays`. Schema-field-spelling guard holds (zero occurrences of the pre-Phase-15 `maintenanceEnabledBy` typo).
- **Build + typecheck green.** `pnpm build` completes; `tsc --noEmit` clean. Full vitest suite: 28 files / 172 tests green, 9 skipped, 48 todo (Plan 00 stubs for Plans 03–05).

## Task Commits

1. **Task 1 — TDD RED:** `test(18-02): add failing tests for IssuesPanel (5 UI-05 D-04 assertions)` — `6ec46dc`
2. **Task 1 — TDD GREEN:** `feat(18-02): add IssuesPanel + useDashboardIssues, extend dashboard types` — `f0b899f`
3. **Task 2 — TDD RED:** `test(18-02): add failing tests for tenant dashboard refactor` — `8d713e1`
4. **Task 2 — TDD GREEN:** `feat(18-02): refactor tenant dashboard — 6 stat cards + IssuesPanel (D-01..D-04)` — `def08a1`
5. **Cleanup:** `chore(18-02): remove it.todo token from test file comments` — `76599c5`

## Files Created/Modified

### Created

- `apps/web/src/hooks/use-dashboard-issues.ts` — `useDashboardIssues` hook with severityRank + secondary-by-lastOnlineAt sort; returns `{ issues, loading, error, onlineCount }`. OQ-01 recording-failed deferred with named comment.
- `apps/web/src/hooks/use-dashboard-issues.test.ts` — 3 tests for sort order, healthy filter, maintenance-as-issue counting.
- `apps/web/src/components/dashboard/issues-panel.tsx` — `IssuesPanel` client component rendering Card + CardHeader/Title + subtitle + loading/error/empty/list states. Uses `formatDistanceToNowStrict` from date-fns and `useRouter` from next/navigation.

### Modified

- `apps/web/src/hooks/use-dashboard-stats.ts` — 7 new type fields (2 on DashboardStats, 5 on DashboardCamera). No runtime behavior changes.
- `apps/web/src/components/pages/tenant-dashboard-page.tsx` — removed SystemMetrics + CameraStatusTable imports, removed `userRole` state + `isSuperAdmin` gate, added Recording + In Maintenance StatCards, expanded grid to `xl:grid-cols-6`, wired `<IssuesPanel />`. Kept orgId session lookup + Socket.IO subscription (still needed for real-time camera updates downstream).
- `apps/web/src/components/dashboard/issues-panel.test.tsx` — 5 it.todo → 5 real it assertions.
- `apps/web/src/__tests__/tenant-dashboard-page.test.tsx` — 6 it.todo → 6 real it assertions.

## Test Counts

| File | Before (Plan 00) | After (Plan 02) |
|------|------------------|------------------|
| `issues-panel.test.tsx` | 5 `it.todo` | **5 `it` green**, 0 todo |
| `tenant-dashboard-page.test.tsx` | 6 `it.todo` | **6 `it` green**, 0 todo |
| `use-dashboard-issues.test.ts` (new) | — | **3 `it` green** |

Plan-02 target stubs flipped: **11 / 11 (100%).** Plus 3 bonus hook tests.

## Decisions Made

1. **Sort in the hook, render in the component** — two tightly-scoped test surfaces (hook test for sort logic, panel test for render contract). Avoids a single bloated test that renders DOM + exercises sort simultaneously.
2. **Dedicated `use-dashboard-issues.test.ts`** covers sort order + filtering (3 tests beyond the 5 flipped panel stubs). Rationale: the plan asks for severity-sort coverage but the panel test mocks `useDashboardIssues` away, so a hook-level test is the only place the actual sort can be exercised.
3. **Kept `useCameraStatusList + setCameras` in the page** even though IssuesPanel consumes its own copy via the same hook. Reason: the page-level `useCameraStatus` Socket.IO subscription pushes updates through `setCameras` to keep camera-status reactive. Each hook call is independent React state, so IssuesPanel polls on its own 30s interval while the page receives pushes — a known duplication noted for a possible future context-provider refactor.
4. **`data-testid="issue-row" + data-camera-id="{id}"`** on rows, not role-based queries. Rationale: aria-labelled containers proved brittle when testing row order because the aria-label contains the camera name, which fuzzy-matches unrelated DOM queries.
5. **Wrench icon imported but rendered hidden in empty state** to retain the lucide-react tree-shake budget. Zero runtime cost; keeps the icon ready for maintenance rows.
6. **Mocked `IssuesPanel` in the page test** so the page test stays focused on the page contract (grid classes, card labels, replacement wiring) without pulling the panel's data-fetch graph into scope. Panel behavior is separately covered by `issues-panel.test.tsx`.

## Threat-Model Coverage

| Threat | Disposition | Coverage |
|--------|-------------|----------|
| T-18-TENANCY-ISSUES | mitigate (inherit) | Backend Plan 01 scopes `/api/dashboard/cameras` via TENANCY_CLIENT. Frontend simply renders what backend returns — no new trust boundary introduced. |
| T-18-XSS-DASH-NAME | mitigate | Camera `name` + `maintenanceEnteredBy` are interpolated via JSX (React auto-escapes). Verified via `grep -c dangerouslySetInnerHTML apps/web/src/components/dashboard/issues-panel.tsx` → 0. |
| T-18-CSRF-NAV | accept | Row navigation is GET-only via `router.push`. Route itself carries its own session guard from the app-layout wrapper. |

## Deviations from Plan

None material. Two minor inline adjustments:

1. **Severity-sort coverage moved to a new `use-dashboard-issues.test.ts`** rather than exercising the sort inside the panel test. Reason: the plan says the panel test should verify sort order, but the plan also says `vi.mock` the `useDashboardIssues` hook in the panel test — making real sort logic unreachable from the panel surface. I kept the panel sort-order test (now asserting the panel preserves hook output order) and added 3 dedicated hook tests for the actual sort logic. Net: 11 planned tests flipped + 3 bonus = more sort coverage, not less.
2. **`CameraStatusTable` left in-place as a file** (per plan guidance "DO NOT DELETE — just remove import; cleanup deferred"). All imports removed from the tenant dashboard page; acceptance grep `CameraStatusTable == 0` passes on the page file.

## Issues Encountered

- **Worktree node_modules missing** (same infrastructural issue noted in Plan 00 / Plan 01 SUMMARY). Resolved by symlinking from main repo — symlinks are not committed.
- **vitest transform cache showed `5 todo` after the test file was updated during Task 1 RED.** Re-ran vitest and the cache cleared on the next invocation. No data was lost; just confusing during iteration.

## Known Stubs

None. All placeholder counter values are live-backed by Plan 01 `/api/dashboard/stats` + `/api/dashboard/cameras`. Empty states are semantic UX (reward signal, not placeholder content). No hardcoded empty arrays that flow to UI rendering.

## User Setup Required

None — frontend-only refactor. No migrations, no env-var changes. Next deploy surfaces the refactored dashboard automatically.

## Next Phase Readiness

- **Plan 03 (super admin dashboard shell)** ready: consumes `camerasRecording` + `camerasInMaintenance` counters indirectly (via `/api/admin/dashboard/recordings-active`) and can reuse `IssuesPanel` pattern for the new `PlatformIssuesPanel`.
- **Plan 04 (map marker)** independent — continues on its own track.
- **Plan 05 (map popup)** can reuse the Phase 15 field shape (`isRecording`, `maintenanceMode`, `maintenanceEnteredBy/At`, `retentionDays`) which now flows through DashboardCamera via Plan 01 and is rendered in IssuesPanel.

## Self-Check: PASSED

**Commit existence checks:**
- `6ec46dc` (Task 1 RED) — FOUND via `git log --oneline HEAD~6..HEAD`.
- `f0b899f` (Task 1 GREEN) — FOUND.
- `8d713e1` (Task 2 RED) — FOUND.
- `def08a1` (Task 2 GREEN) — FOUND.
- `76599c5` (chore cleanup) — FOUND.

**File existence checks:**
- `apps/web/src/hooks/use-dashboard-issues.ts` — CREATED (2678 bytes).
- `apps/web/src/hooks/use-dashboard-issues.test.ts` — CREATED.
- `apps/web/src/components/dashboard/issues-panel.tsx` — CREATED.
- `apps/web/src/hooks/use-dashboard-stats.ts` — MODIFIED (+7 type fields).
- `apps/web/src/components/pages/tenant-dashboard-page.tsx` — MODIFIED (refactored).
- `apps/web/src/components/dashboard/issues-panel.test.tsx` — MODIFIED (flipped).
- `apps/web/src/__tests__/tenant-dashboard-page.test.tsx` — MODIFIED (flipped).

**Acceptance-criteria grep checks (from PLAN.md Task 1):**
- `grep -c 'camerasRecording: number'` = 1 (>=1) — PASS
- `grep -c 'camerasInMaintenance: number'` = 1 (>=1) — PASS
- `grep -c 'isRecording: boolean'` = 1 (>=1) — PASS
- `grep -c 'maintenanceEnteredBy: string | null'` = 1 (>=1) — PASS
- `grep -c 'maintenanceEnabledBy|maintenanceEnabledAt'` = 0 (==0) — PASS
- `grep -c 'export function useDashboardIssues'` = 1 (>=1) — PASS
- `grep -c 'severityRank'` = 2 (>=1) — PASS
- `grep -cE 'OQ-01|recording-failed deferred'` = 1 (>=1) — PASS
- `grep -c 'All cameras healthy'` = 1 (>=1) — PASS
- `grep -c 'CheckCircle2'` = 2 (>=1) — PASS
- `grep -c 'formatDistanceToNowStrict'` = 4 (>=1) — PASS
- `grep -c 'it.todo' issues-panel.test.tsx` = 0 (==0) — PASS

**Acceptance-criteria grep checks (from PLAN.md Task 2):**
- `grep -c 'SystemMetrics'` = 0 (==0) — PASS
- `grep -c 'CameraStatusTable'` = 0 (==0) — PASS
- `grep -c 'isSuperAdmin|userRole'` = 0 (==0) — PASS
- `grep -c 'IssuesPanel'` = 3 (>=1) — PASS
- `grep -c 'camerasRecording' page` = 3 (>=1) — PASS
- `grep -c 'camerasInMaintenance' page` = 1 (>=1) — PASS
- `grep -c 'xl:grid-cols-6'` = 2 (>=2) — PASS
- `grep -c 'BandwidthChart'` = 2 (>=1) — PASS
- `grep -c 'ApiUsageChart'` = 2 (>=1) — PASS
- `grep -c 'it.todo' tenant-dashboard-page.test.tsx` = 0 (==0) — PASS

**Test-run checks:**
- `pnpm test -- --run src/components/dashboard/issues-panel.test.tsx` → 5 passed / 0 failed / 0 todo — PASS
- `pnpm test -- --run src/__tests__/tenant-dashboard-page.test.tsx` → 6 passed / 0 failed / 0 todo — PASS
- `pnpm test -- --run src/hooks/use-dashboard-issues.test.ts` → 3 passed — PASS
- `pnpm test` (full suite) → 28 files passed / 9 skipped / 172 passed / 48 todo (Plan 00 stubs for Plans 03–05) — PASS
- `tsc --noEmit` → 0 errors — PASS
- `next build` → compiled successfully — PASS

---
*Phase: 18-dashboard-map-polish*
*Completed: 2026-04-21*
