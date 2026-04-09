---
phase: 2
slug: stream-engine-camera-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/api && npx vitest run --reporter=verbose --coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/api && npx vitest run --reporter=verbose --coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | CAM-01 | — | N/A | unit + integration | `cd apps/api && npx vitest run tests/cameras/camera-crud.test.ts -t "create camera"` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | CAM-02 | — | N/A | integration | `cd apps/api && npx vitest run tests/cameras/hierarchy.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | CAM-06 | T-2-01 | Validate URL format with Zod, never pass to shell | unit (mocked) | `cd apps/api && npx vitest run tests/cameras/ffprobe.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | CAM-07 | — | N/A | unit | `cd apps/api && npx vitest run tests/cameras/bulk-import.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | STREAM-01 | T-2-04 | BullMQ concurrency limit per org | unit (mocked) | `cd apps/api && npx vitest run tests/streams/ffmpeg-manager.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | STREAM-02 | T-2-01 | fluent-ffmpeg programmatic API, no shell | unit | `cd apps/api && npx vitest run tests/streams/ffmpeg-command.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | CAM-03 | — | N/A | unit (mocked) | `cd apps/api && npx vitest run tests/streams/stream-lifecycle.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 1 | CAM-04 | — | N/A | unit | `cd apps/api && npx vitest run tests/status/state-machine.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-05 | 02 | 1 | CAM-05 | — | N/A | unit | `cd apps/api && npx vitest run tests/streams/reconnect.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | STREAM-03 | — | N/A | unit | `cd apps/api && npx vitest run tests/srs/config-generator.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | STREAM-04 | T-2-03 | Restrict callbacks to internal Docker network | integration | `cd apps/api && npx vitest run tests/srs/callbacks.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-03 | 03 | 2 | STREAM-05 | — | N/A | unit | `cd apps/api && npx vitest run tests/streams/profile-builder.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-04 | 03 | 2 | STREAM-06 | — | N/A | unit | `cd apps/api && npx vitest run tests/cameras/codec-detection.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 3 | STREAM-07 | — | N/A | integration | `cd apps/api && npx vitest run tests/settings/stream-engine.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 3 | STREAM-08 | — | N/A | manual-only | Docker + browser test | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/cameras/` directory — camera-crud, hierarchy, ffprobe, bulk-import, codec-detection test files
- [ ] `tests/streams/` directory — ffmpeg-manager, ffmpeg-command, stream-lifecycle, reconnect, profile-builder test files
- [ ] `tests/srs/` directory — config-generator, callbacks test files
- [ ] `tests/settings/` directory — stream-engine settings tests
- [ ] `tests/status/` directory — state-machine tests
- [ ] Mock factory for Camera, Project, Site, StreamProfile entities

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WebRTC WHEP playback | STREAM-08 | Requires browser + Docker SRS container | 1. Start SRS + push test stream 2. Open WHEP endpoint in browser 3. Verify sub-second latency playback |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
