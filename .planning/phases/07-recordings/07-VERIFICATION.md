---
phase: 07-recordings
verified: 2026-04-14T05:35:00Z
status: human_needed
score: 4/4 must-haves verified
re_verification:
  previous_status: human_needed
  previous_score: 4/4
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Navigate to camera detail page, click Recordings tab, verify calendar + timeline + player + controls render"
    expected: "6 tabs visible including Recordings; calendar on left, timeline bar on right, start recording button, storage usage indicator"
    why_human: "Visual layout, component rendering, and interactive behavior cannot be verified programmatically"
  - test: "Click Start Recording button, verify state changes to recording with REC badge and error toast on failure"
    expected: "Button changes to Stop Recording, red pulsing REC badge appears, storage updates; error toast if API fails"
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
**Verified:** 2026-04-14T05:35:00Z
**Status:** human_needed
**Re-verification:** Yes -- after Plan 04 gap closure

## Goal Achievement

### Observable Truths (from Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator can start/stop recording for any camera and recorded segments are archived to MinIO/S3 | VERIFIED | `recordings.service.ts`: `startRecording()`, `stopRecording()`, `archiveSegment()` all implemented. `srs-callback.controller.ts` wired with `getActiveRecording` and `archiveSegment` in onHls. MinioService with `uploadSegment`, `ensureBucket`. Path traversal prevention (T-07-01). 13 tests pass. Plan 04: dev seed enables FeatureGuard, error toasts on failures. |
| 2 | User can browse recorded footage with time-range selection and play it back in the browser | VERIFIED | `manifest.service.ts`: `generateManifest()` builds fMP4 HLS m3u8 with `EXT-X-VERSION:7`, `EXT-X-MAP`, `EXT-X-ENDLIST`, pre-signed URLs. Timeline/calendar endpoints. Frontend: `recordings-tab.tsx` with Calendar, TimelineBar, HlsPlayer, recordings list. `use-recordings.ts` hooks for all endpoints. |
| 3 | Retention policies auto-delete recordings older than the configured period per camera and per plan | VERIFIED | `retention.processor.ts`: `@Processor('recording-retention')` hourly job. Per-camera `retentionDays` with org `defaultRetentionDays` fallback (default 30). Deletes from MinIO and DB. Schema has `Camera.retentionDays Int?` and `OrgSettings.defaultRetentionDays Int @default(30)`. 6 retention tests pass. |
| 4 | Storage quota is enforced per organization with alerts at threshold levels | VERIFIED | `checkStorageQuota()` aggregates segment sizes vs `Package.maxStorageGb`. `checkAndAlertStorageQuota()` fires at 80%/90% with 1-hour dedup. Quota gates `startRecording()` and `onHls`. Frontend shows color-coded progress bar. Plan 04: correct field mapping (usageBytes->usedBytes). 5 quota tests pass. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docker-compose.yml` | MinIO service + srs_hls volume | VERIFIED | MinIO service, ports 9000/9001, minio_data volume |
| `apps/api/src/prisma/schema.prisma` | Recording, RecordingSegment, RecordingSchedule models | VERIFIED | All 3 models with RLS indexes, Camera.retentionDays, Camera.isRecording, OrgSettings.defaultRetentionDays |
| `apps/api/src/recordings/recordings.module.ts` | NestJS module with BullMQ queues | VERIFIED | BullModule.registerQueue for recording-retention and recording-schedule |
| `apps/api/src/recordings/recordings.service.ts` | Core recording logic | VERIFIED | startRecording, stopRecording, archiveSegment, checkStorageQuota, checkAndAlertStorageQuota |
| `apps/api/src/recordings/recordings.controller.ts` | Feature-gated REST endpoints | VERIFIED | 15 endpoints, @RequireFeature(FeatureKey.RECORDINGS) |
| `apps/api/src/recordings/minio.service.ts` | MinIO client wrapper | VERIFIED | ensureBucket, uploadSegment, getPresignedUrl, removeObject, removeObjects |
| `apps/api/src/recordings/manifest.service.ts` | Dynamic m3u8 generation | VERIFIED | generateManifest with EXT-X-VERSION:7, EXT-X-MAP, pre-signed URLs |
| `apps/api/src/recordings/retention.processor.ts` | Hourly BullMQ retention cleanup | VERIFIED | @Processor('recording-retention'), per-camera retention |
| `apps/api/src/recordings/schedule.processor.ts` | BullMQ schedule toggle | VERIFIED | @Processor('recording-schedule'), start/stop based on time windows |
| `apps/web/src/app/admin/cameras/components/recordings-tab.tsx` | Full Recordings tab | VERIFIED | Calendar, TimelineBar, HlsPlayer, RecordingControls, RetentionSettings |
| `apps/web/src/app/admin/cameras/components/timeline-bar.tsx` | 24-hour timeline | VERIFIED | Colored segments, drag selection, keyboard accessibility |
| `apps/web/src/app/admin/cameras/components/recording-controls.tsx` | Start/Stop + storage indicator | VERIFIED | Start/stop buttons, REC badge, color-coded Progress bar, toast.error on failures (Plan 04) |
| `apps/web/src/app/admin/cameras/components/schedule-dialog.tsx` | Schedule dialog | VERIFIED | Daily/weekly/custom modes, time inputs, enable toggle |
| `apps/web/src/app/admin/cameras/components/retention-settings.tsx` | Retention settings | VERIFIED | Retention period select, custom input, save button |
| `apps/web/src/app/admin/recordings/page.tsx` | Admin recordings page | VERIFIED | Filters, table, bulk delete |
| `apps/web/src/hooks/use-recordings.ts` | Recording hooks | VERIFIED | All hooks, field mapping fixed (Plan 04) |
| `apps/web/src/components/sidebar-nav.tsx` | Recordings nav entry | VERIFIED | Film icon, "Recordings" under Monitoring |
| `apps/api/src/prisma/seed.ts` | Dev Package with recordings enabled | VERIFIED | Developer package with recordings:true assigned to system org (Plan 04) |
| `apps/api/src/features/features.controller.ts` | Feature check endpoint | VERIFIED | FeatureCheckController with GET /api/features/check (Plan 04) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| srs-callback.controller.ts | recordings.service.ts | recordingsService.archiveSegment() in onHls | WIRED | Lines 114, 138 |
| recordings.service.ts | minio.service.ts | minioService.uploadSegment() | WIRED | In archiveSegment method |
| recordings.controller.ts | manifest.service.ts | manifestService.generateManifest() | WIRED | GET :id/manifest endpoint |
| retention.processor.ts | minio.service.ts | removeObjects during cleanup | WIRED | Line 72 |
| app.module.ts | recordings.module.ts | Module import | WIRED | Lines 26 and 57 |
| camera [id]/page.tsx | recordings-tab.tsx | TabsContent rendering RecordingsTab | WIRED | Import line 56, TabsTrigger line 429, RecordingsTab line 651 |
| use-recordings.ts | recordings API | apiFetch calls | WIRED | 8 distinct apiFetch calls |
| sidebar-nav.tsx | /admin/recordings | Nav entry | WIRED | Film icon, href="/admin/recordings" |
| use-feature-check.ts | /api/features/check | apiFetch GET | WIRED | Plan 04 created matching backend endpoint |
| use-recordings.ts | /api/recordings/storage | apiFetch with field mapping | WIRED | usageBytes->usedBytes, usagePercent->percentage (Plan 04) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| recordings-tab.tsx | recordings, timeline, calendar | use-recordings.ts -> /api/recordings/* | Prisma DB queries | FLOWING |
| recording-controls.tsx | storageQuota | useStorageQuota -> /api/recordings/storage | checkStorageQuota DB aggregation | FLOWING |
| manifest.service.ts | segments | prisma.recordingSegment.findMany | DB query with time range | FLOWING |
| retention.processor.ts | expiredSegments | prisma.recordingSegment.findMany | DB query with date cutoff | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 34 recording tests pass | `npx vitest run tests/recordings/` | 34 passed, 6 files, 1.60s | PASS |
| No anti-patterns detected | grep TODO/FIXME/PLACEHOLDER in recordings/ | 0 matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REC-01 | 07-01, 07-04 | Record camera streams via on_hls callback archiving segments to MinIO/S3 | SATISFIED | archiveSegment, onHls wiring, MinioService, path traversal, 6 archive tests, dev seed |
| REC-02 | 07-02, 07-03 | Browse and playback recorded footage with time-range selection | SATISFIED | ManifestService m3u8, timeline/calendar endpoints, RecordingsTab with Calendar + TimelineBar + HlsPlayer |
| REC-03 | 07-01, 07-03, 07-04 | Start/stop recording per camera | SATISFIED | start/stop service + controller, RecordingControls, error toasts, 7 lifecycle tests |
| REC-04 | 07-02 | Configurable retention policies per camera and per plan | SATISFIED | RetentionProcessor with per-camera + org default fallback, hourly BullMQ, retention settings UI, 6 tests |
| REC-05 | 07-02, 07-03, 07-04 | Storage quota enforcement per organization with alerts | SATISFIED | checkStorageQuota at 100%, alerts at 80%/90%, progress bar, correct field mapping, 5 tests |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No anti-patterns detected |

### Human Verification Required

### 1. Recordings Tab Visual Layout

**Test:** Navigate to any camera detail page, click the Recordings tab
**Expected:** Calendar on left, timeline bar on right, recording controls at top, empty state message when no recordings exist
**Why human:** Visual layout, component composition, and responsive behavior

### 2. Recording Start/Stop Flow

**Test:** Click Start Recording on an online camera, observe state change, then click Stop Recording
**Expected:** Button changes to destructive Stop Recording, red pulsing REC badge, storage updates; error toast on failure (Plan 04 fix); stop confirmation dialog appears
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

No code gaps found. All 4 roadmap success criteria verified at the code level. All 5 requirement IDs (REC-01 through REC-05) satisfied with substantive implementations and 34 passing tests. Plan 04 gap closure successfully addressed FeatureGuard blocking (dev seed), error toast feedback, and storage quota field mapping. No regressions detected.

Human verification is needed for visual layout, interactive behavior, and end-to-end recording playback which require running infrastructure.

---

_Verified: 2026-04-14T05:35:00Z_
_Verifier: Claude (gsd-verifier)_
