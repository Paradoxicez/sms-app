---
status: resolved
scope: bug_1_only
trigger: "production-cameras-flapping — หลัง deploy ระบบขึ้น production server แล้ว มีกล้องบางตัว flap (ติดๆดับๆ); หาวิธี diagnose บน production และระบุ root cause"
created: 2026-04-30
updated: 2026-04-30T~12:30Z
resolved: 2026-04-30
ssh_diagnostic_run: 2026-04-30T03:30-03:43Z (ice@stream.magichouse.in.th)
fix_applied: commits badd5a1 (12:36 +0700) + 03c66e5 (14:15 +0700), 2026-04-30
fix_deployed: GHCR :latest rebuild from d7f5b17 at 07:16 UTC; production container restarted 09:10 UTC, both 2026-04-30
note: Bug #2 (FFmpeg I/O error on Saensuk + cam 6 + BKR02/05/06) NOT addressed — separate root cause; Bug #2 partially resolved out-of-band when user switched Saensuk-139 to transcode profile (see saensuk-139-live-but-preview-broken.md) but cohort coverage incomplete.
---

## ROOT CAUSE IDENTIFIED — Live diagnostic on stream.magichouse.in.th (2026-04-30 03:30-03:43Z)

### Bug #1 (HIGH — main flap loop): CameraHealthService false-positive `srs=false`

**File:** `apps/api/src/resilience/camera-health.service.ts:71-94`

**Evidence:**
- Time 3:40:00 AM: log says `dead stream detected for camera 86ea014b... (ffmpeg=true, srs=false)` → kills FFmpeg
- Time 3:42:00 AM: same camera transitions `reconnecting → connecting → online` after restart
- ~12 minute cycle for working cameras (BKR01/03/04/07)
- SRS `/api/v1/streams/` (when queried directly) DOES contain the stream with `recv_30s ≈ 2000 kbps`
- SRS log shows hundreds of `client disconnect peer. ret=1007` warnings on `GET /api/v1/streams` requests from 172.19.0.3 (api container) — under load, SRS HTTP server intermittently refuses concurrent requests
- `srsApi.getStreams()` catches the failure → returns `{streams: []}` → `srsStreamIds` = empty Set → ALL cameras marked `srsAlive=false` → ALL FFmpeg killed

**Why smoke didn't catch this:** Only 7 cameras + 1-hour observation; flap cycle takes 12 min so the run hit the "happy" portion of cycles. With 19 cameras + 12+ hours uptime, the SRS HTTP API gets enough concurrent load (CameraHealthService probe + StreamProbeProcessor probes + Snapshot triggers) to start dropping connections (ret=1007).

**Fix direction (NOT applied — investigation only):**
- Add tolerance: cache last-known-good SRS streams; only mark `srsAlive=false` after N consecutive empty results
- OR: add retry with backoff on `getStreams()` failures
- OR: switch CameraHealthService to use SRS `/api/v1/streams/<id>` per-camera (cheaper, ETA bypasses 302 redirect overhead)
- Long term: bound concurrent SRS API requests via semaphore in SrsApiService

### Bug #2 (HIGH — Saensuk + cam 6 never stable): FFmpeg `Input/output error` on RTMP push

**Symptom:** All 11 Saensuk cameras + camera "6" + BKR02/05/06 → `ffmpeg exited with code 1: rtmp://srs:1935/live/.../<id>: Input/output error` within 1-2 seconds of FFmpeg start

**Evidence:**
- `on_publish` callback returns `{"code":0}` instantly (manually verified for camera b301852f Saensuk-141)
- "Stream published" log shows in api → SRS DID accept publish
- But FFmpeg I/O error happens 1-3s later → SRS dropped connection AFTER accept
- BKR01/03/04/07 with **identical** FFmpeg cmdline succeed — only difference is RTSP source URL
- ffprobe (read-only) on Saensuk RTSP succeeds → RTSP source IS reachable + valid

**Likely causes (ranked):**
1. **RTSP source frame rate / codec parameter that libx264 re-encode chokes on** — Saensuk profile2 path may emit non-standard SPS/PPS that crashes libx264 when it tries `scale=1280x720`. Need full FFmpeg stderr to confirm.
2. **Concurrent FFmpeg startup overwhelms SRS** — 14 FFmpeg processes start within 4 seconds (3:34:43 → 3:34:47); RTMP handshake races against SRS's per-source thread allocation.
3. **Mid-stream RTSP packet loss** triggers libx264 PTS gap → encoder failure → FFmpeg dies → I/O error wraps the actual cause.

**Fix direction:** Capture full FFmpeg stderr (currently log only shows "exited code 1: I/O error" — not the underlying ffmpeg output). Need to instrument `apps/api/src/streams/ffmpeg/ffmpeg.service.ts` to retain stderr tail on failure.

### Bug #3 (already fixed in v1.3.0 / d74b9a4 — confirm not recurrent)

drift #11 (CameraHealthService probe wrong env var) → confirmed FIXED. Env vars `SRS_API_URL=http://srs:1985` correctly set. Issue is now Bug #1 (different mechanism — SRS HTTP server load, not env var).

### Environmental observation: Caddy unhealthy + 502 EOF on internal HLS proxy

`docker inspect sms-platform-caddy-1` → `Status: unhealthy, FailingStreak: 2086` (TLS internal-error 80 on self-check). Production logs show **502 EOF** errors on `/srs-hls/.../<camera>.m3u8` requests from `172.19.0.1` (Docker bridge gateway) with `User-Agent: Lavf/59.27.100`. This is the snapshot/probe pipeline reaching SRS via PUBLIC domain (via Caddy hairpin) instead of internal `srs:8080`. Independent issue but contributes to the ⚠️ codec reload icons.

`PUBLIC_HLS_BASE_URL=https://stream.magichouse.in.th/srs-hls` env var → some service uses this even for internal probes. Should use internal `SRS_HLS_URL=http://srs:8080` for service-to-service calls and reserve PUBLIC_HLS_BASE_URL for browser-facing playback URLs.

### Camera state snapshot (DB at 2026-04-30 03:43Z)

| status | count | cameras |
|--------|-------|---------|
| online | 4 | BKR01/03/04/07 (currently in their up-cycle, will flap in ~10 min) |
| reconnecting | 15 | Saensuk-131..141 (11) + camera "6" + BKR02/05/06 |

Total: 19 cameras (matches user's UI showing flap pattern). User's screenshot showing 30+ cameras is likely a different org or stale view.

---

## Current Focus

hypothesis: Diagnostic surface mapped from codebase. Top suspects (ranked) after reading SRS / FFmpeg / BullMQ pipelines:
  H1 (HIGH) — FFmpeg has NO `-stimeout`/`-rw_timeout`/`-reconnect` flags (`apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts`). RTSP-pull cameras with unstable network path hang or die mid-stream → CameraHealthService 60s tick marks dead → SIGTERM + re-enqueue → flap cycle. Probe runs ffprobe with 15s exec timeout (`apps/api/src/cameras/ffprobe.service.ts:33`) → sometimes wins, sometimes loses, hence "⚠️" reload icon toggling.
  H2 (HIGH) — `enqueueProbeFromSrs` fires on `on_publish` with delay=1000ms (`apps/api/src/srs/srs-callback.controller.ts:144,201`); probe-camera processor calls `srsApi.getStream()`. SRS may not have populated `video`/`audio` codec on a flapping stream within 1s → empty codec → `codecKnown=false` skips success write but DOES NOT write 'pending' either → never resolves → UI shows ⚠ permanently until next on_publish.
  H3 (MEDIUM) — Production-only network constraint: KBTG cameras are LAN-internal RTSP. api container reaches the host's NAT path via `edge` bridge; if production server has no route to camera LAN that dev machine had → 100% probe fails for KBTG; cameras may still publish if encoder pushes outward, but pull-mode FFmpeg can never connect.
  H4 (MEDIUM) — SRS `on_publish` HTTP callback timeout. SRS POSTs to `http://api:3003/api/srs/callbacks/on-publish`; if api blocks on Prisma + audit + queue add (>5s default SRS hook timeout), SRS rejects publish → flap. Confirmed by `archives` failure count + apiLogs `Audit publish_rejected`.
  H5 (LOW) — StreamProcessor undefined-cameraId bug regression — defensive guard now returns silently (`apps/api/src/streams/processors/stream.processor.ts:78-91`), but the upstream root cause of BullMQ enqueuing empty data was never identified (memory note 260421-g9o still open). `streamGuard.recordRefusal('undefined_cameraId')` count exposed at `/api/srs/callbacks/metrics`.
test: User runs playbook on production; results from each step discriminate H1–H5
expecting: One hypothesis confirmed by the diagnostic output
next_action: Return diagnosis (find_root_cause_only mode); user runs playbook + reports findings, then we form a fix in a follow-up session

## Symptoms

expected: กล้องทุกตัวควร stay LIVE ต่อเนื่อง พร้อม codec (H264) + resolution (704x576 หรือ 1280x720) detect ได้

actual:
- 1 กล้อง OFFLINE: camera id=33 (Bedrock org / KBTG site / Passthrough 720 profile)
- 9 กล้อง LIVE แต่ codec column แสดง warning + reload icon และ resolution = "—" (probe ไม่สำเร็จ)
  KBTG/Passthrough: 18, 15, 14, 11, 8, 6
  BKK/Transcode HD15: BKR06, BKR05, BKR02
- 10 กล้องทำงานปกติ แสดง H264 + resolution ครบ
- ปัญหาเกิดข้าม 2 site (KBTG, BKK) และ 2 stream profile (Passthrough, Transcode) → infrastructure-layer

errors:
- Codec column "⚠️ C" (warning + reload) บนกล้องที่ probe ไม่ได้
- ไม่มี error message text จาก dashboard

reproduction:
- ดู Cameras list ที่ web UI หลัง deploy production
- กล้องเดียวกันบางครั้ง LIVE บางครั้ง OFFLINE (flapping)

started: หลัง production deployment v1.3 (Phase 30 smoke test gate). Dev environment ไม่พบ pattern นี้

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-30
  checked: apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts (full file)
  found: FFmpeg builder adds ONLY `-rtsp_transport tcp` for rtsp inputs. No `-stimeout`, `-rw_timeout`, `-reconnect`, `-reconnect_at_eof`, `-reconnect_streamed`, `-reconnect_delay_max`. fluent-ffmpeg uses default behavior — RTSP read can hang for the OS TCP keepalive window (default ~2 hours on Linux).
  implication: A flaky RTSP source can keep FFmpeg "alive" (process running, no bytes flowing) for many minutes; SRS will dispose its HLS playlist after `hls_dispose 30` (config/srs.conf:34) → camera shows OFFLINE in UI but FFmpeg still runs → CameraHealthService tick (60s) marks dead via `srsAlive=false` → SIGTERM + re-enqueue → flap.

- timestamp: 2026-04-30
  checked: apps/api/src/cameras/ffprobe.service.ts:33
  found: `execAsync(cmd, { timeout: 15000 })` — only 15s. Uses `-rtsp_transport tcp` for rtsp:// URLs.
  implication: On slow / lossy RTSP path (typical for LAN cameras over VPN or NAT pinhole), 15s is too tight. Probe times out → codecInfo.status='failed' with "Camera didn't respond in time" — but UI shows generic ⚠ (no tooltip text in the symptom).

- timestamp: 2026-04-30
  checked: apps/api/src/streams/processors/stream-probe.processor.ts:142-242 (codec-mismatch branch + writeCodecInfo)
  found: When source='srs-api' AND camera is push+passthrough, on empty codec strings the code does `codecKnown=false` and falls through to the SUCCESS write path with `codec: ''` — UI then has `codecInfo.status === 'success'` but `video.codec === ''` → 4-state cell renders ⚠ (cannot map empty to "H264").
  implication: This is the LIKELY explanation for "live but ⚠️ codec" — race between on_publish + 1s probe delay vs SRS codec parser. When SRS returns no `video.codec` yet, we write success with empty codec and never re-probe (the dedup `probe-${cameraId}-srs-api` jobId blocks subsequent enqueues until removed/completed).

- timestamp: 2026-04-30
  checked: apps/api/src/srs/srs-callback.controller.ts:144,201 + apps/api/src/cameras/cameras.service.ts:1289-1336
  found: Probe enqueue uses jobId `probe-${cameraId}-srs-api` and explicitly removes any existing job before adding new one (line 1315-1320). delay default = 1000ms.
  implication: Each on_publish DOES re-trigger a probe (good), but if camera flaps faster than the probe completes (or probe completes with empty codec), the codecInfo never converges to a valid value. There's no "retry on empty codec" path.

- timestamp: 2026-04-30
  checked: apps/api/src/resilience/camera-health.service.ts:55-131
  found: Tick every 60s. For non-push-passthrough cameras: `dead = !ffmpegAlive || !srsAlive`. On dead → SIGTERM + transition to `reconnecting` + enqueue stream-ffmpeg job with `attempts: 20, backoff: exponential delay 1000`.
  implication: With 20 attempts × exponential backoff (1s → 2s → 4s → ... cap 5min), a camera that fails to (re)connect can stay in retry purgatory for ~85 minutes before BullMQ marks the job failed. During that window the UI shows reconnecting/connecting alternating with online → flap.

- timestamp: 2026-04-30
  checked: deploy/docker-compose.yml networks (lines 327-333) + Caddyfile reverse_proxy
  found: Two networks — `edge` (external bridge) and `internal` (internal:true, no internet egress). api joins BOTH. Cameras' RTSP sources (rtsp://...) are ALWAYS reached via `edge` bridge → host networking → upstream router. If production VM has no route to camera LAN (KBTG private subnet not reachable from VM), pull-mode FFmpeg gets ENETUNREACH/ETIMEDOUT.
  implication: Cross-checks H3. Need `docker compose exec api ffprobe rtsp://...` to confirm reachability; if it fails for KBTG cameras only, network path is the cause for that subset. Doesn't explain BKK transcode cameras unless they share same network constraint.

- timestamp: 2026-04-30
  checked: deploy/Caddyfile + config/srs.conf http_hooks
  found: SRS posts hooks to `http://api:3003/...` (compose-internal DNS). No SRS hook timeout setting exists; SRS default is 5 seconds. on-publish handler does: parseStreamKey → DB find → status.transition (DB write + WS broadcast + queue add) → snapshot enqueue + probe enqueue + audit. Worst case ≈4 sequential awaits.
  implication: Under slow Postgres or Redis (e.g., 100ms latency × 5 awaits = 500ms baseline; under contention could exceed 5s) → SRS rejects publish → camera flaps. Check api logs for `[Nest] LOG [SrsCallbackController] Stream published` cadence vs SRS access logs.

- timestamp: 2026-04-30
  checked: apps/api/src/streams/processors/stream.processor.ts (full file)
  found: `Refusing job with empty data` log + streamGuardMetrics.recordRefusal exists. Lines 78-91 catch the undefined-cameraId case but DO NOT identify what's enqueuing them.
  implication: If `/api/srs/callbacks/metrics` returns `streamGuard.refusals.undefined_cameraId > 0`, the bug is still firing. This adds noise to flap pattern (jobs silently swallowed → camera never recovers from one of its 20 attempts).

- timestamp: 2026-04-30
  checked: bin scripts available — apps/api/bin/sms is ONLY `create-admin`. No diagnostic subcommand.
  found: Production diagnostic surface available WITHOUT new code:
    1. `/api/health` (public, no auth) — liveness only
    2. `/api/srs/callbacks/metrics` (no auth — public; serves archives + streamGuard counters)
    3. `/api/admin/dashboard/active-streams` (super-admin) — count only
    4. `/api/admin/dashboard/system-metrics` (super-admin) — calls SRS summaries
    5. `/api/admin/dashboard/platform-issues` — critical/warning feed
    6. SRS HTTP API at port 1985 — bound to 127.0.0.1 only (compose line 119) → must `docker compose exec srs ...`
    7. docker compose logs for api / srs / postgres / redis
    8. Postgres: cameras.status, cameras.codecInfo
    9. Redis: BullMQ queues `stream-ffmpeg`, `stream-probe`, `camera-health`, `camera-notify`
    10. SRS HLS volume `/usr/local/srs/objs/nginx/html` (find .m3u8)
  implication: Playbook below uses ONLY these existing surfaces — no new code needed.

## Resolution

root_cause: Bug #1 (CameraHealthService false-positive `srs=false` cascade) — confirmed by 03:30-03:43Z SSH diagnostic. Under concurrent SRS HTTP load (CameraHealthService probe + StreamProbeProcessor + Snapshot triggers), SRS HTTP server returns `client disconnect peer. ret=1007` to a percentage of `/api/v1/streams` requests. Pre-fix `srsApi.getStreams()` catch-all returned `{streams: []}` on any error → empty Set → ALL cameras marked `srsAlive=false` → ALL FFmpeg SIGTERM'd → ~12 minute flap cycle.

fix: Cache + miss-tolerance in `CameraHealthService.runTick()`:
  - Keep last-known-good `srsStreamIdsCache` Set populated only on successful `getStreams()` responses.
  - On `getStreams()` failure: fall back to fresh cache (CACHE_STALE_MS=5min) when available, OR skip the liveness pass entirely this tick. NEVER treat a failed call as "all streams gone."
  - Per-camera `missCounters` Map: a camera missing from the SRS response one tick is tolerated (MISS_TOLERANCE=2 default). Only after MISS_TOLERANCE consecutive misses with `ffmpegAlive=true` is the camera SIGTERM'd.
  - StreamHealthMetricsService bumps tolerance per-camera up to MAX=4 when the camera flaps quickly after coming online.
  - Trade-off: if SRS is genuinely unreachable for ≥5 min, dead cameras won't be detected by SRS-side absence — but `!ffmpegAlive` (process actually exited) still works, so we never miss a hard FFmpeg crash.
  - Operator visibility: every cache fallback emits `CameraHealthService: using cached SRS stream set (age=Xs, size=N)` at debug level; every skipped tick emits `no fresh SRS cache available — skipping liveness pass this tick` at warn level.

verification:
  - Local TypeScript build: `pnpm --filter @sms-platform/api build` → "Successfully compiled: 176 files with swc"
  - Local typecheck (tsc --noEmit): zero errors in `apps/api/src/resilience/` or `apps/api/tests/resilience/`
  - Unit tests: `apps/api/tests/resilience/camera-health.test.ts` updated with 5 new cases covering (a) cold-cache + failure → no kill, (b) warm-cache + failure → fallback, (c) MISS_TOLERANCE=2 grace, (d) declares dead after 2 consecutive misses, (e) does not throw on first-tick failure. Old "treats all cameras as potentially dead" test removed (regressed by fix design).
  - Test runner blocked locally because Docker postgres on port 5434 is not running; user needs to `docker compose up -d postgres` then `pnpm --filter @sms-platform/api test --run resilience/camera-health` to confirm green.
  - Production verification: PENDING user deploy gate (see "Deploy Gate" below).

files_changed:
  - apps/api/src/resilience/camera-health.service.ts (cache + miss-tolerance + adaptive tolerance + reload cron) — committed in badd5a1 + 03c66e5, currently in v1.3.1 tag
  - apps/api/src/streams/stream-health-metrics.service.ts (NEW @Global service for adaptive tolerance + backoff + crash-loop detection) — committed in f8377bf
  - apps/api/src/srs/srs-api.service.ts (`count=9999` to disable SRS pagination cap) — committed in 21840f0
  - apps/api/tests/resilience/camera-health.test.ts (test refresh — pre-existing test asserted old buggy behavior) — uncommitted, this session

## Fix Applied (2026-04-30 20:58 +07)

**Status:** Fix code is **already committed and tagged v1.3.1**. This session refreshed the unit tests so they reflect the new behavior (the old "all cameras potentially dead" assertion was a stale guard for the bug, not the fix).

**What ran in this session:**
1. Read `apps/api/src/resilience/camera-health.service.ts` and confirmed the cache + miss-tolerance pattern is implemented per the four fix directions in this debug doc (#1 tolerance — applied; #2 retry — not applied, deferred; #3 per-camera probe — not applied, deferred; #4 semaphore — not applied, deferred).
2. Read `apps/api/src/srs/srs-api.service.ts` — no semaphore (#4) yet. SrsApiService is a thin wrapper around `fetch()`; bounded-concurrency would require a deeper refactor and the cache+tolerance fix already breaks the cascade. Defer #4 unless production confirms continued issues.
3. Read existing test `apps/api/tests/resilience/camera-health.test.ts`. Found one stale test that asserted the OLD buggy behavior ("treats all cameras as potentially dead" when getStreams fails). Replaced it with 5 new cases that exercise the cache + miss-tolerance contract.
4. `pnpm --filter @sms-platform/api build` → success, 176 files compiled.
5. `tsc --noEmit` → zero errors in resilience/* (pre-existing TS errors in other modules — not introduced by this work).
6. Unit-test runtime blocked: docker compose postgres@5434 not running in this sandbox. Tests must be run on user's machine.

**Out-of-scope (per checkpoint instructions):**
- Bug #2 (FFmpeg I/O error on Saensuk + camera 6 + BKR02/05/06) — separate cohort, separate root cause; not addressed.
- Tier-B-genpts-defense stash from saensuk-139 debug — left untouched.
- SrsApiService semaphore (#4) — deferred unless cache+tolerance proves insufficient.
- SrsApiService retry-with-backoff (#2) — deferred (cache absorbs the same transient failure window).
- Per-camera `/api/v1/streams/{id}` switch (#3) — deferred (deeper refactor; current single-call design is OK with tolerance).

## Production Verification — RESOLVED (2026-04-30 ~12:30 UTC, ~6hr after deploy)

Production runs `ghcr.io/paradoxicez/sms-api:latest` (digest `sha256:8bac8de4...`, image built from commit `d7f5b17` at 07:16 UTC, descendant of fix commits `badd5a1` + `03c66e5`). Container started at 09:10 UTC. Fix code confirmed present in running container:
- `grep -c MISS_TOLERANCE /app/apps/api/dist/resilience/camera-health.service.js` → **3 matches**
- `grep -c srsStreamIdsCache /app/apps/api/dist/resilience/camera-health.service.js` → **4 matches**

Log signatures over the 6-hour window since deploy (09:10 UTC → 15:30 UTC):

| Pattern | Count | Interpretation |
|---------|-------|----------------|
| `using cached SRS stream set` | 0 | SRS HTTP API never failed → no cache fallback needed |
| `tolerating srs-miss` | 0 | No camera ever missing from SRS for even one tick |
| `dead stream detected` | 0 | NO false-positives — pre-fix this would fire ~every 12 min |
| `transitioning/reconnecting/connecting` (last 1hr) | 0 | Cameras stable, no flap activity |

**Conclusion:** Bug #1 is RESOLVED in production. The cache+tolerance fix is running, and the underlying SRS HTTP overload condition has not recurred over 6 hours of uptime. The 12-minute flap cycle observed in the 03:30-03:43 SSH diagnostic was on the pre-fix image (container started before 09:10 deploy).

Verification commands used:
```bash
ssh ice@stream.magichouse.in.th 'docker compose logs api --since 6h 2>&1 | grep -cE "..."'
```

Future regression detection: if `dead stream detected` reappears for healthy cameras OR `using cached SRS stream set` count spikes >100/hr, investigate whether SRS HTTP server load has crossed a new threshold and consider applying fix-direction #4 (SrsApiService semaphore) at that time.

## Deploy Gate (RESOLVED — production already on fix)

The fix is in `v1.3.1` tag (committed 2026-04-30 14:15-15:22 +07). User must verify whether production server is currently running this image:

```bash
# On production (ice@stream.magichouse.in.th):
ssh ice@stream.magichouse.in.th
cd /home/ice/sms-app
docker inspect sms-platform-api-1 --format '{{ index .Config.Labels "org.opencontainers.image.version" }}'
# OR
docker compose images api
```

**If production is on `:v1.3.0` or earlier:** the fix is NOT yet deployed. Pull `:v1.3.1` and restart:
```bash
cd /home/ice/sms-app
git pull origin main
docker compose pull api
docker compose up -d api
docker compose logs -f api 2>&1 | grep -E "CameraHealthService|dead stream"
```

**If production is on `:v1.3.1` already:** the fix IS deployed; the flap reported during the SSH diagnostic happened on the OLD image. Confirm by tailing logs for ~15 minutes (one full flap cycle was 12 min); the `dead stream detected` warnings should NOT recur.

**Test plan to confirm fix in production:**
1. Tail api logs for 30 minutes: `docker compose logs -f api --tail 0 2>&1 | grep CameraHealthService`
2. Expected: `using cached SRS stream set` debug lines (occasional) + `tolerating srs-miss for X (1/2)` debug lines (occasional). NO `dead stream detected` warnings for cameras that are visibly healthy in the dashboard.
3. Expected: `/api/srs/callbacks/metrics` → `streamHealth` block populated with non-zero `cacheHits` and/or `tolerated` counters over time.
4. UI: 19 cameras stay LIVE for >30 min without the 12-min flap pattern. The 4 KBTG cohort cameras + Saensuk cohort may still flap — those are Bug #2, separate fix.

**Rollback plan if fix worsens behavior:**
```bash
cd /home/ice/sms-app
docker compose down
git checkout v1.3.0
docker compose pull api
docker compose up -d
```

Once user confirms in production: move this file from `.planning/debug/` to `.planning/debug/resolved/`, append to knowledge base, and commit.
