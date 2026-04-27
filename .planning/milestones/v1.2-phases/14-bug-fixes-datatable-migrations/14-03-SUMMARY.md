---
phase: 14-bug-fixes-datatable-migrations
plan: 03
subsystem: ui
tags: [react, tanstack-table, datatable, cluster, audit-log]

requires:
  - phase: 14-bug-fixes-datatable-migrations
    provides: DataTable component system and column factory pattern from v1.1
provides:
  - Cluster Nodes DataTable with MetricBar, role/status faceted filters
  - Platform Audit DataTable with Organization column and dynamic org filter
  - Deleted 307-line platform-audit-log-page.tsx manual table
affects: [cluster, audit-log]

tech-stack:
  added: []
  patterns: [conditional column injection via options parameter, dynamic faceted filter from data]

key-files:
  created:
    - apps/web/src/components/cluster/cluster-columns.tsx
    - apps/web/src/components/cluster/cluster-data-table.tsx
  modified:
    - apps/web/src/app/admin/cluster/page.tsx
    - apps/web/src/components/audit/audit-log-columns.tsx
    - apps/web/src/components/audit/audit-log-data-table.tsx
    - apps/web/src/app/admin/audit-log/page.tsx

key-decisions:
  - "Simplified ClusterDataTable by delegating remove confirmation to existing RemoveNodeDialog in parent page"
  - "Used conditional column spread pattern for Organization column to avoid breaking existing tenant audit usage"
  - "Built dynamic org faceted filter from fetched data rather than separate API call"

patterns-established:
  - "Conditional columns: pass options object to column factory, spread array conditionally"
  - "Dynamic faceted filters: derive filter options from fetched data with useMemo"

requirements-completed: [UI-03, UI-04]

duration: 2min
completed: 2026-04-18
---

# Phase 14 Plan 03: Cluster Nodes & Platform Audit DataTable Migration Summary

**Cluster Nodes DataTable with MetricBar/role/status filters, Platform Audit with Organization column and dynamic org filter, 307 lines of manual table code deleted**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-18T12:18:32Z
- **Completed:** 2026-04-18T12:21:03Z
- **Tasks:** 2
- **Files modified:** 8 (2 created, 5 modified, 1 deleted)

## Accomplishments
- Cluster Nodes page migrated to DataTable with MetricBar preserved in CPU/Memory columns, role/status faceted filters, and view/reload/remove quick actions
- Platform Audit page now reuses AuditLogDataTable with conditional Organization column and dynamic org faceted filter
- Deleted platform-audit-log-page.tsx (307 lines of manual table code)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Cluster Nodes page to DataTable with MetricBar** - `dca9579` (feat)
2. **Task 2: Add Organization column/filter to Platform Audit and replace old page** - `51a3559` (feat)

## Files Created/Modified
- `apps/web/src/components/cluster/cluster-columns.tsx` - Cluster column definitions with MetricBar, getMetricColor, role/status badges, filterFn
- `apps/web/src/components/cluster/cluster-data-table.tsx` - Cluster DataTable wrapper with role/status faceted filters
- `apps/web/src/app/admin/cluster/page.tsx` - Updated to use ClusterDataTable instead of NodeTable
- `apps/web/src/components/audit/audit-log-columns.tsx` - Added orgName field and showOrganization option with conditional Organization column
- `apps/web/src/components/audit/audit-log-data-table.tsx` - Added showOrganization prop with dynamic org faceted filter
- `apps/web/src/app/admin/audit-log/page.tsx` - Replaced PlatformAuditLogPage with AuditLogDataTable
- `apps/web/src/components/pages/platform-audit-log-page.tsx` - Deleted (307 lines)
- `apps/web/src/__tests__/date-picker.test.tsx` - Removed test referencing deleted file

## Decisions Made
- Simplified ClusterDataTable by not duplicating RemoveNodeDialog -- parent page already has the dedicated dialog component
- Used conditional column spread pattern (`...options?.showOrganization ? [...] : []`) to avoid breaking existing tenant audit log usage
- Built dynamic org faceted filter from fetched data via useMemo rather than requiring a separate API call

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed stale test referencing deleted file**
- **Found during:** Task 2 (delete platform-audit-log-page.tsx)
- **Issue:** date-picker.test.tsx had a test case reading platform-audit-log-page.tsx which was deleted
- **Fix:** Removed the test case that referenced the deleted file
- **Files modified:** apps/web/src/__tests__/date-picker.test.tsx
- **Verification:** grep confirms no remaining references to deleted file
- **Committed in:** 51a3559 (Task 2 commit)

**2. [Rule 2 - Simplification] Removed duplicate remove dialog from ClusterDataTable**
- **Found during:** Task 1 (Cluster DataTable creation)
- **Issue:** Plan included AlertDialog in ClusterDataTable, but parent page already has RemoveNodeDialog component
- **Fix:** ClusterDataTable delegates onRemoveNode to parent, which uses existing RemoveNodeDialog
- **Verification:** Parent page already wires setRemoveNode to RemoveNodeDialog
- **Committed in:** dca9579 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 simplification)
**Impact on plan:** Both fixes improve correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All DataTable migrations complete (D-04, D-07, D-08)
- Phase 14 complete -- all 3 plans (bug fixes + DataTable migrations) delivered
- Ready for Phase 15+ (FFmpeg resilience, self-service features)

---
*Phase: 14-bug-fixes-datatable-migrations*
*Completed: 2026-04-18*
