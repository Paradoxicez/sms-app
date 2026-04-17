---
phase: 11-camera-management
plan: 02
subsystem: camera-ui
tags: [camera-card, card-grid, hls-preview, hover-preview, responsive-grid]
dependency_graph:
  requires: [CameraRow-type, CamerasDataTable, CameraStatusBadge, CameraStatusDot]
  provides: [CameraCard, CameraCardGrid, hover-hls-preview]
  affects: [cameras-data-table]
tech_stack:
  added: []
  patterns: [hover-to-preview, shared-ref-counter, base-ui-render-prop]
key_files:
  created:
    - apps/web/src/app/admin/cameras/components/camera-card.tsx
    - apps/web/src/app/admin/cameras/components/camera-card-grid.tsx
  modified:
    - apps/web/src/app/admin/cameras/components/cameras-data-table.tsx
decisions:
  - Used base-ui render prop pattern for DropdownMenuTrigger (not Radix asChild)
  - HoverPreviewPlayer as internal component in camera-card.tsx (not separate file)
  - MAX_CONCURRENT set to 6 (upper end of 4-6 range from STATE.md)
metrics:
  duration: 129s
  completed: "2026-04-17T09:18:02Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 11 Plan 02: Camera Card View with HLS Hover Preview Summary

CameraCard with hover-to-preview HLS pattern (300ms debounce, maxBufferLength:4) in responsive 4/2/1 grid, concurrent players capped at 6 via shared ref counter.

## What Was Built

### camera-card.tsx
- CameraCard component with hover HLS preview pattern
- 300ms debounce on mouseEnter before starting HLS player
- Immediate player destruction on mouseLeave
- HoverPreviewPlayer internal component with minimal HLS config (maxBufferLength: 4, backBufferLength: 0, lowLatencyMode: true)
- Shared activePlayersRef for concurrent player tracking across cards
- Card layout: aspect-video thumbnail area with status badge overlay, info area with name/status dot/site name
- Dropdown menu with 5 actions (Edit, View Stream, Start/Stop Recording, Embed Code, Delete) using base-ui render prop pattern
- stopPropagation on menu trigger and all menu items to prevent card click propagation
- Keyboard accessible: tabIndex={0}, role="button", Enter/Space key handlers
- Destructive Delete action with separator and variant="destructive"

### camera-card-grid.tsx
- Responsive grid layout: grid-cols-1 / md:grid-cols-2 / xl:grid-cols-4
- Shared activePlayersRef with MAX_CONCURRENT=6 passed to all CameraCard instances
- Loading skeleton state: 4 skeleton cards with aspect-video + text skeletons
- Empty state with CameraIcon, descriptive text, and Add Camera button
- Optional onCreateCamera prop for empty state action

### cameras-data-table.tsx (modified)
- Replaced card view placeholder with CameraCardGrid component
- Passes filtered rows via table.getFilteredRowModel().rows.map(r => r.original)
- Shared filter state between table and card views (D-23 satisfied)
- Passes all action handlers and onCreateCamera to CameraCardGrid

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 13aea7c | Create CameraCard component with hover HLS preview |
| 2 | f907d9b | Create CameraCardGrid and wire into CamerasDataTable |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed useRef TypeScript strict mode error**
- **Found during:** Task 1
- **Issue:** `useRef<ReturnType<typeof setTimeout>>()` requires argument in strict TypeScript
- **Fix:** Changed to `useRef<ReturnType<typeof setTimeout> | undefined>(undefined)`
- **Files modified:** camera-card.tsx
- **Commit:** 13aea7c

**2. [Rule 2 - Adaptation] Used base-ui render prop pattern instead of Radix asChild**
- **Found during:** Task 1
- **Issue:** Plan specified `asChild` on DropdownMenuTrigger, but project uses base-ui with `render` prop
- **Fix:** Used `render={<Button .../>}` pattern matching existing data-table-row-actions.tsx
- **Files modified:** camera-card.tsx
- **Commit:** 13aea7c

## Self-Check: PASSED
