# Roadmap: SMS Platform

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 + 999.1 (shipped 2026-04-16) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 UI Overhaul** — Phases 8-13 (shipped 2026-04-18) — [archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Self-Service, Resilience & UI Polish** — Phases 14-18 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-7 + 999.1) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Foundation & Multi-Tenant (6/6 plans)
- [x] Phase 2: Stream Engine & Camera Management (6/6 plans)
- [x] Phase 3: Playback & Security (3/3 plans)
- [x] Phase 4: Developer Experience (5/5 plans)
- [x] Phase 5: Dashboard & Monitoring (6/6 plans)
- [x] Phase 6: SRS Cluster & Scaling (3/3 plans)
- [x] Phase 7: Recordings (5/5 plans)
- [x] Phase 999.1: Role-based Sidebar Navigation (5/5 plans)

</details>

<details>
<summary>✅ v1.1 UI Overhaul (Phases 8-13) — SHIPPED 2026-04-18</summary>

- [x] Phase 8: Foundation Components (2/2 plans)
- [x] Phase 9: Layout & Login (3/3 plans)
- [x] Phase 10: Admin Table Migrations (3/3 plans)
- [x] Phase 11: Camera Management (3/3 plans)
- [x] Phase 12: Recordings (2/2 plans)
- [x] Phase 13: Hierarchy & Map (2/2 plans)

</details>

### v1.2 Self-Service, Resilience & UI Polish

- [x] **Phase 14: Bug Fixes & DataTable Migrations** - Fix broken features and migrate remaining pages to DataTable (completed 2026-04-18)
- [x] **Phase 15: FFmpeg Resilience & Camera Maintenance** - Auto-reconnect, health checks, notifications, and maintenance mode (completed 2026-04-19)
- [x] **Phase 16: User Self-Service** - Account management and plan/usage viewer (completed 2026-04-19)
- [x] **Phase 17: Recording Playback & Timeline** - HLS playback page with timeline scrubber and availability heatmap (completed 2026-04-19)
- [x] **Phase 18: Dashboard & Map Polish** - Dashboard data improvements and map UI enhancements (completed 2026-04-21)

## Phase Details

### Phase 14: Bug Fixes & DataTable Migrations
**Goal**: All known bugs are fixed and remaining admin pages use the unified DataTable component
**Depends on**: Phase 13 (v1.1 complete)
**Requirements**: FIX-01, FIX-02, FIX-03, UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. Super admin can create users for the system organization without errors
  2. Copying an API key returns the actual key value, not the masked version
  3. Deleting an API key removes it successfully and updates the table
  4. Admin org Team page uses DataTable with sorting, filtering, and quick actions
  5. Super admin Organizations, Cluster Nodes, and Platform Audit pages all use DataTable with consistent UX
**Plans**: 3 plans
Plans:
- [x] 14-01-PLAN.md — Fix backend bugs (system org user creation RLS, API key hard delete) and API key copy UX
- [x] 14-02-PLAN.md — Migrate Team and Organizations pages to DataTable
- [x] 14-03-PLAN.md — Migrate Cluster Nodes and Platform Audit pages to DataTable
**UI hint**: yes

### Phase 15: FFmpeg Resilience & Camera Maintenance
**Goal**: Camera streams recover automatically from failures and operators can put cameras in maintenance mode
**Depends on**: Phase 14
**Requirements**: RESIL-01, RESIL-02, RESIL-03, RESIL-04, CAM-01, CAM-02, CAM-03
**Success Criteria** (what must be TRUE):
  1. When SRS container restarts, all previously-active FFmpeg streams reconnect automatically without manual intervention
  2. Health check loop detects and recovers dead FFmpeg processes within 60 seconds
  3. User receives in-app notification and webhook fires when a camera status changes (online/offline/degraded)
  4. FFmpeg processes shut down gracefully on server restart and re-enqueue on boot -- no orphaned processes
  5. User can toggle a camera into maintenance mode, which suppresses notifications/webhooks and shows a maintenance icon in the camera table alongside online/offline and recording status icons
**Plans**: 4 plans (Wave 1: 1 plan, Wave 2: 2 plans parallel, Wave 3: 1 plan)
Plans:
- [x] 15-01-PLAN.md — Data + status suppression core: Camera schema maintenance columns + StatusService maintenance gate + 30s BullMQ debounce (RESIL-03, CAM-02)
- [x] 15-02-PLAN.md — FFmpeg resilience services: camera-health tick + SRS-restart detection + boot recovery + graceful shutdown + jobId unification (RESIL-01/02/03/04)
- [x] 15-03-PLAN.md — Maintenance API + audit trail: POST/DELETE /cameras/:id/maintenance with org scoping and interceptor-audited writes (CAM-01, CAM-02)
- [x] 15-04-PLAN.md — Camera table UI: composite 3-icon Status column + maintenance row-action + Thai confirmation dialogs (CAM-03)
**UI hint**: yes

### Phase 16: User Self-Service
**Goal**: Users can manage their own account and view their organization's plan and usage
**Depends on**: Phase 14
**Requirements**: USER-01, USER-02, USER-03
**Success Criteria** (what must be TRUE):
  1. User can change their display name and password from an Account settings page
  2. User can upload and change their avatar image
  3. User can view their current plan name, usage counts against limits (cameras, storage, API calls), on a read-only Plan page
**Plans**: 3 plans (Wave 0 inside Plan 01/02, Wave 1 backend + tests, Wave 3 tenant UI, Wave 4 admin UI)
Plans:
- [x] 16-01-PLAN.md — Backend: sharp install, avatar fixtures, stub tests, MinIO avatars bucket, POST/DELETE /api/users/me/avatar, GET /api/organizations/:orgId/plan-usage, AccountModule (USER-01 verification, USER-02 backend, USER-03 backend)
- [x] 16-02-PLAN.md — Frontend shared + tenant: zxcvbn-ts install, Account composites (Profile, Security, Plan, PasswordStrengthBar, UsageProgressRow, FeatureFlagRow), sidebar-footer "Account settings" entry in both portals, /app/account page with all 3 sections (USER-01/02/03 tenant UI)
- [x] 16-03-PLAN.md — Frontend super admin: /admin/account page (Profile + Security only, no Plan & Usage per D-02) reusing composites from 16-02 (USER-01/02 super admin UI)
**UI hint**: yes

### Phase 17: Recording Playback & Timeline
**Goal**: Users can play back recorded footage with a visual timeline for navigation
**Depends on**: Phase 14
**Requirements**: REC-01, REC-02, REC-03
**Success Criteria** (what must be TRUE):
  1. User can click a recording and play it back via an HLS player on a dedicated playback page
  2. Playback page has a 24-hour timeline scrubber bar that user can click to seek to any point in time
  3. Timeline displays an availability heatmap showing which hours have recorded footage and which do not
**Plans**: 5 plans (1 Wave 0, 2 in Wave 1, 1 in Wave 2, 1 in Wave 3)
Plans:
- [x] 17-00-PLAN.md — Wave 0 test scaffolds (it.todo stubs for REC-01/02/03 + FOUND-01f)
- [x] 17-01-PLAN.md — DataTable onRowClick + cell stopPropagation + recordings-data-table row navigation (D-02)
- [x] 17-02-PLAN.md — API getRecording: camera include + cross-org 404 (T-17-V4); useRecording hook with 3-state error
- [x] 17-03-PLAN.md — Move HlsPlayer + TimelineBar to @/components/recordings/ (D-13); REC-03 heatmap tests GREEN
- [x] 17-04-PLAN.md — /app/recordings/[id] playback page + header + bottom list; REC-01/02 tests GREEN
**UI hint**: yes

### Phase 18: Dashboard & Map Polish
**Goal**: Dashboard shows relevant data for each role and map markers/popups look polished
**Depends on**: Phase 14
**Requirements**: UI-05, UI-06
**Success Criteria** (what must be TRUE):
  1. Org admin dashboard shows data relevant to their organization -- unnecessary widgets removed, missing data added
  2. Super admin dashboard shows platform-wide metrics appropriate for system operations
  3. Map camera markers have improved pin design and thumbnail popups display correctly with camera preview
**Plans**: 7 plans (Wave 0: test scaffolds · Wave 1: backend endpoints · Wave 2: tenant dashboard + map marker + super admin widgets parallel · Wave 3: map popup + super admin page composition)
Plans:
- [x] 18-00-PLAN.md — Wave 0 test scaffolds: 14 test files + shared camera fixtures, 79 it.todo stubs for UI-05/UI-06 + all T-18-XX threats
- [x] 18-01-PLAN.md — Backend admin endpoints + DashboardService enrichment: 7 new /api/admin/dashboard/* methods + Phase 15 field enrichment on tenant stats/cameras (UI-05 backend)
- [x] 18-02-PLAN.md — Tenant dashboard refactor: remove SystemMetrics + CameraStatusTable, add 6 stat cards + IssuesPanel reward signal (UI-05 tenant D-01..D-04)
- [x] 18-03-PLAN.md — Map marker refactor: teardrop SVG pin + recording/maintenance badges + escapeHtml XSS mitigation + cluster worst-status bubble + MapCamera type extension (UI-06 marker D-13..D-16, T-18-XSS-MARKER)
- [x] 18-04-PLAN.md — Map popup refactor: 16:9 preview + status overlay + badges + restructured actions + Thai-EN maintenance dialog + PreviewVideo memoization regression guard (UI-06 popup D-17..D-22, T-18-MEMO-REGRESSION)
- [x] 18-05-PLAN.md — Super admin widgets + platform hook: PlatformIssuesPanel + ClusterNodesPanel + StorageForecastCard + RecentAuditHighlights + shadcn toggle-group install (UI-05 admin D-08, D-09, D-10, D-11)
- [x] 18-06-PLAN.md — Super admin page composition + OrgHealthDataTable: 7 stat cards + vertical priority stack + DataTable migration of Organization Summary (UI-05 admin D-05, D-06, D-07, D-12)
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 14 -> 15 -> 16 -> 17 -> 18
Note: Phases 16, 17, 18 can execute in parallel after Phase 14 (independent of each other).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Multi-Tenant | v1.0 | 6/6 | Complete | 2026-04-11 |
| 2. Stream Engine & Camera Management | v1.0 | 6/6 | Complete | 2026-04-12 |
| 3. Playback & Security | v1.0 | 3/3 | Complete | 2026-04-12 |
| 4. Developer Experience | v1.0 | 5/5 | Complete | 2026-04-13 |
| 5. Dashboard & Monitoring | v1.0 | 6/6 | Complete | 2026-04-13 |
| 6. SRS Cluster & Scaling | v1.0 | 3/3 | Complete | 2026-04-14 |
| 7. Recordings | v1.0 | 5/5 | Complete | 2026-04-14 |
| 999.1. Role-based Sidebar Navigation | v1.0 | 5/5 | Complete | 2026-04-15 |
| 8. Foundation Components | v1.1 | 2/2 | Complete | 2026-04-17 |
| 9. Layout & Login | v1.1 | 3/3 | Complete | 2026-04-17 |
| 10. Admin Table Migrations | v1.1 | 3/3 | Complete | 2026-04-17 |
| 11. Camera Management | v1.1 | 3/3 | Complete | 2026-04-17 |
| 12. Recordings | v1.1 | 2/2 | Complete | 2026-04-17 |
| 13. Hierarchy & Map | v1.1 | 2/2 | Complete | 2026-04-17 |
| 14. Bug Fixes & DataTable Migrations | v1.2 | 3/3 | Complete    | 2026-04-18 |
| 15. FFmpeg Resilience & Camera Maintenance | v1.2 | 4/4 | Complete    | 2026-04-19 |
| 16. User Self-Service | v1.2 | 3/3 | Complete    | 2026-04-19 |
| 17. Recording Playback & Timeline | v1.2 | 5/5 | Complete    | 2026-04-21 |
| 18. Dashboard & Map Polish | v1.2 | 7/7 | Complete    | 2026-04-22 |
