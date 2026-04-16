# Phase 8: Foundation Components - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Build reusable DataTable system (sorting, filtering, pagination, row selection, quick actions) and DatePicker/DateRangePicker components. These foundation components are consumed by 13+ pages in subsequent phases. No page migrations in this phase — only component creation.

</domain>

<decisions>
## Implementation Decisions

### DataTable Architecture
- **D-01:** Use @tanstack/react-table (headless) as the table logic engine + existing shadcn `<Table>` as the presentational layer
- **D-02:** Column definitions in separate "use client" files to avoid Next.js server/client component boundary issues
- **D-03:** Row actions via "..." MoreHorizontal button at the end of each row — opens DropdownMenu (same pattern as existing package-table and org-table)

### Toolbar & Filter
- **D-04:** Toolbar layout: search bar (left) + faceted filter buttons (center) + action buttons (right, e.g., Add, Bulk Delete)
- **D-05:** Faceted filter buttons — clickable chips like [Status ▼] [Role ▼] that open popover with multi-select checkboxes (Linear/Vercel pattern)
- **D-06:** Filter state stored in URL query params via Next.js `useSearchParams` + `useRouter` — no additional library needed. Enables shareable links and back-button preservation.

### Pagination
- **D-07:** Offset-based numbered pagination (Previous / 1 2 3 ... / Next) as the standard pattern across all tables
- **D-08:** DataTable supports both client-side and server-side pagination — client-side for small datasets (cameras, profiles), server-side for large datasets (recordings, audit logs)

### DatePicker
- **D-09:** Popover + Calendar pattern — button trigger opens popover showing the existing Calendar component (react-day-picker v9.14.0)
- **D-10:** Create two wrapper components: DatePicker (single date) and DateRangePicker (date range) — reusable across recordings, audit log, and any future date inputs
- **D-11:** Replace all native `<input type="date">` instances (3 files: tenant-audit-log-page, platform-audit-log-page, tenant-recordings-page)

### Row Selection
- **D-12:** DataTable supports row selection via checkboxes (header checkbox for select-all-on-page) — used by recordings bulk delete and other future bulk operations

### Claude's Discretion
- Loading skeleton design for DataTable
- Exact spacing and typography in toolbar
- Page size options (10/25/50)
- Empty state design for filtered-no-results vs no-data

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### DataTable
- `.planning/research/STACK.md` — TanStack Table v8.21.x recommendation, shadcn integration pattern
- `.planning/research/ARCHITECTURE.md` — Component hierarchy, 20 existing table files, column boundary pattern
- `.planning/research/PITFALLS.md` — Next.js server/client boundary issue with column definitions, base-ui render prop pattern

### Existing Components
- `apps/web/src/components/ui/table.tsx` — Base shadcn Table component (presentational only, 117 lines)
- `apps/web/src/components/ui/calendar.tsx` — Calendar component (react-day-picker v9.14.0, 221 lines)
- `apps/web/src/components/ui/sidebar.tsx` — shadcn Sidebar (exists but unused — Phase 9 scope)

### Existing Table Implementations (migration targets for Phase 10+)
- `apps/web/src/components/audit/audit-log-table.tsx` — Cursor-based "Load more" pagination
- `apps/web/src/components/api-key-table.tsx` — Status badges, dropdown actions
- `apps/web/src/components/dashboard/camera-status-table.tsx` — Status badges
- `apps/web/src/components/webhook-delivery-log.tsx` — Status tracking
- `apps/web/src/app/admin/packages/components/package-table.tsx` — Has "..." dropdown actions (reference pattern)
- `apps/web/src/app/app/team/components/team-table.tsx` — Team member management
- `apps/web/src/app/admin/organizations/components/org-table.tsx` — Has dropdown actions (reference pattern)
- `apps/web/src/app/admin/cluster/components/node-table.tsx`
- `apps/web/src/app/admin/cameras/components/sessions-table.tsx`
- `apps/web/src/app/admin/users/components/platform-users-table.tsx`

### Native Date Inputs to Replace
- `apps/web/src/components/pages/tenant-audit-log-page.tsx` (lines 157-177)
- `apps/web/src/components/pages/platform-audit-log-page.tsx`
- `apps/web/src/components/pages/tenant-recordings-page.tsx`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `table.tsx` — shadcn Table primitives (Table, TableHeader, TableBody, TableRow, TableCell, etc.) — use as presentational base for DataTable
- `calendar.tsx` — Full Calendar component with react-day-picker v9.14.0 — supports single, range, multiple date selection
- `date-fns` v4.1.0 — Date formatting utilities already installed
- `lucide-react` — Icons including MoreHorizontal, ChevronLeft, ChevronRight for pagination
- DropdownMenu component — exists and used in package-table for row actions

### Established Patterns
- All 10 existing tables compose from shadcn `<Table>` primitives
- Status badges use colored Badge variants (green, red, amber, blue)
- Loading states via Skeleton components
- Empty states with icons and messaging
- formatRelativeTime and formatDate utilities for date display
- `cn()` utility for className merging (clsx + tailwind-merge)
- base-ui render prop pattern (NOT Radix asChild) across 23 components

### Integration Points
- DataTable component goes in `apps/web/src/components/ui/data-table.tsx`
- DatePicker/DateRangePicker go in `apps/web/src/components/ui/date-picker.tsx`
- Column definitions per-table go alongside existing table components
- Pagination component in `apps/web/src/components/ui/pagination.tsx`
- @tanstack/react-table needs to be installed in apps/web/package.json

</code_context>

<specifics>
## Specific Ideas

- Filter buttons should look like Linear/Vercel style — chip-like buttons that show active filter count
- Pagination should show total count and current range (e.g., "Showing 1-10 of 234")
- DataTable toolbar should be composable — each page can configure which filters/actions to show

</specifics>

<deferred>
## Deferred Ideas

- "Redesign camera detail page" todo — belongs to Phase 11 (Camera Management), not foundation
- Column visibility toggle (show/hide columns) — nice-to-have, add later if needed
- Column resizing — not needed for v1.1
- Export to CSV — not in scope for this milestone

</deferred>

---

*Phase: 08-foundation-components*
*Context gathered: 2026-04-17*
