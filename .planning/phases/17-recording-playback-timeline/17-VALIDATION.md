---
phase: 17
slug: recording-playback-timeline
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-18
updated: 2026-04-19
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3 + @testing-library/react 16 + jsdom 25 (web); vitest 3 + Prisma test client (api) |
| **Config file** | `apps/web/vitest.config.ts`, `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/web && pnpm test <file>` / `cd apps/api && pnpm vitest run <file>` |
| **Full suite command** | `pnpm test` (root) |
| **Estimated runtime** | ~30-60 seconds (web) + ~30s (api recordings subset) |

---

## Sampling Rate

- **After every task commit:** Run only the file(s) touched (target < 5s)
- **After every plan wave:** Run `cd apps/web && pnpm test` + `cd apps/api && pnpm test tests/recordings/`
- **Before `/gsd-verify-work`:** Full root `pnpm test` must be green
- **Max feedback latency:** ~60 seconds (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-02-T1 | 02 | 1 | REC-01 | T-17-V4 | API returns 404 (not 403/recording) for cross-org id | unit (api) | `cd apps/api && pnpm vitest run tests/recordings/get-recording.test.ts -t "cross-org 404"` | 17-00 W0 | ✅ green |
| 17-02-T1 | 02 | 1 | REC-01 | — | `GET /api/recordings/:id` returns recording with camera+site+project include | unit (api) | `cd apps/api && pnpm vitest run tests/recordings/get-recording.test.ts -t "returns camera include"` | 17-00 W0 | ✅ green |
| 17-02-T2 | 02 | 1 | REC-01 (supporting) | T-17-V7 | useRecording hook returns 3-state error (not-found/forbidden/network) and does not fetch when id is undefined | unit (web) | `cd apps/web && pnpm test src/__tests__/use-recording-hook.test.ts --run` | 17-00 W0 | ✅ green |
| 17-04-T2 | 04 | 3 | REC-01 | — | Page mounts HlsPlayer with src=`/api/recordings/:id/manifest` | component (web) | `cd apps/web && pnpm test src/__tests__/playback-page.test.tsx -t "REC-01"` --run | 17-00 W0 | ✅ green |
| 17-04-T2 | 04 | 3 | REC-02 | — | Timeline click triggers `router.push` to recording containing the hour | component (web) | `cd apps/web && pnpm test src/__tests__/playback-page.test.tsx -t "REC-02 click-to-seek"` --run | 17-00 W0 | ✅ green |
| 17-04-T2 | 04 | 3 | REC-02 | — | Timeline click on empty hour does NOT navigate | component (web) | `cd apps/web && pnpm test src/__tests__/playback-page.test.tsx -t "REC-02 empty hour no-op"` --run | 17-00 W0 | ✅ green |
| 17-03-T2 | 03 | 2 | REC-03 | — | TimelineBar renders `bg-chart-1` for hours where `hasData=true` | component (web) | `cd apps/web && pnpm test src/__tests__/timeline-bar.test.tsx -t "REC-03 heatmap"` --run | 17-00 W0 | ✅ green |
| existing | — | — | REC-03 | — | `GET /api/recordings/camera/:id/timeline?date=` returns 24-hour `hasData` array | unit (api) | `cd apps/api && pnpm vitest run tests/recordings/manifest.test.ts -t "getSegmentsForDate"` | ✅ exists | ✅ green |
| 17-01-T1 | 01 | 1 | supporting | — | `DataTable` `onRowClick` fires on row click but NOT when checkbox/actions clicked (FOUND-01f) | component (web) | `cd apps/web && pnpm test src/__tests__/data-table.test.tsx -t "FOUND-01f onRowClick"` --run | 17-00 W0 | ✅ green |
| 17-04-T2 | 04 | 3 | supporting | — | Date picker change navigates to first recording on new date | component (web) | `cd apps/web && pnpm test src/__tests__/playback-page.test.tsx -t "date-change navigation"` --run | 17-00 W0 | ✅ green |
| 17-04-T2 | 04 | 3 | supporting | T-17-V7 | Recording 404 / 403 / network errors render correct empty states | component (web) | `cd apps/web && pnpm test src/__tests__/playback-page.test.tsx -t "error states"` --run | 17-00 W0 | ✅ green |
| 17-04-T2 | 04 | 3 | supporting | — | Feature gate (`recordings: false`) renders `FeatureGateEmptyState` | component (web) | `cd apps/web && pnpm test src/__tests__/playback-page-feature-gate.test.tsx --run` | 17-00 W0 | ✅ green |
| 17-03-T1 | 03 | 2 | supporting (D-14) | T-17-V3 | RecordingsTab in admin/cameras still renders after component move; HlsPlayer xhrSetup withCredentials preserved | regression (web) | `cd apps/web && pnpm test --run` | existing | ✅ green |

*Status: ✅ green · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements (handled by plan 17-00)

- [x] `apps/web/src/__tests__/playback-page.test.tsx` — covers REC-01, REC-02, date-change, error states (mock `useRouter`, `apiFetch`, `useFeatures`) — created in 17-00 with it.todo, GREEN in 17-04
- [x] `apps/web/src/__tests__/timeline-bar.test.tsx` — covers REC-03 heatmap render (pure component test) — created in 17-00 with it.todo, GREEN in 17-03
- [x] `apps/web/src/__tests__/playback-page-feature-gate.test.tsx` — mirrors `recordings-feature-gate.test.tsx` for `[id]` route — created in 17-00 with it.todo, GREEN in 17-04
- [x] `apps/api/tests/recordings/get-recording.test.ts` — covers camera include + cross-org 404 (mock Prisma per `cross-camera-list.test.ts:46-83`) — created in 17-00 with it.todo, GREEN in 17-02
- [x] `apps/web/src/__tests__/use-recording-hook.test.ts` — direct unit tests for useRecording hook contract (3-state error API + undefined-id no-fetch) — created in 17-00 with it.todo, GREEN in 17-02
- [x] Extend `apps/web/src/__tests__/data-table.test.tsx` — add `FOUND-01f onRowClick` test cases — extended in 17-00 with it.todo, GREEN in 17-01
- [x] No new framework install needed; Vitest + RTL + jsdom already configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Actual HLS video renders and plays | REC-01 | jsdom has no MediaSource — cannot exercise hls.js end-to-end | Open `/app/recordings/[valid id]` in Chrome + Safari, click play, confirm video plays without error |
| Timeline scrubbing UX feels right (drag-select smooth, keyboard nav works) | REC-02 | Pixel-level interaction not reliably testable in jsdom | Click + drag across hours; arrow-key nav; confirm visual feedback matches UI-SPEC |
| Heatmap colors visually distinguish has-data from empty hours | REC-03 | Color/contrast verification | Visually inspect timeline; confirm `bg-chart-1` cells contrast against `bg-muted` empty cells |
| Browser back button returns through recording history correctly | D-07 | Multi-step history requires real browser | Navigate: list → recording A → date change to B → recording B' → click Back twice; confirm lands on A then list |
| Calendar dot decoration appears on days with recordings | D-04 | shadcn `Calendar` modifiers render via real DOM styles | Open calendar popover, confirm dots appear under days with recordings, no dots on empty days; navigate months — dots refresh |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** GREEN — plans 17-00 → 17-04 complete; full web suite (158 tests) passes
