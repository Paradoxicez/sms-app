---
phase: 10-admin-table-migrations
plan: 03
subsystem: ui
tags: [react, tanstack-table, data-table, webhooks, stream-profiles]

requires:
  - phase: 08-foundation-components
    provides: DataTable, DataTableRowActions, DataTableColumnHeader, FacetedFilterConfig
provides:
  - Webhooks DataTable with sortable columns, Status faceted filter, and Edit/Toggle/Test/Delete quick actions
  - Stream Profiles DataTable with sortable columns, Mode faceted filter, and Edit/Duplicate/Delete quick actions
  - Duplicate stream profile handler creating copy with "(copy)" suffix
affects: [webhooks, stream-profiles, admin-pages]

tech-stack:
  added: []
  patterns:
    - "Column factory pattern: createXxxColumns(callbacks) returns ColumnDef[] with closure-captured handlers"
    - "DataTable wrapper pattern: XxxDataTable component wraps DataTable with domain-specific faceted filters and empty state"
    - "Dynamic row actions: build RowAction[] per-row in cell function for conditional labels (Enable/Disable)"

key-files:
  created:
    - apps/web/src/components/webhooks/webhooks-columns.tsx
    - apps/web/src/components/webhooks/webhooks-data-table.tsx
    - apps/web/src/components/stream-profiles/stream-profiles-columns.tsx
    - apps/web/src/components/stream-profiles/stream-profiles-data-table.tsx
  modified:
    - apps/web/src/components/pages/tenant-developer-webhooks-page.tsx
    - apps/web/src/components/pages/tenant-stream-profiles-page.tsx

key-decisions:
  - "Webhooks toggle label is dynamic per-row (Disable/Enable) using closure-based action construction"
  - "Test webhook handler calls /api/webhooks/{id}/test with TODO comment for backend endpoint addition"
  - "Stream profile duplicate uses existing POST /api/stream-profiles with name + ' (copy)' suffix"

patterns-established:
  - "Column factory with callbacks: createXxxColumns({ onEdit, onDelete, ... }) for reusable column defs"
  - "Wrapper DataTable component: receives data + handlers as props, memoizes columns, configures filters"

requirements-completed: [ADMIN-04, HIER-03]

duration: 3min
completed: 2026-04-17
---

# Phase 10 Plan 03: Webhooks & Stream Profiles DataTable Migration Summary

**Webhooks and Stream Profiles migrated to DataTable with sortable columns, faceted filters, search, and quick action menus replacing manual table and card grid layouts**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-17T05:32:09Z
- **Completed:** 2026-04-17T05:35:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Webhooks page converted from manual Table to DataTable with Name (sortable), URL (truncated), Events (blue badges), Status (colored badge, filterable), and Actions columns
- Stream Profiles page converted from card grid to DataTable with Name, Mode (filterable), Resolution, FPS, Video Bitrate, Audio Bitrate columns
- Webhooks quick actions: Edit, Toggle (dynamic Enable/Disable label), Test webhook, Delete
- Stream Profiles quick actions: Edit, Duplicate (creates copy with "(copy)" suffix), Delete
- Both tables have search-by-name and faceted filtering (Status for webhooks, Mode for profiles)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Webhooks table to DataTable** - `685a2a6` (feat)
2. **Task 2: Migrate Stream Profiles from card grid to DataTable** - `5935b22` (feat)

## Files Created/Modified
- `apps/web/src/components/webhooks/webhooks-columns.tsx` - Webhook column definitions with WebhookRow interface, status/event badge styling, 4 quick actions
- `apps/web/src/components/webhooks/webhooks-data-table.tsx` - Webhooks DataTable wrapper with Status faceted filter and name search
- `apps/web/src/components/stream-profiles/stream-profiles-columns.tsx` - Stream profile column definitions with StreamProfileRow interface, mode badge styling, 3 quick actions
- `apps/web/src/components/stream-profiles/stream-profiles-data-table.tsx` - Stream profiles DataTable wrapper with Mode faceted filter and name search
- `apps/web/src/components/pages/tenant-developer-webhooks-page.tsx` - Refactored to use WebhooksDataTable, added handleToggle/handleTest/handleEdit handlers, removed manual Table markup
- `apps/web/src/components/pages/tenant-stream-profiles-page.tsx` - Refactored to use StreamProfilesDataTable, added handleDuplicate handler, removed card grid layout

## Decisions Made
- Webhooks toggle uses dynamic label per-row (Disable/Enable) built via closure in column cell function
- Test webhook endpoint (/api/webhooks/{id}/test) may not exist yet -- added TODO comment with graceful error handling
- Stream profile duplicate reuses existing POST /api/stream-profiles endpoint with name suffixed "(copy)" and isDefault forced to false

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Webhooks and Stream Profiles DataTable migrations complete
- Both follow the same column factory + wrapper pattern established in Plans 01/02
- Backend may need /api/webhooks/{id}/test endpoint for the Test webhook action (documented as TODO)

## Self-Check: PASSED

- All 7 files verified present on disk
- Both task commits (685a2a6, 5935b22) verified in git log
- Old table/card markup confirmed removed from page components
- New DataTable components confirmed imported and used
- handleDuplicate and "Profile duplicated" toast confirmed present

---
*Phase: 10-admin-table-migrations*
*Completed: 2026-04-17*
