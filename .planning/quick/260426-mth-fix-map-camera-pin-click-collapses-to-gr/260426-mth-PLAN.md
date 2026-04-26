---
phase: 260426-mth-fix-map-camera-pin-click-collapses-to-gr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/map/camera-marker.tsx
autonomous: true
requirements:
  - QUICK-260426-mth
must_haves:
  truths:
    - "Clicking a leaf camera pin (after expanding a cluster) opens the preview popup and the popup stays open"
    - "Re-renders of CameraMarker no longer trigger react-leaflet's setLatLng → _moveChild remove+re-add cycle"
    - "Typecheck is clean and camera-marker.test.tsx unit tests all pass"
  artifacts:
    - path: "apps/web/src/components/map/camera-marker.tsx"
      provides: "useMemo-stabilized position tuple passed to <Marker>"
      contains: "useMemo<[number, number]>"
  key_links:
    - from: "apps/web/src/components/map/camera-marker.tsx (CameraMarker function body)"
      to: "<Marker position={position} ...> JSX"
      via: "memoized `position` constant declared after the `icon` useMemo"
      pattern: "useMemo<\\[number, number\\]>"
---

<objective>
Package the already-applied regression fix for the map leaf-marker click bug into an atomic quick-task commit. Root cause and fix are locked (see debug file). The edit is sitting in the working tree and has been browser-verified by the user; this plan is the verify-and-commit step.

Purpose: Ship the fix so the regression introduced by d570449 ("fix(map): lazy-mount preview HLS only when pin popup is open") is closed in a separately-revertible commit. The lazy-mount fix from d570449 stays — only the missing memoization is added.

Output: One commit modifying `apps/web/src/components/map/camera-marker.tsx` with `useMemo<[number, number]>` stabilizing the `position` tuple.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/debug/map-camera-pin-click-collapses-to-group.md
@apps/web/src/components/map/camera-marker.tsx

<interfaces>
<!-- Already in the working tree — confirm before commit. -->

From apps/web/src/components/map/camera-marker.tsx (lines 141-155):
```typescript
const icon = useMemo(
  () => buildMarkerIcon({ status, isRecording, maintenanceMode, name }),
  [status, isRecording, maintenanceMode, name],
);

// Stabilize the position tuple reference across re-renders. react-leaflet's
// updateMarker uses strict reference equality (props.position !== prevProps.position)
// to decide whether to call marker.setLatLng(). Inside a MarkerClusterGroup,
// setLatLng triggers _moveChild's remove+re-add cycle which re-absorbs the
// just-clicked leaf back into its cluster bubble. Memoizing on [latitude, longitude]
// ensures the array reference only changes when coordinates actually change.
const position = useMemo<[number, number]>(
  () => [latitude, longitude],
  [latitude, longitude],
);
```

JSX (line 199-201):
```tsx
<Marker
  ref={markerRef}
  position={position}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify already-applied useMemo position fix and commit atomically</name>
  <files>apps/web/src/components/map/camera-marker.tsx</files>
  <action>
The fix is ALREADY applied to `apps/web/src/components/map/camera-marker.tsx` and is sitting uncommitted in the working tree. Do NOT re-edit the file. Do NOT introduce new changes. The job is: confirm the edit matches the debug-file resolution exactly, run the verification suite, then create one atomic commit attributing the regression to commit d570449.

Steps:

1. Confirm the fix is present in the working tree (no edit needed):
   - Run: `grep -n "useMemo<\[number, number\]>" apps/web/src/components/map/camera-marker.tsx`
     Expected: matches around line 152.
   - Run: `grep -n "position={position}" apps/web/src/components/map/camera-marker.tsx`
     Expected: matches around line 201 (the <Marker> JSX prop).
   - Run: `grep -c "position={\[latitude, longitude\]}" apps/web/src/components/map/camera-marker.tsx`
     Expected: `0` (the inline array literal must NOT be present anywhere).
   - Run: `git diff apps/web/src/components/map/camera-marker.tsx`
     Expected: only two hunks — (a) the new `const position = useMemo<[number, number]>(...)` block with explanatory comment, (b) the `<Marker>` prop swap from `position={[latitude, longitude]}` to `position={position}`. NOTHING else changes.
   - If any of the above checks fail → STOP and surface the discrepancy. Do not commit.

2. Run the verification suite from repo root:
   - `pnpm --filter @sms-platform/web exec tsc --noEmit`
     Expected: "TypeScript: No errors found" (or zero errors output).
   - `pnpm --filter @sms-platform/web test -- --run camera-marker`
     Expected: 8/8 tests pass in `apps/web/src/components/map/__tests__/camera-marker.test.tsx` (or wherever vitest discovers it).

3. Create the atomic commit (only the one file is staged):
   - `git add apps/web/src/components/map/camera-marker.tsx`
   - Commit message (HEREDOC):
     ```
     fix(quick-260426-mth): stabilize CameraMarker position via useMemo to prevent leaf-pin click collapse

     Regression introduced by d570449 ("fix(map): lazy-mount preview HLS only
     when pin popup is open"). That commit added popupOpen useState +
     popupopen/popupclose handlers, which caused CameraMarker to re-render on
     every leaf-pin click. The inline `position={[latitude, longitude]}` array
     literal produced a new reference on every render, so react-leaflet's
     strict-equality check (props.position !== prevProps.position) always
     fired marker.setLatLng() — which inside MarkerClusterGroup triggers
     _moveChild's remove+re-add cycle and re-absorbs the just-revealed leaf
     back into its cluster bubble.

     Fix: memoize the position tuple on [latitude, longitude] so the array
     reference is stable across re-renders that do not change coordinates.
     The lazy-mount HLS behavior from d570449 is preserved untouched.

     Verified:
     - tsc --noEmit clean
     - camera-marker.test.tsx 8/8 passing
     - browser-verified by user (dev mode): leaf-pin click opens preview
       popup and popup stays open

     Debug session: .planning/debug/map-camera-pin-click-collapses-to-group.md
     ```
   - Use `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer per project standard.

4. After commit, run `git log -1 --stat` and confirm exactly one file (`apps/web/src/components/map/camera-marker.tsx`) is in the commit.

DO NOT touch any other files. DO NOT regenerate Prisma. DO NOT run the full test suite — only the camera-marker scope. DO NOT amend, reset, or push.
  </action>
  <verify>
    <automated>cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && grep -q "useMemo<\[number, number\]>" apps/web/src/components/map/camera-marker.tsx && grep -q "position={position}" apps/web/src/components/map/camera-marker.tsx && ! grep -q "position={\[latitude, longitude\]}" apps/web/src/components/map/camera-marker.tsx && pnpm --filter @sms-platform/web exec tsc --noEmit && pnpm --filter @sms-platform/web test -- --run camera-marker</automated>
  </verify>
  <done>
    - `apps/web/src/components/map/camera-marker.tsx` contains `useMemo<[number, number]>` for `position` (line ~152) and the `<Marker>` JSX uses `position={position}` (line ~201)
    - The inline `position={[latitude, longitude]}` literal is absent from the file
    - `tsc --noEmit` passes with zero errors for the web app
    - `camera-marker` vitest scope passes (8/8 tests)
    - Exactly ONE commit was created, touching ONLY `apps/web/src/components/map/camera-marker.tsx`
    - The commit message attributes the regression to commit d570449 and references `.planning/debug/map-camera-pin-click-collapses-to-group.md`
  </done>
</task>

</tasks>

<verification>
Manual sanity check (already performed by user, do not redo unless executor breaks something):
1. Open the map page in the dev browser
2. Click a cluster bubble to expand it
3. Click an individual camera pin
4. Confirm: preview popup opens AND stays open (does NOT collapse back into the cluster)

Automated checks captured in the task `<verify>` block.
</verification>

<success_criteria>
- Regression fix for d570449 is committed atomically as a single-file change to `apps/web/src/components/map/camera-marker.tsx`
- Working tree is clean for that file after commit (`git status --short apps/web/src/components/map/camera-marker.tsx` returns empty)
- Typecheck and camera-marker tests pass
- Commit message clearly attributes the regression to d570449 and references the debug file
</success_criteria>

<output>
After completion, create `.planning/quick/260426-mth-fix-map-camera-pin-click-collapses-to-gr/260426-mth-SUMMARY.md` capturing: commit SHA, the one-line root cause, and a pointer to the debug file.
</output>
