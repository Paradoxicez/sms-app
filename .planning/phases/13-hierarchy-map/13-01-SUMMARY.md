---
phase: 13-hierarchy-map
plan: 01
subsystem: ui
tags: [react, tree-view, split-panel, datatable, hierarchy, breadcrumb]

requires:
  - phase: 11-camera-table
    provides: CamerasDataTable component and cameras-columns for reuse
  - phase: 08-datatable-component
    provides: DataTable, DataTableColumnHeader, DataTableRowActions components

provides:
  - HierarchyTree component (shared, reusable for Map page)
  - useHierarchyData hook (TreeNode[] with project > site > camera)
  - HierarchySplitPanel with resizable divider
  - ProjectsColumns and SitesColumns for DataTable
  - Integrated projects page with tree + table split layout

affects: [13-02-map-tree-viewer]

tech-stack:
  added: []
  patterns: [tree-filter-with-parent-chain-preservation, resizable-split-panel-pointer-events, breadcrumb-render-prop-navigation]

key-files:
  created:
    - apps/web/src/components/hierarchy/hierarchy-tree.tsx
    - apps/web/src/components/hierarchy/tree-node.tsx
    - apps/web/src/components/hierarchy/tree-search.tsx
    - apps/web/src/components/hierarchy/use-hierarchy-data.ts
    - apps/web/src/app/admin/projects/components/projects-columns.tsx
    - apps/web/src/app/admin/projects/components/sites-columns.tsx
    - apps/web/src/app/admin/projects/components/hierarchy-split-panel.tsx
  modified:
    - apps/web/src/components/pages/tenant-projects-page.tsx
    - apps/web/src/app/admin/projects/[id]/page.tsx

key-decisions:
  - "HierarchyTree accepts tree data as prop (not internal fetch) for reusability across pages"
  - "Camera view at site level reuses Phase 11 CamerasDataTable directly"
  - "Project detail page replaced with redirect to preserve bookmarks"

patterns-established:
  - "Tree filter with parent chain preservation: filterTree() returns only matching branches while keeping ancestor nodes visible"
  - "Resizable split panel: pointer capture + clamp pattern (200-400px) with keyboard support"
  - "Breadcrumb render prop navigation: BreadcrumbLink with button render prop for SPA navigation"

requirements-completed: [HIER-01, HIER-02]

duration: 5min
completed: 2026-04-18
---

# Phase 13 Plan 01: Hierarchy Tree & Projects Page Summary

**Shared HierarchyTree component with collapsible search and resizable split-panel projects page showing context-sensitive DataTable for projects, sites, and cameras**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-17T16:59:12Z
- **Completed:** 2026-04-17T17:04:17Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Built reusable HierarchyTree component with search filtering (parent chain preservation), ARIA tree roles, keyboard navigation, and status dots
- Created resizable split panel (200-400px range) with pointer capture drag and mobile sheet overlay
- Rewrote projects page: tree on left, context-sensitive DataTable on right (projects at root, sites for project, cameras for site via Phase 11 CamerasDataTable)
- Preserved all 6 CRUD dialogs (create/edit/delete for both projects and sites)
- Added breadcrumb navigation reflecting tree position with clickable ancestor segments

## Task Commits

Each task was committed atomically:

1. **Task 1: Build HierarchyTree component and useHierarchyData hook** - `2417742` (feat)
2. **Task 2: Build split panel, column definitions, and projects page** - `546037f` (feat)
3. **Task 3: Redirect project detail page and verify integration** - `cad827e` (feat)

## Files Created/Modified

- `apps/web/src/components/hierarchy/hierarchy-tree.tsx` - Main tree component with search, filter, ARIA, keyboard nav
- `apps/web/src/components/hierarchy/tree-node.tsx` - Individual node renderer with icons, status dots, counts
- `apps/web/src/components/hierarchy/tree-search.tsx` - Debounced search input with clear button
- `apps/web/src/components/hierarchy/use-hierarchy-data.ts` - Hook fetching project > site > camera tree
- `apps/web/src/app/admin/projects/components/projects-columns.tsx` - DataTable columns for projects
- `apps/web/src/app/admin/projects/components/sites-columns.tsx` - DataTable columns for sites
- `apps/web/src/app/admin/projects/components/hierarchy-split-panel.tsx` - Resizable split panel with mobile sheet
- `apps/web/src/components/pages/tenant-projects-page.tsx` - Complete rewrite with tree + DataTable layout
- `apps/web/src/app/admin/projects/[id]/page.tsx` - Redirect to /app/projects

## Decisions Made

- HierarchyTree receives tree data as prop rather than fetching internally, enabling reuse in Map page (Plan 02)
- Camera view at site level reuses Phase 11's CamerasDataTable component directly instead of building a new one
- Project detail page replaced with a simple redirect component (18 lines) to avoid broken bookmarks

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- HierarchyTree component ready for reuse in Plan 02 (Map tree viewer)
- useHierarchyData hook provides TreeNode[] with parentProject references for breadcrumb building
- All TypeScript compiles cleanly with no errors

## Self-Check: PASSED

All 9 files verified present. All 3 commit hashes verified in git log.

---
*Phase: 13-hierarchy-map*
*Completed: 2026-04-18*
