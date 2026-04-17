---
phase: 13-hierarchy-map
verified: 2026-04-17T18:00:00Z
status: human_needed
score: 14/14 must-haves verified
human_verification:
  - test: "Load /app/projects and verify tree renders with correct Project > Site > Camera hierarchy"
    expected: "Left panel shows tree with Folder icons for projects, MapPin for sites, status dots for cameras with locations, MapPinOff for cameras without locations. Child counts appear as badges."
    why_human: "Visual layout, icon rendering, and CSS styling cannot be verified programmatically"
  - test: "Click a project node, then a site node, and verify DataTable content changes and breadcrumb updates"
    expected: "Selecting project shows sites table. Selecting site shows cameras table (Phase 11 CamerasDataTable). Breadcrumb shows 'Projects > ProjectName > SiteName' with clickable ancestors."
    why_human: "End-to-end navigation flow, state transitions, and visual feedback require browser interaction"
  - test: "Drag the split panel divider and verify it resizes between 200-400px"
    expected: "Divider smoothly resizes tree panel width, clamped at 200px min and 400px max. Keyboard arrow keys also adjust by 20px."
    why_human: "Pointer capture drag behavior and visual panel resizing require mouse interaction"
  - test: "Resize browser below 768px and verify tree moves to sheet overlay"
    expected: "Tree panel hidden on mobile. PanelLeft button visible. Clicking it opens left-side Sheet with tree. Selecting a node closes sheet and updates table."
    why_human: "Responsive breakpoint behavior requires viewport resize testing"
  - test: "Open /app/map, click tree toggle button, select a project node"
    expected: "Floating panel opens with hierarchy tree. Selecting a node filters map markers to only cameras under that node. Map auto-zooms to fit filtered markers."
    why_human: "Map rendering, marker filtering, and zoom behavior require visual verification with Leaflet"
  - test: "Click a camera marker popup 'Set Location' button, click on map, confirm"
    expected: "Crosshair cursor appears. Clicking places a green pulsing preview marker with confirm/cancel popup. Confirming saves location via PATCH API. Pressing Escape cancels."
    why_human: "Map interaction flow, cursor style changes, and popup behavior require browser testing"
  - test: "Click a camera marker popup 'View Stream' button"
    expected: "ViewStreamSheet opens from right side showing camera preview, HLS player, and stream controls"
    why_human: "Sheet rendering and HLS playback require browser with media capabilities"
---

# Phase 13: Hierarchy Tree & Map Enhancements Verification Report

**Phase Goal:** Users can navigate the Project > Site > Camera hierarchy via a tree viewer and manage camera locations on an enhanced map
**Verified:** 2026-04-17T18:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees a tree with Project > Site > Camera hierarchy, each node showing correct icon and child count | VERIFIED | hierarchy-tree.tsx renders TreeNodeItem recursively; tree-node.tsx uses Folder/MapPin/MapPinOff icons with count badges |
| 2 | User can expand/collapse tree nodes with chevron indicators | VERIFIED | tree-node.tsx has ChevronRight with `transition-transform duration-150` and `rotate-90`, `e.stopPropagation()` on chevron click |
| 3 | User can search the tree with parent chain preservation | VERIFIED | hierarchy-tree.tsx `filterTree()` function preserves parent chain when children match |
| 4 | User can drag divider to resize panel widths (200px min, 400px max) | VERIFIED | hierarchy-split-panel.tsx has `Math.min(400, Math.max(200, newWidth))`, `setPointerCapture`, keyboard arrow support |
| 5 | Selecting a project shows sites in DataTable | VERIFIED | tenant-projects-page.tsx fetches `/api/projects/${id}/sites` when selectedNode.type === 'project', renders with createSitesColumns |
| 6 | Selecting a site shows cameras in DataTable (Phase 11 CamerasDataTable) | VERIFIED | tenant-projects-page.tsx fetches `/api/cameras?siteId=${id}` when selectedNode.type === 'site', renders CamerasDataTable |
| 7 | Breadcrumb reflects tree position and is clickable | VERIFIED | tenant-projects-page.tsx renderBreadcrumb() builds path from selectedNode with BreadcrumbLink (button render prop) for ancestors |
| 8 | Mobile (<768px) tree is hidden, accessible via sheet overlay | VERIFIED | hierarchy-split-panel.tsx uses `hidden md:flex` for desktop, Sheet side="left" for mobile |
| 9 | User can open floating tree panel on map page to filter cameras | VERIFIED | map-tree-overlay.tsx renders floating panel with z-[1000], backdrop-blur-sm, HierarchyTree component |
| 10 | Selecting tree node filters map markers and zooms to fit | VERIFIED | tenant-map-page.tsx computes filteredCameraIds via collectCameraIds(); camera-map-inner.tsx filters mappableCameras; FitBounds auto-zooms |
| 11 | User can enter placement mode with crosshair cursor via Set Location | VERIFIED | placement-mode.tsx usePlacementMode hook; camera-map-inner.tsx applies cursor-crosshair class when placementActive |
| 12 | User clicks map to place marker, confirms or cancels to save/discard | VERIFIED | PlacementMarker shows confirming popup; confirm() calls PATCH /api/cameras/:id with location; Escape key cancels |
| 13 | Camera popup shows View Stream and Set Location buttons | VERIFIED | camera-popup.tsx has both buttons with proper aria-labels, no old View Details link |
| 14 | Cameras without lat/lng show MapPinOff in tree, not on map | VERIFIED | tree-node.tsx checks hasLocation for MapPinOff; camera-map-inner.tsx filters null lat/lng in mappableCameras |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/components/hierarchy/hierarchy-tree.tsx` | Shared tree viewer component | VERIFIED | 231 lines, exports HierarchyTree + TreeNode type, role="tree", filterTree, keyboard nav |
| `apps/web/src/components/hierarchy/tree-node.tsx` | Individual node renderer | VERIFIED | 151 lines, role="treeitem", aria-expanded, Folder/MapPin/MapPinOff icons, status dots |
| `apps/web/src/components/hierarchy/tree-search.tsx` | Search input with debounce | VERIFIED | 54 lines, placeholder "Search hierarchy...", 200ms debounce, clear button |
| `apps/web/src/components/hierarchy/use-hierarchy-data.ts` | Hook to fetch tree data | VERIFIED | 134 lines, exports useHierarchyData returning {tree, isLoading, error, refresh}, calls /api/projects and /api/cameras |
| `apps/web/src/app/admin/projects/components/projects-columns.tsx` | DataTable columns for projects | VERIFIED | 80 lines, "use client", createProjectsColumns, DataTableColumnHeader, DataTableRowActions |
| `apps/web/src/app/admin/projects/components/sites-columns.tsx` | DataTable columns for sites | VERIFIED | 99 lines, "use client", createSitesColumns, location column with "Not set" fallback |
| `apps/web/src/app/admin/projects/components/hierarchy-split-panel.tsx` | Resizable split panel | VERIFIED | 120 lines, role="separator", setPointerCapture, Sheet for mobile |
| `apps/web/src/components/pages/tenant-projects-page.tsx` | Projects page with tree + DataTable | VERIFIED | 903 lines, all 6 CRUD dialogs, breadcrumb, selectedNode navigation matrix |
| `apps/web/src/app/admin/projects/[id]/page.tsx` | Redirect to /app/projects | VERIFIED | 18 lines, useRouter + router.replace('/app/projects') |
| `apps/web/src/components/map/map-tree-overlay.tsx` | Floating tree panel for map | VERIFIED | 95 lines, z-[1000], aria-label="Hierarchy filter panel", imports HierarchyTree |
| `apps/web/src/components/map/placement-mode.tsx` | Placement state machine + UI | VERIFIED | 188 lines, PlacementState union, usePlacementMode hook, PATCH with lat/lng, Escape key handler |
| `apps/web/src/components/map/camera-map.tsx` | CameraMap with filtering props | VERIFIED | 54 lines, filteredCameraIds/placementActive/onMapClick/onViewStream/onSetLocation forwarded |
| `apps/web/src/components/map/camera-map-inner.tsx` | Map inner with filtering and click handler | VERIFIED | 148 lines, filteredCameraIds filtering, MapClickHandler with useMapEvents, cursor-crosshair, single-camera setView |
| `apps/web/src/components/map/camera-marker.tsx` | Marker with popup callbacks | VERIFIED | 72 lines, onViewStream and onSetLocation props passed to CameraPopup |
| `apps/web/src/components/map/camera-popup.tsx` | Updated popup with View Stream + Set Location | VERIFIED | 117 lines, both buttons with aria-labels, no old Link href |
| `apps/web/src/components/pages/tenant-map-page.tsx` | Enhanced map page | VERIFIED | 251 lines, MapTreeOverlay, usePlacementMode, useHierarchyData, ViewStreamSheet, filteredCameraIds via useMemo |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| hierarchy-tree.tsx | use-hierarchy-data.ts | useHierarchyData hook provides TreeNode[] | WIRED | TreeNode type imported from use-hierarchy-data.ts |
| tenant-projects-page.tsx | hierarchy-tree.tsx | onSelect callback updates selectedNode | WIRED | handleNodeSelect -> setSelectedNode, passed as onSelect prop |
| tenant-projects-page.tsx | DataTable | selectedNode determines columns/data | WIRED | Navigation matrix at lines 497-584 renders different tables per selectedNode.type |
| tenant-map-page.tsx | map-tree-overlay.tsx | filterNode drives filteredCameraIds | WIRED | filterNode state -> collectCameraIds -> filteredCameraIds useMemo -> CameraMap prop |
| tenant-map-page.tsx | placement-mode.tsx | placementState drives PlacementMode | WIRED | usePlacementMode hook, PlacementBanner + PlacementMarker rendered |
| camera-popup.tsx | ViewStreamSheet | onViewStream callback opens sheet | WIRED | handleViewStream finds camera, maps to CameraRow, sets viewStreamOpen |
| placement-mode.tsx | /api/cameras/:id | PATCH with location on confirm | WIRED | apiFetch with PATCH method and JSON.stringify({ location: { lat, lng } }) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| hierarchy-tree.tsx | tree (TreeNode[]) | useHierarchyData -> apiFetch('/api/projects') + apiFetch('/api/cameras') | Yes, DB queries via RLS | FLOWING |
| tenant-projects-page.tsx | projects/sites/cameras | apiFetch per selectedNode type | Yes, DB queries via RLS | FLOWING |
| tenant-map-page.tsx | cameras (MapCamera[]) | apiFetch('/api/cameras') | Yes, DB queries via RLS | FLOWING |
| tenant-map-page.tsx | filteredCameraIds | Computed from filterNode via collectCameraIds | Yes, derived from live tree data | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED (no runnable entry points -- requires Next.js dev server and browser for UI components)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| HIER-01 | 13-01 | User can navigate Project > Site > Camera hierarchy via tree viewer | SATISFIED | HierarchyTree component with expand/collapse, search, selection |
| HIER-02 | 13-01 | User sees data table showing children of selected tree node | SATISFIED | tenant-projects-page.tsx navigation matrix renders projects/sites/cameras tables |
| MAP-01 | 13-02 | User can filter cameras on map using tree viewer | SATISFIED | MapTreeOverlay -> filteredCameraIds -> CameraMap filtering |
| MAP-02 | 13-02 | User can set camera lat/lng via map interaction | SATISFIED | PlacementMode click-to-place workflow with PATCH API call (click-to-place instead of drag-drop per implementation choice) |
| MAP-03 | 13-02 | User can click map marker to see camera preview popup | SATISFIED | CameraPopup with HLS preview, View Stream button, Set Location button |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| tenant-map-page.tsx | 198-207 | "Open tree panel" button has no-op onClick handler | Warning | Only appears in zero-cameras empty state; tree overlay is in a separate component with internal isOpen state that cannot be controlled from parent. Functional workaround would require lifting state. |

### Human Verification Required

### 1. Projects Page Tree + Table Layout

**Test:** Load /app/projects and verify the split panel renders correctly with tree on left and DataTable on right
**Expected:** Tree shows Project > Site > Camera hierarchy with correct icons. Selecting nodes updates the DataTable. Breadcrumb reflects position. All CRUD dialogs (create/edit/delete for projects and sites) work.
**Why human:** Visual layout, CSS styling, dialog interactions, and end-to-end navigation flow require browser testing

### 2. Resizable Split Panel

**Test:** Drag the divider between tree and table panels
**Expected:** Panel resizes smoothly between 200-400px. Keyboard Left/Right arrows adjust by 20px increments.
**Why human:** Pointer capture drag behavior requires mouse interaction

### 3. Mobile Layout

**Test:** Resize browser below 768px
**Expected:** Tree hidden. PanelLeft button visible. Clicking opens Sheet from left with tree inside. Selecting node closes sheet.
**Why human:** Responsive breakpoint testing requires viewport manipulation

### 4. Map Tree Overlay and Filtering

**Test:** Open /app/map, click tree toggle, select a project or site node
**Expected:** Floating panel opens. Map markers filter to selected node's cameras. Map zooms to fit.
**Why human:** Leaflet map rendering, marker visibility, and zoom behavior need visual confirmation

### 5. Placement Mode Flow

**Test:** Click camera marker popup "Set Location", click on map, confirm
**Expected:** Crosshair cursor during placement. Green pulsing marker on click. Confirm saves via PATCH. Escape cancels. Banner shows instructions.
**Why human:** Map interaction sequence with cursor changes and popup workflow

### 6. View Stream from Map

**Test:** Click camera marker popup "View Stream" button
**Expected:** ViewStreamSheet opens showing camera preview and controls
**Why human:** Sheet rendering and HLS playback require media-capable browser

### Gaps Summary

No code-level gaps found. All 14 must-have truths are verified at the code level. All 5 requirements (HIER-01, HIER-02, MAP-01, MAP-02, MAP-03) are satisfied. One minor anti-pattern: the "Open tree panel" button in the empty-cameras state is non-functional (warning severity only, does not block goal achievement).

Human verification is required to confirm visual rendering, interactive behaviors (drag resize, map interactions), and responsive layout work correctly in a browser.

---

_Verified: 2026-04-17T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
