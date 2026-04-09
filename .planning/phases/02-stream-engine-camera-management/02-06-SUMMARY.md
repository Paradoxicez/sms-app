---
phase: 02-stream-engine-camera-management
plan: 06
status: checkpoint-pending
started: "2026-04-09T13:48:53Z"
completed: null
duration: 481s
commits:
  - 9c199f6
  - 20b950d
  - 120b566
tasks_completed: 2
tasks_total: 3
subsystem: ui,api
tags: [stream-profiles, stream-engine, bulk-import, csv, json, settings, next.js, nestjs, zod, bullmq]

dependency-graph:
  requires:
    - "Stream profiles API from 02-04"
    - "Settings API from 02-04"
    - "Camera CRUD API from 02-02"
    - "Camera management frontend from 02-05"
    - "shadcn components from 02-05"
  provides:
    - "Stream Profiles management page with card grid CRUD"
    - "Stream Engine Settings page with System + Org Defaults tabs"
    - "Bulk camera import endpoint POST /api/cameras/bulk-import"
    - "Bulk import dialog with CSV/JSON upload and editable preview table"
  affects:
    - "Phase 3 (settings pages provide configuration for playback)"
    - "Phase 7 (recording mode defaults configured here)"

tech-stack:
  added: []
  patterns:
    - "base-ui Select onValueChange: wrap with String(v ?? '') for type safety"
    - "base-ui Switch onCheckedChange: wrap with !! for boolean coercion"
    - "Bulk import uses browser-side CSV/JSON parsing with server-side Zod re-validation"

key-files:
  created:
    - apps/web/src/app/admin/stream-profiles/page.tsx
    - apps/web/src/app/admin/stream-profiles/components/profile-form-dialog.tsx
    - apps/web/src/app/admin/stream-engine/page.tsx
    - apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx
    - apps/api/src/cameras/dto/bulk-import.dto.ts
    - apps/api/tests/cameras/bulk-import.test.ts
  modified:
    - apps/api/src/cameras/cameras.controller.ts
    - apps/api/src/cameras/cameras.service.ts
    - apps/web/src/app/admin/cameras/page.tsx

key-decisions:
  - "Bulk import uses browser-side CSV/JSON parsing with server-side Zod re-validation (defense in depth)"
  - "BullMQ probe queue enqueue is best-effort (no-op if Redis unavailable in tests)"
  - "enforceMaxCamerasLimitBulk checks total (existing + new) before starting transaction"

requirements-completed: [CAM-07, STREAM-05, STREAM-07]

metrics:
  duration: 481s
  completed: null
---

# Phase 02 Plan 06: Stream Profiles UI, Settings UI, Bulk Import Summary

**Stream Profiles card grid with CRUD dialog (passthrough/transcode RadioGroup), Stream Engine Settings with two-tier System + Org tabs, and bulk camera import with CSV/JSON upload, editable preview table, and background ffprobe processing.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-09T13:48:53Z
- **Status:** Checkpoint pending (Task 3: human-verify)
- **Tasks:** 2 of 3 completed (Task 3 is human-verify checkpoint)
- **Files modified:** 9

## Accomplishments

- Stream Profiles page with 2-3 column card grid showing name, codec mode, resolution, FPS, bitrate, audio, default badge
- Profile create/edit dialog with RadioGroup (Passthrough/Transcode), conditional fields for transcode mode
- Transcode fields: resolution select, FPS select, bitrate slider (500k-8000k), encoding preset, audio mode, audio bitrate
- Profile validation endpoint integration with amber warning display
- Delete Profile confirmation with fallback message
- Stream Engine Settings page titled "Stream Engine Settings" (never "SRS")
- System tab: HLS fragment/window, RTMP/SRT ports, connection timeout, HLS encryption toggle
- Organization Defaults tab: default stream profile select, max reconnect attempts, auto-start on boot, default recording mode
- POST /api/cameras/bulk-import endpoint with Zod validation (max 500 cameras, rtsp/srt URLs)
- CamerasService.bulkImport with maxCameras limit check for total (existing + new)
- BullMQ job enqueue on stream:probe queue for ffprobe per camera after import
- Bulk import dialog: file upload zone (CSV/JSON), editable preview table with inline validation
- Error rows highlighted with bg-destructive/10, status column with check/X icons and tooltips
- Confirm Import button disabled when errors exist
- Import Cameras button wired on cameras page (replaces disabled placeholder from 02-05)
- 12 backend tests passing (DTO validation + service integration)

## Task Commits

1. **Task 1: Stream Profiles page + Stream Engine Settings page** - `9c199f6` (feat)
2. **Task 2 RED: Failing tests for bulk import** - `20b950d` (test)
3. **Task 2 GREEN: Bulk import backend + frontend** - `120b566` (feat)

## Files Created/Modified

### Created
- `apps/web/src/app/admin/stream-profiles/page.tsx` - Stream profiles card grid with CRUD
- `apps/web/src/app/admin/stream-profiles/components/profile-form-dialog.tsx` - Create/edit dialog with RadioGroup mode selection
- `apps/web/src/app/admin/stream-engine/page.tsx` - Two-tab settings page (System + Org Defaults)
- `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx` - CSV/JSON upload with editable preview table
- `apps/api/src/cameras/dto/bulk-import.dto.ts` - Zod schemas for bulk import validation
- `apps/api/tests/cameras/bulk-import.test.ts` - 12 tests for DTO validation and service integration

### Modified
- `apps/api/src/cameras/cameras.controller.ts` - Added POST /api/cameras/bulk-import endpoint
- `apps/api/src/cameras/cameras.service.ts` - Added bulkImport method with limit check and BullMQ job enqueue
- `apps/web/src/app/admin/cameras/page.tsx` - Wired Import Cameras button to BulkImportDialog

## Decisions Made

- **Browser-side parsing with server re-validation:** CSV/JSON files are parsed client-side for immediate preview, then Zod validates again on the server for defense in depth (T-02-16 mitigation).
- **Best-effort BullMQ enqueue:** Probe queue enqueue wrapped in try/catch so tests don't require Redis. In production, Redis availability is guaranteed by Docker Compose.
- **Separate enforceMaxCamerasLimitBulk:** New helper checks `currentCount + newCount > maxCameras` before starting the transaction, preventing partial imports that exceed limits.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation | Implementation |
|-----------|-----------|----------------|
| T-02-16 | CSV injection prevention | Server-side Zod validation of every row in BulkImportCameraSchema. URL format restricted to rtsp:// or srt://. Max 500 cameras per import. |
| T-02-17 | Large file upload DoS | Max 500 cameras in BulkImportSchema. 5MB file size check on frontend upload handler. |
| T-02-18 | Malicious stream profile values | Existing Zod validation from 02-04 constrains codec, preset, port ranges. |

## Known Stubs

None - all features fully wired to backend APIs.

## Checkpoint Pending

Task 3 (human-verify) awaits visual verification of Stream Profiles, Settings, and Bulk Import UI.

---
*Phase: 02-stream-engine-camera-management*
*Status: Checkpoint pending*
