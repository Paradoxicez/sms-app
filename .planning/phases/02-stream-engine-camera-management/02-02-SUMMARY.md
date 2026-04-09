---
phase: 02-stream-engine-camera-management
plan: 02
status: completed
started: "2026-04-09T13:06:53Z"
completed: "2026-04-09T13:11:30Z"
duration: 277s
commits:
  - 3c7bf90
  - 0c72ccd
  - f8a36e9
  - 930aee1
tasks_completed: 2
tasks_total: 2
key-decisions:
  - "AuthGuard created with CLS org context injection for session-based endpoint protection"
  - "maxCameras limit checked via raw PrismaService (not tenancy) to query Package, camera count via tenancy client"
  - "FfprobeService uses shell exec with 15s timeout and TCP transport for reliable RTSP probing"
key-files:
  created:
    - apps/api/src/cameras/cameras.module.ts
    - apps/api/src/cameras/cameras.controller.ts
    - apps/api/src/cameras/cameras.service.ts
    - apps/api/src/cameras/ffprobe.service.ts
    - apps/api/src/cameras/dto/create-project.dto.ts
    - apps/api/src/cameras/dto/create-site.dto.ts
    - apps/api/src/cameras/dto/create-camera.dto.ts
    - apps/api/src/cameras/dto/update-camera.dto.ts
    - apps/api/src/auth/guards/auth.guard.ts
    - apps/api/tests/cameras/camera-crud.test.ts
    - apps/api/tests/cameras/hierarchy.test.ts
    - apps/api/tests/cameras/ffprobe.test.ts
    - apps/api/tests/cameras/codec-detection.test.ts
  modified:
    - apps/api/src/app.module.ts
    - apps/api/tests/helpers/tenancy.ts
dependency-graph:
  requires:
    - "Phase 2 Prisma models (Project, Site, Camera) from 02-01"
    - "Tenancy extension with CLS-based org_id injection from Phase 1"
  provides:
    - "CamerasService with full CRUD for Project, Site, Camera hierarchy"
    - "FfprobeService for camera stream validation and codec detection"
    - "AuthGuard for session-based endpoint protection"
    - "updateCameraCodecInfo method for codec info persistence"
  affects:
    - "02-03 (stream profiles will use CamerasService)"
    - "02-04 (FFmpeg process manager will use ffprobe results)"
    - "02-05 (camera status monitoring builds on camera CRUD)"
tech-stack:
  added: []
  patterns:
    - "AuthGuard with CLS org context injection"
    - "Zod safeParse validation in controllers"
    - "Tenancy client for RLS-filtered queries, raw Prisma for cross-org queries (Package lookup)"
---

# Phase 02 Plan 02: Camera CRUD & FFprobe Summary

Camera hierarchy CRUD (Project > Site > Camera) with Zod validation, maxCameras package limit enforcement, ffprobe test connection with H.265 auto-detection and RTSP credential redaction.

## Objective

Enable operators to register and organize cameras with validated stream URLs before any streaming starts. Full CRUD endpoints for Projects, Sites, and Cameras with ffprobe validation and codec detection.

## What Was Built

### Task 1: Camera Hierarchy CRUD (Project > Site > Camera)
- CamerasService with full CRUD for Projects, Sites, and Cameras including cascade deletes
- CamerasController with 12 REST endpoints, all protected by AuthGuard
- Zod DTO validation for all create/update operations (rtsp:// and srt:// URL enforcement)
- maxCameras package limit enforcement querying Organization.Package.maxCameras
- Camera created with status "offline" and needsTranscode=false by default
- CamerasModule registered in AppModule
- AuthGuard created (Rule 2 - missing critical functionality) with CLS org context injection

### Task 2: FFprobe Test Connection + H.265 Auto-Detection
- FfprobeService with `probeCamera()` method using ffprobe CLI with 15s timeout
- H.265/HEVC auto-detection: codec names 'hevc' and 'h265' both trigger needsTranscode=true
- RTSP URL credential redaction via `redactUrl()` - credentials replaced with *** in all logs
- Codec info includes: video codec, resolution (width/height), FPS, audio codec
- POST /cameras/:id/test-connection endpoint updates camera's codecInfo and needsTranscode fields
- Fractional frame rates handled correctly (30000/1001 rounds to 30)

## Key Files

### Created
- `apps/api/src/cameras/cameras.module.ts`: Module registration with controller, service, ffprobe
- `apps/api/src/cameras/cameras.controller.ts`: 12 REST endpoints with Zod validation and AuthGuard
- `apps/api/src/cameras/cameras.service.ts`: CRUD business logic with maxCameras enforcement
- `apps/api/src/cameras/ffprobe.service.ts`: FFprobe wrapper with H.265 detection and URL redaction
- `apps/api/src/cameras/dto/create-project.dto.ts`: Zod schema for project creation
- `apps/api/src/cameras/dto/create-site.dto.ts`: Zod schema for site creation
- `apps/api/src/cameras/dto/create-camera.dto.ts`: Zod schema with rtsp/srt URL validation
- `apps/api/src/cameras/dto/update-camera.dto.ts`: Zod schema for partial camera updates
- `apps/api/src/auth/guards/auth.guard.ts`: Session-based auth guard with CLS org injection
- `apps/api/tests/cameras/camera-crud.test.ts`: 9 tests for camera CRUD operations
- `apps/api/tests/cameras/hierarchy.test.ts`: 7 tests for project/site/camera hierarchy
- `apps/api/tests/cameras/ffprobe.test.ts`: 8 tests for ffprobe service
- `apps/api/tests/cameras/codec-detection.test.ts`: 6 tests for codec detection and credential redaction

### Modified
- `apps/api/src/app.module.ts`: Added CamerasModule import
- `apps/api/tests/helpers/tenancy.ts`: Added Phase 2 table cleanup (camera, site, project, etc.)

## Threat Mitigations Applied

| Threat ID | Mitigation | Implementation |
|-----------|-----------|----------------|
| T-02-03 | RTSP URL injection | Zod validation enforces rtsp:// or srt:// prefix; URL quoted in ffprobe command |
| T-02-04 | Cross-tenant camera access | RLS via TENANCY_CLIENT with CLS org_id; AuthGuard sets org context |
| T-02-05 | Stream URL credentials in logs | FfprobeService.redactUrl() replaces username:password with *** |
| T-02-06 | FFmpeg resource exhaustion | Package.maxCameras limit enforced before camera creation |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Created AuthGuard**
- **Found during:** Task 1
- **Issue:** No AuthGuard existed in the codebase (only SuperAdminGuard for admin endpoints)
- **Fix:** Created `apps/api/src/auth/guards/auth.guard.ts` with session validation and CLS org context injection
- **Files created:** `apps/api/src/auth/guards/auth.guard.ts`
- **Commit:** 3c7bf90

**2. [Rule 2 - Missing Critical] Updated test cleanup helper**
- **Found during:** Task 1
- **Issue:** `cleanupTestData` helper didn't include Phase 2 tables, causing FK constraint failures
- **Fix:** Added camera, site, project, streamProfile, orgSettings cleanup in correct FK order
- **Files modified:** `apps/api/tests/helpers/tenancy.ts`
- **Commit:** 0c72ccd

## Known Stubs

None - all methods are fully implemented. FfprobeService stub from Task 1 was replaced with full implementation in Task 2.

## Self-Check: PASSED

All 13 created files verified on disk. All 4 commits verified in git log. 30 tests passing across 4 test files.
