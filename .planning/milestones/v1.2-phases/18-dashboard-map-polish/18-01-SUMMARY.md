---
phase: 18-dashboard-map-polish
plan: 01
subsystem: backend-api
tags: [nestjs, prisma, zod, super-admin, dashboard, rls, tenancy, threat-mitigation]

# Dependency graph
requires:
  - phase: 18
    plan: 00
    provides: "it.todo stubs in tests/admin/admin-dashboard.test.ts (17) + tests/dashboard/dashboard.test.ts (3)"
  - phase: 15
    provides: "Camera.isRecording, maintenanceMode, maintenanceEnteredBy/At, retentionDays schema fields"
  - phase: 6
    provides: "ClusterService (exported from ClusterModule) + SrsNode schema"
provides:
  - "7 super-admin dashboard endpoints under /api/admin/dashboard/*"
  - "Enriched tenant /api/dashboard/stats (+2 counters) and /api/dashboard/cameras (+5 per-camera fields)"
  - "AdminDashboardService typed contracts: PlatformIssue, StorageForecastResult, OrgHealth"
affects: [18-02, 18-03, 18-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prisma.sql tagged-template parameter binding for $queryRaw (T-18-SQLI-FORECAST)"
    - "Zod controller-layer input validation (z.enum, z.coerce.number().min().max()) for T-18-DOS bounds"
    - "BigInt → string in service layer to prevent JSON.stringify crash (T-18-BIGINT-JSON)"
    - "Fail-open externals (SRS, audit) — log warn + return sentinel so one subsystem never 500s the dashboard"
    - "ClusterService delegation from AdminDashboardService (single source of truth for cluster shape)"

key-files:
  created:
    - .planning/phases/18-dashboard-map-polish/deferred-items.md
  modified:
    - apps/api/src/admin/admin-dashboard.service.ts
    - apps/api/src/admin/admin-dashboard.controller.ts
    - apps/api/src/admin/admin.module.ts
    - apps/api/src/dashboard/dashboard.service.ts
    - apps/api/tests/admin/admin-dashboard.test.ts
    - apps/api/tests/dashboard/dashboard.test.ts

key-decisions:
  - "Filter edge-down nodes at the DB layer (where.status.in) rather than in memory — cheap with the @@index([status]) already on SrsNode and keeps the response payload minimal. Test was refactored to mock filter behavior instead of asserting on unfiltered input."
  - "Recent-audit mapping (plan mentions 'organization.create', 'user.delete' etc. event types): translated to row-level (resource, action) pairs matching the existing AuditLog shape — resource IN ('organization', 'user'). No schema migration; existing audit interceptor already emits these rows for every org/user mutation."
  - "Storage forecast regression operates on cumulative daily bytes (not instantaneous slope per-day) to match UX expectation 'at current growth rate, how many days until full'. Returns null when < 2 data points, slope ≤ 0, or quota = 0."
  - "Controller-level zod validation (safeParse + BadRequestException) rather than ValidationPipe + DTO class — matches the existing audit.controller.ts pattern in this codebase and keeps the admin module DI-light."
  - "No schema migration. All new endpoints compose on read from existing tables (Camera, SrsNode, RecordingSegment, AuditLog, ApiKeyUsage, Package)."

requirements-completed: [UI-05]

# Metrics
duration: ~20 min
completed: 2026-04-21
---

# Phase 18 Plan 01: Backend data layer for Dashboard Polish Summary

**Extends tenant DashboardService with 2 stat counters + 5 per-camera fields and adds 7 super-admin endpoints (active-streams, recordings-active, platform-issues, cluster-nodes, storage-forecast, recent-audit, org-health), all guarded by SuperAdminGuard with Prisma.sql-parameterized forecast queries and zod-validated range/limit params — flipping 20 Plan 00 it.todo stubs to green assertions and unblocking Plans 02/03/05.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 6 (4 src, 2 tests)
- **Files created:** 1 (deferred-items.md)
- **Commits:** 5 (2 TDD RED, 2 TDD GREEN, 1 docs)

## Accomplishments

- **Tenant dashboard enriched.** `DashboardService.getStats` now returns `camerasRecording` + `camerasInMaintenance` alongside the existing 6 fields. `getCameraStatusList` returns per-camera `isRecording`, `maintenanceMode`, `maintenanceEnteredBy`, `maintenanceEnteredAt`, `retentionDays` (dates normalised to ISO strings). TENANCY_CLIENT scoping preserved — T-18-TENANCY-ISSUES cross-tenant isolation test passes.
- **7 super-admin endpoints live** under `/api/admin/dashboard/*`, all inheriting class-level `@UseGuards(SuperAdminGuard)`:
  - `GET active-streams` — SRS publisher count (fails open to 0 on SRS error).
  - `GET recordings-active` — cross-org count of cameras with `isRecording=true`.
  - `GET platform-issues` — srs-down + edge-down + org-offline-rate rows, system-org excluded.
  - `GET cluster-nodes` — delegates to `ClusterService.findAll()`.
  - `GET storage-forecast?range=7d|30d` — daily bytes series + linear-regression `estimatedDaysUntilFull`.
  - `GET recent-audit?limit=N` — structural audit events (organization/user changes) joined with actor+org names.
  - `GET org-health` — per-tenant health row with camera/storage usage %, today's bandwidth, issue count, sorted by worst-usage first.
- **Security mitigations wired.**
  - T-18-AUTHZ-ADMIN: class-level `@UseGuards(SuperAdminGuard)` verified via Reflect metadata in test.
  - T-18-SQLI-FORECAST: `Prisma.sql` tagged template with `${since}` parameter binding in `getStorageForecast`.
  - T-18-DOS-FORECAST: `z.enum(['7d', '30d'])` rejects anything else with BadRequestException.
  - T-18-DOS-AUDIT: `z.coerce.number().int().min(1).max(10).default(7)` on `?limit=`.
  - T-18-BIGINT-JSON: every BigInt field converted to string before returning.
  - T-18-ERR-LEAK: try/catch around SRS/edge queries inside `getPlatformIssues` — a single subsystem failure degrades gracefully, never 500s.
- **All 20 Plan 01 tests green.**
  - `tests/dashboard/dashboard.test.ts` — 3 new `it` assertions (was 3 `it.todo`).
  - `tests/admin/admin-dashboard.test.ts` — 17 new `it` assertions (was 17 `it.todo`).
  - `cd apps/api && pnpm build` — SWC compile of 149 files succeeds, DI graph with new `ClusterModule` import resolves cleanly.

## Task Commits

1. **Task 1 — TDD RED:** `test(18-01): add failing tests for DashboardService Phase 18 enrichments` — `57b23bc`
2. **Task 1 — TDD GREEN:** `feat(18-01): enrich DashboardService with Phase 15 fields + counters` — `631fd4f`
3. **Task 2 — TDD RED:** `test(18-01): add failing tests for 7 admin-dashboard endpoints` — `694f2e7`
4. **Task 2 — TDD GREEN:** `feat(18-01): add 7 admin-dashboard endpoints with SuperAdminGuard + zod` — `14296ad`
5. **Bookkeeping:** `docs(18-01): log pre-existing status-suite failures as deferred items` — `27ce502`

## Files Created/Modified

### Backend source (4 files)

- `apps/api/src/dashboard/dashboard.service.ts` — extended `getStats` select + return; extended `getCameraStatusList` select + ISO date normalisation.
- `apps/api/src/admin/admin-dashboard.service.ts` — 7 new methods (getActiveStreamsCount, getRecordingsActive, getPlatformIssues, getClusterNodes, getStorageForecast, getRecentAuditHighlights, getOrgHealthOverview) + exported types (PlatformIssue, StorageForecastResult, OrgHealth). Constructor now also injects `ClusterService`.
- `apps/api/src/admin/admin-dashboard.controller.ts` — 7 new `@Get` routes + `BadRequestException` + zod schemas.
- `apps/api/src/admin/admin.module.ts` — imports `ClusterModule` (exports `ClusterService`).

### Backend tests (2 files)

- `apps/api/tests/admin/admin-dashboard.test.ts` — 17 Plan 00 `it.todo` stubs flipped to real `it` assertions. Uses `vi.fn()` mocks for Prisma/SRS/Cluster; asserts on call args + return shape + Reflect.__guards__ metadata.
- `apps/api/tests/dashboard/dashboard.test.ts` — 3 new `it` assertions in a `DashboardService Phase 18 enrichments` block. Uses real `testPrisma` for integration-style seeding (two orgs) because the service's tenancy concerns are best validated against real DB scoping.

### Planning (1 file)

- `.planning/phases/18-dashboard-map-polish/deferred-items.md` — logs pre-existing 20-failure status suite (unrelated to Plan 01).

## Endpoint Signatures

```ts
// Tenant (TENANCY_CLIENT scoped)
GET /api/dashboard/stats → {
  camerasOnline, camerasOffline, totalCameras,
  camerasRecording, camerasInMaintenance,       // NEW
  totalViewers, bandwidth: string, streamBandwidth,
}
GET /api/dashboard/cameras → Array<{
  id, name, status, lastOnlineAt: string | null,
  isRecording: boolean,                         // NEW
  maintenanceMode: boolean,                     // NEW
  maintenanceEnteredBy: string | null,          // NEW
  maintenanceEnteredAt: string | null,          // NEW (ISO)
  retentionDays: number | null,                 // NEW
  viewerCount, bandwidth,
}>

// Super admin (SuperAdminGuard)
GET /api/admin/dashboard/active-streams      → { count: number }
GET /api/admin/dashboard/recordings-active   → { count: number }
GET /api/admin/dashboard/platform-issues     → PlatformIssue[]
GET /api/admin/dashboard/cluster-nodes       → SrsNode[]
GET /api/admin/dashboard/storage-forecast
     ?range=7d|30d                            → { points: [{date, bytes: string}], estimatedDaysUntilFull: number | null }
GET /api/admin/dashboard/recent-audit
     ?limit=1..10                             → AuditLog[] (resource IN [organization, user], joined with user + orgName)
GET /api/admin/dashboard/org-health           → OrgHealth[] (sorted by max(cameraUsagePct, storageUsagePct) desc)
```

## Test Counts

| File | Before (Plan 00) | After (Plan 01) |
|------|------------------|------------------|
| `tests/admin/admin-dashboard.test.ts` | 17 `it.todo` | **17 `it` green**, 0 todo |
| `tests/dashboard/dashboard.test.ts` Phase 18 block | 3 `it.todo` | **3 `it` green**, 0 todo |
| Legacy `tests/dashboard/dashboard.test.ts` top block | 9 `it.todo` | 9 `it.todo` (untouched — pre-Phase 18) |

Plan-01 target stubs flipped: **20 / 20 (100%)**.

## Threat-Model Coverage

| Threat | Disposition | Coverage |
|--------|-------------|----------|
| T-18-AUTHZ-ADMIN | mitigate | Class-level `@UseGuards(SuperAdminGuard)`; test asserts via `Reflect.getMetadata('__guards__', AdminDashboardController)`. |
| T-18-TENANCY-ISSUES | mitigate | `DashboardService` retains `TENANCY_CLIENT`; integration test seeds 2 orgs and confirms zero cross-leak. |
| T-18-SQLI-FORECAST | mitigate | Forecast uses `Prisma.sql` tagged template (`${since}` param) — grep-verifiable. |
| T-18-DOS-FORECAST | mitigate | `z.enum(['7d','30d'])` in controller; test asserts `BadRequestException` for `'abc'` and `'14d'`. |
| T-18-DOS-AUDIT | mitigate | `z.coerce.number().int().min(1).max(10).default(7)` on `?limit=`. |
| T-18-ERR-LEAK | mitigate | try/catch around SRS (`getVersions`), edge query, org-rate query in `getPlatformIssues`; fail-open to `{ count: 0 }` in `getActiveStreamsCount`. |
| T-18-BIGINT-JSON | mitigate | `.toString()` on every BigInt (storageUsedBytes, bandwidthTodayBytes, forecast.points[].bytes); test asserts `typeof === 'string'`. |
| T-18-INFO-LEAK-STORAGE | accept | Endpoint is super-admin only by design; tenant users have no path to it. |
| T-18-AUDIT-PII | accept | Audit data is admin-only; same PII surface as existing `/admin/audit` page. |

## Decisions Made

1. **Filter edge-down at the DB layer** (`where: { role: 'EDGE', status: { in: ['OFFLINE','DEGRADED'] } }`) rather than loading all SrsNodes and filtering in memory. The @@index on `status` makes this essentially free, and the response payload stays minimal. The test was updated to `mockImplementation` that respects the filter args — this also hardens the test against an accidental regression where the filter is removed.
2. **Translate plan's dotted event types** (`organization.create`, `user.delete`, `cluster.node_added`) to row-level `(resource, action)` pairs matching the existing AuditLog shape — `resource IN ('organization', 'user')` with the relevant actions. No schema migration, no audit-interceptor changes; the interceptor already emits these rows for every org/user mutation.
3. **Storage forecast uses cumulative (not instantaneous) regression.** Tests, UX copy ("at current growth rate, N days until full"), and the quota comparison all assume cumulative-bytes vs quota. Returns `null` when < 2 data points, slope ≤ 0, or quota = 0 so the UI can render "N/A".
4. **Controller-level zod validation with `safeParse + BadRequestException`** rather than ValidationPipe + DTO class. Matches the existing `audit.controller.ts` pattern and keeps AdminModule DI-light (no class-transformer dependency chain).
5. **Inject `ClusterService` via `ClusterModule` import** rather than raw-query the `SrsNode` table directly. `ClusterModule` already exports `ClusterService`; delegating avoids schema duplication and guarantees the admin dashboard always reflects the same shape as the `/admin/cluster` page.
6. **Integration-style test for `DashboardService`** (real `testPrisma` against sms_platform_test) rather than pure mocks. The cross-tenant leak assertion (T-18-TENANCY-ISSUES) needs a real Prisma path to be trustworthy — a `findMany` mock that ignores `where.orgId` would falsely pass. Mocks were used for `SrsApiService`/`StatusService`/`Redis` only.

## Deviations from Plan

None material. All acceptance criteria met.

Inline process note (Rule 3 — Blocking): one initial test assertion for `getPlatformIssues edge-down` passed an unfiltered mock list of 3 SrsNodes to `findMany`, expecting the service to return 2 issues (OFFLINE + DEGRADED, not ONLINE). After GREEN, the test failed because the mock ignores the `where` clause — so the service correctly called findMany with the filter, but the mock returned all 3 regardless, producing 3 issues. Fixed by switching the mock to `mockImplementation` that respects the `where.status.in` filter. The test now also asserts (via `expect(...).toHaveBeenCalledWith`) that the service passed the correct filter — a stronger assertion than before. Committed as part of the GREEN commit `14296ad`.

## Issues Encountered

- **Pre-existing status-suite failures (20 tests, 3 files)** in `apps/api/tests/status/` — `TypeError: this.prisma.camera.findFirst is not a function`. Confirmed unrelated to Plan 01 by reproducing on the pre-Plan-01 commit (`git stash && pnpm test tests/status/` → same 20 failures). Logged in `deferred-items.md`. Out-of-scope per GSD scope-boundary rule.

## Known Stubs

None introduced by this plan. The 9 remaining `it.todo` in `tests/dashboard/dashboard.test.ts` belong to pre-Phase-18 behavior (legacy `DashboardService` describe block) and were explicitly left untouched by Plan 00.

## User Setup Required

None — backend-only data-layer work. No migrations, no env-var changes, no CLI tools to install. Plans 02/03/05 can consume the new endpoints directly on their next spawn.

## Next Phase Readiness

- **Plan 02 (tenant dashboard shell)** ready: consumes `camerasRecording` + `camerasInMaintenance` from `/api/dashboard/stats` and the 5 new per-camera fields from `/api/dashboard/cameras` for the IssuesPanel + status-icon column.
- **Plan 03 (platform dashboard shell)** ready: consumes 6 of the 7 new admin endpoints directly (active-streams, recordings-active, platform-issues, cluster-nodes, storage-forecast, recent-audit, org-health).
- **Plan 04 (map marker)** independent of this plan — continues on its own track.
- **Plan 05 (map popup)** ready: consumes the same `/api/cameras` shape (no dependency on Plan 01).

## Self-Check: PASSED

**Commit existence checks:**
- `57b23bc` (Task 1 RED) — FOUND via `git log --oneline HEAD~5..HEAD`.
- `631fd4f` (Task 1 GREEN) — FOUND.
- `694f2e7` (Task 2 RED) — FOUND.
- `14296ad` (Task 2 GREEN) — FOUND.
- `27ce502` (docs deferred-items) — FOUND.

**File existence checks (via Grep/ls):**
- `apps/api/src/admin/admin-dashboard.service.ts` — modified, 7 new methods all reachable.
- `apps/api/src/admin/admin-dashboard.controller.ts` — modified, 7 new `@Get` routes.
- `apps/api/src/admin/admin.module.ts` — modified, imports `ClusterModule`.
- `apps/api/src/dashboard/dashboard.service.ts` — modified, Phase 18 fields + counters in place.
- `apps/api/tests/admin/admin-dashboard.test.ts` — modified, 17 real `it` assertions.
- `apps/api/tests/dashboard/dashboard.test.ts` — modified, 3 real `it` assertions.
- `.planning/phases/18-dashboard-map-polish/deferred-items.md` — created.

**Acceptance-criteria grep checks (from PLAN.md):**
- `grep -c camerasRecording src/dashboard/dashboard.service.ts` = 2 (>=2) — PASS
- `grep -c camerasInMaintenance src/dashboard/dashboard.service.ts` = 2 (>=2) — PASS
- `grep -c 'isRecording: true' src/dashboard/dashboard.service.ts` = 2 (>=2) — PASS
- `grep -c 'maintenanceEnteredBy: true' src/dashboard/dashboard.service.ts` = 1 (>=1) — PASS
- `grep -c 'maintenanceEnteredAt: true' src/dashboard/dashboard.service.ts` = 1 (>=1) — PASS
- `grep -c 'retentionDays: true' src/dashboard/dashboard.service.ts` = 1 (>=1) — PASS
- `grep -cE 'maintenanceEnabledBy|maintenanceEnabledAt' src/dashboard/dashboard.service.ts` = 0 — PASS (no wrong spelling)
- Admin service method names (getActiveStreamsCount / getRecordingsActive / getPlatformIssues / getClusterNodes / getStorageForecast / getRecentAuditHighlights / getOrgHealthOverview) — ALL >=1 — PASS
- `grep -c 'Prisma.sql' src/admin/admin-dashboard.service.ts` = 2 (>=1) — PASS
- Controller `@Get('{7 names}')` count = 7 (==7) — PASS
- `grep -c "z.enum" src/admin/admin-dashboard.controller.ts` = 1 (>=1) — PASS (range + limit both declared via zod)
- `grep -c '@UseGuards(SuperAdminGuard)' src/admin/admin-dashboard.controller.ts` = 1 (>=1, class-level) — PASS
- `grep -c ClusterModule src/admin/admin.module.ts` = 3 (>=1) — PASS
- `grep -c 'it.todo' tests/admin/admin-dashboard.test.ts` = 0 (==0) — PASS

**Test-run checks:**
- `pnpm test -- --run tests/admin/admin-dashboard.test.ts` → 17 passed / 0 todo — PASS
- `pnpm test -- --run tests/dashboard/dashboard.test.ts` → 3 new passed / 9 legacy todo — PASS
- `pnpm build` → Successfully compiled 149 files with SWC — PASS (DI graph resolves with new ClusterModule import)

---
*Phase: 18-dashboard-map-polish*
*Completed: 2026-04-21*
