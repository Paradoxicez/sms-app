---
phase: 11-camera-management
plan: 03
subsystem: camera-ui
tags: [view-stream, sheet, hls-player, tabs, policies, activity, redirect]
dependency_graph:
  requires: [CameraRow-type, CamerasDataTable, HlsPlayer, ResolvedPolicyCard, AuditLogDataTable]
  provides: [ViewStreamSheet, camera-detail-redirect]
  affects: [tenant-cameras-page]
tech_stack:
  added: []
  patterns: [slide-in-sheet-with-tabs, detail-page-to-redirect]
key_files:
  created:
    - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
  modified:
    - apps/web/src/components/pages/tenant-cameras-page.tsx
    - apps/web/src/app/app/cameras/[id]/page.tsx
    - apps/web/src/app/admin/cameras/[id]/page.tsx
decisions:
  - Stream URL copy uses window.location.origin prefix for full URL
  - Activity tab uses search param filter (not dedicated cameraId param) for audit log
  - Camera detail pages replaced with redirects instead of deletion for safe bookmarked URLs
metrics:
  duration: 143s
  completed: "2026-04-17T09:23:27Z"
  tasks_completed: 2
  tasks_total: 3
  files_created: 1
  files_modified: 3
requirements-completed: []
---

# Phase 11 Plan 03: View Stream Sheet & Detail Page Removal Summary

ViewStreamSheet slide-in at 50% width with Preview (HlsPlayer + info grid), Policies (ResolvedPolicyCard), and Activity (AuditLogDataTable) tabs; camera detail pages replaced with redirects.

## What Was Built

### view-stream-sheet.tsx (created)
- ViewStreamSheet component with `camera`, `open`, `onOpenChange` props
- SheetContent with `side="right"`, `w-full md:w-1/2 sm:max-w-none` (overrides default max-width)
- Internal ViewStreamContent component re-renders when camera prop changes (D-20)
- Header shows camera name and site > project breadcrumb
- 3 tabs via base-ui Tabs: Preview, Policies, Activity
- Preview tab: HlsPlayer (autoPlay, live mode) + camera info grid (name, status badge, site, project, codec, resolution, stream URL with copy button)
- Policies tab: ResolvedPolicyCard with cameraId
- Activity tab: AuditLogDataTable with `resource=camera&search={cameraId}` filter
- Stream URL copy button writes full URL to clipboard and shows toast

### tenant-cameras-page.tsx (modified)
- Added ViewStreamSheet import and render
- Derived `selectedCamera` from `cameras.find(c => c.id === selectedCameraId)`
- Sheet opens when `selectedCameraId` is set, closes on `onOpenChange(false)`
- Removed `void selectedCameraId` suppression from Plan 01

### Camera detail page redirects
- `/app/cameras/[id]` now redirects to `/app/cameras`
- `/admin/cameras/[id]` now redirects to `/admin/cameras`
- Old 25KB detail page code removed (729 lines deleted)

## Pending

**Task 3 (checkpoint:human-verify)** is pending human verification of the complete camera management flow across all 3 plans.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 8ae7120 | Create ViewStreamSheet and wire into page orchestrator |
| 2 | f543273 | Replace camera detail pages with redirects |

## Deviations from Plan

None - plan executed exactly as written.

## Notes

3 external files still link to camera detail pages (will redirect safely):
- `components/map/camera-popup.tsx` -> `/admin/cameras/${id}`
- `components/pages/tenant-recordings-page.tsx` -> `/app/cameras/${cameraId}?tab=recordings`
- `components/dashboard/camera-status-table.tsx` -> `/admin/cameras/${camera.id}`

These links will now redirect to the cameras list page. A future cleanup can update them to use the sheet pattern instead.

## Self-Check: PASSED
