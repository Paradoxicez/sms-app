---
phase: 16
slug: user-self-service
status: populated
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-19
updated: 2026-04-19
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (api + web workspaces) |
| **Config file** | `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts` |
| **Quick run command (api)** | `pnpm --filter @sms-platform/api test -- --run` |
| **Quick run command (web)** | `pnpm --filter @sms-platform/web test -- --run` |
| **Full suite command** | `pnpm --filter @sms-platform/api test -- --run && pnpm --filter @sms-platform/web test -- --run` |
| **Estimated runtime** | ~60s |

Test file layout conventions observed in repo:
- API: `apps/api/tests/<domain>/<name>.test.ts` (e.g. `apps/api/tests/status/debounce.test.ts`)
- Web: `apps/web/src/__tests__/<name>.test.tsx` (single flat directory)

For Phase 16 we follow these conventions:
- API avatar tests: `apps/api/tests/account/avatar-upload.test.ts` etc.
- Web Account tests: `apps/web/src/__tests__/account-profile-section.test.tsx` etc.

---

## Sampling Rate

- **After every task commit:** Run quick suite for the affected workspace
- **After every plan wave:** Run full suite (both workspaces)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60s
- Continuity rule: no 3 consecutive tasks without an `<automated>` verify command.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-T1 | 16-01 | 0 | USER-02 | T-16-01 (DoS) | Install `sharp@^0.34.5` + Debian libvips binary available | install | `pnpm --filter @sms-platform/api exec node -e "require('sharp')"` | n/a | ⬜ pending |
| 16-01-T2 | 16-01 | 0 | USER-02, USER-03, USER-01 | — | Stub test files + fixtures land; no cross-wave scavenger hunts | install | `test -f apps/api/tests/account/avatar-upload.test.ts && test -f apps/api/tests/account/plan-usage.test.ts && test -d apps/api/test/fixtures/avatars` | ❌ Wave 0 creates | ⬜ pending |
| 16-01-T3 | 16-01 | 1 | USER-02 | T-16-02 (path traversal), T-16-01 (DoS) | Extend MinioService with avatars bucket + uploadAvatar/removeAvatar/getAvatarUrl | unit | `pnpm --filter @sms-platform/api test -- --run tests/account/minio-avatars.test.ts` | Created in T3 | ⬜ pending |
| 16-01-T4 | 16-01 | 1 | USER-02 | T-16-01 (DoS pixel bomb), T-16-03 (cross-user overwrite) | AvatarService transcodes to WebP 256×256 with pixel-bomb guard | unit | `pnpm --filter @sms-platform/api test -- --run tests/account/avatar-service.test.ts` | Created in T4 | ⬜ pending |
| 16-01-T5 | 16-01 | 1 | USER-02 | T-16-03 (userId from session), T-16-01 (multer size gate), T-16-04 (auth) | AvatarController: POST + DELETE; userId from req.user.id only | integration | `pnpm --filter @sms-platform/api test -- --run tests/account/avatar-upload.test.ts` | Created Wave 0 stub, GREEN in T5 | ⬜ pending |
| 16-01-T6 | 16-01 | 2 | USER-03 | T-16-05 (cross-org leakage), T-16-04 (auth) | PlanUsageService + controller; membership check; avg Mbps MTD | integration | `pnpm --filter @sms-platform/api test -- --run tests/account/plan-usage.test.ts` | Created Wave 0 stub, GREEN in T6 | ⬜ pending |
| 16-02-T1 | 16-02 | 2 | USER-02, USER-01 | — | Install `@zxcvbn-ts/core` + lang packs in web | install | `pnpm --filter @sms-platform/web exec node -e "require('@zxcvbn-ts/core')"` | n/a | ⬜ pending |
| 16-02-T2 | 16-02 | 2 | USER-01, USER-02, USER-03 | — | Stub web test files land | install | `test -f apps/web/src/__tests__/account-profile-section.test.tsx && test -f apps/web/src/__tests__/account-security-section.test.tsx && test -f apps/web/src/__tests__/account-plan-section.test.tsx && test -f apps/web/src/__tests__/password-strength-bar.test.tsx && test -f apps/web/src/__tests__/usage-progress-row.test.tsx && test -f apps/web/src/__tests__/sidebar-footer-account.test.tsx` | ❌ Wave 0 creates | ⬜ pending |
| 16-02-T3 | 16-02 | 3 | USER-01, USER-02, USER-03 | — | SidebarFooterContent accepts accountHref; dropdown exposes "Account settings" | unit | `pnpm --filter @sms-platform/web test -- --run src/__tests__/sidebar-footer-account.test.tsx` | GREEN in T3 | ⬜ pending |
| 16-02-T4 | 16-02 | 3 | USER-01, USER-02 | — | Shared Account composites: Profile + Security + PasswordStrengthBar + UsageProgressRow + FeatureFlagRow render per UI-SPEC | unit | `pnpm --filter @sms-platform/web test -- --run src/__tests__/account-profile-section.test.tsx src/__tests__/account-security-section.test.tsx src/__tests__/password-strength-bar.test.tsx src/__tests__/usage-progress-row.test.tsx` | GREEN in T4 | ⬜ pending |
| 16-02-T5 | 16-02 | 3 | USER-01, USER-02, USER-03 | T-16-04 (auth guard) | `/app/account` page wires sections + fetches plan-usage; unauthenticated redirects | integration | `pnpm --filter @sms-platform/web test -- --run src/__tests__/account-plan-section.test.tsx` | GREEN in T5 | ⬜ pending |
| 16-03-T1 | 16-03 | 4 | USER-01, USER-02 | T-16-04 (auth guard) | `/admin/account` page renders Profile + Security only (no Plan & Usage) | integration | `pnpm --filter @sms-platform/web test -- --run src/__tests__/admin-account-page.test.tsx` | Created in T1 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 lives inside Plan 16-01 (backend) as Tasks T1 + T2 and inside Plan 16-02 (frontend shared) as Tasks T1 + T2. The orchestrator runs them before Wave 1 code tasks.

- [ ] Install `sharp@^0.34.5` in `apps/api` (Plan 16-01 T1)
- [ ] Install `@zxcvbn-ts/core@^3.0.4` + `@zxcvbn-ts/language-common` + `@zxcvbn-ts/language-en` in `apps/web` (Plan 16-02 T1)
- [ ] Create shared fixture directory `apps/api/test/fixtures/avatars/` with:
  - `tiny.jpg` — 512×384 JPEG under 100 KB (happy path)
  - `oversize.jpg` — 3 MB JPEG (size reject)
  - `pixel.png` — 1×1 PNG (edge — tiny input)
  - `corrupt.png` — File with `.png` extension but random bytes (sharp reject)
- [ ] Stub test files (failing / `.todo()` markers accepted for Wave 0):
  - `apps/api/tests/account/avatar-upload.test.ts` — covers USER-02 upload / size / MIME / remove / cross-user
  - `apps/api/tests/account/avatar-service.test.ts` — unit tests for sharp transcode
  - `apps/api/tests/account/minio-avatars.test.ts` — unit tests for MinioService new methods
  - `apps/api/tests/account/plan-usage.test.ts` — covers USER-03 shape + cross-org + no-package + MTD math
  - `apps/web/src/__tests__/account-profile-section.test.tsx` — USER-01 name + USER-02 avatar UX
  - `apps/web/src/__tests__/account-security-section.test.tsx` — USER-01 password UX
  - `apps/web/src/__tests__/account-plan-section.test.tsx` — USER-03 plan UI
  - `apps/web/src/__tests__/password-strength-bar.test.tsx` — zxcvbn 3-level compression
  - `apps/web/src/__tests__/usage-progress-row.test.tsx` — 80/95 threshold coloring
  - `apps/web/src/__tests__/sidebar-footer-account.test.tsx` — "Account settings" entry rendered
  - `apps/web/src/__tests__/admin-account-page.test.tsx` — admin variant hides Plan & Usage

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Avatar renders in `<AvatarImage>` after upload with correct cache-busting query | USER-02 | Visual + CDN cache behavior | 1) Upload avatar on `/app/account`, 2) hard-refresh, 3) confirm `user.image` has `?v=` suffix and image loads from MinIO public endpoint in Network tab |
| `revokeOtherSessions` flow end-to-end | USER-01 | Requires two browser sessions | 1) Sign in on Browser A + Browser B, 2) change password on A, 3) confirm B is signed out on next request |
| Sidebar footer "Account settings" routes to correct portal | USER-01/02/03 | Portal context detection integration | 1) Sign in as tenant user → link goes to `/app/account`; 2) sign in as super admin → link goes to `/admin/account` |
| Password strength bar visual polish (3 levels + aria-live) | USER-01 | Visual + screen reader behavior | 1) Type "abc" → Weak/red; 2) "Password1!" → Medium/amber; 3) "correct-horse-battery-staple-9!" → Strong/green; 4) screen reader announces level changes |
| Contact-admin info rendered without any interactive elements | USER-03 | UX contract per D-18 | 1) Visit `/app/account`, 2) scroll to Plan & Usage bottom; 3) confirm NO buttons / mailto / ticket links anywhere in section |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (sharp, zxcvbn, avatar fixtures, stub test files)
- [x] No watch-mode flags in automated commands (use `--run`)
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** populated — ready for execution
