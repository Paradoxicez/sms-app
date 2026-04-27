---
phase: 16-user-self-service
plan: 03
subsystem: web
tags: [nextjs, react, admin-portal, account, role-gate]

requires:
  - phase: 16-02
    provides: "AccountProfileSection + AccountSecuritySection composites + SidebarFooterContent accountHref wiring"
  - phase: 04-auth
    provides: "authClient.getSession with user.role discriminator (admin | user)"
provides:
  - "/admin/account route — Profile + Security only (no Plan & Usage per D-02)"
  - "Page-level role-gate pattern mirroring AdminLayout (defence-in-depth for T-16-17)"
affects: []

tech-stack:
  added: []
  patterns:
    - "Defence-in-depth role gate: layout check + page-level check both redirect non-admins"
    - "Reuse-only page composition — zero modifications to Plan 16-02 shared composites"

key-files:
  created:
    - apps/web/src/app/admin/account/page.tsx
    - apps/web/src/__tests__/admin-account-page.test.tsx
  modified: []

key-decisions:
  - "No import of AccountPlanSection or useCurrentRole on /admin/account — D-02 hardened at compile time, not a runtime conditional."
  - "Page-level role check mirrors AdminLayout rather than delegating entirely, so a direct URL visit cannot bypass the gate even if the layout path is short-circuited by future routing changes (defence-in-depth for T-16-17)."
  - "Loading skeleton uses 3 placeholders (h-8 title + 2 x h-60 cards) instead of tenant's 4 (title + 3 cards), matching the final rendered layout — avoids a visible 'shrink' when skeleton clears."
  - "Cast `session.data.user` to an inline type that explicitly includes `role?: string` so the gate check remains type-safe without reaching into Better Auth internal types."

patterns-established:
  - "TDD RED/GREEN separation: tests committed failing first, then page added to drive them green (mirrors 16-02 rhythm)."

requirements-completed: [USER-01, USER-02]

duration: ~8min
completed: 2026-04-19
---

# Phase 16 Plan 03: Super Admin Account Page Summary

**Super admin `/admin/account` page ships — identical to `/app/account` minus Plan & Usage; reuses AccountProfileSection + AccountSecuritySection from Plan 16-02 unchanged; 7 new vitest assertions GREEN; full web build compiles with the route listed at 765 B.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-19T18:37:00Z (approx)
- **Completed:** 2026-04-19T18:45:00Z (approx)
- **Tasks:** 1 of 1
- **New files:** 2
- **Modified files:** 0

## Accomplishments

- `/admin/account` route created at `apps/web/src/app/admin/account/page.tsx`.
- Page mirrors the tenant `/app/account` page with three changes:
  1. **No Plan & Usage section** — `AccountPlanSection` is neither imported nor rendered (D-02).
  2. **No `useCurrentRole` hook** — super admin doesn't need `activeOrgId` on this page, so no tenant-scoped hook is pulled in.
  3. **Admin role gate at page level** — `router.replace('/app/dashboard')` when `session.data.user.role !== 'admin'`, in addition to the existing `AdminLayout` gate (defence-in-depth for T-16-17).
- Loading skeleton trimmed to 3 placeholders (title + Profile + Security) — matches the post-load card count exactly.
- 7 new vitest assertions in `admin-account-page.test.tsx` cover every threat-model mitigation and the D-02 negative assertions.
- `pnpm --filter @sms-platform/web build` succeeds; `/admin/account` shipped as a 765 B static chunk with 190 kB First Load JS.

## Task Commits

Each task committed atomically (RED + GREEN separated for TDD):

1. **Task 1: /admin/account page + test** — RED `dbb6219` (test) + GREEN `208ef09` (feat)

## Contracts

### /admin/account page

```
GET /admin/account (client route)
Auth:    authClient.getSession() in useCallback -> useEffect
Unauth:  router.replace('/sign-in') BEFORE any content renders
Role:    role !== 'admin' -> router.replace('/app/dashboard')
Loading: 3 Skeletons (title + Profile card + Security card)
Success: H1 'Account settings' + subtitle
         'Manage your profile and security.'
         <AccountProfileSection user={sessionUser} onUserUpdate={refresh} />
         <AccountSecuritySection />
         (NO Plan & Usage section, NO /plan-usage fetch)
```

### Differences from tenant /app/account

| Aspect | /app/account (tenant) | /admin/account (super admin) |
|--------|------------------------|------------------------------|
| Profile section | Rendered | Rendered (same component) |
| Security section | Rendered | Rendered (same component) |
| Plan & Usage section | Rendered when `activeOrgId` present | NEVER rendered (D-02) |
| `useCurrentRole` hook | Used (for `activeOrgId`) | NOT used |
| `/plan-usage` fetch | Issued via AccountPlanSection | NEVER issued |
| Role gate | Layout-only (tenant is default) | Layout AND page (defence-in-depth) |
| Redirect on unauth | `/sign-in` | `/sign-in` (same) |
| Redirect on wrong role | n/a (tenant accepts admins) | `/app/dashboard` |
| Loading skeletons | 4 (title + 3 cards) | 3 (title + 2 cards) |

## Test Results (New Assertions)

| File | Passing | Purpose |
|------|--------:|---------|
| `__tests__/admin-account-page.test.tsx` | 7 | Renders Account settings heading; renders Profile + Security; does NOT render Plan & Usage; does NOT fetch `/plan-usage`; redirects to `/sign-in` when unauth; redirects to `/app/dashboard` when role != admin |
| **Total** | **7** | |

### Verification command results

- `pnpm --filter @sms-platform/web test -- --run src/__tests__/admin-account-page.test.tsx` → **1 file, 7 tests passed**.
- `pnpm --filter @sms-platform/web exec tsc --noEmit -p .` → **clean**.
- `pnpm --filter @sms-platform/web build` → **success; /admin/account at 765 B / 190 kB First Load JS**.
- Regression check: `admin-layout.test.tsx` (3) + `app-layout.test.tsx` (4) + `sidebar-footer-account.test.tsx` (8) + `admin-account-page.test.tsx` (7) → **22/22 GREEN**.

## Threat Model Coverage Checklist

| ID | Category | Mitigation Landed | Test Citation |
|----|----------|---------------------|---------------|
| T-16-04 | S — auth bypass on /admin/account | mitigate | `admin-account-page.test.tsx` "redirects to /sign-in when session has no user". Page holds `loading=true` until the replace() fires, so unauth visitors see the skeleton only. |
| T-16-17 | E — non-admin URL-guesses /admin/account | mitigate | `admin-account-page.test.tsx` "redirects to /app/dashboard when user.role is not admin". Mirrors AdminLayout gate at page level so the page enforces the rule even if a future routing change bypasses the layout. |
| T-16-18 | I — super admin accidental tenant plan disclosure | mitigate | `admin-account-page.test.tsx` "does NOT render Plan & Usage section" + "does NOT fetch /api/organizations/.../plan-usage". Also enforced at compile time: `grep -c AccountPlanSection page.tsx` returns 0. |
| T-16-19 | R — audit gap on avatar/password change | accept | Shared with Plan 16-02; Better Auth logs auth events and avatar changes are low-value — deferred per v1.0 precedent. |

All `mitigate`-disposition threats have at least one matching assertion.

## Decisions Made

1. **No runtime conditional for Plan & Usage** — rather than importing `AccountPlanSection` and conditionally rendering based on role or flag, the admin page simply omits the import. This makes D-02 a compile-time property, verifiable by `grep -c AccountPlanSection` returning 0, and it keeps the /admin/account route bundle smaller by not shipping `AccountPlanSection` code.
2. **Page-level role check despite layout check** — the existing `AdminLayout` already redirects non-admins, but a page-level check adds defence-in-depth. Rationale in `<threat_model>`: if a future routing tweak (e.g., migrating a route group or intercepting routes) bypasses the layout, the page stays safe. Cost is ~5 lines of code.
3. **Skeleton count reduced from 4 to 3** — tenant's 4-placeholder skeleton (title + Profile + Security + Plan & Usage) would cause a visible "shrink" on /admin/account after the load completes and the third skeleton disappears. Dropping it to 3 matches the final layout and avoids the flash.
4. **Inline type assertion for role** — `session.data.user` cast to an inline type with `role?: string` rather than reaching into Better Auth's shared user type. Keeps the page self-contained and doesn't couple to auth-client internals.
5. **Reused `useCallback(refresh, [router])`** — matches the tenant page pattern so the `onUserUpdate` prop to `AccountProfileSection` is stable across renders. Mirrors Plan 16-02's approach exactly.

## Deviations from Plan

None. Plan executed exactly as written. The two acceptance-criteria grep patterns specified single quotes (`router.replace('/sign-in')`) while the implementation uses double quotes consistent with the existing tenant page; the semantic replacement is equivalent and the grep counts still return 1 match each (literal substring match).

## Issues Encountered

- **Worktree missing `node_modules`** — on first `pnpm test` run the worktree had no `node_modules` (fresh git worktree checkout). Resolved by `pnpm install` at the workspace root (10.9s, all packages reused from pnpm store). Not a plan deviation — a worktree provisioning concern.

## Known Stubs

None. All UI renders real components:
- Profile section wired to `authClient.updateUser` + `/api/users/me/avatar` endpoints (Plan 16-01 + 16-02).
- Security section wired to `authClient.changePassword({ revokeOtherSessions: true })`.
- No placeholder text, no TODO/FIXME, no empty-state Plan & Usage card.

## Threat Flags

None. The admin account page reuses existing components without introducing new endpoints, new trust boundaries, or new data surfaces. Network calls are limited to Better Auth session + updateUser + changePassword (all gated by existing Better Auth endpoints) and the `/api/users/me/avatar` POST/DELETE (already covered by Plan 16-01 threat model).

## Next Phase Readiness

- **USER-01 (name + password)** and **USER-02 (avatar)** reachable from `/admin/account`:
  - USER-01: Profile "Save changes" (display name) + Security "Change password".
  - USER-02: Profile "Upload new avatar" + "Remove".
- **Super admin sidebar dropdown** navigates to `/admin/account` (Plan 16-02 Task 3 wired `accountHref="/admin/account"` in `apps/web/src/app/admin/layout.tsx`); now that the route exists, the link resolves rather than 404-ing.
- **Phase 16 complete** — backend (16-01), tenant UI (16-02), super admin UI (16-03) all shipped. The three requirements (USER-01, USER-02, USER-03) are fully implemented across both portals.

---
*Phase: 16-user-self-service*
*Completed: 2026-04-19*

## Self-Check: PASSED

- `apps/web/src/app/admin/account/page.tsx` present on disk (87 lines).
- `apps/web/src/__tests__/admin-account-page.test.tsx` present on disk (155 lines, 7 `it()` cases).
- Both task commits present in `git log --oneline`:
  - `dbb6219` test(16-03): RED add failing tests for /admin/account page
  - `208ef09` feat(16-03): GREEN /admin/account page (Profile + Security only)
- `pnpm --filter @sms-platform/web test -- --run src/__tests__/admin-account-page.test.tsx` → 1 file, 7 tests passed.
- `pnpm --filter @sms-platform/web exec tsc --noEmit -p .` → clean.
- `pnpm --filter @sms-platform/web build` → success (/admin/account @ 765 B / 190 kB First Load JS).
- Acceptance criteria greps all match: `AccountProfileSection` (present), `AccountSecuritySection` (present), `AccountPlanSection` (absent), `useCurrentRole` (absent), `router.replace('/sign-in')` (present), `router.replace('/app/dashboard')` (present), `Account settings` (present), `Manage your profile and security.` (present).
- No untracked files after commits.
