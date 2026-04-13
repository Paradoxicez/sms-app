---
phase: 06-srs-cluster-scaling
plan: 01
subsystem: api
tags: [nestjs, prisma, srs, nginx, cluster, scaling, hls-caching]

# Dependency graph
requires:
  - phase: 02-srs-camera-pipeline
    provides: SrsApiService, SRS integration, SystemSettings model
provides:
  - SrsNode model with ORIGIN/EDGE roles and health metrics
  - ClusterService with CRUD, origin auto-registration, least-loaded selection
  - ClusterController REST API at /api/cluster/nodes
  - Nginx edge config generation with HLS caching proxy
  - SRS origin config generation template
  - Multi-node SrsApiService (accepts nodeApiUrl parameter)
affects: [06-02-PLAN, 06-03-PLAN, health-checks, edge-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: [nginx-hls-caching-proxy, multi-node-srs-api, system-level-prisma-model]

key-files:
  created:
    - apps/api/src/cluster/cluster.module.ts
    - apps/api/src/cluster/cluster.service.ts
    - apps/api/src/cluster/cluster.controller.ts
    - apps/api/src/cluster/dto/create-node.dto.ts
    - apps/api/src/cluster/dto/update-node.dto.ts
    - apps/api/src/cluster/templates/nginx-edge.conf.ts
    - apps/api/src/cluster/templates/srs-origin.conf.ts
    - apps/api/tests/cluster/cluster.service.test.ts
    - apps/api/tests/cluster/config-generation.test.ts
  modified:
    - apps/api/src/prisma/schema.prisma
    - apps/api/src/srs/srs-api.service.ts
    - apps/api/src/app.module.ts

key-decisions:
  - "SrsNode is system-level (no orgId/RLS) -- cluster management is super admin only"
  - "Zod validation for DTOs (consistent with project convention, not class-validator)"
  - "Tests placed in tests/cluster/ matching project vitest convention (not src/__tests__/)"

patterns-established:
  - "System-level Prisma models use PrismaService directly (not tenancy client)"
  - "Config generation via exported template functions for reuse across controllers"
  - "SrsApiService methods accept optional nodeApiUrl for multi-node support"

requirements-completed: [CLUSTER-01, CLUSTER-02, CLUSTER-03]

# Metrics
duration: 7min
completed: 2026-04-13
---

# Phase 06 Plan 01: Cluster Node Management & Config Generation Summary

**SrsNode data model with CRUD API, nginx HLS caching proxy config generation, and multi-node SrsApiService refactor**

## Performance

- **Duration:** 7 min (426s)
- **Started:** 2026-04-13T06:00:11Z
- **Completed:** 2026-04-13T06:07:17Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- SrsNode model in PostgreSQL with NodeRole/NodeStatus enums, health metrics, and config versioning
- ClusterService with full CRUD, origin auto-registration on module init, and least-loaded edge selection
- ClusterController with 8 REST endpoints (list, get, create, update, delete, test, config, reload)
- Nginx edge config template with proxy_cache for m3u8 (10s), segments (60m), key passthrough
- SRS origin config template extracted as reusable function
- SrsApiService refactored to accept optional nodeApiUrl for multi-node operation
- 21 unit tests passing (12 service + 9 config generation)

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema, SrsApiService refactor, ClusterService with tests** - `67766cf` (feat)
2. **Task 2: ClusterController REST API, config generation templates** - `31e67b6` (feat)
3. **Task 3: Schema push to database** - runtime operation, no code commit

## Files Created/Modified
- `apps/api/src/prisma/schema.prisma` - Added SrsNode model, NodeRole/NodeStatus enums
- `apps/api/src/srs/srs-api.service.ts` - Added optional nodeApiUrl parameter to all methods
- `apps/api/src/app.module.ts` - Registered ClusterModule
- `apps/api/src/cluster/cluster.module.ts` - Module with PrismaModule and SrsModule imports
- `apps/api/src/cluster/cluster.service.ts` - CRUD, auto-registration, testConnection, getLeastLoadedEdge
- `apps/api/src/cluster/cluster.controller.ts` - 8 REST endpoints with AuthGuard and Swagger decorators
- `apps/api/src/cluster/dto/create-node.dto.ts` - Zod schema for edge node creation
- `apps/api/src/cluster/dto/update-node.dto.ts` - Zod schema for node updates
- `apps/api/src/cluster/templates/nginx-edge.conf.ts` - Nginx HLS caching proxy config generator
- `apps/api/src/cluster/templates/srs-origin.conf.ts` - SRS origin config generator
- `apps/api/tests/cluster/cluster.service.test.ts` - 12 ClusterService unit tests
- `apps/api/tests/cluster/config-generation.test.ts` - 9 nginx config generation tests

## Decisions Made
- SrsNode is system-level (no orgId, no RLS) -- cluster management is super admin only
- Used Zod for DTO validation consistent with project convention (not class-validator as plan suggested)
- Tests placed in `tests/cluster/` directory matching project vitest config (`tests/**/*.test.ts`)
- Config generation extracted as standalone functions for reuse by both controller and settings service

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test location adjusted to match vitest config**
- **Found during:** Task 1 (test setup)
- **Issue:** Plan specified `src/cluster/__tests__/*.spec.ts` but vitest config only includes `tests/**/*.test.ts`
- **Fix:** Created tests in `tests/cluster/` as `*.test.ts` files instead
- **Files modified:** tests/cluster/cluster.service.test.ts, tests/cluster/config-generation.test.ts
- **Verification:** `npx vitest run tests/cluster/` passes all 21 tests

**2. [Rule 3 - Blocking] DTO validation uses Zod instead of class-validator**
- **Found during:** Task 1 (DTO creation)
- **Issue:** Plan specified class-validator decorators but project uses Zod throughout
- **Fix:** Created Zod schemas matching project convention
- **Files modified:** apps/api/src/cluster/dto/create-node.dto.ts, apps/api/src/cluster/dto/update-node.dto.ts

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both adjustments align with existing project conventions. No scope creep.

## Issues Encountered
- Pre-existing test failures in auth module (Better Auth sign-up tests) -- unrelated to cluster changes, not fixed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SrsNode model and ClusterService ready for health check job (Plan 06-02)
- Config generation templates ready for edge deployment orchestration (Plan 06-03)
- SrsApiService multi-node support enables health polling across cluster nodes

---
*Phase: 06-srs-cluster-scaling*
*Completed: 2026-04-13*
