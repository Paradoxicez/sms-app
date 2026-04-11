---
phase: 04-developer-experience
plan: 01
subsystem: api
tags: [api-keys, sha256, redis, bullmq, nestjs-guards, prisma, ioredis]

# Dependency graph
requires:
  - phase: 02-camera-streaming
    provides: AuthGuard with CLS org context, TENANCY_CLIENT, BullModule.forRoot
  - phase: 01-foundation
    provides: Prisma schema, FeaturesModule with FeatureGuard, FeatureKey enum
provides:
  - ApiKey, ApiKeyUsage, WebhookSubscription, WebhookDelivery Prisma models
  - ApiKeysService with CRUD, SHA-256 hashing, Redis usage tracking
  - ApiKeyGuard for X-API-Key header authentication
  - AuthOrApiKeyGuard for combined session/API key auth
  - ApiKeyUsageMiddleware for per-request bandwidth tracking
  - FeatureGuard CLS orgId fallback for API key auth paths
affects: [04-02, 04-03, 04-04, 04-05, 05-playback-api]

# Tech tracking
tech-stack:
  added: [ioredis direct client for usage tracking]
  patterns: [REDIS_CLIENT symbol provider, fire-and-forget usage recording, BullMQ job scheduler via upsertJobScheduler]

key-files:
  created:
    - apps/api/src/api-keys/api-keys.service.ts
    - apps/api/src/api-keys/api-key.guard.ts
    - apps/api/src/api-keys/auth-or-apikey.guard.ts
    - apps/api/src/api-keys/api-keys.controller.ts
    - apps/api/src/api-keys/api-keys.module.ts
    - apps/api/src/api-keys/api-key-usage.middleware.ts
    - apps/api/src/api-keys/api-key-usage.processor.ts
    - apps/api/src/api-keys/dto/create-api-key.dto.ts
    - apps/api/tests/api-keys/api-keys.test.ts
    - apps/api/tests/api-keys/api-key-guard.test.ts
  modified:
    - apps/api/src/prisma/schema.prisma
    - apps/api/src/features/features.guard.ts
    - apps/api/src/app.module.ts

key-decisions:
  - "REDIS_CLIENT as custom symbol provider injected into ApiKeysService (not using BullMQ's Redis)"
  - "findByHash uses raw PrismaService (not tenancy) for cross-org key lookup during authentication"
  - "BullMQ upsertJobScheduler for repeatable daily aggregation instead of deprecated add with repeat option"

patterns-established:
  - "ApiKeyGuard pattern: hash X-API-Key header with SHA-256, lookup by hash, set CLS ORG_ID"
  - "AuthOrApiKeyGuard pattern: check X-API-Key header first, fall back to session AuthGuard"
  - "Redis INCR usage tracking with pipeline for O(1) fire-and-forget recording"

requirements-completed: [DEV-01]

# Metrics
duration: 5min
completed: 2026-04-12
---

# Phase 4 Plan 1: API Key Management Summary

**API key CRUD with sk_live_ prefix, SHA-256 hash storage, X-API-Key guard, combined auth guard, and Redis usage tracking with daily BullMQ aggregation**

## Performance

- **Duration:** 5 min (297s)
- **Started:** 2026-04-11T18:20:18Z
- **Completed:** 2026-04-11T18:25:15Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- 4 Prisma models (ApiKey, ApiKeyUsage, WebhookSubscription, WebhookDelivery) created and pushed to PostgreSQL
- API key CRUD endpoints at /api/api-keys with sk_live_ prefix, SHA-256 hash-only storage, raw key returned once on creation
- ApiKeyGuard authenticates via X-API-Key header and sets CLS ORG_ID for downstream tenant isolation
- AuthOrApiKeyGuard enables playback endpoints to accept either session cookies or API keys
- FeatureGuard updated to read orgId from CLS (not just params), fixing API key auth compatibility
- Redis-based usage middleware tracks per-request counts and bandwidth with daily BullMQ aggregation to PostgreSQL
- 26 Wave 0 test stubs for API key module recognized by Vitest

## Task Commits

Each task was committed atomically:

1. **Task 0: Wave 0 test stubs** - `efbbe1c` (test)
2. **Task 1: Prisma schema + API key service + guard + AuthOrApiKeyGuard** - `f2f9abf` (feat)
3. **Task 2: API key usage middleware + schema push verification** - `469236a` (feat)

## Files Created/Modified
- `apps/api/src/prisma/schema.prisma` - 4 new Phase 4 models (ApiKey, ApiKeyUsage, WebhookSubscription, WebhookDelivery)
- `apps/api/src/api-keys/api-keys.service.ts` - Key generation (sk_live_ + randomBytes), SHA-256 hashing, CRUD, Redis usage tracking, daily aggregation
- `apps/api/src/api-keys/api-key.guard.ts` - X-API-Key header authentication, CLS ORG_ID injection
- `apps/api/src/api-keys/auth-or-apikey.guard.ts` - Combined guard: API key first, session fallback
- `apps/api/src/api-keys/api-keys.controller.ts` - CRUD endpoints gated by AuthGuard + FeatureKey.API_KEYS
- `apps/api/src/api-keys/api-keys.module.ts` - Module with BullMQ queue, Redis provider, middleware registration
- `apps/api/src/api-keys/api-key-usage.middleware.ts` - Response interception for bandwidth tracking
- `apps/api/src/api-keys/api-key-usage.processor.ts` - BullMQ processor with daily aggregation at 00:05 UTC
- `apps/api/src/api-keys/dto/create-api-key.dto.ts` - Zod schema for key creation
- `apps/api/src/features/features.guard.ts` - Added ClsService injection and CLS orgId fallback
- `apps/api/src/app.module.ts` - Added ApiKeysModule import
- `apps/api/tests/api-keys/api-keys.test.ts` - 16 todo stubs for service and controller
- `apps/api/tests/api-keys/api-key-guard.test.ts` - 10 todo stubs for guards

## Decisions Made
- **REDIS_CLIENT as custom provider**: Created a dedicated ioredis client for usage tracking rather than sharing BullMQ's internal Redis connection, ensuring separation of concerns
- **findByHash uses raw PrismaService**: Cross-org key lookup during authentication cannot go through the tenancy extension (which filters by orgId), so it uses PrismaService directly
- **BullMQ upsertJobScheduler**: Used modern API for repeatable job registration instead of deprecated `add` with repeat options

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript spread argument error in middleware**
- **Found during:** Task 2 (API key usage middleware)
- **Issue:** `res.write` and `res.end` overrides used spread args pattern that TypeScript rejected (TS2556)
- **Fix:** Rewrote using `Function.apply` pattern with proper `this` context binding
- **Files modified:** `apps/api/src/api-keys/api-key-usage.middleware.ts`
- **Verification:** `npx tsc --noEmit` passes with no new errors
- **Committed in:** `469236a` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor TypeScript fix for correct middleware compilation. No scope creep.

## Issues Encountered
- Pre-existing TypeScript error in `status.gateway.ts` (TS2564: Property 'server' not initialized) -- unrelated to our changes, not fixed per scope boundary rules

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API key infrastructure complete, ready for Developer Portal (04-02), Documentation (04-03), Webhooks (04-04)
- AuthOrApiKeyGuard available for playback endpoint integration (04-05)
- WebhookSubscription and WebhookDelivery models ready for webhook implementation (04-04)

---
*Phase: 04-developer-experience*
*Completed: 2026-04-12*

## Self-Check: PASSED

All 10 created files verified present. All 3 task commits verified in git log.
