---
status: resolved
trigger: "Per-camera Recordings detail page (`/app/recordings/[id]`) — timeline component shows green block at position ~09-11 of a 0-24h scale, but the table below shows Time Range \"17:45 - 17:47\" for the SAME recording. Off by ~7 hours = exactly Bangkok UTC+7."
created: 2026-04-26T00:00:00Z
updated: 2026-04-26T19:42:00Z
resolved: 2026-04-26T19:42:00Z
fix_commit: "0719f4f"
---

## Current Focus

hypothesis: CONFIRMED + FIXED + VERIFIED.
test: 19 new unit tests + 111 existing recordings tests + full web test suite (only unrelated bulk-import flakes remain). User confirmed in browser that green block now sits at ~73% (between "15" and "18" on the 0-24h scale) for the 17:45-17:47 Bangkok recording — timeline aligned with table.
next_action: Resolved.

## Symptoms

expected: Timeline green block ตำแหน่งตรงกับ Time Range ใน table — recording 17:45-17:47 ควรอยู่ที่ position ~17.7 บน scale 0-24h (ใกล้ปลายขวา)
actual: Timeline แสดง green block ที่ ~09-11 (ฝั่งซ้ายของ scale) ขณะที่ table row บอก 17:45-17:47 — ห่าง 7 ชม.
errors: ไม่มี error ใน UI — แค่ visual mismatch
reproduction:
  1. เปิด /app/recordings/[id] ของกล้อง BKR07 (NATABURI · Bedrock) ที่มี recording วันที่ 2026-04-26
  2. ดู timeline bar ด้านบน + table ด้านล่าง
  3. green block บน timeline ไม่ตรงกับ time range ใน row
started: ก่อน quick task 260426-ox9 — bug existed before recordings-list migration

## Eliminated

(none — first hypothesis confirmed)

## Evidence

- timestamp: 2026-04-26T00:00:00Z
  checked: apps/web/src/app/app/recordings/[id]/components/recordings-list.tsx:88-92
  found: Time Range column uses `format(new Date(rec.startedAt), 'HH:mm')` — date-fns `format` renders LOCAL time. For a UTC 10:45 instant + Bangkok TZ, this prints "17:45".
  implication: The table column displays in browser-local time.

- timestamp: 2026-04-26T00:00:00Z
  checked: apps/api/src/recordings/manifest.service.ts:106-129 (getSegmentsForDate)
  found: Filters segments between UTC midnights of the requested `date`, then buckets by `new Date(seg.timestamp).getUTCHours()`. A segment recorded at UTC 10:45 → bucket 10.
  implication: Timeline backend returns hours indexed by UTC. TimelineBar renders hour 10 at left=10/24 (~41.6%).

- timestamp: 2026-04-26T00:00:00Z
  checked: apps/web/src/app/app/recordings/[id]/page.tsx:86-100 (handleSeek)
  found: Frontend uses `new Date(r.startedAt).getUTCHours()` to map a click on the timeline to a recording.
  implication: handleSeek is consistent WITH the timeline (both UTC) but inconsistent with what the table shows. So clicking a UTC-bucket position works, but the displayed coordinates lie to the user.

- timestamp: 2026-04-26T00:00:00Z
  checked: apps/api/src/recordings/recordings.service.ts:475-487 (listRecordings)
  found: Filters `startedAt` by UTC midnights of `date`. For a recording at UTC 17:00 (= local Apr 27 00:00 Bangkok), if user picks local "Apr 27", backend window is UTC Apr 27 00:00–23:59 → recording NOT returned. Pre-existing edge-of-day filter bug for cross-midnight times.
  implication: Same bug as timeline — date param interpreted as UTC midnights instead of local. Need to switch all three endpoints (timeline, list, calendar) to accept explicit UTC window from client.

- timestamp: 2026-04-26T00:00:00Z
  checked: apps/web/src/app/admin/cameras/components/recordings-tab.tsx:122-141, 288-289
  found: Same pattern duplicated — Admin Cameras > Recordings tab uses identical buggy `getUTCHours()` for seek/range-select while `formatTime` (line 64-67) renders `toLocaleTimeString` (local). Same visual mismatch exists here too.
  implication: Fix must cover both the user-facing /app/recordings/[id] page AND the admin /admin/cameras/[id] Recordings tab.

- timestamp: 2026-04-26T00:00:00Z
  checked: docker-compose.yml + .env files for TZ env var
  found: No TZ set anywhere. Backend's "local time" depends on host (Docker container default UTC; dev macOS = Bangkok). Cannot rely on backend `getHours()` matching browser `getHours()`.
  implication: Must NOT introduce server-side `getHours()`/`getDate()` calls that depend on system TZ. The fix must explicitly pass UTC instants from the client.

## Resolution

root_cause: Three backend endpoints (`/timeline`, `/camera/:id`, `/calendar`) interpret the `date`/`year`/`month` query params as UTC instants (midnight-Z), while the frontend renders timestamps in browser-local time via date-fns `format()` and `toLocaleTimeString()`. For a Bangkok user (UTC+7), a recording timestamp like 2026-04-26T10:45Z displays as "17:45" in the table but is bucketed at hour 10 on the timeline → 7-hour visual mismatch. Pre-existing cross-midnight filter bug also drops recordings whose UTC timestamp falls on a different UTC date than their local date.
fix: |
  Frontend now sends explicit UTC window bounds (`startUtc`/`endUtc`) computed
  from the user's selected local-day (or local-month for the calendar). Backend
  filters segments/recordings by those exact UTC instants and buckets relative
  to the supplied window start (offset/3600s for hours, offset/86400s + 1 for
  days). The server never invokes `getUTCHours()` / `getUTCDate()` for bucketing
  and never invokes `getHours()` / `getDate()` either — all timezone math lives
  in the browser where we know the user's TZ. Frontend `handleSeek` and
  `handleRangeSelect` switched from `getUTCHours()` → `getHours()` so seek/
  range-select align with the local-hour buckets the timeline renders.

  Legacy `date=YYYY-MM-DD` and `year`+`month` params still resolve (kept for
  backward compatibility with stale clients), but the legacy path matches
  the pre-fix UTC-day behaviour. New callers must use `startUtc`/`endUtc`.
verification: |
  - 19 new unit tests in `apps/api/tests/recordings/timeline-window.test.ts`
    covering: helper window resolution (8 tests), offset-relative hour
    bucketing for Bangkok local-day windows (5 tests), offset-relative day
    bucketing for Bangkok local-month windows (3 tests), and the explicit
    anti-regression assertion that the 17:45-local segment lands at hour 17,
    NOT hour 10.
  - All 111 recordings tests pass (api).
  - All 11 timeline-bar + recordings-list tests pass (web).
  - Updated 2 playback-page tests to use the new `startUtc=` URL pattern and
    parameterise the click-to-seek hour by host TZ — all 9 playback tests pass.
  - API builds clean (164 files, 0 SWC errors). Web `tsc --noEmit` clean.
  - Pre-existing failures in `bulk-import-dialog*.test.tsx` (3) and
    `profile-restart-active-job.integration.test.ts` (2 Redis-flake) are
    unrelated to this fix — none of those files import any code I touched.

  Awaiting human-verify in browser: open `/app/recordings/<id>` for a
  Bangkok-timestamped recording and confirm the timeline green block aligns
  with the table's Time Range column.
files_changed:
  - apps/api/src/recordings/manifest.service.ts
  - apps/api/src/recordings/recordings.service.ts
  - apps/api/src/recordings/recordings.controller.ts
  - apps/api/src/recordings/timeline-window.util.ts (new)
  - apps/api/tests/recordings/timeline-window.test.ts (new)
  - apps/web/src/hooks/use-recordings.ts
  - apps/web/src/app/app/recordings/[id]/page.tsx
  - apps/web/src/app/admin/cameras/components/recordings-tab.tsx
  - apps/web/src/__tests__/playback-page.test.tsx
  - apps/web/src/__tests__/playback-page-feature-gate.test.tsx
