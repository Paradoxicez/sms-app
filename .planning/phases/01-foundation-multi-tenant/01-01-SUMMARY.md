---
phase: 01-foundation-multi-tenant
plan: 01
subsystem: infra
tags: [nestjs, nextjs, prisma, postgresql, redis, docker, vitest, monorepo]

# Dependency graph
requires: []
provides:
  - NestJS API scaffold with bodyParser disabled (Better Auth ready)
  - Next.js frontend scaffold with standalone output
  - Docker Compose with PostgreSQL 16 + Redis 7
  - Prisma schema with User, Session, Account, Verification, Organization, Member, Invitation, Package, UserPermissionOverride models
  - PrismaService and PrismaModule (global, injectable)
  - RLS infrastructure SQL (app_user role, grants)
  - Vitest test framework with auth and tenancy helpers
affects: [01-02, 01-03, 01-04, all-future-phases]

# Tech tracking
tech-stack:
  added: ["@nestjs/core@11", "@nestjs/config@4", "@nestjs/swagger@11", "prisma@6", "@prisma/client@6", "next@15", "react@19", "vitest@3", "@vitest/coverage-v8@3", "@nestjs/testing"]
  patterns: ["npm workspaces monorepo", "NestJS global module pattern", "Prisma extends PrismaClient service"]

key-files:
  created:
    - apps/api/src/main.ts
    - apps/api/src/app.module.ts
    - apps/api/src/prisma/schema.prisma
    - apps/api/src/prisma/prisma.service.ts
    - apps/api/src/prisma/prisma.module.ts
    - apps/api/src/prisma/rls.policies.sql
    - apps/web/src/app/layout.tsx
    - apps/web/src/app/page.tsx
    - apps/web/next.config.ts
    - docker-compose.yml
    - vitest.config.ts
    - apps/api/vitest.config.ts
    - apps/api/tests/setup.ts
    - apps/api/tests/helpers/auth.ts
    - apps/api/tests/helpers/tenancy.ts
  modified: []

key-decisions:
  - "Prisma 6 instead of Prisma 7 (Node 22.11 < required 22.12 for Prisma 7)"
  - "Vitest 3 instead of Vitest 4 (ESM require() incompatibility with Node 22.11)"
  - "Docker Compose ports 5434:5432 and 6380:6379 to avoid conflicts with local services"

patterns-established:
  - "Monorepo: npm workspaces with apps/api and apps/web"
  - "NestJS: bodyParser false for Better Auth compatibility"
  - "Prisma: PrismaService extends PrismaClient as global injectable"
  - "Testing: Vitest with setup.ts for DB lifecycle, helpers for auth and tenancy"

requirements-completed: [TENANT-01, TENANT-03, TENANT-04]

# Metrics
duration: 8min
completed: 2026-04-09
---

# Phase 01 Plan 01: Monorepo Scaffold Summary

**NestJS + Next.js monorepo with Prisma 6 schema (9 models including Package and UserPermissionOverride), Docker Compose (PostgreSQL 16 + Redis 7), and Vitest test infrastructure**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-09T08:18:11Z
- **Completed:** 2026-04-09T08:26:03Z
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments
- Monorepo with npm workspaces running NestJS API and Next.js frontend, both compiling cleanly
- Complete Prisma schema with all 9 Phase 1 models pushed to PostgreSQL 16 via Docker Compose
- Vitest test infrastructure with auth helpers (createTestUser, createTestSession, createSuperAdmin) and tenancy helpers (createTestOrganization, createTestPackage, cleanupTestData)

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold monorepo with NestJS API + Next.js frontend + Docker Compose** - `8b0b8d7` (feat)
2. **Task 2: Create Prisma schema with all Phase 1 models and push to database** - `f75f249` (feat)
3. **Task 3: Set up Vitest test infrastructure (Wave 0)** - `f21727b` (feat)

## Files Created/Modified
- `package.json` - Root monorepo with npm workspaces
- `docker-compose.yml` - PostgreSQL 16 (port 5434) + Redis 7-alpine (port 6380)
- `.env.example` - Environment variable template
- `.gitignore` - Standard ignores including .env and Prisma generated
- `apps/api/src/main.ts` - NestJS bootstrap with bodyParser: false, CORS enabled
- `apps/api/src/app.module.ts` - Root module importing ConfigModule and PrismaModule
- `apps/api/src/prisma/schema.prisma` - 9 models: User, Session, Account, Verification, Organization, Member, Invitation, Package, UserPermissionOverride
- `apps/api/src/prisma/prisma.service.ts` - Injectable PrismaClient with lifecycle hooks
- `apps/api/src/prisma/prisma.module.ts` - Global module exporting PrismaService
- `apps/api/src/prisma/rls.policies.sql` - RLS infrastructure (app_user role, grants, policy template)
- `apps/web/next.config.ts` - Next.js config with standalone output
- `apps/web/src/app/layout.tsx` - Root layout with html lang="en"
- `apps/web/src/app/page.tsx` - SMS Platform placeholder page
- `vitest.config.ts` - Root Vitest config with workspace projects
- `apps/api/vitest.config.ts` - API Vitest config with setup files
- `apps/api/tests/setup.ts` - Test PrismaClient connection lifecycle
- `apps/api/tests/helpers/auth.ts` - createTestUser, createTestSession, createSuperAdmin
- `apps/api/tests/helpers/tenancy.ts` - createTestOrganization, createTestPackage, cleanupTestData

## Decisions Made
- **Prisma 6 instead of 7:** Node.js 22.11.0 is below Prisma 7's minimum requirement of 22.12+. Prisma 6.19.3 works correctly and provides all needed features.
- **Vitest 3 instead of 4:** Vitest 4 has ESM require() incompatibility with Node 22.11. Vitest 3 runs cleanly.
- **Docker port remapping:** Local PostgreSQL (5432) and Redis (6379) already running. Mapped to 5434 and 6380 respectively.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma 7 incompatible with Node 22.11**
- **Found during:** Task 2 (Prisma schema creation)
- **Issue:** Prisma 7.7.0 requires Node.js 22.12+, but environment has 22.11.0
- **Fix:** Installed Prisma 6.19.3 instead. All schema features work identically.
- **Files modified:** apps/api/package.json, package-lock.json
- **Verification:** `npx prisma validate` and `npx prisma db push` both succeed
- **Committed in:** f75f249

**2. [Rule 3 - Blocking] Vitest 4 ESM incompatibility**
- **Found during:** Task 3 (Vitest setup)
- **Issue:** Vitest 4 uses ESM-only imports incompatible with Node 22.11 CJS resolution
- **Fix:** Downgraded to Vitest 3.2.4 which works correctly
- **Files modified:** package.json, apps/api/package.json, package-lock.json
- **Verification:** `npx vitest run` exits 0
- **Committed in:** f21727b

**3. [Rule 3 - Blocking] Docker Compose port conflicts**
- **Found during:** Task 2 (Docker Compose startup)
- **Issue:** Ports 5432 and 6379 already in use by local PostgreSQL and Redis
- **Fix:** Remapped to 5434:5432 (PostgreSQL) and 6380:6379 (Redis), updated .env and .env.example
- **Files modified:** docker-compose.yml, .env, .env.example
- **Verification:** `docker compose ps` shows both containers healthy
- **Committed in:** f75f249

---

**Total deviations:** 3 auto-fixed (3 blocking issues)
**Impact on plan:** All fixes were necessary to proceed. No scope creep. Functionality equivalent to plan specification with minor version adjustments.

## Issues Encountered
- Prisma CLI requires DATABASE_URL env var. When running from apps/api/, the root .env is not auto-loaded. Must pass DATABASE_URL explicitly or use workspace scripts from root.

## User Setup Required
None - no external service configuration required. Docker Compose provides all infrastructure.

## Next Phase Readiness
- Database schema ready with all Phase 1 models (9 tables created in PostgreSQL)
- PrismaModule globally available for injection in all NestJS modules
- Test helpers ready for auth and tenancy testing scenarios
- Plan 02 (Better Auth integration) can immediately build on this foundation

---
*Phase: 01-foundation-multi-tenant*
*Completed: 2026-04-09*
