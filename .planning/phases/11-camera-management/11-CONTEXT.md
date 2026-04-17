# Phase 11: Camera Management - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Camera management page with DataTable (sort, filter, pagination, quick actions), card view with thumbnail/hover preview, and slide-in View Stream sheet. Replaces existing camera detail page — all interactions happen through the list page + dialogs + sheet. No new backend APIs except what's needed for the UI.

</domain>

<decisions>
## Implementation Decisions

### Camera Table
- **D-01:** Use Phase 8 DataTable with columns: Status dot, Name, Project, Site, Codec, Resolution, Created, Actions ("...")
- **D-02:** Filters: Search + Status faceted filter (online/offline/degraded/connecting/reconnecting) + Site faceted filter + Project faceted filter — all using Phase 8 DataTableFacetedFilter
- **D-03:** Client-side pagination (camera count per org is manageable)

### Card View
- **D-04:** 4-column grid (desktop), responsive down to 2 (tablet) and 1 (mobile)
- **D-05:** Each card shows: placeholder/camera icon + status badge by default, camera name + status dot + site + "..." menu at bottom
- **D-06:** Hover behavior: start HLS player muted on hover, destroy on mouse leave — IntersectionObserver limits max concurrent hover players
- **D-07:** Click card opens View Stream sheet (same as table row "View Stream" action)

### Quick Actions Menu
- **D-08:** Actions in "..." dropdown: Edit, View Stream, Delete, Record (toggle Start/Stop), Embed Code — 5 items total
- **D-09:** "Disable" action removed — not needed
- **D-10:** Edit dialog includes Stream Profile selection (combined into one dialog, not separate action)
- **D-11:** Create Camera dialog also includes Stream Profile selection
- **D-12:** Record action shows as "Start Recording" / "Stop Recording" based on current state — menu item changes label
- **D-13:** Delete = confirm AlertDialog, deletes camera only, keeps recordings (orphaned)
- **D-14:** Embed Code opens dialog (reuse existing EmbedCodeDialog)

### View Stream Sheet
- **D-15:** shadcn Sheet, side="right", 50% width (half-screen)
- **D-16:** 3 tabs: Preview, Policies, Activity (Embed Code tab removed — available via quick actions)
- **D-17:** Preview tab: HLS player (auto-play muted) at top + camera info below (name, status, site, project, codec, resolution, profile, stream URL)
- **D-18:** Policies tab: reuse existing ResolvedPolicyCard component
- **D-19:** Activity tab: reuse AuditLogDataTable filtered to this camera
- **D-20:** Clicking different camera row/card while sheet is open switches the sheet content (no close/reopen needed)

### Table/Card Toggle
- **D-21:** Toggle buttons (Table icon / Grid icon) in DataTable toolbar, right side next to Add Camera button
- **D-22:** Default view: Table view
- **D-23:** Filter/search bar shared between both views — switching view preserves active filters
- **D-24:** View preference not persisted (always opens as table)

### Camera Detail Page
- **D-25:** Remove existing camera detail page (`/app/cameras/[id]` and `/admin/cameras/[id]`) — all functionality moved to list page + sheet + dialogs (folded from todo: "Redesign camera detail page")

### Claude's Discretion
- Card hover preview implementation details (debounce timing, transition effects)
- IntersectionObserver max concurrent player count (4-6 range)
- HLS player buffer limits for hover preview
- Sheet transition animation
- Empty state design for no cameras
- Loading skeleton for table and card views
- Exact card dimensions and spacing

### Folded Todos
- **Redesign camera detail page** — Replaces detail page with table-based approach. All camera management through list page + dialogs + card view + View Stream sheet.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### DataTable System (Phase 8)
- `.planning/phases/08-foundation-components/08-CONTEXT.md` — DataTable architecture, column definition pattern, toolbar layout, pagination, faceted filter
- `apps/web/src/components/ui/data-table/` — DataTable component directory (DataTable, DataTableRowActions, DataTableColumnHeader, DataTablePagination, DataTableToolbar, DataTableFacetedFilter)

### Existing Camera Components (migration sources)
- `apps/web/src/components/pages/tenant-cameras-page.tsx` — Current camera list page (replace entirely)
- `apps/web/src/app/admin/cameras/[id]/page.tsx` — Current camera detail page (remove)
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` — Camera create/edit dialog (extend with stream profile)
- `apps/web/src/app/admin/cameras/components/camera-status-badge.tsx` — Status badge/dot (reuse)
- `apps/web/src/app/admin/cameras/components/hls-player.tsx` — HLS player component (reuse for sheet + card hover)
- `apps/web/src/app/admin/cameras/components/embed-code-dialog.tsx` — Embed code dialog (reuse)
- `apps/web/src/app/admin/cameras/components/recording-controls.tsx` — Recording controls (reference for record toggle)

### Reference Patterns (Phase 10 migrations)
- `.planning/phases/10-admin-table-migrations/10-CONTEXT.md` — Migration patterns, row actions pattern, column definition convention
- `apps/web/src/app/admin/packages/components/package-table.tsx` — Reference for "..." dropdown actions
- `apps/web/src/app/admin/organizations/components/org-table.tsx` — Reference for dropdown actions

### Reusable Components
- `apps/web/src/app/admin/policies/components/resolved-policy-card.tsx` — For Policies tab in sheet
- `apps/web/src/components/audit/audit-log-data-table.tsx` — For Activity tab in sheet (filtered by camera)

### Requirements
- `.planning/REQUIREMENTS.md` — CAM-01 (data table), CAM-02 (quick actions), CAM-03 (card view), CAM-04 (view stream sheet)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **DataTable system** (Phase 8): Full sort/filter/pagination/row-actions — direct reuse for camera table
- **HlsPlayer**: Existing component at `cameras/components/hls-player.tsx` — reuse for sheet preview and card hover
- **CameraStatusBadge/Dot**: Status indicators ready to use
- **CameraFormDialog**: Create/edit dialog — extend to include stream profile selector
- **EmbedCodeDialog**: Copy embed code — reuse as-is
- **ResolvedPolicyCard**: Policy display — reuse in sheet Policies tab
- **AuditLogDataTable**: Audit log with DataTable — reuse in sheet Activity tab, filtered by camera
- **useCameraStatus hook**: Socket.IO real-time status updates — already used in current page

### Established Patterns
- Column definitions in separate "use client" files (Phase 8 convention D-02)
- Row actions via "..." MoreHorizontal button + DropdownMenu (Phase 10 pattern)
- Faceted filter buttons with multi-select popover (Phase 8 D-05)
- shadcn Sheet component available for slide-in panels

### Integration Points
- Camera list page at `/app/cameras/page.tsx` — replace import target
- Admin cameras redirect at `/admin/cameras/page.tsx` — update redirect or remove
- Camera detail pages at `/app/cameras/[id]` and `/admin/cameras/[id]` — remove
- Real-time status via `useCameraStatus` hook + Socket.IO — keep working in new table/cards

</code_context>

<specifics>
## Specific Ideas

- Card hover shows live preview (not full HLS player) — lightweight, muted, destroyed on mouse leave
- Stream Profile selection merged into Edit/Create camera dialog (not separate action)
- Record is a state-toggle button in quick actions menu ("Start Recording" ↔ "Stop Recording")
- Sheet allows switching camera without close/reopen — click different row updates sheet content

</specifics>

<deferred>
## Deferred Ideas

- Snapshot/thumbnail API for camera cards — currently using placeholder, could add server-side snapshot capture later
- Camera disable/enable functionality — decided not to implement for now
- View preference persistence (localStorage) — decided to always open as table view

</deferred>

---

*Phase: 11-camera-management*
*Context gathered: 2026-04-17*
