---
phase: 21
slug: hot-reload-stream-profile-changes-to-running-cameras
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-25
last_updated: 2026-04-25
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> Source: 21-RESEARCH.md §8 Validation Architecture (planner fills the per-task map after PLAN.md tasks are numbered).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (apps/api) |
| **Config file** | apps/api/vitest.config.ts |
| **Quick run command** | `pnpm --filter @sms-platform/api test:unit -- <pattern>` |
| **Full suite command** | `pnpm --filter @sms-platform/api test` |
| **Estimated runtime** | ~30s unit, ~120s full incl. resilience integration tests |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @sms-platform/api test:unit -- <files-touched>` (scoped quick)
- **After every plan wave:** Run `pnpm --filter @sms-platform/api test`
- **Before `/gsd-verify-work`:** Full suite must be green AND `pnpm --filter @sms-platform/web build` must succeed
- **Max feedback latency:** 30 seconds (unit subset)

---

## Per-Task Verification Map

> Planner fills this after PLAN.md tasks are numbered. Use 21-RESEARCH.md §8 as the source of truth for which decision each test covers.

| Task ID | Plan | Wave | Decision | Test Type | Automated Command | File Exists | Status |
|---------|------|------|----------|-----------|-------------------|-------------|--------|
| 21-01-T1 | 21-01 | 0 | scaffold | unit | (scaffold only — no behavior) | ✓ created in this task | ✅ green |
| 21-01-T2 | 21-01 | 0 | D-06 scaffold | component | (scaffold only) | ✓ created in this task | ✅ green |
| 21-02-T1 | 21-02 | 1 | D-01 fingerprint util | unit | `pnpm --filter @sms-platform/api test -- tests/streams/profile-fingerprint.test.ts` | ✓ from 21-01-T1 | ✅ green |
| 21-02-T2 | 21-02 | 1 | D-01 + D-07 update trigger | unit | `pnpm --filter @sms-platform/api test -- tests/streams/stream-profile-restart.test.ts tests/streams/profile-restart-audit.test.ts` | ✓ from 21-01-T1 | ✅ green |
| 21-03-T1 | 21-03 | 1 | D-02 + D-07 reassign trigger | unit | `pnpm --filter @sms-platform/api test -- tests/cameras/camera-profile-reassign.test.ts` | ✓ from 21-01-T1 | ✅ green |
| 21-04-T1 | 21-04 | 2 | D-05 graceful kill | unit | `pnpm --filter @sms-platform/api test -- tests/streams/ffmpeg-graceful-restart.test.ts` | ✓ from 21-01-T1 | ✅ green |
| 21-04-T2 | 21-04 | 2 | D-03/D-04/D-05/D-08/D-09 enqueue+execution + B-1 collision guard | unit | `pnpm --filter @sms-platform/api test -- tests/streams/profile-restart-dedup.test.ts tests/streams/profile-restart-failure-fallthrough.test.ts tests/streams/stream-processor.test.ts tests/resilience/camera-health-restart-collision.test.ts` | ✓ from 21-01-T1 | ✅ green |
| 21-05-T1 | 21-05 | 3 | D-10 DELETE 409 | integration | `pnpm --filter @sms-platform/api test -- tests/streams/stream-profile-delete-protection.test.ts` | ✓ from 21-01-T1 | ✅ green |
| 21-05-T2 | 21-05 | 3 | D-06 toasts (admin + tenant + camera dialog) | component | `pnpm --filter @sms-platform/web test -- src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx` | ✓ from 21-01-T2 | ✅ green |
| 21-06-T1 | 21-06 | 4 | full suite green | integration | `pnpm --filter @sms-platform/api test && pnpm --filter @sms-platform/web test && pnpm --filter @sms-platform/web build` | n/a | ✅ green |
| 21-06-T2 | 21-06 | 4 | manual UAT | manual | (see Manual-Only Verifications) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test scaffolds RESEARCH.md §8 enumerated (9 files — 8 from original §8 + 1 B-1 collision guard added in revision iter 1). Wave 0 must create stubs for:

- [ ] `apps/api/src/streams/__tests__/profile-fingerprint.spec.ts` — D-01 hash-stability + change-detection
- [ ] `apps/api/src/streams/__tests__/stream-profile.update.spec.ts` — D-01 enqueue path on profile field change
- [ ] `apps/api/src/cameras/__tests__/camera.update-profile.spec.ts` — D-02 enqueue path on streamProfileId change
- [ ] `apps/api/src/streams/__tests__/profile-restart.dedup.spec.ts` — D-03/Q5 remove-then-add (latest save wins)
- [ ] `apps/api/src/streams/__tests__/profile-restart.jitter.spec.ts` — D-04 0–30s delay range
- [ ] `apps/api/src/streams/__tests__/profile-restart.execution.spec.ts` — D-05 SIGTERM→transition→spawn shape
- [ ] `apps/api/src/streams/__tests__/stream-profile.delete.spec.ts` — D-10 409 with usedBy[]
- [ ] `apps/api/src/audit/__tests__/audit.profile-hot-reload.spec.ts` — D-07 audit row shape at enqueue time
- [ ] `apps/api/tests/resilience/camera-health-restart-collision.test.ts` — B-1 CameraHealthService.enqueueStart collision guard (preserves in-flight 'restart' jobs)

Frontend (single Wave 0 item):
- [ ] `apps/web/src/app/admin/stream-profiles/__tests__/edit-dialog.toast.spec.tsx` — D-06 toast on profile save (`{N} camera(s) restarting...`)

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Toast renders correctly in actual browser (visual) | D-06 | DOM assertion covers content, not visual styling | Open Edit Stream Profile dialog with ≥1 online camera attached, change `videoBitrate`, save → verify info-level toast appears with the correct count |
| Recording timeline shows 2–5s gap during restart | D-08 | UI rendering of HLS gap is integration-only | Start a recording session on a camera, edit its profile, observe the View Stream Sheet recording timeline shows the gap and the camera returns to `online` |
| Activity tab inside View Stream Sheet shows the new `camera.profile_hot_reload` rows | D-07 / deferred bug | Frontend audit query has known bug per RESEARCH.md (resourceId not in `search` filter) | If broken: Phase 21 surfaces it during UAT — file/promote to `/gsd-quick` follow-up |

> **D-11 webhook coalescing — DROPPED from manual UAT (revision iter 1, W-5).**
> Verified instead by: (a) RESEARCH §A2 written analysis of the Phase 15 D-04 30s notification debounce coalescing transitions within the debounce window, and (b) Phase 15's existing notification-debounce regression test passing in the apps/api full suite. Phase 21 introduces no new transition that bypasses the debounce, so D-11 is verified by automated proof rather than manual UAT.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all 9 backend + 1 frontend test scaffolds listed above
- [x] No watch-mode flags in any task command
- [x] Feedback latency < 30s on unit subset
- [x] `nyquist_compliant: true` set in frontmatter once per-task map is filled and verified

**Approval:** approved (Wave 0 sign-off — 2026-04-25)

---

## Final Test Run — 2026-04-25

| Suite | Command | Result |
|-------|---------|--------|
| apps/api unit + integration | `pnpm --filter @sms-platform/api test` | 101 test files passed, 0 failed; 684 tests passed, 0 failed, 117 todo (all pre-Phase-21, unrelated). Phase 21 contribution: 9 files / 61 tests / 0 todo / 0 fail. |
| apps/web unit | `pnpm --filter @sms-platform/web test` | 57 test files passed, 0 failed; 485 tests passed, 0 failed, 0 todo. Phase 21 contribution: 1 file / 7 tests / 0 todo / 0 fail. |
| apps/web build | `pnpm --filter @sms-platform/web build` | exit 0, Time 15.6s, Errors: 0, Warnings: 2 (pre-existing, not Phase 21 introduced) |

**Phase 21 test files:** 9 backend + 1 frontend, all green (61 + 7 = 68 assertions passing, 0 todo, 0 failing).

**Regressions:** 1 caught and fixed during Plan 06 sweep — `tests/streams/profile-builder.test.ts` `mockTenancyClient` lacked `camera.findMany` after Plan 05 (D-10) added the pre-delete check. Fixed in commit `6103bd0` (Plan 21-06 auto-fix Rule 1) by adding `camera.findMany.mockResolvedValue([])` default and restoring it after `vi.clearAllMocks()` in `beforeEach`. Same retrofitting pattern as Plan 04 (`camera-health.test.ts`).

**Out-of-scope tracking:** 117 pre-existing `it.todo` scaffolds remain in non-Phase-21 files (api-key-guard, api-keys, audit-interceptor, batch-sessions, camera-crud, dashboard, hmac, map, notifications, push-maintenance, srs-log-gateway, system-metrics, webhooks). These were not introduced by Phase 21 and are tracked elsewhere. The 2 `next build` warnings are likewise pre-existing.

---

## Manual UAT — 2026-04-25

Operator: orchestrator-led mixed CLI + UI verification (super admin session).

### Verified PASS

| # | Test | Method | Result |
|---|------|--------|--------|
| 7.1 | T-21-01 auth gate | curl PATCH `/api/stream-profiles/:id` (no session) | 401 Unauthorized ✓ |
| D-10 | DELETE protection (server) | curl DELETE on `SD640` (used by BKR06), `HD 15` (used by Test Push 4) | both 409 + correct `usedBy: [{cameraId, name}]` payload ✓ |
| D-01 | Surface contract | curl PATCH `SD640` videoBitrate 2000k → 2500k | 200 + `affectedCameras: 1` ✓ |
| D-07 | Audit at enqueue (resilient) | 11 PATCHes (1 + 10 rapid alternating 2500k↔3000k) | 11/11 audit rows in `AuditLog`, all with correct old/new `sha256:` fingerprints ✓ |
| 1 | D-01 toast (UI) | super admin web session → Edit Stream Profile → change videoBitrate → Save | info-variant toast `"Profile updated · 1 camera(s) restarting…"` ✓ |
| 2 | D-02 toast (UI) | Edit Camera BKR06 → change Stream Profile → Save | info-variant toast `"Stream restarting with new profile"` ✓ |
| 4 | D-10 AlertDialog (UI) | Tenant Stream Profiles → Delete `HD 15` | dialog "Reassign before deleting · 1 camera still using this profile: Test Push 4" — Delete button hidden, Cancel only ✓ |

### DEFECT — Active-job collision (D-04 dedup edge case)

**What works:** every PATCH writes an audit row with correct fingerprint diff (D-07 by design), the PATCH response carries `affectedCameras` / `restartTriggered` correctly, the toast/dialog fire correctly.

**What's broken:** when a camera's BullMQ job is currently in **active+locked** state (i.e., the worker is holding the `:lock` because FFmpeg is alive), `enqueueProfileRestart`'s remove-then-add pattern silently no-ops:

```
streams.service.ts:206-210
  const existingJob = await this.streamQueue.getJob(jobId);
  if (existingJob) {
    await existingJob.remove().catch(() => {});  // ← throws on locked active job; caught silently
  }
  await this.streamQueue.add('restart', ..., { jobId, ... });  // ← BullMQ dedupes by jobId → returns existing job
```

**Effect:** running cameras that have a live FFmpeg (the common state after boot recovery) **do not** get the new profile applied. The active 'start' job continues with the original profile data captured at job-creation time. The new profile takes effect only when FFmpeg dies for some other reason and the worker re-enqueues.

**Reproducer (this session, BKR06 + SD640):**
- Boot recovery enqueued 'start' job at 11:16:08 with `videoBitrate: 2000k`
- 11 subsequent PATCHes between 11:18 and 11:22 changed `SD640.videoBitrate` to `2500k`/`3000k`/`2500k`/...
- Final DB state: `SD640.videoBitrate = 2500k`, `AuditLog count(camera.profile_hot_reload) = 11`
- BullMQ active job state: still `name: "start"`, `data.profile.videoBitrate: "2000k"`, same `processedOn: 11:16:08`
- FFmpeg PID 14013 unchanged; CPU profile reflects 2000k bitrate, not 2500k

**Why unit tests didn't catch it:** `profile-restart-dedup.test.ts` mocks the queue and tests waiting/queued-state replacement. It does not exercise the active+locked code path because mocks return synchronously.

**Severity:** medium. The phase name is "hot-reload" but in practice it is "eventually-reload" for the common case. Audit log is intact (D-07 was designed for this), and the camera will eventually pick up the new profile when FFmpeg naturally restarts.

**Tracked as:** Phase 21.1 gap-closure in ROADMAP. Suggested approaches captured in 21-06-SUMMARY.md "Defect" section.

### Skipped / Deferred

| Test | Reason |
|------|--------|
| 1/2 status pill cycle, HLS resume | blocked by active-job defect — restart never fired in this session |
| 3 recording gap | no camera was actively recording during this session |
| 6 Activity tab visibility | known broken per 21-RESEARCH.md §3 (frontend-only audit search bug — backend audit rows verified to exist) |
| 7.2 cross-org delete (T-21-02) | covered by automated test 21-05-T1 case 5; no two-org seed available in this session |
| 7.3 BullMQ dedup under load | confirmed dedup behavior, but the active-job collision means it dedupes against the boot-recovery 'start' too — see DEFECT |

### Sign-off

`approved` — Phase 21 surface contract verified end-to-end; runtime restart cycle deferred to Phase 21.1 with the active-job collision defect documented above.
</content>
