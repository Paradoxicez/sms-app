---
phase: 14-bug-fixes-datatable-migrations
plan: 02
subsystem: ui
tags: [react, tanstack-table, datatable, shadcn]

requires:
  - phase: 13-datatable-component-system
    provides: DataTable component, FacetedFilterConfig, DataTableRowActions, ColumnDef factory pattern
provides:
  - Team page DataTable with role faceted filter and remove member action
  - Organizations page DataTable with status faceted filter and edit/activate/deactivate actions
  - Reusable team-columns and org-columns factory functions
affects: [14-bug-fixes-datatable-migrations]

tech-stack:
  added: []
  patterns: [column factory with actions injection, DataTable wrapper with confirmation dialogs]

key-files:
  created:
    - apps/web/src/components/team/team-columns.tsx
    - apps/web/src/components/team/team-data-table.tsx
    - apps/web/src/components/organizations/org-columns.tsx
    - apps/web/src/components/organizations/org-data-table.tsx
  modified:
    - apps/web/src/app/app/team/page.tsx
    - apps/web/src/app/admin/organizations/page.tsx

key-decisions:
  - "Used variant='destructive' on AlertDialogAction instead of className for consistency with existing codebase pattern"
  - "Removed cameraCount from OrgRow since API does not provide it; kept packageName column from original table"
  - "Preserved original dialog copy (audit-log entries stay intact) for remove member confirmation"

patterns-established:
  - "Column factory pattern: createXxxColumns(actions, ...params) returns ColumnDef[] with injected row actions"
  - "DataTable wrapper pattern: XxxDataTable component owns state for confirmation dialogs and API calls"

requirements-completed: [UI-01, UI-02]

duration: 2min
completed: 2026-04-18
---

# Phase 14 Plan 02: Team & Organizations DataTable Migration Summary

**Migrated Team and Organizations pages from manual Table to unified DataTable with sorting, faceted filters, pagination, and row actions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-18T12:18:34Z
- **Completed:** 2026-04-18T12:21:02Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Team page now uses DataTable with role faceted filter (Admin/Operator/Developer/Viewer), name search, column sorting, and remove member action with confirmation dialog
- Self-removal prevention preserved: logged-in user's row has no action menu (T-14-03 mitigation)
- Organizations page now uses DataTable with status faceted filter (Active/Inactive), name search, column sorting, and edit/activate/deactivate actions
- Deactivate action requires confirmation dialog; activate executes immediately
- Replaced ~370 lines of manual table code with standardized DataTable pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Team page to DataTable (D-04, D-05)** - `0eca9c9` (feat)
2. **Task 2: Migrate Organizations page to DataTable (D-04, D-06)** - `6c07000` (feat)

## Files Created/Modified
- `apps/web/src/components/team/team-columns.tsx` - Team column definitions with createTeamColumns factory, role badges, isSelf action guard
- `apps/web/src/components/team/team-data-table.tsx` - TeamDataTable wrapper with remove member dialog and role faceted filter
- `apps/web/src/components/organizations/org-columns.tsx` - Organization column definitions with createOrgColumns factory, status badges, package column
- `apps/web/src/components/organizations/org-data-table.tsx` - OrgDataTable wrapper with deactivate confirmation dialog and status faceted filter
- `apps/web/src/app/app/team/page.tsx` - Updated to import TeamDataTable instead of manual TeamTable
- `apps/web/src/app/admin/organizations/page.tsx` - Updated to import OrgDataTable with OrgRow mapping from API data

## Decisions Made
- Used `variant="destructive"` on AlertDialogAction for consistency with existing codebase pattern (team-table.tsx used this approach)
- Removed `cameraCount` from OrgRow interface since the organizations API endpoint does not return camera count data
- Added `packageName` column to org DataTable to preserve parity with original manual table
- Preserved original dialog copy from team-table.tsx for remove member confirmation (audit-log mention)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added packageName column to org-columns.tsx**
- **Found during:** Task 2 (Organizations DataTable)
- **Issue:** Plan's OrgRow included cameraCount but omitted packageName; original table had Package column but no camera count
- **Fix:** Removed cameraCount (not in API), added packageName column with Badge display matching original table
- **Files modified:** apps/web/src/components/organizations/org-columns.tsx
- **Verification:** Column renders package name as Badge or "None" text
- **Committed in:** 6c07000

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Column adjustment necessary to match actual API data and preserve original table features. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Team and Organizations pages now use unified DataTable pattern
- Old manual table files (team-table.tsx, org-table.tsx) kept for reference but no longer imported
- Ready for remaining DataTable migrations (Cluster Nodes, Platform Audit) in Plan 03

---
*Phase: 14-bug-fixes-datatable-migrations*
*Completed: 2026-04-18*
