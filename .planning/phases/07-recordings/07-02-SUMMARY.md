---
phase: 07-recordings
plan: 02
subsystem: recordings
tags: [manifest, m3u8, hls, retention, bullmq, schedule, storage-quota, nestjs]

requires:
  - phase: 07-recordings
    provides: "RecordingsService, MinioService, RecordingsModule, on_hls callback pipeline (07-01)"
  - phase: 07-recordings
    provides: "Test stub files for recording behaviors (07-00)"
provides:
  - "ManifestService for dynamic fMP4 HLS m3u8 generation with pre-signed URLs"
  - "RetentionProcessor: hourly BullMQ cleanup of expired segments from MinIO and DB"
  - "ScheduleProcessor: per-minute BullMQ check for recording schedule start/stop"
  - "Storage quota alerts at 80% and 90% via notifications with anti-spam dedup"
  - "Timeline and calendar data endpoints for recording browsing UI"
  - "Schedule CRUD and retention update REST endpoints"
  - "Zod DTOs for create-schedule and update-retention"
affects: [07-recordings]

tech-stack:
  added: []
  patterns: ["Dynamic m3u8 manifest with EXT-X-VERSION:7 and EXT-X-MAP for fMP4", "BullMQ upsertJobScheduler for repeatable retention and schedule jobs", "Fire-and-forget storage quota alerts with anti-spam dedup"]

key-files:
  created:
    - apps/api/src/recordings/manifest.service.ts
    - apps/api/src/recordings/retention.processor.ts
    - apps/api/src/recordings/schedule.processor.ts
    - apps/api/src/recordings/dto/create-schedule.dto.ts
    - apps/api/src/recordings/dto/update-retention.dto.ts
  modified:
    - apps/api/src/recordings/recordings.service.ts
    - apps/api/src/recordings/recordings.controller.ts
    - apps/api/src/recordings/recordings.module.ts
    - apps/api/tests/recordings/manifest.test.ts
    - apps/api/tests/recordings/retention.test.ts
    - apps/api/tests/recordings/storage-quota.test.ts
    - apps/api/tests/recordings/schedule.test.ts

key-decisions:
  - "ManifestService.buildManifest made public for direct unit testing without async mocks"
  - "Storage quota alerts use fire-and-forget pattern (.catch) in archiveSegment to avoid blocking segment upload"
  - "Anti-spam dedup queries notifications within 1-hour window to prevent repeated alerts"
  - "BullMQ upsertJobScheduler used for idempotent repeatable job registration"

patterns-established:
  - "Dynamic m3u8 VOD manifest: query segments by time range, generate pre-signed URLs, build EXT-X-VERSION:7 playlist"
  - "BullMQ upsertJobScheduler in module onModuleInit for repeatable job setup"
  - "Fire-and-forget notification alerts with anti-spam dedup via recent notification query"

requirements-completed: [REC-02, REC-04, REC-05]

duration: 305s
completed: 2026-04-13
---

# Phase 7 Plan 02: Recording Lifecycle Services Summary

**Dynamic m3u8 manifest generation, hourly retention cleanup, scheduled recording via BullMQ, and storage quota alerts at 80%/90% thresholds**

## Performance

- **Duration:** 305s (~5.1 min)
- **Started:** 2026-04-13T12:42:40Z
- **Completed:** 2026-04-13T12:47:45Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- ManifestService generates fMP4 HLS manifests with EXT-X-VERSION:7, EXT-X-MAP, pre-signed MinIO URLs
- RetentionProcessor cleans expired segments hourly with per-camera retention override and org default fallback
- ScheduleProcessor checks recording schedules every minute, starts/stops recording based on time windows
- Storage quota alerts at 80% (warning) and 90% (critical) with 1-hour dedup to prevent spam
- Timeline and calendar endpoints for recording browsing UI
- 21 new tests replacing all remaining todo stubs; 34 total recording tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: ManifestService for dynamic m3u8 generation + playback/proxy endpoints** - `29756ed` (feat)
2. **Task 2: RetentionProcessor, ScheduleProcessor, storage quota alerts, and remaining tests** - `dd3801b` (feat)

## Files Created/Modified
- `apps/api/src/recordings/manifest.service.ts` - Dynamic fMP4 HLS m3u8 generation with pre-signed URLs
- `apps/api/src/recordings/retention.processor.ts` - Hourly BullMQ processor for retention cleanup
- `apps/api/src/recordings/schedule.processor.ts` - Per-minute BullMQ processor for schedule toggle
- `apps/api/src/recordings/dto/create-schedule.dto.ts` - Zod schema for schedule creation
- `apps/api/src/recordings/dto/update-retention.dto.ts` - Zod schema for retention updates
- `apps/api/src/recordings/recordings.service.ts` - Added checkAndAlertStorageQuota, schedule CRUD, retention update, getSegment
- `apps/api/src/recordings/recordings.controller.ts` - Added manifest, timeline, calendar, schedule CRUD, retention, proxy endpoints
- `apps/api/src/recordings/recordings.module.ts` - Added ManifestService, RetentionProcessor, ScheduleProcessor, repeatable jobs
- `apps/api/tests/recordings/manifest.test.ts` - 5 tests for manifest generation
- `apps/api/tests/recordings/retention.test.ts` - 6 tests for retention cleanup
- `apps/api/tests/recordings/storage-quota.test.ts` - 5 tests for storage quota and alerts
- `apps/api/tests/recordings/schedule.test.ts` - 5 tests for schedule processor

## Decisions Made
- Made ManifestService.buildManifest public for direct unit testing without async mock overhead
- Storage quota alert uses fire-and-forget (.catch) pattern in archiveSegment to never block segment upload
- Anti-spam dedup queries notifications within 1-hour window before creating new storage alerts
- Used BullMQ upsertJobScheduler (idempotent) in onModuleInit for repeatable job registration

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - all services are internal BullMQ processors and API endpoints. No external configuration required.

## Next Phase Readiness
- All backend recording services complete: archival, manifest, retention, schedules, quota
- 34 recording tests pass with full coverage of all behaviors
- Ready for Plan 03: frontend recording playback UI (timeline, calendar, hls.js player)

---
*Phase: 07-recordings*
*Completed: 2026-04-13*
