---
phase: 06-srs-cluster-scaling
plan: 02
subsystem: api
tags: [nestjs, bullmq, socket.io, health-check, load-balancer, cluster, hls-caching]

# Dependency graph
requires:
  - phase: 06-srs-cluster-scaling
    provides: SrsNode model, ClusterService CRUD, SrsApiService multi-node, ClusterModule
provides:
  - ClusterHealthService with BullMQ 10s health polling and 3-miss OFFLINE threshold
  - ClusterHealthProcessor (BullMQ worker) for repeatable health check jobs
  - ClusterGateway (Socket.IO /cluster-status) for node:health and node:status broadcasts
  - Playback session routing to least-loaded edge with origin fallback
  - Settings propagation with configVersion increment across all nodes
affects: [06-03-PLAN, dashboard-monitoring, edge-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: [bullmq-repeatable-health-check, socket-io-admin-broadcast, edge-routing-with-fallback]

key-files:
  created:
    - apps/api/src/cluster/cluster-health.service.ts
    - apps/api/src/cluster/cluster-health.processor.ts
    - apps/api/src/cluster/cluster.gateway.ts
    - apps/api/tests/cluster/health-check.test.ts
    - apps/api/tests/cluster/load-balancer.test.ts
  modified:
    - apps/api/src/cluster/cluster.module.ts
    - apps/api/src/cluster/cluster.service.ts
    - apps/api/src/playback/playback.service.ts
    - apps/api/src/playback/playback.module.ts
    - apps/api/src/settings/settings.service.ts
    - apps/api/src/settings/settings.module.ts

key-decisions:
  - "Tests in tests/cluster/ matching vitest convention (not src/__tests__/ as plan suggested)"
  - "Edge health check uses /health + /nginx_status fetch with 5s timeout"
  - "CONNECTING status treated same as DEGRADED/OFFLINE for auto-recovery to ONLINE"

patterns-established:
  - "BullMQ repeatable jobs for periodic health checks with per-node scheduling"
  - "Socket.IO gateway per subsystem (/cluster-status separate from /camera-status)"
  - "Edge routing fallback pattern: getLeastLoadedEdge() || origin URL"

requirements-completed: [CLUSTER-04, CLUSTER-05]

# Metrics
duration: 5min
completed: 2026-04-13
---

# Phase 06 Plan 02: Health Monitoring & Playback Routing Summary

**BullMQ health polling with 3-miss OFFLINE threshold, auto-recovery, edge-routed playback sessions with origin fallback, and Socket.IO status broadcasting**

## Performance

- **Duration:** 5 min (316s)
- **Started:** 2026-04-13T06:10:11Z
- **Completed:** 2026-04-13T06:15:27Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- ClusterHealthService with checkNode: polls SRS API (origin) or nginx endpoints (edge), tracks missedChecks with 3-miss OFFLINE threshold, auto-recovers to ONLINE
- ClusterHealthProcessor (BullMQ) runs health checks every 10 seconds per node via repeatable jobs
- ClusterGateway (Socket.IO /cluster-status) broadcasts node:health on every check, node:status only on status change
- PlaybackService routes sessions to least-loaded edge via ClusterService.getLeastLoadedEdge(), falls back to origin
- SettingsService propagates config changes: reloads origin SRS + increments configVersion on all nodes
- 18 new unit tests (14 health-check + 4 load-balancer), all 39 cluster tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Health monitoring (ClusterHealthService, BullMQ processor, ClusterGateway, tests)** - `455ff97` (feat)
2. **Task 2: Playback routing to edges, settings propagation, load balancer tests** - `4d69d61` (feat)

## Files Created/Modified
- `apps/api/src/cluster/cluster-health.service.ts` - Health check logic with 3-miss threshold, auto-recovery, BullMQ job management
- `apps/api/src/cluster/cluster-health.processor.ts` - BullMQ processor extending WorkerHost for health polling
- `apps/api/src/cluster/cluster.gateway.ts` - Socket.IO gateway (/cluster-status) for node health/status broadcasts
- `apps/api/src/cluster/cluster.module.ts` - Added BullModule.registerQueue, health providers, gateway
- `apps/api/src/cluster/cluster.service.ts` - Added incrementConfigVersion method
- `apps/api/src/playback/playback.service.ts` - Edge routing via getLeastLoadedEdge with origin fallback
- `apps/api/src/playback/playback.module.ts` - Import ClusterModule for ClusterService DI
- `apps/api/src/settings/settings.service.ts` - Config propagation to edges with incrementConfigVersion
- `apps/api/src/settings/settings.module.ts` - Import ClusterModule for ClusterService DI
- `apps/api/tests/cluster/health-check.test.ts` - 14 health check tests
- `apps/api/tests/cluster/load-balancer.test.ts` - 4 load balancer tests

## Decisions Made
- Tests placed in `tests/cluster/` matching project vitest config convention (plan suggested `src/__tests__/`)
- CONNECTING status auto-transitions to ONLINE on first successful health check (not just OFFLINE/DEGRADED)
- Edge health check uses dual-endpoint approach: /health for liveness, /nginx_status for viewer count

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test location adjusted to match vitest config**
- **Found during:** Task 1 (test setup)
- **Issue:** Plan specified `src/cluster/__tests__/*.spec.ts` but vitest config only includes `tests/**/*.test.ts`
- **Fix:** Created tests in `tests/cluster/` as `*.test.ts` files instead
- **Files modified:** tests/cluster/health-check.test.ts, tests/cluster/load-balancer.test.ts
- **Verification:** `npx vitest run tests/cluster/` passes all 39 tests

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test location adjusted to match existing vitest convention. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Health monitoring and playback routing operational for Plan 06-03 (edge deployment orchestration)
- ClusterHealthService exported from ClusterModule for use by deployment flows
- Socket.IO /cluster-status namespace ready for dashboard frontend integration

---
*Phase: 06-srs-cluster-scaling*
*Completed: 2026-04-13*
