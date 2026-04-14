---
phase: 07-recordings
plan: 03
subsystem: ui
tags: [recordings, react, next.js, calendar, timeline, hls-player, schedule, retention, shadcn]

requires:
  - phase: 07-recordings
    provides: "RecordingsService, ManifestService, ScheduleProcessor, RetentionProcessor, storage quota (07-01, 07-02)"
  - phase: 05-monitoring
    provides: "Polling hook patterns (useRef interval cleanup), camera detail 5-tab structure, sidebar-nav patterns"
provides:
  - "RecordingsTab component with calendar, timeline bar, HLS player, recording controls"
  - "TimelineBar 24-hour visual component with drag selection"
  - "RecordingControls start/stop with storage usage indicator"
  - "ScheduleDialog for recording schedule configuration"
  - "RetentionSettings for per-camera retention policy"
  - "Recordings admin page at /admin/recordings with filters and bulk delete"
  - "Sidebar nav Recordings entry under Monitoring group"
  - "use-recordings.ts hooks for all recording API interactions"
affects: []

tech-stack:
  added: [react-day-picker, shadcn-calendar, shadcn-toggle]
  patterns: [recordings-tab-composition, timeline-bar-drag-selection, feature-gated-tab]

key-files:
  created:
    - apps/web/src/hooks/use-recordings.ts
    - apps/web/src/app/admin/cameras/components/recordings-tab.tsx
    - apps/web/src/app/admin/cameras/components/timeline-bar.tsx
    - apps/web/src/app/admin/cameras/components/recording-controls.tsx
    - apps/web/src/app/admin/cameras/components/schedule-dialog.tsx
    - apps/web/src/app/admin/cameras/components/retention-settings.tsx
    - apps/web/src/app/admin/recordings/page.tsx
    - apps/web/src/components/ui/calendar.tsx
    - apps/web/src/components/ui/toggle.tsx
  modified:
    - apps/web/src/app/admin/cameras/[id]/page.tsx
    - apps/web/src/components/sidebar-nav.tsx
    - apps/web/package.json

key-decisions:
  - "Shadcn Calendar and Toggle components added via CLI for consistent UI"
  - "Feature gate wraps entire Recordings tab with upgrade prompt when disabled"
  - "Timeline bar uses mouse drag for range selection with keyboard accessibility"

patterns-established:
  - "Tab composition pattern: RecordingsTab orchestrates sub-components (controls, calendar, timeline, player, list)"
  - "Feature-gated tab: useFeatures check with fallback upgrade message"

requirements-completed: [REC-02, REC-03, REC-05]

duration: 3min
completed: 2026-04-13
---

# Phase 07 Plan 03: Recordings Frontend Summary

**Recordings UI with camera detail tab (calendar, timeline bar, HLS player, start/stop controls), schedule dialog, retention settings, and admin recordings list page**

## Performance

- **Duration:** ~3 min (continuation from checkpoint approval)
- **Started:** 2026-04-13T12:50:00Z
- **Completed:** 2026-04-13T12:53:00Z
- **Tasks:** 3 (2 auto + 1 checkpoint)
- **Files modified:** 14

## Accomplishments
- Camera detail page now has 6th "Recordings" tab with full recording management UI
- Timeline bar provides 24-hour visual with drag-to-select range for playback
- Recording controls enable start/stop recording with real-time storage usage indicator
- Schedule dialog allows daily/weekly/custom recording schedule configuration
- Retention settings support per-camera retention policy override
- Admin recordings page at /admin/recordings with camera/date/status filters and bulk delete
- Sidebar navigation updated with "Recordings" entry under Monitoring group

## Task Commits

Each task was committed atomically:

1. **Task 1: Recording hooks, RecordingsTab, timeline bar, recording controls, camera detail integration** - `d005500` (feat)
2. **Task 2: Schedule dialog, retention settings, recordings admin page, sidebar nav** - `1259616` (feat)
3. **Task 3: Visual verification of Recordings UI** - checkpoint approved (no code changes)

## Files Created/Modified
- `apps/web/src/hooks/use-recordings.ts` - Custom hooks for all recording API interactions (status, timeline, calendar, list, storage, mutations)
- `apps/web/src/app/admin/cameras/components/recordings-tab.tsx` - Main Recordings tab composing calendar, timeline, player, controls, retention
- `apps/web/src/app/admin/cameras/components/timeline-bar.tsx` - 24-hour horizontal timeline with colored segments and drag selection
- `apps/web/src/app/admin/cameras/components/recording-controls.tsx` - Start/Stop recording buttons with storage usage progress bar
- `apps/web/src/app/admin/cameras/components/schedule-dialog.tsx` - Recording schedule dialog with daily/weekly/custom modes
- `apps/web/src/app/admin/cameras/components/retention-settings.tsx` - Per-camera retention policy configuration
- `apps/web/src/app/admin/recordings/page.tsx` - Admin recordings list with filters and bulk delete
- `apps/web/src/app/admin/cameras/[id]/page.tsx` - Added 6th Recordings tab trigger and content
- `apps/web/src/components/sidebar-nav.tsx` - Added Recordings nav item under Monitoring
- `apps/web/src/components/ui/calendar.tsx` - Shadcn Calendar component (added via CLI)
- `apps/web/src/components/ui/toggle.tsx` - Shadcn Toggle component (added via CLI)

## Decisions Made
- Shadcn Calendar and Toggle components installed via CLI for UI consistency
- Feature gate wraps entire Recordings tab -- disabled orgs see upgrade prompt
- Timeline bar uses mouse drag for range selection with keyboard arrow key accessibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Recordings frontend complete -- all UI components wired to backend API endpoints from plans 01 and 02
- Phase 07 recordings feature is fully implemented (backend + frontend)
- Ready for end-to-end integration testing with running SRS + FFmpeg pipeline

## Self-Check: PASSED

- All 7 created files verified present on disk
- Commit d005500 (Task 1) verified in git log
- Commit 1259616 (Task 2) verified in git log

---
*Phase: 07-recordings*
*Completed: 2026-04-13*
