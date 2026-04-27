---
phase: 15
plan: 02
status: complete
wave: 2
subsystem: api
tags: [nestjs, bullmq, prisma, ffmpeg, srs, resilience, vitest, shutdown-hooks, boot-recovery]

requires:
  - phase: 15
    plan: 01
    provides: "Camera.maintenanceMode column + camera-notify queue + NotifyDispatchProcessor + StatusService maintenance gate + 30s debounce-by-replacement"
provides:
  - "Unified BullMQ jobId `camera:{cameraId}` across StreamsService, BootRecoveryService, CameraHealthService, and SrsRestartDetector — deterministic dedup (D-11)"
  - "FfmpegService.getRunningCameraIds() + FfmpegService.forceKill(id) — used by ResilienceService shutdown hook"
  - "ResilienceModule registered in AppModule after StreamsModule + ClusterModule + RecordingsModule"
  - "CameraHealthService OnModuleInit scheduling repeatable tick every 60s (jobId='camera-health-tick') + CameraHealthProcessor WorkerHost binding"
  - "SrsRestartDetector pid-delta detection via /api/v1/summaries + firstTick baseline (Pitfall 4) + bulk re-enqueue with 0-30s jitter (T-15-04)"
  - "BootRecoveryService OnApplicationBootstrap — re-enqueues desired-running, non-maintenance cameras with 0-30s jitter"
  - "ResilienceService OnApplicationShutdown — parallel SIGTERM, 10s grace poll, SIGKILL stragglers (T-15-05 bounded orphan window)"
  - "app.enableShutdownHooks() wired in main.ts before enableCors() — required for OnApplicationShutdown to fire on Docker SIGTERM"
  - "27 vitest cases across tests/resilience/{camera-health, srs-restart-detection, srs-restart-recovery, boot-recovery, shutdown}.test.ts"
affects:
  - "15-03 maintenance API — toggling maintenanceMode is respected by the health tick + SrsRestartDetector filters added in this plan"
  - "15-04 camera table UI — relies on CameraHealthService health-driven transitions to refresh status indicators"

tech-stack:
  added:
    - "@nestjs/common OnApplicationBootstrap + OnApplicationShutdown lifecycle hooks"
    - "@nestjs/bullmq camera-health queue registration + repeatable job (every 60s) + CameraHealthProcessor WorkerHost"
  patterns:
    - "Unified BullMQ jobId `camera:{cameraId}` across 4 enqueue paths (user-initiated, boot recovery, SRS restart, health recovery) — BullMQ dedup handles races"
    - "Shared buildStreamJobData(camera) helper ensures identical payload shape across all enqueue paths"
    - "pid-delta detection via /api/v1/summaries with in-memory baseline + firstTick guard (no Redis for v1 — boot recovery is the safety net)"
    - "0-30s random jitter on every bulk re-enqueue (SRS restart + boot recovery) to prevent thundering herd against SRS"
    - "Graceful shutdown: parallel SIGTERM + poll isRunning every 100ms until 10s grace expires, then forceKill stragglers"
    - "Single SRS API call per 60s tick (getStreams) regardless of camera count — mitigates T-15-03"

files_modified:
  - apps/api/src/streams/ffmpeg/ffmpeg.service.ts
  - apps/api/src/streams/streams.service.ts
  - apps/api/src/app.module.ts
  - apps/api/src/main.ts
  - apps/api/tests/streams/stream-lifecycle.test.ts
files_created:
  - apps/api/src/resilience/resilience.module.ts
  - apps/api/src/resilience/job-data.helper.ts
  - apps/api/src/resilience/camera-health.service.ts
  - apps/api/src/resilience/camera-health.processor.ts
  - apps/api/src/resilience/srs-restart-detector.ts
  - apps/api/src/resilience/boot-recovery.service.ts
  - apps/api/src/resilience/resilience.service.ts
  - apps/api/tests/resilience/camera-health.test.ts
  - apps/api/tests/resilience/srs-restart-detection.test.ts
  - apps/api/tests/resilience/srs-restart-recovery.test.ts
  - apps/api/tests/resilience/boot-recovery.test.ts
  - apps/api/tests/resilience/shutdown.test.ts

completed_at: 2026-04-19T08:50:00Z

key-files:
  created:
    - apps/api/src/resilience/resilience.module.ts
    - apps/api/src/resilience/job-data.helper.ts
    - apps/api/src/resilience/camera-health.service.ts
    - apps/api/src/resilience/camera-health.processor.ts
    - apps/api/src/resilience/srs-restart-detector.ts
    - apps/api/src/resilience/boot-recovery.service.ts
    - apps/api/src/resilience/resilience.service.ts
    - apps/api/tests/resilience/camera-health.test.ts
    - apps/api/tests/resilience/srs-restart-detection.test.ts
    - apps/api/tests/resilience/srs-restart-recovery.test.ts
    - apps/api/tests/resilience/boot-recovery.test.ts
    - apps/api/tests/resilience/shutdown.test.ts
  modified:
    - apps/api/src/streams/ffmpeg/ffmpeg.service.ts
    - apps/api/src/streams/streams.service.ts
    - apps/api/src/app.module.ts
    - apps/api/src/main.ts

key-decisions:
  - "Inline the 60_000 ms constant at the add() call site instead of referencing HEALTH_TICK_INTERVAL_MS — plan's acceptance criterion required the literal form `repeat: { every: 60_000 }` for grep-based verification"
  - "SrsRestartDetector keeps pid baseline in-memory only (no Redis) — accepted as v1 limitation per D-07; BootRecoveryService provides the safety net because it runs unconditionally on every boot"
  - "stream-lifecycle.test.ts was already broken pre-15-02 (expected `stream:cam-1` vs actual `stream-cam-1`) — Task 1 fixed it as collateral while updating the jobId to `camera:{cameraId}`. Not a deviation — a pre-existing stale test that would have been broken by the jobId unification regardless"
  - "StatusModule is @Global so ResilienceModule does not need to import it explicitly — StatusService + Queue('camera-notify') reach the DI container naturally"
  - "ResilienceService does NOT touch Prisma / BullMQ / StatusService during shutdown — keeps the status at last-known value so BootRecoveryService can re-enqueue on next startup (D-09)"
  - "CameraHealthService.runTick catches srsApi.getStreams errors and treats the empty stream set as 'SRS unreachable' — cameras with ffmpeg running will be flagged dead and transitioned to reconnecting, forcing recovery (matches D-05 intent)"

patterns-established:
  - "Lifecycle-hook services (OnApplicationBootstrap / OnApplicationShutdown) use raw PrismaService — worker contexts have no request-scoped tenancy (D-08); cross-org by design"
  - "Shared job-data helper pattern: when multiple enqueue paths need identical payload, extract to helper to prevent drift"
  - "Fake-timer test pattern for shutdown grace: vi.useFakeTimers() + await vi.advanceTimersByTimeAsync(10_500) proves SIGKILL path without real 10s wait"

requirements-completed:
  - RESIL-01
  - RESIL-02
  - RESIL-04

duration: ~25 min
completed: 2026-04-19
---

# Phase 15 Plan 02: FFmpeg Resilience — Health Check + SRS Restart + Graceful Shutdown + Boot Recovery

**Landed every server-side resilience primitive for Phase 15: the `camera-health` repeatable tick (RESIL-02), SRS-restart detection + bulk re-enqueue with jitter (RESIL-01), graceful shutdown + boot re-enqueue (RESIL-04), and the jobId unification that makes four BullMQ enqueue paths dedup correctly. Combined with 15-01's maintenance gate + 30s debounce, the phase now delivers RESIL-03 end-to-end.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-19T08:50:00Z
- **Tasks:** 6 (all complete)
- **Files created:** 12 (7 source, 5 test)
- **Files modified:** 5

## Accomplishments

- **Unified BullMQ jobId** `camera:{cameraId}` across StreamsService (startStream + stopStream), BootRecoveryService, CameraHealthService (health recovery), and SrsRestartDetector (bulk re-enqueue). Four enqueue paths now dedup on the same key — no more duplicate streams on race.
- **Extended FfmpegService** with `getRunningCameraIds(): string[]` and `forceKill(cameraId: string)` — preserved the existing intentional-stop contract so BullMQ retry is correctly suppressed.
- **ResilienceModule** registered in AppModule; imports PrismaModule + StreamsModule + SrsModule + BullModule.registerQueue(camera-health, stream-ffmpeg).
- **Shared `buildStreamJobData(camera)`** helper — produces identical StreamJobData payload across all four enqueue paths.
- **`app.enableShutdownHooks()`** wired in main.ts — required for OnApplicationShutdown to fire on Docker SIGTERM.
- **CameraHealthService** (OnModuleInit) schedules repeatable tick every 60s with deterministic jobId `camera-health-tick` (mitigates Pitfall 1 duplicate repeaters). Each tick: delegates to SrsRestartDetector → pulls non-offline, non-maintenance cameras → ONE srsApi.getStreams() call (T-15-03) → cross-checks ffmpeg.isRunning + SRS stream membership → SIGTERMs dead processes → transitions to reconnecting → enqueues single-camera recovery.
- **SrsRestartDetector** tracks `self.pid` delta from /api/v1/summaries. First tick initializes baseline without firing recovery (Pitfall 4). On delta, fetches non-offline + non-maintenance cameras and re-enqueues with `Math.floor(Math.random() * 30_000)` jitter (T-15-04).
- **CameraHealthProcessor** (WorkerHost on 'camera-health') delegates to CameraHealthService.runTick().
- **BootRecoveryService** (OnApplicationBootstrap) re-enqueues desired-running cameras (status in [online, connecting, reconnecting, degraded] AND maintenanceMode=false) with 0-30s jitter. Runs unconditionally on every boot (D-10).
- **ResilienceService** (OnApplicationShutdown) gathers running camera ids, issues parallel SIGTERMs, polls isRunning every 100ms until either all exit cleanly or the 10s grace window expires, then SIGKILLs stragglers via FfmpegService.forceKill (T-15-05 bounded orphan window).
- **27 vitest cases** across 5 new test files — all green.

## Task Commits

1. **Task 1** (`ce8ea19`): `feat(15-02): unify stream-ffmpeg jobId and add FfmpegService helpers`
2. **Task 2** (`758770f`): `feat(15-02): add ResilienceModule skeleton + buildStreamJobData helper + enableShutdownHooks`
3. **Task 3** (`06fe803`): `feat(15-02): add CameraHealthService + SrsRestartDetector + CameraHealthProcessor`
4. **Task 4** (`54eb6c6`): `feat(15-02): add BootRecoveryService for boot-time stream re-enqueue`
5. **Task 5** (`b5bfbaa`): `feat(15-02): add ResilienceService for graceful FFmpeg shutdown`
6. **Task 6**: regression gate + this SUMMARY (metadata commit at end of plan)

## jobId Migration: `stream-{id}` → `camera:{id}`

The primary breaking change. Four enqueue paths now collide deterministically on the same jobId:

| Path | Caller | Behavior |
|------|--------|----------|
| User-initiated | StreamsService.startStream | Explicit start from UI/API |
| Boot recovery | BootRecoveryService.onApplicationBootstrap | Every API boot |
| SRS restart recovery | SrsRestartDetector.handleRestart | pid delta detected |
| Health recovery | CameraHealthService.runTick | Dead stream detected |

**Runtime migration concern:** Any pending jobs with the old `stream-{id}` jobId in Redis at deploy time will be orphaned (they will still run if queued, but won't dedup against new enqueues). Because `removeOnComplete: true` is set on both old and new paths, old jobs naturally drain within the 20-attempt retry window. The `FfmpegService.startStream` guard at `ffmpeg.service.ts:19-22` prevents double-spawn if a brief race occurs during the transition window.

**Grep audit:** `grep -rn 'stream-\${cameraId}' apps/api` returns **0 matches** after the plan. Migration complete.

## SrsRestartDetector pid baseline — v1 Limitation

In-memory only. No Redis-backed baseline.

**Trade-off:** If the API process itself restarts (e.g., deploy, crash), `lastPid` resets to null and the first tick after reboot initializes baseline from whatever pid SRS currently reports. If SRS had already restarted during the API downtime, the restart is missed.

**Mitigation:** `BootRecoveryService.onApplicationBootstrap` always runs on every API boot and re-enqueues all desired-running + non-maintenance cameras. So any streams that would have needed recovery via SRS-restart detection are caught by boot recovery instead.

**Future enhancement:** Persist baseline to Redis under key `srs:pid:baseline` with TTL matching deploy cadence. Flagged in `<threat_model>` T-15-09 as `accept` for v1.

## Queue + Dispatch Contract Summary

| Queue | jobId pattern | Repeats? | Delay | Purpose |
|-------|---------------|----------|-------|---------|
| `camera-health` | `camera-health-tick` (constant) | every 60s | 0 | Health tick |
| `stream-ffmpeg` | `camera:{cameraId}` (deterministic) | no | 0 (user/health) or random 0-30000ms (boot/restart) | Start FFmpeg process |
| `camera-notify` (from 15-01) | `camera:{cameraId}:notify` | no | 30s | Debounce webhook + notification dispatch |

## Manual UAT to Run (per 15-VALIDATION.md Manual-Only Verifications)

1. **SRS Docker restart visible jitter:**
   - Ensure 3+ cameras are online (status=online, maintenanceMode=false)
   - Run: `docker compose restart srs`
   - Within 60s: all cameras should reconnect, each at a different offset within 30s (jitter should be visible in logs)
   - Expected log lines: `SrsRestartDetector: SRS restart detected: pid X -> Y` followed by N × `SrsRestartDetector: enqueued {cam} (delay=Nms)`
   - Acceptance: All cameras return to `online` within ~60-90s without operator action

2. **Server SIGTERM clean FFmpeg shutdown + boot re-enqueue:**
   - Ensure 2+ cameras are online
   - Run: `docker compose stop api`
   - Expected log on shutdown: `Shutting down N FFmpeg processes (signal=SIGTERM)` then either `All FFmpegs exited cleanly within grace` or `SIGKILLed stragglers: ...`
   - Cameras should exit within 10s max (not the default Docker 30s kill timeout)
   - Run: `docker compose start api`
   - Expected log on boot: `Boot recovery: re-enqueuing N streams` then N × `Boot recovery enqueued {cam} (delay=Nms)`
   - Acceptance: All previously-running cameras return to `online` within ~60s of boot

## Verification Map

| Task | Requirement | Threat Ref | Automated Command | Status |
|------|-------------|------------|-------------------|--------|
| 15-02-T1 | RESIL-01/02/03/04 (foundation) | — | `pnpm --filter @sms-platform/api build && pnpm --filter api test tests/streams/stream-lifecycle.test.ts -- --run` | PASS (4/4 stream-lifecycle) |
| 15-02-T2 | RESIL-04 | T-15-05 | `pnpm --filter @sms-platform/api build` | PASS |
| 15-02-T3 | RESIL-01, RESIL-02 | T-15-03, T-15-04 | `pnpm --filter api test tests/resilience/camera-health.test.ts tests/resilience/srs-restart-detection.test.ts tests/resilience/srs-restart-recovery.test.ts -- --run` | PASS (17/17) |
| 15-02-T4 | RESIL-04 | T-15-04 | `pnpm --filter api test tests/resilience/boot-recovery.test.ts -- --run` | PASS (6/6) |
| 15-02-T5 | RESIL-04 | T-15-05 | `pnpm --filter api test tests/resilience/shutdown.test.ts -- --run` | PASS (4/4) |
| 15-02-T6 | All | All | `pnpm --filter api build && pnpm --filter api test tests/resilience/ -- --run` | PASS (27/27 resilience; 23 unrelated pre-existing failures logged to deferred-items.md) |

## Security Mitigations Delivered

- **T-15-03 (DoS against SRS):** mitigated. CameraHealthService makes ONE `srsApi.getStreams()` call per 60s tick regardless of camera count. Tick concurrency is 1 (BullMQ default for single-worker queue). Asserted by test "does not call SRS getStreams per-camera — single call per tick".
- **T-15-04 (thundering herd against SRS):** mitigated. Every bulk re-enqueue (SrsRestartDetector + BootRecoveryService) uses `Math.floor(Math.random() * 30_000)` delay. Asserted by tests "delay in [0, 30000)".
- **T-15-05 (orphaned FFmpeg / repudiation):** mitigated. ResilienceService implements OnApplicationShutdown → SIGTERM-all → 10s grace poll → SIGKILL stragglers using FfmpegService.forceKill. Tests use fake timers to prove the SIGKILL path fires after 10s.
- **Pitfall 1 (duplicate repeatable jobs on restart):** mitigated. CameraHealthService.onModuleInit uses deterministic `jobId: 'camera-health-tick'` — BullMQ replaces rather than duplicates on restart.
- **Pitfall 4 (false-positive SRS restart on first boot):** mitigated. SrsRestartDetector.firstTick sets baseline without firing recovery on the first tick after API boot. Three-state: firstTick (init) → lastPid set (compare) → delta triggers recovery.

## Known Stubs

None.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing stream-lifecycle.test.ts mock shape**
- **Found during:** Task 1 (while updating jobId literal)
- **Issue:** `mockQueue.getJob` returned `{ id, remove: vi.fn() }` where `remove` returned `undefined` (not a Promise), causing `TypeError: Cannot read properties of undefined (reading 'catch')` in StreamsService. Pre-existing; had nothing to do with the jobId rename but lived in the same test the plan required me to edit.
- **Fix:** Changed to `remove: vi.fn().mockResolvedValue(undefined)` to match the real BullMQ `job.remove()` Promise contract.
- **Files modified:** `apps/api/tests/streams/stream-lifecycle.test.ts`
- **Commit:** `ce8ea19`

**2. [Plan Adjustment] Dropped HEALTH_TICK_INTERVAL_MS constant in favor of inline 60_000**
- **Reason:** Plan's acceptance criterion `grep -c "repeat: { every: 60_000 }" apps/api/src/resilience/camera-health.service.ts returns 1` required the literal form for grep verification. Refactor-time constant use would have broken the check.
- **Decision:** Inlined the literal at the call site only; the log line still references `60000ms` for readability. Future refactor welcome if code style standards preferred a constant.

No other deviations — plan executed exactly as written.

## Self-Check: PASSED

- [x] Task 1 commit `ce8ea19` exists
- [x] Task 2 commit `758770f` exists
- [x] Task 3 commit `06fe803` exists
- [x] Task 4 commit `54eb6c6` exists
- [x] Task 5 commit `b5bfbaa` exists
- [x] `apps/api/src/resilience/resilience.module.ts` — exists, registers camera-health + stream-ffmpeg queues, providers 5 services
- [x] `apps/api/src/resilience/job-data.helper.ts` — exports buildStreamJobData
- [x] `apps/api/src/resilience/camera-health.service.ts` — implements OnModuleInit, `repeat: { every: 60_000 }`, jobId `camera-health-tick`, maintenanceMode filter
- [x] `apps/api/src/resilience/camera-health.processor.ts` — `@Processor('camera-health')` WorkerHost
- [x] `apps/api/src/resilience/srs-restart-detector.ts` — firstTick baseline, `self?.pid` read, `Math.floor(Math.random() * 30_000)` jitter, maintenanceMode filter
- [x] `apps/api/src/resilience/boot-recovery.service.ts` — implements OnApplicationBootstrap, maintenanceMode filter, deterministic jobId + jitter
- [x] `apps/api/src/resilience/resilience.service.ts` — implements OnApplicationShutdown, 10s grace, forceKill stragglers
- [x] `apps/api/src/streams/ffmpeg/ffmpeg.service.ts` — getRunningCameraIds + forceKill added
- [x] `apps/api/src/streams/streams.service.ts` — all 3 jobId occurrences use `camera:${cameraId}`
- [x] `apps/api/src/app.module.ts` — ResilienceModule imported
- [x] `apps/api/src/main.ts` — `app.enableShutdownHooks()` wired before enableCors
- [x] `grep -rn 'stream-\${cameraId}' apps/api` returns 0 matches
- [x] 27 new tests added across 5 new test files, all passing
- [x] `pnpm --filter @sms-platform/api build` exits 0

---
*Phase: 15-ffmpeg-resilience-camera-maintenance*
*Plan: 02*
*Completed: 2026-04-19*
