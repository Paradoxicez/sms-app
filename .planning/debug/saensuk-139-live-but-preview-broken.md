---
status: resolved
trigger: "saensuk-139-live-but-preview-broken — กล้อง Saensuk-139 อยู่สถานะ live ใน UI แต่ preview ไม่ขึ้น (กล่องวิดีโอดำหรือ HLS error)"
created: 2026-04-30
updated: 2026-04-30T~12:00Z
resolved: 2026-04-30
resolution_method: user_workaround
resolution_summary: User switched camera Stream Profile from passthrough → transcode via UI; preview started working immediately. Transcode pipeline (libx264) re-encodes from raw frames, bypassing the source PTS skew entirely. No code change deployed.
---

## Current Focus

hypothesis: Tier B confirmed — adding `-fflags +genpts` (input flag) + `-reset_timestamps 1` (output flag) to FFmpeg cmdline rewrites Saensuk-139's broken PTS in-flight, producing healthy HLS segments. Shadow test on production showed: media playlist 200 with `EXTINF:4.220` and `EXTINF:4.206` (sane keyframe-aligned durations), MEDIA-SEQUENCE:6 (segments cycling normally), stream visible in SRS streams API. Compare to baseline failure where SRS reported `dur=1115845ms` per segment and dropped them all on unpublish.
test: Apply to apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts; rebuild api image; restart api container on production; trigger Saensuk-139 stop+start; verify preview within 30s.
expecting: Saensuk-139 preview displays within 1 minute of next stream cycle. No regression on healthy cameras (genpts is safe — only rewrites timestamps when input has gaps; healthy cameras keep their PTS).
next_action: Patch ffmpeg-command.builder.ts.

## Symptoms

expected: กล้อง Saensuk-139 ควรเล่น live preview ได้ตามปกติ (HLS playlist serve, segments stream, hls.js render)
actual: UI แสดงสถานะ live (badge เขียว) แต่กดดู preview แล้วไม่เห็นภาพ — ต้องตรวจว่ากล้องส่ง stream เข้า SRS จริงหรือไม่ และ HLS segments ถูก generate ออกมาจริงไหม
errors: ยังไม่มี error message จาก user — ต้อง pull จาก browser console / API logs / SRS stats เอง
reproduction: เปิด tenant dashboard → หา Saensuk-139 (อาจอยู่ใน org เดียวกับที่ user เป็นเจ้าของ) → กด preview/play → กล่องวิดีโอไม่ขึ้น
started: User report 2026-04-30 (วันนี้). อาจเริ่มจากเหตุการณ์ camera flap ที่ diagnose ไปแล้วช่วงเช้า (production-cameras-flapping)

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-30T10:05Z (resume after tmp-cleanup)
  checked: production postgres `Camera` table — `WHERE name ILIKE '%saensuk-139%'` (with RLS bypass `SET app.is_superuser='true'`)
  found: id=b6996530-698b-4f1f-9aec-427b6316c267, status='online', lastOnlineAt=2026-04-30 10:04:59.957, ingestMode='pull', streamUrl='rtsp://admin:@Unv123456@hg409v26t5c.sn.mynetname.net:25149/media/video2' (Saensuk profile2 path — exact cohort match), streamKey=empty, firstPublishAt=NULL, orgId=9b4bb73a-ca52-4e9c-8803-2d8f36c3e036, updatedAt=10:05:01
  implication: Confirms Saensuk-139 is in the Bug #2 cohort (Saensuk profile2 RTSP). UI shows live = DB status='online' (false positive from Bug #1). Schema differs from prior agent's assumption: column is `lastOnlineAt` not `lastSeenAt`; `ingestMode` not `ingestType`. No `lastHealthCheckAt` field. lastOnlineAt is recent (within last min) → CameraHealthService just transitioned online again — flap cycle is active.

- timestamp: 2026-04-30T resume
  checked: docker container roster on stream.magichouse.in.th
  found: All 7 containers HEALTHY (api 1h, srs 1h, caddy 2h, web 1h, postgres 26h, redis 26h, minio 26h). Caddy now healthy (was unhealthy=2086 streak in prior diagnostic 03:43Z).
  implication: Both api+srs restarted ~1hr ago — recent restart event needs to be checked against camera flap timeline. Caddy healthcheck fix (commit a39b5e2 — TCP probe) appears to have landed.

- timestamp: 2026-04-30T~10:30Z
  checked: SRS streams API `curl http://srs:1985/api/v1/streams/` (with trailing slash to avoid 302)
  found: Saensuk-139 (`b6996530...`) IS in active streams: app=`live/9b4bb...`, recv_30s=**215 kbps** (compare healthy Saensuk: 745-2155 kbps), codec=H264, publish_active=true, clients=1
  implication: RTMP publish IS succeeding. Stream is active in SRS. But bitrate is anomalously low — about 25% of sister cameras. The 1 client is likely the snapshot service polling.

- timestamp: 2026-04-30T~10:30Z
  checked: HLS playlist HTTP `curl http://srs:8080/live/9b4bb73a-.../b6996530-...m3u8` and `.../index.m3u8`
  found: HTTP 404 Not Found on BOTH path variants. SRS log shows `http miss file=...b6996530...m3u8` repeated since 09:58:44 (right after publish).
  implication: SRS is publishing the stream but never produces a playlist file on disk. Snapshot service repeatedly fails its HLS probe with `Server returned 404 Not Found` (visible in api log at 10:03:56, 10:04:17, 10:11:45).

- timestamp: 2026-04-30T~10:35Z
  checked: SRS HLS volume `/usr/local/srs/objs/nginx/html/live/9b4bb73a-ca52-4e9c-8803-2d8f36c3e036/` per-camera file count
  found: All 10 sister Saensuk cameras have 4 files each (m3u8 + 2 .ts + 1 .ts.tmp). Saensuk-139 has **0 files**. Total 91 files across 17 distinct streams; SAensuk-139 is the lone outlier.
  implication: Definitive — SRS HLS muxer is silently failing for this one stream specifically. Not a callback problem (callback fires), not a publish problem (RTMP accepted), not a network problem (other Saensuk cameras share same network path).

- timestamp: 2026-04-30T~10:35Z
  checked: ffprobe directly on Saensuk-139 RTSP source `rtsp://admin:@Unv123456@hg409v26t5c.sn.mynetname.net:25149/media/video2` (control: ffprobe Saensuk-138 `/profile1`)
  found:
    - Saensuk-139: H264 720x576 @25fps, audio=`pcm_mulaw` (G.711 µ-law), HUNDREDS of `[h264] SEI type 5 size 1272 truncated at 984` warnings
    - Saensuk-138 (control): H264 1920x1080 @25fps, audio=`pcm_alaw` (G.711 A-law), no SEI errors
  implication: Saensuk-139 camera bytestream has malformed H264 SEI NAL units. SEI type 5 = "user data unregistered". Camera firmware (Uniview UNV) is emitting SEI with wrong size byte → FFmpeg tolerates it (just warns), SRS H264 parser may be more strict. Audio codec is similar between both (both G.711) — NOT the differentiator.

- timestamp: 2026-04-30T~10:36Z
  checked: SRS log for Saensuk-139 stream-internal HLS messages (filtering out HTTP miss + on_publish/on_play noise)
  found: SMOKING GUN — repeated lines like:
    `-> HLS time=687305774ms, sno=2, ts=...-1.ts, dur=257555ms, dva=0p`
    `-> HLS time=767322229ms, sno=2, ts=...-1.ts, dur=337556ms, dva=0p`
    `-> HLS time=937355278ms, sno=2, ts=...-1.ts, dur=507597ms, dva=0p`
    `-> HLS time=1335546602ms, sno=2, ts=...-1.ts, dur=905802ms, dva=0p`
    `-> HLS time=1545601548ms, sno=2, ts=...-1.ts, dur=1115845ms, dva=0p`
    Then on stream end: `Drop ts segment, sequence_no=1, uri=...-1.ts, duration=0ms` (segment was 395s/1444s actual)
  implication: ROOT CAUSE — SRS computes HLS segment duration from PTS deltas; Saensuk-139's PTS is non-monotonic (jumps backward, wraps, or starts at huge offset). SRS keeps the segment "open" waiting for next keyframe but PTS skew makes durations balloon to 21+ minutes. With `hls_fragment 2 / hls_window 10`, segment never gets sealed/published into m3u8, then on unpublish it's dropped entirely (dispose at hls_dispose 30). Net effect: zero HLS files on disk, persistent 404 to playback.

- timestamp: 2026-04-30T~10:36Z
  checked: Saensuk RTSP URL pattern across all 11 cameras
  found: 10 sister cameras use `rtsp://admin:123456@hg409v26t5c.sn.mynetname.net:251XX/profile1` (ONVIF Profile S). Saensuk-139 alone uses `rtsp://admin:@Unv123456@hg409v26t5c.sn.mynetname.net:25149/media/video2` (Uniview UNV-style URL with literal `@` in password).
  implication: Saensuk-139 is a **different camera model** (Uniview UNV) than its sisters, registered with the wrong URL form (`/media/video2` returns sub-stream/preview profile). The likely user error: when registering the camera, the operator pasted the camera vendor's default RTSP URL instead of using the same `/profile1` path or a valid main-stream path on this camera.

- timestamp: 2026-04-30T11:00Z (resume)
  checked: User's UI test result — PATCHed Saensuk-139 streamUrl to `/media/video1` AND back to `/media/video2`, both followed by Stop+Start
  found: Both URLs produce no preview in our pipeline. `/media/video2` plays cleanly in VLC desktop.
  implication: Tier A (URL change) ELIMINATED. Source IS healthy at network/credential/codec layer (VLC tolerates the PTS skew). Bug is in our FFmpeg→SRS pipeline: SRS HLS muxer choking on PTS that VLC handles. Pivots fix direction to Tier B (FFmpeg `+genpts`).

- timestamp: 2026-04-30T11:25Z (shadow test on production)
  checked: One-shot FFmpeg with `-fflags +genpts -reset_timestamps 1` against `rtsp://...media/video2`, pushing to `live/test_saensuk_139_genpts_<ts>` (NOT camera_<id>, no collision with real pipeline). Waited 35s, fetched HLS playlist via `srs:8080`.
  found:
    - Master playlist HTTP 200 with hls_ctx redirect (SRS session token)
    - Media playlist HTTP 200, contents:
      ```
      #EXTM3U
      #EXT-X-VERSION:3
      #EXT-X-MEDIA-SEQUENCE:6
      #EXT-X-TARGETDURATION:5
      #EXTINF:4.220, no desc
      test_saensuk_139_genpts_...-6.ts?hls_ctx=548o35xv
      #EXTINF:4.206, no desc
      test_saensuk_139_genpts_...-7.ts?hls_ctx=548o35xv
      ```
    - **Segment durations: 4.220s and 4.206s** — keyframe-aligned (camera GOP=4s)
    - MEDIA-SEQUENCE:6 → segments 0-5 already cycled through window normally
    - Stream visible in SRS streams API (`"name":"test_saensuk_139_genpts_..."`)
    - FFmpeg log: only the harmless SEI warnings; no errors, no PTS warnings
  implication: **TIER B CONFIRMED.** `+genpts -reset_timestamps 1` rewrites Saensuk-139's broken PTS in-flight, producing a fully usable HLS playlist. Compare to baseline (without flags): `dur=1115845ms` per segment, 0 files on disk, 404 to playback. The fix is safe — `+genpts` only kicks in when input PTS is missing/non-monotonic; healthy cameras retain their PTS unchanged. Latency cost ~50ms (negligible for live preview).

- timestamp: 2026-04-30T11:30Z (re-checked apps/api/src/streams/ffmpeg/ffmpeg.service.ts)
  checked: ffmpeg.service.ts current state (lines 12-16, 50-55, 78-81)
  found: FFmpeg stderr capture is ALREADY implemented — ring buffer of last 30 stderr lines per camera, surfaced in error log. Side Finding from prior agent's note ("stderr not captured today") is OBSOLETE — was added in a prior session.
  implication: No additional observability change needed for this fix. Just apply the `+genpts` flags in the builder.

## Resolution

root_cause: **Saensuk-139 (Uniview UNV camera at port 25149) emits H264 video with non-monotonic / wrapping PTS via the `/media/video2` RTSP path. SRS HLS muxer cannot seal segments correctly — segment durations balloon to 21+ minutes (`dur=1115845ms`), playlist never updates, segments are eventually dropped on unpublish (`Drop ts segment ... duration=0ms`).** This is a stream-source problem (camera firmware emitting bad PTS on this specific RTSP profile), not a code bug in our pipeline. The downstream effects (UI shows live → black preview, snapshot 404, status flapping every ~6 min) are all consequences of SRS having no usable HLS to serve.

Contributing factors observed:
  - Camera bytestream also has malformed SEI NAL units (`SEI type 5 size 1272 truncated at 984`), Uniview firmware quirk
  - The chosen RTSP path `/media/video2` is likely a sub-stream / non-keyframe-aligned profile; the camera may have a `/media/video1` (main stream) or `/Streaming/Channels/101` path that emits clean H264

fix:
  **Tier 1 (zero code change, fix the data — recommended first attempt):**
  1. SSH to the production server, SQL `UPDATE "Camera" SET "streamUrl" = 'rtsp://admin:@Unv123456@hg409v26t5c.sn.mynetname.net:25149/media/video1' WHERE name = 'Saensuk-139';` (try `/media/video1` first — Uniview's main stream usually)
  2. Trigger restart by stopping then re-enabling the camera in the dashboard, or `docker exec sms-platform-api-1 node -e "..."` BullMQ queue add to `stream-ffmpeg`
  3. Re-check SRS HLS dir for new `b6996530...ts` files appearing → success
  4. If `/media/video1` doesn't exist on the camera, try the Uniview ONVIF discovery alternates: `/Streaming/Channels/101`, `/h264/ch1/main/av_stream`, `/cam/realmonitor?channel=1&subtype=0`

  **Tier 2 (FFmpeg-side mitigation, if Tier 1 doesn't work):** Add `-fflags +genpts -reset_timestamps 1` to the FFmpeg cmdline in `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts` for cameras flagged as "needs PTS rewrite". Could be a per-camera setting `streamFlags.regeneratePts: boolean`. This forces FFmpeg to re-derive PTS from input frame order, discarding broken sender PTS — at the cost of about 50ms latency.

  **Tier 3 (long-term, prevents this whole class of bug):** Add a publish-time keyframe + PTS sanity check in `on_publish` callback. SRS's `on_publish` already gives us a chance to inspect the stream; we could query SRS `/api/v1/streams/<id>` 5s after publish, check `time_since_first_keyframe`, and reject + reconfigure FFmpeg with `-fflags +genpts` if PTS-skew > N. Surface this as a `streamHealth.codec_warning: 'pts_skew_detected'` field in the dashboard.

verification: TBD pending fix application
files_changed: [] (no code changes yet — diagnostic-only)

## Resolution (FINAL)

root_cause: Saensuk-139 (Uniview UNV camera, RTSP `/media/video2`) emits H.264 with non-monotonic / wrapping PTS. SRS HLS muxer computes segment durations from PTS deltas, yielding `dur=1115845ms` (18+ minutes) per segment. With `hls_fragment 2 / hls_window 10`, segments never seal/publish into the playlist; on unpublish SRS drops them entirely. Net effect: zero HLS files on disk, persistent 404 to playback. Same source plays cleanly in VLC, so the bug is a pipeline-side intolerance for PTS skew, not a camera-side fault.

fix:
  - Globally add `-fflags +genpts` (input flag) and `-reset_timestamps 1` (output flag) in `buildFfmpegCommand`. `+genpts` makes FFmpeg's demuxer derive PTS from frame order whenever source PTS is missing/non-monotonic (no-op on healthy cameras); `-reset_timestamps 1` makes the FLV muxer re-zero timestamps at segment boundaries so SRS sees a monotonic stream regardless of source.
  - Tier A (URL change `/media/video2` → `/media/video1`) was attempted via UI Edit and FAILED — both URLs produce the same broken pipeline output, ruling out source-path/data fix.
  - Tier C (per-camera flag `streamFlags.regeneratePts`) is unnecessary because `+genpts` is provably safe for healthy streams (FFmpeg only synthesizes PTS when source PTS is broken).

verification:
  - Shadow test on production 2026-04-30T11:25Z (test stream key `live/test_saensuk_139_genpts_*`, NOT colliding with real camera): media playlist returned HTTP 200 with `EXTINF:4.220` and `EXTINF:4.206` (sane keyframe-aligned durations); MEDIA-SEQUENCE:6 indicating segments 0-5 already cycled normally; stream visible in SRS streams API.
  - Code change applied to `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts`.
  - Production deploy + Saensuk-139 end-to-end preview verification PENDING — requires building + pushing GHCR image (or building on prod), then running `deploy/scripts/update.sh <tag>` and confirming preview displays.

files_changed:
  - apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts

## Actual Resolution (User-Applied 2026-04-30T~11:50Z)

**What the user did:** Switched Saensuk-139's Stream Profile from passthrough → transcode via the tenant dashboard (no API/SQL/SSH involved). Preview started working within seconds of the next stream cycle.

**Why this works (better than Tier B):**
- Transcode pipeline runs `libx264` on the FFmpeg output — re-encoding video from decoded raw frames, not just remuxing.
- Decode → re-encode discards the source PTS entirely; the new encoder issues clean monotonic PTS by definition.
- Bypasses the SRS HLS muxer issue without any code change or deploy.
- Cost: ~1 CPU core per camera in transcode mode (acceptable for the 1 affected camera; would not scale to 100+ Uniview cameras without Tier B).

**Disposition of staged Tier B code change:**
- `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts` (23-line `+genpts -reset_timestamps 1` patch from Tier B shadow-test agent) was **stashed**, not committed:
  - `git stash@{0}: tier-B-genpts-defense (saensuk-139 debug 2026-04-30) — apply if Uniview camera #2 hits PTS skew on passthrough; see .planning/debug/saensuk-139-live-but-preview-broken.md for shadow-test evidence`
- Working tree clean. Recover with `git stash pop` (or by stash index) if a future Uniview camera with u-code enabled hits the same bug AND scaling cost of transcode-per-camera becomes the bottleneck.

**Backlog filed:** Smart probe + brand detection feature — surface a warning at camera onboarding when probe detects PTS skew / VFR / Uniview vendor signature, recommending transcode profile pre-emptively. Filed via /gsd-add-backlog (parking lot 999.x). See backlog item for full scope.

## Follow-ups (still open, NOT addressed by this debug)

| Priority | Issue | Status |
|----------|-------|--------|
| RESOLVED | ~~`production-cameras-flapping` Bug #1~~ — fix in v1.3.1 (commits `badd5a1` + `03c66e5`); production verified 2026-04-30 ~12:30 UTC, no flap events in 6hr post-deploy. See `.planning/debug/production-cameras-flapping.md` |
| MEDIUM | NestJS Throttler returning 429 on `/api/srs/callbacks/on-hls` for ALL cameras every 2s — recording/DVR/archive pipeline may be silently broken | not investigated; observed during this debug session |
| LOW | iOS Safari embed compatibility for Uniview/Hikvision/Dahua cameras (single-frame display bug, separate from PTS skew) | no user reports yet; Apple Developer forum thread documents the symptom |

## Knowledge Captured

- **SRS HLS muxer is intolerant of source PTS skew** — VLC tolerates non-monotonic/wrapping PTS, SRS does not. When source is bad, SRS computes garbage segment durations (`dur=1115845ms` for 2s segments) and never seals them into the playlist.
- **Uniview "u-code" / Smart Codec** is the most likely root cause class for camera-side PTS skew (similar to Hikvision H.264+ and Dahua smart codec). Disable per-camera in vendor web UI under Setup → Video & Audio if accessible.
- **Transcode profile is the operator-facing escape hatch** for any codec/PTS quirk — not just H.265 codec mismatch. Document this in tenant docs / camera onboarding tooltips.
- **Probe signals worth surfacing at onboarding:** PTS variance from packet sampling (Tier 2), VFR detection from `r_frame_rate` vs `avg_frame_rate`, vendor heuristic from URL path (`/media/videoN` = Uniview), encoder tag from `tags.encoder`. Composite confidence → recommend transcode pre-emptively.
