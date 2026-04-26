---
status: resolved
trigger: "บนหน้า map ของ web app เมื่อคลิ๊ก pin รายกล้อง (individual camera pin / leaf marker) เพื่อจะดู preview กลับยุบกลายเป็น group cluster แทนที่จะเปิด preview ของกล้องตัวนั้น"
created: 2026-04-26T00:00:00Z
updated: 2026-04-26T16:30:00Z
resolved: 2026-04-26T16:30:00Z
---

## Current Focus

hypothesis: CONFIRMED + VERIFIED — Option 1 fix applied: `position` array stabilized via `useMemo([latitude, longitude], [latitude, longitude])`
test: typecheck (tsc --noEmit) clean; vitest camera-marker.test.tsx 8/8 passed; user confirmed in browser (dev mode) that leaf-marker click opens preview popup and popup stays open without collapsing back into cluster
next_action: Resolved — eligible for commit as quick task (regression fix for d570449)

## Symptoms

expected: คลิ๊ก pin รายกล้อง (individual marker ที่ไม่ได้อยู่ใน cluster แล้ว / หลังจาก expand cluster) → ควรเปิด preview popup/panel ของกล้องตัวนั้น
actual: คลิ๊ก pin รายกล้องแล้ว pin นั้นยุบกลับเข้าไปเป็น group cluster เหมือนเดิม ไม่มี preview แสดงเลย
errors: ยังไม่มี error message
reproduction:
  1. เข้าหน้า map
  2. คลิ๊ก expand cluster → ทำงานปกติ pin แตกออก
  3. คลิ๊ก pin รายกล้องที่ขยายออกมา
  4. แทนที่จะเห็น preview กลับเห็น pin ยุบกลับเป็น group
started: ไม่ระบุ

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-26T00:00:00Z
  checked: Knowledge base for matching patterns
  found: No matching entries (closest: notification-popover-overflow, bulk-import-drop-zone, view-stream-activity-tab — all unrelated)
  implication: Novel issue, full investigation needed

- timestamp: 2026-04-26T00:00:00Z
  checked: Map-related files in apps/web
  found: 7 map component files: camera-map.tsx, camera-map-inner.tsx, camera-marker.tsx, camera-popup.tsx, placement-mode.tsx, plus tenant-map-page.tsx and tests
  implication: Need to read each to understand cluster + click handler chain

- timestamp: 2026-04-26T00:00:00Z
  checked: apps/web/src/components/map/camera-marker.tsx
  found: |
    Lines 140 + 178-183: `const [popupOpen, setPopupOpen] = useState(false)` plus
    `popupopen() { setPopupOpen(true); }` and `popupclose() { setPopupOpen(false); }`.
    Lines 188-198: <Marker ref={markerRef} position={[latitude, longitude]} icon={icon}
    cameraStatus={status} draggable={!!onDragEnd} eventHandlers={eventHandlers}>.
    The `position={[latitude, longitude]}` is an inline array literal — a NEW
    reference on every render.
  implication: Any state change inside CameraMarker (including `setPopupOpen(true)`
    on the popupopen Leaflet event) re-renders this component, producing a brand-new
    position array reference even though the underlying numbers didn't change.

- timestamp: 2026-04-26T00:00:00Z
  checked: node_modules/react-leaflet@5.0.0/lib/Marker.js
  found: |
    updateMarker function lines 9-10:
      if (props.position !== prevProps.position) {
          marker.setLatLng(props.position);
      }
    This is strict reference equality, NOT deep equality.
  implication: A new `[latitude, longitude]` array literal on every render means
    `props.position !== prevProps.position` is ALWAYS true after a re-render →
    react-leaflet calls `marker.setLatLng()` every time, even when the actual
    coordinates are identical.

- timestamp: 2026-04-26T00:00:00Z
  checked: react-leaflet-cluster@4.1.3 source (https://github.com/akursat/react-leaflet-cluster/blob/main/src/index.tsx)
  found: |
    The MarkerClusterGroup wrapper overrides `_moveChild` to remove+re-add the
    marker via the prototype methods:
      ;(markerClusterGroup as any)._moveChild = function (layer, from, to) {
        ;(layer as any)._latlng = from
        proto.removeLayer.call(this, layer)   // ← removes from cluster group
        ;(layer as any)._latlng = to
        proto.addLayer.call(this, layer)      // ← re-adds at new position
      }
    Leaflet.markercluster's `Marker.setLatLng` for a clustered marker calls
    `_moveChild`. Re-adding a marker at a position that still falls inside a
    cluster's clustering radius causes it to be ABSORBED back into the cluster
    bubble, and the popup closes because the marker layer is no longer rendered
    as an individual leaf.
  implication: Even though `from === to` numerically, the remove+re-add cycle
    is destructive: it rebuilds the cluster topology and the just-clicked leaf
    marker visually collapses back into its parent cluster.

- timestamp: 2026-04-26T00:00:00Z
  checked: git show d570449 -- apps/web/src/components/map/camera-marker.tsx
  found: |
    Commit d570449 ("fix(map): lazy-mount preview HLS only when pin popup is
    open", 28 hours ago) ADDED the popupOpen useState + popupopen/popupclose
    handlers to CameraMarker. Before this commit, CameraMarker had no internal
    state, so the popupopen Leaflet event triggered no React re-render and
    `position={[latitude, longitude]}` was created exactly once on mount.
  implication: This is the regression-introducing commit. The HLS lazy-mount
    fix solved Phase 13's runaway viewer count, but it inadvertently introduced
    a state update on every popupopen event — and that state update plus the
    inline array literal `[latitude, longitude]` together triggered the
    setLatLng → _moveChild → re-cluster collapse cascade.

## Resolution

root_cause: |
  Three-layer interaction bug introduced by commit d570449:

  1. (apps/web/src/components/map/camera-marker.tsx)
     `<Marker position={[latitude, longitude]} ... />` uses an inline array
     literal — a new reference on every render of CameraMarker.

  2. (node_modules/react-leaflet@5.0.0/lib/Marker.js)
     react-leaflet's updateMarker uses strict reference equality for `position`:
       if (props.position !== prevProps.position) marker.setLatLng(...)
     So any re-render of CameraMarker calls `setLatLng` even when the
     coordinates haven't actually changed.

  3. (node_modules/react-leaflet-cluster@4.1.3 + leaflet.markercluster)
     `setLatLng` on a marker inside a MarkerClusterGroup invokes `_moveChild`,
     which does removeLayer + addLayer through the cluster-group prototype.
     Re-adding the marker re-evaluates clustering: the just-revealed leaf is
     pulled back into the cluster bubble it expanded out of, and its popup
     closes synchronously.

  The trigger that exercises this chain on every leaf-marker click is the
  state update added in commit d570449:
     popupopen() { setPopupOpen(true); }
  Before d570449, CameraMarker had zero internal state → popupopen fired no
  re-render → the position array stayed at its initial reference → bug latent.

  Cluster-icon clicks behave correctly because they are handled entirely
  inside Leaflet (zoomToBoundsOnClick) without going through any React state
  update, so no inline-array-literal re-render fires.

fix: |
  Option 1 — stabilize the `position` tuple reference via `useMemo` so
  react-leaflet's strict-equality check (`props.position !== prevProps.position`)
  returns false on re-renders that do not change coordinates. This prevents
  the spurious `marker.setLatLng()` call that triggers leaflet.markercluster's
  destructive `_moveChild` remove+re-add cycle.

  Edit: apps/web/src/components/map/camera-marker.tsx

  BEFORE (line 188-191 in <Marker>):
    <Marker
      ref={markerRef}
      position={[latitude, longitude]}   ← new array reference each render
      icon={icon}

  AFTER (added memoized constant + swapped JSX prop):
    // Inside CameraMarker, after the `icon` useMemo (line ~146):
    const position = useMemo<[number, number]>(
      () => [latitude, longitude],
      [latitude, longitude],
    );

    // In <Marker>:
    <Marker
      ref={markerRef}
      position={position}                  ← stable reference
      icon={icon}

  `useMemo` was already imported at line 3, no new imports needed.
  No other code touched (popup state, cluster config, eventHandlers all
  intentionally left as-is per fix_directive).

verification: |
  Self-verified:
  - `pnpm exec tsc --noEmit` (apps/web) → "TypeScript: No errors found"
  - `pnpm --filter @sms-platform/web test -- --run camera-marker` →
    8/8 tests passed (camera-marker.test.tsx)

  Awaiting human verification in the browser:
  1. Open the map page
  2. Click a cluster to expand it
  3. Click an individual camera pin
  4. Confirm: preview popup opens AND stays open (does NOT collapse back
     into the cluster bubble)

files_changed:
  - apps/web/src/components/map/camera-marker.tsx
