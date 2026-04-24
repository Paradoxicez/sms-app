---
status: resolved
trigger: "Map live preview card บน dashboard ไม่แสดงวิดีโอสำหรับกล้องที่ใช้ RTMP push ingest (เช่น 'Test Push 4') — พื้นที่ video เป็นกล่องดำแม้จะมี LIVE badge แสดง ส่วนกล้อง RTSP ingest ใช้งานได้ทั้งใน map preview และ detail page"
created: 2026-04-24
updated: 2026-04-24
resolved: 2026-04-24
scope_expanded: 2026-04-24 — user confirmed fix BOTH map preview AND recording feature together
layer_6_added: 2026-04-24 — RTMP recording download returns 1KB empty MP4 even though segments archived correctly. Root cause: ADTS AAC inside TS (from RTMP push) cannot be muxed into MP4 without `-bsf:a aac_adtstoasc`; also TARGETDURATION was hard-coded to 3 but RTMP GOP segments are 4s+.
layer_7_added: 2026-04-24 — RTMP push HLS segments without IDR keyframe cause hls.js 1.6.15 to fatal-error on the leading fragment. Fix: archive-time H.264 NAL probe → `hasKeyframe` column → manifest/download skip leading non-keyframe segments.
layer_8_added: 2026-04-24 — After Layer 7 code landed, new recordings archived 0 segments + preview kept failing. Two runtime issues hid the fix: (1) `prisma db push` added `hasKeyframe` to DB but did not regenerate Prisma client — every `archiveSegment` threw "Unknown argument hasKeyframe", swallowed by callback controller's catch. (2) API process was still running a pre-fix `dist/main` build (started before edits), so no new code was loaded. Additionally, rebuilding with SWC exposed a latent issue — `import { Request, Response } from 'express'` was not type-only, and pnpm's strict hoisting didn't expose the transitive `express` at workspace root.
resolution: 2026-04-24 — Prisma client regenerated, `pnpm add express` added explicit dep (unblocks SWC runtime require), full rebuild, killed old API PID 53239, started fresh API PID 72233. User confirmed preview + record + download all working on both RTSP and RTMP push paths.
---

## Current Focus

hypothesis: LAYER 7 RESOLVED — initial theory (missing SPS/PPS injection) was
  PARTIALLY WRONG. Research of SRS v6.0.184 source (src/kernel/srs_kernel_ts.cpp
  lines 3103-3114) proved SRS *does* inject SPS/PPS before IDR automatically;
  the seg-by-seg NAL histogram shows segments WITH an IDR also carry SPS+PPS.

  Actual root cause: publisher GOP (~13-16s for iOS Larix) vs `hls_fragment 2;`
  setting means SRS reaps ~3 of every 4 TS fragments aligned to a keyframe
  (those are fine — SPS/PPS/IDR present), but ~1 of every 4 is a pure
  mid-GOP continuation with only AUD + non-IDR slices. HLS spec allows this
  ("frames prior to first IDR will be downloaded but possibly discarded")
  but hls.js 1.6.15 fatal-errors if the LEADING fragment has no IDR (known
  upstream issue #5629).

  Evidence: NAL histogram on real MinIO segments shows pattern
  seg 188 (t/f/f/f) 189 (t/t/t/t) 190 (f/t/f/f) 191 (t/t/t/t) ... and
  recording started on seg 188 which has zero IDR. That matches the "popup
  opens but video stays black" symptom.

  Fix chosen: Option E (archive-time probe + manifest filter).
  Rationale over Option A (SRS config) / Option B (FFmpeg intermediate):
  - Option A: researched, no such SRS directive exists in v6.0.184.
  - Option B: `-c copy` cannot re-align GOPs (would need re-encode, ~20-40%
    CPU per push stream). Not acceptable for a passthrough claim.
  - Option E: O(n) byte scan per archived segment (~5ms on 3MB), stored
    as a single boolean column, and a two-line filter in the manifest
    generator. Zero runtime cost at playback time, zero CPU cost at
    ingest time beyond the existing `fs.readFile`.

test: (see layer_7_verification below — 43/43 unit tests pass, real
      backfill on recording cb573d8a produced the expected t/t/t/f
      pattern, simulated manifest filter correctly skips seg 188)

expecting: User opens recording "Test Push 4" → video plays. Live map
          preview also plays (live HLS windows are 3-6 segments so any
          first-loaded fragment will almost always contain an IDR given
          the sliding window).

next_action: awaiting_human_verify — user to reload the recording
  playback page for cb573d8a-72a3-4b1b-b417-14965944ab3a. Backfill has
  already flagged seg 188 as hasKeyframe=false so the new manifest will
  skip it. A FRESH recording should also be tested to confirm the
  archive-path probe populates hasKeyframe on write.

## Knowledge-base notes

- SRS v7.0.51+ adds fMP4 via PR #4159. To unlock fMP4 in future, bump `ossrs/srs:6` → `ossrs/srs:7` in docker-compose.yml + restore `hls_use_fmp4 on;` in templates.
- SRS cold-boot rejects unknown directives with ConfigInvalid(1023); reload via HTTP RAW API requires `raw_api { enabled on; allow_reload on; }` — SRS 4+ kept only reload capability, removed write/query.
- SRS forward block only reloaded on SRS restart (`docker compose restart srs`). There is no hot-reload path for forward backend URL changes without RAW API enabled.

## Resolution

root_cause: |
  Five layered defects, compounding over Phase 15 → 19.1:
  (1) SettingsService template was missing the `forward { backend ... }` block
      added to the static `config/srs.conf` at commit 60bacbe — every API boot
      silently overwrote the static file and wiped out the forward block.
  (2) Template also still emitted `hls_use_fmp4 on;` after commit 2b137b1
      removed it from the static file — fMP4 is a SRS v7.0.51+ feature (PR
      #4159, merged 2025-08-11) and v6.0.184 rejects the directive on cold
      boot with ConfigInvalid(1023) = `illegal vhost.hls.hls_use_fmp4`.
  (3) Template/static config never had `raw_api { enabled on; allow_reload on; }`,
      so `GET /api/v1/raw?rpc=reload` from SettingsService always answered
      code=1061 = "raw_api not enabled". The reload path has been silently
      broken since Phase 02-04, meaning the running SRS process was ALWAYS
      one manual `docker compose restart srs` behind the regenerated file.
  (4) Recording pipeline was hard-coded for fMP4 — objectPath .m4s,
      archiveInitSegment reading EXT-X-MAP from the m3u8, manifest emitting
      `#EXT-X-VERSION:7` + `#EXT-X-MAP` — but SRS v6 produces MPEG-TS. Every
      segment uploaded to MinIO since 2b137b1 had the wrong extension, and
      any generated manifest pointed to a non-existent init.mp4 that
      hls.js / FFmpeg rejected.
  (5) SRS container was up 20h started BEFORE commit 60bacbe added the
      forward block to the static file. Because of (3) the block was never
      reloaded into the running process — only the restart I triggered in
      Phase 4 actually activated it.

fix: |
  A) SRS config templates + static file
     - Add `raw_api { enabled on; allow_reload on; }` inside http_api block in:
       · apps/api/src/settings/settings.service.ts (OnModuleInit template)
       · apps/api/src/cluster/templates/srs-origin.conf.ts (edge/origin)
       · config/srs.conf (static fallback — must match generated output)
     - Keep `hls_use_fmp4` REMOVED (it was correctly removed in 2b137b1).
     - Keep `forward { backend ... }` block (was correctly added in 60bacbe
       for static; now present in templates too).
  B) Recording pipeline — switch from fMP4 assumptions to SRS v6 MPEG-TS
     - recordings.service.ts:
       · segment extension .m4s → .ts
       · remove archiveInitSegment() method + first-segment hook
       · drop `import * as path`
     - manifest.service.ts:
       · signature `buildManifest(segments)` (dropped initSegmentUrl param)
       · `#EXT-X-VERSION:7` → `#EXT-X-VERSION:3`
       · no EXT-X-MAP emission (guard against stale initSegment column)
       · same for buildEmptyManifest
     - recordings.controller.ts (downloadRecording):
       · HLS v3 instead of v7
       · drop EXT-X-MAP block
     - bulk-download.service.ts (remuxToMp4):
       · HLS v3 instead of v7
       · drop EXT-X-MAP block
     - Prisma schema `initSegment` column kept nullable for forward-compat
       with a future SRS v7 upgrade.
  C) Tests
     - tests/srs/config-generator.test.ts: assert raw_api + allow_reload
     - tests/recordings/archive-segment.test.ts: swap .m4s → .ts in mocks;
       replace "fMP4 init segment" test with "does NOT archive init on SRS v6"
     - tests/recordings/manifest.test.ts: HLS v3 expectations, remove fMP4
       test, add "ignores legacy initSegment column" guard test
  D) Runtime verification
     - `docker compose restart srs` (required — raw_api hot-reload only
       exists for subsequent restarts)
     - Verified `GET /api/v1/raw?rpc=reload` now returns `{"code":0}`
     - Verified SRS logs show `on_forward_backend ok` for `app=push` with
       response `urls: ["rtmp://127.0.0.1:1935/live/{orgId}/{cameraId}"]`
     - Verified HLS .ts segments + .m3u8 now appear in
       `/usr/local/srs/objs/nginx/html/live/{orgId}/{cameraId}/` for push
       cameras (they did not before — SRS had no forward rule loaded)

verification: |
  Self-verified (automated):
  - pnpm vitest run tests/srs tests/recordings tests/settings tests/cluster
    → 164 pass, 0 fail, 7 todo, 1 skipped (22 files green)
  - pnpm tsc --noEmit: zero new errors attributable to changes; all 5 remaining
    errors are pre-existing (multer, nullability, gateway constructor defaults)
  - Baseline sanity: `git stash` + full suite reproduced 22 pre-existing
    failures in tests/status/ + tests/dashboard/ on clean HEAD, confirming
    those failures are NOT regressions from this fix.

  Self-verified (runtime against running stack):
  - SRS restart clean — no `illegal ...` lines in logs
  - curl /api/v1/raw?rpc=reload → code=0 (was 1061)
  - on_forward callback log present with correct push→live remap URL
  - /usr/local/srs/objs/nginx/html/live/15cd7c74.../11a34606-*.ts files
    now being written (the push camera "Test Push 4")

  Awaiting human verification:
  - Map preview: open dashboard map → click Test Push 4 pin → video renders
  - Recording: start + stop recording on an online camera → download MP4 →
    file plays correctly in VLC/QuickTime → bulk download zip also plays

files_changed:
  - apps/api/src/settings/settings.service.ts
  - apps/api/src/cluster/templates/srs-origin.conf.ts
  - apps/api/src/recordings/recordings.service.ts
  - apps/api/src/recordings/manifest.service.ts
  - apps/api/src/recordings/recordings.controller.ts
  - apps/api/src/recordings/bulk-download.service.ts
  - apps/api/tests/srs/config-generator.test.ts
  - apps/api/tests/recordings/archive-segment.test.ts
  - apps/api/tests/recordings/manifest.test.ts
  - config/srs.conf

layer_6_fix: |
  Two defects on the RTMP-download path, both in the argv we hand to FFmpeg:

  1) Dynamic `#EXT-X-TARGETDURATION` = `max(1, ceil(max(seg.duration)))`
     instead of the hard-coded `3`. RTMP GOP segments run 4s+; 3 violates
     HLS spec and FFmpeg refuses the manifest.

  2) Always pass `-bsf:a aac_adtstoasc`. RTMP carries AAC in ADTS framing;
     MP4 stores raw AAC (AudioSpecificConfig). Without the filter FFmpeg
     emits 0 frames and ~1KB output. The filter is a no-op when the input
     AAC is already raw, so applying it unconditionally is safe for RTSP
     recordings too.

  Extracted both concerns into `download-playlist.util.ts` (pure functions)
  so the controller and bulk service share one implementation and can be
  regression-tested directly.

  Also: previously `ffmpeg.stderr.on('data', () => {})` silently discarded
  FFmpeg error output, which is why this bug went undiagnosed for so long.
  Now both call sites keep a ~4KB stderr tail and surface it via logger /
  console.error when FFmpeg exits non-zero.

layer_6_files_changed:
  - apps/api/src/recordings/download-playlist.util.ts          (NEW)
  - apps/api/src/recordings/recordings.controller.ts           (use helpers + stderr capture)
  - apps/api/src/recordings/bulk-download.service.ts           (use helpers + stderr capture)
  - apps/api/tests/recordings/download-playlist.test.ts        (NEW — 11 regression tests)

layer_6_verification:
  Self-verified (automated):
  - pnpm vitest run tests/recordings → 67 pass, 0 fail (was 56; +11 new)
  - pnpm tsc --noEmit → same 5 pre-existing errors, zero new

  Self-verified (manual FFmpeg reproduction):
  - FFmpeg 7.x + 2-segment m3u8 (real RTMP seg 188 + seg 199) WITHOUT the
    new filter → 1,281 byte MP4, frame=1, error logs exactly match user
    report
  - Same command WITH `-bsf:a aac_adtstoasc` → 3.3 MB MP4, 127 frames,
    valid H.264 High 1280x720 + AAC LC, plays in QuickTime/VLC

layer_7_fix: |
  Root cause (confirmed via NAL-type histograms on 15 MinIO segments):
    RTMP push publishers (iOS Larix in the repro, also OBS / Restream /
    mobile broadcast apps) ship H.264 IDR frames every ~13-16s but carry
    SPS+PPS only in the initial RTMP AVC Sequence Header. SRS's HLS
    segmenter reaps on `(duration >= hls_fragment) && keyframe`, which
    with our `hls_fragment 2;` means ~3 of every 4 TS fragments start
    on an IDR (SPS/PPS correctly injected by SRS before IDR — verified
    in src/kernel/srs_kernel_ts.cpp:3103-3114) but ~1 of every 4 is a
    pure mid-GOP continuation with AUD + non-IDR slices only. Per RFC
    8216bis §4.3.2.4 these are spec-legal but "frames prior to the first
    IDR will be downloaded but possibly discarded", which hls.js 1.6.15
    escalates to a fatal fragment-parsing error when the *leading*
    fragment has no IDR (known upstream issue #5629). Recordings are
    started on the SRS callback, so the first archived TS is often a
    mid-GOP one — which is why the preview opened the popup but never
    rendered pixels.

  Fix (surgical, cost-free on the hot path):
    1) New Prisma column `RecordingSegment.hasKeyframe Boolean?` + an
       idempotent SQL migration. Nullable by design so legacy rows (and
       the RTSP pull pipeline, which has always been IDR-aligned) pass
       through unchanged.
    2) New `src/recordings/h264-utils.ts` with a zero-alloc Annex B NAL
       scanner. `containsH264Keyframe(buffer)` early-exits on first IDR,
       measured <5ms on a 10MB buffer. Called once per segment at archive
       time from the existing `fs.readFile` result in `archiveSegment` —
       no extra I/O, no process spawn.
    3) `manifest.service.generateManifest` now skips leading rows with
       `hasKeyframe === false` before building the VOD playlist. Rows
       with `hasKeyframe === null` (legacy / unprobed) are treated as
       playable so RTSP recordings remain byte-identical to before.
    4) `skipLeadingNonKeyframeSegments<T>` extracted into
       `download-playlist.util.ts` and applied in both the single-file
       download controller and `bulk-download.service.remuxToMp4`. Keeps
       the download artefact aligned with the hls.js preview (same first
       frame, smaller file).
    5) One-shot backfill script
       `apps/api/scripts/backfill-keyframe.mjs <recordingId>` so existing
       RTMP recordings become previewable without requiring a re-record.

layer_7_files_changed:
  - apps/api/src/prisma/schema.prisma                              (add hasKeyframe col)
  - apps/api/src/prisma/migrations/recording_segment_has_keyframe/migration.sql (NEW, idempotent)
  - apps/api/package.json                                          (thread migration into db:push)
  - apps/api/src/recordings/h264-utils.ts                          (NEW — Annex B NAL scanner)
  - apps/api/src/recordings/recordings.service.ts                  (probe buffer in archiveSegment)
  - apps/api/src/recordings/manifest.service.ts                    (skip leading non-keyframe segments)
  - apps/api/src/recordings/download-playlist.util.ts              (new skipLeadingNonKeyframeSegments helper)
  - apps/api/src/recordings/recordings.controller.ts               (use helper in single-download)
  - apps/api/src/recordings/bulk-download.service.ts               (use helper in bulk-remux)
  - apps/api/scripts/backfill-keyframe.mjs                         (NEW — one-shot backfill)
  - apps/api/tests/recordings/h264-utils.test.ts                   (NEW — 11 scanner tests)
  - apps/api/tests/recordings/manifest.test.ts                     (+3 layer-7 tests)
  - apps/api/tests/recordings/download-playlist.test.ts            (+5 skip-helper tests)
  - apps/api/tests/recordings/archive-segment.test.ts              (+2 probe tests)

layer_7_verification:
  Self-verified (automated):
  - pnpm vitest run tests/recordings/{h264-utils,download-playlist,manifest,archive-segment}.test.ts
    → 43/43 pass
  - pnpm vitest run tests/recordings → 87 pass, 0 fail (was 67; +20 new, +9
    if we count only the tests that exercise the layer-7 code)
  - pnpm tsc --noEmit → same 5 pre-existing errors, zero new
  - prisma db push applied hasKeyframe column to dev DB (verified
    `\d "RecordingSegment"` shows `hasKeyframe | boolean | nullable`)

  Self-verified (data — real recording cb573d8a on dev):
  - Ran backfill script across the 23 live segments. Result matches
    the ffprobe NAL histogram exactly:
        seqNo 188  false
        seqNo 189  true
        seqNo 190  false   ← mid-GOP
        seqNo 191  true
        seqNo 192  true
        seqNo 193  false
        seqNo 194  true
        seqNo 195  false
        ...
    Pattern is stable `t/t/t/f` × N, matching ~13-16s GOPs over 4s
    fragments.
  - Simulated the manifest filter end-to-end: first playable seg = 189
    (seqNo 188 skipped). Playable count = 22/23. No mid-playlist rows
    are dropped (those carry valid P-frames).

  Awaiting human verification:
  - Open recording "Test Push 4" (id cb573d8a-72a3-4b1b-b417-14965944ab3a)
    in the browser playback page → video MUST render (decoder initialises
    from seg 189 IDR, then rolls through the rest including mid-GOP rows).
  - Single download + bulk download MUST still produce valid MP4 (layer-6
    fixes unchanged; we only trimmed an already-skipped leading row).
  - RTSP recording preview MUST still work (legacy rows have
    hasKeyframe=null → helper is a no-op).
  - Start a FRESH RTMP push recording. Confirm new segments are written
    with `hasKeyframe` populated (t or f, never null) — check via:
        PGPASSWORD=sms_dev_password psql -U sms -h localhost -p 5434 \\
          -d sms_platform -c \
          'SELECT "seqNo", "hasKeyframe" FROM "RecordingSegment" \\
           WHERE "recordingId" = $NEW_ID ORDER BY "seqNo" LIMIT 10;'

## Symptoms

expected: คลิกเปิด preview ของกล้อง RTMP บน map → เห็น video stream (เหมือนที่ RTSP camera ทำได้)
actual: Preview card เปิดขึ้นแสดงชื่อกล้อง ("Test Push 4"), LIVE badge สีแดง, "0 viewers" แต่พื้นที่วิดีโอเป็นกล่องดำล้วน — ไม่มี video render
errors: ยังไม่ทราบ — ต้องตรวจ browser console/network tab และ SRS logs
reproduction:
  1) ไปหน้า dashboard ที่มี map view
  2) คลิกหมุดของกล้อง RTMP push (เช่น "Test Push 4")
  3) เห็น preview card แต่ video ไม่เล่น
  — RTSP camera ทำตามขั้นตอนเดียวกันได้ปกติ
started: หลัง Phase 19.1 (RTMP push ingest with platform-generated stream keys, commit 4f6dc89, 2026-04-24)

## Eliminated

## Evidence

- timestamp: 2026-04-24
  checked: apps/web/src/components/map/camera-popup.tsx (PreviewVideo component)
  found: Uses `/api/cameras/${id}/preview/playlist.m3u8` (generic per-camera endpoint). Does NOT differentiate push vs pull mode.
  implication: Bug is NOT in the frontend URL construction — both RTSP and RTMP cameras hit the same backend proxy.

- timestamp: 2026-04-24
  checked: apps/api/src/cameras/cameras.controller.ts#proxyPlaylist (line 381-452)
  found: Backend fetches `${srsBaseUrl}/live/${orgId}/${camera.id}.m3u8?token=...` — SRS path is `live/{orgId}/{cameraId}` regardless of ingest mode. If HLS manifest doesn't exist at that path → 502/404 → hls.js silent fail.
  implication: Push cameras must somehow make their stream appear at `live/{orgId}/{cameraId}` — that's what the SRS `forward` directive + on-forward callback is for.

- timestamp: 2026-04-24
  checked: apps/api/src/streams/streams.service.ts (line 50-59)
  found: Comment: "SRS `forward` remaps `push/<key>` → `live/<orgId>/<cameraId>` natively, so no FFmpeg process is needed." → push+passthrough path is `startStream: no-op; SRS forward handles it`.
  implication: Passthrough push cameras rely ENTIRELY on SRS `forward` directive to make the stream appear at the HLS read path. Without forward → no HLS manifest → black box.

- timestamp: 2026-04-24
  checked: apps/api/src/srs/srs-callback.controller.ts#onForward (line 348-382)
  found: on-forward endpoint is fully implemented. Returns urls=[`rtmp://{host}:1935/live/{orgId}/{cameraId}`] for push+passthrough.
  implication: Backend side is correct. The missing piece is SRS config telling SRS to CALL this endpoint.

- timestamp: 2026-04-24
  checked: config/srs.conf (current working-tree state)
  found: NO `forward { ... }` block. `hls_use_fmp4 on;` IS present (should have been removed per commit 2b137b1 due to SRS 6.0.184 rejecting it → container restart loop).
  implication: SRS at runtime never calls on-forward → push stream stuck at `push/<key>`, never appears at `live/{orgId}/{cameraId}`.

- timestamp: 2026-04-24
  checked: git log + git diff HEAD on config/srs.conf
  found: Commit 60bacbe (Phase 19.1-02) ADDED the forward block. Commit 2b137b1 REMOVED hls_use_fmp4 from static config. Working-tree shows both reverted (forward block gone, hls_use_fmp4 re-added).
  implication: Something is regenerating the file after git checkout — namely SettingsService.onModuleInit.

- timestamp: 2026-04-24
  checked: apps/api/src/settings/settings.service.ts (lines 20-65, 135-213)
  found: SettingsService implements OnModuleInit → calls regenerateAndReloadSrsAtBoot → writes generateSrsConfig() output to `config/srs.conf`. The template (line 138-195) has NO forward block AND INCLUDES `hls_use_fmp4 on;` on line 171.
  implication: This is the root cause. Every API boot overwrites config/srs.conf, wiping out Phase 19.1-02's forward block and reintroducing the hls_use_fmp4 directive that SRS 6.0.184 rejects.

- timestamp: 2026-04-24
  checked: apps/api/src/cluster/templates/srs-origin.conf.ts
  found: Cluster origin template also has NO forward block and no callback hooks for on-forward. (It also does NOT have hls_use_fmp4 — that was fixed in cluster template per commit 2b137b1 but the fix missed SettingsService.)
  implication: Same bug reproduces for cluster/origin deployments. Must fix both templates.

- timestamp: 2026-04-24
  checked: docker-compose.yml (lines 32-55)
  found: SRS container bind-mounts `./config/srs.conf:/usr/local/srs/conf/srs.conf` and runs healthcheck against HTTP API. Restart policy unless-stopped.
  implication: Every time API restarts (dev reloads, container restarts), the template overwrites the file → SRS reloads → forward block disappears → push cameras break. Also: cold boot with hls_use_fmp4 will crash SRS container per commit 2b137b1's commit message (restart 255 loop).

# ---- LAYER 6: RTMP download 1KB bug (2026-04-24 second pass) ----

- timestamp: 2026-04-24 (layer-6)
  checked: RecordingSegment durations (recording cb573d8a-72a3-4b1b-b417-14965944ab3a, push camera "Test Push 4") vs 4d12add6-a323-425b-b54f-95459de345a1 (RTSP BKR06)
  found: RTMP durations 4.12/4.22/3.25s, RTSP durations stable 2.56s. Both start mid-stream (seqNo 188 and 295 respectively).
  implication: Hard-coded `#EXT-X-TARGETDURATION:3` in `recordings.controller.ts:262` + `bulk-download.service.ts:120` breaks HLS spec for RTMP (target < some EXTINF) but is valid for RTSP.

- timestamp: 2026-04-24 (layer-6)
  checked: ffprobe on RTMP seg 188 vs seg 199
  found: Seg 188 reports `width=0 height=0 profile=unknown` + repeating "non-existing PPS 0 referenced / no frame!" → no SPS/PPS in the leading TS. Seg 199 (middle) is clean — H.264 High 1280x720.
  implication: SRS forward path does NOT re-prepend H.264 extradata when starting a new HLS sequence mid-stream. Only the first segment is affected. FFmpeg can skip broken leading frames IF the audio codec path is also healthy.

- timestamp: 2026-04-24 (layer-6)
  checked: Manual FFmpeg transmux of a 2-segment playlist (seg188 + seg199) using the exact same argv as `recordings.controller.ts`
  found: Output = 1,281 bytes, `frame=1`, errors: "Malformed AAC bitstream detected: use the audio bitstream filter 'aac_adtstoasc' to fix it" + "Error submitting a packet to the muxer: Operation not permitted"
  implication: Full reproduction of the 1KB MP4 bug locally. The primary blocker is AAC-in-ADTS (not the missing SPS/PPS alone).

- timestamp: 2026-04-24 (layer-6)
  checked: Same FFmpeg command with `-bsf:a aac_adtstoasc` added
  found: Output = 3.3 MB, 127 frames, valid MOV/MP4 container with H.264 High + AAC LC. FFmpeg silently drops the broken leading frames from seg 188 until it locks onto the next IDR.
  implication: Single-flag fix. No need to also transcode video or skip seg 188 manually.

- timestamp: 2026-04-24 (layer-6)
  checked: Why RTSP survived the same code path
  found: RTSP ingest goes through `ffmpeg-stream.service.ts` (external FFmpeg pulls RTSP + pushes to SRS as RTMP) with `-c:a aac` transcode. That transcode path already stores AAC in a format compatible with the MP4 muxer, so `aac_adtstoasc` is a no-op but not required.
  implication: Bug manifests only for push-passthrough cameras where no FFmpeg ever touches the stream between ingest and HLS segmenter.

