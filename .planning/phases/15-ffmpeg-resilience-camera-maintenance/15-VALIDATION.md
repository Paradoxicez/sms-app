---
phase: 15
slug: ffmpeg-resilience-camera-maintenance
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-18
updated: 2026-04-18
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (apps/api); vitest 3.x + @testing-library/react 16.x + jsdom (apps/web) — both confirmed 2026-04-18 |
| **Config file** | apps/api/vitest.config.ts; apps/web/vitest.config.ts (`environment: "jsdom"`, `setupFiles: ["./src/test-utils/setup.ts"]`, `include: ["src/**/*.test.{ts,tsx}"]`) |
| **Test layout** | apps/api: flat `apps/api/tests/{domain}/*.test.ts` (NOT co-located with src) — confirmed via `apps/api/tests/cluster/*.test.ts`, `apps/api/tests/status/*.test.ts`, etc. apps/web: co-located `src/**/*.test.{ts,tsx}`. |
| **Quick run command** | `pnpm --filter @sms-platform/api test -- --run` (or `@sms-platform/web` for UI tasks) |
| **Full suite command** | `pnpm -r test -- --run` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @sms-platform/api test -- --run` (or web filter if UI task)
- **After every plan wave:** Run `pnpm -r test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

> Rolled up from each of the 4 plans' `<verification>` sections. Each task has an automated command or a Wave 0 test dependency.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-T1 | 15-01 | 1 | Schema (D-12) | — | Prisma Camera model gains maintenance columns + index without touching existing fields | schema lint | `pnpm --filter @sms-platform/api exec prisma validate` | ✅ (in-tree) | ⬜ pending |
| 15-01-T2 | 15-01 | 1 | Schema push (D-12) | — | Non-destructive DB push + Prisma Client regen | build / db | `pnpm --filter @sms-platform/api exec prisma db push --skip-generate && pnpm --filter @sms-platform/api exec prisma generate` | ✅ (in-tree) | ⬜ pending |
| 15-01-T3 | 15-01 | 1 | RESIL-03 | T-15-02 | NotifyDispatchProcessor re-checks maintenance at dispatch time (Pitfall 3 guard) | unit | `pnpm --filter @sms-platform/api build && pnpm --filter @sms-platform/api test tests/status/ -- --run` | ❌ W0 (new tests) | ⬜ pending |
| 15-01-T4 | 15-01 | 1 | RESIL-03, CAM-02 | T-15-02 | StatusService.transition gates outbound dispatch on maintenanceMode; debounce via BullMQ jobId replacement | unit | `pnpm --filter @sms-platform/api build && pnpm --filter @sms-platform/api test tests/status/ -- --run` | ❌ W0 (new tests) | ⬜ pending |
| 15-01-T5 | 15-01 | 1 | RESIL-03, CAM-02 | T-15-02 | Vitest coverage for debounce semantics + maintenance suppression (service + processor) | unit | `pnpm --filter @sms-platform/api test tests/status/debounce.test.ts tests/status/maintenance-suppression.test.ts -- --run` | ❌ W0 (files created in task) | ⬜ pending |
| 15-02-T1 | 15-02 | 2 | RESIL-01/02/03/04 (foundation) | — | jobId unification `camera:{cameraId}`; FfmpegService exposes getRunningCameraIds + forceKill | build + regression | `pnpm --filter @sms-platform/api build && pnpm --filter @sms-platform/api test tests/streams/ -- --run` | ✅ (regression only) | ⬜ pending |
| 15-02-T2 | 15-02 | 2 | RESIL-04 | T-15-05 | ResilienceModule skeleton + main.ts enableShutdownHooks before app.listen | build | `pnpm --filter @sms-platform/api build` | ✅ (in-tree) | ⬜ pending |
| 15-02-T3 | 15-02 | 2 | RESIL-01, RESIL-02 | T-15-03, T-15-04 | CameraHealthService 60s repeatable tick + SrsRestartDetector self.pid delta with first-tick baseline + 0-30s jitter bulk re-enqueue | unit | `pnpm --filter @sms-platform/api test tests/resilience/camera-health.test.ts tests/resilience/srs-restart-detection.test.ts tests/resilience/srs-restart-recovery.test.ts -- --run` | ❌ W0 (files created in task) | ⬜ pending |
| 15-02-T4 | 15-02 | 2 | RESIL-04 | T-15-04 | BootRecoveryService onApplicationBootstrap re-enqueues desired-running cameras with 0-30s jitter; maintenanceMode=false filter | unit | `pnpm --filter @sms-platform/api test tests/resilience/boot-recovery.test.ts -- --run` | ❌ W0 (file created in task) | ⬜ pending |
| 15-02-T5 | 15-02 | 2 | RESIL-04 | T-15-05 | ResilienceService onApplicationShutdown SIGTERM-all + 10s grace + SIGKILL fallback | unit (fake timers) | `pnpm --filter @sms-platform/api test tests/resilience/shutdown.test.ts -- --run` | ❌ W0 (file created in task) | ⬜ pending |
| 15-02-T6 | 15-02 | 2 | All RESIL | All | Regression gate — no `stream-${cameraId}` literals remain, build green, full suite green | gate | `pnpm --filter @sms-platform/api test -- --run && pnpm --filter @sms-platform/api build` | ✅ | ⬜ pending |
| 15-03-T1 | 15-03 | 2 | CAM-01, CAM-02 | T-15-01 | AuthGuard publishes USER_ID into CLS after authentication (line-order preserves auth-first contract) | build | `pnpm --filter @sms-platform/api build` | ✅ (in-tree) | ⬜ pending |
| 15-03-T2 | 15-03 | 2 | CAM-01, CAM-02 | T-15-01, T-15-02 | CamerasService enter/exit maintenance via tenancy client; flag-flip-before-stopStream; no auto-restart on exit | build | `pnpm --filter @sms-platform/api build` | ✅ (in-tree) | ⬜ pending |
| 15-03-T3 | 15-03 | 2 | CAM-01 | T-15-01 | POST/DELETE /api/cameras/:id/maintenance endpoints; `this.cls.get<string>('USER_ID')` reads key set by AuthGuard Task 1 | build | `pnpm --filter @sms-platform/api build` | ✅ (in-tree) | ⬜ pending |
| 15-03-T4 | 15-03 | 2 | CAM-01, CAM-02 | T-15-01, T-15-02 | Vitest coverage for API contract, flag-order (15-01 gate dependency), org scoping, no-auto-restart | unit | `pnpm --filter @sms-platform/api test tests/cameras/maintenance.test.ts -- --run` | ❌ W0 (file created in task) | ⬜ pending |
| 15-04-T1 | 15-04 | 3 | CAM-02 | T-15-10 | cameras-columns.tsx composite 3-icon Status cell + tooltips + row-action entry with toggled Thai label | type-check | `pnpm --filter @sms-platform/web exec tsc --noEmit` | ✅ (in-tree) | ⬜ pending |
| 15-04-T2 | 15-04 | 3 | CAM-03 | T-15-10, T-15-11 | onMaintenanceToggle plumbed through CamerasDataTable to tenant-cameras-page; AlertDialog with conditional variant + Thai copy + POST/DELETE call | type-check | `pnpm --filter @sms-platform/web exec tsc --noEmit` | ✅ (in-tree) | ⬜ pending |
| 15-04-T3 | 15-04 | 3 | CAM-02, CAM-03 | T-15-10 | Vitest + RTL coverage for composite cell visibility + color states + dropdown labels + callback invocation | unit (RTL) | `pnpm --filter @sms-platform/web test -- --run src/app/admin/cameras/components/cameras-columns.test.tsx` | ❌ W0 (file created in task) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Test files that must exist (scaffold or real) before executors can run `<automated>` verify for the named tasks. Paths reflect project convention (`apps/api/tests/{domain}/*.test.ts` flat; `apps/web/src/**/*.test.{ts,tsx}` co-located).

- [x] `apps/web` Vitest + @testing-library/react configured — **verified 2026-04-18** (`apps/web/vitest.config.ts` + `apps/web/package.json` ship vitest@3, @testing-library/react@^16.3.2, @testing-library/jest-dom@^6.9.1, @testing-library/user-event@^14.6.1). No install required.
- [ ] `apps/api/tests/status/debounce.test.ts` — stubs for RESIL-03 debounce-by-replacement jobId semantics (15-01-T5)
- [ ] `apps/api/tests/status/maintenance-suppression.test.ts` — stubs for CAM-02 maintenance gate + NotifyDispatchProcessor re-check (15-01-T5)
- [ ] `apps/api/tests/resilience/camera-health.test.ts` — stubs for RESIL-02 health tick (15-02-T3)
- [ ] `apps/api/tests/resilience/srs-restart-detection.test.ts` — stubs for RESIL-01 pid delta (15-02-T3)
- [ ] `apps/api/tests/resilience/srs-restart-recovery.test.ts` — stubs for RESIL-01 bulk re-enqueue with jitter (15-02-T3)
- [ ] `apps/api/tests/resilience/boot-recovery.test.ts` — stubs for RESIL-04 onApplicationBootstrap (15-02-T4)
- [ ] `apps/api/tests/resilience/shutdown.test.ts` — stubs for RESIL-04 onApplicationShutdown (15-02-T5)
- [ ] `apps/api/tests/cameras/maintenance.test.ts` — stubs for CAM-01, CAM-02 (15-03-T4)
- [ ] `apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx` — stubs for CAM-02, CAM-03 composite Status column + row-action (15-04-T3)

Path rationale: apps/api uses a flat `tests/` tree mirroring `src/` domain folders (see existing `apps/api/tests/cluster/*.test.ts`, `apps/api/tests/status/state-machine.test.ts`), not co-located `*.spec.ts` files. apps/web is the opposite — `include: ["src/**/*.test.{ts,tsx}"]` per its vitest config. Wave 0 paths above match the plans' `files_modified` verbatim.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker `docker compose restart srs` triggers real FFmpeg re-enqueue with visible jitter | RESIL-01 | Requires live SRS container + real cameras; not reproducible in unit tests | 1. Start 3+ cameras streaming. 2. `docker compose restart srs`. 3. Watch `pnpm logs:api` — confirm "SRS restart detected" and staggered re-enqueue timestamps within 30s. |
| Server `SIGTERM` shuts down FFmpeg children cleanly then re-enqueues on boot | RESIL-04 | Lifecycle hooks behave differently under container vs dev; needs real process tree | 1. Start 2+ cameras. 2. `docker compose stop api`. 3. Confirm ffmpeg children exit ≤10s. 4. `docker compose start api`. 5. Confirm streams reconnect. |
| Camera table Status column renders 3 icons with correct tooltips and color states | CAM-03 | Visual UX — automated snapshot test covers DOM, humans confirm intent | See `15-UI-SPEC.md` §UAT. Hover each of the 3 icons and confirm Thai tooltip copy matches verbatim. |
| Entering maintenance suppresses notifications but still writes audit log | CAM-02 | Cross-service behavior observable in UI + audit log viewer | 1. Subscribe to camera via webhook. 2. Enter maintenance. 3. Confirm webhook did NOT fire, audit log DID record entry with `action=create`, `resource='camera'`. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
