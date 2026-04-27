# Phase 17: Recording Playback & Timeline - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Dedicated recording playback page with HLS video player, 24-hour timeline scrubber, and availability heatmap. Accessed by clicking a row in the existing cross-camera `/app/recordings` DataTable. Covers requirements REC-01, REC-02, REC-03. No new recording features, no cross-camera timeline, no frame-level seeking.

</domain>

<decisions>
## Implementation Decisions

### URL & Entry Point
- **D-01:** Playback page lives at `/app/recordings/[id]` — entity-based URL keyed by recording id. Page fetches the recording, derives `cameraId` + `date` from it, then loads the rest (timeline, daily recordings list) for that camera+date.
- **D-02:** Entry point is full-row click in the existing `/app/recordings` DataTable — `router.push('/app/recordings/' + recording.id)`. No new row action; row click takes priority over checkbox selection (checkbox remains in its own column cell). Existing Download/Delete row actions stay unchanged.
- **D-03:** No shareable deep-link query params (no `?focus=HH:MM`). Can be added later if a real use case emerges.

### Date Navigation
- **D-04:** Combined Prev/Next day buttons + Calendar popover. Layout: `[<] [Apr 18, 2026 ▼] [>]`. The date label button opens a `shadcn Calendar` popover with dots under days that have recordings (reuse `useRecordingCalendar` hook).
- **D-05:** Changing the date keeps the same `cameraId` and reloads timeline + recordings list for the new date. If the new date has recordings, auto-select the first one and update URL to that recording id (keeps URL canonical). If no recordings, show empty state on the player and keep current URL.

### Layout
- **D-06:** Stacked layout — same pattern as `recordings-tab.tsx`:
  - Top: HLS player (aspect-video, `max-w-[1024px]`, centered)
  - Middle: TimelineBar (24h heatmap + click-to-seek + drag-select)
  - Bottom: Recordings list (table of recordings for the current date)
- **D-07:** Page header shows camera name + date navigation controls. Back button returns to `/app/recordings` with preserved filter state (browser back works natively because we only use `router.push` for entry).
- **D-08:** No sidebar/split layout, no immersive/full-bleed video — preserves the app's sidebar-nav + main-content style.

### Multi-Recording Day Behavior
- **D-09:** Click on a timeline hour loads the recording that contains that hour (reuse existing `handleSeek` logic from `recordings-tab.tsx:119-134`). When the clicked hour has no recording, do nothing (heatmap already shows which hours are empty).
- **D-10:** No stitched 24-hour manifest. Each recording plays as its own HLS source via `GET /api/recordings/:id/manifest`. Cross-boundary continuous playback is out of scope for this phase — deferred to future if demanded.
- **D-11:** Clicking a row in the bottom recordings list navigates to `/app/recordings/[that-id]` (same page, different recording) — URL always reflects the currently-playing recording.

### Component Reuse
- **D-12:** Reuse existing components verbatim:
  - `TimelineBar` from `apps/web/src/app/admin/cameras/components/timeline-bar.tsx`
  - `HlsPlayer` (mode="vod") from `apps/web/src/app/admin/cameras/components/hls-player.tsx`
  - `Calendar` from `apps/web/src/components/ui/calendar.tsx`
  - Hooks: `useRecordingTimeline`, `useRecordingsList`, `useRecordingCalendar` from `apps/web/src/hooks/use-recordings.ts`
- **D-13:** If a component needs to move to a shared location (e.g., TimelineBar referenced by both admin/cameras and the new playback page), move it to `apps/web/src/components/recordings/` and update the one existing import. Don't duplicate.

### Existing RecordingsTab
- **D-14:** Keep `RecordingsTab` (in admin/cameras camera detail sheet) as-is for this phase. It serves a different workflow (managing recordings from camera context). The new playback page is the primary viewing surface; the tab stays for management.

### Claude's Discretion
- Loading skeleton design for player + timeline + list
- Empty state copy and illustrations (no recordings, no date selected, permission denied)
- Error state handling (recording deleted while viewing, camera deleted, network error)
- Exact spacing, typography, and breadcrumb design
- Whether to add a small "Open in camera detail" link on the playback page (nice-to-have)
- Auto-play behavior on page load (default: pause; user clicks play — same as existing HlsPlayer `autoPlay={false}` in recordings-tab)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Success Criteria
- `.planning/REQUIREMENTS.md` §v1.2/Recording — REC-01, REC-02, REC-03 definitions
- `.planning/ROADMAP.md` §Phase 17 — Goal and success criteria

### Components to Reuse (read before copying patterns)
- `apps/web/src/app/admin/cameras/components/timeline-bar.tsx` — 24h scrubber with heatmap, drag-select, click-to-seek, keyboard nav (move this to shared location per D-13)
- `apps/web/src/app/admin/cameras/components/hls-player.tsx` — HLS player with `mode="vod"` for recording playback, retry logic, cookie-auth XHR
- `apps/web/src/app/admin/cameras/components/recordings-tab.tsx` — Reference implementation that composes Calendar + TimelineBar + HlsPlayer + recordings list (lines 70-376). The new page mirrors this composition.
- `apps/web/src/components/ui/calendar.tsx` — shadcn Calendar with `modifiers` + `modifiersStyles` for day decoration

### Hooks & API
- `apps/web/src/hooks/use-recordings.ts` — `useRecordingStatus` (line 33), `useRecordingTimeline` (line 65), `useRecordingCalendar` (line 98), `useRecordingsList` (line 132), `deleteRecording` (line 219)
- `apps/api/src/recordings/recordings.controller.ts` — `GET /api/recordings/:id` (line 354), `GET /api/recordings/:id/manifest` (line 314), `GET /api/recordings/camera/:cameraId/timeline?date=` (line 156), `GET /api/recordings/camera/:cameraId/calendar?year=&month=` (line 169), `GET /api/recordings/camera/:cameraId?date=` (line 147)
- `apps/api/src/recordings/manifest.service.ts` — `generateManifest(id, orgId, start?, end?)`, `getSegmentsForDate`, `getDaysWithRecordings`

### DataTable Entry Point
- `apps/web/src/app/app/recordings/components/recordings-data-table.tsx` — Current cross-camera DataTable. Wire row click to navigate here (no `onRowClick` prop today — inspect whether to add one to `DataTable` or handle via custom cell)
- `apps/web/src/app/app/recordings/components/recordings-columns.tsx` — Existing columns with Download/Delete row actions (keep as-is)
- `apps/web/src/components/ui/data-table/data-table.tsx` — Base DataTable; check existing row-click support or extend cleanly

### DataTable Pattern (Phase 14 conventions)
- `.planning/phases/14-bug-fixes-datatable-migrations/14-CONTEXT.md` §DataTable Migrations — columns factory + data-table wrapper + faceted filters

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TimelineBar`: 24h scrubber with hour heatmap, drag-to-select range, click-to-seek, keyboard arrow navigation, aria-slider role. Ready to drop into the new page with zero changes.
- `HlsPlayer` (mode="vod"): VOD-specific HLS config (no low-latency mode, 30s buffer, 3 retry attempts), cookie credentials via `xhr.withCredentials`, handles Hls.js + Safari native fallback.
- `useRecordingTimeline(cameraId, 'YYYY-MM-DD')` → `{ hours: [{ hour, hasData }] }` — feeds TimelineBar directly.
- `useRecordingCalendar(cameraId, year, month)` → `{ days: number[] }` — feeds Calendar popover day-dot modifiers.
- `useRecordingsList(cameraId, 'YYYY-MM-DD')` → `{ recordings: Recording[] }` — feeds daily recordings list.
- `GET /api/recordings/:id` returns recording with `cameraId` and `startedAt` — use these to derive camera+date when entering via recording id.

### Established Patterns
- Client-side routing: `useRouter().push()` from `next/navigation` (App Router)
- URL state via `useSearchParams()` for filters (see `recordings-data-table.tsx:44`)
- API calls via `apiFetch<T>()` with same-origin credentials (Next.js rewrites)
- Error toasts via `sonner` `toast()` / `toast.error()`
- Loading via `Skeleton` components; empty states inline in the component
- Feature gating via `useFeatureCheck('recordings')` + `FeatureGateEmptyState`

### Integration Points
- New route: `apps/web/src/app/app/recordings/[id]/page.tsx` (new file)
- Entry point modification: `recordings-data-table.tsx` — wire row click to navigate
- Admin parity: `admin/recordings/page.tsx` currently redirects to `/app/recordings`; the new `[id]` route naturally works for both since admin uses the same app surface
- Feature gate: wrap new page in `useFeatures` / `isEnabled('recordings')` like the existing page (`recordings/page.tsx:10-20`)
- Keep `admin/cameras` `RecordingsTab` untouched — it continues to serve the camera-context workflow

</code_context>

<specifics>
## Specific Ideas

- Date navigation UI: `[<]` `[Apr 18, 2026 ▼]` `[>]` — matches patterns in Google Calendar, Airbnb
- Full row click is the entry (not a secondary action menu) — users expect click-to-play in recording tables (YouTube, Photos, Linear detail pages)
- TimelineBar stays 24h (0-23) for this phase — zoom levels (6h/1h) are deferred as REC-04
- No cross-camera timeline in this phase — deferred as REC-05

</specifics>

<deferred>
## Deferred Ideas

- **Stitched 24h manifest with discontinuity tags** — best-UX cross-recording seek, but requires new `ManifestService.generateDailyManifest()` + HLS discontinuity handling. Revisit if user feedback shows frequent cross-boundary playback needs.
- **Shareable deep-link `?focus=HH:MM`** — for incident investigation links. Add when a use case emerges.
- **Timeline zoom levels (6h, 1h)** — already tracked as REC-04 future requirement.
- **Cross-camera timeline view** — already tracked as REC-05 future requirement.
- **Frame-level seeking with thumbnail sprites** — explicitly out of scope per REQUIREMENTS.md.
- **Split layout (player + sidebar list)** — considered, deferred to keep scope tight; revisit if desktop users ask.
- **Back button preserves exact filter state via URL** — browser back handles it for now; explicit state preservation can be added later if `router.replace` ever breaks this.

</deferred>

---

*Phase: 17-recording-playback-timeline*
*Context gathered: 2026-04-18*
