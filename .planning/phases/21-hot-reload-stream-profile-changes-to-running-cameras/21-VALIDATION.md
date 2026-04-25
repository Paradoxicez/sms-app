---
phase: 21
slug: hot-reload-stream-profile-changes-to-running-cameras
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-25
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
| TBD     | TBD  | TBD  | D-01..D-11 | TBD     | TBD               | TBD         | ⬜ pending |

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (planner fills per-task map)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all 9 backend + 1 frontend test scaffolds listed above
- [ ] No watch-mode flags in any task command
- [ ] Feedback latency < 30s on unit subset
- [ ] `nyquist_compliant: true` set in frontmatter once per-task map is filled and verified

**Approval:** pending
</content>
