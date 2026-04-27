---
phase: 17-recording-playback-timeline
plan: 04
subsystem: ui
tags: [nextjs, react, hls.js, vitest, shadcn, recordings, playback, timeline, app-router]

requires:
  - phase: 17-recording-playback-timeline (plan 17-00)
    provides: it.todo scaffolds in playback-page.test.tsx + playback-page-feature-gate.test.tsx; STATE/VALIDATION wiring
  - phase: 17-recording-playback-timeline (plan 17-01)
    provides: DataTable.onRowClick API wired in recordings-data-table for entry navigation
  - phase: 17-recording-playback-timeline (plan 17-02)
    provides: useRecording(id) hook with 3-state error API; GET /api/recordings/:id with camera+site+project include + cross-org 404
  - phase: 17-recording-playback-timeline (plan 17-03)
    provides: HlsPlayer + TimelineBar moved to apps/web/src/components/recordings/* with xhr.withCredentials preserved

provides:
  - "/app/recordings/[id] dynamic route — composes feature gate + useRecording + HlsPlayer (mode=vod, autoPlay=false) + TimelineBar + PlaybackPageHeader + RecordingsList"
  - "PlaybackPageHeader sub-component — Back / camera name / site·project / Prev-Calendar-Next date nav with day-dot modifier"
  - "RecordingsList sub-component — plain Table (Time Range/Duration/Size/Status) with current-row Play-icon + bg-accent/40 highlight"
  - "Three discriminated error states: 'not-found' → 'Recording not available' (T-17-V7); 'forbidden' → FeatureGateEmptyState; 'network' → Retry CTA"
  - "Date-change effect (D-05) — auto-navigates to first recording on the newly selected date"
  - "Timeline click-to-seek + range-select handlers (D-09) — empty hours are no-ops"
  - "9 GREEN tests covering REC-01, REC-02 click-to-seek, REC-02 empty-hour no-op, date-change navigation, 3 error states, and 2 feature-gate paths"

affects:
  - phase 18 dashboard-map-polish (any future page that needs to compose feature gate + entity fetch + 3-state error UI can mirror this pattern)
  - admin/cameras/recordings-tab.tsx (regression-protected — still uses shared HlsPlayer with cookie-auth XHR)

tech-stack:
  added: []
  patterns:
    - "Page-level dynamic route reading useParams + useRouter (App Router) and orchestrating multiple data hooks (useRecording, useRecordingTimeline, useRecordingsList, useRecordingCalendar)"
    - "useRecording 3-state discriminated error → distinct UI (not-found generic copy, forbidden=FeatureGateEmptyState, network=Retry) — closes T-17-V4 enumeration channel at the UI layer"
    - "HlsPlayer remount via key={id} — guarantees clean teardown when navigating between recordings on the same page"
    - "Plan-template Pitfall pattern: initialize selectedDate from recording exactly once via didInitDate flag; track displayedMonth independently of selectedDate"

key-files:
  created:
    - apps/web/src/app/app/recordings/[id]/page.tsx
    - apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx
    - apps/web/src/app/app/recordings/[id]/components/recordings-list.tsx
  modified:
    - apps/web/src/__tests__/playback-page.test.tsx
    - apps/web/src/__tests__/playback-page-feature-gate.test.tsx
    - .planning/phases/17-recording-playback-timeline/17-VALIDATION.md

key-decisions:
  - "Used PopoverTrigger render={...} (base-ui pattern) instead of asChild — matches established project convention in notification-bell, data-table-faceted-filter, date-picker"
  - "Empty-hour no-op test: assert pushMock not called at all (instead of arguments) — date-change effect won't fire when recordings list is empty, so a clean negative assertion is reliable"
  - "key={id} on HlsPlayer to force a clean unmount/remount per recording — matches existing recordings-tab pattern and avoids stale Hls.js state across navigations"
  - "Date-change navigation is encoded as an effect (not in onDateChange callback) so it correctly waits for the recordings list refetch to settle for the newly selected dateStr"
  - "Two-state didInitDate guard prevents the recording-load → setSelectedDate effect from clobbering user-driven date changes after first mount"

patterns-established:
  - "Pattern 1 (3-state error UI): hooks return discriminated 'not-found' | 'forbidden' | 'network' | null; pages render distinct copy/CTA per case; no leakage of 403 vs 404 vs deleted to the user (security-by-UI)"
  - "Pattern 2 (App Router dynamic route composition): page.tsx remains a single server-of-truth orchestrator — sub-components own UI shape, hooks own data, page owns lifecycle wiring + navigation"
  - "Pattern 3 (regression-by-grep): explicit grep checks for cross-cutting invariants (xhr.withCredentials, shared component import path) listed in plan acceptance criteria — cheap, language-agnostic, survives refactors"

requirements-completed: [REC-01, REC-02, REC-03]

duration: 27min
completed: 2026-04-19
---

# Phase 17 Plan 04: Playback Page (Compose & Wire) Summary

**`/app/recordings/[id]` route delivers REC-01/02/03 by composing feature gate, useRecording (3-state error), HlsPlayer (mode=vod, key={id}), TimelineBar (click-to-seek + range), Calendar popover date nav, and a plain-Table day-recordings list — replacing 9 it.todo stubs with GREEN tests.**

## Performance

- **Duration:** ~27 min
- **Started:** 2026-04-19T18:15:00Z
- **Completed:** 2026-04-19T18:42:58Z
- **Tasks:** 2
- **Files created:** 3 (page.tsx + 2 sub-components)
- **Files modified:** 3 (2 test files + 17-VALIDATION.md)

## Accomplishments

- Dedicated playback page at `/app/recordings/[id]` reachable from the cross-camera DataTable (D-01, D-02)
- Stacked layout per UI-SPEC §Page-Level Layout — header (Back + camera name + site·project + date nav) → centered HlsPlayer (max-w-[1024px], aspect-video) → TimelineBar → RecordingsList (D-06, D-07)
- All locked decisions D-01..D-14 implemented and verified
- Three distinct error UIs (not-found / forbidden / network) closing the T-17-V7 information-disclosure channel at the UI layer
- 9 GREEN tests covering REC-01 (HlsPlayer src), REC-02 click-to-seek, REC-02 empty-hour no-op, date-change navigation, 3 error states, and 2 feature-gate paths
- Full web suite GREEN (158 tests across 25 files) — D-14 RecordingsTab regression guard satisfied

## Task Commits

Each task was committed atomically:

1. **Task 1: Create PlaybackPageHeader and RecordingsList sub-components** — `587fd91` (feat)
2. **Task 2: Create the playback page route + replace it.todo with GREEN tests** — `281ccf4` (feat)

## Files Created/Modified

### Created
- `apps/web/src/app/app/recordings/[id]/page.tsx` — Dynamic route. Reads `[id]` via useParams, fetches recording, derives cameraId/dateStr, composes feature gate + 3-state error UI + sub-surfaces. Mounts `<HlsPlayer key={id} src=/api/recordings/${id}/manifest autoPlay={false} mode="vod" />`.
- `apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx` — Back button + camera name (h1) + site·project subheading + Prev/Calendar-popover/Next date nav. Calendar uses `modifiers.hasRecording` with `after:bg-chart-1` Tailwind dot. Next button disabled when `selectedDate >= today`.
- `apps/web/src/app/app/recordings/[id]/components/recordings-list.tsx` — Plain Table (Time Range / Duration / Size / Status). Current row prefixed with `Play` icon (text-primary) + `bg-accent/40` highlight. Keyboard Enter/Space activates onRowClick. Empty state copy matches UI-SPEC.

### Modified
- `apps/web/src/__tests__/playback-page.test.tsx` — Replaced 7 it.todo stubs with 7 GREEN tests. Added HlsPlayer + TimelineBar mocks that capture src and timeline props.
- `apps/web/src/__tests__/playback-page-feature-gate.test.tsx` — Replaced 2 it.todo stubs with 2 GREEN tests. Enabled-path test asserts positive HlsPlayer mount + camera-name signal (not just absence of disabled copy).
- `.planning/phases/17-recording-playback-timeline/17-VALIDATION.md` — All 13 verification rows flipped to ✅ green; Wave 0 and Sign-Off checklists checked; frontmatter `nyquist_compliant: true`, `wave_0_complete: true`, `status: complete`.

## Decisions Made

- **PopoverTrigger render prop over asChild** — The project uses `@base-ui/react/popover` which exposes a `render={...}` API rather than Radix's `asChild`. Matched the established convention used in `notification-bell.tsx`, `data-table-faceted-filter.tsx`, and `date-picker.tsx`. The plan example showed `asChild`; corrected during write to align with the codebase.
- **Empty-hour no-op assertion form** — The plan suggested allowing an early date-change push to fire and then asserting no NEW push. With recordings=[], the date-change effect's `if (!recordings.length)` guard prevents any navigation, so a clean `expect(pushMock).not.toHaveBeenCalled()` after `pushMock.mockClear()` is the most robust assertion. Kept the test deterministic.
- **key={id} on HlsPlayer** — Forces clean unmount/remount per recording navigation, preventing stale hls.js instances; matches existing `recordings-tab.tsx` usage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Switched PopoverTrigger from asChild to render prop**
- **Found during:** Task 1 (PlaybackPageHeader creation)
- **Issue:** Plan code sample used `<PopoverTrigger asChild>` (Radix pattern), but the project's `Popover` is from `@base-ui/react/popover` which doesn't accept `asChild` — would have produced a TypeScript error.
- **Fix:** Used `<PopoverTrigger render={<Button …>...</Button>} />` — the established base-ui pattern in `notification-bell.tsx`, `data-table-faceted-filter.tsx`, `date-picker.tsx`.
- **Files modified:** `apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx`
- **Verification:** `pnpm tsc --noEmit -p tsconfig.json` exits 0; date-change navigation test exercises the Next-day button which sits in the same nav row and renders cleanly.
- **Committed in:** `587fd91` (Task 1 commit)

**2. [Rule 3 — Blocking] Escaped apostrophe in error copy**
- **Found during:** Task 2 (page.tsx creation)
- **Issue:** The literal `Couldn't load recording` triggers Next.js / React JSX rule `react/no-unescaped-entities`.
- **Fix:** Wrote `Couldn&apos;t load recording`. The user-visible text remains identical and the network-error test (`screen.findByText(/Retry/i)`) still passes.
- **Files modified:** `apps/web/src/app/app/recordings/[id]/page.tsx`
- **Verification:** `pnpm tsc --noEmit -p tsconfig.json` exits 0; full web suite (158 tests) GREEN.
- **Committed in:** `281ccf4` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking integration points). No Rule 1 (bug), no Rule 2 (missing critical), no Rule 4 (architectural).
**Impact on plan:** Both fixes were minor adaptation to the existing codebase conventions (base-ui Popover API + JSX entity escaping). No scope creep, no behavior change versus plan intent.

## UI-SPEC Reconciliation Notes

None required. The `FeatureGateEmptyState` component already renders `Recordings are not included in your plan` (confirmed by reading `apps/web/src/components/feature-gate-empty-state.tsx:16` — `{featureName} {verb} not included in your plan`), which matches both the existing `recordings-feature-gate.test.tsx` selector and the new playback-page tests. UI-SPEC §Page-Level Error / Edge States states "Render existing FeatureGateEmptyState with featureSlug='recordings'" — exact match. No source-of-truth conflict.

## Issues Encountered

- **No `node_modules` in worktree** — The agent worktree at `.claude/worktrees/agent-a268c959` had no `node_modules` directory, blocking `pnpm tsc --noEmit` and `pnpm test` from resolving binaries. **Resolution:** Symlinked the main repo's `node_modules` (root + `apps/web/node_modules` + `apps/api/node_modules`) into the worktree. Symlinks are not staged (gitignore matches `node_modules/` directories, but git's untracked-files report still lists the symlinks; they are excluded from all commits by explicit `git add` of task files only).
- **`pnpm test --run` rejected** — pnpm interprets `--run` as a pnpm flag instead of forwarding to vitest. **Resolution:** Used `pnpm test -- <files> --run`. Same pattern works for any nested vitest flag.

## Threat Surface Scan

No new threat surface beyond the plan's `<threat_model>`. The page introduces no new endpoints, no new auth path, no new file/cookie access, and no new schema. All `router.push` targets are constructed from server-supplied UUIDs (no user-controllable redirect target). Camera name flows through React JSX text (auto-escaped — T-17-XSS mitigated). No `dangerouslySetInnerHTML` anywhere.

## D-14 Regression Guard (second pass)

| Check | Command | Result |
|-------|---------|--------|
| `xhr.withCredentials` preserved in shared HlsPlayer | `grep -n withCredentials apps/web/src/components/recordings/hls-player.tsx` | ✅ line 38 |
| admin RecordingsTab imports shared HlsPlayer | `grep -n "@/components/recordings/hls-player" apps/web/src/app/admin/cameras/components/recordings-tab.tsx` | ✅ line 38 |
| Full web suite passes | `cd apps/web && pnpm test -- --run` | ✅ 25 files / 158 tests |

## Next Phase Readiness

- Phase 17 complete — REC-01/02/03 all GREEN with automated tests
- Full web suite GREEN; TypeScript clean across `apps/web`
- Phase 18 (dashboard-map-polish) can proceed; no blockers
- Optional follow-ups (deferred): stitched daily manifest (REC cross-recording continuous playback), `?focus=HH:MM` deep-links, timeline zoom levels (REC-04), cross-camera timeline (REC-05)

## Self-Check: PASSED

Files exist:
- ✅ `apps/web/src/app/app/recordings/[id]/page.tsx`
- ✅ `apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx`
- ✅ `apps/web/src/app/app/recordings/[id]/components/recordings-list.tsx`
- ✅ `apps/web/src/__tests__/playback-page.test.tsx` (7 it() blocks, no it.todo)
- ✅ `apps/web/src/__tests__/playback-page-feature-gate.test.tsx` (2 it() blocks, no it.todo)

Commits exist:
- ✅ `587fd91` (Task 1: PlaybackPageHeader + RecordingsList)
- ✅ `281ccf4` (Task 2: page.tsx + tests)

Tests:
- ✅ `pnpm test -- src/__tests__/playback-page.test.tsx --run` → 7/7 PASS
- ✅ `pnpm test -- src/__tests__/playback-page-feature-gate.test.tsx --run` → 2/2 PASS
- ✅ `pnpm test -- --run` (full web suite) → 158/158 PASS across 25 files
- ✅ `pnpm tsc --noEmit -p tsconfig.json` exits 0

D-14 regression:
- ✅ `withCredentials` preserved in shared HlsPlayer (line 38)
- ✅ admin RecordingsTab imports shared HlsPlayer path (line 38)

---
*Phase: 17-recording-playback-timeline*
*Plan: 04*
*Completed: 2026-04-19*
