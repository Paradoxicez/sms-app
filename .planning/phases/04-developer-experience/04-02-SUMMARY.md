---
phase: 04-developer-experience
plan: 02
subsystem: api
tags: [swagger, openapi, nestjs, batch-api, zod, playback]

# Dependency graph
requires:
  - phase: 03-security-playback
    provides: PlaybackService, PlaybackController, AuthGuard, JWT playback tokens
  - phase: 04-developer-experience/01
    provides: ApiKeysModule, AuthOrApiKeyGuard, ApiKeyGuard
provides:
  - Swagger UI at /api/docs with all controller documentation
  - Batch playback sessions endpoint POST /api/playback/sessions/batch
  - AuthOrApiKeyGuard on playback session endpoints (dual auth)
  - Wave 0 test stubs for batch sessions
affects: [04-developer-experience, frontend-developer-portal]

# Tech tracking
tech-stack:
  added: ["@nestjs/swagger (already installed, now bootstrapped)"]
  patterns: [swagger-decorator-pattern, batch-endpoint-with-partial-errors, dual-auth-guard-on-playback]

key-files:
  created:
    - apps/api/src/playback/dto/batch-sessions.dto.ts
    - apps/api/tests/playback/batch-sessions.test.ts
  modified:
    - apps/api/src/main.ts
    - apps/api/src/cameras/cameras.controller.ts
    - apps/api/src/streams/streams.controller.ts
    - apps/api/src/playback/playback.controller.ts
    - apps/api/src/playback/playback.service.ts
    - apps/api/src/playback/playback.module.ts
    - apps/api/src/policies/policies.controller.ts
    - apps/api/src/settings/settings.controller.ts
    - apps/api/src/admin/admin.controller.ts

key-decisions:
  - "AuthOrApiKeyGuard replaces AuthGuard on session creation endpoints for dual auth support"
  - "Batch endpoint returns partial results (sessions + errors) rather than all-or-nothing"
  - "Internal endpoints (HLS proxy, key serving, preview proxy) excluded from Swagger with @ApiExcludeEndpoint"

patterns-established:
  - "Swagger decorator pattern: @ApiTags on class, @ApiOperation/@ApiResponse on methods, @ApiExcludeEndpoint for internal"
  - "Batch endpoint pattern: Zod schema with max limit, sequential processing, partial error collection"
  - "Dual auth pattern: AuthOrApiKeyGuard on developer-facing endpoints that need both session and API key auth"

requirements-completed: [DEV-02, DEV-05]

# Metrics
duration: 5min
completed: 2026-04-11
---

# Phase 04 Plan 02: Swagger UI & Batch Sessions Summary

**Swagger UI at /api/docs with all 6 controllers documented, batch playback sessions endpoint with max-50 Zod validation, and dual AuthOrApiKeyGuard on session creation endpoints**

## Performance

- **Duration:** 275s (~5 min)
- **Started:** 2026-04-11T18:27:13Z
- **Completed:** 2026-04-11T18:31:48Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Swagger UI bootstrapped at /api/docs with API key and cookie auth schemes, all 6 controllers annotated with @ApiTags, @ApiOperation, @ApiResponse decorators
- Batch playback sessions endpoint at POST /api/playback/sessions/batch with Zod validation (max 50 UUIDs), partial error handling returning { sessions, errors }
- Both session creation endpoints (single and batch) switched to AuthOrApiKeyGuard for dual authentication support (session + API key)
- Wave 0 test stubs created for batch sessions (6 todo tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Swagger bootstrap + decorators on all existing controllers + Wave 0 batch test stubs** - `b155edd` (feat)
2. **Task 2: Batch playback sessions endpoint with AuthOrApiKeyGuard** - `4b6a84d` (feat)

## Files Created/Modified
- `apps/api/src/main.ts` - Swagger bootstrap with DocumentBuilder, API key + cookie auth schemes
- `apps/api/src/cameras/cameras.controller.ts` - @ApiTags('Cameras') + decorators on all 15 endpoints, @ApiExcludeEndpoint on preview proxies
- `apps/api/src/streams/streams.controller.ts` - @ApiTags('Streams') + decorators on start/stop stream
- `apps/api/src/playback/playback.controller.ts` - @ApiTags('Playback'), AuthOrApiKeyGuard on session endpoints, batch endpoint, @ApiExcludeEndpoint on internal
- `apps/api/src/playback/playback.service.ts` - createBatchSessions method with partial error collection
- `apps/api/src/playback/playback.module.ts` - Import ApiKeysModule for AuthOrApiKeyGuard availability
- `apps/api/src/playback/dto/batch-sessions.dto.ts` - BatchSessionsSchema with Zod (UUID array, min 1, max 50)
- `apps/api/src/policies/policies.controller.ts` - @ApiTags('Policies') + decorators on CRUD + resolve
- `apps/api/src/settings/settings.controller.ts` - @ApiTags('Settings') + decorators on system and org settings
- `apps/api/src/admin/admin.controller.ts` - @ApiTags('Admin') + decorator on health check
- `apps/api/tests/playback/batch-sessions.test.ts` - Wave 0 test stubs (6 todos)

## Decisions Made
- AuthOrApiKeyGuard replaces AuthGuard on session creation endpoints -- developers need API key access to create playback sessions programmatically (Blocker 3 fix)
- Batch endpoint returns partial results ({ sessions, errors }) rather than failing entirely when some cameras fail -- better developer experience for multi-camera setups
- Internal endpoints (HLS proxy, key serving, preview proxy) excluded from Swagger with @ApiExcludeEndpoint -- these are infrastructure endpoints not meant for developer consumption

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in status.gateway.ts (TS2564: Property 'server' not initialized) -- out of scope, not caused by this plan's changes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Swagger UI ready for developer portal integration
- Batch sessions endpoint ready for frontend wiring
- All controllers documented for API reference generation

## Self-Check: PASSED

All 11 files verified present. Both task commits (b155edd, 4b6a84d) confirmed in git log.

---
*Phase: 04-developer-experience*
*Completed: 2026-04-11*
