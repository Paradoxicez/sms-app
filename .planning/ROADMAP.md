# Roadmap: SMS Platform

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 + 999.1 (shipped 2026-04-16) — [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 UI Overhaul** — Phases 8-13 (in progress)

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

### v1.1 UI Overhaul

- [ ] **Phase 8: Foundation Components** - Reusable DataTable system and DatePicker components consumed by all subsequent phases
- [ ] **Phase 9: Layout & Login** - Collapsible sidebar and login page redesign
- [x] **Phase 10: Admin Table Migrations** - Migrate 5 admin/utility tables to DataTable with quick actions (completed 2026-04-17)
- [ ] **Phase 11: Camera Management** - Camera table with card view, quick actions, and View Stream sheet
- [ ] **Phase 12: Recordings** - Dedicated recordings page with cross-camera filters, bulk delete, and downloads
- [ ] **Phase 13: Hierarchy & Map** - Project tree viewer and map enhancements with filter, drag-drop, and preview

## Phase Details

### Phase 8: Foundation Components
**Goal**: Every page has access to a consistent, reusable table and date picker component system
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: FOUND-01, FOUND-02
**Success Criteria** (what must be TRUE):
  1. A reusable DataTable component exists with column sorting, text/select filtering, and pagination that any page can consume by providing column definitions and data
  2. A DatePicker component (single date) and DateRangePicker component (date range) exist using shadcn Calendar -- no native browser date inputs remain in the codebase
  3. Column definitions are defined in separate "use client" files to avoid Next.js server/client boundary issues
  4. DataTable supports row selection via checkboxes and "..." row action menus as standard features
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — DataTable system (sorting, filtering, pagination, row selection, row actions) + Checkbox component
- [x] 08-02-PLAN.md — DatePicker + DateRangePicker components and native date input replacement

### Phase 9: Layout & Login
**Goal**: Users experience a collapsible sidebar and a polished login page across the entire application
**Depends on**: Phase 8
**Requirements**: FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. User can collapse the sidebar to icon-only mode by clicking a toggle or pressing Cmd+B
  2. Sidebar collapse state persists across page navigation (cookie or localStorage)
  3. Existing pages (map with Leaflet, dashboard with Recharts) resize correctly when sidebar collapses -- no layout breakage
  4. Login page shows a redesigned form with "remember me" checkbox that extends session duration
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [x] 09-01-PLAN.md — Sidebar migration: nav config arrays, shared AppSidebar component, layout integration, old nav deletion
- [x] 09-02-PLAN.md — Login page redesign: split-screen layout, remember me checkbox, backend 30-day session config
- [x] 09-03-PLAN.md — Sidebar resize handling: transitionend hook for Recharts/Leaflet + visual verification checkpoint

### Phase 10: Admin Table Migrations
**Goal**: All admin and utility tables use the unified DataTable with consistent UX
**Depends on**: Phase 8, Phase 9
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04, HIER-03
**Success Criteria** (what must be TRUE):
  1. Users table, API keys table, audit log table, and webhooks table all use the DataTable component with sort, filter, and pagination
  2. Each table row has a "..." quick actions menu with contextually appropriate actions (Edit, Delete, etc.)
  3. Stream profiles page displays profiles in a data table (replacing card layout) with quick actions (Edit, Duplicate, Delete)
  4. All 5 tables share consistent visual patterns -- same filter bar position, same pagination controls, same action menu behavior
**Plans**: 3 plans
**UI hint**: yes

Plans:
- [x] 10-01-PLAN.md — Audit log backend offset pagination + frontend DataTable migration with server-side pagination
- [x] 10-02-PLAN.md — Users and API Keys table migrations to DataTable with faceted filters and quick actions
- [x] 10-03-PLAN.md — Webhooks and Stream Profiles table migrations (card grid to table for profiles)

### Phase 11: Camera Management
**Goal**: Users can manage cameras efficiently through a powerful table, quick actions, card view with live preview, and a slide-in stream viewer
**Depends on**: Phase 8, Phase 9
**Requirements**: CAM-01, CAM-02, CAM-03, CAM-04
**Success Criteria** (what must be TRUE):
  1. Camera page shows a DataTable with sort, filter (including faceted status filter), and pagination
  2. Each camera row has a "..." menu with actions: Edit, View Stream, Stream Profile, Disable, Delete, Record, Embed Code
  3. User can toggle between table view and card view -- card view shows HLS live preview per card with a maximum of 4-6 concurrent players managed by IntersectionObserver
  4. Clicking "View Stream" opens a slide-in sheet (half-screen from right) showing live preview, Policies, Embed code, and Activity tabs
  5. Card view does not crash the browser -- players outside viewport are destroyed, buffer limits are capped
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 11-01: TBD
- [ ] 11-02: TBD
- [ ] 11-03: TBD

### Phase 12: Recordings
**Goal**: Users can browse, filter, and manage recordings across all cameras from a single dedicated page
**Depends on**: Phase 8, Phase 9
**Requirements**: REC-01, REC-02, REC-03, REC-04
**Success Criteria** (what must be TRUE):
  1. A dedicated recordings page exists showing recordings from all cameras (not per-camera only)
  2. User can filter recordings by camera, project, site, date range (using DateRangePicker), and status
  3. User can select multiple recordings via checkboxes and bulk delete them with confirmation
  4. User can download individual recording clips as files via presigned MinIO URLs
  5. Backend API supports cross-camera recording queries with server-side pagination
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 12-01: TBD
- [ ] 12-02: TBD

### Phase 13: Hierarchy & Map
**Goal**: Users can navigate the Project > Site > Camera hierarchy via a tree viewer and manage camera locations on an enhanced map
**Depends on**: Phase 8, Phase 9, Phase 10
**Requirements**: HIER-01, HIER-02, MAP-01, MAP-02, MAP-03
**Success Criteria** (what must be TRUE):
  1. Project page shows a split panel -- tree viewer on the left with collapsible Project > Site > Camera nodes, DataTable on the right showing children of the selected node
  2. Selecting a tree node updates the right-panel table to show that node's children (projects show sites, sites show cameras)
  3. Map page includes the same tree viewer component for filtering which cameras appear on the map
  4. User can drag-drop a marker on the map to set a camera's latitude/longitude
  5. Hovering or clicking a map marker shows a camera preview popup with status and thumbnail
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 13-01: TBD
- [ ] 13-02: TBD
- [ ] 13-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 8 -> 9 -> 10 -> 11 -> 12 -> 13

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
| 8. Foundation Components | v1.1 | 0/2 | Planning | - |
| 9. Layout & Login | v1.1 | 0/3 | Planning | - |
| 10. Admin Table Migrations | v1.1 | 3/3 | Complete    | 2026-04-17 |
| 11. Camera Management | v1.1 | 0/0 | Not started | - |
| 12. Recordings | v1.1 | 0/0 | Not started | - |
| 13. Hierarchy & Map | v1.1 | 0/0 | Not started | - |
