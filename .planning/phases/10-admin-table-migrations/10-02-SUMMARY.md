---
phase: 10-admin-table-migrations
plan: 02
subsystem: ui
tags: [react, tanstack-table, data-table, date-fns, shadcn]

requires:
  - phase: 08-foundation-components
    provides: DataTable, DataTableColumnHeader, DataTableRowActions, DataTableToolbar components
provides:
  - Users DataTable with sortable columns, role faceted filter, search, quick actions
  - API Keys DataTable with sortable columns, status faceted filter, masked key display, quick actions
affects: [admin-users, api-keys, tenant-developer-portal]

tech-stack:
  added: []
  patterns: [column factory with RowAction injection, conditional per-row actions for revoked state]

key-files:
  created:
    - apps/web/src/app/admin/users/components/users-columns.tsx
    - apps/web/src/app/admin/users/components/users-data-table.tsx
    - apps/web/src/components/api-keys/api-keys-columns.tsx
    - apps/web/src/components/api-keys/api-keys-data-table.tsx
  modified:
    - apps/web/src/app/admin/users/page.tsx
    - apps/web/src/components/pages/tenant-developer-api-keys-page.tsx

key-decisions:
  - "API Keys columns use dual action sets (activeActions/revokedActions) for conditional row menus"
  - "Users View details and Edit role use toast placeholders until dialogs are built"

patterns-established:
  - "Column factory pattern: createXxxColumns(actions) returns ColumnDef[] with injected RowAction"
  - "Conditional row actions: pass different action arrays based on row state in cell render"

requirements-completed: [ADMIN-01, ADMIN-02]

duration: 4min
completed: 2026-04-17
---

# Phase 10 Plan 02: Users & API Keys Table Migration Summary

**Users and API Keys tables migrated to DataTable with sortable columns, faceted filters, search, and contextual quick actions**

## Performance

- **Duration:** 225s (~4 min)
- **Started:** 2026-04-17T05:31:49Z
- **Completed:** 2026-04-17T05:35:34Z
- **Tasks:** 2
- **Files modified:** 8 (4 created, 2 modified, 2 deleted)

## Accomplishments
- Users table with Email/Name/Role/Orgs/Last Sign-in columns, role badge colors (red/blue/amber/neutral), relative time display, email search, Role faceted filter, and View details/Edit role/Deactivate quick actions
- API Keys table with Name/Key(masked)/Scope/Created/Last Used/Status columns, status badges (green/red), name search, Status faceted filter, and Copy key/Revoke/Delete actions with conditional menus (revoked keys only show Delete)
- Both tables use client-side pagination via DataTable component
- AlertDialogs preserved for all destructive actions (Deactivate user, Revoke key, Delete key)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Users table to DataTable** - `6c5be38` (feat)
2. **Task 2: Migrate API Keys table to DataTable** - `a28c99f` (feat)

## Files Created/Modified
- `apps/web/src/app/admin/users/components/users-columns.tsx` - Users column definitions with role badges and relative time
- `apps/web/src/app/admin/users/components/users-data-table.tsx` - Users DataTable wrapper with search, filters, deactivate dialog
- `apps/web/src/components/api-keys/api-keys-columns.tsx` - API Keys column definitions with masked key display and status badges
- `apps/web/src/components/api-keys/api-keys-data-table.tsx` - API Keys DataTable wrapper with search, filters, revoke/delete dialogs
- `apps/web/src/app/admin/users/page.tsx` - Updated imports to use new UsersDataTable
- `apps/web/src/components/pages/tenant-developer-api-keys-page.tsx` - Updated imports to use new ApiKeysDataTable
- `apps/web/src/app/admin/users/components/platform-users-table.tsx` - Deleted (replaced by users-columns + users-data-table)
- `apps/web/src/components/api-key-table.tsx` - Deleted (replaced by api-keys/api-keys-columns + api-keys-data-table)

## Decisions Made
- API Keys uses dual action sets pattern (activeActions vs revokedActions) injected into column factory, since RowAction interface doesn't support per-row conditional visibility natively
- Users "View details" and "Edit role" actions use toast placeholders (marked with TODO) since no detail/edit dialogs exist yet

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| users-data-table.tsx | ~87 | View details onClick shows toast | No user detail page exists yet |
| users-data-table.tsx | ~93 | Edit role onClick shows toast | No role edit dialog exists yet |

These stubs do not prevent the plan's goal (DataTable migration) from being achieved. The core deliverable is the table migration, not the action dialog implementations.

## Issues Encountered
- TypeScript compiler (tsc) not initially available in worktree -- resolved by running `pnpm install --frozen-lockfile`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Users and API Keys tables fully migrated to DataTable pattern
- Column factory pattern established for reuse in other table migrations
- Ready for Plan 03 (remaining table migrations)

---
*Phase: 10-admin-table-migrations*
*Completed: 2026-04-17*
