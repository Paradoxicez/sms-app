---
phase: 11-camera-management
plan: 01
subsystem: camera-ui
tags: [datatable, camera, columns, quick-actions, form-dialog, page-orchestrator]
dependency_graph:
  requires: []
  provides: [CameraRow-type, createCamerasColumns, CamerasDataTable, camera-form-edit-mode]
  affects: [tenant-cameras-page, camera-form-dialog]
tech_stack:
  added: []
  patterns: [useReactTable-direct, column-factory, faceted-filters, view-toggle]
key_files:
  created:
    - apps/web/src/app/admin/cameras/components/cameras-columns.tsx
    - apps/web/src/app/admin/cameras/components/cameras-data-table.tsx
  modified:
    - apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
    - apps/web/src/components/pages/tenant-cameras-page.tsx
decisions:
  - Used useReactTable directly instead of DataTable wrapper for Plan 02 card view access
  - EmbedCodeDialog wired with cameraId prop matching existing interface
metrics:
  duration: 207s
  completed: "2026-04-17T09:13:07Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 11 Plan 01: Camera DataTable & Form Dialog Summary

Camera DataTable with sortable columns, faceted filters, quick actions, view toggle, and extended form dialog supporting create/edit with stream profile selection.

## What Was Built

### cameras-columns.tsx
- Exported `CameraRow` interface with all camera fields including `isRecording` and `codecInfo`
- `createCamerasColumns` factory producing 8 columns: Status (dot indicator), Name, Project, Site, Codec, Resolution, Created (relative time), Actions
- Status column uses `CameraStatusDot` component with sortable header
- Project and Site columns use `accessorFn` with custom `filterFn` for faceted filtering
- Codec and Resolution columns marked `enableSorting: false`
- Created column uses `formatDistanceToNow` from date-fns with `title` attribute for full datetime
- Actions column renders 5 quick actions via `DataTableRowActions`: Edit, View Stream, Start/Stop Recording (dynamic label based on `isRecording`), Embed Code, Delete

### cameras-data-table.tsx
- Uses `useReactTable` directly (not `<DataTable>` wrapper) so Plan 02 can access `table.getFilteredRowModel()` for card view
- 3 faceted filters: Status (5 fixed options), Project (dynamic from data), Site (dynamic from data)
- Search on "name" column with placeholder
- View toggle buttons (TableProperties/LayoutGrid icons) in toolbar
- "Add Camera" button in toolbar
- Table view renders with flexRender pattern matching data-table.tsx
- Card view placeholder div ready for Plan 02
- Empty state with CameraIcon, heading, and Add Camera action
- Loading state with skeleton rows

### camera-form-dialog.tsx (extended)
- Added optional `camera` prop for edit mode
- Edit mode: pre-fills all fields, uses `PATCH /api/cameras/{id}`, title "Edit Camera", button "Save Changes"
- Create mode: unchanged POST behavior, title "Add Camera", button "Save Camera"
- Stream Profile selector dropdown fetched on dialog open from `/api/stream-profiles`
- `streamProfileId` included in body (or null to clear)
- Reset includes `streamProfileId`

### tenant-cameras-page.tsx (rewritten)
- Page orchestrator with CamerasDataTable integration
- State: cameras, loading, error, orgId, view (default "table"), createDialogOpen, editCamera, deleteCamera, embedCamera, selectedCameraId
- Real-time status via `useCameraStatus` hook
- 5 action handlers: handleEdit, handleViewStream, handleRecordToggle, handleEmbedCode, handleDelete
- Delete confirmation AlertDialog with descriptive copy about recording preservation
- EmbedCodeDialog wired with cameraId
- `selectedCameraId` state prepared for Plan 03 View Stream sheet

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 3e7feb9 | Create camera column definitions and CamerasDataTable with useReactTable |
| 2 | 9a4504d | Extend CameraFormDialog for edit mode, rewrite page orchestrator |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
