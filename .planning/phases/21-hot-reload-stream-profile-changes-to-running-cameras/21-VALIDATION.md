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
| 21-02-T1 | 21-02 | 1 | D-01 fingerprint util | unit | `pnpm --filter @sms-platform/api test -- tests/streams/profile-fingerprint.test.ts` | ✓ from 21-01-T1 | ⬜ pending |
| 21-02-T2 | 21-02 | 1 | D-01 + D-07 update trigger | unit | `pnpm --filter @sms-platform/api test -- tests/streams/stream-profile-restart.test.ts tests/streams/profile-restart-audit.test.ts` | ✓ from 21-01-T1 | ⬜ pending |
| 21-03-T1 | 21-03 | 1 | D-02 + D-07 reassign trigger | unit | `pnpm --filter @sms-platform/api test -- tests/cameras/camera-profile-reassign.test.ts` | ✓ from 21-01-T1 | ⬜ pending |
| 21-04-T1 | 21-04 | 2 | D-05 graceful kill | unit | `pnpm --filter @sms-platform/api test -- tests/streams/ffmpeg-graceful-restart.test.ts` | ✓ from 21-01-T1 | ⬜ pending |
| 21-04-T2 | 21-04 | 2 | D-03/D-04/D-05/D-08/D-09 enqueue+execution + B-1 collision guard | unit | `pnpm --filter @sms-platform/api test -- tests/streams/profile-restart-dedup.test.ts tests/streams/profile-restart-failure-fallthrough.test.ts tests/streams/stream-processor.test.ts tests/resilience/camera-health-restart-collision.test.ts` | ✓ from 21-01-T1 | ⬜ pending |
| 21-05-T1 | 21-05 | 3 | D-10 DELETE 409 | integration | `pnpm --filter @sms-platform/api test -- tests/streams/stream-profile-delete-protection.test.ts` | ✓ from 21-01-T1 | ⬜ pending |
| 21-05-T2 | 21-05 | 3 | D-06 toasts (admin + tenant + camera dialog) | component | `pnpm --filter @sms-platform/web test -- src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx` | ✓ from 21-01-T2 | ⬜ pending |
| 21-06-T1 | 21-06 | 4 | full suite green | integration | `pnpm --filter @sms-platform/api test && pnpm --filter @sms-platform/web test && pnpm --filter @sms-platform/web build` | n/a | ⬜ pending |
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
</content>
