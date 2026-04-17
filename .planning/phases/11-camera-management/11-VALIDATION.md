---
phase: 11
slug: camera-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/web && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/web && npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | CAM-01 | — | N/A | build | `cd apps/web && npx next build 2>&1 | tail -5` | ✅ | ⬜ pending |
| 11-01-02 | 01 | 1 | CAM-02 | — | N/A | build | `cd apps/web && npx next build 2>&1 | tail -5` | ✅ | ⬜ pending |
| 11-02-01 | 02 | 1 | CAM-03 | — | N/A | build | `cd apps/web && npx next build 2>&1 | tail -5` | ✅ | ⬜ pending |
| 11-03-01 | 03 | 2 | CAM-04 | — | N/A | build | `cd apps/web && npx next build 2>&1 | tail -5` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Card hover shows live preview | CAM-03 | Requires browser + running HLS stream | Open card view, hover over camera card, verify HLS player starts muted |
| View Stream sheet auto-plays | CAM-04 | Requires browser + running HLS stream | Click "View Stream", verify sheet opens with auto-playing muted stream |
| IntersectionObserver destroys players | CAM-03 | Requires browser scroll behavior | Scroll card view, verify off-viewport players are destroyed via DevTools |
| Sheet camera switching | CAM-04 | Requires browser interaction | Open sheet for Camera A, click Camera B row, verify sheet updates without close/reopen |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
