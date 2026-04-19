# Phase 16 — Deferred Items

Items discovered during Phase 16-01 execution that were NOT part of this plan's scope.

## Pre-existing test failures (out of scope for 16-01)

Discovered while running the full `pnpm --filter @sms-platform/api test` suite. Baseline was measured on the commit before any Plan 16-01 changes landed:

- **Baseline (before 16-01):** 12 test files failed, 24 tests failed, 409 passed, 111 todo
- **After 16-01 complete:** same 12 files / 24 tests failed (unchanged), 409 + 36 new passing = 445 passed

The following failing files existed before Phase 16 and should be addressed by a future maintenance plan:

| File | Area | Likely Cause |
|------|------|--------------|
| tests/admin/super-admin.test.ts | auth | Guard + impersonation expectations drifted |
| tests/auth/sign-in.test.ts | auth | Better Auth contract drift |
| tests/cluster/cluster.service.test.ts | cluster | Edge-node lifecycle |
| tests/cluster/load-balancer.test.ts | cluster | Origin fallback routing |
| tests/packages/package-limits.test.ts | packages | Active-package filter |
| tests/recordings/manifest.test.ts | recordings | fMP4 HLS manifest edge cases |
| tests/srs/callbacks.test.ts | srs | Stream-key parser regression |
| tests/srs/config-generator.test.ts | srs | Config template drift |
| tests/srs/on-play-verification.test.ts | srs | JWT / domain verification |

None of these touch `apps/api/src/account/**`, `apps/api/src/recordings/minio.service.ts` (new avatar methods), or `apps/api/src/app.module.ts` (AccountModule import). Phase 16-01 does not regress any of them; they were already failing on `3a8808e`.

## Side findings from Phase 16 UAT (not phase 16 scope)

### Audit log duplicate entries
- `create organization` event logged twice in `AuditLog` (~87ms apart, same orgId/userId/action).
- Discovered during UAT on 2026-04-19 viewing `/app/audit-log` as `demo.viewer@demo.local`.
- Likely cause: audit interceptor firing twice, or org.create hits both the app's controller and a Better Auth org plugin callback.
- Recommend: dedup by (orgId, action, resourceId, createdAt rounded to second), OR fix the double-fire at source.

### Audit log Actor column shows "System" instead of user name
- `userId = 'super-admin-user-id'` is stored in `AuditLog`, but the tenant audit-log UI renders Actor as "System" rather than resolving to `User.name`.
- Recommend: include `User` in the audit-log query response and render `user.name` (or email) when `userId` is set; fall back to "System" only when `userId IS NULL`.
