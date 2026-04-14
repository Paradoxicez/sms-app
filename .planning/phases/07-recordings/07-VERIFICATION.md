---
phase: 07-recordings
verified: 2026-04-13T13:10:00Z
status: human_needed
score: 4/4 must-haves verified
gaps: []
human_verification:
  - test: "Navigate to camera detail page, click Recordings tab, verify calendar + timeline + player + controls render"
    expected: "6 tabs visible including Recordings; calendar on left, timeline bar on right, start recording button, storage usage indicator"
    why_human: "Visual layout, component rendering, and interactive behavior cannot be verified programmatically"
  - test: "Click Start Recording button, verify state changes to recording with REC badge"
    expected: "Button changes to Stop Recording, red pulsing REC badge appears, storage updates"
    why_human: "Requires running backend + SRS + MinIO to test real recording flow"
  - test: "Navigate to /admin/recordings, verify admin recordings list page renders with filters"
    expected: "Page shows Recordings heading, camera/date/status filter bar, table with columns"
    why_human: "Visual layout verification and filter interaction"
  - test: "Check sidebar nav shows Recordings under Monitoring group with Film icon"
    expected: "Film icon + Recordings label visible under Monitoring section"
    why_human: "Visual icon and positioning verification"
  - test: "Click Set Schedule button, verify dialog opens with schedule type, time inputs, enable toggle"
    expected: "Dialog with Daily/Weekly/Custom dropdown, time pickers, enable switch, save/discard buttons"
    why_human: "Dialog interaction and form behavior"
  - test: "Play back a recording via manifest endpoint in HLS player"
    expected: "HLS player loads m3u8 manifest with fMP4 segments and plays recorded footage"
    why_human: "Requires actual recorded segments in MinIO; end-to-end playback verification"
---

# Phase 7: Recordings Verification Report

**Phase Goal:** Users can record camera streams, browse recorded footage, and manage storage with retention policies
**Verified:** 2026-04-13T13:10:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (from Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator can start/stop recording for any camera and recorded segments are archived to MinIO/S3 | VERIFIED | `recordings.service.ts` (474 lines): `startRecording()`, `stopRecording()`, `archiveSegment()` all implemented. `srs-callback.controller.ts` calls `recordingsService.getActiveRecording` and `recordingsService.archiveSegment` in `onHls` handler. MinIO service with `uploadSegment`, `ensureBucket`. Path traversal prevention (T-07-01). 13 tests cover lifecycle and archival. |
| 2 | User can browse recorded footage with time-range selection and play it back in the browser | VERIFIED | `manifest.service.ts` (134 lines): `generateManifest()` builds fMP4 HLS m3u8 with `EXT-X-VERSION:7`, `EXT-X-MAP`, `EXT-X-ENDLIST`, pre-signed URLs. Controller has `GET :id/manifest`, `GET camera/:cameraId/timeline`, `GET camera/:cameraId/calendar`. Frontend: `recordings-tab.tsx` (415 lines) with Calendar, TimelineBar, HlsPlayer, recordings list. `use-recordings.ts` (210 lines) with hooks for all endpoints. |
| 3 | Retention policies auto-delete recordings older than the configured period per camera and per plan | VERIFIED | `retention.processor.ts` (109 lines): `@Processor('recording-retention')` with hourly repeatable job. Reads camera `retentionDays` with fallback to org `defaultRetentionDays` (default 30). Deletes expired segments from MinIO via `minioService.removeObjects` and from DB. Cleans empty recordings. 6 retention tests pass. Schema has `Camera.retentionDays Int?` and `OrgSettings.defaultRetentionDays Int @default(30)`. |
| 4 | Storage quota is enforced per organization with alerts at threshold levels | VERIFIED | `recordings.service.ts`: `checkStorageQuota()` aggregates segment sizes, compares to `Package.maxStorageGb`, returns `allowed: boolean`. `checkAndAlertStorageQuota()` fires alerts at 80% and 90% with 1-hour dedup. Called fire-and-forget in `archiveSegment()`. Quota check gates `startRecording()` and `onHls` callback. 5 storage-quota tests pass. Frontend: `recording-controls.tsx` (164 lines) shows color-coded progress bar. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docker-compose.yml` | MinIO service + srs_hls volume | VERIFIED | MinIO service with image `minio/minio:latest`, ports 9000/9001, minio_data volume |
| `apps/api/src/prisma/schema.prisma` | Recording, RecordingSegment, RecordingSchedule models | VERIFIED | All 3 models present with RLS indexes, Camera.retentionDays, Camera.isRecording, OrgSettings.defaultRetentionDays |
| `apps/api/src/recordings/recordings.module.ts` | NestJS module with BullMQ queues | VERIFIED | 47 lines, BullModule.registerQueue for recording-retention and recording-schedule, upsertJobScheduler for repeatable jobs |
| `apps/api/src/recordings/recordings.service.ts` | Core recording logic | VERIFIED | 474 lines, startRecording, stopRecording, archiveSegment, checkStorageQuota, checkAndAlertStorageQuota, schedule CRUD, retention update |
| `apps/api/src/recordings/recordings.controller.ts` | Feature-gated REST endpoints | VERIFIED | 205 lines, 15 endpoints, @RequireFeature(FeatureKey.RECORDINGS) |
| `apps/api/src/recordings/minio.service.ts` | MinIO client wrapper | VERIFIED | 66 lines, ensureBucket, uploadSegment, getPresignedUrl, removeObject, removeObjects |
| `apps/api/src/recordings/manifest.service.ts` | Dynamic m3u8 generation | VERIFIED | 134 lines, generateManifest with EXT-X-VERSION:7, EXT-X-MAP, pre-signed URLs |
| `apps/api/src/recordings/retention.processor.ts` | Hourly BullMQ retention cleanup | VERIFIED | 109 lines, @Processor('recording-retention'), cleanupOrg with per-camera retention |
| `apps/api/src/recordings/schedule.processor.ts` | BullMQ schedule toggle | VERIFIED | 60 lines, @Processor('recording-schedule'), starts/stops recording based on time windows |
| `apps/web/src/app/admin/cameras/components/recordings-tab.tsx` | Full Recordings tab | VERIFIED | 415 lines, Calendar, TimelineBar, HlsPlayer, RecordingControls, RetentionSettings, recordings list |
| `apps/web/src/app/admin/cameras/components/timeline-bar.tsx` | 24-hour timeline | VERIFIED | 208 lines, colored segments, drag selection, keyboard accessibility |
| `apps/web/src/app/admin/cameras/components/recording-controls.tsx` | Start/Stop + storage indicator | VERIFIED | 164 lines, start/stop buttons, REC badge, color-coded Progress bar |
| `apps/web/src/app/admin/cameras/components/schedule-dialog.tsx` | Schedule dialog | VERIFIED | 257 lines, daily/weekly/custom modes, time inputs, enable toggle |
| `apps/web/src/app/admin/cameras/components/retention-settings.tsx` | Retention settings | VERIFIED | 126 lines, retention period select, custom input, save button |
| `apps/web/src/app/admin/recordings/page.tsx` | Admin recordings page | VERIFIED | 383 lines, filters, table, bulk delete |
| `apps/web/src/hooks/use-recordings.ts` | Recording hooks | VERIFIED | 210 lines, hooks for status, timeline, calendar, list, storage, mutations |
| `apps/web/src/components/sidebar-nav.tsx` | Recordings nav entry | VERIFIED | Film icon imported, "Recordings" entry under Monitoring group |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| srs-callback.controller.ts | recordings.service.ts | recordingsService.archiveSegment() in onHls | WIRED | Lines 114 and 138 show getActiveRecording and archiveSegment calls |
| recordings.service.ts | minio.service.ts | minioService.uploadSegment() | WIRED | Upload called in archiveSegment method |
| recordings.controller.ts | manifest.service.ts | manifestService.generateManifest() | WIRED | Line 167 in GET :id/manifest endpoint |
| retention.processor.ts | minio.service.ts | removeObjects during cleanup | WIRED | Line 72 calls minioService.removeObjects |
| app.module.ts | recordings.module.ts | Module import | WIRED | Lines 26 and 57 |
| camera [id]/page.tsx | recordings-tab.tsx | TabsContent rendering RecordingsTab | WIRED | Import line 56, TabsTrigger "recordings" line 429, RecordingsTab rendered line 651 |
| use-recordings.ts | recordings API | apiFetch calls | WIRED | 8 distinct apiFetch calls to /api/recordings/* endpoints |
| sidebar-nav.tsx | /admin/recordings | Nav entry | WIRED | Film icon, href="/admin/recordings" |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| recordings-tab.tsx | recordings, timeline, calendar | use-recordings.ts hooks -> apiFetch -> /api/recordings/* | API endpoints query Prisma DB | FLOWING |
| recording-controls.tsx | storageQuota | useStorageQuota hook -> /api/recordings/storage | checkStorageQuota aggregates from DB | FLOWING |
| manifest.service.ts | segments | prisma.recordingSegment.findMany | DB query with time range filter | FLOWING |
| retention.processor.ts | expiredSegments | prisma.recordingSegment.findMany with cutoff | DB query with date filter | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED (requires running Docker, SRS, MinIO, and database services for end-to-end verification)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REC-01 | 07-01 | Record camera streams via on_hls callback archiving segments to MinIO/S3 | SATISFIED | archiveSegment in service, onHls wiring in callback controller, MinioService.uploadSegment, path traversal protection, 6 archive tests |
| REC-02 | 07-02, 07-03 | Browse and playback recorded footage with time-range selection | SATISFIED | ManifestService generates m3u8 with time-range params, timeline/calendar endpoints, RecordingsTab with Calendar + TimelineBar + HlsPlayer |
| REC-03 | 07-01, 07-03 | Start/stop recording per camera | SATISFIED | startRecording/stopRecording in service and controller, RecordingControls component, 7 lifecycle tests |
| REC-04 | 07-02 | Configurable retention policies per camera and per plan | SATISFIED | RetentionProcessor with per-camera retentionDays + org default fallback, hourly BullMQ job, retention settings UI, 6 retention tests |
| REC-05 | 07-02, 07-03 | Storage quota enforcement per organization with alerts | SATISFIED | checkStorageQuota blocks at 100%, checkAndAlertStorageQuota fires at 80%/90% with dedup, storage progress bar in UI, 5 quota tests |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none found) | - | - | - | No TODOs, FIXMEs, placeholders, or stub implementations detected in recording source files |

### Human Verification Required

### 1. Recordings Tab Visual Layout

**Test:** Navigate to any camera detail page, click the Recordings tab
**Expected:** Calendar on left, timeline bar on right, recording controls at top, empty state message when no recordings exist
**Why human:** Visual layout, component composition, and responsive behavior

### 2. Recording Start/Stop Flow

**Test:** Click Start Recording on an online camera, observe state change, then click Stop Recording
**Expected:** Button changes to destructive Stop Recording, red pulsing REC badge, storage updates; stop confirmation dialog appears
**Why human:** Requires running SRS + FFmpeg + MinIO infrastructure for real recording

### 3. Schedule Dialog Interaction

**Test:** Click Set Schedule button, configure a daily schedule, save
**Expected:** Dialog opens with schedule type, time inputs, enable toggle; save creates schedule via API; toast notification
**Why human:** Form interaction and dialog behavior

### 4. HLS Playback of Recorded Footage

**Test:** Select a date with recordings, select time range on timeline, verify HLS player loads manifest
**Expected:** HLS player plays fMP4 segments from MinIO via pre-signed URLs
**Why human:** End-to-end playback requires real recorded data in MinIO

### 5. Recordings Admin Page

**Test:** Navigate to /admin/recordings, verify filters and table render
**Expected:** Camera/date/status filters, recordings table with bulk delete capability
**Why human:** Visual layout and filter interaction

### 6. Sidebar Navigation

**Test:** Check sidebar shows Recordings link under Monitoring group
**Expected:** Film icon with "Recordings" label, navigates to /admin/recordings
**Why human:** Visual icon and placement verification

### Gaps Summary

No code gaps found. All 4 roadmap success criteria are verified at the code level. All 5 requirement IDs (REC-01 through REC-05) are satisfied with substantive implementations and 34 passing tests. All key wiring links are confirmed.

Human verification is needed for visual layout, interactive behavior, and end-to-end recording playback which require running infrastructure.

---

_Verified: 2026-04-13T13:10:00Z_
_Verifier: Claude (gsd-verifier)_
