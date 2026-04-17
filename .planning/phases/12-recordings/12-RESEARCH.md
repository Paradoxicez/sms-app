# Phase 12: Recordings - Research

**Researched:** 2026-04-17
**Domain:** Cross-camera recordings page with DataTable, server-side pagination, bulk delete, presigned download
**Confidence:** HIGH

## Summary

Phase 12 replaces the existing `tenant-recordings-page.tsx` (a per-camera, client-side filtered table) with a cross-camera DataTable-based recordings page. The new page uses the established Phase 8 DataTable component system with server-side pagination, faceted filters, DateRangePicker, bulk delete via checkboxes, and presigned MinIO URL downloads.

The technical scope is well-defined: (1) a new backend endpoint `GET /api/recordings` with cross-camera Prisma queries joining Camera -> Site -> Project, (2) a new download endpoint `GET /api/recordings/:id/download` returning presigned MinIO URLs, (3) a bulk delete endpoint `DELETE /api/recordings/bulk`, and (4) a new frontend DataTable page reusing Phase 8 components with server-side pagination following the audit log pattern. All required libraries and UI components are already installed.

**Primary recommendation:** Follow the audit log DataTable pattern (`audit-log-data-table.tsx`) for server-side pagination + external filter state, add a new Prisma query with `include: { camera: { include: { site: { include: { project: true } } } } }` for the cross-camera join, and use `MinioService.getPresignedUrl()` for downloads.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Full detail columns: Checkbox, Camera Name, Project, Site, Date, Time Range, Duration, Size, Status (badge), Actions ("...")
- **D-02:** Default sort: startedAt descending (newest first)
- **D-03:** Server-side pagination -- backend handles page/pageSize with total count response
- **D-04:** Full filter bar following Phase 8 DataTable toolbar pattern: Search + Camera faceted filter + Project faceted filter + Site faceted filter + DateRangePicker + Status faceted filter
- **D-05:** All faceted filters use Phase 8 DataTableFacetedFilter (chip buttons with popover multi-select)
- **D-06:** DateRangePicker uses Phase 8 component for start/end date filtering
- **D-07:** Filter state stored in URL query params (Phase 8 pattern -- shareable links, back-button preservation)
- **D-08:** Row action "..." menu: Download (presigned URL), Delete (with AlertDialog confirmation) -- 2 actions only
- **D-09:** Bulk delete via toolbar button -- "Delete Selected (N)" appears when checkboxes selected, with AlertDialog confirmation before actual deletion
- **D-10:** Download uses presigned MinIO URLs -- browser downloads directly from MinIO, not proxied through API server
- **D-11:** Table-only layout -- no inline player, no calendar, no timeline on this page
- **D-12:** Click camera name in row links to camera page (where per-camera recordings-tab with player/timeline/calendar exists)
- **D-13:** No calendar/timeline components on this page -- DateRangePicker filter is sufficient for cross-camera browsing
- **D-14:** New endpoint: GET /api/recordings -- cross-camera list with query params: page, pageSize, cameraId?, projectId?, siteId?, startDate?, endDate?, status?, search?
- **D-15:** Response format: { data: [...], total: number, page: number, pageSize: number } -- includes joined camera name, project name, site name
- **D-16:** New endpoint: GET /api/recordings/:id/download -- returns { url: 'presigned-minio-url' } for direct file download
- **D-17:** Existing per-camera endpoints (GET /api/recordings/camera/:cameraId) remain unchanged -- used by recordings-tab

### Claude's Discretion
- Loading skeleton design for DataTable
- Empty state when no recordings match filters
- Exact toolbar layout spacing
- Search field placeholder text
- Page size options (10/25/50)
- Bulk delete error handling (partial failure UX)
- Whether search queries camera name, project name, or both

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REC-01 | User can browse recordings from all cameras on a dedicated recordings page | New `GET /api/recordings` endpoint with cross-camera Prisma query; new DataTable page at `/app/recordings` replacing `tenant-recordings-page.tsx` |
| REC-02 | User can filter recordings by camera, project, site, date range, and status | Server-side filter params on `GET /api/recordings`; frontend faceted filters + DateRangePicker with URL query param state |
| REC-03 | User can select and bulk delete multiple recordings | Row selection via DataTable checkboxes; new `DELETE /api/recordings/bulk` endpoint; AlertDialog confirmation; partial failure handling |
| REC-04 | User can download recording clips as files | New `GET /api/recordings/:id/download` endpoint returning presigned MinIO URL; browser direct download |
</phase_requirements>

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-table | 8.x | DataTable core | Already used by Phase 8 DataTable system [VERIFIED: codebase] |
| date-fns | 3.x | Date formatting, range ops | Already used by cameras-columns.tsx, DateRangePicker [VERIFIED: codebase] |
| zod | 3.x | Query param validation (backend DTO) | Already used by all NestJS DTOs in project [VERIFIED: codebase] |
| minio (Node.js SDK) | installed | Presigned URL generation | Already used by MinioService [VERIFIED: codebase] |
| lucide-react | installed | Icons (Download, Trash2, Loader2) | Already used across all pages [VERIFIED: codebase] |

### Supporting (all already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-day-picker | installed | DateRangePicker dependency | Already used by Phase 8 DateRangePicker [VERIFIED: codebase] |
| nestjs-cls | installed | Tenant context (ORG_ID) | Already used by all controllers [VERIFIED: codebase] |
| Prisma | 6.x | Database queries with joins | Already used by all services [VERIFIED: codebase] |

**Installation:** No new packages required. All dependencies already installed from prior phases.

## Architecture Patterns

### Recommended File Structure
```
apps/api/src/recordings/
  recordings.controller.ts      # ADD: new cross-camera endpoint + download endpoint + bulk delete
  recordings.service.ts         # ADD: new cross-camera query method + bulk delete method
  minio.service.ts              # EXISTING: use getPresignedUrl() for download
  dto/
    recording-query.dto.ts      # NEW: zod schema for cross-camera query params

apps/web/src/
  app/app/recordings/
    page.tsx                    # EXISTING: update to render new DataTable component
    components/
      recordings-columns.tsx    # NEW: column definitions ("use client")
      recordings-data-table.tsx # NEW: DataTable wrapper with server-side pagination
  components/
    recording-status-badge.tsx  # NEW: extracted shared StatusBadge component
  lib/
    format-utils.ts             # NEW: extracted formatDuration, formatSize utilities
```

### Pattern 1: Server-Side Paginated DataTable (audit log pattern)
**What:** DataTable with `pageCount` and `onPaginationChange` props for server-side mode; external state management for filters sent as API query params.
**When to use:** When dataset is large (recordings can be thousands) and needs cross-table joins.
**Example:**
```typescript
// Source: apps/web/src/components/audit/audit-log-data-table.tsx [VERIFIED: codebase]
<DataTable
  columns={columns}
  data={data}
  facetedFilters={FILTER_CONFIG}
  pageCount={Math.ceil(total / pagination.pageSize) || 1}
  onPaginationChange={handlePaginationChange}
  loading={loading}
  enableRowSelection
  onRowSelectionChange={handleRowSelectionChange}
  toolbar={/* bulk delete button + custom search + DateRangePicker */}
  emptyState={{ title: "...", description: "..." }}
/>
```

### Pattern 2: URL Query Param State for Filters (D-07)
**What:** Store all filter values in URL search params so links are shareable and back button works.
**When to use:** Recordings page where filters should persist across navigation.
**Example:**
```typescript
// Pattern: useSearchParams for filter state [ASSUMED]
// The audit log DataTable uses internal React state for filters.
// For D-07 (URL param state), wrap filter state with Next.js useSearchParams + router.push.
import { useSearchParams, useRouter } from "next/navigation"

function useUrlFilterState() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const updateParams = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value)
      else params.delete(key)
    })
    router.push(`?${params.toString()}`)
  }
  
  return { searchParams, updateParams }
}
```

### Pattern 3: Cross-Camera Prisma Query with Joins
**What:** Query recordings across all cameras for an org, joining camera -> site -> project for display names.
**When to use:** The new `GET /api/recordings` endpoint.
**Example:**
```typescript
// Source: Prisma schema analysis [VERIFIED: codebase]
// Recording -> Camera -> Site -> Project (3-level join)
const [data, total] = await Promise.all([
  this.prisma.recording.findMany({
    where,
    include: {
      camera: {
        select: {
          id: true,
          name: true,
          site: {
            select: {
              id: true,
              name: true,
              project: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
    orderBy: { startedAt: 'desc' },
    take: pageSize,
    skip: (page - 1) * pageSize,
  }),
  this.prisma.recording.count({ where }),
]);
```

### Pattern 4: Column Definitions in "use client" Files
**What:** Column definitions use `createXxxColumns(callbacks)` factory pattern with callbacks for actions.
**When to use:** All DataTable column definitions (Phase 8 D-02, Phase 10 D-20).
**Example:**
```typescript
// Source: apps/web/src/app/admin/cameras/components/cameras-columns.tsx [VERIFIED: codebase]
"use client"
import type { ColumnDef } from "@tanstack/react-table"

export function createRecordingsColumns(
  callbacks: RecordingsColumnCallbacks
): ColumnDef<RecordingRow>[] {
  return [/* column defs with callbacks.onDownload, callbacks.onDelete */]
}
```

### Anti-Patterns to Avoid
- **Client-side filtering for large datasets:** Current `tenant-recordings-page.tsx` fetches per-camera and filters client-side. The new page must use server-side filtering via query params. [VERIFIED: codebase -- current page fetches all recordings for a camera then filters in JS]
- **Proxy downloads through API server:** D-10 requires presigned URLs so browser downloads directly from MinIO. Do NOT stream through the NestJS server (unlike the segment proxy pattern in the existing controller).
- **Mixing DataTable column filters with external filter state:** In server-side mode (`manualFiltering: true`), TanStack Table column filters don't actually filter data. The audit log component has comments about this confusion. For recordings, manage ALL filter state externally (URL params) and pass filters as API query params, not through DataTable column filter state. [VERIFIED: audit-log-data-table.tsx comments lines 150-167]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Presigned URLs | Custom token/signature system | `MinioService.getPresignedUrl()` | Already implemented, handles expiry, bucket naming [VERIFIED: minio.service.ts line 43] |
| Server-side pagination | Custom offset/limit logic | Follow audit log pattern (skip/take + count) | Proven pattern in codebase [VERIFIED: audit.service.ts lines 84-94] |
| Date range filtering | Custom date math | `date-fns` + DateRangePicker component | Already installed and used [VERIFIED: codebase] |
| Status badges | New badge component | Extract existing StatusBadge from `tenant-recordings-page.tsx` | Already has correct styles for all 4 statuses [VERIFIED: tenant-recordings-page.tsx lines 85-108] |
| Duration/size formatting | New formatters | Extract existing `formatDuration`/`formatSize` from `tenant-recordings-page.tsx` | Already handles edge cases (null, 0, GB/MB threshold) [VERIFIED: tenant-recordings-page.tsx lines 66-83] |
| DataTable with selection | Custom checkbox table | Use `DataTable` with `enableRowSelection` + `onRowSelectionChange` | Already supports this [VERIFIED: data-table.tsx props] |

**Key insight:** Nearly all UI components and patterns are already implemented. This phase is primarily composition (assembling existing components) plus backend API additions. The main new code is the cross-camera query endpoint and the recordings DataTable wrapper.

## Common Pitfalls

### Pitfall 1: Server-Side Filter State vs TanStack Column Filters
**What goes wrong:** Using DataTable's `facetedFilters` prop for server-side mode causes visual selection but no actual filtering, because `manualFiltering: true` disables client-side filtering.
**Why it happens:** The DataTable component sets column filter state internally, but in server-side mode this state is decorative only.
**How to avoid:** Manage ALL filter state externally (URL query params). Use faceted filter components outside the DataTable toolbar if needed, OR track column filter changes via a custom mechanism. The audit log already struggles with this (see comments in `audit-log-data-table.tsx` lines 150-167).
**Warning signs:** Selecting a faceted filter option doesn't change the displayed data.

### Pitfall 2: BigInt Serialization in JSON Response
**What goes wrong:** Prisma returns `totalSize` as `BigInt`. JSON.stringify throws `TypeError: Do not know how to serialize a BigInt`.
**Why it happens:** Recording model uses `BigInt` for `totalSize` (bytes). [VERIFIED: schema.prisma line 525]
**How to avoid:** Convert BigInt to number or string before sending response. The existing `getStorageQuota` endpoint already does this: `usageBytes: quota.usageBytes.toString()` [VERIFIED: recordings.controller.ts line 149].
**Warning signs:** API endpoint returns 500 error on first test.

### Pitfall 3: Presigned URL Expiry and Download Flow
**What goes wrong:** Presigned URL expires before download starts, or download URL points to internal Docker network hostname.
**Why it happens:** MinIO endpoint configured as internal Docker hostname (e.g., `minio:9000`) instead of external hostname.
**How to avoid:** Ensure `MINIO_ENDPOINT` config used for presigned URL generation resolves from the browser. The existing `MinioService` uses `ConfigService` for endpoint config. For download URLs, consider a separate public endpoint config or proxy if MinIO isn't directly accessible. Default expiry is 14400 seconds (4 hours) which is generous. [VERIFIED: minio.service.ts line 46]
**Warning signs:** Download button triggers but browser shows connection refused or Docker hostname in URL.

### Pitfall 4: N+1 Query on Camera/Site/Project Names
**What goes wrong:** Loading recordings page becomes slow because each recording triggers separate queries for camera name, site name, project name.
**Why it happens:** Prisma lazy loading or separate queries per recording.
**How to avoid:** Use `include` in single Prisma query: `include: { camera: { select: { name: true, site: { select: { name: true, project: { select: { name: true } } } } } } }`. [VERIFIED: Prisma schema supports this join chain]
**Warning signs:** Database logs show hundreds of queries for a single page load.

### Pitfall 5: Bulk Delete with MinIO Object Cleanup
**What goes wrong:** Recordings deleted from database but MinIO objects remain (orphaned storage), or MinIO delete fails and database record is already deleted.
**Why it happens:** The existing `deleteRecording` method deletes MinIO objects first, then the DB record. For bulk operations, a single failure could leave inconsistent state.
**How to avoid:** Process deletions sequentially using the existing `deleteRecording` method (which handles MinIO cleanup). Return partial success/failure counts. The existing method already handles segments + init segment cleanup. [VERIFIED: recordings.service.ts lines 396-422]
**Warning signs:** Storage usage doesn't decrease after bulk delete; MinIO bucket grows indefinitely.

### Pitfall 6: URL Query Params and Pagination Reset
**What goes wrong:** Changing a filter doesn't reset to page 1, showing empty results on page 5 after narrowing filters.
**Why it happens:** Filter changes update URL params but don't reset the `page` param.
**How to avoid:** Any filter change must also set `page=1` in URL params. The audit log does this: `setPagination((prev) => ({ ...prev, pageIndex: 0 }))` [VERIFIED: audit-log-data-table.tsx line 54].
**Warning signs:** Applying a filter shows "No results" even though recordings exist.

## Code Examples

### Backend: Recording Query DTO
```typescript
// Source: audit-query.dto.ts pattern [VERIFIED: codebase]
import { z } from 'zod';

export const recordingQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(10),
  cameraId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  startDate: z.string().optional(), // ISO date string
  endDate: z.string().optional(),   // ISO date string
  status: z.string().optional(),    // comma-separated: "complete,error"
  search: z.string().max(200).optional(),
});

export type RecordingQueryDto = z.infer<typeof recordingQuerySchema>;
```

### Backend: Cross-Camera Query
```typescript
// Source: audit.service.ts findAll pattern + Prisma schema [VERIFIED: codebase]
async findAllRecordings(orgId: string, query: RecordingQueryDto) {
  const where: any = { orgId };

  if (query.cameraId) where.cameraId = query.cameraId;
  if (query.siteId) where.camera = { siteId: query.siteId };
  if (query.projectId) where.camera = { ...where.camera, site: { projectId: query.projectId } };
  if (query.status) {
    const statuses = query.status.split(',');
    where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
  }
  if (query.startDate || query.endDate) {
    where.startedAt = {};
    if (query.startDate) where.startedAt.gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      where.startedAt.lte = end;
    }
  }
  if (query.search) {
    where.camera = {
      ...where.camera,
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { site: { project: { name: { contains: query.search, mode: 'insensitive' } } } },
      ],
    };
  }

  const skip = (query.page - 1) * query.pageSize;

  const [data, total] = await Promise.all([
    this.prisma.recording.findMany({
      where,
      include: {
        camera: {
          select: {
            id: true, name: true,
            site: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: query.pageSize,
      skip,
    }),
    this.prisma.recording.count({ where }),
  ]);

  return {
    data: data.map(r => ({
      ...r,
      totalSize: Number(r.totalSize), // BigInt -> Number for JSON
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
```

### Backend: Download Endpoint
```typescript
// Source: minio.service.ts getPresignedUrl [VERIFIED: codebase]
@Get(':id/download')
async getDownloadUrl(@Param('id') id: string) {
  const orgId = this.cls.get('ORG_ID');
  const recording = await this.recordingsService.getRecording(id, orgId);
  
  // Generate presigned URL for all segments concatenated,
  // or for the init segment + segments manifest
  // Simplest: presign the first segment or a combined approach
  // Note: recordings are stored as individual .m4s segments in MinIO
  // A "download" likely needs a server-side concatenation or 
  // we download segments and let the user play locally
  
  // For MVP: generate presigned URL for the recording's init segment
  // + segment list, or implement a server-side concat endpoint
  const url = await this.minioService.getPresignedUrl(orgId, recording.initSegment!);
  return { url };
}
```

### Frontend: Recordings DataTable Wrapper
```typescript
// Source: audit-log-data-table.tsx pattern [VERIFIED: codebase]
"use client"
import { useSearchParams, useRouter } from "next/navigation"

function RecordingsDataTable() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // Extract filter state from URL params
  const page = Number(searchParams.get("page") ?? "1")
  const pageSize = Number(searchParams.get("pageSize") ?? "10")
  const search = searchParams.get("search") ?? ""
  // ... other filters from URL params

  // Fetch data with all params
  React.useEffect(() => {
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("pageSize", String(pageSize))
    if (search) params.set("search", search)
    // ... other filters
    
    apiFetch(`/api/recordings?${params.toString()}`).then(/* ... */)
  }, [page, pageSize, search, /* other deps */])

  return (
    <DataTable
      columns={columns}
      data={data}
      pageCount={Math.ceil(total / pageSize) || 1}
      onPaginationChange={({ pageIndex, pageSize: ps }) => {
        updateUrlParams({ page: String(pageIndex + 1), pageSize: String(ps) })
      }}
      enableRowSelection
      onRowSelectionChange={setSelectedRows}
      loading={loading}
      toolbar={/* search + filters + bulk delete button */}
    />
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-camera recordings list (current page) | Cross-camera DataTable with server-side pagination | Phase 12 | Users can browse all recordings without selecting a camera first |
| Client-side filtering (current page) | Server-side filtering via API query params | Phase 12 | Handles large datasets, reduces client memory |
| No download capability | Presigned MinIO URL download | Phase 12 | Users can download recording files directly |
| Individual delete only | Bulk delete via checkboxes | Phase 12 | Faster cleanup of multiple recordings |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | URL query param state pattern using Next.js `useSearchParams` + `router.push` for filter persistence | Architecture Patterns - Pattern 2 | LOW -- may need `usePathname` or `router.replace` instead of `push`; implementation detail |
| A2 | Search should query both camera name and project name | Code Examples - Backend Query | LOW -- per Claude's Discretion; easy to adjust |
| A3 | MinIO presigned URLs are accessible from the browser (not internal Docker hostname) | Common Pitfalls - Pitfall 3 | MEDIUM -- if MinIO is only on Docker network, download won't work; may need proxy |
| A4 | Recording "download" means downloading the init segment + segments; may need concatenation | Code Examples - Download Endpoint | MEDIUM -- recordings are stored as individual .m4s segments, not single files. A true "download recording as file" may need server-side concatenation into .mp4 |

## Open Questions

1. **Recording Download Format**
   - What we know: Recordings are stored as individual `.m4s` segments + init segment in MinIO. The manifest service generates HLS playlists for playback.
   - What's unclear: Does "download recording" mean downloading a single combined `.mp4` file, or is downloading the HLS manifest + segments sufficient? Individual segments are not useful as standalone files.
   - Recommendation: For MVP, implement server-side concatenation using FFmpeg (`ffmpeg -i init.mp4 -i seg1.m4s -i seg2.m4s ... -c copy output.mp4`) and return a presigned URL to the concatenated file. OR generate a presigned URL for a temporary concatenated file. This is the main technical uncertainty in this phase. **The planner should allocate a dedicated task for the download endpoint implementation.**

2. **MinIO Accessibility from Browser**
   - What we know: MinIO endpoint is configured via `MINIO_ENDPOINT` env var. Default is `localhost:9000`.
   - What's unclear: In Docker Compose deployment, is MinIO exposed to the browser on a public port?
   - Recommendation: Check `docker-compose.yml` for MinIO port mapping. If MinIO is not browser-accessible, the download endpoint should proxy the file through the API server (contradicting D-10) or MinIO needs a public port.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond what's already in the project stack -- NestJS, Prisma, MinIO, Next.js all already running).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/api && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/api && npx vitest run --reporter=verbose && cd ../web && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REC-01 | Cross-camera recordings listing with pagination | integration | `cd apps/api && npx vitest run tests/recordings/cross-camera-list.test.ts -x` | No -- Wave 0 |
| REC-02 | Filter by camera, project, site, date range, status | integration | `cd apps/api && npx vitest run tests/recordings/cross-camera-list.test.ts -x` | No -- Wave 0 |
| REC-03 | Bulk delete multiple recordings | integration | `cd apps/api && npx vitest run tests/recordings/bulk-delete.test.ts -x` | No -- Wave 0 |
| REC-04 | Download recording via presigned URL | integration | `cd apps/api && npx vitest run tests/recordings/download.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && npx vitest run tests/recordings/ -x`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/api/tests/recordings/cross-camera-list.test.ts` -- covers REC-01, REC-02
- [ ] `apps/api/tests/recordings/bulk-delete.test.ts` -- covers REC-03
- [ ] `apps/api/tests/recordings/download.test.ts` -- covers REC-04

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Already handled by AuthGuard on recordings controller [VERIFIED: recordings.controller.ts line 31] |
| V3 Session Management | no | Already handled by session middleware |
| V4 Access Control | yes | Tenant isolation via `orgId` from ClsService + Prisma tenancy extension; recordings scoped to org [VERIFIED: recordings.service.ts uses TENANCY_CLIENT] |
| V5 Input Validation | yes | zod schema validation for all query params (recording-query.dto.ts); UUID validation for IDs |
| V6 Cryptography | no | Presigned URLs use MinIO's built-in HMAC signing |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant recording access | Information Disclosure | Prisma tenancy extension auto-filters by orgId [VERIFIED: codebase uses TENANCY_CLIENT] |
| Presigned URL leak (download link shared) | Information Disclosure | 4-hour expiry on presigned URLs; scoped to specific object [VERIFIED: minio.service.ts line 46] |
| Bulk delete without authorization | Tampering | AuthGuard + FeatureGuard already on controller; orgId scoping on delete [VERIFIED: recordings.controller.ts] |
| IDOR on recording ID in download endpoint | Information Disclosure | `getRecording(id, orgId)` checks org ownership before generating URL [VERIFIED: recordings.service.ts line 384] |

## Sources

### Primary (HIGH confidence)
- `apps/api/src/recordings/recordings.controller.ts` -- existing endpoints, guards, MinIO integration
- `apps/api/src/recordings/recordings.service.ts` -- existing query patterns, delete with MinIO cleanup
- `apps/api/src/recordings/minio.service.ts` -- presigned URL generation, bucket naming
- `apps/api/src/audit/audit.service.ts` -- server-side pagination pattern (skip/take + count)
- `apps/api/src/audit/dto/audit-query.dto.ts` -- zod query schema pattern
- `apps/api/src/prisma/schema.prisma` -- Recording, Camera, Site, Project models and relationships
- `apps/web/src/components/ui/data-table/data-table.tsx` -- DataTable component with server-side mode
- `apps/web/src/components/audit/audit-log-data-table.tsx` -- server-side pagination DataTable example
- `apps/web/src/app/admin/cameras/components/cameras-columns.tsx` -- column definition pattern
- `apps/web/src/components/pages/tenant-recordings-page.tsx` -- existing page to replace, source for StatusBadge/formatters
- `apps/web/src/hooks/use-recordings.ts` -- existing recording hooks (kept for per-camera tab)

### Secondary (MEDIUM confidence)
- `.planning/phases/12-recordings/12-CONTEXT.md` -- 17 locked decisions
- `.planning/phases/12-recordings/12-UI-SPEC.md` -- visual contract, component inventory, copywriting

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified in codebase
- Architecture: HIGH -- patterns directly observed in audit log and cameras DataTable implementations
- Pitfalls: HIGH -- based on actual code analysis (BigInt serialization, filter state confusion documented in codebase comments)
- Download endpoint: MEDIUM -- segment-based storage adds complexity for "download as file" feature

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable -- all patterns are established in codebase)
