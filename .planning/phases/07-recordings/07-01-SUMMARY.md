---
phase: 07-recordings
plan: 01
subsystem: recordings
tags: [minio, recordings, hls, on_hls, prisma, nestjs, bullmq]

requires:
  - phase: 07-recordings
    provides: "Test stub files for recording behaviors (07-00)"
  - phase: 02-stream-engine-camera-management
    provides: "SRS callback controller, BullMQ infrastructure, Camera model"
  - phase: 01-foundation
    provides: "Prisma, TenancyModule, FeatureGuard, AuthGuard"
provides:
  - "MinIO Docker service for object storage"
  - "Recording, RecordingSegment, RecordingSchedule Prisma models"
  - "RecordingsService with start/stop recording and segment archival"
  - "MinioService wrapping minio client for bucket operations"
  - "on_hls callback pipeline for segment archival to MinIO"
  - "RecordingsController with feature-gated REST endpoints"
  - "Path traversal prevention on SRS callback file paths (T-07-01)"
affects: [07-recordings]

tech-stack:
  added: [minio@8.0.7]
  patterns: ["on_hls callback -> archiveSegment pipeline", "MinIO per-org bucket isolation", "fMP4 init segment detection from m3u8 EXT-X-MAP"]

key-files:
  created:
    - apps/api/src/recordings/recordings.module.ts
    - apps/api/src/recordings/recordings.service.ts
    - apps/api/src/recordings/recordings.controller.ts
    - apps/api/src/recordings/minio.service.ts
    - apps/api/src/recordings/dto/on-hls-callback.dto.ts
    - apps/api/src/recordings/dto/start-recording.dto.ts
  modified:
    - docker-compose.yml
    - apps/api/src/prisma/schema.prisma
    - apps/api/src/srs/srs-callback.controller.ts
    - apps/api/src/srs/srs.module.ts
    - apps/api/src/app.module.ts
    - .env.example
    - apps/api/tests/recordings/archive-segment.test.ts
    - apps/api/tests/recordings/recording-lifecycle.test.ts

key-decisions:
  - "rawPrisma used for getActiveRecording and archiveSegment to bypass RLS for cross-org SRS callback context"
  - "vi.mock at module level for fs/promises ESM compatibility in tests"
  - "Path traversal check both in RecordingsService and SrsCallbackController for defense in depth"

patterns-established:
  - "on_hls callback pipeline: parse -> check active recording -> check quota -> archive segment"
  - "MinIO per-org bucket naming: org-{orgId}"
  - "fMP4 init segment detection via m3u8 EXT-X-MAP URI parsing"

requirements-completed: [REC-01, REC-03]

duration: 337s
completed: 2026-04-13
---

# Phase 7 Plan 01: Recording Infrastructure Summary

**MinIO object storage, Recording Prisma models, start/stop API, and on_hls callback segment archival pipeline with path traversal protection**

## Performance

- **Duration:** 337s (~5.6 min)
- **Started:** 2026-04-13T12:35:02Z
- **Completed:** 2026-04-13T12:40:39Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- MinIO Docker service configured with S3 API (9000) and console (9001), shared srs_hls volume
- Recording, RecordingSegment, RecordingSchedule Prisma models with RLS indexes and Camera/OrgSettings extensions
- Full recording pipeline: start/stop API -> on_hls callback -> segment archival to MinIO with quota enforcement
- 13 passing unit tests covering segment archival, lifecycle, path traversal, and quota enforcement

## Task Commits

Each task was committed atomically:

1. **Task 1: Docker Compose MinIO + shared volume, Prisma schema, npm install minio** - `1f03e63` (feat)
2. **Task 2: RecordingsModule with MinioService, RecordingsService, on_hls wiring, tests** - `898eb29` (feat)

## Files Created/Modified
- `docker-compose.yml` - Added MinIO service, srs_hls shared volume, minio_data volume
- `apps/api/src/prisma/schema.prisma` - Recording, RecordingSegment, RecordingSchedule models + Camera/OrgSettings extensions
- `.env.example` - MinIO and SRS_HLS_PATH environment variables
- `apps/api/src/recordings/recordings.module.ts` - NestJS module with BullMQ queue registration
- `apps/api/src/recordings/recordings.service.ts` - Core recording logic (start/stop/archive/quota)
- `apps/api/src/recordings/recordings.controller.ts` - Feature-gated REST endpoints
- `apps/api/src/recordings/minio.service.ts` - MinIO client wrapper service
- `apps/api/src/recordings/dto/on-hls-callback.dto.ts` - Zod schema for SRS on_hls callback
- `apps/api/src/recordings/dto/start-recording.dto.ts` - Zod schema for start recording
- `apps/api/src/srs/srs-callback.controller.ts` - on_hls handler wired to recording archival
- `apps/api/src/srs/srs.module.ts` - Added RecordingsModule import
- `apps/api/src/app.module.ts` - Added RecordingsModule import
- `apps/api/tests/recordings/archive-segment.test.ts` - 6 passing tests for segment archival
- `apps/api/tests/recordings/recording-lifecycle.test.ts` - 7 passing tests for lifecycle

## Decisions Made
- Used rawPrisma (not tenancy client) for getActiveRecording and archiveSegment since SRS callbacks operate outside user session context
- Used vi.mock at module level for fs/promises to handle ESM non-configurable exports in Vitest
- Implemented path traversal check in both service and controller for defense in depth (T-07-01)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESM fs/promises mock incompatibility**
- **Found during:** Task 2 (test implementation)
- **Issue:** vi.spyOn cannot redefine ESM module exports for fs/promises
- **Fix:** Used vi.mock at module level with vi.mocked() for type-safe mock access
- **Files modified:** apps/api/tests/recordings/archive-segment.test.ts
- **Verification:** All 13 tests pass
- **Committed in:** 898eb29 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Standard ESM testing workaround, no scope change.

## Issues Encountered
None beyond the ESM mock issue documented above.

## User Setup Required
None - MinIO runs via Docker Compose with default credentials. No external service configuration required.

## Next Phase Readiness
- RecordingsModule exported and available for future plans (manifest generation, retention, schedules)
- 21 test stubs remain as todo for plans 02-03 (manifest, retention, storage-quota, schedule)
- MinIO bucket creation is automatic on first recording start per org

---
*Phase: 07-recordings*
*Completed: 2026-04-13*
