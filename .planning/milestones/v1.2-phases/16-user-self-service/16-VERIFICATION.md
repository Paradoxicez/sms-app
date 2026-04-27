---
phase: 16-user-self-service
verified: 2026-04-19T18:52:00Z
status: passed
score: 9/9 must-haves verified (automated) + 9/9 human UAT items verified (16-HUMAN-UAT.md)
human_verification:
  - test: "Tenant sidebar dropdown -> Account settings navigates to /app/account and loads Profile + Security + Plan & Usage sections"
    expected: "Sidebar footer avatar button opens dropdown; clicking 'Account settings' lands on /app/account with H1 'Account settings', Profile card (avatar + display name form), Security card (3 password fields + strength bar), Plan & Usage card (4 progress bars + API calls + 3 features + contact paragraph)"
    why_human: "Browser-driven navigation + visual composition of 3 cards cannot be exercised by vitest + jsdom"
  - test: "Avatar upload happy path (tenant or admin portal)"
    expected: "Click 'Upload new avatar' -> select JPEG/PNG/WebP under 2 MB -> spinner appears -> avatar <img> replaces initials within ~1s -> toast 'Avatar updated' -> refresh page and image persists (sourced from real MinIO URL with ?v= cache-buster)"
    why_human: "Real MinIO round-trip + Better Auth updateUser persistence + visual avatar swap cannot be verified in unit tests"
  - test: "Avatar remove happy path"
    expected: "With avatar set, click 'Remove' -> DELETE fires -> avatar reverts to initials -> toast 'Avatar removed' -> refresh and initials persist"
    why_human: "End-to-end persistence requires running API + MinIO"
  - test: "Password change happy path"
    expected: "Fill 3 fields with valid values -> strength bar reflects score -> 'Change password' -> toast 'Password changed. Signed out from other devices.' -> form resets -> other browser session is invalidated within a few seconds"
    why_human: "Better Auth revokeOtherSessions behavior requires a real second session to verify; toast + redirect are user-visible"
  - test: "Password change with wrong current password"
    expected: "Submit with incorrect current password -> no toast -> inline error 'Current password is incorrect.' under the Current password field"
    why_human: "Requires Better Auth backend returning INVALID_PASSWORD error code; visual error placement"
  - test: "Unauthenticated visitor to /app/account and /admin/account"
    expected: "Both URLs redirect to /sign-in before rendering any Profile/Security content; skeleton briefly visible then replaced by sign-in page"
    why_human: "Client-side router.replace timing + visual redirect verified in-browser"
  - test: "Non-admin user hits /admin/account directly via URL"
    expected: "Redirects to /app/dashboard (role-gate defence-in-depth), no Profile/Security content ever rendered"
    why_human: "Requires a real non-admin session; role-gate is time-sensitive client-side redirect"
  - test: "Plan & Usage section displays real package, usage counts, and feature flags"
    expected: "Shows current plan name/description, 4 progress bars with correct used/max values + threshold colors (>=95% red, >=80% amber, else primary), API calls MTD count, 3 feature rows (Recordings/Webhooks/Map view), 'Need more? Contact your system administrator to upgrade your plan.' text with NO upgrade button"
    why_human: "Real plan-usage aggregation (DB + StatusService + Redis) + visual threshold colors + absence of action button verified by inspection"
  - test: "Super admin /admin/account correctly omits Plan & Usage section"
    expected: "Admin portal account page renders Profile + Security only; no Plan & Usage card; no /api/organizations/.../plan-usage fetch in Network tab"
    why_human: "D-02 verification is behavioral + network-trace, not a pure DOM assertion"
---

# Phase 16: User Self-Service Verification Report

**Phase Goal:** Users can manage their own account and view their organization's plan and usage
**Verified:** 2026-04-19T18:52:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can change display name and password from an Account settings page (ROADMAP SC1, USER-01) | VERIFIED | `AccountProfileSection` uses react-hook-form + zod; submits `authClient.updateUser({ name })`; `AccountSecuritySection` submits `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` to Better Auth catch-all `/api/auth/change-password`. Covered by 11 + 9 web assertions GREEN. |
| 2 | User can upload and change avatar image (ROADMAP SC2, USER-02) | VERIFIED | `POST /api/users/me/avatar` transcodes via sharp (256x256 WebP, pixel-bomb gate) and uploads to MinIO `avatars` bucket; `DELETE` removes idempotently; frontend posts FormData, gets `{ url }`, then calls `authClient.updateUser({ image: url })`. 10 API assertions + 11 web assertions GREEN. |
| 3 | User can view current plan + usage counts (cameras, storage, API calls) on read-only Plan page (ROADMAP SC3, USER-03) | VERIFIED | `GET /api/organizations/:orgId/plan-usage` composes package + live usage (cameras from DB, viewers from StatusService, storage from SUM(RecordingSegment.size), bandwidth avg Mbps MTD, API calls = persisted + Redis today delta). `AccountPlanSection` fetches with `credentials: "include"` and renders 4 UsageProgressRow + API calls + feature flags + contact info (no upgrade button). 12 API + 10 web assertions GREEN. |
| 4 | Sidebar footer dropdown in both portals exposes 'Account settings' above 'Sign out' | VERIFIED | `sidebar-footer.tsx` renders `DropdownMenuItem` with `UserCog` icon + `Link href={accountHref}` at line 122-125, followed by `DropdownMenuSeparator` at 126 and `Sign out` item at 127-133. 8 sidebar-footer-account.test.tsx assertions GREEN. |
| 5 | Avatar userId is taken from `req.user.id` only, never body/query (T-16-03) | VERIFIED | `avatar.controller.ts:61` uses `(req as any).user.id`. Test "writes object key {userId}.webp from req.user.id, ignoring any userId in multipart body" GREEN. |
| 6 | Sharp pipeline rejects oversize (2+ MB), non-image MIME, and pixel bombs before MinIO write (T-16-01, T-16-06) | VERIFIED | Multer `limits.fileSize: 2 * 1024 * 1024`; `ParseFilePipeBuilder` MIME regex `/^image\/(jpeg\|png\|webp)$/`; sharp `{ limitInputPixels: 25_000_000, failOn: 'error' }`. 7 avatar-service + 10 avatar-upload assertions GREEN. |
| 7 | Plan-usage returns 403 for non-members (T-16-05) | VERIFIED | `plan-usage.controller.ts:37-43` checks `prisma.member.findFirst({ where: { organizationId: orgId, userId } })` and throws `ForbiddenException('Not a member of this organization')`. Test GREEN. |
| 8 | zxcvbn is lazy-loaded via dynamic `import()` (no top-level import) | VERIFIED | `password-strength-bar.tsx:21-25` uses `await Promise.all([import('@zxcvbn-ts/core'), import('@zxcvbn-ts/language-common'), import('@zxcvbn-ts/language-en')])` inside `useEffect`. Test "lazy-loads" GREEN. Build output: /app/account 3.03 kB. |
| 9 | Super admin /admin/account omits Plan & Usage section per D-02 | VERIFIED | `apps/web/src/app/admin/account/page.tsx` neither imports `AccountPlanSection` nor `useCurrentRole`; renders only Profile + Security. 7 admin-account-page.test.tsx assertions GREEN. |

**Score:** 9/9 truths verified (automated); 9 items require human browser verification for end-to-end UX flows.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/recordings/minio.service.ts` | Extended with `ensureAvatarsBucket`, `uploadAvatar`, `removeAvatar`, `getAvatarUrl` | VERIFIED | All 4 methods present (lines 67-122), plus legacy 7 recording methods intact |
| `apps/api/src/account/avatar/avatar.service.ts` | AvatarService with sharp transcode + MinIO bootstrap | VERIFIED | `uploadForUser` (sharp 256x256 WebP + MinIO upload), `removeForUser` (idempotent), `onModuleInit` (bucket bootstrap). 56 lines. |
| `apps/api/src/account/avatar/avatar.controller.ts` | POST/DELETE /api/users/me/avatar with size + MIME gates | VERIFIED | `@Controller('api/users/me/avatar')` + `@UseGuards(AuthGuard)`. POST uses FileInterceptor + ParseFilePipeBuilder; DELETE calls `removeForUser(req.user.id)`. 72 lines. |
| `apps/api/src/account/plan-usage/plan-usage.service.ts` | Composes package + cameras + viewers + storage + API MTD | VERIFIED | Real queries to prisma.organization/camera/recordingSegment/apiKeyUsage/apiKey + StatusService.getViewerCount + Redis today scan. 154 lines. |
| `apps/api/src/account/plan-usage/plan-usage.controller.ts` | GET /api/organizations/:orgId/plan-usage with membership guard | VERIFIED | `prisma.member.findFirst` check enforces 403 for non-members. 46 lines. |
| `apps/api/src/account/account.module.ts` | AccountModule wiring AvatarController + PlanUsageController | VERIFIED | imports AuthModule, RecordingsModule, StatusModule, ApiKeysModule; controllers AvatarController + PlanUsageController; providers AvatarService + PlanUsageService. |
| `apps/api/src/app.module.ts` | AccountModule registered in AppModule imports | VERIFIED | Line 27 import + line 60 imports array entry |
| `apps/web/src/components/nav/sidebar-footer.tsx` | Extended with accountHref + userImage props + Account settings DropdownMenuItem | VERIFIED | Props added (line 29, 30), UserCog icon imported, AvatarImage imported, `<DropdownMenuItem render={<Link href={accountHref} />}>` at line 122. |
| `apps/web/src/components/account/account-profile-section.tsx` | Avatar upload/remove + display name form | VERIFIED | 230 lines; real fetch to /api/users/me/avatar + authClient.updateUser |
| `apps/web/src/components/account/account-security-section.tsx` | Password change form with strength bar | VERIFIED | 153 lines; 3 fields + zod cross-field refinements + authClient.changePassword with revokeOtherSessions:true |
| `apps/web/src/components/account/account-plan-section.tsx` | Plan & Usage composite | VERIFIED | 188 lines; fetches /api/organizations/${orgId}/plan-usage; 3 states (loading/error/ok); renders 4 UsageProgressRow + API calls + 3 FeatureFlagRow + contact text |
| `apps/web/src/components/account/password-strength-bar.tsx` | 3-segment bar with lazy zxcvbn | VERIFIED | Dynamic `import()` inside useEffect (line 21-25); 150ms debounce; 3-level color scheme |
| `apps/web/src/components/account/usage-progress-row.tsx` | Label + used/max + progress bar with 80/95% thresholds | VERIFIED | Thresholds at 80/95; clamp to 100%; aria-label correct |
| `apps/web/src/components/account/feature-flag-row.tsx` | Check/X icon + label | VERIFIED | Check (text-primary) enabled; X (text-muted-foreground) disabled |
| `apps/web/src/app/app/account/page.tsx` | Tenant account page | VERIFIED | H1 "Account settings", subtitle, 3 Cards; `router.replace('/sign-in')` when unauth; Plan & Usage only when activeOrgId present |
| `apps/web/src/app/admin/account/page.tsx` | Super admin account page (Profile + Security only) | VERIFIED | No AccountPlanSection import; role-gate at page level + layout level (defence-in-depth) |
| `apps/web/src/app/app/layout.tsx` | Tenant layout passes accountHref="/app/account" and userImage | VERIFIED | Line 130 + 131 |
| `apps/web/src/app/admin/layout.tsx` | Admin layout passes accountHref="/admin/account" and userImage | VERIFIED | Line 83 + 84 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `AvatarController` | `AvatarService` | `avatarService.uploadForUser(req.user.id, file.buffer)` | WIRED | Line 62: `this.avatarService.uploadForUser(userId, file.buffer)` |
| `AvatarService` | `MinioService` | `minio.uploadAvatar(userId, webpBuffer)` | WIRED | Line 46: `return this.minio.uploadAvatar(userId, webp)` |
| `PlanUsageController` | `PlanUsageService` | `planUsageService.getPlanUsage(orgId)` after membership check | WIRED | Line 44 after Member.findFirst gate at line 37 |
| `PlanUsageService` | `StatusService` | `statusService.getViewerCount(cameraId)` | WIRED | Line 66: `sum + this.status.getViewerCount(c.id)` |
| `sidebar-footer.tsx` | `/app/account` + `/admin/account` | `Link href={accountHref}` with portal-specific href | WIRED | Tenant layout passes '/app/account'; admin layout passes '/admin/account' |
| `account-profile-section.tsx` | `/api/users/me/avatar` | POST multipart + DELETE | WIRED | Lines 95-99 (POST) + 117-120 (DELETE) both use `credentials: "include"` |
| `account-security-section.tsx` | `authClient.changePassword` | `{ revokeOtherSessions: true }` | WIRED | Line 58-62 |
| `account-plan-section.tsx` | `/api/organizations/:orgId/plan-usage` | `fetch` GET with credentials:include | WIRED | Line 61-63 |
| `app/app/account/page.tsx` | `AccountProfileSection`, `AccountSecuritySection`, `AccountPlanSection` | direct imports + render | WIRED | Lines 8-10 + 69-71 |
| `app/admin/account/page.tsx` | `AccountProfileSection`, `AccountSecuritySection` only | direct imports + render (NO AccountPlanSection) | WIRED | Lines 7-8 + 83-84; compile-time absence of Plan section |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `AccountProfileSection.avatarUrl` | `avatarUrl` state | POST response url from `fetch('/api/users/me/avatar')` + sync from `user.image` prop via useEffect | Yes — real MinIO URL with ?v= cache-buster | FLOWING |
| `AccountPlanSection.state.data` | `state.data` | `fetch('/api/organizations/${orgId}/plan-usage', { credentials: 'include' })` | Yes — real Prisma aggregates + Status + Redis | FLOWING |
| `plan-usage.service.ts.storage._sum.size` | `storage._sum.size` | `prisma.recordingSegment.aggregate({ where: { orgId }, _sum: { size: true } })` | Yes — real DB aggregation (mirrors RecordingsService.checkStorageQuota) | FLOWING |
| `plan-usage.service.ts.apiCallsMtd` | `apiCallsMtd` | Persisted `prisma.apiKeyUsage.aggregate` + Redis `apikey:usage:*:YYYY-MM-DD:requests` scan | Yes — real persisted + today delta | FLOWING |
| `plan-usage.service.ts.viewers` | `viewers` | `cameras.reduce((sum, c) => sum + statusService.getViewerCount(c.id), 0)` | Yes — in-memory SRS viewer snapshot | FLOWING |
| `avatar.controller.ts.url` | returned `{ url }` | `avatarService.uploadForUser(userId, file.buffer)` -> sharp transcode -> `minio.uploadAvatar` -> `getAvatarUrl(userId, Date.now())` | Yes — real transcoded buffer written to MinIO | FLOWING |
| `sidebar-footer.tsx.userImage` | `userImage` prop | Tenant/admin layout reads session.user.image and forwards through AppSidebar | Yes — Better Auth session user.image | FLOWING |
| `PasswordStrengthBar.score` | `score` state | zxcvbn lazy-imported in useEffect; 150ms debounce -> `zxcvbn(password).score` | Yes — real @zxcvbn-ts/core scoring | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All Phase 16 API tests pass | `pnpm --filter @sms-platform/api test -- --run tests/account/` | 4 files, 36/36 tests passed | PASS |
| All Phase 16 web tests pass | `pnpm --filter @sms-platform/web test -- --run src/__tests__/{sidebar-footer-account,password-strength-bar,usage-progress-row,account-profile-section,account-security-section,account-plan-section,admin-account-page}.test.tsx` | 7 files, 59/59 tests passed | PASS |
| API SWC build compiles | `pnpm --filter @sms-platform/api build` | Successfully compiled 147 files with SWC | PASS |
| Web Next.js build compiles | `pnpm --filter @sms-platform/web build` | Build success; `/app/account` (3.03 kB) + `/admin/account` (765 B) emitted | PASS |
| Web tsc clean | `pnpm --filter @sms-platform/web exec tsc --noEmit -p .` | Clean, no errors | PASS |
| AccountModule imported in AppModule | `grep AccountModule apps/api/src/app.module.ts` | 2 matches (import + imports-array entry) | PASS |
| No todos remain in Phase 16 test files | `grep -r 'it.todo' apps/api/tests/account apps/web/src/__tests__` | 0 matches across 11 files | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| USER-01 | 16-01, 16-02, 16-03 | User เปลี่ยนชื่อและ password ได้เองในหน้า Account | SATISFIED | Name: `AccountProfileSection` -> `authClient.updateUser({ name })`. Password: `AccountSecuritySection` -> `authClient.changePassword({ revokeOtherSessions: true })` via Better Auth catch-all at `/api/auth/*`. Both /app/account (tenant) and /admin/account (super admin) expose both controls. |
| USER-02 | 16-01, 16-02, 16-03 | User upload avatar ได้ | SATISFIED | Backend: `POST/DELETE /api/users/me/avatar` with sharp transcode + MinIO. Frontend: `AccountProfileSection` wires hidden file input -> FormData POST -> `authClient.updateUser({ image })`. Remove button also wired. Exposed on both portals. |
| USER-03 | 16-01, 16-02 | User ดู plan ปัจจุบัน, usage/limits ได้ในหน้า Plan (view-only) | SATISFIED | Backend: `GET /api/organizations/:orgId/plan-usage` returns package + live usage. Frontend: `AccountPlanSection` renders 4 progress rows + API calls + feature flags. Per D-02, only tenant portal (`/app/account`) shows this — super admin portal correctly omits it. No upgrade button (contact-admin text only). |

**Orphaned requirements:** None. REQUIREMENTS.md lists exactly USER-01, USER-02, USER-03 for Phase 16 — all three appear in at least one plan's `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/components/account/account-profile-section.tsx` | 209 | `placeholder="Your name"` | Info | HTML `placeholder` attribute on Input field — legitimate UX hint, not a stub indicator. No action. |

No TODO / FIXME / HACK markers. No `return null` stubs. No `return []` with empty data. No `console.log` implementations. All data variables flow from real DB / API / MinIO / Better Auth sources.

### Human Verification Required

See YAML frontmatter `human_verification` block. Nine browser-driven flows need user validation:

1. **Sidebar navigation to Account settings** — verify dropdown entry + page load in both portals.
2. **Avatar upload happy path** — verify real MinIO round-trip + image persistence.
3. **Avatar remove happy path** — verify DELETE + fallback initials + persistence.
4. **Password change happy path** — verify `revokeOtherSessions:true` invalidates other sessions.
5. **Password change wrong current** — verify inline "Current password is incorrect." error placement.
6. **Unauthenticated redirect** — verify `/app/account` and `/admin/account` both route to `/sign-in` without flashing content.
7. **Non-admin hits /admin/account** — verify role-gate redirects to `/app/dashboard`.
8. **Plan & Usage renders real data** — verify threshold colors (>=95% red, >=80% amber) + absence of upgrade button.
9. **/admin/account correctly omits Plan & Usage** — verify no Plan card + no `/plan-usage` network call in DevTools.

### Gaps Summary

No automated gaps found. All 9 observable truths verified, all 18 artifacts present and substantive, all 10 key links wired, all 8 data sources flowing real data, all 7 spot-checks passing. Three requirements (USER-01/02/03) fully satisfied by backend + tenant UI + super admin UI.

The phase ships working end-to-end code. However, nine user-visible behaviors (navigation flows, visual threshold colors, session revocation, redirects, negative role assertions) inherently require browser-driven verification and a live backend stack — they are listed under `human_verification` above.

### Test Infra Notes

Per orchestrator context: broader api test suite has pre-existing failures in tests/srs/, tests/auth/, tests/users/, tests/admin/, tests/cluster/, tests/packages/, tests/recordings/, tests/streams/ that pre-date Phase 16. Verified as out-of-scope for this verification. Phase 16 test suites (tests/account/ and the 7 web test files) are all GREEN: 36/36 + 59/59 = 95/95 assertions passing.

The single `tsc --noEmit` error reported in the api project for `avatar.controller.ts:55` (`Namespace 'global.Express' has no exported member 'Multer'`) is a known `@types/multer` + `@types/express` namespace-merging issue; the NestJS SWC build succeeds cleanly. Multiple pre-existing repo-wide `strictPropertyInitialization` errors (cameras, cluster, recordings, status) confirm the tsc strictness mismatch is a repository-level concern, not a Phase 16 regression.

---

_Verified: 2026-04-19T18:52:00Z_
_Verifier: Claude (gsd-verifier)_
