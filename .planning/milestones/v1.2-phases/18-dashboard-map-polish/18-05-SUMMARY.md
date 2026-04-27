---
phase: 18-dashboard-map-polish
plan: 05
subsystem: frontend-ui
tags: [nextjs, react, recharts, base-ui, shadcn, super-admin, dashboard, tdd]

# Dependency graph
requires:
  - phase: 18
    plan: 00
    provides: "it.todo stubs in 4 platform-dashboard widget test files (13 stubs total)"
  - phase: 18
    plan: 01
    provides: "GET /api/admin/dashboard/{platform-issues,cluster-nodes,storage-forecast,recent-audit} endpoints"
provides:
  - "4 super-admin dashboard widgets: PlatformIssuesPanel, ClusterNodesPanel, StorageForecastCard, RecentAuditHighlights"
  - "usePlatformDashboard hook module — usePlatformIssues, useStorageForecast(range), useRecentAudit(limit) with 30s polling"
  - "ToggleGroup / ToggleGroupItem primitives wrapping @base-ui/react (shadcn-like API)"
affects: [18-06]

# Tech tracking
tech-stack:
  added: []  # ToggleGroup was added via @base-ui/react already installed — no new dependency
  patterns:
    - "shadcn-like ToggleGroup API (type='single'/'multiple' + onValueChange(string|string[])) layered over @base-ui/react's array-based toggle-group"
    - "BigInt string → number GB conversion via divmod (preserves fractional GB across the BigInt→Number boundary)"
    - "Range-change re-fetch via useEffect deps on range (mirrors useUsageTimeSeries pattern)"
    - "Caption conditional styling with cn() helper (text-destructive when daysUntilFull ≤14)"

key-files:
  created:
    - apps/web/src/components/ui/toggle-group.tsx
    - apps/web/src/hooks/use-platform-dashboard.ts
    - apps/web/src/components/dashboard/platform-issues-panel.tsx
    - apps/web/src/components/dashboard/cluster-nodes-panel.tsx
    - apps/web/src/components/dashboard/storage-forecast-card.tsx
    - apps/web/src/components/dashboard/recent-audit-highlights.tsx
  modified:
    - apps/web/src/components/dashboard/platform-issues-panel.test.tsx
    - apps/web/src/components/dashboard/cluster-nodes-panel.test.tsx
    - apps/web/src/components/dashboard/storage-forecast-card.test.tsx
    - apps/web/src/components/dashboard/recent-audit-highlights.test.tsx

key-decisions:
  - "Use @base-ui/react/toggle-group directly instead of `npx shadcn@latest add toggle-group`. The project already standardises on @base-ui/react (Toggle, Tabs, Button, etc.) — pulling in a shadcn/Radix variant would split the primitive layer. Created a thin shadcn-compatible wrapper so the widget code reads identically to Radix-based shadcn."
  - "Mock recharts `ResponsiveContainer` in the storage forecast test. JSDOM has no layout engine, so a ResizeObserver-driven ResponsiveContainer renders 0×0 and Recharts skips drawing. Stubbing it to a fixed-size div lets the caption assertion run while keeping the rest of Recharts real."
  - "BigInt → GB via divmod (`whole = Number(big/1GB)`, `frac = Number(big%1GB)/Number(1GB)`) preserves 2 decimal places of accuracy even past Number.MAX_SAFE_INTEGER. The plan suggested a simple `Number(BigInt/1GB)` which would truncate fractional GB values to whole numbers."
  - "Stopped at 7 visible entries with `entries.slice(0, 7)` in RecentAuditHighlights even though `useRecentAudit(7)` already requests at most 7. Defensive: if the backend were to honour the cap loosely, the UI would still comply with the D-11 spec."
  - "Did NOT touch Plan 02's in-flight `issues-panel.test.tsx` that is dirty in this worktree (uncommitted modification from a parallel agent). Per scope boundary, Plan 05 only owns the 4 platform-widget test files."

requirements-completed: [UI-05]

# Metrics
duration: ~6 min
completed: 2026-04-21
---

# Phase 18 Plan 05: Super-admin Dashboard Widgets Summary

**Four new platform-dashboard widgets — PlatformIssuesPanel (D-09 reward-state + 5 issue-type rows), ClusterNodesPanel (D-08 5-column table consuming the existing useClusterNodes Socket.IO hook), StorageForecastCard (D-10 Recharts LineChart + 7d/30d ToggleGroup + destructive-styled caption), RecentAuditHighlights (D-11 7-entry feed + /admin/audit link), plus a shadcn-like ToggleGroup primitive over @base-ui/react and a usePlatformDashboard hook with 3 polling sub-hooks — flipping all 13 Plan 00 it.todo stubs to green via TDD RED→GREEN.**

## Performance

- **Duration:** ~6 min (2026-04-21T08:12:50Z → 2026-04-21T08:18:27Z)
- **Tasks:** 2
- **Files created:** 6 (1 UI primitive + 1 hook + 4 widgets)
- **Files modified:** 4 (test stubs flipped to assertions)
- **Commits:** 4 (2 TDD RED, 2 TDD GREEN)

## Accomplishments

- **Super-admin dashboard widget kit shipped.** Four self-contained components that Plan 06 will drop into the platform dashboard page:
  - `PlatformIssuesPanel` — empty state reward ("Platform healthy" + CheckCircle2), rows for srs-down, edge-down, minio-down, ffmpeg-saturated, org-offline-rate with per-type action copy + navigation (Investigate / View cluster / View processes / View org) via `useRouter`.
  - `ClusterNodesPanel` — 5-column shadcn `<Table>` (Node / Role / Status / Uptime / Connections) with colored status dots (ONLINE green, OFFLINE red, DEGRADED amber, CONNECTING blue). Reuses the existing `useClusterNodes` hook so Socket.IO real-time updates work automatically.
  - `StorageForecastCard` — Recharts `<LineChart>` with 7d/30d `ToggleGroup` (default 7d), BigInt→GB conversion with fractional precision, days-until-full caption that swaps to `text-destructive` at ≤14 days and falls back to "Not enough data yet." when the backend returns null.
  - `RecentAuditHighlights` — up to 7 rows in `{actor} {verb} {resource} {org} · {relative time}` format (verbForAction maps create/update/delete → past tense, otherwise echoes the action), footer link to `/admin/audit`, empty state "No recent platform activity."
- **ToggleGroup primitive.** `apps/web/src/components/ui/toggle-group.tsx` wraps `@base-ui/react/toggle-group` + `@base-ui/react/toggle` with a shadcn-like `type="single" | "multiple"` API. Converts between single-value (`string`) and the base-ui array shape internally so the rest of the codebase reads as if it were Radix-based shadcn. Items render with `role="radio"` so tests can query them semantically.
- **usePlatformDashboard hook.** Three polling sub-hooks mirroring the existing `useDashboardStats` pattern: state + useCallback fetcher + useEffect with `setInterval(30000)` + cleanup. `useStorageForecast(range)` re-fetches immediately when range switches; `useRecentAudit(limit=7)` is parameterised to support future plans that want a different cap.
- **TDD discipline.** Both tasks followed RED (tests fail on missing imports) → GREEN (implementation committed separately). Test files mock the hook module + `next/navigation` + `recharts.ResponsiveContainer`; no real network calls, no flake.
- **13 / 13 Plan 00 stubs flipped green.**
  - `platform-issues-panel.test.tsx` — 3 passed (was 3 `it.todo`)
  - `cluster-nodes-panel.test.tsx` — 3 passed
  - `storage-forecast-card.test.tsx` — 3 passed
  - `recent-audit-highlights.test.tsx` — 4 passed

## Task Commits

1. **Task 1 — TDD RED:** `test(18-05): add failing tests for PlatformIssuesPanel + ClusterNodesPanel` — `71b4a49`
2. **Task 1 — TDD GREEN:** `feat(18-05): add PlatformIssuesPanel + ClusterNodesPanel + toggle-group primitive` — `581d3ce`
3. **Task 2 — TDD RED:** `test(18-05): add failing tests for StorageForecastCard + RecentAuditHighlights` — `0009e46`
4. **Task 2 — TDD GREEN:** `feat(18-05): add StorageForecastCard + RecentAuditHighlights` — `45caf4e`

## Files Created / Modified

### UI primitive (1 file)
- `apps/web/src/components/ui/toggle-group.tsx` — `ToggleGroup` (single/multiple) + `ToggleGroupItem` over `@base-ui/react`, shares styling with existing `Toggle` via `toggleVariants`.

### Hook (1 file)
- `apps/web/src/hooks/use-platform-dashboard.ts` — `usePlatformIssues`, `useStorageForecast(range)`, `useRecentAudit(limit=7)`, each polling every 30s, plus shared `PlatformIssue`, `StorageForecast`, `AuditHighlight` types.

### Dashboard widgets (4 files)
- `apps/web/src/components/dashboard/platform-issues-panel.tsx`
- `apps/web/src/components/dashboard/cluster-nodes-panel.tsx`
- `apps/web/src/components/dashboard/storage-forecast-card.tsx`
- `apps/web/src/components/dashboard/recent-audit-highlights.tsx`

### Test files (4 modified)
- `apps/web/src/components/dashboard/platform-issues-panel.test.tsx` — 3 real assertions
- `apps/web/src/components/dashboard/cluster-nodes-panel.test.tsx` — 3 real assertions
- `apps/web/src/components/dashboard/storage-forecast-card.test.tsx` — 3 real assertions
- `apps/web/src/components/dashboard/recent-audit-highlights.test.tsx` — 4 real assertions

## Test Counts

| File | Before (Plan 00) | After (Plan 05) |
|------|------------------|------------------|
| `platform-issues-panel.test.tsx` | 3 `it.todo` | **3 `it` green**, 0 todo |
| `cluster-nodes-panel.test.tsx` | 3 `it.todo` | **3 `it` green**, 0 todo |
| `storage-forecast-card.test.tsx` | 3 `it.todo` | **3 `it` green**, 0 todo |
| `recent-audit-highlights.test.tsx` | 4 `it.todo` | **4 `it` green**, 0 todo |

Plan 05 target stubs flipped: **13 / 13 (100%)**.

## Threat-Model Coverage

| Threat | Disposition | Coverage |
|--------|-------------|----------|
| T-18-AUTHZ-ADMIN | mitigate | Widgets hit `/api/admin/dashboard/*` which is class-level `@UseGuards(SuperAdminGuard)` per Plan 01. Frontend does not re-guard. |
| T-18-INFO-LEAK-STORAGE | accept | StorageForecastCard only imported by the super-admin dashboard composition (Plan 06). Tenant portal has no code path to it. |
| T-18-AUDIT-PII | accept | RecentAuditHighlights uses existing PII surface already exposed in `/admin/audit`. |
| T-18-XSS-AUDIT | mitigate | All interpolation goes through React text children (auto-escapes). `grep -c dangerouslySetInnerHTML` returns 0 across the 6 new files. |
| T-18-DOS-FORECAST | accept | 30s polling + user-driven range change. Range is locally clamped to `'7d' \| '30d'` before hitting the network (backend also validates via `z.enum`). |

## Decisions Made

1. **`@base-ui/react` instead of shadcn CLI install.** The project already uses `@base-ui/react` for Toggle, Tabs, Button, Select, Popover, Dialog, etc. Running `npx shadcn@latest add toggle-group` would install the Radix variant alongside and split the primitive layer. Instead, I wrote a shadcn-compatible wrapper at `components/ui/toggle-group.tsx` that exposes the same `type="single"/"multiple"` + `value` + `onValueChange` API. Call sites read identically to how Radix-based shadcn would.
2. **BigInt → GB with divmod preserves fractional precision.** The plan suggested `Number(BigInt(p.bytes) / BigInt(1024*1024*1024))` but BigInt integer division truncates, losing the fractional GB. I compute `whole + remainder/GB` so 1.5 GB stays 1.5 GB on the chart even when the raw bytes exceed Number.MAX_SAFE_INTEGER.
3. **Mock only Recharts' `ResponsiveContainer` in tests.** JSDOM has no layout engine; a real ResponsiveContainer sees 0×0 and Recharts skips the draw. Stubbing it to a fixed `800×256` div lets the rest of the chart render and the caption assertions (the actual focus) run deterministically.
4. **`useRouter` from `next/navigation` (App Router) for issue-row actions.** Matches the rest of the codebase (Phase 15/16/17 components all use the App Router hook). The plan also called it out in its `<interfaces>` section.
5. **Did NOT touch `issues-panel.test.tsx` / `issues-panel.tsx`.** Those files belong to Plan 02 (tenant dashboard shell). Plan 02 runs in parallel on another worktree in Wave 2. The Plan 05 scope boundary is only the 4 platform-widget test files plus their implementations. The `M` state on `issues-panel.test.tsx` in this worktree is a parallel-agent leak that is not Plan 05's concern.

## Deviations from Plan

1. **[Rule 3 — Blocking] ToggleGroup primitive source.** The plan said "Run `cd apps/web && npx shadcn@latest add toggle-group`". The project does not use shadcn's default Radix primitives — it uses `@base-ui/react`. I added a wrapper file that exports the same `ToggleGroup / ToggleGroupItem` with shadcn-compatible props, layered over `@base-ui/react/toggle-group`. No architectural change; no new dependency (`@base-ui/react` was already in `package.json`). This is covered by the plan's action-step fallback: "If shadcn CLI fails … manually create `apps/web/src/components/ui/toggle-group.tsx`". Committed in `581d3ce`.
2. **[Rule 3 — Blocking] Recharts ResponsiveContainer mock.** The plan did not mention JSDOM's layout gap. Without the stub, the chart never renders and the caption assertion still passes but the chart itself doesn't. I chose to mock only `ResponsiveContainer` (keeping `LineChart`/`Line`/etc. real) so the tests exercise as much of the real rendering path as possible. Committed in `0009e46`.

No architectural changes (Rule 4) were needed.

## Issues Encountered

- **`issues-panel.test.tsx` fails with "Failed to resolve import ./issues-panel"** when running the full dashboard directory. This is Plan 02's test file (tenant IssuesPanel) leaking into this worktree as an uncommitted modification from a parallel agent. Out of scope for Plan 05 per the GSD scope-boundary rule. The orchestrator's merge step for Wave 2 will resolve this when Plan 02's commits land.
- **Pre-existing TypeScript error** on `issues-panel.test.tsx:29` (`Cannot find module './issues-panel'`). Same root cause as above — Plan 02's concern.

## Known Stubs

None. All 6 new files render real data from either mocked hooks (in tests) or real hooks (in production). No hardcoded placeholder arrays, no "Coming soon", no TODO markers. The one piece that reads as a placeholder is the caption "Not enough data yet." — that is correct production behaviour when the backend returns `estimatedDaysUntilFull: null`, not a stub.

## User Setup Required

None — all consumers (the Plan 06 composition page) will get the widgets via normal imports. No migrations, no env vars, no CLI tools.

## Next Phase Readiness

- **Plan 06 (super-admin page refactor + OrgHealthDataTable)** — all 4 widgets ready to drop into the dashboard layout. Hook imports are `@/hooks/use-platform-dashboard` + `@/hooks/use-cluster-nodes`. Widget components default-export nothing; they are all named exports.
- **ToggleGroup primitive** — now available for any future page that needs a single or multi-select chip group.

## Self-Check: PASSED

**Commit existence checks:**
- `71b4a49` (Task 1 RED) — FOUND via `git log --oneline`
- `581d3ce` (Task 1 GREEN) — FOUND
- `0009e46` (Task 2 RED) — FOUND
- `45caf4e` (Task 2 GREEN) — FOUND

**File existence checks:**
- `apps/web/src/components/ui/toggle-group.tsx` — FOUND
- `apps/web/src/hooks/use-platform-dashboard.ts` — FOUND
- `apps/web/src/components/dashboard/platform-issues-panel.tsx` — FOUND
- `apps/web/src/components/dashboard/cluster-nodes-panel.tsx` — FOUND
- `apps/web/src/components/dashboard/storage-forecast-card.tsx` — FOUND
- `apps/web/src/components/dashboard/recent-audit-highlights.tsx` — FOUND

**Acceptance-criteria grep checks (from PLAN.md):**
- `grep -c 'ToggleGroup' toggle-group.tsx` = 21 (≥2) — PASS
- `grep -c 'export function usePlatformIssues' use-platform-dashboard.ts` = 1 — PASS
- `grep -c 'export function useStorageForecast' use-platform-dashboard.ts` = 1 — PASS
- `grep -c 'export function useRecentAudit' use-platform-dashboard.ts` = 1 — PASS
- `grep -c '30000' use-platform-dashboard.ts` = 1 — PASS (shared `POLL_INTERVAL_MS` constant)
- `grep -c 'Platform healthy' platform-issues-panel.tsx` = 2 (≥1) — PASS
- `grep -c 'All subsystems operational' platform-issues-panel.tsx` = 1 — PASS
- `grep -c 'Cluster & Edge Nodes' cluster-nodes-panel.tsx` = 1 — PASS
- `grep -c 'useClusterNodes' cluster-nodes-panel.tsx` = 2 (≥1) — PASS
- `grep -c 'ToggleGroup' storage-forecast-card.tsx` = 4 (≥1) — PASS
- `grep -c 'useStorageForecast' storage-forecast-card.tsx` = 2 (≥1) — PASS
- `grep -c 'Estimated' storage-forecast-card.tsx` = 1 — PASS
- `grep -c 'text-destructive' storage-forecast-card.tsx` = 3 (≥1) — PASS
- `grep -c 'Not enough data yet' storage-forecast-card.tsx` = 1 — PASS
- `grep -c 'LineChart\|ResponsiveContainer' storage-forecast-card.tsx` = 5 (≥2) — PASS
- `grep -c 'Recent Activity' recent-audit-highlights.tsx` = 1 — PASS
- `grep -c 'View full audit log' recent-audit-highlights.tsx` = 1 — PASS
- `grep -c '/admin/audit' recent-audit-highlights.tsx` = 1 — PASS
- `grep -c 'No recent platform activity' recent-audit-highlights.tsx` = 1 — PASS
- `grep -c 'verbForAction\|created\|updated\|deleted' recent-audit-highlights.tsx` = 5 (≥1) — PASS
- `grep -c 'it.todo' platform-issues-panel.test.tsx` = 0 — PASS
- `grep -c 'it.todo' cluster-nodes-panel.test.tsx` = 0 — PASS
- `grep -c 'it.todo' storage-forecast-card.test.tsx` = 0 — PASS
- `grep -c 'it.todo' recent-audit-highlights.test.tsx` = 0 — PASS

**Test-run checks:**
- `pnpm test -- --run src/components/dashboard/platform-issues-panel.test.tsx src/components/dashboard/cluster-nodes-panel.test.tsx src/components/dashboard/storage-forecast-card.test.tsx src/components/dashboard/recent-audit-highlights.test.tsx` → **4 files × 13 tests passed, 0 failed** — PASS

---
*Phase: 18-dashboard-map-polish*
*Completed: 2026-04-21*
