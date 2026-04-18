---
phase: 14-bug-fixes-datatable-migrations
plan: 01
subsystem: api, ui
tags: [prisma, rls, nestjs, react, api-keys]

# Dependency graph
requires:
  - phase: 10-admin-table-migrations
    provides: API keys service/controller, data table components
provides:
  - "RLS-safe system org user creation via $transaction + set_config"
  - "API key hard-delete endpoint with cascade cleanup"
  - "Separate PATCH revoke endpoint for soft-revoke"
  - "Enhanced API key create dialog with inline copy and warning per Stripe pattern"
affects: [api-keys, users, admin-portal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RLS context setting via $transaction + set_config for cross-org operations"
    - "Separate endpoints for destructive (DELETE) vs state-change (PATCH revoke) operations"

key-files:
  created: []
  modified:
    - apps/api/src/users/users.service.ts
    - apps/api/src/api-keys/api-keys.service.ts
    - apps/api/src/api-keys/api-keys.controller.ts
    - apps/web/src/components/api-keys/api-keys-data-table.tsx
    - apps/web/src/components/api-key-create-dialog.tsx

key-decisions:
  - "Added separate PATCH :id/revoke endpoint to preserve revoke functionality after DELETE changed to hard-delete"
  - "Used $transaction with set_config for RLS context instead of raw SQL to keep Prisma type safety"

patterns-established:
  - "RLS context pattern: wrap Member INSERT in $transaction with set_config('app.current_org_id', orgId, TRUE)"
  - "Destructive vs state-change: DELETE for permanent removal, PATCH for revocation"

requirements-completed: [FIX-01, FIX-02, FIX-03]

# Metrics
duration: 2min
completed: 2026-04-18
---

# Phase 14 Plan 01: Bug Fixes Summary

**RLS-context transaction for system org user creation, API key hard-delete with separate revoke endpoint, and Stripe-pattern key reveal dialog**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-18T12:18:11Z
- **Completed:** 2026-04-18T12:20:07Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- System org user creation now sets RLS context via $transaction + set_config before Member INSERT
- API key DELETE endpoint performs hard-delete (cascade removes usage records); separate PATCH revoke endpoint added
- Removed misleading "Copy key" action from API keys table that copied masked values
- Enhanced create dialog with inline copy button, AlertTriangle warning icon, and "won't see again" message

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix backend bugs (system org user creation + API key hard delete)** - `62ffd42` (fix)
2. **Task 2: Fix API key copy UX (remove table copy action, enhance create dialog)** - `1167846` (fix)

## Files Created/Modified
- `apps/api/src/users/users.service.ts` - Added $transaction with set_config for RLS context on Member INSERT
- `apps/api/src/api-keys/api-keys.service.ts` - Added delete() method for hard-delete with org scoping
- `apps/api/src/api-keys/api-keys.controller.ts` - Changed DELETE to hard-delete, added PATCH :id/revoke endpoint
- `apps/web/src/components/api-keys/api-keys-data-table.tsx` - Removed Copy key action, updated revoke to PATCH, updated delete dialog copy
- `apps/web/src/components/api-key-create-dialog.tsx` - Inline copy button, AlertTriangle warning, 1500ms timeout

## Decisions Made
- Added separate PATCH :id/revoke endpoint — the original DELETE endpoint was shared for both revoke and delete. Changing DELETE to hard-delete would break revoke functionality. This is a Rule 1 auto-fix (bug prevention).
- Updated frontend revoke handler to use PATCH instead of DELETE to match the new endpoint separation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added separate PATCH revoke endpoint and updated frontend**
- **Found during:** Task 1 (API key hard delete)
- **Issue:** Both revoke and delete actions in the frontend called the same DELETE endpoint. Changing DELETE to hard-delete would break the revoke functionality — revoke should soft-delete (set revokedAt), not permanently remove the record.
- **Fix:** Added PATCH :id/revoke endpoint in controller, updated frontend revoke handler to use PATCH method with /revoke path
- **Files modified:** apps/api/src/api-keys/api-keys.controller.ts, apps/web/src/components/api-keys/api-keys-data-table.tsx
- **Verification:** Controller has both PATCH revoke and DELETE delete endpoints; frontend calls correct methods
- **Committed in:** 62ffd42 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix to prevent breaking existing revoke functionality. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 bugs fixed (FIX-01, FIX-02, FIX-03), unblocking super admin user management and API key operations
- DataTable migration plans (14-02, 14-03) can proceed independently

---
*Phase: 14-bug-fixes-datatable-migrations*
*Completed: 2026-04-18*

## Self-Check: PASSED
