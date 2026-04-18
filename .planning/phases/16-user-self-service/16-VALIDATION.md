---
phase: 16
slug: user-self-service
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (api + web workspaces) |
| **Config file** | `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter api test -- --run` / `pnpm --filter web test -- --run` |
| **Full suite command** | `pnpm test` (root) |
| **Estimated runtime** | ~60s |

---

## Sampling Rate

- **After every task commit:** Run quick suite for the affected workspace (`pnpm --filter api test -- --run` or `pnpm --filter web test -- --run`)
- **After every plan wave:** Run `pnpm test` (full suite, both workspaces)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60s

---

## Per-Task Verification Map

> Populated by planner. Each plan task must have either an `<automated>` verify command OR a Wave 0 dependency. See `16-RESEARCH.md §Validation Architecture` for test file layout (avatar upload → `avatar.controller.spec.ts`, plan-usage → `plan-usage.service.spec.ts`, password change UX → `security-section.test.tsx`, etc.).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _TBD_ | _TBD_ | _TBD_ | USER-01 / USER-02 / USER-03 | _per plan threat model_ | _per plan_ | unit / integration / e2e | _per plan_ | _per plan_ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install `sharp@^0.34.5` in `apps/api`
- [ ] Install `@zxcvbn-ts/core@^3.0.4` + language packs in `apps/web` (lazy-loaded)
- [ ] Create shared fixture: `apps/api/test/fixtures/avatars/` (tiny JPEG, 3MB oversize JPEG, 1×1 PNG, corrupt PNG) for upload tests
- [ ] Stub test file `apps/api/src/users/avatar.controller.spec.ts` — cases for USER-02
- [ ] Stub test file `apps/api/src/plan-usage/plan-usage.service.spec.ts` — cases for USER-03
- [ ] Stub test file `apps/web/src/app/app/account/components/security-section.test.tsx` — cases for USER-01 password UX
- [ ] Stub test file `apps/web/src/app/app/account/components/profile-section.test.tsx` — cases for USER-01 name + USER-02 avatar UX

*Planner must confirm these stubs are created in Wave 0 of at least one plan.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Avatar renders in `<AvatarImage>` after upload with correct cache-busting query | USER-02 | Visual + CDN cache behavior; `?v={ts}` correctness best verified in browser devtools Network tab | 1) Upload avatar, 2) hard-refresh, 3) confirm `user.image` has `?v=` suffix and image loads from MinIO public endpoint |
| `revokeOtherSessions` flow end-to-end | USER-01 | Requires two browser sessions for the same user | 1) Sign in on Browser A + Browser B, 2) change password on A, 3) confirm B gets signed out on next request |
| Sidebar footer "Account settings" link routes to correct portal | USER-01/02/03 | Portal context detection (app vs admin) — integration behavior | 1) Sign in as tenant user → confirm link goes to `/app/account`; 2) sign in as super admin → confirm link goes to `/admin/account` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (sharp, zxcvbn, avatar fixtures, stub test files)
- [ ] No watch-mode flags in automated commands (use `--run`)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
