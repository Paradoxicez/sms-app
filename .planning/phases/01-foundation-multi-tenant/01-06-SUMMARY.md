---
phase: 01-foundation-multi-tenant
plan: 06
subsystem: api
tags: [nestjs, feature-toggles, guards, react-hooks, multi-tenant]

requires:
  - phase: 01-foundation-multi-tenant (01-03)
    provides: "Package model with JSONB features field, Organization with packageId relation"
provides:
  - "FeaturesService with checkFeature(orgId, key) and getOrgFeatures(orgId)"
  - "FeatureGuard + RequireFeature decorator for route-level feature gating"
  - "GET /api/organizations/:orgId/features endpoint for frontend consumption"
  - "useFeatures React hook with isEnabled(key) helper for UI gating"
  - "apiFetch shared fetch helper for frontend API calls"
affects: [phase-02-stream-engine, all-feature-gated-endpoints]

tech-stack:
  added: []
  patterns:
    - "RequireFeature(FeatureKey.X) decorator + FeatureGuard for endpoint-level feature gating"
    - "useFeatures(orgId) hook pattern for frontend feature visibility"
    - "apiFetch<T> generic fetch helper with credentials: include"

key-files:
  created:
    - "apps/api/src/features/feature-key.enum.ts"
    - "apps/api/src/features/features.service.ts"
    - "apps/api/src/features/features.guard.ts"
    - "apps/api/src/features/features.controller.ts"
    - "apps/api/src/features/features.module.ts"
    - "apps/web/src/lib/api.ts"
    - "apps/web/src/hooks/use-features.ts"
  modified:
    - "apps/api/src/app.module.ts"
    - "apps/api/tests/packages/feature-toggles.test.ts"

key-decisions:
  - "FeaturesModule is @Global() so FeatureGuard and FeaturesService are available across all modules without explicit imports"
  - "Features endpoint protected by SuperAdminGuard initially; will switch to OrgMemberGuard when org-level auth is added"
  - "FeatureKey enum defines known features but JSONB field accepts any key for forward compatibility"

patterns-established:
  - "RequireFeature decorator + FeatureGuard: apply @RequireFeature(FeatureKey.X) and @UseGuards(FeatureGuard) on any endpoint"
  - "Frontend feature gating: useFeatures(orgId).isEnabled('key') for conditional UI rendering"

requirements-completed: [TENANT-04]

duration: 2min
completed: 2026-04-09
---

# Plan 01-06: Feature Toggle Enforcement Summary

**FeaturesService + FeatureGuard for backend enforcement, GET /api/organizations/:orgId/features endpoint, useFeatures React hook for frontend UI gating**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-09T10:19:18Z
- **Completed:** 2026-04-09T10:21:06Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- FeaturesService reads org's package.features JSONB to check/list enabled features
- FeatureGuard + RequireFeature decorator enables per-endpoint feature gating on any NestJS route
- GET /api/organizations/:orgId/features endpoint returns org's feature map (protected by SuperAdminGuard)
- useFeatures React hook fetches, caches, and exposes isEnabled(key) helper for frontend UI gating
- apiFetch shared helper centralizes API call patterns with credentials
- 5 new integration tests proving checkFeature and getOrgFeatures correctness (enabled, disabled, unknown, all features, no package)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create FeaturesService, FeatureGuard, and features API endpoint** - `3b34b78` (feat)
2. **Task 2: Add frontend useFeatures hook and feature enforcement integration tests** - `c89da7c` (feat)

## Files Created/Modified
- `apps/api/src/features/feature-key.enum.ts` - Known feature key constants (recordings, webhooks, map, auditLog, apiKeys)
- `apps/api/src/features/features.service.ts` - FeaturesService with checkFeature() and getOrgFeatures()
- `apps/api/src/features/features.guard.ts` - FeatureGuard + RequireFeature decorator for route protection
- `apps/api/src/features/features.controller.ts` - GET /api/organizations/:orgId/features endpoint
- `apps/api/src/features/features.module.ts` - Global module exporting FeaturesService and FeatureGuard
- `apps/api/src/app.module.ts` - Added FeaturesModule import
- `apps/web/src/lib/api.ts` - Shared apiFetch helper with credentials
- `apps/web/src/hooks/use-features.ts` - useFeatures React hook with isEnabled() helper
- `apps/api/tests/packages/feature-toggles.test.ts` - 5 new enforcement tests added

## Decisions Made
- FeaturesModule marked @Global() for universal availability across all modules
- Features endpoint uses SuperAdminGuard as interim protection until org-level auth guards are implemented
- FeatureKey enum provides type safety for known features while JSONB remains flexible for future additions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Feature toggle enforcement layer complete: backend guards + frontend hooks ready
- Any future endpoint can be feature-gated with @RequireFeature(FeatureKey.X) + @UseGuards(FeatureGuard)
- Frontend components can conditionally render with useFeatures(orgId).isEnabled('key')
- Phase 1 foundation fully complete: auth, multi-tenant, RLS, packages, feature toggles all operational

---
*Phase: 01-foundation-multi-tenant*
*Completed: 2026-04-09*
