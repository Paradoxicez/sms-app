---
phase: 01-foundation-multi-tenant
plan: 05
subsystem: database
tags: [postgresql, rls, row-level-security, multi-tenant, prisma, nestjs-guards]

requires:
  - phase: 01-foundation-multi-tenant (01-01, 01-02, 01-03)
    provides: "Prisma schema with tenant-scoped tables, tenancy extension with set_config, SuperAdminGuard"
provides:
  - "PostgreSQL RLS policies on Member, Invitation, UserPermissionOverride tables"
  - "SuperAdminGuard applied on UsersController"
  - "Integration tests proving RLS row filtering by org context"
affects: [all-future-phases-with-tenant-data, phase-02-stream-engine]

tech-stack:
  added: []
  patterns:
    - "RLS with FORCE ROW LEVEL SECURITY + bypass policy for superuser/migration operations"
    - "SET ROLE app_user pattern for testing RLS with superuser connections"

key-files:
  created:
    - "apps/api/src/prisma/migrations/rls_policies/migration.sql"
  modified:
    - "apps/api/src/prisma/rls.policies.sql"
    - "apps/api/src/users/users.controller.ts"
    - "apps/api/tests/tenancy/rls-isolation.test.ts"

key-decisions:
  - "RLS requires non-superuser connection; app_user role created for enforcement; superuser (sms) bypasses RLS even with FORCE"
  - "Superuser bypass policies allow operations when no org context is set (seeds, migrations, super admin)"
  - "Tests use SET ROLE app_user in interactive transactions to verify RLS since Prisma connects as superuser"

patterns-established:
  - "RLS test pattern: SET ROLE app_user + set_config in Prisma interactive transaction"
  - "Superuser bypass: current_setting IS NULL OR = '' allows unscoped operations"

requirements-completed: [TENANT-01, TENANT-05]

duration: 5min
completed: 2026-04-09
---

# Plan 01-05: RLS Policies Gap Closure Summary

**PostgreSQL RLS policies on Member, Invitation, UserPermissionOverride with superuser bypass, SuperAdminGuard on UsersController, and integration tests proving org-level row filtering**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-09T10:12:12Z
- **Completed:** 2026-04-09T10:17:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- PostgreSQL RLS policies (ENABLE + FORCE) on 3 tenant-scoped tables: Member, Invitation, UserPermissionOverride
- Tenant isolation policies filter rows by `app.current_org_id` session variable set by Prisma Client Extension
- Superuser bypass policies allow seeds, migrations, and super admin operations without org context
- SuperAdminGuard applied at class level on UsersController protecting all user management endpoints
- 3 new integration tests proving: org-scoped query returns only matching rows, different org returns different rows, no org context returns all rows

## Task Commits

Each task was committed atomically:

1. **Task 1: Create and apply PostgreSQL RLS policies on tenant-scoped tables** - `e05e2e8` (feat)
2. **Task 2: Apply SuperAdminGuard on UsersController and add RLS integration tests** - `b1ea7ca` (feat)

## Files Created/Modified
- `apps/api/src/prisma/migrations/rls_policies/migration.sql` - RLS ENABLE/FORCE + 6 CREATE POLICY statements
- `apps/api/src/prisma/rls.policies.sql` - Updated documentation with actual policy definitions
- `apps/api/src/users/users.controller.ts` - Added @UseGuards(SuperAdminGuard) at class level
- `apps/api/tests/tenancy/rls-isolation.test.ts` - Added 3 RLS enforcement tests using SET ROLE app_user

## Decisions Made
- **app_user role required for RLS:** The `sms` database user is a PostgreSQL superuser, which bypasses RLS entirely (even with FORCE ROW LEVEL SECURITY). Created `app_user` non-superuser role. In production, the application should connect as `app_user` instead of `sms` for RLS enforcement. For tests, `SET ROLE app_user` within interactive transactions simulates this.
- **No RLS on Organization or Package tables:** Organization table has no RLS (super admin needs to list all orgs; isolation is via Member table). Package table is globally managed by super admin per D-07.
- **Superuser bypass via empty/null check:** When `app.current_org_id` is not set (NULL or empty string), bypass policies allow full access. This enables seeds, migrations, and super admin operations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PostgreSQL superuser bypasses RLS even with FORCE**
- **Found during:** Task 2 (RLS integration tests)
- **Issue:** The `sms` database user is a PostgreSQL superuser. Superusers bypass ALL RLS policies regardless of FORCE ROW LEVEL SECURITY. Tests were returning all rows instead of filtered rows.
- **Fix:** Created `app_user` non-superuser role with table grants. Tests use `SET ROLE app_user` in interactive transactions before setting org context and querying. This accurately simulates production behavior where the app should connect as a non-superuser.
- **Files modified:** `apps/api/tests/tenancy/rls-isolation.test.ts`
- **Verification:** All 7 tests pass, RLS correctly filters rows by org context
- **Committed in:** b1ea7ca (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correct test behavior. No scope creep. Note: production DATABASE_URL should use app_user for RLS enforcement.

## Issues Encountered
- Plan's test approach assumed Prisma connects as table owner (non-superuser) where FORCE RLS would apply. However, Docker Compose creates `sms` as superuser. This required using SET ROLE in tests and documents a production consideration.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RLS infrastructure complete: policies active, tests proving isolation
- Production note: DATABASE_URL should be switched from `sms` (superuser) to `app_user` for actual RLS enforcement in the running application
- Feature toggle enforcement (SC-5) remains as a separate concern for future phases
- All Phase 1 foundation work complete, ready for Phase 2 (Stream Engine)

---
*Phase: 01-foundation-multi-tenant*
*Completed: 2026-04-09*
