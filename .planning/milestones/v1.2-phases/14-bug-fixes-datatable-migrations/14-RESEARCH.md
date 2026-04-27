# Phase 14: Bug Fixes & DataTable Migrations - Research

**Researched:** 2026-04-18
**Domain:** NestJS backend bug fixes + React/TanStack Table frontend migrations
**Confidence:** HIGH

## Summary

Phase 14 addresses 3 backend bugs and 4 frontend DataTable migrations. All work is well-scoped: bugs have clear root causes in existing code, and DataTable migrations follow an established pattern already used in API Keys and Audit Log pages.

The 3 bugs are: (1) system org user creation fails due to RLS policy blocking INSERT on the Member table when `UsersService` uses raw `PrismaService` without setting `app.current_org_id`, (2) API key "Copy" action in the table copies a masked value because the full key is never stored/available after creation, and (3) API key "Delete" endpoint actually calls `revoke()` (soft-delete) instead of truly deleting the record. The 4 DataTable migrations (Team, Organizations, Cluster Nodes, Platform Audit) replace manual `<Table>` implementations with the unified `DataTable` component system.

**Primary recommendation:** Fix bugs first (backend changes are prerequisites for correct UI behavior), then migrate tables one at a time following the existing `api-keys-columns.tsx` + `api-keys-data-table.tsx` pattern exactly.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Fix create dialog to prominently display the real key with copy button + warning "You won't see this key again" (Stripe pattern). Remove copy button from the table since it can only copy masked version.
- **D-02:** Change API key delete from soft-delete (revoke) to hard delete -- remove record from DB entirely.
- **D-03:** Super admin can create additional super admin users in the system org. Fix the tenancy-aware Prisma client issue that prevents member creation in system org.
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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIX-01 | Super admin can create user for system org | Bug analysis: `UsersService` uses raw `PrismaService` but RLS FORCE is on `Member` table. Fix: use `PrismaService` with `set_config` for org context, or use the tenancy client with explicit orgId |
| FIX-02 | API Key copy returns actual key, not masked | Already partially implemented in `api-key-create-dialog.tsx` reveal view. Fix: remove misleading "Copy key" from table row actions |
| FIX-03 | API Key delete works | Controller calls `revoke()` instead of a real delete. Fix: add `delete()` method to service, change controller to call it |
| UI-01 | Team page uses DataTable | Replace `team-table.tsx` (212 lines) with columns factory + DataTable wrapper pattern |
| UI-02 | Organizations page uses DataTable | Replace `org-table.tsx` (160 lines) with columns factory + DataTable wrapper pattern |
| UI-03 | Cluster Nodes page uses DataTable | Replace `node-table.tsx` (183 lines) with columns factory + DataTable wrapper, preserve MetricBar |
| UI-04 | Platform Audit page uses DataTable | Extend `audit-log-data-table.tsx` with org column/filter, replace `platform-audit-log-page.tsx` (307 lines) |
</phase_requirements>

## Standard Stack

No new libraries needed. This phase uses only existing project dependencies.

### Core (already installed)
| Library | Purpose | Used For |
|---------|---------|----------|
| `@tanstack/react-table` | Table state management | All DataTable implementations |
| `@prisma/client` | Database access | Bug fixes (FIX-01, FIX-03) |
| `sonner` | Toast notifications | Success/error feedback |
| `lucide-react` | Icons | Row actions, empty states |
| `date-fns` | Date formatting | Column cell renderers |
| `zod` | Validation | Request body validation |

[VERIFIED: codebase grep -- all libraries already in use]

## Architecture Patterns

### Pattern 1: DataTable Migration Pattern (ESTABLISHED)

Every DataTable migration follows this exact file structure. [VERIFIED: existing `api-keys-columns.tsx` + `api-keys-data-table.tsx`]

**File structure per table:**
```
components/{feature}/
  {feature}-columns.tsx      # Column definitions via factory function
  {feature}-data-table.tsx   # Wrapper with state, actions, dialogs
```

**Column factory function signature:**
```typescript
// Source: apps/web/src/components/api-keys/api-keys-columns.tsx
export function create{Feature}Columns(
  actions: RowAction<{RowType}>[]
): ColumnDef<{RowType}, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue("name")}</span>
      ),
    },
    // ... more columns
    {
      id: "actions",
      cell: ({ row }) => <DataTableRowActions row={row} actions={actions} />,
    },
  ]
}
```

**Data table wrapper pattern:**
```typescript
// Source: apps/web/src/components/api-keys/api-keys-data-table.tsx
export function {Feature}DataTable({ data, onRefresh }: Props) {
  const [targetItem, setTargetItem] = useState<RowType | null>(null)
  
  const actions: RowAction<RowType>[] = useMemo(() => [...], [])
  const columns = useMemo(() => createColumns(actions), [actions])
  
  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        searchKey="name"
        searchPlaceholder="Filter..."
        facetedFilters={FILTERS}
        emptyState={{ title: "...", description: "..." }}
      />
      <AlertDialog ...>  {/* Confirmation dialogs */}
      </AlertDialog>
    </>
  )
}
```

### Pattern 2: Faceted Filter Configuration

```typescript
// Source: apps/web/src/components/api-keys/api-keys-data-table.tsx
const facetedFilters: FacetedFilterConfig[] = [
  {
    columnId: "status",
    title: "Status",
    options: [
      { label: "Active", value: "active" },
      { label: "Revoked", value: "revoked" },
    ],
  },
]
```

The column definition MUST include a matching `filterFn` for client-side filtering:
```typescript
{
  id: "status",
  accessorFn: (row) => row.isActive ? "active" : "inactive",
  filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
}
```

### Pattern 3: Server-Side vs Client-Side DataTable

The DataTable supports both modes: [VERIFIED: `data-table.tsx` lines 82-111]

- **Client-side** (Team, Orgs, Cluster Nodes): Pass `data` array only. DataTable handles sorting/filtering/pagination internally.
- **Server-side** (Platform Audit): Pass `pageCount`, `onPaginationChange`, `onColumnFiltersChange`. DataTable sets `manualPagination`, `manualSorting`, `manualFiltering`.

Team, Orgs, and Cluster Nodes currently fetch all data at once (no server-side pagination), so they should use **client-side mode**. Platform Audit uses **server-side mode** (paginated API with `page` + `pageSize` params).

### Anti-Patterns to Avoid
- **Mixing raw `<Table>` with `DataTable`:** Never build manual table markup when DataTable exists. Every table must use the DataTable component system. [VERIFIED: this is exactly what the migration fixes]
- **Copy action for masked keys:** Never expose a "Copy" action that copies a masked/partial value. The full key is only available at creation time. [VERIFIED: FIX-02]
- **Soft-delete masquerading as delete:** The current "Delete" button calls `revoke()`. Real delete must remove the DB record. [VERIFIED: FIX-03]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Table sorting/filtering/pagination | Manual `<Table>` with useState | `DataTable` component | Already built, handles all state consistently |
| Column header sort indicators | Custom sort icons | `DataTableColumnHeader` | Consistent sort UX across all tables |
| Row action menus | Custom `DropdownMenu` per table | `DataTableRowActions` + `RowAction<T>` | Type-safe, consistent 3-dot menu pattern |
| Faceted multi-select filters | Custom filter dropdowns | `DataTableFacetedFilter` + `FacetedFilterConfig` | Badge counts, clear filters, consistent styling |
| Confirmation dialogs | Custom modal markup | `AlertDialog` from shadcn | Accessible, consistent destructive action pattern |

## Common Pitfalls

### Pitfall 1: RLS WITH CHECK on Member Table (FIX-01)
**What goes wrong:** `UsersService.createUser()` uses raw `PrismaService` to INSERT into `Member` table. The `Member` table has `FORCE ROW LEVEL SECURITY`. The `superuser_bypass_member` policy has a USING clause (which also serves as WITH CHECK in PostgreSQL) that allows access when `app.current_org_id` IS NULL or empty. However, if the database session already has `app.current_org_id` set from a previous transaction in the same connection, the bypass may not trigger.
**Why it happens:** The `PrismaService` is a raw `PrismaClient` that does NOT call `set_config('app.current_org_id', ...)` before queries. When a super admin calls this endpoint, the `OrgAdminGuard` passes (super admin bypass), but the `UsersService` never sets the RLS context. If Prisma's connection pool reuses a connection where `app.current_org_id` was set by a previous tenant request, the INSERT may fail because the previous org context leaks.
**How to avoid:** Explicitly set `app.current_org_id` to the target orgId before the Member INSERT, using either the tenancy client or a raw `$executeRaw` call. Alternatively, wrap the INSERT in a transaction that first calls `set_config`.
**Warning signs:** "new row violates row-level security policy" error in Prisma, or member creation works intermittently (depends on connection pool state).

### Pitfall 2: API Key Delete Cascade
**What goes wrong:** Hard-deleting an API key may fail if `ApiKeyUsage` records have a foreign key to `ApiKey.id`.
**Why it happens:** Decision D-02 changes from soft-delete (revokedAt timestamp) to hard DELETE. The `ApiKeyUsage` table likely has a foreign key constraint.
**How to avoid:** Check the Prisma schema for cascade rules on `ApiKeyUsage.apiKeyId`. If no cascade, add `onDelete: Cascade` to the relation, or delete usage records first.
**Warning signs:** Foreign key constraint violation error on DELETE.

### Pitfall 3: Cluster Nodes DataTable with Real-Time Updates
**What goes wrong:** The `useClusterNodes()` hook updates `nodes` array via Socket.IO events. If the DataTable holds internal state (sorting, filtering) and the data changes underneath, row selection or scroll position may reset.
**Why it happens:** TanStack Table re-renders when `data` prop changes. With real-time updates every few seconds, the table re-renders frequently.
**How to avoid:** Use stable row IDs (`getRowId: (row) => row.id` in table config). The DataTable component already handles this correctly -- just ensure `data` array reference changes only when actual data changes (React.useMemo if needed).
**Warning signs:** Table flickering, filter/sort state resetting on real-time updates.

### Pitfall 4: Platform Audit -- Organization Filter Requires API Change
**What goes wrong:** The Platform Audit page (D-08) needs an Organization column and faceted filter. The current `GET /api/admin/audit-log` endpoint may not return `orgName` or support `orgId` filter parameter.
**Why it happens:** The existing `audit-log-data-table.tsx` was built for org-scoped audit (not platform-wide).
**How to avoid:** Verify the admin audit-log endpoint returns organization data. If not, add `orgName` to the API response and `orgId` filter parameter.
**Warning signs:** Organization column shows "Unknown" for all entries.

### Pitfall 5: Self-Remove Prevention in Team Table
**What goes wrong:** The current `team-table.tsx` has logic to hide the action menu for the current user (`isSelf` check). This must be preserved in the DataTable migration.
**Why it happens:** Easy to forget when migrating to the new pattern.
**How to avoid:** Pass `currentUserId` to the DataTable wrapper and conditionally hide/disable the "Remove" action for the logged-in user's row.
**Warning signs:** Admin can remove themselves, breaking their own access.

## Code Examples

### FIX-01: System Org User Creation Fix

The root cause is that `UsersService` uses `PrismaService` (raw client) for the `Member` INSERT, but the `Member` table has FORCE RLS. The fix:

```typescript
// In UsersService.createUser(), wrap Member creation with RLS context
// Source: analysis of apps/api/src/users/users.service.ts + rls.policies.sql
async createUser(orgId: string, dto: CreateUserDto) {
  const userId = randomUUID();

  // User and Account tables don't have RLS -- PrismaService works fine
  const user = await this.prisma.user.create({ ... });
  await this.prisma.account.create({ ... });

  // Member table has FORCE RLS -- must set org context
  const [, member] = await this.prisma.$transaction([
    this.prisma.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, TRUE)`,
    this.prisma.member.create({
      data: { id: randomUUID(), organizationId: orgId, userId, role: dto.role },
    }),
  ]);

  return { user, member };
}
```

### FIX-03: API Key Hard Delete

```typescript
// New method in ApiKeysService
// Source: analysis of apps/api/src/api-keys/api-keys.service.ts
async delete(id: string, orgId: string) {
  const key = await this.tenancy.apiKey.findFirst({
    where: { id, orgId },
  });
  if (!key) {
    throw new NotFoundException(`API key ${id} not found`);
  }

  // Hard delete -- cascade should handle ApiKeyUsage
  await this.tenancy.apiKey.delete({ where: { id } });
  return { deleted: true };
}
```

Controller change:
```typescript
// Change the existing Delete endpoint
@Delete(':id')
async delete(@Param('id') id: string) {
  return this.apiKeysService.delete(id, this.getOrgId());
}
```

### FIX-02: Remove Copy Action from Table

```typescript
// In api-keys-data-table.tsx, remove the "Copy key" action from activeActions
const activeActions: RowAction<ApiKeyRow>[] = useMemo(
  () => [
    // REMOVED: Copy key action (can only copy masked version)
    {
      label: "Revoke",
      icon: Ban,
      onClick: (key) => setRevokeKey(key),
      variant: "destructive" as const,
    },
    {
      label: "Delete",
      icon: Trash2,
      onClick: (key) => setDeleteKey(key),
      variant: "destructive" as const,
    },
  ],
  [],
)
```

### DataTable Migration Example: Team Page Columns

```typescript
// New file: apps/web/src/components/team/team-columns.tsx
import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader, DataTableRowActions, type RowAction } from "@/components/ui/data-table"

export interface TeamMemberRow {
  userId: string
  name: string
  email: string
  role: "admin" | "operator" | "developer" | "viewer"
  createdAt: string | null
}

const ROLE_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  admin: { label: "Admin", variant: "default" },
  operator: { label: "Operator", variant: "secondary" },
  developer: { label: "Developer", variant: "secondary" },
  viewer: { label: "Viewer", variant: "outline" },
}

export function createTeamColumns(
  actions: RowAction<TeamMemberRow>[]
): ColumnDef<TeamMemberRow, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
    },
    {
      accessorKey: "email",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
    },
    {
      accessorKey: "role",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => {
        const role = row.getValue("role") as string
        const badge = ROLE_BADGE[role] ?? ROLE_BADGE.viewer
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    // ... createdAt, actions columns
  ]
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | RLS connection pool leakage is the root cause of FIX-01 | Pitfalls, Code Examples | Fix may not resolve the bug; need to reproduce and verify actual error message |
| A2 | `ApiKeyUsage` has foreign key to `ApiKey` requiring cascade consideration | Pitfall 2 | Hard delete may fail with FK constraint error |
| A3 | Admin audit-log endpoint may not return `orgName` field | Pitfall 4 | Platform Audit migration may need backend changes |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `apps/web/vitest.config.ts`, `apps/api/vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIX-01 | Super admin creates user in system org | integration | Backend test: POST to /api/organizations/system-org-id/users | Needs new test |
| FIX-02 | Copy action removed from API keys table | unit | `npx vitest run apps/web/src/__tests__/api-keys --reporter=verbose` | Check existing |
| FIX-03 | API key hard delete works | integration | Backend test: DELETE /api/api-keys/:id removes record | Needs new test |
| UI-01 | Team page renders DataTable | unit | `npx vitest run apps/web/src/__tests__/team-page.test.tsx` | Exists |
| UI-02 | Organizations page renders DataTable | unit | Check for existing test | Check existing |
| UI-03 | Cluster Nodes page renders DataTable | unit | Check for existing test | Check existing |
| UI-04 | Platform Audit page renders DataTable | unit | Check for existing test | Check existing |

### Wave 0 Gaps
- Existing tests (`team-page.test.tsx`, etc.) may need updates to match new DataTable structure
- Backend integration tests for FIX-01 and FIX-03 may not exist

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A (no auth changes) |
| V3 Session Management | No | N/A |
| V4 Access Control | Yes | OrgAdminGuard already handles super admin bypass; RLS fix must preserve tenant isolation |
| V5 Input Validation | No | Existing zod schemas sufficient |
| V6 Cryptography | No | API key hash logic unchanged |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RLS bypass on system org | Elevation of Privilege | Set `app.current_org_id` explicitly for the target org, even for super admin operations |
| API key hard delete data loss | Information Disclosure (inverse) | AlertDialog confirmation + success/error toast. Usage data cascade handled by DB |
| Self-removal from org | Denial of Service | Preserve `isSelf` check in Team DataTable to prevent self-removal |

## Sources

### Primary (HIGH confidence)
- `apps/api/src/users/users.service.ts` -- User creation logic with raw PrismaService
- `apps/api/src/api-keys/api-keys.service.ts` -- API key create/revoke logic
- `apps/api/src/api-keys/api-keys.controller.ts` -- Delete endpoint calls revoke()
- `apps/api/src/tenancy/prisma-tenancy.extension.ts` -- Tenancy client RLS mechanism
- `apps/api/src/prisma/rls.policies.sql` -- RLS policies on Member table
- `apps/web/src/components/ui/data-table/data-table.tsx` -- DataTable component API
- `apps/web/src/components/api-keys/api-keys-data-table.tsx` -- Reference DataTable implementation
- `apps/web/src/components/api-keys/api-keys-columns.tsx` -- Reference column definitions
- `apps/web/src/components/audit/audit-log-data-table.tsx` -- Audit DataTable (reuse target)
- All 4 migration target files verified (team-table.tsx, org-table.tsx, node-table.tsx, platform-audit-log-page.tsx)

### Secondary (MEDIUM confidence)
- PostgreSQL RLS documentation on FORCE policy behavior and WITH CHECK inference from USING clause

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing
- Architecture: HIGH -- established patterns verified in codebase
- Bug root causes: MEDIUM -- FIX-01 root cause is analyzed from code but not reproduced
- Pitfalls: HIGH -- derived from actual code analysis

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (stable codebase, no external dependency changes)
