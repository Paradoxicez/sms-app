---
phase: quick
plan: 260416-pjo
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/admin/admin-dashboard.controller.ts
  - apps/api/src/admin/admin-dashboard.service.ts
  - apps/api/src/admin/admin-audit-log.controller.ts
  - apps/api/src/admin/admin-audit-log.service.ts
  - apps/api/src/admin/admin.module.ts
  - apps/web/src/components/pages/platform-dashboard-page.tsx
  - apps/web/src/components/pages/platform-audit-log-page.tsx
  - apps/web/src/app/admin/dashboard/page.tsx
  - apps/web/src/app/admin/audit-log/page.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Super admin sees platform-wide stats (total orgs, cameras online/offline, viewers, bandwidth)"
    - "Super admin sees SRS system metrics on platform dashboard"
    - "Super admin sees per-org camera count summary table"
    - "Super admin sees all audit log entries across all orgs with org name column"
    - "Super admin can filter audit log by action type and date range"
    - "Super admin can paginate audit log entries with cursor-based pagination"
  artifacts:
    - path: "apps/api/src/admin/admin-dashboard.controller.ts"
      provides: "GET /api/admin/dashboard/stats endpoint"
    - path: "apps/api/src/admin/admin-dashboard.service.ts"
      provides: "Platform-wide stats aggregation using rawPrisma"
    - path: "apps/api/src/admin/admin-audit-log.controller.ts"
      provides: "GET /api/admin/audit-log endpoint"
    - path: "apps/api/src/admin/admin-audit-log.service.ts"
      provides: "Cross-org audit log queries using rawPrisma"
    - path: "apps/web/src/components/pages/platform-dashboard-page.tsx"
      provides: "Platform dashboard page component with stat cards and org summary"
    - path: "apps/web/src/components/pages/platform-audit-log-page.tsx"
      provides: "Platform audit log page component with org column"
  key_links:
    - from: "platform-dashboard-page.tsx"
      to: "/api/admin/dashboard/stats"
      via: "apiFetch in useEffect"
    - from: "platform-audit-log-page.tsx"
      to: "/api/admin/audit-log"
      via: "apiFetch with cursor pagination"
    - from: "admin-dashboard.service.ts"
      to: "PrismaService (rawPrisma)"
      via: "direct injection, bypasses RLS"
---

<objective>
Replace stub super admin Dashboard and Audit Log pages with real data.

Purpose: Super admins need platform-wide visibility into all orgs, cameras, and audit activity -- currently these pages show placeholder text.
Output: Two working admin pages with backend endpoints that query across all orgs using rawPrisma (RLS bypass).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/api/src/admin/admin.module.ts
@apps/api/src/admin/admin.controller.ts
@apps/api/src/auth/guards/super-admin.guard.ts
@apps/api/src/dashboard/dashboard.service.ts
@apps/api/src/dashboard/dashboard.controller.ts
@apps/api/src/audit/audit.service.ts
@apps/api/src/audit/audit.controller.ts
@apps/api/src/audit/dto/audit-query.dto.ts
@apps/web/src/components/pages/tenant-dashboard-page.tsx
@apps/web/src/components/pages/tenant-audit-log-page.tsx
@apps/web/src/components/dashboard/stat-card.tsx
@apps/web/src/components/dashboard/system-metrics.tsx
@apps/web/src/components/audit/audit-log-table.tsx
@apps/web/src/components/audit/audit-detail-dialog.tsx
@apps/web/src/lib/api.ts

<interfaces>
<!-- Key types and contracts the executor needs -->

From apps/api/src/auth/guards/super-admin.guard.ts:
```typescript
@Injectable()
export class SuperAdminGuard implements CanActivate {
  // Checks session.user.role === 'admin', throws UnauthorizedException otherwise
}
```

From apps/api/src/prisma/prisma.service.ts:
```typescript
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {}
// Inject as `private readonly rawPrisma: PrismaService` for RLS-bypass queries
```

From apps/api/src/dashboard/dashboard.service.ts:
```typescript
// getStats(orgId) pattern — new service should query WITHOUT orgId filter
// getSystemMetrics() — reuse SrsApiService.getSummaries()
```

From apps/api/src/audit/dto/audit-query.dto.ts:
```typescript
export const auditQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.enum(['create', 'update', 'delete']).optional(),
  resource: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  cursor: z.string().uuid().optional(),
  take: z.coerce.number().min(1).max(100).default(50),
});
```

From apps/web/src/components/audit/audit-detail-dialog.tsx:
```typescript
export interface AuditLog {
  id: string; orgId: string; userId: string | null;
  action: 'create' | 'update' | 'delete'; resource: string; resourceId: string | null;
  method: string; path: string; ip: string;
  details: Record<string, unknown> | null; createdAt: string;
  user?: { name: string | null; email: string } | null;
}
```

From apps/web/src/components/dashboard/stat-card.tsx:
```typescript
interface StatCardProps {
  label: string; value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; positive: boolean };
  badge?: { text: string; variant: 'default' | 'destructive' | 'secondary' };
}
```

From apps/web/src/components/audit/audit-log-table.tsx:
```typescript
interface AuditLogTableProps {
  entries: AuditLog[]; loading: boolean; onLoadMore: () => void; hasMore: boolean;
}
// NOTE: For platform audit log, the table needs an additional "Organization" column.
// Create a new PlatformAuditLogTable that extends this pattern with orgName display,
// OR pass entries with orgName joined and render an extra column inline in the page.
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — Admin Dashboard and Audit Log endpoints</name>
  <files>
    apps/api/src/admin/admin-dashboard.controller.ts
    apps/api/src/admin/admin-dashboard.service.ts
    apps/api/src/admin/admin-audit-log.controller.ts
    apps/api/src/admin/admin-audit-log.service.ts
    apps/api/src/admin/admin.module.ts
  </files>
  <action>
Create four new files under `apps/api/src/admin/`:

**admin-dashboard.service.ts:**
- Inject `PrismaService` (rawPrisma — bypasses RLS), `SrsApiService`, `StatusService`
- Method `getPlatformStats()`:
  - Count distinct orgs: `rawPrisma.organization.count()` (exclude system org if applicable)
  - Count cameras: `rawPrisma.camera.findMany({ select: { id, status, orgId } })` then compute online/offline/total
  - Sum viewers from StatusService across all cameras
  - Get SRS stream bandwidth from `SrsApiService.getStreams()` — sum all streams' `kbps.send_30s`
  - Return: `{ totalOrgs, totalCameras, camerasOnline, camerasOffline, totalViewers, streamBandwidth }`
- Method `getOrgSummary()`:
  - Query: `rawPrisma.organization.findMany({ select: { id, name, slug }, where: { NOT: { metadata: { path: ['isSystem'], equals: true } } } })`
    - If `metadata` or `isSystem` check is unreliable, just list all orgs — it's fine
  - For each org, count cameras by status: `rawPrisma.camera.groupBy({ by: ['orgId', 'status'], _count: true })`
  - Return array: `[{ orgId, orgName, orgSlug, camerasOnline, camerasOffline, totalCameras }]`

**admin-dashboard.controller.ts:**
- `@Controller('api/admin/dashboard')`, `@UseGuards(SuperAdminGuard)`, `@ApiTags('Admin Dashboard')`
- `GET /api/admin/dashboard/stats` — calls `getPlatformStats()`
- `GET /api/admin/dashboard/orgs` — calls `getOrgSummary()`

**admin-audit-log.service.ts:**
- Inject `PrismaService` (rawPrisma)
- Method `findAll(query: AuditQueryDto)` — same logic as existing `AuditService.findAll()` but:
  - NO orgId filter (queries all orgs)
  - Include `user` relation: `include: { user: { select: { name: true, email: true } } }`
  - Also join org name: include `organization: { select: { name: true } }` — NOTE: AuditLog has `orgId` but may not have a Prisma relation to Organization. Check the schema. If no relation exists, do a separate query: fetch unique orgIds from results, then `rawPrisma.organization.findMany({ where: { id: { in: orgIds } } })` and map orgId -> orgName in the service.
  - Add `orgName` to each returned item
  - Use the same `auditQuerySchema` from `apps/api/src/audit/dto/audit-query.dto.ts`

**admin-audit-log.controller.ts:**
- `@Controller('api/admin/audit-log')`, `@UseGuards(SuperAdminGuard)`, `@ApiTags('Admin Audit Log')`
- `GET /api/admin/audit-log` — validates query with `auditQuerySchema.safeParse()`, calls service `findAll()`
- No FeatureGuard (super admin always has access)

**admin.module.ts:**
- Update to import `PrismaModule`, `SrsModule`
- Register all four new providers (2 services, 2 controllers)
- Keep existing `PackagesModule` and `OrganizationsModule` imports
  </action>
  <verify>
    <automated>cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && npx tsc --noEmit --project apps/api/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - GET /api/admin/dashboard/stats returns platform-wide stats (totalOrgs, totalCameras, camerasOnline, camerasOffline, totalViewers, streamBandwidth)
    - GET /api/admin/dashboard/orgs returns per-org camera summary
    - GET /api/admin/audit-log returns paginated cross-org audit entries with orgName
    - All endpoints guarded by SuperAdminGuard
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Frontend — Platform Dashboard and Audit Log page components</name>
  <files>
    apps/web/src/components/pages/platform-dashboard-page.tsx
    apps/web/src/components/pages/platform-audit-log-page.tsx
  </files>
  <action>
**platform-dashboard-page.tsx:**
Follow the pattern from `tenant-dashboard-page.tsx` but for platform-wide data.

- `'use client'` directive
- Fetch stats from `/api/admin/dashboard/stats` on mount using `apiFetch()`
- Fetch org summary from `/api/admin/dashboard/orgs` on mount using `apiFetch()`
- Stat cards row (5 cards in grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`):
  - Total Organizations (Building2 icon)
  - Total Cameras (Camera icon)
  - Cameras Online (Camera icon, green "Live" badge if > 0)
  - Cameras Offline (MonitorOff icon, red badge if > 0)
  - Stream Bandwidth (Wifi icon, use same `formatBandwidth()` helper)
- Reuse `<SystemMetrics />` component directly (it already fetches `/api/dashboard/system-metrics`)
- Org Summary table below metrics:
  - Card wrapper with title "Organization Summary"
  - Table with columns: Org Name, Online, Offline, Total Cameras
  - Use existing Table/TableBody/TableRow/TableCell/TableHead components
  - Sort orgs by totalCameras descending
- Loading state: Skeleton placeholders (same pattern as tenant dashboard)
- Error state: simple error message

**platform-audit-log-page.tsx:**
Follow the pattern from `tenant-audit-log-page.tsx` but for platform-wide data.

- `'use client'` directive
- NO feature gate check (super admin always has access)
- Fetch from `/api/admin/audit-log` instead of `/api/audit-log`
- Same filter UI: action type Select, date from/to inputs, Apply button
- Same cursor-based pagination (Load More button)
- DO NOT reuse `AuditLogTable` directly — instead, create the table inline (or a local component) with an additional "Organization" column showing `entry.orgName`
- The table should have columns: Timestamp, Organization, Actor, Action, Resource, IP Address, Details
- Reuse `AuditDetailDialog` for the details view (it only needs an `AuditLog` entry)
- Extend the local `AuditLog` type to include `orgName?: string` for the org column
- Same ACTION_OPTIONS, formatTimestamp, and ACTION_VARIANT patterns from tenant page
  </action>
  <verify>
    <automated>cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - platform-dashboard-page.tsx renders stat cards, system metrics, and org summary table
    - platform-audit-log-page.tsx renders filterable, paginated audit log with org column
    - Both components follow existing green theme and card-based layout patterns
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire page components into admin routes</name>
  <files>
    apps/web/src/app/admin/dashboard/page.tsx
    apps/web/src/app/admin/audit-log/page.tsx
  </files>
  <action>
**apps/web/src/app/admin/dashboard/page.tsx:**
Replace the entire stub content. Import and re-export `PlatformDashboardPage` from `@/components/pages/platform-dashboard-page`:

```tsx
"use client";
import PlatformDashboardPage from "@/components/pages/platform-dashboard-page";

export default function AdminDashboardRoute() {
  return <PlatformDashboardPage />;
}
```

**apps/web/src/app/admin/audit-log/page.tsx:**
Replace the entire stub content. Import and re-export `PlatformAuditLogPage` from `@/components/pages/platform-audit-log-page`:

```tsx
"use client";
import PlatformAuditLogPage from "@/components/pages/platform-audit-log-page";

export default function AdminAuditLogRoute() {
  return <PlatformAuditLogPage />;
}
```
  </action>
  <verify>
    <automated>cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - /admin/dashboard renders PlatformDashboardPage with real data
    - /admin/audit-log renders PlatformAuditLogPage with real data
    - No more stub/placeholder content on either page
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes for both api and web apps
2. Navigate to /admin/dashboard as super admin — stat cards show real numbers, system metrics load, org summary table populates
3. Navigate to /admin/audit-log as super admin — audit entries from all orgs appear with org name column, filters and pagination work
4. Non-super-admin users cannot access /api/admin/dashboard/* or /api/admin/audit-log (401)
</verification>

<success_criteria>
- Platform dashboard shows aggregated stats across all organizations
- Platform audit log shows all entries across orgs with organization name
- Both pages match existing UI patterns (green theme, card layout, table styling)
- All endpoints protected by SuperAdminGuard
- rawPrisma used for cross-org queries (RLS bypass)
</success_criteria>

<output>
After completion, create `.planning/quick/260416-pjo-complete-super-admin-dashboard-and-platf/260416-pjo-SUMMARY.md`
</output>
