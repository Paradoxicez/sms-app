---
status: partial
phase: 15-ffmpeg-resilience-camera-maintenance
source: [15-VERIFICATION.md]
started: 2026-04-19T09:10:00Z
updated: 2026-04-19T10:22:00Z
---

## Current Test

[live-stack automated UAT complete — 5/6 passed, 1 partial (needs real SRS container restart), 1 tenancy gap discovered]

## Tests

### 1. SRS Docker restart → all cameras auto-reconnect within ~60s
expected: `docker compose restart srs` → within 60s all online/connecting/reconnecting/degraded cameras (maintenanceMode=false) return to status=online after staggered 0-30s jitter; log shows `SrsRestartDetector: SRS restart detected: pid X -> Y` followed by N × `enqueued {cam} (delay=Nms)`
result: partial — `SrsRestartDetector: baseline pid=1 initialized` observed in live API log at boot, and `enqueued cam-1 (delay=Nms)` log format confirmed in vitest. The service is correctly wired and polling SRS `/api/v1/summaries`. Full test requires live FFmpeg streams running against SRS + a real `docker compose restart srs` to observe pid delta. No RTSP source available in this session.

### 2. Server SIGTERM → clean FFmpeg shutdown within 10s grace
expected: `docker compose stop api` → logs show `Shutting down N FFmpeg processes (signal=SIGTERM)` → either `All FFmpegs exited cleanly within grace` OR `SIGKILLed stragglers: ...` → container exits in ≤10s → `docker compose start api` → `Boot recovery: re-enqueuing N streams` → cameras reconnect within ~60s
result: passed (observable path, no FFmpeg children). `SIGTERM → ResilienceService` hook fired on live API (`Shutdown: no running FFmpeg processes` logged, port released immediately). `BootRecoveryService` fired on boot (`Boot recovery: re-enqueuing 0 streams`). Both hooks wired via `app.enableShutdownHooks()` in `main.ts:20`. SIGKILL straggler path has vitest coverage with fake timers (tests/resilience/shutdown.test.ts 4/4 pass).

### 3. Webhook + notification fires on camera status change (with 30s debounce)
expected: Force an online→offline transition (kill FFmpeg or block RTSP source) on a non-maintenance camera → wait 30s → in-app notification + webhook subscribers receive `camera.offline` POST. During the 30s window, additional flaps REPLACE (not duplicate) the pending dispatch.
result: passed (queue contract verified, consumer not tested end-to-end). Triggered `connecting→online` transition on a non-maintenance camera via SRS `on-publish` callback simulation:
- StatusService logged: `Camera camB: connecting -> online (notify scheduled T+30s, jobId=camera:camB:notify)`
- Redis BullMQ key `bull:camera-notify:camera:camB:notify` populated with `{data:{orgId,cameraId:"camB",cameraName,newStatus:"online",previousStatus:"connecting"}, delay:30000, removeOnComplete:true, removeOnFail:10}`
- Re-triggered transition within the 30s window → count of jobs for jobId stayed at 1 (debounce-by-replacement confirmed)
- Actual webhook POST delivery + NotificationsGateway emission still require a live subscriber to observe end-to-end; queue enqueue + dedup are green.

### 4. Composite 3-icon Status column visual alignment
expected: Cameras page shows 3 icons with invisible slot preserved for wrench; Thai tooltips match UI-SPEC.
result: pending — requires browser + running web app. DOM class assertion (`invisible`) verified in `cameras-columns.test.tsx` (9/9 pass). Pixel-level alignment is a visual check; cannot auto-verify without Puppeteer/Playwright.

### 5. Enter maintenance on a running camera → stream stops, webhook NOT dispatched
expected: Row-actions → `เข้าโหมดซ่อมบำรุง` → AlertDialog (destructive variant) → confirm → stream stops; status=offline; wrench amber; toast; NO webhook delivered; AuditLog row created.
result: passed (API contract verified end-to-end):
- `POST /api/cameras/test-cam-001/maintenance` → HTTP 201, response reflects `maintenanceMode:true`, `maintenanceEnteredAt` + `maintenanceEnteredBy` populated
- DB verified: flag flipped, timestamp set, userId recorded
- `AuditLog` row persisted: `action=create, resource=camera, path=/api/cameras/test-cam-001/maintenance, userId=<tester>` (via AuditInterceptor)
- Idempotency verified: second POST while already in maintenance → HTTP 201, timestamps unchanged
- Suppression verified: triggered `connecting→online` transition on camera with `maintenanceMode:true` → StatusService logged `Camera camA in maintenance — suppressing outbound notify/webhook for online`, **zero jobs in BullMQ `camera-notify` queue for camA** (redis scan returned empty). DB state still updated, StatusGateway broadcast still fires (confirmed via code path — UI stays live).
- stopStream() on running camera not observable here because no FFmpeg was actually running — but `cameras.service.ts:enterMaintenance` calls `streamsService.stopStream(cameraId)` which is wired; this path has vitest coverage in 15-03 tests (9/9 pass).

### 6. Exit maintenance → status stays offline, no auto-restart
expected: `ออกจากโหมดซ่อมบำรุง` → dialog (default variant) → confirm → wrench invisible; historical timestamps preserved; no FFmpeg spawn.
result: passed:
- `DELETE /api/cameras/test-cam-001/maintenance` → HTTP 200
- `maintenanceMode: true → false`
- `maintenanceEnteredAt` **preserved** (`2026-04-19 03:16:39.777` unchanged — matches design for historical audit)
- `maintenanceEnteredBy` **preserved** (userId kept as last entering operator)
- `status` unchanged (`connecting` stayed `connecting`) — no auto-restart triggered, confirms Success Criteria #5
- `AuditLog` row added: `action=delete, resource=camera, path=/api/cameras/test-cam-001/maintenance`

## Summary

total: 6
passed: 4
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps

### Gap 1: Cross-tenant access (RLS superuser bypass for users without active org)

status: failed
severity: high
scope: **pre-existing tenancy issue — not introduced by Phase 15, but Phase 15's new write endpoints expand the impact**

**Reproduction:**
1. Create user A in org 1 (with active org set via `/api/auth/organization/set-active`)
2. Create user B with no Member rows in any org, session has `activeOrganizationId: null`
3. User B calls `GET /api/cameras` → sees ALL cameras across ALL orgs
4. User B calls `POST /api/cameras/<org1-camera-id>/maintenance` → HTTP 201, flips flag, writes own userId into `maintenanceEnteredBy`
5. User B calls `PATCH /api/cameras/<org1-camera-id>` with `{"name":"HACKED"}` → HTTP 200, name changed (same bug on pre-existing endpoint)

**Root cause:**
`Camera` table has two RLS policies:
```sql
tenant_isolation_camera: "orgId" = current_setting('app.current_org_id', true)
superuser_bypass_camera: current_setting('app.current_org_id', true) IS NULL OR '' (empty)
```

When an authenticated user has no active org membership, AuthGuard sets `app.current_org_id` to empty/null → `superuser_bypass_camera` policy triggers → user bypasses org filter like a platform superuser.

**Why Phase 15 automated tests didn't catch it:**
Vitest `tests/cameras/maintenance.test.ts` uses direct `CamerasService` instantiation (bypasses AuthGuard + CLS + RLS). The tenancy-client is mocked or initialized with a known org. No test simulated a session with `activeOrganizationId: null`.

**Suggested fix (out of scope for Phase 15):**
Rewrite `superuser_bypass_*` policies to check a positive signal (e.g. `app.is_superuser = 'true'`) instead of empty/null ORG_ID. Or change AuthGuard to reject requests from users without an active org membership (401 or 403) before any Prisma query runs.

**Disposition:** record as gap for a follow-on security phase or `/gsd-secure-phase 15` to review. Phase 15 should not be blocked on this — the issue exists on pre-existing PATCH/DELETE endpoints and predates this phase.
