# Phase 10: Admin Table Migrations - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate 5 existing admin/utility tables (Users, API Keys, Audit Log, Webhooks, Stream Profiles) to the unified DataTable component built in Phase 8. Each table gets sort, filter, pagination, and contextually appropriate "..." quick actions. Stream profiles converts from card grid to table layout. No new pages or features — only table migrations.

</domain>

<decisions>
## Implementation Decisions

### Users Table
- **D-01:** Quick actions menu: View details, Edit role, Deactivate
- **D-02:** Filters: search + Role faceted filter (following Phase 8 chip pattern)
- **D-03:** Columns: Email, Name, Role (badge), Orgs (count), Last sign-in, Actions

### API Keys Table
- **D-04:** Quick actions menu: Revoke, Copy key, Delete
- **D-05:** Filters: search + Status faceted filter
- **D-06:** Columns: Name, Key (masked prefix...lastFour), Scope, Created (relative), Last Used, Status (badge), Actions

### Audit Log Table
- **D-07:** Quick actions menu: View Details (opens dialog with full log entry)
- **D-08:** Pagination: server-side offset pagination (replacing cursor-based "Load more") — requires adding count query to API
- **D-09:** Filters: search + Action faceted filter + DateRangePicker (Phase 8 component)
- **D-10:** Columns: Timestamp, Actor (name + email), Action (badge), Resource (type + ID), IP Address, Actions

### Webhooks Table
- **D-11:** Quick actions menu: Edit, Toggle active/inactive, Delete, Test webhook (send ping)
- **D-12:** Filters: search + Status faceted filter
- **D-13:** Columns: Name, URL (truncated), Events (colored badges), Status, Actions

### Stream Profiles Table
- **D-14:** Convert from card grid layout to DataTable
- **D-15:** Quick actions menu: Edit, Duplicate, Delete (per HIER-03 requirement)
- **D-16:** Columns: Name, Mode (Passthrough/Transcode badge), Resolution, FPS, Video Bitrate, Audio Bitrate, Actions
- **D-17:** Filters: appropriate to data (Claude's discretion)

### Migration Strategy
- **D-18:** Replace in-place — delete old table component, create new DataTable + column definitions in its place. No side-by-side coexistence.
- **D-19:** Data fetching stays as-is — tables that receive data via props keep receiving props, tables that fetch internally keep fetching internally. Only the UI layer changes to DataTable.
- **D-20:** Column definitions in separate "use client" files per Phase 8 convention (D-02)

### Claude's Discretion
- Exact filter choices per table beyond what's specified above
- Loading skeleton and empty state design per table
- Column widths and responsive behavior
- Stream profiles filter strategy
- Whether to batch-migrate all 5 tables in one plan or split into multiple plans

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### DataTable System (Phase 8)
- `.planning/phases/08-foundation-components/08-CONTEXT.md` — DataTable architecture decisions, column definition pattern, toolbar layout, pagination strategy
- `apps/web/src/components/ui/data-table/` — DataTable component directory (DataTable, DataTableRowActions, DataTableColumnHeader, DataTablePagination, DataTableToolbar, DataTableFacetedFilter)

### Existing Tables (migration sources)
- `apps/web/src/app/admin/users/components/platform-users-table.tsx` — Users table (props-based, Deactivate action)
- `apps/web/src/components/api-key-table.tsx` — API keys table (props-based, Revoke action, status badges)
- `apps/web/src/components/audit/audit-log-table.tsx` — Audit log table (cursor-based pagination, View Details dialog)
- `apps/web/src/components/pages/tenant-developer-webhooks-page.tsx` — Webhooks table (self-fetching, Toggle + Delete actions)
- `apps/web/src/components/pages/tenant-stream-profiles-page.tsx` — Stream profiles cards (self-fetching, Edit + Delete actions)

### Reference Patterns (already migrated or built)
- `apps/web/src/app/admin/packages/components/package-table.tsx` — Has "..." dropdown actions (reference for row actions pattern)
- `apps/web/src/app/admin/organizations/components/org-table.tsx` — Has dropdown actions (reference pattern)

### Requirements
- `.planning/REQUIREMENTS.md` — ADMIN-01 through ADMIN-04 (admin tables), HIER-03 (stream profiles table)

### DatePicker (for Audit Log filter)
- `apps/web/src/components/ui/date-picker.tsx` — DateRangePicker component from Phase 8

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DataTable` component system — full headless table with sort, filter, pagination, row selection, row actions
- `DataTableRowActions` — dropdown pattern with destructive variant support
- `DataTableFacetedFilter` — chip-style faceted filter buttons
- `DataTableToolbar` — composable toolbar with search + filters + action buttons
- `DateRangePicker` — for audit log date filtering
- `Badge` component — colored variants for status, role, action badges
- `DropdownMenu` — for quick actions menus
- `Dialog` — for audit log detail view

### Established Patterns
- Column definitions in separate "use client" files (Phase 8, D-02)
- "..." MoreHorizontal button for row actions (Phase 8, D-03)
- Faceted filter chips — Linear/Vercel style (Phase 8, D-05)
- Filter state in URL query params via useSearchParams (Phase 8, D-06)
- Offset-based numbered pagination (Phase 8, D-07)
- Client-side pagination for small datasets, server-side for large (Phase 8, D-08)
- base-ui render prop pattern (NOT Radix asChild)

### Integration Points
- Each migrated table replaces its existing component file
- Audit log API needs count query added for offset pagination
- Stream profiles page needs layout change from grid to table
- Webhooks test action needs API endpoint (may need backend addition)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- "Redesign camera detail page" todo — belongs to Phase 11 (Camera Management)
- Inline cell editing — explicitly out of scope (REQUIREMENTS.md)
- Export to CSV — not in scope for v1.1
- Real-time auto-refresh — out of scope, Socket.IO targeted updates already exist

</deferred>

---

*Phase: 10-admin-table-migrations*
*Context gathered: 2026-04-17*
