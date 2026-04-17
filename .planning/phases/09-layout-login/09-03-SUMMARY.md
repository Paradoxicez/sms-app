---
phase: 09-layout-login
plan: 03
subsystem: frontend-layout
tags: [sidebar, resize, recharts, leaflet, transitionend]
dependency_graph:
  requires: [09-01]
  provides: [sidebar-resize-handling]
  affects: [dashboard-charts, camera-map]
tech_stack:
  added: []
  patterns: [transitionend-event-driven-resize]
key_files:
  created:
    - apps/web/src/hooks/use-sidebar-resize.ts
  modified:
    - apps/web/src/components/map/camera-map-inner.tsx
    - apps/web/src/app/admin/layout.tsx
    - apps/web/src/app/app/layout.tsx
decisions:
  - "D-16: transitionend event over ResizeObserver or polling for sidebar resize detection"
metrics:
  duration: 88s
  completed: "2026-04-17T03:20:53Z"
  tasks_completed: 1
  tasks_total: 2
---

# Phase 09 Plan 03: Sidebar Resize Handling Summary

**One-liner:** transitionend-driven resize hook dispatches window resize for Recharts and Leaflet invalidateSize on sidebar collapse/expand

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create useSidebarResize hook and update map component | e1c83c1 | use-sidebar-resize.ts, camera-map-inner.tsx, admin/layout.tsx, app/layout.tsx |
| 2 | Verify sidebar collapse and resize behavior | -- | CHECKPOINT (human-verify) |

## What Was Built

1. **useSidebarResize hook** (`apps/web/src/hooks/use-sidebar-resize.ts`): Listens for `transitionend` on the sidebar gap element (`data-slot="sidebar-gap"`), filters to `propertyName === "width"` only, and dispatches `window.dispatchEvent(new Event("resize"))`. This triggers Recharts ResponsiveContainer to redraw at the correct width.

2. **ResizeHandler component** (inside `camera-map-inner.tsx`): A child of `MapContainer` that listens for window `resize` events and calls `map.invalidateSize()` via the `useMap()` hook. This ensures Leaflet maps resize correctly without white strips.

3. **Layout integration**: Both `admin/layout.tsx` and `app/layout.tsx` call `useSidebarResize()` to ensure the hook runs in all portal contexts.

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PENDING

Task 2 is a human-verify checkpoint. Self-check for file existence and commits will be validated after checkpoint approval.
