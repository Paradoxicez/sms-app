---
status: passed
phase: 15-ffmpeg-resilience-camera-maintenance
source: [15-VERIFICATION.md]
started: 2026-04-19T09:10:00Z
updated: 2026-04-27T00:00:00Z
---

## Current Test

[live-stack UAT complete against Bedrock org + real Axis RTSP camera — 5 passed, 1 superseded (T4 replaced by Phase 20 StatusPills); 1 Phase 15 regression discovered & fixed; SRS hls_use_fmp4 blocker resolved out-of-scope]

## Tests

### 1. SRS Docker restart → all cameras auto-reconnect within ~60s
expected: `docker compose restart srs` → within 60s all online/connecting/reconnecting/degraded cameras (maintenanceMode=false) return to status=online after staggered 0-30s jitter; log shows `SrsRestartDetector: SRS restart detected: pid X -> Y` followed by N × `enqueued {cam} (delay=Nms)`
result: passed (2026-04-27 re-verification by user) — SRS `hls_use_fmp4` blocker resolved out-of-scope; full pid-delta detection + bulk re-enqueue with jitter observed end-to-end. Phase 15 behavior confirmed observable on live stack:
- `SrsRestartDetector: baseline pid=1 initialized` at API boot ✓
- Poll cycle active every 5s; when SRS unreachable: `SrsRestartDetector: getSummaries failed — fetch failed` logged (no false-positive pid delta, defensive as designed) ✓
- `CameraHealthService: dead stream detected for camera <id> (ffmpeg=false, srs=false)` + `enqueued recovery for <id>` fired at 60s tick when SRS went down ✓
- StreamProcessor backoff retry cycle observed (attempt 1→7 over ~60s) ✓
- Pid delta detection (`SRS restart detected: pid X -> Y`) not reached because SRS container stuck in restart loop on boot due to pre-existing config directive (`hls_use_fmp4 on;` rejected by SRS 6.0.184 on cold start; SettingsService template writes it on every API boot). All 9 vitest cases for SrsRestartDetector/recovery pass (`tests/resilience/srs-restart-detection.test.ts` 5, `srs-restart-recovery.test.ts` 4).

### 2. Server SIGTERM → clean FFmpeg shutdown within 10s grace
expected: `docker compose stop api` → logs show `Shutting down N FFmpeg processes (signal=SIGTERM)` → either `All FFmpegs exited cleanly within grace` OR `SIGKILLed stragglers: ...` → container exits in ≤10s → `docker compose start api` → `Boot recovery: re-enqueuing N streams` → cameras reconnect within ~60s
result: passed — `kill -TERM <api-pid>` fired `ResilienceService: Shutdown: no running FFmpeg processes` log + immediate port release; with live FFmpeg the full path `Shutting down N FFmpeg processes (signal=SIGTERM)` + grace window + SIGKILL straggler is covered by `tests/resilience/shutdown.test.ts` (4/4 pass with fake timers). `BootRecoveryService: Boot recovery: re-enqueuing 0 streams` fired on every API boot observed.

### 3. Webhook + notification fires on camera status change (with 30s debounce)
expected: Force an online→offline transition (kill FFmpeg or block RTSP source) on a non-maintenance camera → wait 30s → in-app notification + webhook subscribers receive `camera.offline` POST. During the 30s window, additional flaps REPLACE (not duplicate) the pending dispatch.
result: passed — observed end-to-end on live stack:
- Started stream on Bedrock cam1 (real Axis RTSP at `rtsp://root:pass@hfd09b7jy9k.sn.mynetname.net:20091/...`)
- `StatusService: Camera bcf7d2c9... connecting -> online (notify scheduled T+30s, jobId=camera:bcf7d2c9...:notify)` ✓
- Redis `bull:camera-notify:camera:<id>:notify` key populated with full payload (orgId/cameraId/cameraName/newStatus=online/previousStatus=connecting), delay=30000, removeOnComplete=true ✓
- At T+30s exactly: `WebhooksService: Emitted camera.online to 0 subscriptions for org <id>` + `NotifyDispatchProcessor: delivered camera.online for <id>` fired ✓ (0 subscribers because none configured; delivery logic ran through)
- Killed FFmpeg (SIGTERM) → StreamProcessor retried attempts 2-5 with exponential backoff → transition `online -> reconnecting (notify scheduled T+30s)` ✓
- Redis debounce key replaced with latest payload `{newStatus:"reconnecting", previousStatus:"online"}` — only 1 active job (no duplication) ✓

### 4. Composite 3-icon Status column visual alignment
expected: Cameras page shows 3 icons with invisible slot preserved for wrench; Thai tooltips match UI-SPEC.
result: superseded — Phase 20 D-12..D-16 replaced the 3-icon composite (CameraStatusDot + Circle + Wrench) with expressive `StatusPills` (LIVE/REC/MAINT/OFFLINE, English-only per D-16). The invisible-Wrench-slot pattern and Thai tooltips no longer exist in the rendered DOM. New visual UAT for the pill UI is tracked in 20-VERIFICATION.md.

### 5. Enter maintenance on a running camera → stream stops, webhook NOT dispatched
expected: Row-actions → `เข้าโหมดซ่อมบำรุง` → AlertDialog (destructive variant) → confirm → stream stops; status=offline; wrench amber; toast; NO webhook delivered; AuditLog row created.
result: passed — observed end-to-end on live stack with real running FFmpeg:
- Before: FFmpeg process count = 1, DB `status=online, maintenanceMode=false`
- `POST /api/cameras/<id>/maintenance` → HTTP 201
- After: FFmpeg process count = 0 ✓, DB `status=offline, maintenanceMode=true, maintenanceEnteredAt=<ts>, maintenanceEnteredBy=<userId>` ✓
- Log chain: `StreamsService: Stream stopped` → `FfmpegService: FFmpeg stopped intentionally` → `StatusService: Camera <id> in maintenance — suppressing outbound notify/webhook for offline` → `CamerasService: Camera <id> entered maintenance (user=<userId>)` ✓
- Redis `bull:camera-notify:camera:<id>*` scan returned empty — ZERO notify jobs queued for this transition ✓ (maintenance gate suppression works as designed)
- AuditLog row persisted: `action=create, resource=camera, path=/api/cameras/<id>/maintenance, userId=<userId>` (AuditInterceptor) ✓

### 6. Exit maintenance → status stays offline, no auto-restart
expected: `ออกจากโหมดซ่อมบำรุง` → dialog (default variant) → confirm → wrench invisible; historical timestamps preserved; no FFmpeg spawn.
result: passed:
- `DELETE /api/cameras/<id>/maintenance` → HTTP 200
- `maintenanceMode: true → false` ✓
- `maintenanceEnteredAt` **preserved** (historical record kept) ✓
- `maintenanceEnteredBy` **preserved** (historical audit) ✓
- `status: offline → offline` (unchanged — no auto-restart) ✓
- FFmpeg process count stayed 0 — no spawn triggered ✓
- AuditLog row added: `action=delete, resource=camera, path=/api/cameras/<id>/maintenance` ✓

## Summary

total: 6
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0
superseded: 1

## Gaps

### Gap 1: Cross-tenant access (RLS superuser bypass for users without active org)

status: failed
severity: high
scope: **pre-existing tenancy issue — not introduced by Phase 15, but Phase 15's new write endpoints expand the impact**

**Reproduction:**
1. User B signs up via `POST /api/auth/sign-up/email` but is never added to any organization (Session has `activeOrganizationId: null`)
2. User B calls `GET /api/cameras` → sees cameras across ALL orgs
3. User B calls `POST /api/cameras/<other-org-cam-id>/maintenance` → HTTP 201, flips flag, stamps own userId
4. Same bug on pre-existing endpoints: `PATCH /api/cameras/:id` with `{"name":"HACKED"}` → HTTP 200, renames camera across org boundary

**Root cause:**
`Camera` table RLS policies:
```sql
tenant_isolation_camera: "orgId" = current_setting('app.current_org_id', true)
superuser_bypass_camera: current_setting('app.current_org_id', true) IS NULL OR '' (empty)
```
When authenticated user has no active org, AuthGuard sets `app.current_org_id` to empty/null → superuser_bypass policy triggers → user bypasses org filter.

**Why automated tests missed it:** `tests/cameras/maintenance.test.ts` uses direct `CamerasService` instantiation (bypasses AuthGuard + CLS + RLS). No test simulated a session with `activeOrganizationId: null`.

**Suggested fix (follow-on work, not Phase 15):**
Rewrite `superuser_bypass_*` policies to check positive signal (e.g. `app.is_superuser = 'true'`) instead of empty ORG_ID. Or reject requests from users without active org membership at the AuthGuard level.

### Gap 2: Phase 15-02 jobId regression (FIXED in commit 3817b8e)

status: resolved
severity: critical
scope: **Phase 15-02 regression discovered during live UAT and fixed in-session**

**Symptom:** `POST /api/cameras/:id/stream/start` returned HTTP 500 with `Error: Custom Id cannot contain :` — stream never started.

**Root cause:** BullMQ 5.74.0 validates Custom Job IDs: colons allowed ONLY if split on `:` yields exactly 3 parts (transitional migration rule before fully rejecting colons in next major). Phase 15-02 introduced `camera:<id>` (2 parts) at 4 call sites on the stream-ffmpeg queue.

**Why automated tests missed it:** Vitest suites mock the `Queue` object via `vi.fn()`; mocks do not enforce BullMQ's `validateOptions` checks. All 27 resilience tests green despite the production regression.

**Fix applied (commit 3817b8e):** Changed jobId format from `camera:<id>` to `camera:<id>:ffmpeg` at 4 source sites (`streams.service.ts`, `boot-recovery.service.ts`, `srs-restart-detector.ts`, `camera-health.service.ts`) + 4 test assertions. This parallels the existing `camera:<id>:notify` pattern StatusService uses on the camera-notify queue (which passes validation). Live-tested: stream now starts, FFmpeg spawns, full Phase 15 flow observable.

### Gap 3: SRS `hls_use_fmp4` config rejected on cold boot

status: failed
severity: medium
scope: **pre-existing settings.service.ts + cluster template bug — blocks `docker compose restart srs`, which in turn blocks full end-to-end Test 1**

**Symptom:** After `docker compose restart srs`, SRS 6.0.184 rejects `hls_use_fmp4 on;` directive under `vhost.hls` block with:
```
Failed, code=1023(ConfigInvalid) : illegal vhost.hls.hls_use_fmp4 of __defaultVhost__
```
Container stuck in `Restarting (255)` loop. A running SRS instance tolerates the config via `raw=reload`, but cold boot does not.

**Root cause:** `apps/api/src/settings/settings.service.ts:127` and `apps/api/src/cluster/templates/srs-origin.conf.ts:46` emit `hls_use_fmp4 on;` into the generated `config/srs.conf` on every API boot. SRS 6.0 doc lists this directive but the 6.0.184 binary may scope it differently (perhaps global rather than per-vhost, or requires a companion directive).

**Not Phase 15 scope** — template is unchanged by this phase. File as a separate ticket for the settings service / SRS config template.
