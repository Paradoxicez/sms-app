# Phase 10: Admin Table Migrations - Research

**Researched:** 2026-04-17
**Domain:** React DataTable migration (TanStack Table + shadcn), NestJS API pagination
**Confidence:** HIGH

## Summary

Phase 10 migrates 5 existing admin/utility tables (Users, API Keys, Audit Log, Webhooks, Stream Profiles) to the unified DataTable component system built in Phase 8. The DataTable component (`apps/web/src/components/ui/data-table/`) is already complete with sort, filter, pagination, faceted filters, row actions, loading skeletons, and empty states. Each migration follows the same pattern: create a `*-columns.tsx` file with column definitions and a `*-data-table.tsx` wrapper that configures toolbar/filters/actions.

The only backend change required is converting the audit log API from cursor-based to offset-based pagination (adding a `count` query and `page`/`pageSize` params). All other tables use client-side pagination with props-based or self-fetching data. Stream profiles requires the most visual change -- converting from a card grid to a table layout.

**Primary recommendation:** Migrate all 5 tables using the established column-definition-per-file pattern from Phase 8. The audit log API change (cursor to offset) should be done first since it's the only backend change and unblocks the audit log table migration.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 to D-03:** Users table -- quick actions (View details, Edit role, Deactivate), filters (search + Role faceted), columns (Email, Name, Role badge, Orgs count, Last sign-in, Actions)
- **D-04 to D-06:** API Keys table -- quick actions (Revoke, Copy key, Delete), filters (search + Status faceted), columns (Name, Key masked, Scope, Created, Last Used, Status badge, Actions)
- **D-07 to D-10:** Audit Log table -- quick actions (View Details dialog), server-side offset pagination with count query, filters (search + Action faceted + DateRangePicker), columns (Timestamp, Actor name+email, Action badge, Resource type+ID, IP Address, Actions)
- **D-11 to D-13:** Webhooks table -- quick actions (Edit, Toggle active/inactive, Delete, Test webhook), filters (search + Status faceted), columns (Name, URL truncated, Events badges, Status, Actions)
- **D-14 to D-17:** Stream Profiles table -- convert from card grid to DataTable, quick actions (Edit, Duplicate, Delete), columns (Name, Mode badge, Resolution, FPS, Video Bitrate, Audio Bitrate, Actions), filters at Claude's discretion
- **D-18:** Replace in-place -- delete old component, create new DataTable + column definitions. No side-by-side coexistence.
- **D-19:** Data fetching stays as-is -- props-based tables keep props, self-fetching tables keep self-fetching. Only UI layer changes.
- **D-20:** Column definitions in separate "use client" files per Phase 8 convention.

### Claude's Discretion
- Exact filter choices per table beyond what's specified
- Loading skeleton and empty state design per table
- Column widths and responsive behavior
- Stream profiles filter strategy
- Whether to batch-migrate all 5 tables in one plan or split into multiple plans

### Deferred Ideas (OUT OF SCOPE)
- Redesign camera detail page (Phase 11)
- Inline cell editing (explicitly out of scope in REQUIREMENTS.md)
- Export to CSV (not in scope for v1.1)
- Real-time auto-refresh (Socket.IO targeted updates already exist)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMIN-01 | User can sort, filter, and paginate users table | DataTable component provides sort/filter/pagination. Column definitions + faceted Role filter implement this. Users page already passes data via props. |
| ADMIN-02 | User can sort, filter, and paginate API keys table | Same DataTable pattern. API keys page passes data via props. Add Status faceted filter. |
| ADMIN-03 | User can sort, filter, and paginate audit log table | Requires backend API change: cursor-based to offset-based pagination with count query. DataTable server-side mode (`pageCount` + `onPaginationChange`) handles the rest. |
| ADMIN-04 | User can sort, filter, and paginate webhooks table | Same DataTable pattern. Webhooks page self-fetches. Add Status faceted filter. |
| HIER-03 | User can view stream profiles in a data table with quick actions (Edit, Duplicate, Delete) | Replace card grid with DataTable. Add Duplicate action (POST to create copy). Mode faceted filter. |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-table | (installed Phase 8) | Headless table engine | Powers DataTable sort, filter, pagination, row selection [VERIFIED: codebase] |
| date-fns | (installed Phase 8) | Date formatting | Used by DateRangePicker and relative time display [VERIFIED: codebase] |
| lucide-react | (installed) | Icons | MoreHorizontal, Trash2, Copy, etc. [VERIFIED: codebase] |
| sonner | (installed) | Toast notifications | Action success/error feedback [VERIFIED: codebase] |
| zod | (installed) | API validation | Audit query DTO validation [VERIFIED: codebase] |
| react-day-picker | (installed Phase 8) | Calendar/date range | DateRangePicker for audit log [VERIFIED: codebase] |

### Supporting (no new installs needed)
No new npm dependencies required. All tooling installed from Phase 8. [VERIFIED: 10-UI-SPEC.md Registry Safety section]

## Architecture Patterns

### File Structure Per Table Migration

```
# Pattern: each table gets 2 new files
{table-dir}/
  {entity}-columns.tsx    # "use client" - ColumnDef[] array + row actions
  {entity}-data-table.tsx # "use client" - DataTable wrapper with toolbar config
```

[VERIFIED: codebase - Phase 8 convention from 10-CONTEXT.md D-20]

### New Files to Create

```
apps/web/src/app/admin/users/components/
  users-columns.tsx
  users-data-table.tsx

apps/web/src/components/api-keys/
  api-keys-columns.tsx
  api-keys-data-table.tsx

apps/web/src/components/audit/
  audit-log-columns.tsx
  audit-log-data-table.tsx

apps/web/src/components/webhooks/
  webhooks-columns.tsx
  webhooks-data-table.tsx

apps/web/src/components/stream-profiles/
  stream-profiles-columns.tsx
  stream-profiles-data-table.tsx
```

[VERIFIED: 10-UI-SPEC.md Component Inventory]

### Files to Delete/Replace

| Old File | Replacement | Data Fetching |
|----------|-------------|---------------|
| `app/admin/users/components/platform-users-table.tsx` | `users-columns.tsx` + `users-data-table.tsx` | Props-based (parent page passes `users` array) |
| `components/api-key-table.tsx` | `api-keys/api-keys-columns.tsx` + `api-keys-data-table.tsx` | Props-based (parent passes `keys` array) |
| `components/audit/audit-log-table.tsx` | `audit/audit-log-columns.tsx` + `audit/audit-log-data-table.tsx` | Server-side pagination (new) |
| `components/pages/tenant-developer-webhooks-page.tsx` | Refactored to use `webhooks/webhooks-columns.tsx` + `webhooks-data-table.tsx` | Self-fetching (keep existing pattern) |
| `components/pages/tenant-stream-profiles-page.tsx` | Refactored to use `stream-profiles/stream-profiles-columns.tsx` + `stream-profiles-data-table.tsx` | Self-fetching (keep existing pattern) |

[VERIFIED: codebase review of all 5 source files]

### Pattern 1: Column Definition File (Client-Side Table)

**What:** Separate "use client" file exporting `ColumnDef[]` with cell renderers and row actions.
**When to use:** All 5 tables.

```typescript
// Source: Established Phase 8 pattern from DataTable component API
"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"

// Define the data type
interface UserRow {
  userId: string
  email: string
  name: string
  role: "admin" | "operator" | "developer" | "viewer"
  orgs: Array<{ id: string; name: string }>
  lastSignInAt?: string | null
}

// Row actions factory - receives callbacks from parent
export function getUserActions(callbacks: {
  onViewDetails: (user: UserRow) => void
  onEditRole: (user: UserRow) => void
  onDeactivate: (user: UserRow) => void
}): RowAction<UserRow>[] {
  return [
    { label: "View details", onClick: callbacks.onViewDetails },
    { label: "Edit role", onClick: callbacks.onEditRole },
    { label: "Deactivate", onClick: callbacks.onDeactivate, variant: "destructive" },
  ]
}

// Column definitions
export const usersColumns: ColumnDef<UserRow, unknown>[] = [
  {
    accessorKey: "email",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
  },
  // ... more columns
  {
    id: "actions",
    cell: ({ row }) => (
      <DataTableRowActions row={row} actions={[/* injected via wrapper */]} />
    ),
  },
]
```

[VERIFIED: DataTableRowActions API from `data-table-row-actions.tsx` - accepts `RowAction<TData>[]` with `label`, `onClick`, `icon?`, `variant?`]

### Pattern 2: DataTable Wrapper (Toolbar Configuration)

**What:** Wrapper component that composes DataTable with table-specific toolbar, faceted filters, and action callbacks.
**When to use:** All 5 tables.

```typescript
// Source: DataTable component API
"use client"

import { DataTable, type FacetedFilterConfig } from "@/components/ui/data-table"

const facetedFilters: FacetedFilterConfig[] = [
  {
    columnId: "role",
    title: "Role",
    options: [
      { label: "Admin", value: "admin" },
      { label: "Operator", value: "operator" },
      { label: "Developer", value: "developer" },
      { label: "Viewer", value: "viewer" },
    ],
  },
]

export function UsersDataTable({ users, onRefetch }: Props) {
  // Column defs with actions bound to callbacks
  const columns = useMemo(() => createUsersColumns({
    onViewDetails: (user) => { /* ... */ },
    onDeactivate: (user) => { setConfirming(user) },
  }), [])

  return (
    <DataTable
      columns={columns}
      data={users}
      searchKey="email"
      searchPlaceholder="Search users..."
      facetedFilters={facetedFilters}
      emptyState={{
        title: "No users found",
        description: "Users will appear here once they are added to the platform.",
      }}
    />
  )
}
```

[VERIFIED: DataTable props from `data-table.tsx` - `searchKey`, `searchPlaceholder`, `facetedFilters`, `emptyState`, `loading`, `pageCount`, `onPaginationChange`]

### Pattern 3: Server-Side Pagination (Audit Log Only)

**What:** DataTable in server-side mode with `pageCount` and `onPaginationChange`.
**When to use:** Audit log table only (large dataset).

```typescript
// DataTable server-side mode
<DataTable
  columns={auditColumns}
  data={entries}
  pageCount={Math.ceil(totalCount / pageSize)}
  onPaginationChange={({ pageIndex, pageSize }) => {
    fetchAuditLogs({ page: pageIndex + 1, pageSize, ...filters })
  }}
  loading={isLoading}
/>
```

[VERIFIED: DataTable component supports `manualPagination`, `manualSorting`, `manualFiltering` when `pageCount` is provided - lines 97-108 of `data-table.tsx`]

### Anti-Patterns to Avoid
- **Putting actions inside column definitions directly:** Actions need callbacks from the parent component. Use a factory function or pass actions through a wrapper, not hardcoded in the column file. [VERIFIED: DataTableRowActions requires onClick callbacks]
- **Mixing old table components with new DataTable:** Decision D-18 requires full replacement, no gradual migration within a single table.
- **Adding `facetedFilters` for columns that don't exist in data:** The faceted filter reads from `column.getFilterValue()` -- the column `accessorKey` must match the filter `columnId`. [VERIFIED: `data-table-faceted-filter.tsx` line 36]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table sorting | Custom sort logic | `DataTableColumnHeader` + TanStack `getSortedRowModel` | Already built, handles multi-column and direction toggling [VERIFIED: codebase] |
| Faceted filters | Custom checkbox filter UI | `DataTableFacetedFilter` component | Chip-style filter with popover, search, clear -- already built [VERIFIED: codebase] |
| Pagination | Custom page controls | `DataTablePagination` component | Numbered pages, rows-per-page selector, ellipsis for large page counts [VERIFIED: codebase] |
| Row action menus | Custom dropdown per table | `DataTableRowActions` component | Separates default/destructive actions with divider, consistent "..." trigger [VERIFIED: codebase] |
| Date range filtering | Custom date inputs | `DateRangePicker` component | Two-month calendar popover, auto-close on range selection [VERIFIED: codebase] |
| Relative time formatting | Custom time-ago function | `date-fns` `formatDistanceToNow` or existing `formatRelativeTime` | Already used in API keys table [VERIFIED: codebase] |
| Masked API key display | Manual string slicing | Existing `prefix...lastFour` pattern from `ApiKey` interface | Data already structured this way from backend [VERIFIED: `api-key-table.tsx`] |

**Key insight:** Phase 8 built the entire DataTable component system. Phase 10 is purely a consumption/migration phase -- no new reusable components need to be created.

## Common Pitfalls

### Pitfall 1: Actions Column with Server-Side Filtering
**What goes wrong:** When DataTable is in server-side mode (`manualFiltering: true`), the `searchKey` filter won't work client-side -- it expects the backend to handle filtering.
**Why it happens:** The DataTable disables `getFilteredRowModel()` when `pageCount` is set.
**How to avoid:** For the audit log table (server-side), wire `searchKey` filter changes to API query params, not just column filter state. The `onPaginationChange` callback fires on pagination changes, but filter changes need separate handling.
**Warning signs:** Search input appears to work but table data doesn't change.

### Pitfall 2: Column Actions Require Stable References
**What goes wrong:** Row action callbacks recreated on every render cause unnecessary re-renders of the entire table.
**Why it happens:** Passing inline arrow functions to `RowAction.onClick`.
**How to avoid:** Use `useCallback` for action handlers or memoize the columns array with `useMemo`.
**Warning signs:** Table flickers on state changes.

### Pitfall 3: Faceted Filter Column Type Mismatch
**What goes wrong:** Faceted filter expects the column value to be a string, but data has different types (boolean for `isActive`, enum for `role`).
**Why it happens:** `DataTableFacetedFilter` uses `Set<string>` for filter values.
**How to avoid:** Use string `accessorKey` values that return strings. For boolean fields like webhook `isActive`, create a computed accessor: `accessorFn: (row) => row.isActive ? "active" : "inactive"`.
**Warning signs:** Filter chips don't match any rows.

### Pitfall 4: Audit Log Pagination API Migration
**What goes wrong:** Frontend expects `{ items, totalCount }` but backend still returns `{ items, nextCursor }`.
**Why it happens:** Backend change (cursor to offset) and frontend change done independently without coordination.
**How to avoid:** Change the backend API first (add `page`, `pageSize`, return `totalCount`), then update the frontend. Both tenant and admin audit log endpoints need updating.
**Warning signs:** Pagination controls show NaN or incorrect page count.

### Pitfall 5: Self-Fetching Tables and DataTable Loading State
**What goes wrong:** The webhooks and stream profiles pages currently manage their own loading/error states. When wrapping in DataTable, the loading state needs to be passed to DataTable's `loading` prop.
**Why it happens:** DataTable expects `loading` prop to show skeleton rows.
**How to avoid:** Keep the self-fetching pattern but pass `loading` state to DataTable.
**Warning signs:** Table shows empty state flash before data loads.

### Pitfall 6: Stream Profiles Duplicate Action Needs Backend
**What goes wrong:** The "Duplicate" quick action (D-15) requires creating a copy of a profile. The current `POST /api/stream-profiles` endpoint may work if all fields are sent, but the name needs "(copy)" suffix.
**Why it happens:** No dedicated duplicate endpoint exists.
**How to avoid:** Reuse the existing create endpoint with profile data + modified name. No new backend endpoint needed.
**Warning signs:** Duplicate fails if required fields are missing.

## Code Examples

### Example 1: Column Definition with Badge and Row Actions

```typescript
// Source: DataTableRowActions API + Badge component from codebase
"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { DataTableColumnHeader } from "@/components/ui/data-table"
import { DataTableRowActions, type RowAction } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: "bg-red-100 text-red-700",
  operator: "bg-blue-100 text-blue-700",
  developer: "bg-amber-100 text-amber-700",
  viewer: "bg-neutral-100 text-neutral-700",
}

// Factory: creates columns with bound action callbacks
export function createUsersColumns(actions: RowAction<UserRow>[]): ColumnDef<UserRow, unknown>[] {
  return [
    {
      accessorKey: "email",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
    },
    {
      accessorKey: "role",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => {
        const role = row.getValue("role") as string
        return (
          <Badge variant="outline" className={ROLE_BADGE_CLASSES[role]}>
            {role}
          </Badge>
        )
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      id: "actions",
      cell: ({ row }) => <DataTableRowActions row={row} actions={actions} />,
    },
  ]
}
```

[VERIFIED: DataTableColumnHeader, DataTableRowActions, Badge APIs from codebase]

### Example 2: Server-Side Audit Log DataTable

```typescript
// Source: DataTable server-side mode from data-table.tsx lines 82-108
"use client"

import { useState, useCallback, useEffect } from "react"
import { type DateRange } from "react-day-picker"
import { DataTable, type FacetedFilterConfig } from "@/components/ui/data-table"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { apiFetch } from "@/lib/api"

const actionFilterConfig: FacetedFilterConfig[] = [
  {
    columnId: "action",
    title: "Action",
    options: [
      { label: "Create", value: "create" },
      { label: "Update", value: "update" },
      { label: "Delete", value: "delete" },
    ],
  },
]

export function AuditLogDataTable() {
  const [data, setData] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 })
  const [dateRange, setDateRange] = useState<DateRange | undefined>()

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(pagination.pageIndex + 1),
      pageSize: String(pagination.pageSize),
    })
    if (dateRange?.from) params.set("dateFrom", dateRange.from.toISOString())
    if (dateRange?.to) {
      const end = new Date(dateRange.to)
      end.setHours(23, 59, 59, 999)
      params.set("dateTo", end.toISOString())
    }
    const res = await apiFetch(`/api/audit-log?${params}`)
    setData(res.items)
    setTotalCount(res.totalCount)
    setLoading(false)
  }, [pagination, dateRange])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <DataTable
      columns={auditLogColumns}
      data={data}
      searchKey="actor"
      searchPlaceholder="Search actor..."
      facetedFilters={actionFilterConfig}
      pageCount={Math.ceil(totalCount / pagination.pageSize)}
      onPaginationChange={setPagination}
      loading={loading}
      toolbar={<DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />}
      emptyState={{
        title: "No audit log entries",
        description: "Activity will be recorded here as users interact with the platform.",
      }}
    />
  )
}
```

[VERIFIED: DataTable `toolbar` prop renders children inside `DataTableToolbar` via `children && <div className="ml-auto">{children}</div>` pattern - line 74 of `data-table-toolbar.tsx`]

### Example 3: Audit Log API Change (Offset Pagination)

```typescript
// Source: Existing audit-query.dto.ts + Prisma count pattern
// Changes to apps/api/src/audit/dto/audit-query.dto.ts
export const auditQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.enum(['create', 'update', 'delete']).optional(),
  resource: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  // Replace cursor-based with offset-based
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(25),
});

// Changes to findAll method return type
async findAll(orgId: string, query: AuditQueryDto): Promise<{
  items: any[];
  totalCount: number;
}> {
  const where = { /* same filter logic */ };
  const skip = (query.page - 1) * query.pageSize;

  const [items, totalCount] = await Promise.all([
    this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.pageSize,
      skip,
    }),
    this.prisma.auditLog.count({ where }),
  ]);

  return { items, totalCount };
}
```

[VERIFIED: Current cursor-based implementation from `audit.service.ts` and `admin-audit-log.service.ts`]

## Existing Code Analysis

### Current State of Each Table

| Table | Current Pattern | Has Sorting | Has Filters | Has Pagination | Actions Pattern |
|-------|----------------|-------------|-------------|----------------|-----------------|
| Users | Manual `<Table>` + `<TableRow>` loop | No | No | No | DropdownMenu (Deactivate only) |
| API Keys | Manual `<Table>` + `<TableRow>` loop | No | No | No | DropdownMenu (Revoke only, hidden when revoked) |
| Audit Log | Manual `<Table>` + cursor "Load more" | No | Select + DatePicker (external) | Cursor-based "Load more" button | Button "View" per row |
| Webhooks | Full page component with self-fetch | No | No | No | DropdownMenu (Delete only) + Switch toggle |
| Stream Profiles | Card grid with self-fetch | No | No | No | Buttons in CardFooter (Edit, Delete) |

[VERIFIED: codebase review of all 5 source files]

### Key Observations

1. **Users table** (`platform-users-table.tsx`): Already has AlertDialog for Deactivate confirmation. The Deactivate handler calls `apiFetch` then `onRefetch()`. This pattern should be preserved in the new wrapper. [VERIFIED: lines 75-97]

2. **API Keys table** (`api-key-table.tsx`): Uses `render` prop on `DropdownMenuTrigger` (base-ui pattern). AlertDialog for Revoke confirmation already exists. The `formatRelativeTime` utility can be extracted and shared. [VERIFIED: lines 52-64, 133-142]

3. **Audit Log**: Two separate pages consume it -- tenant (`/app/audit-log`) and admin (`/admin/audit-log`). Both use the same `AuditLogTable` component and `AuditDetailDialog`. Both need the pagination change. The admin version (`admin-audit-log.service.ts`) does extra user/org name joining. [VERIFIED: codebase]

4. **Webhooks page** (`tenant-developer-webhooks-page.tsx`): This is a full page component that manages its own state (fetch, create dialog, delete dialog, toggle). The migration needs to extract the table portion into the new DataTable wrapper while keeping the page-level create dialog and error handling. [VERIFIED: codebase]

5. **Stream Profiles page** (`tenant-stream-profiles-page.tsx`): Same pattern as webhooks -- full page with state management. Uses `ProfileFormDialog` for create/edit. The "Duplicate" action (D-15) is new and needs to be implemented. [VERIFIED: codebase]

### Backend Changes Required

| Change | File(s) | Impact |
|--------|---------|--------|
| Audit query DTO: replace `cursor`/`take` with `page`/`pageSize` | `apps/api/src/audit/dto/audit-query.dto.ts` | Both tenant and admin controllers use this DTO |
| Audit service: offset pagination + count | `apps/api/src/audit/audit.service.ts` | Return `{ items, totalCount }` instead of `{ items, nextCursor }` |
| Admin audit service: same offset change | `apps/api/src/admin/admin-audit-log.service.ts` | Same change, uses raw Prisma |
| Stream profiles: no change needed | N/A | Duplicate uses existing create endpoint |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/web && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMIN-01 | Users table sort, filter, paginate | unit | `cd apps/web && npx vitest run src/__tests__/users-data-table.test.tsx -x` | Wave 0 |
| ADMIN-02 | API keys table sort, filter, paginate | unit | `cd apps/web && npx vitest run src/__tests__/api-keys-data-table.test.tsx -x` | Wave 0 |
| ADMIN-03 | Audit log table with server-side pagination | unit | `cd apps/web && npx vitest run src/__tests__/audit-log-data-table.test.tsx -x` | Wave 0 |
| ADMIN-04 | Webhooks table sort, filter, paginate | unit | `cd apps/web && npx vitest run src/__tests__/webhooks-data-table.test.tsx -x` | Wave 0 |
| HIER-03 | Stream profiles table with quick actions | unit | `cd apps/web && npx vitest run src/__tests__/stream-profiles-data-table.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/web && npx vitest run --reporter=verbose`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/web/src/__tests__/users-data-table.test.tsx` -- covers ADMIN-01
- [ ] `apps/web/src/__tests__/api-keys-data-table.test.tsx` -- covers ADMIN-02
- [ ] `apps/web/src/__tests__/audit-log-data-table.test.tsx` -- covers ADMIN-03
- [ ] `apps/web/src/__tests__/webhooks-data-table.test.tsx` -- covers ADMIN-04
- [ ] `apps/web/src/__tests__/stream-profiles-data-table.test.tsx` -- covers HIER-03

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A -- no auth changes |
| V3 Session Management | No | N/A -- no session changes |
| V4 Access Control | Minimal | Existing guards (AuthGuard, SuperAdminGuard, FeatureGuard) remain unchanged. No new endpoints except audit log pagination refactor. |
| V5 Input Validation | Yes | Audit query DTO uses zod validation (already in place). New `page`/`pageSize` params validated via zod `z.coerce.number().min(1)` |
| V6 Cryptography | No | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exposure in DOM | Information Disclosure | Key masked as `prefix...lastFour` in table. Full key NOT in DOM. Copy action should fetch from API if needed. [VERIFIED: D-05 from CONTEXT.md, existing pattern in api-key-table.tsx] |
| Audit log data leakage | Information Disclosure | Sensitive keys (password, secret, token) redacted by `sanitizeDetails()` in audit service [VERIFIED: audit.service.ts lines 5-18] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Stream profiles duplicate can reuse existing POST /api/stream-profiles endpoint | Code Examples | LOW -- would need a new endpoint if create rejects duplicate names or requires special handling |
| A2 | Webhooks "Test webhook" action has an existing endpoint or can be added trivially | Common Pitfalls | MEDIUM -- if no test endpoint exists, this action needs backend work beyond this phase |
| A3 | The faceted filter `filterFn` for array columns (like webhook events) works with TanStack's built-in filter model | Architecture Patterns | LOW -- faceted filter uses `Set<string>` which works for single-value columns; array columns may need custom `filterFn` |

## Open Questions (RESOLVED)

1. **Webhooks "Test webhook" endpoint** (RESOLVED -- Plan 03 Task 1 adds TODO fallback with toast placeholder if endpoint missing)
   - What we know: D-11 specifies a "Test webhook (send ping)" action. The existing webhooks API has CRUD but no test/ping endpoint.
   - What's unclear: Whether a `POST /api/webhooks/{id}/test` endpoint already exists or needs to be created.
   - Recommendation: Check for existing endpoint. If missing, add a simple endpoint that sends a test payload to the webhook URL. This is a small backend addition.

2. **Audit log search field scope (server-side)** (RESOLVED -- Plan 01 Task 1 adds `search` param to audit-query.dto.ts with Prisma `contains` on user name/email)
   - What we know: D-09 specifies search filters actor name/email. In server-side mode, search must be sent to the API.
   - What's unclear: Whether to add a `search` param to the audit API that searches across actor name+email, or handle it differently.
   - Recommendation: Add a `search` string param to the audit query DTO that does a Prisma `contains` query on joined user name/email. This is a small addition to the existing query builder.

3. **Admin audit log page vs. tenant audit log page** (RESOLVED -- Plan 01 migrates both pages, admin and tenant, to DataTable)
   - What we know: Both `/admin/audit-log` and `/app/audit-log` use the audit log table. Both use the same DTO.
   - What's unclear: Should both pages be migrated to DataTable, or only the tenant page?
   - Recommendation: Migrate both since they share the same component and both benefit from the DataTable UX. The backend DTO change affects both anyway.

## Sources

### Primary (HIGH confidence)
- Codebase: `apps/web/src/components/ui/data-table/` -- all DataTable component APIs verified by reading source
- Codebase: All 5 source table files read and analyzed
- Codebase: Both audit log services (tenant + admin) read for pagination implementation
- `10-CONTEXT.md` -- all 20 decisions verified as basis for migration strategy
- `10-UI-SPEC.md` -- component inventory, table specifications, interaction contracts

### Secondary (MEDIUM confidence)
- TanStack Table API for server-side mode behavior [ASSUMED based on codebase implementation matching documented pattern]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified in codebase
- Architecture: HIGH -- DataTable component API fully understood from source code
- Migration pattern: HIGH -- clear 1:1 mapping from old tables to new DataTable
- Backend changes: HIGH -- audit log service code reviewed, offset pagination is straightforward Prisma change
- Pitfalls: HIGH -- based on actual component implementation details

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable -- no external dependencies, all internal components)
