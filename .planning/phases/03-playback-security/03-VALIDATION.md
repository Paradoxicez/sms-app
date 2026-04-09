---
phase: 3
slug: playback-security
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured in Phase 2) |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd backend && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd backend && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | PLAY-01 | T-03-01 | JWT signed session token with expiry | unit | `npx vitest run -t "session creation"` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | PLAY-02 | T-03-02 | Token rejected after TTL expires | unit | `npx vitest run -t "token expiry"` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | PLAY-03 | T-03-03 | Domain allowlist blocks unauthorized origins | unit | `npx vitest run -t "domain allowlist"` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | PLAY-04 | T-03-04 | SRS on_play callback verifies JWT | integration | `npx vitest run -t "on_play"` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | PLAY-05 | — | HLS URL returned with signed token | integration | `npx vitest run -t "playback URL"` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | PLAY-06 | T-03-05 | Viewer concurrency limit enforced | unit | `npx vitest run -t "concurrency"` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | POL-01 | — | Policy CRUD with level hierarchy | unit | `npx vitest run -t "policy"` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | POL-02 | — | Per-field merge resolves nearest level | unit | `npx vitest run -t "policy resolution"` | ❌ W0 | ⬜ pending |
| 03-03-03 | 03 | 2 | POL-03 | — | Camera overrides Site overrides Project | unit | `npx vitest run -t "policy inheritance"` | ❌ W0 | ⬜ pending |
| 03-03-04 | 03 | 2 | PLAY-07 | — | Embed page resolves session for playback | integration | `npx vitest run -t "embed"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/playback/test/playback-session.service.spec.ts` — stubs for PLAY-01, PLAY-02, PLAY-03, PLAY-06
- [ ] `backend/src/playback/test/srs-callback-security.spec.ts` — stubs for PLAY-04, PLAY-05
- [ ] `backend/src/policy/test/policy.service.spec.ts` — stubs for POL-01, POL-02, POL-03
- [ ] `backend/src/playback/test/embed.spec.ts` — stubs for PLAY-07

*Existing vitest infrastructure from Phase 2 covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HLS playback in browser with hls.js | PLAY-05 | Requires running SRS + browser | Start SRS, create session, open embed URL in browser, verify video plays |
| Token expiry stops live playback | PLAY-02 | Requires real-time HLS segment serving | Create session with short TTL, wait for expiry, verify playback stops |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
