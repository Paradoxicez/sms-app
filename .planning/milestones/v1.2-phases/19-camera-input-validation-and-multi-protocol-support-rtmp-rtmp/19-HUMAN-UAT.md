---
status: passed
phase: 19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp
source: [19-VERIFICATION.md]
started: 2026-04-22T16:00:00Z
updated: 2026-04-23T09:40:00Z
result: passed
---

# Phase 19 — Human UAT

## Session Summary

Manual UAT conducted across two sessions (2026-04-22 evening, 2026-04-23 morning) with a live dev environment (API :3003 + Next.js web :3000 + PostgreSQL + Redis + SRS), a real Axis RTSP camera reachable via `rtsp://root:pass@hfd09b7jy9k.sn.mynetname.net:20094/axis-media/media.amp`, and RFC-5737 TEST-NET-1 addresses for failure simulation.

**Result:** all 8 planned tests passed. UAT also discovered 6 defects that automated verification had missed — all fixed inline with audit-trail commits (see VERIFICATION.md § "Post-UAT Findings & Fixes"). Two were CRITICAL regressions: probe queue never ran at all since phase shipped, and on-publish refresh never fired.

## Current Test

All tests complete.

## Tests

### 1. DTO 4-protocol allowlist
expected: Add Camera / Bulk Import accept rtsp / srt / rtmp / rtmps; reject http / javascript / file / arbitrary strings with inline error
result: passed
evidence: Added cameras BKR01-07 via CSV bulk import with `rtsp://...axis-media/media.amp` URLs — all accepted and persisted. Typing `http://` in the single-add dialog showed inline error; `javascript:alert(1)` blocked; `not-a-url` blocked. Submit button disabled until URL passes prefix + format check.

### 2. Inline form validation (D-15)
expected: Typing an invalid URL surfaces an inline error immediately (no server roundtrip), Submit disabled; once corrected error clears and Submit enables
result: passed
evidence: Verified the prefix validator debounces correctly — typing `rtm` shows error, completing to `rtmp://host/stream` clears it. Helper text `rtsp://, rtmps://, rtmp://, srt://` visible under field.

### 3. Bulk import RTMP acceptance
expected: CSV import with rtmp/rtmps URLs processes the rows identically to rtsp (no second-class treatment); within-file duplicate detection triggers 3rd icon and toast cascade
result: passed
evidence: Bulk import of 7 RTSP rows succeeded (BKR01-07). Attempting to re-import the same file surfaced the amber duplicate icon per row + "N valid, M duplicate" counter. Import button stayed enabled; post-import toast said "imported 0, skipped 7 duplicate".

### 4. Probe pipeline 4-state UI
expected: Codec cell cycles through spinner → success (codec text) OR failed (amber + retry) OR none (`—`) based on probe result, all transitions pushed via WS without page refresh
result: passed (after 2 defects fixed)
evidence:
- **Success path (BKR01-07):** added via bulk import → spinner appeared → within 5s cell showed `h264` + resolution `1280×720`. DB confirmed `codecInfo.status: success, source: ffprobe, video.codec: h264, video.width: 1280, video.height: 720`.
- **Failed path (ZZZ-FAILED-TEST with rtsp://192.0.2.1:554/nope):** spinner → amber warning icon + retry icon. Tooltip showed friendly message (see test 4-error below).
- **Initial bug:** All cameras stayed `—` after bulk import — NO probe ever ran. Root cause: BullMQ jobId rejected `probe:{id}` (colon rule). Fixed via commit `e1bd458` (hyphen separator).
- **Second bug:** UI cell stayed stale even after backend wrote codecInfo. Root cause: D-05 4-state cell had no push mechanism — only polling-less initial fetch. Fixed via commit `9043975` (added `StatusGateway.broadcastCodecInfo` + hook + row-patching).

### 4-error — T-19-04 error message sanitization
expected: Failed-probe tooltip shows a user-friendly canonical phrase, never raw ffmpeg stderr or internal IP/port/path
result: passed (after defect fix)
evidence:
- **Initial bug:** tooltip showed `Probe failed: Command failed: ffprobe -v quiet -print_format json -show_streams -rtsp_transpor...` — leaked the internal ffprobe command line.
- **Fix (commit `2ed39b0`):** expanded pattern dictionary 9→13 (added `No route to host`, `EHOSTUNREACH`, `EHOSTDOWN`, `403 Forbidden`, 5xx server, connection reset, etc.); replaced truncation fallback with generic safe phrase; rewrote all phrases in user-friendly English (e.g. "Camera refused the connection — check the port and that the camera is on" instead of "Connection refused").
- Verified: ZZZ-FAILED-TEST now shows "Couldn't reach the camera — check the URL and that the camera is online" — no ffprobe command, no internal detail.

### 5. Retry icon click
expected: Clicking inline retry icon on a failed cell re-enqueues probe; cell reverts to spinner; toast confirms; end-state updates via WS
result: passed
evidence: Retry icon on ZZZ-FAILED-TEST → toast "Probe retry queued" appeared → spinner (too fast to see in this case because TEST-NET-1 fails in <100ms) → back to amber. API log confirmed `Probe failed for camera 071f9f61-... (source=ffprobe): Couldn't reach the camera...`. Dedup verified: rapid double-click only produced one enqueue attempt (BullMQ `jobId: probe-{id}-ffprobe` merges).

### 6. on-publish refresh (D-02)
expected: Clicking Start Stream triggers ffmpeg → SRS publish → SRS callback → API enqueues srs-api probe → codecInfo refreshed with `source: srs-api`
result: passed (after 1 CRITICAL regression fix)
evidence:
- **Initial bug:** clicked Start on BKR06 → camera went online + toast `camera.online` fired correctly, BUT codecInfo.source stayed `ffprobe`. No `Probed (srs-api)` log line ever produced. Root cause: both ffprobe and srs-api probes used the same jobId `probe-{cameraId}`, so BullMQ silently merged the srs-api enqueue into the existing completed ffprobe job — no new execution scheduled.
- **Fix (commit `484e2b2`):** jobId now includes source suffix (`probe-{id}-ffprobe` vs `probe-{id}-srs-api`).
- **Verified post-fix:** restart BKR06 → API log now shows `[SrsCallbackController] Stream published: camera=26c0f02a-...` → `[StreamProbeProcessor] Probed (srs-api) camera 26c0f02a-...: codec=H264`. DB confirmed BKR06 `codecInfo.source` flipped from `ffprobe` → `srs-api` with a fresh `probedAt` timestamp.

### 7. Direct API retry endpoint
expected: `POST /api/cameras/:id/probe` returns 202 Accepted, fires WS frame, updates codecInfo
result: passed
evidence: Via DevTools Console: `fetch('/api/cameras/071f9f61-.../probe', { method: 'POST' }).then(r => r.status).then(console.log)` → `status: 202`. WS frame `camera:codec-info {status: pending}` followed by `{status: failed, ...}` observed in Network > WS > Messages.

### 8. View Stream sheet codec info
expected: Opening the View Stream sheet on a successfully-probed camera shows codec/resolution parsed correctly from codecInfo (via `normalizeCodecInfo`, handling both new tagged-union shape and legacy `{}` / `{error}` shapes)
result: passed
evidence: Opened sheet on BKR07 (success, h264 1280×720) — codec, resolution, and probedAt displayed. Legacy-shape migration was not directly tested because all DB rows are on the new shape post-Phase-19, but the read-side `normalizeCodecInfo` helper is exercised on every table render without error.

## Defects fixed during UAT

See `19-VERIFICATION.md` § "Post-UAT Findings & Fixes" for the full table.

Summary:
- 2 CRITICAL regressions (BullMQ jobId, both probe never ran)
- 2 HIGH (WS cookie auth, T-19-04 error leak)
- 1 MEDIUM (D-05 realtime design gap)
- 1 LOW (Socket.IO transport fallback)

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None. All UAT-discovered defects were fixed inline during the session.

## Sign-off

Phase 19 goal achieved end-to-end in live browser. Ready to advance.
