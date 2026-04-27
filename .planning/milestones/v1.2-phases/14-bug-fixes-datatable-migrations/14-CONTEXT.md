# Phase 14: Bug Fixes & DataTable Migrations - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix 3 known bugs (system org user creation, API key copy UX, API key delete) and migrate 4 remaining admin pages to the unified DataTable component system. No new features.

</domain>

<decisions>
## Implementation Decisions

### API Key Behavior
- **D-01:** Fix create dialog to prominently display the real key with copy button + warning "You won't see this key again" (Stripe pattern). Remove copy button from the table since it can only copy masked version.
- **D-02:** Change API key delete from soft-delete (revoke) to hard delete — remove record from DB entirely.

### System Org User Creation
- **D-03:** Super admin can create additional super admin users in the system org. Fix the tenancy-aware Prisma client issue that prevents member creation in system org.

### DataTable Migrations
- **D-04:** Use the same DataTable pattern as v1.1: columns factory function + data-table wrapper component + faceted filters. No deviations.
- **D-05:** Team page: role faceted filter (admin/operator/developer/viewer), quick actions: remove member.
- **D-06:** Organizations page: status faceted filter (Active/Inactive), quick actions: edit, activate/deactivate.
- **D-07:** Cluster Nodes page: role faceted filter (Origin/Edge), status faceted filter, preserve MetricBar for CPU/Memory. Quick actions: view details, reload config, remove.
- **D-08:** Platform Audit page: reuse existing `audit-log-data-table.tsx` component, add organization column/filter for super admin multi-tenant view. Delete old `platform-audit-log-page.tsx`.

### Claude's Discretion
- Column ordering and widths for each table
- Exact filter option labels and styling
- Empty state messages
- Loading skeleton design per table

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### DataTable Component System
- `apps/web/src/components/ui/data-table/data-table.tsx` — Base DataTable component with sorting, filtering, pagination
- `apps/web/src/components/ui/data-table/data-table-toolbar.tsx` — Search + faceted filters toolbar
- `apps/web/src/components/ui/data-table/data-table-pagination.tsx` — Pagination controls
- `apps/web/src/components/ui/data-table/data-table-column-header.tsx` — Sortable column headers
- `apps/web/src/components/ui/data-table/data-table-row-actions.tsx` — Row action dropdown menus
- `apps/web/src/components/ui/data-table/data-table-faceted-filter.tsx` — Multi-select filter UI

### Existing DataTable Implementations (reference patterns)
- `apps/web/src/components/audit/audit-log-data-table.tsx` — Audit log DataTable (reuse for Platform Audit)
- `apps/web/src/components/audit/audit-log-columns.tsx` — Audit log column definitions
- `apps/web/src/components/api-keys/api-keys-data-table.tsx` — API keys DataTable (fix target)
- `apps/web/src/components/api-keys/api-keys-columns.tsx` — API keys column definitions

### Pages to Migrate
- `apps/web/src/app/app/team/components/team-table.tsx` — Current manual Team table (212 lines)
- `apps/web/src/app/admin/organizations/components/org-table.tsx` — Current manual Orgs table (160 lines)
- `apps/web/src/app/admin/cluster/components/node-table.tsx` — Current manual Cluster table (183 lines)
- `apps/web/src/components/pages/platform-audit-log-page.tsx` — Old platform audit (307 lines, to be replaced)

### Bug Fix Targets
- `apps/api/src/users/users.service.ts` — User creation logic (lines 29-72)
- `apps/api/src/auth/guards/org-admin.guard.ts` — Guard that allows super admin bypass
- `apps/api/src/api-keys/api-keys.service.ts` — API key create (lines 35-76), revoke (lines 113-132)
- `apps/api/src/api-keys/api-keys.controller.ts` — Delete endpoint (lines 63-66)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DataTable` component system: fully built with sorting, server-side pagination, faceted filters, row actions, search
- `DataTableColumnHeader`, `DataTableRowActions`, `DataTableFacetedFilter`: composable sub-components
- `audit-log-data-table.tsx`: can be directly reused for Platform Audit with org filter addition
- Existing dialog components for each page (add-team-member, create-org, edit-org, add-node, node-detail, remove-node)

### Established Patterns
- Columns defined via factory function: `createXColumns(actions: RowAction[])` returning `ColumnDef[]`
- Data table wrapper handles fetching, pagination state, search state, filter state
- Row actions use `RowAction<T>` interface with label, icon, onClick, variant
- Faceted filters use `FacetedFilterConfig` with columnId, title, options array
- Super admin pages use `PrismaService` directly (no RLS), tenant pages use `TENANCY_CLIENT`

### Integration Points
- Team page: `GET /api/organizations/:orgId/users` endpoint
- Organizations page: `GET /api/organizations` endpoint (super admin)
- Cluster Nodes page: `useClusterNodes()` custom hook with Socket.IO real-time updates
- Platform Audit: `GET /api/audit-log` endpoint with org filter param for super admin

</code_context>

<specifics>
## Specific Ideas

- API key create dialog should follow Stripe's pattern: show key once, copy button, "won't see again" warning
- Cluster Nodes table must preserve MetricBar visual (CPU/Memory bars with color coding) within DataTable cells

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-bug-fixes-datatable-migrations*
*Context gathered: 2026-04-18*
