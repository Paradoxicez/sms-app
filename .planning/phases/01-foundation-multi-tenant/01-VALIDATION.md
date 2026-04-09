---
phase: 1
slug: foundation-multi-tenant
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.3 |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | — | — | N/A | setup | `npx vitest run` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | AUTH-01 | T-01-01 | Scrypt password hashing, no enumeration | integration | `npx vitest run tests/auth/sign-in.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | AUTH-02 | T-01-02 | Cookie-based sessions, regeneration on login | integration | `npx vitest run tests/auth/session.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | AUTH-03 | T-01-03 | Server-side role management only | unit | `npx vitest run tests/auth/rbac.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-04 | 02 | 1 | AUTH-04 | T-01-04 | Time-limited impersonation sessions | integration | `npx vitest run tests/admin/super-admin.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 1 | TENANT-01 | T-01-05 | RLS enforced per request via set_config | integration | `npx vitest run tests/tenancy/rls-isolation.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 1 | TENANT-02 | T-01-06 | Admin-only org creation | integration | `npx vitest run tests/admin/org-management.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 1 | TENANT-03 | — | N/A | unit | `npx vitest run tests/packages/package-limits.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-04 | 03 | 1 | TENANT-04 | — | N/A | unit | `npx vitest run tests/packages/feature-toggles.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-05 | 03 | 1 | TENANT-05 | T-01-07 | Invitation-only user creation | integration | `npx vitest run tests/users/org-user-management.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — Vitest configuration with TypeScript paths
- [ ] `tests/setup.ts` — Test database setup (Docker PostgreSQL + Redis for tests)
- [ ] `tests/helpers/auth.ts` — Helper to create authenticated sessions for testing
- [ ] `tests/helpers/tenancy.ts` — Helper to create test organizations with RLS context
- [ ] Framework install: `npm install -D vitest @vitest/coverage-v8`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Session persists across browser refresh | AUTH-02 | Requires real browser cookie persistence | 1. Login via UI 2. Refresh page 3. Verify session still active |
| Feature toggles hide/show UI elements | TENANT-04 | Requires visual UI verification | 1. Set package with recordings=false 2. Login as org user 3. Verify recordings menu hidden |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
