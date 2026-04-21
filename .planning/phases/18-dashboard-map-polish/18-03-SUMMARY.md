---
phase: 18-dashboard-map-polish
plan: 03
subsystem: web/map
tags: [leaflet, react-leaflet-cluster, svg, divIcon, xss, phase-18, map-marker]

# Dependency graph
requires:
  - phase: 15-maintenance-mode
    provides: schema fields isRecording / maintenanceMode / maintenanceEnteredBy / maintenanceEnteredAt / lastOnlineAt / retentionDays (canonical spelling — used verbatim in MapCamera type + /api/cameras mapping)
  - phase: 18-00
    provides: camera-marker.test.tsx + camera-map-inner.test.tsx it.todo stubs (flipped here) + escape-html as implicit security surface
provides:
  - escapeHtml helper at apps/web/src/lib/escape-html.ts (exported for reuse across any raw-HTML interpolation site)
  - buildMarkerIcon pure helper (exported from camera-marker.tsx) — testable SVG teardrop + badge generator
  - createClusterIcon + ClusterLike (exported from camera-map-inner.tsx) — testable worst-status cluster icon generator
  - Extended MapCamera type with 6 Phase 15 + popup fields
  - CameraPopup prop interface extended (body refactor is Plan 04; type stability for Plan 03)
  - Tenant map page wires onViewRecordings / onToggleMaintenance / onOpenDetail handlers (Plan 04 consumes them in popup body)
  - cameraStatus forwarded into L.Marker options for cluster iconCreateFunction read (D-16 data plumbing)
affects: [18-04]  # Plan 04 imports CameraPopup props added here + consumes the wired handlers

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function icon generation: both buildMarkerIcon and createClusterIcon accept plain args and return L.DivIcon so jsdom-unfriendly react-leaflet mounting is avoided in tests"
    - "Schema-spelling guard: grep 'maintenanceEnabledBy' over changed files must return 0 (RESEARCH Pitfall 5 — Phase 15 renamed from Enabled → Entered)"
    - "XSS mitigation via escapeHtml in L.divIcon HTML — camera names flow into SVG aria-label through escape"
    - "Cluster worst-status via forwarded L.Marker options.cameraStatus (typed via ts-expect-error on react-leaflet <Marker> prop — library does not expose a typed passthrough)"
    - "Test-harness symlinks to main repo node_modules (matches Plan 00 pattern) — not committed"

key-files:
  created:
    - apps/web/src/lib/escape-html.ts
    - apps/web/src/lib/escape-html.test.ts
  modified:
    - apps/web/src/components/map/camera-marker.tsx
    - apps/web/src/components/map/camera-marker.test.tsx
    - apps/web/src/components/map/camera-popup.tsx
    - apps/web/src/components/map/camera-map.tsx
    - apps/web/src/components/map/camera-map-inner.tsx
    - apps/web/src/components/map/camera-map-inner.test.tsx
    - apps/web/src/components/pages/tenant-map-page.tsx

key-decisions:
  - "buildMarkerIcon extracted as exported pure function — tests drive the icon HTML directly via regex / substring assertions, avoiding react-leaflet + jsdom fragility for SVG + class toggling"
  - "createClusterIcon typed against a narrow ClusterLike shape (getAllChildMarkers + getChildCount) rather than L.MarkerCluster — lets tests mock without importing Leaflet's full type surface; the same shape matches the runtime L.MarkerCluster ducktyped"
  - "cameraStatus passed via ts-expect-error on <Marker> — react-leaflet's Marker type doesn't declare arbitrary passthrough, but L.Marker.options does accept extras. One-liner escape hatch is cheaper than a parallel wrapper component"
  - "Cluster refresh test marked it.skip with VALIDATION.md pointer — Leaflet's MarkerClusterGroup refresh lifecycle is not jsdom-emulable (RESEARCH Assumption A4). 3 pure-function assertions cover the worst-status mapping; the lifecycle concern is a manual check"
  - "/admin/map is a redirect to /app/map (page.tsx:9 useRouter.replace) — no separate admin handler wiring needed. Saves a parallel code path that would drift"
  - "CameraPopup prop interface extended in Plan 03 (body refactor is Plan 04) — surfacing the type early prevents Plan 04 from doing a prop-threading refactor on top of a behavior refactor"
  - "Amber-status pins get dark outline on white camera icon — UI-SPEC line 500 required 3:1 contrast; white-on-amber is 2.5:1, so a 1px rgba(0,0,0,0.4) outline on the Lucide Camera path brings the AA ratio"

patterns-established:
  - "Any L.divIcon HTML interpolation MUST escape user-derived strings via @/lib/escape-html (set precedent for Plan 04+ popup refactors)"
  - "When a test file needs to assert over a Leaflet divIcon shape, extract the generator into a pure exported helper instead of rendering <Marker> in jsdom"
  - "Manual-only Leaflet lifecycle assertions go into VALIDATION.md with an it.skip pointer in the corresponding test file (keeps the stub list honest + auditable)"

requirements-completed: []  # UI-06 closes when Plan 04 (popup) + Plan 05 (popup preview) land — Plan 03 ships the marker + cluster slice

# Metrics
duration: ~35 min
completed: 2026-04-21
---

# Phase 18 Plan 03: Map Marker Refactor + XSS Fix Summary

**Teardrop SVG marker (28×36) + recording/maintenance badges + cluster worst-status coloring + HTML-escaped camera names shipped; Plan 00 stubs flipped to 15 passing assertions + 1 documented manual-only skip.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-21T15:11:52Z (branch-base verify)
- **Completed:** 2026-04-21T15:19:16Z
- **Tasks:** 2 (both TDD RED→GREEN)
- **Files created:** 2 (escape-html.ts + escape-html.test.ts)
- **Files modified:** 7 (camera-marker, camera-marker.test, camera-popup, camera-map, camera-map-inner, camera-map-inner.test, tenant-map-page)

## Accomplishments

- **D-13 — Teardrop SVG marker.** Replaced the 12×12 colored-dot `L.divIcon` with a 28×36 SVG teardrop pin (anchor at `[14, 36]`, popup anchor `[0, -34]`) housing a white Lucide Camera icon centered via `translate(7 7) scale(0.583)`. Fill color preserves the existing `STATUS_COLORS` palette so status → color parity is unchanged.
- **D-14 — Badge overlays.** Recording cameras now show an 8×8 red dot (`#ef4444`, `motion-safe:animate-pulse`) at `top:-2px;right:-2px`. Maintenance cameras show a 10×10 gray bubble (`#6b7280`) with a 6×6 white Lucide Wrench SVG at `bottom:-2px;right:-2px`. Both badges are conditional HTML — they don't render when their flag is false, so zero DOM cost for the common case.
- **D-15 — Reconnecting pulse preserved.** The pin keeps its `camera-marker-icon--reconnecting` class toggle when status is `reconnecting`, so the existing pulse CSS still fires.
- **D-16 — Cluster worst-status color.** `MarkerClusterGroup` now receives `iconCreateFunction={createClusterIcon}`. The helper reads `options.cameraStatus` from each child marker (forwarded via `<Marker cameraStatus={status}>` in `camera-marker.tsx`) and picks the worst status: any `offline` → red; else any `degraded`/`reconnecting` → amber; else green. The 36×36 bubble uses 90% fill opacity with a 3px white 70%-opacity ring and a white semibold count text. An `aria-label` describes the cluster contents.
- **T-18-XSS-MARKER mitigation.** All camera-name interpolation inside `L.divIcon` HTML flows through `escapeHtml()`. The aria-label reads `Camera ${escapedName} — status ${escapedStatus}`; injecting `<script>alert(1)</script>` as a name produces `&lt;script&gt;alert(1)&lt;/script&gt;` — verified by unit test `T-18-XSS-MARKER`.
- **MapCamera type extended** with all 6 Phase 15 + popup fields so `/api/cameras` response flows end-to-end through `tenant-map-page` → `CameraMap` → `CameraMapInner` → `CameraMarker` → `CameraPopup` without any more refactors in Plan 04. CameraPopup body still uses only the original fields (id/name/status/viewerCount) — Plan 04 owns the popup body refactor.
- **Tenant map handlers wired.** Added `useRouter`-backed `handleViewRecordings` (→ `/app/recordings?camera=:id`), `handleToggleMaintenance` (`POST`/`DELETE /api/cameras/:id/maintenance` with toast feedback + refresh), and `handleOpenDetail` (→ `/app/cameras/:id`). `handleViewStream` now uses the actual `isRecording` + `maintenanceMode` values from the MapCamera record (previously hardcoded `false`).
- **15 tests passing + 1 manual-only skip.** `camera-marker.test.tsx` (8 specs), `camera-map-inner.test.tsx` (3 + 1 skip), `escape-html.test.ts` (4 specs). `pnpm build` green.

## Task Commits

1. **Task 1 RED — failing tests for marker + escapeHtml** — `152e96f` (test, 2 files)
2. **Task 1 GREEN — teardrop SVG + badges + XSS escape + popup prop plumb** — `41c0b14` (feat, 3 files)
3. **Task 2 RED — failing tests for cluster iconCreateFunction** — `d0d3f37` (test, 1 file)
4. **Task 2 GREEN — cluster helper + MapCamera extension + tenant-map-page wiring** — `1299018` (feat, 3 files)

## Files Created/Modified

### Created (2 files)
- `apps/web/src/lib/escape-html.ts` — `escapeHtml(str)` helper; maps `& < > " '` → HTML entities; null/undefined safe.
- `apps/web/src/lib/escape-html.test.ts` — 4 specs covering char-by-char mapping, mixed input, null/undefined, safe-string identity.

### Modified (7 files)
- `apps/web/src/components/map/camera-marker.tsx` — Teardrop SVG + badges + `cameraStatus` forward + extended props + popup prop-threading + pure `buildMarkerIcon` export.
- `apps/web/src/components/map/camera-marker.test.tsx` — 8 `it.todo` stubs flipped to real assertions exercising `buildMarkerIcon`.
- `apps/web/src/components/map/camera-popup.tsx` — Prop interface extended with Phase 18 fields + 3 callbacks (body unchanged — Plan 04 consumes).
- `apps/web/src/components/map/camera-map.tsx` — `MapCamera` + `CameraMapProps` extended; props forwarded to inner.
- `apps/web/src/components/map/camera-map-inner.tsx` — `createClusterIcon` + `ClusterLike` exports; `iconCreateFunction` wired to `MarkerClusterGroup`; all extended camera fields + callbacks threaded into `<CameraMarker>`.
- `apps/web/src/components/map/camera-map-inner.test.tsx` — 4 `it.todo` stubs flipped; 3 assertions + 1 intentional `it.skip` (manual-only per VALIDATION).
- `apps/web/src/components/pages/tenant-map-page.tsx` — `useRouter` import; 6 extra fields in `/api/cameras` mapping; 3 new handlers; `handleViewStream` uses real isRecording/maintenanceMode; handlers passed to `<CameraMap>`.

## Stub → Requirement Closure

Plan 00 flagged these Plan 04 stubs; Plan 03 closes them (naming is a Plan 00 mapping nit — marker/cluster stubs were assigned to Plan 04 in the earlier map, but the 18-phase plan explicitly routes D-13..D-16 to Plan 03).

| Plan-00 stub | Closed-in | Test result |
|--------------|-----------|-------------|
| `teardrop SVG with iconSize [28, 36]` (D-13) | 18-03 | PASS |
| `pin fill = green #22c55e when status=online` | 18-03 | PASS |
| `pin fill = red #ef4444 when status=offline` | 18-03 | PASS |
| `pin fill = amber #f59e0b when status=degraded/reconnecting` | 18-03 | PASS |
| `recording red dot 8x8 upper-right` (D-14) | 18-03 | PASS |
| `wrench badge 10x10 gray lower-right` (D-14) | 18-03 | PASS |
| `recording dot has animate-pulse class` | 18-03 | PASS |
| `T-18-XSS-MARKER: escapes HTML in camera name` | 18-03 | PASS |
| `iconCreateFunction returns red bubble when any child offline` (D-16) | 18-03 | PASS |
| `iconCreateFunction returns amber bubble when worst child is degraded/reconnecting` | 18-03 | PASS |
| `iconCreateFunction returns green bubble when all online/connecting` | 18-03 | PASS |
| `cluster refresh triggered on camera status change` | 18-03 | SKIP (manual-only — VALIDATION.md §Cluster refresh) |

## Decisions Made

See YAML front-matter `key-decisions` above. Most load-bearing:

1. **Pure-helper extraction.** Both `buildMarkerIcon` and `createClusterIcon` are exported pure functions taking plain args and returning `L.DivIcon`. Tests assert over `icon.options.html` with regex/substring, avoiding the jsdom-flaky path of mounting `<Marker>` in a React tree without a real MapContainer. This also makes the icon generators trivially memoizable.
2. **Narrow `ClusterLike` interface.** The test doesn't need to import `L.MarkerCluster` — it only needs `getAllChildMarkers()` + `getChildCount()`. Exporting a structural type lets tests mock without pulling the Leaflet type surface, and the runtime matches ducktyped.
3. **Cluster refresh is a manual-only check.** Marker cluster re-icon on child-status-change is a Leaflet lifecycle behavior not emulable in jsdom (RESEARCH Assumption A4). The `it.skip` with a VALIDATION.md pointer is honest about scope.
4. **Admin map redirect.** `apps/web/src/app/admin/map/page.tsx` is a thin `useRouter.replace('/app/map')` component — no separate handler wiring needed.
5. **CameraPopup props extended now, body refactored in Plan 04.** Plan 03 pays the cost of an early type extension so Plan 04 can focus on body layout without also threading props up through CameraMap/CameraMapInner/CameraMarker/Popup.

## Deviations from Plan

Minor — all Rule 3 (blocking infra) or scope-consistent:

1. **[Rule 3 — Blocking] node_modules symlinks** (not committed). The worktree has no `node_modules` so `pnpm test` and `pnpm build` fail without them. Symlinked `apps/web/node_modules` and repo-root `node_modules` to the main repo (same approach Plan 00 used). These are gitignored test-harness state.
2. **[Scope-consistent] CameraPopup props extended in Plan 03.** The plan's Task 1 action step 2 bullet says "CameraPopup API refactor itself is Plan 04 — this plan passes the props through so Plan 04's new CameraPopup signature is satisfied." That requires Plan 03 to add the new props to CameraPopupProps so the type check passes when CameraMarker passes them down — done, body unchanged. No deviation from plan intent; just worth calling out so Plan 04 doesn't redo the type work.
3. **[Scope-consistent] Amber-status icon outline.** Plan action step 2 says to add a `stroke="rgba(0,0,0,0.4)" stroke-width="1"` outline on the camera-icon group when status is degraded/reconnecting — implemented exactly. UI-SPEC line 500 required 3:1 contrast on amber backgrounds; verified visually.
4. **[Doc only] `it.todo` comment reference.** Both test files have a docstring comment that mentions "Plan 00 left N `it.todo` placeholders" as context. The grep-based acceptance criterion for `it\.todo` counts these, but they are comments — the test files contain zero active `.todo()` calls. Confirmed via content grep.

No Rule 1 (bugs) or Rule 2 (critical missing) issues triggered. No Rule 4 (architectural) decisions needed.

## Issues Encountered

- **Initial TypeScript drift during wiring.** The first pass of `camera-map-inner.tsx` passed the extended camera fields + new callbacks to `<CameraMarker>` before `CameraMarker`'s prop interface was extended, which failed the type check. Fixed by updating `camera-marker.tsx` interface first in Task 1, then wiring fields in Task 2. Commits ordered so each individually type-checks.
- **No other issues.** Both vitest runs green on first GREEN attempt. `pnpm build` green on first run.

## Known Stubs

None in production code. Test-side:
- `apps/web/src/components/map/camera-map-inner.test.tsx` retains one `it.skip` with an explicit manual-only pointer per RESEARCH Assumption A4 (Leaflet cluster-refresh lifecycle requires a real map).
- `apps/web/src/components/map/camera-popup.test.tsx` — 13 `it.todo` stubs remain; Plan 05 owns them (per Plan 00 map).

CameraPopup body still uses only 4 of the extended props (id, name, status, viewerCount). The remaining 6 fields + 3 callbacks are threaded through and ready for Plan 04's popup-body refactor — they are NOT runtime stubs (no placeholder data is rendered). The marker plan's deliverable is the pin + cluster + data plumbing; Plan 04 builds the popup body that consumes the plumbed props.

## User Setup Required

None.

## Next Phase Readiness

- **Plan 04 (popup refactor)** is unblocked and has a clean interface to work against:
  - All 9 new popup props (6 data + 3 callbacks) are already threaded `tenant-map-page` → `CameraMap` → `CameraMapInner` → `CameraMarker` → `<Popup>` → `<CameraPopup>`.
  - `handleViewRecordings` / `handleToggleMaintenance` / `handleOpenDetail` wired and navigate/mutate correctly — Plan 04 only needs to render buttons that call them.
  - Popup dimensions already updated to `maxWidth={320} minWidth={280}` per D-22.
  - Camera data (isRecording, maintenanceMode, lastOnlineAt, retentionDays, maintenanceEnteredBy/At) flows from `/api/cameras` through the mapping.
- **Plan 05 (popup preview)** independent of this plan — no new blockers.

No open issues. Wave 2 marker slice landed clean.

## Threat Flags

None. The plan's `<threat_model>` lists the marker surface; all mitigate-disposition threats were addressed (T-18-XSS-MARKER via `escapeHtml`; T-18-XSS-CLUSTER-BUBBLE non-issue — only enum/number values interpolated into cluster aria-label). No new trust boundaries introduced.

## Self-Check: PASSED

**File existence checks:**
- `apps/web/src/lib/escape-html.ts` — FOUND
- `apps/web/src/lib/escape-html.test.ts` — FOUND
- `apps/web/src/components/map/camera-marker.tsx` — FOUND (modified)
- `apps/web/src/components/map/camera-marker.test.tsx` — FOUND (modified)
- `apps/web/src/components/map/camera-popup.tsx` — FOUND (modified)
- `apps/web/src/components/map/camera-map.tsx` — FOUND (modified)
- `apps/web/src/components/map/camera-map-inner.tsx` — FOUND (modified)
- `apps/web/src/components/map/camera-map-inner.test.tsx` — FOUND (modified)
- `apps/web/src/components/pages/tenant-map-page.tsx` — FOUND (modified)

**Commit existence checks:**
- `152e96f` — FOUND in `git log`
- `41c0b14` — FOUND in `git log`
- `d0d3f37` — FOUND in `git log`
- `1299018` — FOUND in `git log`

**Acceptance-criteria checks:**
- `escape-html.ts` exports escapeHtml — FOUND
- `camera-marker.tsx` `iconSize: [28, 36]` — count 1 (>=1) — FOUND
- `camera-marker.tsx` `iconAnchor: [14, 36]` — count 1 (>=1) — FOUND
- `camera-marker.tsx` `escapeHtml(` calls — count 2 (>=1) — FOUND
- `camera-marker.tsx` `viewBox="0 0 28 36"` — count 1 (>=1) — FOUND
- `camera-marker.tsx` `isRecording` — count 8 (>=2) — FOUND
- `camera-marker.tsx` `maintenanceMode` — count 8 (>=2) — FOUND
- `camera-marker.tsx` `animate-pulse` — count 1 (>=1) — FOUND
- `camera-marker.tsx` `cameraStatus={status}` — count 1 (>=1) — FOUND
- `camera-marker.tsx` `maxWidth={320}` — count 1 (>=1) — FOUND
- `camera-marker.tsx` `minWidth={280}` — count 1 (>=1) — FOUND
- `camera-marker.tsx` `export function buildMarkerIcon` — count 1 (>=1) — FOUND
- `camera-marker.test.tsx` active `it.todo` calls — 0 (expected 0; single comment match is in docstring) — FOUND
- `camera-map.tsx` `isRecording?: boolean` — 1 (>=1) — FOUND
- `camera-map.tsx` `maintenanceEnteredBy?: string | null` — 1 (>=1) — FOUND
- `camera-map.tsx` `maintenanceEnabledBy\|maintenanceEnabledAt` — 0 (expected 0) — FOUND
- `camera-map.tsx` `onViewRecordings|onToggleMaintenance|onOpenDetail` — count 9 — FOUND
- `camera-map-inner.tsx` `export function createClusterIcon` — 1 (>=1) — FOUND
- `camera-map-inner.tsx` `iconCreateFunction={createClusterIcon}` — 1 (>=1) — FOUND
- `camera-map-inner.tsx` `cameraStatus` reads — 2 (>=1) — FOUND
- `tenant-map-page.tsx` `isRecording: (c.isRecording as boolean)` — 1 (>=1) — FOUND
- `tenant-map-page.tsx` `handleViewRecordings|handleToggleMaintenance|handleOpenDetail` — 6 (>=3) — FOUND
- `camera-map-inner.test.tsx` active `it.todo` — 0 (comment-only match in docstring) — FOUND

**Vitest runs:**
- `pnpm test -- --run src/components/map/camera-marker.test.tsx` — 8 passed
- `pnpm test -- --run src/components/map/camera-map-inner.test.tsx` — 3 passed, 1 skipped
- `pnpm test -- --run src/lib/escape-html.test.ts` — 4 passed
- `pnpm test -- --run src/components/map/` combined — 15 passed + 1 skipped + 13 todo (camera-popup.test.tsx reserved for Plan 05)

**Build:**
- `pnpm build` — PASS (`Compiled successfully in 8.5s`, 50 pages static-generated)

---
*Phase: 18-dashboard-map-polish*
*Plan: 03 (Wave 2)*
*Completed: 2026-04-21*
