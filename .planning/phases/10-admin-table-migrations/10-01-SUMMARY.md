---
phase: 10-admin-table-migrations
plan: 01
subsystem: ui, api
tags: [tanstack-table, data-table, offset-pagination, audit-log, zod, date-fns]

requires:
  - phase: 08-foundation-components
    provides: DataTable component with server-side pagination mode

provides:
  - Server-side offset pagination pattern for audit log API
  - AuditLogDataTable self-fetching component with search, filters, date range
  - Validated server-side DataTable pattern for remaining migrations

affects: [10-02, 10-03, admin-table-migrations]

tech-stack:
  added: []
  patterns:
    - "Server-side DataTable: self-fetching wrapper with apiUrl prop, offset pagination, debounced search"
    - "API offset pagination: { items, totalCount } response with page/pageSize/search query params"
    - "Column factory pattern: createXxxColumns(actions) returns ColumnDef array with injected row actions"

key-files:
  created:
    - apps/web/src/components/audit/audit-log-columns.tsx
    - apps/web/src/components/audit/audit-log-data-table.tsx
  modified:
    - apps/api/src/audit/dto/audit-query.dto.ts
    - apps/api/src/audit/audit.service.ts
    - apps/api/src/admin/admin-audit-log.service.ts
    - apps/web/src/components/pages/tenant-audit-log-page.tsx
    - apps/web/src/app/admin/cameras/[id]/page.tsx

key-decisions:
  - "AuditLogDataTable is self-fetching with apiUrl prop to differentiate tenant vs admin endpoints"
  - "Search uses debounced input (300ms) in custom toolbar slot rather than DataTable searchKey (not functional in server-side mode)"
  - "Admin search pre-queries users by name/email then includes matching userIds in audit WHERE clause"

patterns-established:
  - "Server-side DataTable wrapper: self-fetching component with pagination/filter state, apiUrl prop, custom toolbar for search + date range"
  - "Column factory: createXxxColumns(actions) pattern for reusable column definitions with injectable row actions"
  - "Offset pagination DTO: page/pageSize/search replacing cursor/take pattern"

requirements-completed: [ADMIN-03]

duration: 4min
completed: 2026-04-17
---

# Phase 10 Plan 01: Audit Log Table Migration Summary

**Audit log migrated from cursor-based Load More to DataTable with server-side offset pagination, search, Action filter, DateRangePicker, and View Details dialog**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-17T05:31:27Z
- **Completed:** 2026-04-17T05:35:25Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Backend audit APIs (tenant + admin) converted from cursor to offset pagination returning `{ items, totalCount }`
- New AuditLogDataTable component with server-side pagination, debounced search, Action faceted filter, DateRangePicker, and View Details row action
- Both tenant audit log page and admin camera detail page updated to use the new component
- Old cursor-based AuditLogTable component deleted

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert audit log API from cursor-based to offset pagination** - `4998ffb` (feat)
2. **Task 2: Create audit log DataTable columns and wrapper component** - `17ea3cb` (feat)

## Files Created/Modified
- `apps/api/src/audit/dto/audit-query.dto.ts` - Replaced cursor/take with page/pageSize/search params, zod validation
- `apps/api/src/audit/audit.service.ts` - Tenant audit service with offset pagination, count query, search on resource/ip
- `apps/api/src/admin/admin-audit-log.service.ts` - Admin audit service with offset pagination, user name/email search
- `apps/web/src/components/audit/audit-log-columns.tsx` - Column definitions with action badges, actor display, row actions
- `apps/web/src/components/audit/audit-log-data-table.tsx` - Self-fetching DataTable wrapper with server-side pagination
- `apps/web/src/components/pages/tenant-audit-log-page.tsx` - Simplified to render AuditLogDataTable
- `apps/web/src/app/admin/cameras/[id]/page.tsx` - Activity tab uses AuditLogDataTable

## Decisions Made
- AuditLogDataTable accepts `apiUrl` prop to serve both tenant (`/api/audit-log`) and admin (`/api/admin/audit-log`) endpoints
- Custom search input in toolbar slot with 300ms debounce (DataTable's built-in searchKey doesn't work in server-side mode since manualFiltering is true)
- Admin search pre-queries users table by name/email, then includes matching userIds in the audit log WHERE clause for actor search
- AuditLogRow type matches AuditLog type from audit-detail-dialog.tsx to avoid type incompatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AuditLogRow type mismatch with AuditDetailDialog**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** AuditLogRow was missing `orgId` field and had looser types than AuditLog interface expected by AuditDetailDialog
- **Fix:** Added `orgId` to AuditLogRow and matched field types (action union type, ip as string, details as Record)
- **Files modified:** apps/web/src/components/audit/audit-log-columns.tsx
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 17ea3cb (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type alignment fix required for compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Server-side DataTable pattern validated and ready for reuse in plans 10-02 and 10-03
- Column factory pattern (`createXxxColumns`) established for future table migrations
- Offset pagination DTO pattern ready to apply to other APIs if needed

---
*Phase: 10-admin-table-migrations*
*Completed: 2026-04-17*
