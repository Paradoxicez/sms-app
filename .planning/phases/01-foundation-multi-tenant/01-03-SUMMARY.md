---
phase: 01-foundation-multi-tenant
plan: 03
subsystem: management-api
tags: [packages, organizations, users, crud, super-admin, rbac, zod, nestjs]

# Dependency graph
requires: [01-01, 01-02]
provides:
  - PackagesService with CRUD + JSONB feature toggles (super admin only)
  - OrganizationsService with CRUD + package assignment + System org protection
  - UsersService with invitation, direct user creation, role management, last-admin guard
  - AdminModule umbrella importing PackagesModule + OrganizationsModule
  - Zod validation DTOs for all management endpoints
  - 21 tests across 4 test files covering packages, organizations, and users
affects: [01-04, all-future-phases]

# Tech tracking
tech-stack:
  added: ["zod@3"]
  patterns: ["Zod safeParse validation in controllers", "Service-level business logic with Prisma", "Feature merge pattern for JSONB updates"]

key-files:
  created:
    - apps/api/src/packages/packages.module.ts
    - apps/api/src/packages/packages.service.ts
    - apps/api/src/packages/packages.controller.ts
    - apps/api/src/packages/dto/create-package.dto.ts
    - apps/api/src/packages/dto/update-package.dto.ts
    - apps/api/src/organizations/organizations.module.ts
    - apps/api/src/organizations/organizations.service.ts
    - apps/api/src/organizations/organizations.controller.ts
    - apps/api/src/organizations/dto/create-organization.dto.ts
    - apps/api/src/admin/admin.module.ts
    - apps/api/src/admin/admin.controller.ts
    - apps/api/src/users/users.module.ts
    - apps/api/src/users/users.service.ts
    - apps/api/src/users/users.controller.ts
    - apps/api/src/users/dto/invite-user.dto.ts
    - apps/api/src/users/dto/create-user.dto.ts
    - apps/api/tests/packages/package-limits.test.ts
    - apps/api/tests/packages/feature-toggles.test.ts
    - apps/api/tests/admin/org-management.test.ts
    - apps/api/tests/users/org-user-management.test.ts
  modified:
    - apps/api/src/app.module.ts
    - apps/api/package.json

key-decisions:
  - "Zod safeParse in controllers for request validation (not NestJS pipes)"
  - "Feature merge pattern: spread existing + new features to avoid replacing JSONB"
  - "AdminModule as umbrella module importing PackagesModule + OrganizationsModule"
  - "UsersController not guarded by SuperAdminGuard (org-scoped, needs OrgRoles guard in future)"
  - "Direct user creation stores sha256 password hash; Better Auth handles its own auth flow"

patterns-established:
  - "Controller pattern: Zod safeParse -> BadRequestException on failure -> service call"
  - "Service pattern: Prisma injection, findOne with NotFoundException, soft-delete via isActive"
  - "Feature merge: { ...existing.features, ...dto.features } for JSONB partial updates"
  - "Test pattern: Direct service instantiation with testPrisma, beforeEach/afterEach cleanup"

requirements-completed: [AUTH-04, TENANT-02, TENANT-03, TENANT-04, TENANT-05]

# Metrics
duration: 6min
completed: 2026-04-09
---

# Phase 01 Plan 03: Package, Organization, and User Management APIs Summary

**Package CRUD with JSONB feature toggles, organization management with System org protection, and user invitation/creation with last-admin guard -- 21 new tests, all 47 total tests passing**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-09T08:38:17Z
- **Completed:** 2026-04-09T08:44:04Z
- **Tasks:** 3
- **Files created:** 20
- **Files modified:** 2

## Accomplishments

- Package CRUD API at `/api/admin/packages` with SuperAdminGuard, Zod validation for limits (maxCameras/maxViewers/maxBandwidthMbps/maxStorageGb), and JSONB feature toggles with merge-on-update pattern
- Organization management API at `/api/admin/organizations` with SuperAdminGuard, package assignment, and System org protection (cannot deactivate slug=system)
- User management API at `/api/organizations/:orgId/users` with invitation flow (7-day expiry), direct user creation (with account + membership), role management, and last-admin removal protection
- AdminModule umbrella aggregating PackagesModule + OrganizationsModule for clean module structure
- 21 new tests across 4 test files; all 47 tests in the suite pass

## Task Commits

1. **Task 1: Package CRUD API + tests (super admin only)** - `4916f04` (feat)
2. **Task 2: Organization management API + admin module + tests** - `fe39c01` (feat)
3. **Task 3: User management API (invitation + direct creation within org)** - `b3f3664` (feat)

## Files Created/Modified

- `apps/api/src/packages/dto/create-package.dto.ts` - Zod schema: name, maxCameras/Viewers/Bandwidth/Storage, features
- `apps/api/src/packages/dto/update-package.dto.ts` - Partial of CreatePackageSchema
- `apps/api/src/packages/packages.service.ts` - create/findAll/findOne/update/deactivate with feature merge
- `apps/api/src/packages/packages.controller.ts` - @Controller('admin/packages') with SuperAdminGuard
- `apps/api/src/packages/packages.module.ts` - Module exporting PackagesService
- `apps/api/src/organizations/dto/create-organization.dto.ts` - Zod schema: name, slug (regex), packageId
- `apps/api/src/organizations/organizations.service.ts` - CRUD + deactivate (System org protected) + assignPackage
- `apps/api/src/organizations/organizations.controller.ts` - @Controller('admin/organizations') with SuperAdminGuard
- `apps/api/src/organizations/organizations.module.ts` - Module exporting OrganizationsService
- `apps/api/src/admin/admin.module.ts` - Umbrella module importing Packages + Organizations
- `apps/api/src/admin/admin.controller.ts` - Health check endpoint for admin
- `apps/api/src/users/dto/invite-user.dto.ts` - Zod schema: email, role enum (admin/operator/developer/viewer)
- `apps/api/src/users/dto/create-user.dto.ts` - Zod schema: email, name, password (min 8, max 128), role enum
- `apps/api/src/users/users.service.ts` - inviteUser/createUser/listMembers/updateRole/removeMember
- `apps/api/src/users/users.controller.ts` - @Controller('organizations/:orgId/users')
- `apps/api/src/users/users.module.ts` - Module exporting UsersService
- `apps/api/src/app.module.ts` - Updated with AdminModule + UsersModule
- `apps/api/package.json` - Added zod@3 dependency
- `apps/api/tests/packages/package-limits.test.ts` - 5 tests: create, validation, update, deactivate, list active
- `apps/api/tests/packages/feature-toggles.test.ts` - 3 tests: create with features, merge, default empty
- `apps/api/tests/admin/org-management.test.ts` - 6 tests: create, assign package, deactivate, system protection, list, findOne
- `apps/api/tests/users/org-user-management.test.ts` - 7 tests: invite, create, list, update role, last admin, remove, validate

## Decisions Made

- **Zod over NestJS pipes:** Used Zod safeParse directly in controllers for consistency with existing patterns and better error messages
- **Feature merge pattern:** JSONB features use spread operator merge (`{...existing, ...new}`) so partial updates don't replace the entire object
- **AdminModule umbrella:** Created AdminModule importing both PackagesModule and OrganizationsModule for cleaner AppModule structure
- **UsersController unguarded at org level:** Controller does not use SuperAdminGuard since it's org-scoped; needs OrgRoles("admin") guard which will be built in Plan 04 or during integration
- **Password hashing for direct creation:** Used sha256 as placeholder; Better Auth handles its own credential flow for normal sign-in

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing zod dependency**
- **Found during:** Task 1 (DTO creation)
- **Issue:** zod was listed in CLAUDE.md recommended stack but not yet installed
- **Fix:** Installed zod@3 as dependency in apps/api
- **Files modified:** apps/api/package.json, package-lock.json
- **Commit:** 4916f04

**2. [Rule 1 - Bug] Test require() incompatible with Vitest ESM transform**
- **Found during:** Task 1 (test execution)
- **Issue:** Using `require()` in tests to load DTO schemas fails because Vitest uses ESM transforms
- **Fix:** Changed to static ES import at top of test files
- **Files modified:** apps/api/tests/packages/package-limits.test.ts, apps/api/tests/users/org-user-management.test.ts
- **Commit:** 4916f04, b3f3664

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Minimal. All acceptance criteria met. No scope creep.

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| apps/api/src/users/users.service.ts | 47 | sha256 password hash instead of bcrypt/scrypt | Direct user creation uses simple hash; Better Auth handles normal auth flow. Should be migrated to Better Auth's internal createUser API when available. |
| apps/api/src/users/users.controller.ts | 14 | No OrgRoles guard | Controller comment notes SuperAdminGuard is not used; needs org-level authorization guard from Plan 04. |
| apps/api/src/auth/auth.config.ts | 39 | sendInvitationEmail is a console.log stub | Email service not yet implemented; will be wired in a future phase. |

## Next Phase Readiness

- Package CRUD ready for use by organization management and limit enforcement
- Organization management ready for multi-tenant operations
- User management ready for invitation flow and direct creation
- All management endpoints protected by SuperAdminGuard (packages, orgs) or ready for org-level guards (users)
- Plan 04 (API keys + final integration) can build on this management layer

---
*Phase: 01-foundation-multi-tenant*
*Completed: 2026-04-09*
