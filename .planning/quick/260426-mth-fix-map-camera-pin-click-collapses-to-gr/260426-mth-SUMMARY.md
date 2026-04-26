---
phase: 260426-mth-fix-map-camera-pin-click-collapses-to-gr
plan: 01
subsystem: web/map
tags: [bug-fix, regression, react-leaflet, marker-cluster, useMemo]
dependency_graph:
  requires:
    - apps/web/src/components/map/camera-marker.tsx (existing CameraMarker component)
    - react-leaflet@5.0.0 (Marker reference-equality position check)
    - react-leaflet-cluster@4.1.3 (_moveChild remove+re-add cycle)
  provides:
    - Stable position tuple reference for <Marker> (prevents spurious setLatLng)
  affects:
    - Map page leaf-marker click UX (preview popup now stays open)
tech_stack:
  added: []
  patterns:
    - useMemo<[number, number]>(() => [latitude, longitude], [latitude, longitude]) — stabilize JSX array literals passed to react-leaflet props
key_files:
  created: []
  modified:
    - apps/web/src/components/map/camera-marker.tsx
decisions:
  - Memoize position tuple instead of moving state up or restructuring the component (Option 1 from debug file) — minimal, surgical, preserves d570449's lazy-mount HLS fix untouched
metrics:
  duration: ~3 min
  completed: 2026-04-26
---

# Quick Task 260426-mth: Fix Map Camera Pin Click Collapses to Group — Summary

## One-liner

Memoize CameraMarker `position` tuple via `useMemo<[number, number]>` so react-leaflet's strict-equality check stops firing `marker.setLatLng()` on every re-render, eliminating the `_moveChild` remove+re-add cycle that re-absorbed just-clicked leaf pins back into their MarkerClusterGroup cluster bubble.

## Root Cause

Three-layer interaction bug introduced by commit **d570449** ("fix(map): lazy-mount preview HLS only when pin popup is open"):

1. `<Marker position={[latitude, longitude]} ... />` — inline array literal is a new reference on every render of CameraMarker.
2. react-leaflet@5.0.0 `updateMarker` uses strict reference equality: `if (props.position !== prevProps.position) marker.setLatLng(...)`.
3. `setLatLng` on a marker inside MarkerClusterGroup invokes `_moveChild`, which does `removeLayer` + `addLayer` — re-adding re-evaluates clustering and pulls the leaf back into the cluster.

Trigger: d570449 added `popupOpen` `useState` + `popupopen`/`popupclose` handlers, so every leaf-pin click → React re-render → new array literal → `setLatLng` → `_moveChild` → cluster re-absorption.

Cluster icon clicks were unaffected because they're handled entirely inside Leaflet (`zoomToBoundsOnClick`) without touching React state.

## Fix

Single hunk in `apps/web/src/components/map/camera-marker.tsx`:

- Added `useMemo<[number, number]>(() => [latitude, longitude], [latitude, longitude])` after the `icon` useMemo
- Swapped `<Marker position={[latitude, longitude]} ... />` → `<Marker position={position} ... />`
- `useMemo` was already imported; no new imports required
- Lazy-mount HLS behavior from d570449 preserved untouched

## Verification

- `pnpm --filter @sms-platform/web exec tsc --noEmit` → zero errors
- `pnpm --filter @sms-platform/web test -- --run camera-marker` → 8/8 tests passed (`apps/web/src/components/map/camera-marker.test.tsx`)
- Browser-verified by user (dev mode): cluster expand → leaf-pin click → preview popup opens AND stays open (no cluster collapse)

## Commit

- SHA: **ffa2a7b**
- Type: `fix`
- Scope: `quick-260426-mth`
- Files (1): `apps/web/src/components/map/camera-marker.tsx` (+12 / -1)

## Deviations from Plan

None — plan executed exactly as written. Fix was already applied to the working tree per the debug session; this task was the verify-and-commit step.

## Pointers

- Debug session: `.planning/debug/map-camera-pin-click-collapses-to-group.md`
- Regression-introducing commit: `d570449` ("fix(map): lazy-mount preview HLS only when pin popup is open")
- Plan: `.planning/quick/260426-mth-fix-map-camera-pin-click-collapses-to-gr/260426-mth-PLAN.md`

## Self-Check: PASSED

- FOUND: `apps/web/src/components/map/camera-marker.tsx` (modified, line 152 has `useMemo<[number, number]>`, line 201 has `position={position}`)
- FOUND: commit `ffa2a7b` in `git log` (single-file commit)
- FOUND: working tree clean for `apps/web/src/components/map/camera-marker.tsx` post-commit
