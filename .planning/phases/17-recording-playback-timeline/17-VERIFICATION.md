---
phase: 17-recording-playback-timeline
verified: 2026-04-18T18:48:00Z
status: passed
human_uat_resolved: 2026-04-21
score: 13/13 must-haves verified
re_verification: false
human_verification:
  - test: "Real HLS video plays end-to-end"
    expected: "Open /app/recordings/[valid-id] in Chrome and Safari, click play, video renders without error and plays through to the end"
    why_human: "jsdom has no MediaSource — hls.js cannot be exercised end-to-end in automated tests"
  - test: "Timeline scrubbing UX feels smooth"
    expected: "Click + drag across the 24h bar produces smooth visual feedback; arrow-key navigation moves the selected range; keyboard Enter triggers a seek"
    why_human: "Pixel-level interaction and visual feedback are not reliably testable in jsdom"
  - test: "Heatmap colors visually distinguish has-data from empty hours"
    expected: "Visually inspect timeline; bg-chart-1 cells contrast clearly against bg-transparent/bg-muted base; user can see at a glance which hours have footage"
    why_human: "Color/contrast verification requires real DOM rendering"
  - test: "Browser back button traverses recording history correctly"
    expected: "Navigate list -> recording A -> change date to B -> recording B' -> click Back twice; lands on A then list"
    why_human: "Multi-step browser history requires a real browser session"
  - test: "Calendar dot decoration appears on days with recordings"
    expected: "Open the calendar popover from the playback page header; dots appear under days with recordings, no dots on empty days; navigating months refreshes the dots"
    why_human: "shadcn Calendar modifiers render via real DOM styles (after:bg-chart-1 pseudo-element)"
---

# Phase 17: Recording Playback & Timeline Verification Report

**Phase Goal:** Users can play back recorded footage with a visual timeline for navigation
**Verified:** 2026-04-18T18:48:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Sources merged: ROADMAP.md Success Criteria (3) + plan must_haves frontmatter truths from 17-01..17-04 (deduplicated).

| #   | Truth                                                                                                                                          | Status     | Evidence                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ROADMAP SC1: User can click a recording and play it back via an HLS player on a dedicated playback page                                        | ✓ VERIFIED | `/app/recordings/[id]/page.tsx` mounts `<HlsPlayer key={id} src=/api/recordings/${id}/manifest>`; entry wired via DataTable onRowClick |
| 2   | ROADMAP SC2: Playback page has a 24-hour timeline scrubber bar that user can click to seek to any point in time                                | ✓ VERIFIED | `<TimelineBar>` mounted on page; `handleSeek` navigates to recording containing the clicked hour (REC-02 click-to-seek test GREEN) |
| 3   | ROADMAP SC3: Timeline displays an availability heatmap showing which hours have recorded footage and which do not                              | ✓ VERIFIED | TimelineBar applies `bg-chart-1` for hours with `hasData=true`; 3 GREEN heatmap tests confirm contract                            |
| 4   | Plan 17-01: Clicking any non-interactive cell in the recordings DataTable navigates to /app/recordings/[id]                                    | ✓ VERIFIED | recordings-data-table.tsx:307 `router.push('/app/recordings/'+row.id)`; FOUND-01f tests GREEN                                     |
| 5   | Plan 17-01: Checkbox + actions cells stop propagation; do not navigate                                                                          | ✓ VERIFIED | recordings-columns.tsx wraps Checkbox + DataTableRowActions in `<div onClick={(e)=>e.stopPropagation()}>` (2 grep tests GREEN)    |
| 6   | Plan 17-01: Pressing Enter on a focused row navigates                                                                                            | ✓ VERIFIED | data-table.tsx:194-203 onKeyDown handles Enter+Space; FOUND-01f tabIndex+Enter test GREEN                                         |
| 7   | Plan 17-02: GET /api/recordings/:id returns recording with camera+site+project                                                                  | ✓ VERIFIED | recordings.service.ts:464-486 findFirst with full include; get-recording.test.ts "returns camera include" GREEN                   |
| 8   | Plan 17-02: GET /api/recordings/:id returns 404 for cross-org id (T-17-V4)                                                                     | ✓ VERIFIED | recordings.service.ts:465 `where:{id, orgId}` (findFirst); get-recording.test.ts "cross-org 404" GREEN                            |
| 9   | Plan 17-02: useRecording hook exposes 3-state error union ('not-found' \| 'forbidden' \| 'network' \| null)                                    | ✓ VERIFIED | use-recordings.ts:80-118 hook impl; 7 GREEN tests in use-recording-hook.test.ts                                                   |
| 10  | Plan 17-02: useRecording(undefined) returns loading=false, recording=null, no apiFetch call                                                    | ✓ VERIFIED | use-recordings.ts:88-93 short-circuit; "does NOT call apiFetch" test GREEN                                                        |
| 11  | Plan 17-03: HlsPlayer + TimelineBar live at @/components/recordings/* and admin/cameras consumers re-wired                                     | ✓ VERIFIED | shared files exist; old admin paths deleted; recordings-tab.tsx:38-39 + view-stream-sheet.tsx:18 use alias paths                  |
| 12  | Plan 17-03: HlsPlayer xhrSetup withCredentials survives the move (T-17-V3)                                                                      | ✓ VERIFIED | hls-player.tsx:38 `xhr.withCredentials = true` confirmed by grep                                                                  |
| 13  | Plan 17-04: Page renders distinct error UI per useRecording state (404 generic copy, 403 FeatureGate, network Retry); feature-gate works       | ✓ VERIFIED | page.tsx:129-169 + 121-128 branches; 3 error-state tests + 2 feature-gate tests GREEN                                             |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact                                                                                                          | Expected                                                       | Status     | Details                                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `apps/web/src/app/app/recordings/[id]/page.tsx`                                                                   | Dynamic route composing feature gate + hooks + sub-components  | ✓ VERIFIED | 213 lines; 'use client' + useParams/useRouter + manifest URL + all hooks present              |
| `apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx`                                        | Back / camera name / site·project / Prev-Calendar-Next nav    | ✓ VERIFIED | Created in 17-04; ArrowLeft + ChevronLeft/Right + Calendar Popover with day-dot modifier      |
| `apps/web/src/app/app/recordings/[id]/components/recordings-list.tsx`                                             | Bottom day-recordings table with current-row Play icon highlight | ✓ VERIFIED | Created in 17-04; bg-accent/40 highlight + Play icon + keyboard activation                   |
| `apps/web/src/components/recordings/hls-player.tsx`                                                               | Moved HLS player; withCredentials preserved                    | ✓ VERIFIED | Moved via git mv (history preserved); withCredentials at line 38                              |
| `apps/web/src/components/recordings/timeline-bar.tsx`                                                             | Moved 24h timeline scrubber                                    | ✓ VERIFIED | Moved via git mv; bg-chart-1 applied for hasData=true at line 154                             |
| `apps/web/src/components/ui/data-table/data-table.tsx`                                                            | onRowClick prop + cursor-pointer + tabIndex + Enter/Space      | ✓ VERIFIED | Lines 55, 72, 188-203 implement all 3 wirings, gated by handler presence                      |
| `apps/web/src/app/app/recordings/components/recordings-data-table.tsx`                                            | router.push('/app/recordings/'+row.id) handler                 | ✓ VERIFIED | Line 307 (handleRowClick) + onRowClick={handleRowClick} on DataTable                          |
| `apps/web/src/app/app/recordings/components/recordings-columns.tsx`                                               | stopPropagation wrappers on Checkbox + actions cells           | ✓ VERIFIED | 2 wrapper divs at lines 54 + 155 (locked by 2 source-grep tests in data-table.test.tsx)       |
| `apps/web/src/app/admin/cameras/components/recordings-tab.tsx`                                                    | Imports from @/components/recordings/*                         | ✓ VERIFIED | Lines 38-39 use alias paths; old `./hls-player` import removed                                |
| `apps/web/src/app/admin/cameras/components/hls-player.tsx`                                                        | Must NOT exist (moved by 17-03)                                | ✓ VERIFIED | File absent (`ls` returns ENOENT)                                                             |
| `apps/web/src/hooks/use-recordings.ts`                                                                            | useRecording hook + RecordingWithCamera + RecordingLoadError    | ✓ VERIFIED | Line 80-118 hook impl; types at lines 28+ ; existing hooks untouched                          |
| `apps/api/src/recordings/recordings.service.ts`                                                                   | getRecording uses findFirst({where:{id,orgId}}) + camera include | ✓ VERIFIED | Lines 463-487 use findFirst with full include + NotFoundException                             |

### Key Link Verification

| From                                                  | To                                       | Via                                | Status   | Details                                                          |
| ----------------------------------------------------- | ---------------------------------------- | ---------------------------------- | -------- | ---------------------------------------------------------------- |
| recordings-data-table.tsx                             | /app/recordings/[id]                     | router.push in handleRowClick      | ✓ WIRED  | grep returns line 307 with literal path                          |
| data-table.tsx                                        | consumer onRowClick callback             | TableRow onClick                   | ✓ WIRED  | Lines 188-203 wire className+onClick+tabIndex+onKeyDown together |
| page.tsx [id] route                                   | /api/recordings/:id/manifest             | HlsPlayer src prop                 | ✓ WIRED  | Line 115 `useMemo(() => /api/recordings/${id}/manifest)` -> line 189 src={hlsSrc} |
| page.tsx                                              | router.push('/app/recordings/'+target)   | handleSeek + date-change effect    | ✓ WIRED  | Lines 80, 95, 110 — all push targets                             |
| page.tsx                                              | @/hooks/use-recordings                   | import                             | ✓ WIRED  | Line 10-15 imports useRecording, useRecordingTimeline, useRecordingsList, useRecordingCalendar |
| page.tsx                                              | @/components/recordings/{hls-player,timeline-bar} | import                       | ✓ WIRED  | Lines 17-18 import from shared dir                               |
| useRecording hook                                     | /api/recordings/:id                      | apiFetch<RecordingWithCamera>      | ✓ WIRED  | use-recordings.ts:97 `apiFetch<RecordingWithCamera>(/api/recordings/${id})` |
| RecordingsService.getRecording                        | prisma.recording.findFirst               | where:{id,orgId} include camera    | ✓ WIRED  | Lines 463-486 — full include shape verified                      |
| recordings-tab.tsx (admin)                            | @/components/recordings/hls-player       | import                             | ✓ WIRED  | Line 38 alias path                                               |
| recordings-tab.tsx (admin)                            | @/components/recordings/timeline-bar     | import                             | ✓ WIRED  | Line 39 alias path                                               |

### Data-Flow Trace (Level 4)

| Artifact                                  | Data Variable               | Source                                                              | Produces Real Data | Status      |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------------- | ------------------ | ----------- |
| page.tsx HlsPlayer                        | `hlsSrc`                    | useMemo derived from useParams id (router-controlled UUID)          | Yes                | ✓ FLOWING   |
| page.tsx PlaybackPageHeader               | `recording.camera.{name,site,project}` | useRecording -> apiFetch -> RecordingsService.getRecording (findFirst with camera include) | Yes | ✓ FLOWING   |
| page.tsx TimelineBar                      | `hours`                     | useRecordingTimeline -> apiFetch /api/recordings/camera/:id/timeline?date= | Yes | ✓ FLOWING   |
| page.tsx RecordingsList                   | `recordings`                | useRecordingsList -> apiFetch /api/recordings?cameraId=&date=       | Yes                | ✓ FLOWING   |
| page.tsx Calendar (via header)            | `days`                      | useRecordingCalendar -> apiFetch /api/recordings/camera/:id/calendar | Yes               | ✓ FLOWING   |

### Behavioral Spot-Checks

| Behavior                                                     | Command                                                                                       | Result                                          | Status |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------ |
| Phase 17 web vitest spec files all GREEN                     | `cd apps/web && pnpm vitest run src/__tests__/{playback-page,playback-page-feature-gate,timeline-bar,data-table,use-recording-hook}.{test.tsx,test.ts}` | 5 files / 31 tests passed in 2.09s | ✓ PASS |
| API getRecording cross-org 404 + camera include tests GREEN  | `cd apps/api && pnpm vitest run tests/recordings/get-recording.test.ts`                       | 1 file / 4 tests passed in 341ms                | ✓ PASS |
| Shared HlsPlayer preserves withCredentials                   | `grep -n withCredentials apps/web/src/components/recordings/hls-player.tsx`                   | line 38: `xhr.withCredentials = true;`          | ✓ PASS |
| Old admin/cameras component paths fully removed              | `ls apps/web/src/app/admin/cameras/components/{hls-player,timeline-bar}.tsx`                  | ENOENT for both                                 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                  | Status      | Evidence                                                                                                                 |
| ----------- | ----------- | ---------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| REC-01      | 17-00, 17-01, 17-02, 17-04 | User สามารถเล่น recording ผ่าน HLS player ในหน้า playback ได้ | ✓ SATISFIED | Page mounts HlsPlayer with manifest URL; cross-camera DataTable navigates to it; useRecording hook + getRecording wired  |
| REC-02      | 17-00, 17-04               | หน้า playback มี timeline scrubber (24h bar) สำหรับ click-to-seek           | ✓ SATISFIED | TimelineBar mounted; handleSeek navigates to recording containing hour; empty-hour no-op test GREEN                      |
| REC-03      | 17-00, 17-03, 17-04        | Timeline แสดง hour availability heatmap                                      | ✓ SATISFIED | TimelineBar renders bg-chart-1 for hasData=true; 3 GREEN heatmap tests; useRecordingTimeline supplies data               |

No orphaned requirements detected — REC-01/02/03 are the only IDs mapped to Phase 17 in REQUIREMENTS.md (lines 104-106), and all three appear in plan frontmatter `requirements` fields.

### Anti-Patterns Found

| File                                                                       | Line | Pattern                          | Severity | Impact                                                                                                |
| -------------------------------------------------------------------------- | ---- | -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| apps/web/src/app/app/recordings/[id]/page.tsx                              | 132  | "Recording not available" string match | ℹ️ Info  | False-positive — this is the intentional T-17-V7 mitigation copy for cross-org 404, not a placeholder |

Zero TODO/FIXME/HACK/PLACEHOLDER markers in any phase-17 source file. No empty-handler patterns, no static-empty returns from API routes, no console.log-only implementations.

### Human Verification Required

Five items require human testing — see `human_verification` in frontmatter for machine-readable form.

1. **Real HLS video plays end-to-end**
   - Open `/app/recordings/[valid-id]` in Chrome and Safari
   - Click play; expect video to render without error and play through to the end
   - Why human: jsdom has no MediaSource API; hls.js cannot be exercised end-to-end in automated tests

2. **Timeline scrubbing UX feels smooth**
   - Click + drag across the 24h bar
   - Use ArrowLeft/ArrowRight to nudge the selected range; press Enter to seek
   - Why human: Pixel-level interaction and visual feedback are not reliably testable in jsdom

3. **Heatmap colors visually distinguish has-data from empty hours**
   - Visually inspect the timeline on a day with mixed data
   - Why human: Color/contrast verification requires real DOM rendering

4. **Browser back-button traverses recording history correctly**
   - Navigate list -> recording A -> change date to B -> auto-navigates to recording B' -> click Back twice
   - Expect: lands on recording A then on the recordings list
   - Why human: Multi-step browser history requires a real session

5. **Calendar dot decoration appears on days with recordings**
   - Open the Calendar popover from the playback page header
   - Expect: dots under days with recordings, no dots on empty days; navigating months refreshes the dots
   - Why human: shadcn Calendar modifiers render via real DOM styles (after:bg-chart-1 pseudo-element)

### Gaps Summary

No gaps. All 13 must-haves verified. All 3 ROADMAP success criteria satisfied by automated evidence. All 3 requirements (REC-01/02/03) satisfied. The only remaining work is the 5 human-verification items above — these are inherent limitations of the jsdom test environment and the visual/multi-browser nature of the experience, NOT implementation gaps.

The phase is functionally complete and architecturally sound:
- Security: T-17-V4 (cross-org 404), T-17-V7 (3-state error UI), T-17-V3 (xhrSetup withCredentials), T-17-V12 (proxied segment URLs unchanged) — all mitigated and verified
- Decisions: D-01..D-14 from CONTEXT.md all implemented per the plan summaries
- Tests: 35 tests across 6 files all GREEN (31 web + 4 API)
- TypeScript: Clean across both apps/web and apps/api
- Validation: 17-VALIDATION.md frontmatter `nyquist_compliant: true`, `wave_0_complete: true`, `status: complete`

---

_Verified: 2026-04-18T18:48:00Z_
_Verifier: Claude (gsd-verifier)_
