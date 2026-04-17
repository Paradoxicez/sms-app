---
phase: 13-hierarchy-map
plan: "02"
subsystem: frontend-map
tags: [map, hierarchy, tree-overlay, placement-mode, view-stream]
dependency_graph:
  requires: [13-01]
  provides: [map-tree-filtering, camera-placement, map-view-stream]
  affects: [tenant-map-page, camera-map, camera-popup, camera-marker]
tech_stack:
  added: []
  patterns: [state-machine, floating-overlay, coordinate-clamping]
key_files:
  created:
    - apps/web/src/components/map/map-tree-overlay.tsx
    - apps/web/src/components/map/placement-mode.tsx
  modified:
    - apps/web/src/components/map/camera-map.tsx
    - apps/web/src/components/map/camera-map-inner.tsx
    - apps/web/src/components/map/camera-popup.tsx
    - apps/web/src/components/map/camera-marker.tsx
    - apps/web/src/components/pages/tenant-map-page.tsx
decisions:
  - PlacementState as discriminated union for clean state transitions
  - Lat/lng clamping in client before PATCH for T-13-04 threat mitigation
  - MapCamera to CameraRow mapping inline for ViewStreamSheet compatibility
metrics:
  duration: 288s
  completed: "2026-04-17T17:11:21Z"
---

# Phase 13 Plan 02: Map Tree Overlay & Placement Mode Summary

Floating hierarchy tree overlay for camera filtering, click-to-place placement workflow with state machine, and ViewStreamSheet integration from map popups.

## What Was Done

### Task 1: MapTreeOverlay, CameraMap filtering, CameraPopup update (823b2e7)
- Created `MapTreeOverlay` floating panel with collapsible toggle, HierarchyTree reuse, backdrop blur, and aria labels
- Added `filteredCameraIds`, `placementActive`, `onMapClick`, `onViewStream`, `onSetLocation` props to `CameraMap` and forwarded through to `CameraMapInner`
- Added single-camera `setView` optimization in `FitBounds` component
- Created `MapClickHandler` using `useMapEvents` for placement mode click capture
- Applied `cursor-crosshair` class on map container when placement active
- Replaced `View Details` link in `CameraPopup` with `View Stream` and `Set Location` buttons with proper aria-labels
- Passed `onViewStream` and `onSetLocation` callbacks through `CameraMarker` to `CameraPopup`

### Task 2: PlacementMode state machine (d94163f)
- Defined `PlacementState` discriminated union type: `idle | placing | confirming`
- Created `usePlacementMode` hook with full state machine: `startPlacing`, `onMapClick`, `confirm`, `cancel`
- Added lat/lng range clamping ([-90,90] / [-180,180]) before PATCH for T-13-04 threat mitigation
- Created `PlacementBanner` component (outside MapContainer) with `role="alert"` for instruction text
- Created `PlacementMarker` component (inside MapContainer) with pulsing green dot icon and confirm/cancel popup
- Added Escape key event listener to cancel placement from any mode

### Task 3: TenantMapPage integration (2519845)
- Integrated `MapTreeOverlay` with `useHierarchyData` for real tree data
- Computed `filteredCameraIds` from tree node selection using `useMemo` and recursive `collectCameraIds`
- Wired `usePlacementMode` with camera and hierarchy refresh on successful placement
- Added `ViewStreamSheet` integration mapping `MapCamera` to `CameraRow` shape
- Added empty state for zero cameras with guidance text
- Preserved `useFeatureCheck('map')`, `useCameraStatus`, and real-time status updates

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. **PlacementState as discriminated union** - Clean state transitions with TypeScript exhaustiveness checking
2. **Lat/lng clamping client-side** - Implements T-13-04 threat mitigation before sending PATCH request
3. **Inline MapCamera-to-CameraRow mapping** - ViewStreamSheet requires CameraRow type; minimal fields mapped since only preview tab needs camera ID/name/status

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 823b2e7 | MapTreeOverlay, CameraMap filtering, CameraPopup actions |
| 2 | d94163f | PlacementMode state machine with confirm/cancel workflow |
| 3 | 2519845 | TenantMapPage wired with tree overlay, placement, ViewStreamSheet |

## Self-Check: PASSED

All 7 files verified present. All 3 commits verified in git log.
