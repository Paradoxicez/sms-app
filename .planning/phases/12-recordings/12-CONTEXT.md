# Phase 12: Recordings - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Dedicated recordings page showing recordings from all cameras with cross-camera filters, bulk delete, and download. Replaces existing per-camera-only recordings page with DataTable-based UI. Requires new backend API endpoint for cross-camera queries with server-side pagination.

</domain>

<decisions>
## Implementation Decisions

### Table Columns
- **D-01:** Full detail columns: Checkbox, Camera Name, Project, Site, Date, Time Range, Duration, Size, Status (badge), Actions ("...")
- **D-02:** Default sort: startedAt descending (newest first)
- **D-03:** Server-side pagination — backend handles page/pageSize with total count response

### Filters
- **D-04:** Full filter bar following Phase 8 DataTable toolbar pattern: Search + Camera faceted filter + Project faceted filter + Site faceted filter + DateRangePicker + Status faceted filter
- **D-05:** All faceted filters use Phase 8 DataTableFacetedFilter (chip buttons with popover multi-select)
- **D-06:** DateRangePicker uses Phase 8 component for start/end date filtering
- **D-07:** Filter state stored in URL query params (Phase 8 pattern — shareable links, back-button preservation)

### Quick Actions & Bulk Operations
- **D-08:** Row action "..." menu: Download (presigned URL), Delete (with AlertDialog confirmation) — 2 actions only
- **D-09:** Bulk delete via toolbar button — "Delete Selected (N)" appears when checkboxes selected, with AlertDialog confirmation before actual deletion
- **D-10:** Download uses presigned MinIO URLs — browser downloads directly from MinIO, not proxied through API server

### Page Layout
- **D-11:** Table-only layout — no inline player, no calendar, no timeline on this page
- **D-12:** Click camera name in row links to camera page (where per-camera recordings-tab with player/timeline/calendar exists)
- **D-13:** No calendar/timeline components on this page — DateRangePicker filter is sufficient for cross-camera browsing

### Backend API
- **D-14:** New endpoint: GET /api/recordings — cross-camera list with query params: page, pageSize, cameraId?, projectId?, siteId?, startDate?, endDate?, status?, search?
- **D-15:** Response format: { data: [...], total: number, page: number, pageSize: number } — includes joined camera name, project name, site name
- **D-16:** New endpoint: GET /api/recordings/:id/download — returns { url: 'presigned-minio-url' } for direct file download (separate from manifest endpoint used for HLS playback)
- **D-17:** Existing per-camera endpoints (GET /api/recordings/camera/:cameraId) remain unchanged — used by recordings-tab

### Claude's Discretion
- Loading skeleton design for DataTable
- Empty state when no recordings match filters
- Exact toolbar layout spacing
- Search field placeholder text
- Page size options (10/25/50)
- Bulk delete error handling (partial failure UX)
- Whether search queries camera name, project name, or both

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### DataTable System (Phase 8)
- `.planning/phases/08-foundation-components/08-CONTEXT.md` — DataTable architecture, column definitions, toolbar layout, faceted filter, pagination, row selection, DateRangePicker
- `apps/web/src/components/ui/data-table/` — DataTable component directory (DataTable, DataTableRowActions, DataTableColumnHeader, DataTablePagination, DataTableToolbar, DataTableFacetedFilter)
- `apps/web/src/components/ui/date-range-picker.tsx` — DateRangePicker component

### Existing Recordings Code (migration sources)
- `apps/web/src/components/pages/tenant-recordings-page.tsx` — Current recordings page (replace entirely with DataTable version)
- `apps/web/src/app/admin/cameras/components/recordings-tab.tsx` — Per-camera recordings tab with calendar, timeline, player (keep as-is — NOT migrated to this page)
- `apps/web/src/hooks/use-recordings.ts` — Recording hooks (useRecordingsList, deleteRecording, etc.)

### Backend API
- `apps/api/src/recordings/recordings.controller.ts` — Current per-camera endpoints (add new cross-camera endpoint here)
- `apps/api/src/recordings/recordings.service.ts` — Service layer (add cross-camera query method)
- `apps/api/src/recordings/manifest.service.ts` — Manifest generation (reference for download endpoint)

### Prior Phase Patterns
- `.planning/phases/10-admin-table-migrations/10-CONTEXT.md` — Table migration strategy (D-18: replace in-place, D-19: keep data fetching, D-20: column defs in "use client" files)
- `.planning/phases/11-camera-management/11-CONTEXT.md` — Camera table + quick actions pattern (reference for consistent UX)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- DataTable component system (Phase 8): sorting, filtering, pagination, row selection, row actions — core of this page
- DataTableFacetedFilter: chip-style filter buttons with popover multi-select — used for Camera, Project, Site, Status filters
- DateRangePicker: date range selection component — used for date filtering
- StatusBadge component from recordings-tab.tsx: badge styling for complete/recording/processing/error statuses — extract and reuse
- formatDuration, formatSize utilities: exist in both tenant-recordings-page.tsx and recordings-tab.tsx — consolidate into shared util

### Established Patterns
- Column definitions in separate "use client" files (Phase 8 D-02)
- Faceted filter with URL query param state (Phase 8 D-06)
- Server-side pagination for large datasets (Phase 8 D-08) — audit log already uses this pattern
- Row actions via "..." DropdownMenu (Phase 8 D-03)
- AlertDialog for destructive confirmations (used across camera management, recordings-tab)

### Integration Points
- Recordings page route: `/app/recordings` — already exists, currently renders tenant-recordings-page.tsx
- Admin recordings route: `/admin/recordings` — redirects to `/app/recordings`
- Navigation sidebar: recordings nav item already exists in nav-config.ts
- MinIO presigned URL generation: MinioService already exists in recordings module — extend for download endpoint

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches following Phase 8 DataTable patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-recordings*
*Context gathered: 2026-04-17*
