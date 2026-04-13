---
phase: 7
slug: recordings
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && npx vitest run tests/recordings/ --reporter=verbose` |
| **Full suite command** | `cd apps/api && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && npx vitest run tests/recordings/ --reporter=verbose`
- **After every plan wave:** Run `cd apps/api && npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | REC-01 | T-07-01 | Path traversal prevention on on_hls file path | unit | `npx vitest run tests/recordings/archive-segment.test.ts -t "archives segment"` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | REC-01 | — | N/A | unit | `npx vitest run tests/recordings/archive-segment.test.ts -t "skips when not recording"` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | REC-03 | — | N/A | unit | `npx vitest run tests/recordings/recording-lifecycle.test.ts -t "starts recording"` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 1 | REC-03 | — | N/A | unit | `npx vitest run tests/recordings/recording-lifecycle.test.ts -t "stops recording"` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | REC-02 | T-07-05 | Cross-org segment access prevention via RLS | unit | `npx vitest run tests/recordings/manifest.test.ts -t "generates manifest"` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | REC-04 | — | N/A | unit | `npx vitest run tests/recordings/retention.test.ts -t "deletes expired"` | ❌ W0 | ⬜ pending |
| 07-02-03 | 02 | 2 | REC-05 | T-07-03 | Atomic quota check before upload | unit | `npx vitest run tests/recordings/storage-quota.test.ts -t "blocks at quota"` | ❌ W0 | ⬜ pending |
| 07-02-04 | 02 | 2 | REC-05 | — | N/A | unit | `npx vitest run tests/recordings/storage-quota.test.ts -t "sends alert"` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 3 | REC-02 | — | N/A | unit | `npx vitest run tests/recordings/schedule.test.ts -t "schedule toggle"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/recordings/archive-segment.test.ts` — stubs for REC-01 (on_hls callback pipeline)
- [ ] `tests/recordings/manifest.test.ts` — stubs for REC-02 (m3u8 generation)
- [ ] `tests/recordings/recording-lifecycle.test.ts` — stubs for REC-03 (start/stop)
- [ ] `tests/recordings/retention.test.ts` — stubs for REC-04 (retention cleanup)
- [ ] `tests/recordings/storage-quota.test.ts` — stubs for REC-05 (quota enforcement + alerts)
- [ ] `tests/recordings/schedule.test.ts` — stubs for D-03 (BullMQ schedule jobs)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HLS playback of archived recordings in browser | REC-02 | Requires hls.js player rendering in real browser | Open recording playback page, select time range, verify video plays |
| Timeline bar shows colored segments | REC-02 | Visual UI verification | Navigate to camera Recordings tab, verify timeline shows recording segments |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
