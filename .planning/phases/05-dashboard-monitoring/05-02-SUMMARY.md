---
phase: 05-dashboard-monitoring
plan: 02
subsystem: ui
tags: [leaflet, react-leaflet, map, hls.js, marker-clustering, openstreetmap, shadcn-chart]

# Dependency graph
requires:
  - phase: 02-streaming-core
    provides: Camera API with lat/lng fields, useCameraStatus Socket.IO hook
  - phase: 05-dashboard-monitoring/05-00
    provides: Test stubs for Phase 5 features
provides:
  - Map View page at /admin/map with Leaflet, OpenStreetMap tiles, camera markers
  - Marker clustering via react-leaflet-cluster
  - HLS preview popup with hls.js in camera marker popups
  - Sidebar navigation Monitoring section (Dashboard, Map View, Audit Log)
  - useFeatureCheck hook for client-side feature flag checking
  - shadcn chart component for future dashboard charts
affects: [05-03, 05-04, 05-05]

# Tech tracking
tech-stack:
  added: [leaflet, react-leaflet, react-leaflet-cluster, leaflet.markercluster, recharts (via shadcn chart)]
  patterns: [dynamic import with ssr:false for Leaflet, DivIcon for status-colored markers, feature-gated pages]

key-files:
  created:
    - apps/web/src/components/map/camera-map.tsx
    - apps/web/src/components/map/camera-map-inner.tsx
    - apps/web/src/components/map/camera-marker.tsx
    - apps/web/src/components/map/camera-popup.tsx
    - apps/web/src/app/admin/map/page.tsx
    - apps/web/src/hooks/use-feature-check.ts
    - apps/web/src/components/ui/chart.tsx
  modified:
    - apps/web/package.json
    - apps/web/src/components/sidebar-nav.tsx

key-decisions:
  - "Dynamic import with ssr:false wrapper pattern for Leaflet (Next.js SSR incompatibility)"
  - "DivIcon with inline styles for status-colored markers (avoids external icon assets)"
  - "useFeatureCheck defaults to enabled on API failure (graceful degradation)"
  - "Bangkok as default map center when no cameras have locations"

patterns-established:
  - "SSR-safe map wrapper: camera-map.tsx (dynamic) -> camera-map-inner.tsx (client-only)"
  - "Feature-gated pages: useFeatureCheck hook + empty state with upgrade message"
  - "Map marker pattern: L.divIcon with status color + Popup with component content"

requirements-completed: [DASH-03]

# Metrics
duration: 4min
completed: 2026-04-12
---

# Phase 05 Plan 02: Map View Frontend Summary

**Leaflet map page at /admin/map with status-colored camera markers, MarkerClusterGroup clustering, HLS popup preview via hls.js, and Monitoring sidebar navigation section**

## Performance

- **Duration:** 4 min (233s)
- **Started:** 2026-04-12T09:25:22Z
- **Completed:** 2026-04-12T09:29:15Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Map View page renders Leaflet map with OpenStreetMap tiles at /admin/map
- Camera markers colored by status (green/red/amber/blue) with clustering for nearby cameras
- Popup shows camera name, status badge, viewer count, and mini HLS preview (via hls.js)
- Feature toggle gating with empty state when MAP feature disabled
- Sidebar navigation updated with Monitoring section (Dashboard, Map View, Audit Log)
- shadcn chart component installed for future dashboard use

## Task Commits

Each task was committed atomically:

1. **Task 1: Install frontend dependencies + add shadcn chart + update sidebar nav** - `4f35d63` (feat)
2. **Task 2: Map View page with Leaflet, markers, clustering, and HLS popup** - `56162a0` (feat)

## Files Created/Modified
- `apps/web/src/components/map/camera-map.tsx` - SSR-safe wrapper with dynamic import
- `apps/web/src/components/map/camera-map-inner.tsx` - Leaflet MapContainer with TileLayer, MarkerClusterGroup, auto-fit bounds
- `apps/web/src/components/map/camera-marker.tsx` - Custom DivIcon markers with status colors
- `apps/web/src/components/map/camera-popup.tsx` - Popup with HLS preview, status badge, viewer count, details link
- `apps/web/src/app/admin/map/page.tsx` - Map View page with feature gate and empty states
- `apps/web/src/hooks/use-feature-check.ts` - Client-side feature flag check hook
- `apps/web/src/components/ui/chart.tsx` - shadcn chart component (recharts wrapper)
- `apps/web/package.json` - Added leaflet, react-leaflet, react-leaflet-cluster, leaflet.markercluster
- `apps/web/src/components/sidebar-nav.tsx` - Added Monitoring nav section with 3 items

## Decisions Made
- Dynamic import with `ssr: false` for Leaflet components (Leaflet requires `window` object)
- DivIcon with inline CSS for status markers (avoids needing external marker icon assets)
- useFeatureCheck defaults to `enabled: true` on API failure for graceful degradation
- Bangkok (13.7563, 100.5018) as default map center when no cameras have location data
- HLS preview uses lightweight config (maxBufferLength: 5) for popup mini player

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed L.Icon.Default prototype deletion TypeScript error**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** `delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl` caused TS2352 error
- **Fix:** Changed cast to `any` type with eslint-disable comment
- **Files modified:** apps/web/src/components/map/camera-map-inner.tsx
- **Verification:** `npx tsc --noEmit` passes (only pre-existing webhook error remains)
- **Committed in:** 56162a0 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal - standard Leaflet+TypeScript compatibility fix. No scope creep.

## Issues Encountered
- Pre-existing TypeScript error in `apps/web/src/app/admin/developer/webhooks/[id]/page.tsx` (TS2353) -- out of scope, logged as known issue

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Map View page complete, ready for visual verification
- Sidebar Monitoring section provides navigation to Dashboard and Audit Log pages (built in Plans 03-04)
- shadcn chart component ready for Dashboard stats page (Plan 03)

---
*Phase: 05-dashboard-monitoring*
*Completed: 2026-04-12*
