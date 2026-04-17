# Phase 13: Hierarchy & Map - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can navigate the Project > Site > Camera hierarchy via a tree viewer and manage camera locations on an enhanced map. The project page becomes a split-panel with tree navigation on the left and DataTable on the right. The map page gains a floating tree overlay for filtering and a drag-drop flow for setting camera coordinates.

</domain>

<decisions>
## Implementation Decisions

### Tree Viewer Component
- **D-01:** Tree displays: Project nodes with 📁 icon + name + "(N sites)", Site nodes with 📍 icon + name + "(N cameras)", Camera nodes with status dot (●/○) + name
- **D-02:** All nodes are collapsible/expandable with chevron indicators (▶/▼)
- **D-03:** Search box at the top of tree panel — typing filters tree to show only matching nodes (and their parent chain)
- **D-04:** Tree component is shared between Projects page and Map page (same component, different context)

### Split Panel Layout (Projects Page)
- **D-05:** Resizable split panel — user can drag a divider between tree and DataTable to adjust widths
- **D-06:** Default tree width ~280px, min ~200px, max ~400px
- **D-07:** Mobile/tablet: tree panel hidden by default, DataTable shown full-width with breadcrumb navigation. Toggle button opens tree as a drawer/sheet overlay

### Tree-to-Table Interaction
- **D-08:** Table shows direct children of the selected node: Root → Projects table, Project → Sites table, Site → Cameras table (reuse Phase 11 DataTable columns)
- **D-09:** Default state on page load: root selected, tree collapsed, table shows all projects
- **D-10:** Breadcrumb above DataTable reflects current tree position (e.g., "Projects > Office Building > Floor 1") — clickable to navigate up
- **D-11:** Projects table columns: Name, Sites count, Created, Actions ("...")
- **D-12:** Sites table columns: Name, Cameras count, Location, Created, Actions ("...")
- **D-13:** Cameras table at site level reuses Phase 11 camera DataTable with all its features (sort, filter, card view toggle, View Stream sheet)

### Map Tree Integration
- **D-14:** Tree viewer on map page is a floating overlay panel (top-left), not a side panel — map uses full viewport width
- **D-15:** Floating panel can be opened/closed with a toggle button
- **D-16:** Selecting a node in the map tree filters map markers to show only cameras under that node, and zooms/fits bounds to those cameras
- **D-17:** Same tree component as Projects page (D-04), but click behavior filters map instead of updating a table

### Drag-Drop Marker (Set Camera Location)
- **D-18:** User must initiate location editing explicitly — click "Set Location" button in camera popup or tree context menu
- **D-19:** After clicking "Set Location": map enters placement mode with crosshair cursor, user clicks to place marker, then confirm/cancel popup appears
- **D-20:** On confirm: API call to update camera lat/lng, marker stays on map. On cancel: revert to previous state
- **D-21:** Cameras without lat/lng show in tree but not on map — tree can surface "no location" cameras for the user to place

### Map Popup
- **D-22:** Keep existing CameraPopup as-is (name, status badge, HLS preview, viewer count) — already satisfies MAP-03
- **D-23:** Update "View Details" link to open View Stream sheet (Phase 11) instead of linking to removed camera detail page

### Claude's Discretion
- Resizable panel implementation (CSS resize, react-resizable, or custom drag handler)
- Tree component library choice (custom build vs radix-ui tree vs react-arborist)
- Floating panel animation and positioning
- Placement mode visual feedback (crosshair, pulsing marker, instructions tooltip)
- Tree expand/collapse animation
- Loading states for tree data fetch
- Empty states (no projects, no sites, no cameras)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — HIER-01 (tree viewer), HIER-02 (DataTable right panel), MAP-01 (map tree filter), MAP-02 (drag-drop marker), MAP-03 (map popup preview)

### DataTable System (Phase 8)
- `.planning/phases/08-foundation-components/08-CONTEXT.md` — DataTable architecture, column definition pattern, toolbar layout, faceted filter
- `apps/web/src/components/ui/data-table/` — DataTable component directory

### Camera Management (Phase 11)
- `.planning/phases/11-camera-management/11-CONTEXT.md` — Camera DataTable columns, card view, View Stream sheet, quick actions
- `apps/web/src/components/pages/tenant-cameras-page.tsx` — Current camera page (reference for camera table at site level)

### Existing Map Components
- `apps/web/src/components/map/camera-map.tsx` — CameraMap wrapper with MapCamera interface
- `apps/web/src/components/map/camera-map-inner.tsx` — Leaflet MapContainer, marker clustering, FitBounds, ResizeHandler
- `apps/web/src/components/map/camera-marker.tsx` — Marker with status-colored dot icon, draggable=false currently
- `apps/web/src/components/map/camera-popup.tsx` — Popup with HLS preview, status badge, viewer count

### Existing Projects/Sites Pages (replace)
- `apps/web/src/components/pages/tenant-projects-page.tsx` — Current projects list (simple table, no tree)
- `apps/web/src/app/admin/projects/[id]/page.tsx` — Current project detail with sites table and breadcrumb
- `apps/web/src/components/pages/tenant-map-page.tsx` — Current map page (no tree filter)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **DataTable system** (Phase 8): Full DataTable with sorting, filtering, pagination, row selection, row actions — reuse for Projects table, Sites table, and Cameras table at site level
- **CameraMap components**: Leaflet map with marker clustering, status-colored markers, HLS preview popup — enhance rather than rebuild
- **Breadcrumb component**: Already used in project detail page — reuse for tree navigation breadcrumb
- **useCameraStatus hook**: Real-time camera status via Socket.IO — already used in map page

### Established Patterns
- Column definitions in separate "use client" files (Phase 8 convention)
- DataTable toolbar: search (left) + faceted filters (center) + action buttons (right)
- Dialog/AlertDialog for create/edit/delete actions
- `apiFetch` for API calls, `toast` for feedback

### Integration Points
- Replace `tenant-projects-page.tsx` with new split-panel tree + DataTable page
- Replace project detail page (`/admin/projects/[id]`) — navigation now happens via tree
- Enhance `tenant-map-page.tsx` with floating tree overlay
- Enhance `camera-marker.tsx` to support draggable mode for location setting
- CameraPopup "View Details" link needs to open View Stream sheet instead of camera detail page

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-hierarchy-map*
*Context gathered: 2026-04-17*
