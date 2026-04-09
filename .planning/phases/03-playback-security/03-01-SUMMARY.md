---
phase: 03-playback-security
plan: 01
subsystem: api
tags: [jwt, jose, prisma, nestjs, policies, playback, hls, security]

# Dependency graph
requires:
  - phase: 02-camera-streaming
    provides: Camera/Site/Project models, StatusService, AuthGuard, TenancyModule
provides:
  - Policy and PlaybackSession Prisma models with PolicyLevel enum
  - Policy CRUD API with per-field merge resolution (Camera > Site > Project > System)
  - Playback session creation endpoint with JWT-signed HLS URLs
  - JWT verification and domain matching utilities for SRS callback integration
  - System default policy auto-seeded on startup
affects: [03-02-PLAN (SRS callback verification needs verifyToken/matchDomain), 03-03-PLAN (frontend needs policy and session APIs)]

# Tech tracking
tech-stack:
  added: [jose]
  patterns: [per-field policy merge resolution, JWT playback tokens, @Global module for cross-module DI]

key-files:
  created:
    - apps/api/src/policies/policies.service.ts
    - apps/api/src/policies/policies.controller.ts
    - apps/api/src/policies/policies.module.ts
    - apps/api/src/policies/dto/create-policy.dto.ts
    - apps/api/src/policies/dto/update-policy.dto.ts
    - apps/api/src/playback/playback.service.ts
    - apps/api/src/playback/playback.controller.ts
    - apps/api/src/playback/playback.module.ts
    - apps/api/src/playback/dto/create-session.dto.ts
    - apps/api/tests/policies/policies.test.ts
    - apps/api/tests/playback/playback.test.ts
  modified:
    - apps/api/src/prisma/schema.prisma
    - apps/api/src/app.module.ts
    - apps/api/package.json
    - apps/api/tests/helpers/tenancy.ts
    - .env.example

key-decisions:
  - "PoliciesModule is @Global() so PlaybackModule can inject PoliciesService without importing"
  - "Domains field uses Prisma @default([]) -- empty array is a valid override value, not 'inherit'"
  - "JWT_PLAYBACK_SECRET falls back to generated random secret in dev with warning log"
  - "GET /playback/sessions/:id is public (no AuthGuard) for embed page access"

patterns-established:
  - "Policy resolution: per-field merge from Camera > Site > Project > System with priority sorting"
  - "JWT playback tokens: HS256 signed with jose, claims include sub/cam/org/domains/exp"
  - "Session creation: resolve policy snapshot, check viewer limit, create record, sign JWT, return {sessionId, hlsUrl, expiresAt}"

requirements-completed: [PLAY-01, PLAY-02, PLAY-04, PLAY-05, POL-01, POL-02]

# Metrics
duration: 7min
completed: 2026-04-10
---

# Phase 03 Plan 01: Playback Session & Policy Foundation Summary

**Policy CRUD with per-field merge resolution and JWT-signed playback session creation via jose library**

## Performance

- **Duration:** 7 min (440s)
- **Started:** 2026-04-09T18:24:14Z
- **Completed:** 2026-04-09T18:31:34Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Policy and PlaybackSession models added to Prisma schema with PolicyLevel enum and all required relations
- Policy CRUD API with per-field merge resolution correctly merging Camera > Site > Project > System defaults
- System default policy auto-seeded on startup (TTL=7200s, maxViewers=10, domains=[], allowNoReferer=true)
- Playback session creation endpoint returning JWT-signed HLS URLs with viewer concurrency enforcement
- Domain matching utility supporting exact, wildcard (*.example.com), and * patterns
- 21 new tests covering policy resolution, session creation, JWT verification, and domain matching

## Task Commits

Each task was committed atomically:

1. **Task 1: Prisma schema + Policy module with per-field merge resolution** - `668d160` (feat)
2. **Task 2: Playback session creation endpoint with JWT signing** - `fd8d53a` (feat)

## Files Created/Modified
- `apps/api/src/prisma/schema.prisma` - Added PolicyLevel enum, Policy and PlaybackSession models, reverse relations
- `apps/api/src/policies/policies.service.ts` - Policy CRUD and per-field merge resolution with system default seeding
- `apps/api/src/policies/policies.controller.ts` - Policy REST endpoints with Zod validation
- `apps/api/src/policies/policies.module.ts` - @Global module exporting PoliciesService
- `apps/api/src/policies/dto/create-policy.dto.ts` - Zod schema for policy creation
- `apps/api/src/policies/dto/update-policy.dto.ts` - Zod schema for policy updates
- `apps/api/src/playback/playback.service.ts` - Session creation with JWT signing, token verification, domain matching
- `apps/api/src/playback/playback.controller.ts` - POST /cameras/:cameraId/sessions and GET /playback/sessions/:id
- `apps/api/src/playback/playback.module.ts` - PlaybackModule
- `apps/api/src/playback/dto/create-session.dto.ts` - Empty DTO for extensibility
- `apps/api/src/app.module.ts` - Added PoliciesModule and PlaybackModule imports
- `apps/api/package.json` - Added jose dependency
- `apps/api/tests/policies/policies.test.ts` - 6 policy resolution tests
- `apps/api/tests/playback/playback.test.ts` - 15 playback/JWT/domain tests
- `apps/api/tests/helpers/tenancy.ts` - Added PlaybackSession and Policy to cleanup
- `.env.example` - Added JWT_PLAYBACK_SECRET

## Decisions Made
- PoliciesModule is @Global() so PlaybackModule and future SRS callback module can inject PoliciesService without explicit imports
- Domains field always has a value via Prisma @default([]) -- empty array is a valid override meaning "allow all", distinct from null meaning "inherit"
- JWT_PLAYBACK_SECRET falls back to a generated random secret in development with a warning log, avoiding hard failure during dev
- GET /playback/sessions/:id endpoint is public (no AuthGuard) because embed pages need session info without user authentication
- Cannot delete system default policy (BadRequestException guard in remove method)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. JWT_PLAYBACK_SECRET added to .env.example but defaults to auto-generated secret in dev.

## Next Phase Readiness
- PlaybackService.verifyToken() and matchDomain() are ready for Plan 02 (SRS callback verification)
- Policy CRUD and session creation APIs are ready for Plan 03 (frontend integration)
- All 21 tests pass, existing test suite unaffected (5 pre-existing auth failures unchanged)

---
*Phase: 03-playback-security*
*Completed: 2026-04-10*
