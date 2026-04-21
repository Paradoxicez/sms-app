---
phase: 15-ffmpeg-resilience-camera-maintenance
verified: 2026-04-19T09:07:00Z
status: human_needed
score: 5/5 must-haves verified (automated)
human_verification:
  - test: "SRS Docker restart → all cameras auto-reconnect within ~60s"
    expected: "docker compose restart srs → within 60s all online/connecting/reconnecting/degraded cameras (maintenanceMode=false) return to status=online after staggered 0-30s jitter; log shows 'SrsRestartDetector: SRS restart detected: pid X -> Y' followed by N × 'enqueued {cam} (delay=Nms)'"
    why_human: "Requires a running SRS container + live FFmpeg processes + real pid-delta observation. Cannot be fully simulated in unit tests (tests use fake queue mocks)."
  - test: "Server SIGTERM → clean FFmpeg shutdown within 10s grace"
    expected: "docker compose stop api → logs show 'Shutting down N FFmpeg processes (signal=SIGTERM)' → either 'All FFmpegs exited cleanly within grace' OR 'SIGKILLed stragglers: ...' → container exits in ≤10s (not the default Docker 30s SIGKILL timeout) → docker compose start api → 'Boot recovery: re-enqueuing N streams' → cameras reconnect within ~60s"
    why_human: "Requires Docker lifecycle observation and log inspection; grace-window behavior was unit-tested with vi.useFakeTimers but real SIGTERM handling from Docker cannot be unit-asserted."
  - test: "Webhook + notification fires on camera status change (with 30s debounce)"
    expected: "Force an online→offline transition (kill FFmpeg or block RTSP source) on a non-maintenance camera → wait 30s → in-app notification appears in the NotificationsGateway + webhook subscribers receive camera.offline POST body with cameraId/status/previousStatus/timestamp. During the 30s window, any additional status flaps should REPLACE (not duplicate) the pending dispatch."
    why_human: "Requires running BullMQ worker + live webhook subscriber + NotificationsGateway UI. The debounce-by-replacement mechanism is unit-tested but end-to-end delivery has not been observed in automated coverage."
  - test: "Composite 3-icon Status column visual alignment — recording dots line up across rows whether maintenance active or not"
    expected: "Cameras page shows Status column with CameraStatusDot + recording Circle + Wrench. Row in maintenance has amber wrench visible; row NOT in maintenance has wrench slot reserved (invisible) — recording dots remain horizontally aligned with the amber-wrench row's recording dot. Tooltip on hover shows Thai copy matching UI-SPEC §Composite Status Column Tooltips (ออนไลน์/ออฟไลน์/สัญญาณไม่เสถียร/กำลังเชื่อมต่อ/กำลังเชื่อมต่อใหม่/กำลังบันทึก/ไม่ได้บันทึก/อยู่ในโหมดซ่อมบำรุง — ไม่แจ้งเตือน)."
    why_human: "Visual alignment + tooltip rendering requires DOM layout + browser-level Tooltip portal behavior. Class-level tests assert 'invisible' is applied but not pixel-level row alignment."
  - test: "Enter maintenance on a running camera → stream stops, webhook NOT dispatched"
    expected: "Click row-actions → 'เข้าโหมดซ่อมบำรุง' → AlertDialog with destructive-variant button + bold 'หยุดสตรีม' body → confirm → stream stops within seconds; status transitions to offline; wrench icon turns amber; toast 'กล้อง \"...\" อยู่ในโหมดซ่อมบำรุงแล้ว' appears; NO webhook is delivered to subscribers (check webhook receiver logs for absence of camera.offline). AuditLog row with action=create, resource=camera, path=/api/cameras/{id}/maintenance is persisted."
    why_human: "Cross-system behavior (UI → API → DB → StatusGateway + audit + suppressed webhook) requires full-stack integration verification."
  - test: "Exit maintenance → status stays offline, no auto-restart"
    expected: "On a camera already in maintenance, click 'ออกจากโหมดซ่อมบำรุง' → dialog has default-variant (non-destructive) button + bold 'สตรีมจะยังไม่เริ่มใหม่โดยอัตโนมัติ' body → confirm → wrench becomes invisible; maintenanceEnteredAt/By remain populated in DB (historical); status stays offline; no FFmpeg process starts automatically. Operator must click Start Stream manually to resume."
    why_human: "Requires DB inspection + observing that no FFmpeg child process spawned after exit."
---

# Phase 15: FFmpeg Resilience & Camera Maintenance — Verification Report

**Phase Goal:** Camera streams recover automatically from failures and operators can put cameras in maintenance mode
**Verified:** 2026-04-19T09:07:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | When SRS container restarts, all previously-active FFmpeg streams reconnect automatically without manual intervention | ✓ VERIFIED (auto) | `SrsRestartDetector.detectAndHandle()` detects `self.pid` delta via `/api/v1/summaries`; `handleRestart()` re-enqueues all non-offline + non-maintenance cameras with `Math.floor(Math.random() * 30_000)` jitter onto `stream-ffmpeg` queue with jobId `camera:{id}`. `firstTick` guard prevents false-positive on first tick (Pitfall 4). Tests: srs-restart-detection (5) + srs-restart-recovery (4) all pass. |
| 2   | Health check loop detects and recovers dead FFmpeg processes within 60 seconds | ✓ VERIFIED (auto) | `CameraHealthService.onModuleInit()` schedules BullMQ repeatable job with `jobId: 'camera-health-tick'` + `repeat: { every: 60_000 }`. `runTick()` cross-checks `ffmpeg.isRunning(id)` AND `srsStreamIds.has(id)` via ONE `srsApi.getStreams()` call per tick (T-15-03 mitigation); SIGTERMs stale processes, transitions to `reconnecting`, enqueues single-camera recovery on `stream-ffmpeg`. `camera-health.test.ts` (8 tests) pass. |
| 3   | User receives in-app notification and webhook fires when a camera status changes (online/offline/degraded) | ✓ VERIFIED (auto, E2E human-needed) | `StatusService.transition()` enqueues delayed job on `camera-notify` queue (jobId=`camera:{id}:notify`, delay=30s). `NotifyDispatchProcessor` re-reads camera at dispatch time and calls `webhooksService.emitEvent(orgId, 'camera.{status}', {...})` + `notificationsService.createForCameraEvent(...)`. Debounce-by-replacement verified by debounce.test.ts (4). Maintenance suppression + stale-status drift verified by maintenance-suppression.test.ts (6). |
| 4   | FFmpeg processes shut down gracefully on server restart and re-enqueue on boot — no orphaned processes | ✓ VERIFIED (auto, E2E human-needed) | `ResilienceService` implements `OnApplicationShutdown` → parallel `ffmpeg.stopStream()` SIGTERM + 10s grace poll via `setTimeout(100ms)` loop + `ffmpeg.forceKill()` SIGKILL on stragglers. `BootRecoveryService` implements `OnApplicationBootstrap` → `prisma.camera.findMany({ status: in [online,connecting,reconnecting,degraded], maintenanceMode: false })` → enqueue with 0-30s jitter (T-15-04). `main.ts:20` wires `app.enableShutdownHooks()`. Tests: shutdown (4) + boot-recovery (6) pass. |
| 5   | User can toggle a camera into maintenance mode, which suppresses notifications/webhooks and shows a maintenance icon in the camera table alongside online/offline and recording status icons | ✓ VERIFIED (auto, UI visual human-needed) | API: POST/DELETE `/api/cameras/:id/maintenance` wired in `cameras.controller.ts`; service methods `enterMaintenance(cameraId, userId)` + `exitMaintenance(cameraId)` use tenancy client, flip flag BEFORE `streamsService.stopStream()` (order-asserted by test 4 of maintenance.test.ts), defensive `status: 'offline'` update, no auto-restart on exit (D-14), historical enteredAt/By preserved. UI: cameras-columns.tsx renders 3-icon composite (CameraStatusDot + Circle + Wrench) with size=72 + per-icon Thai tooltips + aria-label="Camera status" + invisible-slot layout preservation. tenant-cameras-page.tsx + tenant-projects-page.tsx dispatch AlertDialog with destructive/default variant + bold side-effect copy + double-submit guard. Maintenance gate in StatusService suppresses notify/webhook while preserving broadcast + DB update. Tests: maintenance.test.ts (9) + cameras-columns.test.tsx (9). |

**Score:** 5/5 truths verified (automated). E2E behaviors require human UAT (see human_verification in frontmatter).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `apps/api/src/prisma/schema.prisma` | Camera model + 3 maintenance columns + `@@index([maintenanceMode])` | ✓ VERIFIED | Lines 222-224 add the 3 columns; line 233 adds the index. DB push confirmed (prisma db push idempotent run in continuation). |
| `apps/api/src/status/status.service.ts` | Maintenance gate + 30s BullMQ debounce chokepoint | ✓ VERIFIED | 119 LOC. Line 28: `@InjectQueue('camera-notify')`. Line 60: statusGateway.broadcastStatus unconditional. Line 63: maintenance gate. Line 77: `camera:${cameraId}:notify`. Line 93: `delay: 30_000`. Inline `emitEvent`/`createForCameraEvent` removed. |
| `apps/api/src/status/status.module.ts` | Registers camera-notify queue + NotifyDispatchProcessor + PrismaModule | ✓ VERIFIED | 19 LOC. Imports WebhooksModule, PrismaModule, BullModule.registerQueue({name:'camera-notify'}). Providers include NotifyDispatchProcessor. @Global preserved. |
| `apps/api/src/status/processors/notify-dispatch.processor.ts` | Worker re-reads maintenanceMode + status drift before emit | ✓ VERIFIED | 74 LOC. `@Processor('camera-notify')` + WorkerHost. Guards: camera deleted → skip; `camera.maintenanceMode` → skip (Pitfall 3); `camera.status !== newStatus` → skip (stale). Calls webhooksService.emitEvent + notificationsService.createForCameraEvent. |
| `apps/api/src/resilience/resilience.module.ts` | Module registering camera-health + stream-ffmpeg queues + 5 resilience services | ✓ VERIFIED | 31 LOC. Imports PrismaModule, StreamsModule, SrsModule + 2 queues. Providers: CameraHealthService, CameraHealthProcessor, SrsRestartDetector, BootRecoveryService, ResilienceService. |
| `apps/api/src/resilience/camera-health.service.ts` | 60s repeatable tick with maintenance-aware filter | ✓ VERIFIED | 125 LOC. `onModuleInit` schedules `camera-health-tick` jobId with 60000ms repeat. `runTick()`: delegates to SrsRestartDetector, queries `maintenanceMode: false`, single `srsApi.getStreams()` call, cross-check ffmpeg + SRS, SIGTERM + transition + enqueue. |
| `apps/api/src/resilience/srs-restart-detector.ts` | pid-delta detection + 0-30s jitter bulk re-enqueue | ✓ VERIFIED | 100 LOC. Tracks `lastPid` + `firstTick` in-memory. Reads `summaries?.data?.self?.pid`. First tick initializes baseline. On delta → `handleRestart()` re-enqueues non-offline + non-maintenance cameras with `Math.floor(Math.random() * 30_000)` jitter. |
| `apps/api/src/resilience/boot-recovery.service.ts` | OnApplicationBootstrap re-enqueue with jitter | ✓ VERIFIED | 59 LOC. Implements OnApplicationBootstrap. Filters on `status in [...]` AND `maintenanceMode: false`. Enqueues with `camera:${id}` jobId + 0-30s jitter. |
| `apps/api/src/resilience/resilience.service.ts` | OnApplicationShutdown SIGTERM + 10s grace + SIGKILL | ✓ VERIFIED | 58 LOC. Implements OnApplicationShutdown. Parallel SIGTERM via stopStream. Poll isRunning every 100ms until 10_000ms deadline. SIGKILL stragglers via forceKill. No Prisma/BullMQ touched during shutdown (D-09). |
| `apps/api/src/main.ts` | `enableShutdownHooks()` wired before listen | ✓ VERIFIED | Line 20: `app.enableShutdownHooks();` placed after `NestFactory.create`, before `enableCors`. |
| `apps/api/src/cameras/cameras.controller.ts` | POST/DELETE /cameras/:id/maintenance | ✓ VERIFIED | Line 229: `@Post('cameras/:id/maintenance')` enterMaintenance handler. Line 249: `@Delete('cameras/:id/maintenance')` exitMaintenance handler. Class-level `@UseGuards(AuthGuard)` line 37 inherited. Swagger-documented. |
| `apps/api/src/cameras/cameras.service.ts` | enterMaintenance + exitMaintenance | ✓ VERIFIED | Lines 216-265: enterMaintenance (flag-flip-first → stopStream best-effort → defensive status=offline → return). Lines 274-295: exitMaintenance (flip false, preserve enteredAt/By, no auto-restart). Uses tenancy client for all reads/writes. |
| `apps/web/src/app/admin/cameras/components/cameras-columns.tsx` | Composite 3-icon Status cell + row-action maintenance entry | ✓ VERIFIED | Line 23: `maintenanceMode: boolean`. Line 41: `onMaintenanceToggle`. Line 44: `statusTooltip` record with 5 Thai labels. Line 65: `aria-label="Camera status"`. Lines 99-113: Wrench with conditional amber/invisible + aria-label maintenance only when active. Line 120: `size: 72`. Lines 208-212: row-action entry with conditional Thai label. |
| `apps/web/src/app/admin/cameras/components/cameras-data-table.tsx` | onMaintenanceToggle prop plumbed through | ✓ VERIFIED | Line 49 (prop type), line 65 (destructure), line 80 (createCamerasColumns arg), line 89 (useMemo dep). |
| `apps/web/src/components/pages/tenant-cameras-page.tsx` | AlertDialog + API call + toast | ✓ VERIFIED | Lines 44,149,153-179: maintenanceTarget + maintenanceLoading state, handler, confirmMaintenanceToggle (`method: entering ? 'POST' : 'DELETE'`, credentials: 'include'). Lines 264+: AlertDialog with conditional title/body/variant + Thai copy + double-submit guard. |
| `apps/api/tests/status/debounce.test.ts` | Debounce semantics | ✓ VERIFIED | 4 tests pass. |
| `apps/api/tests/status/maintenance-suppression.test.ts` | Maintenance gate + processor re-check | ✓ VERIFIED | 6 tests pass. |
| `apps/api/tests/cameras/maintenance.test.ts` | API contract + flag-order + org scoping | ✓ VERIFIED | 9 tests pass. |
| `apps/api/tests/resilience/{camera-health,srs-restart-detection,srs-restart-recovery,boot-recovery,shutdown}.test.ts` | Resilience primitives coverage | ✓ VERIFIED | 27 tests pass (camera-health 8, srs-restart-detection 5, srs-restart-recovery 4, boot-recovery 6, shutdown 4). |
| `apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx` | Composite cell + row-action | ✓ VERIFIED | 9 tests pass. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `status.service.ts` | `notify-dispatch.processor.ts` | BullMQ queue 'camera-notify' + jobId `camera:{id}:notify` + delay 30000 | ✓ WIRED | Line 77 (jobId template literal) + line 93 (delay: 30_000). Processor registered in StatusModule providers. |
| `notify-dispatch.processor.ts` | `webhooks.service.ts` | `emitEvent(orgId, 'camera.'+newStatus, ...)` | ✓ WIRED | Line 52 emitEvent call after maintenance + drift guards. |
| `notify-dispatch.processor.ts` | `notifications.service.ts` | `createForCameraEvent(...)` | ✓ WIRED | Line 65 createForCameraEvent call. |
| `camera-health.service.ts` | `srs-api.service.ts` | getSummaries() + getStreams() (via detector + tick) | ✓ WIRED | Line 71 tick-level getStreams; detector delegates getSummaries. Single call per tick (T-15-03). |
| `camera-health.service.ts` | `ffmpeg.service.ts` | isRunning + stopStream | ✓ WIRED | Lines 83, 94. |
| `srs-restart-detector.ts` | stream-ffmpeg queue | bulk re-enqueue with 0-30s jitter + camera:{id} jobId | ✓ WIRED | Line 81 `Math.floor(Math.random() * 30_000)` + line 86 deterministic jobId. |
| `boot-recovery.service.ts` | stream-ffmpeg queue | OnApplicationBootstrap enqueue with jitter | ✓ WIRED | Line 41 jitter + line 46 jobId. |
| `resilience.service.ts` | `ffmpeg.service.ts` | getRunningCameraIds + stopStream + forceKill | ✓ WIRED | Lines 23, 35, 52. |
| `streams.service.ts` | BullMQ stream-ffmpeg | Unified `camera:{cameraId}` jobId | ✓ WIRED | Lines 58, 64, 95 (3 matches). No `stream-${cameraId}` remnants (grep confirms 0 matches across apps/api/src). |
| `cameras.controller.ts` | `cameras.service.ts` | enterMaintenance / exitMaintenance calls | ✓ WIRED | Lines 246, 258. |
| `cameras.service.ts` | `streams.service.ts` | `streamsService.stopStream(cameraId)` in enterMaintenance | ✓ WIRED | Line 246. |
| `cameras-columns.tsx` | `camera-status-badge.tsx` | CameraStatusDot reused as first icon | ✓ WIRED | Line 67 JSX usage. |
| `cameras-columns.tsx` | lucide-react | Wrench import + Circle reuse | ✓ WIRED | Line 5 adds Wrench to existing lucide import. |
| `tenant-cameras-page.tsx` | POST/DELETE /api/cameras/:id/maintenance | fetch with credentials:'include' + refetch on success | ✓ WIRED | Lines 158-162 fetch + line 169 fetchCameras() refresh. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `cameras-columns.tsx` Status cell | `camera.maintenanceMode`, `camera.status`, `camera.isRecording` | Row props via TanStack Table `row.original` from `cameras` state in tenant-cameras-page | ✓ Yes — fetched from GET /api/cameras via apiFetch (existing path from Phase 14) | ✓ FLOWING |
| `tenant-cameras-page.tsx` maintenance dialog | `maintenanceTarget.maintenanceMode`, `.id`, `.name` | handleMaintenanceToggle sets from CameraRow passed by the DataTable row action | ✓ Yes — CameraRow.maintenanceMode is a required non-optional boolean (Task 1 change); server returns it from Prisma camera.findMany | ✓ FLOWING |
| `status.service.ts` transition | `camera.maintenanceMode`, `camera.status`, `camera.name` | `prisma.camera.findUnique({ where: { id: cameraId } })` at top of transition | ✓ Yes — tenancy client live query; schema has the column | ✓ FLOWING |
| `notify-dispatch.processor.ts` process | `camera.maintenanceMode`, `camera.status` | `prisma.camera.findUnique({ where: { id: cameraId } })` inside processor (re-read at dispatch time) | ✓ Yes — raw PrismaService; job.data carries newStatus/previousStatus from enqueue side | ✓ FLOWING |
| `camera-health.service.ts` runTick | `cameras` array | `prisma.camera.findMany({ where: { status: in [...], maintenanceMode: false }, include: { streamProfile } })` | ✓ Yes — live query; streamProfile joined for downstream buildStreamJobData | ✓ FLOWING |
| `srs-restart-detector.ts` handleRestart | `cameras` array | `prisma.camera.findMany({ where: { NOT: { status: 'offline' }, maintenanceMode: false }, include: { streamProfile } })` | ✓ Yes | ✓ FLOWING |
| `boot-recovery.service.ts` onApplicationBootstrap | `desiredRunning` array | `prisma.camera.findMany(...)` with status.in + maintenanceMode:false filter | ✓ Yes | ✓ FLOWING |
| `resilience.service.ts` onApplicationShutdown | `running` ids | `ffmpeg.getRunningCameraIds()` — Array.from(runningProcesses.keys()) in FfmpegService | ✓ Yes — live in-memory map of fluent-ffmpeg child processes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 15 backend tests pass | `pnpm exec vitest run tests/status/debounce.test.ts tests/status/maintenance-suppression.test.ts tests/cameras/maintenance.test.ts tests/resilience/` | 46/46 tests passed across 8 test files in ~2.6s | ✓ PASS |
| Phase 15 UI test passes | `pnpm --filter @sms-platform/web exec vitest run src/app/admin/cameras/components/cameras-columns.test.tsx` | 9/9 tests passed in ~1.5s | ✓ PASS |
| DB schema has 3 maintenance columns | `prisma db execute "SELECT column_name ... information_schema.columns WHERE table_name='Camera' AND column_name IN (...)"` | Script executed successfully (idempotent re-run showed DB in sync earlier) | ✓ PASS |
| No `stream-${cameraId}` remnants anywhere | `grep -rn 'stream-\${cameraId}' apps/api/src` | 0 matches (4 current matches all use `camera:${cameraId}`) | ✓ PASS |
| `app.enableShutdownHooks()` wired before listen | `grep -n enableShutdownHooks apps/api/src/main.ts` | Line 20, immediately before enableCors and listen | ✓ PASS |
| ResilienceModule registered in AppModule | `grep -n ResilienceModule apps/api/src/app.module.ts` | Line 27 import + line 59 imports array | ✓ PASS |
| StreamsModule imported into CamerasModule (no circular) | `grep imports apps/api/src/cameras/cameras.module.ts` | `imports: [StreamsModule]` direct import | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| RESIL-01 | 15-02 | System auto-reconnects all FFmpeg streams when SRS container restarts | ✓ SATISFIED | SrsRestartDetector pid-delta + bulk re-enqueue with jitter. srs-restart-detection + srs-restart-recovery tests pass. |
| RESIL-02 | 15-02 | Health check loop ตรวจสอบ FFmpeg process + SRS streams ทุก 60 วินาที | ✓ SATISFIED | CameraHealthService repeatable tick 60s, cross-checks ffmpeg+SRS. camera-health.test.ts passes. |
| RESIL-03 | 15-01, 15-02 | User ได้รับ notification + webhook เมื่อ camera status เปลี่ยน | ✓ SATISFIED | StatusService chokepoint + NotifyDispatchProcessor with maintenance + drift guards; debounce-by-replacement 30s. Producer paths come from CameraHealthService, srs-callback, streams.service. debounce + maintenance-suppression tests (10) pass. |
| RESIL-04 | 15-02 | FFmpeg processes graceful shutdown + re-enqueue on boot | ✓ SATISFIED | ResilienceService OnApplicationShutdown + BootRecoveryService OnApplicationBootstrap + enableShutdownHooks in main.ts. shutdown + boot-recovery tests (10) pass. |
| CAM-01 | 15-03 | User สามารถสลับ camera เป็น maintenance mode ได้ (suppress notifications/webhooks) | ✓ SATISFIED | POST/DELETE /api/cameras/:id/maintenance + enterMaintenance/exitMaintenance service methods + StatusService maintenance gate suppresses notify/webhook while preserving broadcast+DB update. maintenance.test.ts (9 cases) pass. |
| CAM-02 | 15-01, 15-03, 15-04 | Camera table แสดง 3 status icons: online/offline, recording, maintenance | ✓ SATISFIED | cameras-columns.tsx renders CameraStatusDot + Circle + Wrench composite. cameras-columns.test.tsx (9) pass. |
| CAM-03 | 15-04 | Camera quick actions menu มีตัวเลือก Maintenance | ✓ SATISFIED | Row-actions dropdown has conditional Thai label entry + AlertDialog with destructive/default variant branching + API call + toast feedback in tenant-cameras-page.tsx + tenant-projects-page.tsx. |

All 7 requirement IDs accounted for and satisfied. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TODO/FIXME/PLACEHOLDER/HACK/XXX matches in any modified Phase 15 artifact | ℹ️ Info | Clean implementation — no stub markers. |
| — | — | No `return null`/`return {}`/`return []` stubs in production paths | ℹ️ Info | All dynamic data paths populated via live Prisma queries or in-memory state. |

**Notable deviations (tracked, not blockers):**

- **Plan 15-03 Task 1 deviation:** Plan specified `AuthGuard` should call `cls.set('USER_ID', session.user.id)`. Executor shipped `req.user.id` sourcing in the controller instead (matching existing UsersController pattern). Plan 15-03 explicitly anticipated this adjustment ("executor must confirm and adjust the string literal") and SUMMARY 15-03 documented it. AuthGuard at `apps/api/src/auth/guards/auth.guard.ts` does NOT set USER_ID in CLS — only ORG_ID. Net behavior is equivalent: userId sourced from server-validated session, never from request body. NOT a gap.
- **SrsRestartDetector in-memory pid baseline:** Accepted limitation per D-07; boot-recovery is the safety net if API restarts during an SRS restart (both pids reset).
- **Card-grid does NOT expose maintenance toggle:** Documented as intentional in 15-04 SUMMARY per UI-SPEC §Row Action Dropdown Entry table-only rule.

### Human Verification Required

See `human_verification` section in frontmatter. Six end-to-end scenarios require a running stack + visual or cross-system observation:

1. SRS Docker restart auto-reconnect (with staggered jitter)
2. Server SIGTERM clean shutdown + boot re-enqueue
3. Webhook + notification end-to-end after 30s debounce
4. Composite Status column visual alignment + tooltip Thai copy
5. Enter-maintenance UX end-to-end (stream stops, webhook suppressed, audit persisted)
6. Exit-maintenance UX end-to-end (status stays offline, no auto-restart)

### Gaps Summary

No gaps. All 5 roadmap Success Criteria have supporting code + tests verifiably present and wired in the codebase. All 7 requirement IDs are mapped to plans and implemented. Total test coverage: 46 backend tests + 9 UI tests = **55 new tests** added across 9 files, all green.

Status is `human_needed` (not `passed`) because the observable truths — "streams reconnect automatically", "webhook fires on status change", "stream stops on maintenance enter", etc. — are end-to-end cross-system behaviors that cannot be fully proven by unit tests alone. The unit tests prove the individual primitives are correct; human UAT proves the orchestrated flow.

---

_Verified: 2026-04-19T09:07:00Z_
_Verifier: Claude (gsd-verifier)_
