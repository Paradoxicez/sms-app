---
phase: 18
slug: dashboard-map-polish
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-21
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (web)** | Vitest 3 + Testing Library (react, jest-dom, user-event) |
| **Framework (api)** | Vitest 3 + global-setup (sms_platform_test DB) |
| **Config file (web)** | `apps/web/vitest.config.ts` |
| **Config file (api)** | `apps/api/vitest.config.ts` |
| **Quick run (web)** | `cd apps/web && pnpm test -- --run <file>` |
| **Quick run (api)** | `cd apps/api && pnpm test -- --run <file>` |
| **Full suite** | `pnpm test` (root — both workspaces) |
| **Estimated runtime** | ~60-120 seconds for full suite |

---

## Sampling Rate

- **After every task commit:** Run targeted quick run for modified test file
- **After every plan wave:** Run full workspace suite for affected side
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-00-01 | 00 | 0 | UI-05, UI-06 | T-18-XSS-MARKER, T-18-MEMO-REGRESSION | 14 test files + fixtures; stubs for all Phase 18 behaviors | unit scaffold | `cd apps/web && pnpm test -- --run src/components/map/camera-marker.test.tsx` | ❌ → ✅ (created in Task 1) | ⬜ pending |
| 18-00-02 | 00 | 0 | UI-05 | T-18-AUTHZ-ADMIN, T-18-TENANCY-ISSUES | 17 backend admin stubs + 3 dashboard enrichment stubs | unit scaffold | `cd apps/api && pnpm test -- --run tests/admin/admin-dashboard.test.ts` | ❌ → ✅ (created in Task 2) | ⬜ pending |
| 18-01-01 | 01 | 1 | UI-05 | T-18-TENANCY-ISSUES | DashboardService enriched with Phase 15 fields; org-scoped | integration (api) | `cd apps/api && pnpm test -- --run tests/dashboard/dashboard.test.ts` | ✅ (Plan 00) | ⬜ pending |
| 18-01-02 | 01 | 1 | UI-05 | T-18-AUTHZ-ADMIN, T-18-SQLI-FORECAST, T-18-DOS-FORECAST, T-18-BIGINT-JSON, T-18-ERR-LEAK | 7 admin endpoints under SuperAdminGuard; zod range validation; Prisma.sql parameterized | integration (api) | `cd apps/api && pnpm test -- --run tests/admin/admin-dashboard.test.ts` | ✅ (Plan 00) | ⬜ pending |
| 18-02-01 | 02 | 2 | UI-05 | T-18-XSS-DASH-NAME | useDashboardIssues + IssuesPanel with severity sort + empty state | unit (web) | `cd apps/web && pnpm test -- --run src/components/dashboard/issues-panel.test.tsx` | ✅ (Plan 00) | ⬜ pending |
| 18-02-02 | 02 | 2 | UI-05 | — | Tenant dashboard composition: 6 cards, no SystemMetrics, no CameraStatusTable, IssuesPanel present | unit (web) | `cd apps/web && pnpm test -- --run src/__tests__/tenant-dashboard-page.test.tsx` | ✅ (Plan 00) | ⬜ pending |
| 18-03-01 | 03 | 2 | UI-06 | T-18-XSS-MARKER | Teardrop SVG marker + badges + escapeHtml on name | unit (web) | `cd apps/web && pnpm test -- --run src/components/map/camera-marker.test.tsx` | ✅ (Plan 00) | ⬜ pending |
| 18-03-02 | 03 | 2 | UI-06 | T-18-CLUSTER-STATUS-LEAK (accept), T-18-CLUSTER-STALE (accept) | Cluster iconCreateFunction worst-status + MapCamera type + page wiring | unit (web) | `cd apps/web && pnpm test -- --run src/components/map/camera-map-inner.test.tsx` | ✅ (Plan 00) | ⬜ pending |
| 18-04-01 | 04 | 3 | UI-06 | T-18-XSS-POPUP, T-18-MEMO-REGRESSION, T-18-MAINT-CONFIRMATION | 240×135 preview + status overlay + badges + 2 primary + ⋮ dropdown + Thai-EN dialog + PreviewVideo memo preserved | unit (web) | `cd apps/web && pnpm test -- --run src/components/map/camera-popup.test.tsx` | ✅ (Plan 00) | ⬜ pending |
| 18-05-01 | 05 | 2 | UI-05 | T-18-AUTHZ-ADMIN | toggle-group installed; platform hook polling; PlatformIssuesPanel + ClusterNodesPanel render | unit (web) | `cd apps/web && pnpm test -- --run src/components/dashboard/platform-issues-panel.test.tsx src/components/dashboard/cluster-nodes-panel.test.tsx` | ✅ (Plan 00) | ⬜ pending |
| 18-05-02 | 05 | 2 | UI-05 | T-18-INFO-LEAK-STORAGE (accept), T-18-AUDIT-PII (accept), T-18-XSS-AUDIT | StorageForecastCard (LineChart + 7d/30d toggle + daysUntilFull warning) + RecentAuditHighlights (7 entries + link) | unit (web) | `cd apps/web && pnpm test -- --run src/components/dashboard/storage-forecast-card.test.tsx src/components/dashboard/recent-audit-highlights.test.tsx` | ✅ (Plan 00) | ⬜ pending |
| 18-06-01 | 06 | 3 | UI-05 | T-18-XSS-ORG-NAME | OrgHealthDataTable with default sort by max usage %, row click, actions | unit (web) | `cd apps/web && pnpm test -- --run src/app/admin/dashboard/components/org-health-data-table.test.tsx` | ✅ (Plan 00) | ⬜ pending |
| 18-06-02 | 06 | 3 | UI-05 | T-18-AUTHZ-ADMIN, T-18-SORT-OVERFLOW (accept) | platform-dashboard-page refactor: 7 stat cards, vertical stack, DataTable replaces raw Table | unit (web) | `cd apps/web && pnpm test -- --run src/__tests__/platform-dashboard-page.test.tsx` | ✅ (Plan 00) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Populated — see Plan 00 (`18-00-PLAN.md`) for full task breakdown.

Test scaffolds to create in Wave 0:

**Frontend (web) — 12 files + 1 fixtures file:**
- [ ] `apps/web/src/test-utils/camera-fixtures.ts` — shared camera fixtures with Phase 15 schema field names (`maintenanceEnteredBy` / `maintenanceEnteredAt`)
- [ ] `apps/web/src/__tests__/tenant-dashboard-page.test.tsx` — 6 it.todo (covers D-01, D-02, D-03, D-04)
- [ ] `apps/web/src/__tests__/platform-dashboard-page.test.tsx` — 5 it.todo (covers D-05, D-06, D-07, D-12)
- [ ] `apps/web/src/components/dashboard/issues-panel.test.tsx` — 5 it.todo
- [ ] `apps/web/src/components/dashboard/platform-issues-panel.test.tsx` — 3 it.todo
- [ ] `apps/web/src/components/dashboard/cluster-nodes-panel.test.tsx` — 3 it.todo
- [ ] `apps/web/src/components/dashboard/storage-forecast-card.test.tsx` — 3 it.todo
- [ ] `apps/web/src/components/dashboard/recent-audit-highlights.test.tsx` — 4 it.todo
- [ ] `apps/web/src/app/admin/dashboard/components/org-health-data-table.test.tsx` — 5 it.todo
- [ ] `apps/web/src/components/map/camera-marker.test.tsx` — 8 it.todo (includes T-18-XSS-MARKER regression)
- [ ] `apps/web/src/components/map/camera-map-inner.test.tsx` — 4 it.todo
- [ ] `apps/web/src/components/map/camera-popup.test.tsx` — 13 it.todo (includes PreviewVideo memoization regression guard for T-18-MEMO-REGRESSION)

**Backend (api) — 2 files:**
- [ ] `apps/api/tests/admin/admin-dashboard.test.ts` — 17 it.todo (all 7 new methods + SuperAdminGuard assertion)
- [ ] `apps/api/tests/dashboard/dashboard.test.ts` — +3 it.todo appended (Phase 18 enrichments to DashboardService)

**Total stub count:** 79 it.todo across 14 files.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Marker pulse animation (reconnecting) | UI-06 | CSS animation timing — visual only | Open `/app/map`, disconnect a camera, confirm amber pulse |
| REC dot blink on preview overlay | UI-06 | CSS animation | Open popup on recording camera, confirm red blink |
| Cluster bubble color matches worst child | UI-06 | Visual + zoom interaction | Zoom out on `/app/map` with mixed-status cameras, confirm red cluster if any offline child |
| Cluster bubble updates on status change | UI-06 (T-18-CLUSTER-STALE — accepted) | Requires map pan/zoom OR refreshClusters ref call; Leaflet lifecycle | Trigger a Socket.IO status flip while map is open; observe whether cluster bubble re-colors. If stale, document as known limitation; fallback: plan 03 may wire ref.refreshClusters() |
| Teardrop pin anchor precision | UI-06 | Pixel anchor on map | Place camera at known coord, confirm pin tip = coord |
| PreviewVideo no flicker/runaway | UI-06 (T-18-MEMO-REGRESSION) | Runtime behavior under Socket.IO events | Open popup, watch for 60s with viewer-count events, confirm no remount + no runaway count |
| Maintenance confirmation Thai-EN copy | UI-06 (D-21 + user language memory) | Copy review | Open popup → ⋮ → Toggle Maintenance, verify Thai first + English second in title/body/buttons |
| Stat card responsive stacking | UI-05 | Viewport-width visual | Resize to 640px / 1024px / 1280px, confirm 2/3/6 column layouts (tenant) and 2/4/7 (super admin) |
| Storage forecast chart rendering | UI-05 | Recharts visual | Load admin dashboard, verify line chart renders with data, toggle 7d/30d updates chart |
| DataTable row click visual feedback | UI-05 | Focus ring + hover | Tab through Org Health rows, verify focus ring; hover shows subtle bg |

---

## Security Threat Coverage

All threats from `<security_enforcement>` covered across plans:

| Threat | Plans | Mitigation |
|--------|-------|------------|
| T-18-XSS-MARKER | 00, 03 | escapeHtml(name) in divIcon HTML; test asserts `<script>` → `&lt;script&gt;` |
| T-18-XSS-POPUP | 00, 04 | React auto-escape; grep asserts zero `dangerouslySetInnerHTML` |
| T-18-AUTHZ-ADMIN | 00, 01, 05, 06 | SuperAdminGuard class-level on admin controller; backend test asserts guard presence |
| T-18-TENANCY-ISSUES | 00, 01, 02 | TENANCY_CLIENT on DashboardService; integration test seeds 2 orgs → asserts no cross-tenant leak |
| T-18-INFO-LEAK-STORAGE | 05, 06 | Accepted: super-admin scope by design; tenant portal has no link |
| T-18-MEMO-REGRESSION | 00, 04 | PreviewVideo preserved verbatim; regression test asserts node identity across rerenders |
| T-18-SQLI-FORECAST | 01 | `Prisma.sql` parameterized bindings |
| T-18-DOS-FORECAST | 01 | zod `z.enum(['7d','30d'])` on range param |
| T-18-DOS-AUDIT | 01 | zod coerce+clamp on limit param |
| T-18-BIGINT-JSON | 01 | Bigint → string conversion in service layer |
| T-18-ERR-LEAK | 01 | try/catch + logger.warn, never throw 500 |
| T-18-AUDIT-PII | 05 | Accepted: existing /admin/audit surface, no new PII |
| T-18-MAINT-CONFIRMATION | 04 | AlertDialog with Thai+EN copy before maintenance toggle |
| T-18-XSS-AUDIT / T-18-XSS-ORG-NAME | 05, 06 | React auto-escape; grep asserts no unsafe HTML |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (Wave 0 = Plan 00)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — 14 files + 79 stubs
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-signed 2026-04-21
