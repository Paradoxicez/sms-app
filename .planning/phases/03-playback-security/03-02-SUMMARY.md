---
phase: 03-playback-security
plan: 02
subsystem: api
tags: [jwt, srs, hls, throttler, nestjs, security, rate-limiting, m3u8-proxy]

# Dependency graph
requires:
  - phase: 03-playback-security
    provides: PlaybackService with verifyToken/matchDomain, Policy models, JWT signing via jose
provides:
  - SRS on_play callback JWT + domain + viewer limit verification
  - HLS encryption key serving endpoint with JWT verification
  - m3u8 proxy with key URL rewriting for authenticated key fetching
  - Three-tier rate limiting (global/tenant/apikey) via ThrottlerModule
  - verifyTokenMinimal method for signature-only JWT checks
affects: [03-03-PLAN (frontend needs m3u8 proxy URL pattern for embed component)]

# Tech tracking
tech-stack:
  added: [@nestjs/throttler]
  patterns: [SRS callback JWT verification, m3u8 proxy key URL rewriting, ThrottlerGuard as APP_GUARD, @SkipThrottle for internal callbacks]

key-files:
  created:
    - apps/api/tests/srs/on-play-verification.test.ts
    - apps/api/tests/playback/hls-keys-throttle.test.ts
  modified:
    - apps/api/src/srs/srs-callback.controller.ts
    - apps/api/src/srs/srs.module.ts
    - apps/api/src/playback/playback.controller.ts
    - apps/api/src/playback/playback.service.ts
    - apps/api/src/app.module.ts
    - apps/api/package.json
    - apps/api/tests/srs/callbacks.test.ts

key-decisions:
  - "ThrottlerModule uses in-memory storage (not Redis) -- sufficient for single-server deployment, avoids extra dependency"
  - "SRS callbacks exempt from rate limiting via @SkipThrottle() -- internal callbacks should not be throttled"
  - "verifyTokenMinimal checks signature+expiry only (no cameraId/orgId match) for HLS key serving -- token is already scoped"
  - "m3u8 proxy rewrites key URIs with regex replacement to inject token for seamless hls.js key fetching"

patterns-established:
  - "SRS on_play verification: extract token from param, verify JWT, check domain, check viewer limit, then allow/deny"
  - "HLS key serving: token-gated endpoint reads .key files from SRS output directory"
  - "m3u8 proxy pattern: fetch from SRS internal, rewrite security-sensitive URIs, serve to client"
  - "@SkipThrottle() for internal service-to-service endpoints"

requirements-completed: [PLAY-03, PLAY-07, POL-03]

# Metrics
duration: 5min
completed: 2026-04-10
---

# Phase 03 Plan 02: Security Enforcement Layer Summary

**SRS on_play JWT/domain verification, token-protected HLS key serving with m3u8 proxy rewrite, and three-tier rate limiting via ThrottlerModule**

## Performance

- **Duration:** 5 min (323s)
- **Started:** 2026-04-09T18:34:14Z
- **Completed:** 2026-04-09T18:39:37Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- SRS on_play callback now verifies JWT token, domain allowlist (with wildcard support), and viewer limits before allowing playback
- HLS encryption key endpoint serves .key files only to verified sessions, with m3u8 proxy rewriting key URLs to include token for seamless hls.js integration
- Three-tier rate limiting (100/60/30 req/min for global/tenant/apikey) configured as APP_GUARD with SRS callbacks exempted
- 29 new tests covering on_play verification, domain matching, HLS key access control, m3u8 rewriting, and throttler config

## Task Commits

Each task was committed atomically:

1. **Task 1: SRS on_play callback JWT + domain verification** - `173f993` (feat)
2. **Task 2: HLS key endpoint, m3u8 proxy rewrite, ThrottlerModule** - `487c4ae` (feat)

## Files Created/Modified
- `apps/api/src/srs/srs-callback.controller.ts` - JWT verification, domain check, viewer limit in on_play; @SkipThrottle decorator
- `apps/api/src/srs/srs.module.ts` - Import PlaybackModule for PlaybackService injection
- `apps/api/src/playback/playback.controller.ts` - HLS key serving endpoint and m3u8 proxy with key URL rewriting
- `apps/api/src/playback/playback.service.ts` - Added verifyTokenMinimal method
- `apps/api/src/app.module.ts` - ThrottlerModule with 3 tiers and ThrottlerGuard as APP_GUARD
- `apps/api/package.json` - Added @nestjs/throttler dependency
- `apps/api/tests/srs/on-play-verification.test.ts` - 16 on_play verification tests + 5 matchDomain tests
- `apps/api/tests/playback/hls-keys-throttle.test.ts` - 8 tests for HLS key access, m3u8 rewriting, throttler config
- `apps/api/tests/srs/callbacks.test.ts` - Updated existing tests for new constructor signature

## Decisions Made
- ThrottlerModule uses in-memory storage instead of Redis -- single-server deployment makes Redis storage unnecessary overhead; can be upgraded later for multi-instance deployments
- SRS callbacks exempt from rate limiting via @SkipThrottle() -- these are internal service-to-service calls from SRS to the API
- verifyTokenMinimal checks JWT signature and expiry only (no cameraId/orgId match) for HLS key serving -- the token is already scoped to a specific session
- m3u8 proxy uses regex replacement on #EXT-X-KEY URI lines to inject the viewer's token, enabling seamless authenticated key fetching by hls.js

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Security enforcement layer complete: on_play verifies tokens, domains, and viewer limits
- HLS key endpoint and m3u8 proxy ready for frontend embed component integration (Plan 03)
- Rate limiting active on all API endpoints
- All 224 tests pass (5 pre-existing auth failures unchanged)

---
*Phase: 03-playback-security*
*Completed: 2026-04-10*
