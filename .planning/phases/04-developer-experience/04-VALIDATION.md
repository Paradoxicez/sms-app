---
phase: 4
slug: developer-experience
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/api && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/api && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | DEV-01 | T-04-01 | API key hashed with SHA-256, never logged raw | unit + integration | `cd apps/api && npx vitest run tests/api-keys/api-keys.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | DEV-01 | T-04-01 | ApiKeyGuard authenticates via X-API-Key, timing-safe | unit | `cd apps/api && npx vitest run tests/api-keys/api-key-guard.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | DEV-02 | — | N/A | smoke | `curl -s http://localhost:3003/api/docs \| grep -q swagger` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | DEV-04 | T-04-02 | Webhook URL SSRF blocked (no private IPs), HMAC signed | integration | `cd apps/api && npx vitest run tests/webhooks/webhooks.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 2 | DEV-04 | T-04-03 | HMAC-SHA256 signature verified, timestamp anti-replay | unit | `cd apps/api && npx vitest run tests/webhooks/hmac.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-04-01 | 04 | 2 | DEV-05 | T-04-04 | Batch size limited to 50, rate limited | integration | `cd apps/api && npx vitest run tests/playback/batch-sessions.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-05-01 | 05 | 3 | DEV-03 | — | N/A | manual-only | Manual browser verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/tests/api-keys/api-keys.test.ts` — stubs for DEV-01 (API key CRUD + scoping)
- [ ] `apps/api/tests/api-keys/api-key-guard.test.ts` — stubs for DEV-01 (guard authentication)
- [ ] `apps/api/tests/webhooks/webhooks.test.ts` — stubs for DEV-04 (webhook subscription + delivery)
- [ ] `apps/api/tests/webhooks/hmac.test.ts` — stubs for DEV-04 (HMAC signature)
- [ ] `apps/api/tests/playback/batch-sessions.test.ts` — stubs for DEV-05 (batch sessions)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| In-app documentation pages render correctly | DEV-03 | Next.js page rendering requires browser | Navigate to `/admin/developer/docs/*`, verify all 5 guides render with correct content |
| Swagger UI interactive docs accessible | DEV-02 | Full Swagger UI interaction requires browser | Navigate to `/api/docs`, verify endpoints listed with examples |
| curl examples pre-filled with real data | DEV-02 | Requires authenticated session with API key | Create API key, navigate to developer portal, verify curl shows real key + camera IDs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
