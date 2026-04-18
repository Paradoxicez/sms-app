---
phase: 15
slug: ffmpeg-resilience-camera-maintenance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (apps/api confirmed); apps/web TBD in Wave 0 |
| **Config file** | apps/api/vitest.config.ts (api); apps/web to verify |
| **Quick run command** | `pnpm --filter api test -- --run` |
| **Full suite command** | `pnpm -r test -- --run` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter api test -- --run` (or web filter if UI task)
- **After every plan wave:** Run `pnpm -r test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

> Populated by planner after PLAN.md files exist. Each task MUST appear here with an automated command or a Wave 0 ❌ entry that covers it.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | RESIL-01..04 / CAM-01..03 | T-15-XX | TBD | unit / integration | TBD | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Verify `apps/web` has vitest + @testing-library/react configured (research Open Question #2). If missing, add to Wave 0.
- [ ] `apps/api/src/camera-health/camera-health.service.spec.ts` — stubs for RESIL-02, RESIL-03
- [ ] `apps/api/src/srs/srs-restart-detector.spec.ts` — stubs for RESIL-01
- [ ] `apps/api/src/resilience/boot-recovery.service.spec.ts` — stubs for RESIL-04
- [ ] `apps/api/src/status/status.service.spec.ts` — extend for debounce + maintenance gate (RESIL-03, CAM-02)
- [ ] `apps/api/src/cameras/cameras.controller.spec.ts` — stubs for CAM-01, CAM-02
- [ ] `apps/web/src/app/admin/cameras/components/cameras-columns.spec.tsx` — stubs for CAM-03 (composite Status column)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Docker `docker compose restart srs` triggers real FFmpeg re-enqueue with visible jitter | RESIL-01 | Requires live SRS container + real cameras; not reproducible in unit tests | 1. Start 3+ cameras streaming. 2. `docker compose restart srs`. 3. Watch `pnpm logs:api` — confirm "SRS restart detected" and staggered re-enqueue timestamps within 30s. |
| Server `SIGTERM` shuts down FFmpeg children cleanly then re-enqueues on boot | RESIL-04 | Lifecycle hooks behave differently under container vs dev; needs real process tree | 1. Start 2+ cameras. 2. `docker compose stop api`. 3. Confirm ffmpeg children exit ≤10s. 4. `docker compose start api`. 5. Confirm streams reconnect. |
| Camera table Status column renders 3 icons with correct tooltips and color states | CAM-03 | Visual UX — automated snapshot test covers DOM, humans confirm intent | See `15-UI-SPEC.md` §UAT. |
| Entering maintenance suppresses notifications but still writes audit log | CAM-02 | Cross-service behavior observable in UI + audit log viewer | 1. Subscribe to camera via webhook. 2. Enter maintenance. 3. Confirm webhook did NOT fire, audit log DID record entry. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
