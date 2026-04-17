---
phase: 12-recordings
plan: 02
subsystem: recordings-datatable-page
tags: [frontend, datatable, recordings, filters, bulk-delete, download]
dependency_graph:
  requires: [cross-camera-query-endpoint, bulk-delete-endpoint, download-endpoint, format-utils, recording-status-badge]
  provides: [recordings-columns, recordings-data-table, recordings-page]
  affects: [recordings-page, tenant-recordings-page]
tech_stack:
  added: []
  patterns: [url-query-param-state, server-side-datatable, factory-columns, faceted-filters, bulk-delete-dialog]
key_files:
  created:
    - apps/web/src/app/app/recordings/components/recordings-columns.tsx
    - apps/web/src/app/app/recordings/components/recordings-data-table.tsx
  modified:
    - apps/web/src/app/app/recordings/page.tsx
decisions:
  - "Used base-ui render prop pattern for Button+Link (not Radix asChild)"
  - "Checkbox uses separate checked/indeterminate props (base-ui pattern)"
  - "Filter options fetched once on mount from /api/cameras, /api/projects, /api/sites"
  - "refetchCounter pattern used to trigger re-fetches after delete mutations"
metrics:
  duration: 177s
  completed: "2026-04-17T14:21:14Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 12 Plan 02: Recordings DataTable Page with Columns, Filters, Bulk Delete, and Download Summary

Recordings DataTable page with 10 columns (select, camera link, project, site, date, time range, duration, size, status badge, actions), faceted filters for camera/project/site/status, DateRangePicker, URL query param state, server-side pagination, bulk delete with AlertDialog, single delete with AlertDialog, and presigned URL download via window.open.

## Task Results

### Task 1: Column definitions with row actions, status badge, and camera link
**Commit:** `97b5d28`
**Status:** Complete

- Created `recordings-columns.tsx` with `createRecordingsColumns(callbacks)` factory function
- 10 columns in order: select checkbox, camera name (Link to `/app/cameras/{id}?tab=recordings`), project, site, date, time range, duration, size, status (RecordingStatusBadge), actions (Download/Delete)
- Camera name styled as `text-primary hover:underline font-medium`
- Select all checkbox with `aria-label="Select all recordings"`, per-row with camera name and time
- Uses base-ui Checkbox pattern (separate `checked`/`indeterminate` props)
- Imports shared `formatDuration`, `formatSize`, `RecordingStatusBadge`

### Task 2: Recordings DataTable wrapper with toolbar, filters, URL state, bulk delete, and page wiring
**Commit:** `17f6b7c`
**Status:** Complete

- Created `recordings-data-table.tsx` with `RecordingsDataTable` component
- URL query param state via `useSearchParams`/`useRouter` for all filters (search, camera, project, site, status, from, to, page, pageSize)
- Data fetching from `GET /api/recordings` with all params mapped
- Filter options fetched from `/api/cameras`, `/api/projects`, `/api/sites`
- FacetedFilter configs for camera, project, site, status
- DateRangePicker for date range filtering
- Search input debounced 300ms
- Bulk delete with AlertDialog confirmation, partial failure toast handling
- Single delete with AlertDialog confirmation
- Download via presigned URL + `window.open`
- Server-side pagination with `pageCount`
- Empty states for no-data and filtered-no-results
- Loading state passed to DataTable
- Filter changes reset page to 1 (Pitfall 6 prevention)
- Updated `page.tsx` to import `RecordingsDataTable` wrapped in `Suspense` with feature gate

## Verification Results

- TypeScript compilation: zero errors (`npx tsc --noEmit`)
- All acceptance criteria met for both tasks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Checkbox indeterminate pattern**
- **Found during:** Task 1
- **Issue:** Plan used Radix-style `checked={boolean | "indeterminate"}` but project uses base-ui Checkbox with separate `checked` and `indeterminate` props
- **Fix:** Used `checked={table.getIsAllPageRowsSelected()}` and `indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}`
- **Files modified:** recordings-columns.tsx
- **Commit:** 97b5d28

**2. [Rule 1 - Bug] Fixed Button+Link pattern (asChild vs render prop)**
- **Found during:** Task 2
- **Issue:** Plan used `<Button asChild><Link>` but project uses base-ui render prop pattern, not Radix asChild
- **Fix:** Used `<Button render={<Link href="..." />}>` instead
- **Files modified:** recordings-data-table.tsx
- **Commit:** 17f6b7c

## Self-Check: PASSED

All created files verified on disk. Both commit hashes confirmed in git log.
