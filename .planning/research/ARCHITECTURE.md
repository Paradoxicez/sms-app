# Architecture Patterns: v1.1 UI Overhaul

**Domain:** UI component architecture for surveillance management SaaS
**Researched:** 2026-04-17

## Current Architecture Snapshot

### What Exists

```
apps/web/src/
  components/
    ui/              # 33 shadcn/ui primitives (base-ui based, not Radix)
    nav/             # NavShell, PlatformNav, TenantNav (custom sidebar)
    pages/           # 14 page-level components (monolithic)
    map/             # CameraMap + Leaflet (dynamic import, SSR workaround)
    audit/           # AuditLogTable + AuditDetailDialog
    dashboard/       # CameraStatusTable, stat cards
    notifications/   # NotificationBell
  hooks/             # 11 hooks (camera-status, features, recordings, etc.)
  app/
    admin/           # Super admin portal (15 route groups)
    app/             # Tenant portal (11 route groups)
    (auth)/          # Login
```

### Current Problems Driving the Overhaul

1. **20 files with hand-rolled tables** -- each reimplements sorting, filtering, pagination, loading/empty states. No shared abstraction.
2. **NavShell ignores shadcn Sidebar component** -- `ui/sidebar.tsx` exists with full collapsible support (cookie persistence, keyboard shortcut Ctrl+B, expanded/collapsed state) but is completely unused. NavShell is a 178-line custom implementation.
3. **Native `<input type="date">` in Recordings page** -- inconsistent with the `react-day-picker` Calendar component already in `ui/calendar.tsx`.
4. **No quick-action pattern** -- Projects page has inline DropdownMenu for edit/delete, but Cameras page has no row actions at all. No consistent "..." menu.
5. **Stream Profiles uses Card grid, not Table** -- inconsistent with every other listing page.
6. **No tree viewer component** -- Projects drill down via `[id]` route with breadcrumbs, no split-panel navigation.
7. **No card/grid view toggle** -- Camera listing is table-only, no preview cards.
8. **Bulk delete uses client-side Promise.all** -- Recordings page iterates N individual DELETE requests instead of a single bulk API call.

## Recommended Architecture

### New Component Hierarchy

```
components/
  ui/                        # shadcn primitives (EXISTING, unchanged)
    sidebar.tsx              # Already exists -- ADOPT for collapsible sidebar
    sheet.tsx                # Already exists -- USE for quick-action sheets
    calendar.tsx             # Already exists -- USE in DatePicker wrapper
    table.tsx                # Keep as base HTML table primitive
    ...33 files total

  data-table/                # NEW: Reusable DataTable system (7 files)
    data-table.tsx           # Core: TanStack Table + shadcn Table rendering
    data-table-toolbar.tsx   # Search, faceted filters, view toggle, bulk actions
    data-table-pagination.tsx# Page size selector, page nav, item count
    data-table-column-header.tsx # Sortable column header with arrow icons
    data-table-row-actions.tsx   # "..." DropdownMenu per row (configurable)
    data-table-faceted-filter.tsx # Multi-select filter popover (status, type)
    data-table-view-options.tsx  # Column visibility toggle

  date-picker/               # NEW: Unified date selection (2 files)
    date-picker.tsx          # Single date (wraps Calendar + Popover)
    date-range-picker.tsx    # Date range (wraps Calendar mode="range")

  tree-viewer/               # NEW: Hierarchical navigation (3 files)
    tree-viewer.tsx          # Split panel: tree nav left, content right
    tree-node.tsx            # Expandable node (Project > Site > Camera)
    tree-context.tsx         # Selected node state, expand/collapse

  camera-card/               # NEW: Card view for cameras (3 files)
    camera-card.tsx          # Single camera card with status, HLS preview
    camera-card-grid.tsx     # Responsive grid layout wrapper
    hls-preview.tsx          # Lightweight HLS player (auto-play muted)

  nav/                       # MODIFY: Replace NavShell with shadcn Sidebar
    app-sidebar.tsx          # Wraps SidebarProvider from ui/sidebar.tsx
    sidebar-nav-items.tsx    # Extracted nav item config arrays
    sidebar-user-menu.tsx    # User dropdown at bottom of sidebar
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `DataTable` | Renders any tabular data with sorting, filtering, pagination, selection | Page components provide `columns` + `data`; all state via TanStack Table instance |
| `DataTableToolbar` | Filter controls, search input, view toggle, bulk action buttons | Reads/writes TanStack Table state; emits view-mode changes |
| `DataTableRowActions` | Per-row "..." menu with configurable actions | Page provides action config; triggers Sheet opens, API calls, navigation |
| `DatePicker` / `DateRangePicker` | Consistent date selection UI | Forms and filter bars; wraps existing `ui/calendar.tsx` + `ui/popover.tsx` |
| `TreeViewer` | Split-panel hierarchical navigation | Fetches tree data via `apiFetch`; emits selected node to parent |
| `CameraCard` + `HlsPreview` | Camera preview card with live HLS thumbnail | `hls.js` instance per card; `useCameraStatus` hook for real-time status |
| `AppSidebar` | Collapsible sidebar navigation with cookie persistence | `SidebarProvider` context from `ui/sidebar.tsx`; role-based nav filtering |

### Data Flow: Page -> DataTable

```
Page Component (e.g., tenant-cameras-page.tsx)
  |
  |- Fetches data via apiFetch() (existing pattern, no change)
  |- Defines TanStack Table columns with ColumnDef<T>[]
  |- Passes data + columns to <DataTable>
  |
  DataTable
    |- useReactTable() creates table instance (sorting, filtering, pagination state)
    |- <DataTableToolbar> renders filter controls from table.getColumn() facets
    |- <Table> renders rows via table.getRowModel().rows
    |- <DataTablePagination> renders page controls via table.getPageCount()
    |
    Row Actions (per-row "..." menu)
      |- Edit -> Opens <Sheet> with form (slide-in from right)
      |- Delete -> Opens <AlertDialog> for confirmation
      |- Navigate -> router.push to detail page
      |- Quick actions -> Direct API call (start/stop stream, toggle recording)
```

### Data Flow: Real-Time Camera Status + DataTable

```
Socket.IO (/camera-status namespace)
  |
  |- useCameraStatus(orgId, onStatusChange) hook (EXISTING, no change)
  |- Updates cameras[] state via setCameras()
  |
  DataTable re-renders affected rows (TanStack Table observes data prop)
  |
  |- Status column cell re-renders with new badge
  |- No full table re-render (React reconciliation handles row-level updates)
```

This works because TanStack Table's `data` prop is reactive -- when the array reference changes (via `setCameras`), only affected rows re-render.

## Patterns to Follow

### Pattern 1: TanStack Table Column Definitions

Use `@tanstack/react-table` v8 (headless, zero UI) paired with existing shadcn `<Table>` primitives. This is the standard shadcn/ui integration pattern.

**What:** Define typed column arrays per page, pass to reusable `<DataTable>`.
**When:** Every page that shows tabular data (20 current files).

```typescript
// Example: cameras/columns.tsx
import { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTableRowActions } from "@/components/data-table/data-table-row-actions";

export const cameraColumns: ColumnDef<Camera>[] = [
  {
    id: "select",
    header: ({ table }) => <Checkbox checked={table.getIsAllPageRowsSelected()} />,
    cell: ({ row }) => <Checkbox checked={row.getIsSelected()} />,
    enableSorting: false,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <CameraStatusBadge status={row.getValue("status")} />,
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <Link href={`/app/cameras/${row.original.id}`} className="font-medium hover:underline">
        {row.getValue("name")}
      </Link>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <CameraRowActions camera={row.original} />
    ),
  },
];
```

```typescript
// data-table.tsx -- the reusable core component
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  toolbar?: (table: Table<TData>) => React.ReactNode;
  emptyIcon?: React.ComponentType<{ className?: string }>;
  emptyTitle?: string;
  emptyDescription?: string;
  isLoading?: boolean;
  pageSize?: number;
}
```

**Why TanStack Table:**
- Headless -- renders through existing shadcn `<Table>` markup (zero new UI library)
- TypeScript-first with full generic support
- Column-level filter functions enable faceted filters (status, type) without manual state
- Built-in sorting, pagination, row selection -- replaces 20 hand-rolled implementations
- Standard pattern recommended by shadcn/ui documentation

### Pattern 2: Sheet for Quick Actions

**What:** Use right-side `<Sheet>` (already in `ui/sheet.tsx`) for quick edit/create forms.
**When:** Edit camera settings, assign stream profile, view embed code, configure policy.
**Why over Dialog:** Sheet preserves table context (visible behind overlay), better for multi-field forms, supports scroll for long content.

```typescript
function CameraRowActions({ camera }: { camera: Camera }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          <DropdownMenuItem>View Stream</DropdownMenuItem>
          <DropdownMenuItem>Embed Code</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit Camera</SheetTitle>
          </SheetHeader>
          <CameraEditForm camera={camera} onSuccess={() => setEditOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
```

### Pattern 3: Collapsible Sidebar via Existing shadcn Sidebar

**What:** Replace custom `NavShell` with `SidebarProvider` + `Sidebar` from `ui/sidebar.tsx`.
**When:** Foundational change -- do early, affects all layout components.

The existing `ui/sidebar.tsx` already provides:
- **Cookie persistence:** `sidebar_state` cookie with 7-day TTL
- **Keyboard shortcut:** Ctrl+B toggles sidebar
- **Mobile:** Auto-switches to Sheet overlay on mobile
- **CSS variables:** `--sidebar-width: 16rem`, `--sidebar-width-icon: 3rem`
- **State attribute:** `data-state="expanded"|"collapsed"` for Tailwind styling
- **Full component set:** `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarFooter`, etc.

```typescript
// layouts: admin/layout.tsx and app/layout.tsx
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/nav/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar variant="tenant" memberRole={memberRole} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          {/* breadcrumbs, notifications */}
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```

### Pattern 4: Tree Viewer with Split Panel

**What:** Split-panel layout with tree navigation left, DataTable right.
**When:** Projects page (Project > Site > Camera hierarchy), Map page (filter tree).

```typescript
// Requires: npx shadcn@latest add resizable
// (adds react-resizable-panels dependency)

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

export function TreeViewer({ data, renderContent }: TreeViewerProps) {
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

  return (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
        <ScrollArea className="h-full">
          <TreeNav data={data} selected={selectedNode} onSelect={setSelectedNode} />
        </ScrollArea>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={75}>
        {renderContent(selectedNode)}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
```

**Note:** `ui/resizable` is NOT currently installed. Needs `npx shadcn@latest add resizable`.

### Pattern 5: View Toggle (Table vs Card Grid)

**What:** Toggle between table view and card grid on Camera page.
**When:** Camera listing -- cards show HLS live preview thumbnails.

```typescript
// Integrated into DataTableToolbar
<ToggleGroup type="single" value={view} onValueChange={setView}>
  <ToggleGroupItem value="table"><ListIcon /></ToggleGroupItem>
  <ToggleGroupItem value="grid"><LayoutGridIcon /></ToggleGroupItem>
</ToggleGroup>

// Page renders conditionally
{view === "table" ? (
  <DataTable columns={cameraColumns} data={cameras} />
) : (
  <CameraCardGrid cameras={cameras} />
)}
```

### Pattern 6: HLS Preview in Camera Cards

**What:** Lightweight HLS player that auto-plays muted inside camera cards.
**When:** Camera card grid view only.

```typescript
// hls-preview.tsx -- reuses existing hls.js (v1.6.15) dependency
export function HlsPreview({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    if (!videoRef.current || !url) return;
    const hls = new Hls({ maxBufferLength: 5, maxMaxBufferLength: 10 });
    hls.loadSource(url);
    hls.attachMedia(videoRef.current);
    hlsRef.current = hls;
    return () => { hls.destroy(); hlsRef.current = null; };
  }, [url]);

  return <video ref={videoRef} autoPlay muted playsInline className="rounded bg-black object-cover" />;
}
```

**Critical constraint:** Limit visible HLS previews to 6-9 cards per page. Each HLS instance opens persistent connections and downloads segments continuously. Use pagination (not scroll) in the card grid. Consider IntersectionObserver for lazy-load if scroll is needed.

### Pattern 7: DatePicker Wrapper

**What:** Popover-triggered Calendar replacing native `<input type="date">`.
**When:** Recordings filters, audit log date range, any date input.

```typescript
// date-picker.tsx
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";

export function DatePicker({ value, onChange }: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} />
      </PopoverContent>
    </Popover>
  );
}
```

No new dependencies -- `date-fns` (v4.1.0), `react-day-picker` (v9.14.0), and `ui/calendar.tsx` all already exist.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Mixed Client/Server Pagination

**What:** Using TanStack Table's client-side pagination alongside API `?page=N` pagination.
**Why bad:** Double pagination logic, wrong total counts, state conflicts between table and URL.
**Instead:** Choose ONE approach per table:
- **Most tables (cameras, projects, profiles, API keys):** Fetch all rows, let TanStack Table handle everything client-side. Current data volumes (<500 rows) make this fine.
- **Audit log and cross-camera recordings:** Use TanStack Table's `manualPagination` mode with server-side `?skip=N&take=N` API. Pass `pageCount` from API response.

### Anti-Pattern 2: Multiple Uncontrolled HLS Instances

**What:** Rendering 20+ camera cards each with an active HLS stream.
**Why bad:** Browser tab crashes. Each hls.js instance buffers 10-30s of video, creates 3+ concurrent HTTP requests for segment downloads. 20 cards = 60+ parallel requests.
**Instead:** Paginate card grid to 6-9 per page. Only mount `<HlsPreview>` for visible cards. Use IntersectionObserver for lazy destroy/create if scrollable layout is needed later.

### Anti-Pattern 3: Prop-Drilling Action Handlers Through Columns

**What:** Passing `onEdit`, `onDelete`, `onStartStream`, `onStopStream` as props through column definitions.
**Why bad:** Columns become coupled to specific parent pages. Cannot reuse camera columns between admin and tenant views.
**Instead:** Define row actions as a separate component (`CameraRowActions`) that reads `row.original` and calls APIs directly. Each page can provide a different row-actions component via the column definition.

### Anti-Pattern 4: Rebuilding the Sidebar From Scratch

**What:** Writing a new collapsible sidebar instead of using the existing `ui/sidebar.tsx`.
**Why bad:** `ui/sidebar.tsx` is 700+ lines of well-tested shadcn code handling mobile sheet, keyboard shortcuts, cookie persistence, animation, and icon-only collapse. Reimplementing wastes days and introduces bugs.
**Instead:** Refactor `NavShell` to wrap `SidebarProvider` + `Sidebar`. Extract nav item configs into data arrays filtered by role.

### Anti-Pattern 5: Tree Selection State in URL

**What:** Encoding tree-selected node (project/site) in URL search params.
**Why bad:** Every tree click triggers App Router navigation, which re-renders layout and causes visible loading states. Tree interaction should feel instant.
**Instead:** Keep tree selection in React state (useState/useContext). Only update URL when user navigates to a detail page or the selection should be bookmarkable.

## New Dependencies Required

| Package | Version | Purpose | Install Command |
|---------|---------|---------|-----------------|
| `@tanstack/react-table` | ^8.x | Headless table logic (sorting, filtering, pagination, selection) | `npm install @tanstack/react-table` |
| `react-resizable-panels` | ^2.x | Tree viewer split panel | `npx shadcn@latest add resizable` |

**Already installed, no action needed:**
- `date-fns` v4.1.0 -- date formatting for DatePicker
- `react-day-picker` v9.14.0 -- Calendar component backing
- `hls.js` v1.6.15 -- HLS preview in camera cards
- `lucide-react` v1.8.0 -- icons for column headers, actions, toggles
- `sonner` v2.0.7 -- toast notifications for action confirmations

## Integration Map: Existing Pages -> New Components

### Pages Getting DataTable (20 files, ordered by migration complexity)

| Page File | Current Pattern | New Components Used | Complexity |
|-----------|----------------|---------------------|------------|
| `tenant-projects-page.tsx` | Table + DropdownMenu | DataTable + RowActions | Low |
| `admin/projects/[id]/page.tsx` | Table + DropdownMenu (sites) | DataTable + RowActions | Low |
| `tenant-policies-page.tsx` | Table | DataTable + RowActions | Low |
| `api-key-table.tsx` | Table component | DataTable + RowActions | Low |
| `webhook-delivery-log.tsx` | Table | DataTable (read-only) | Low |
| `org-table.tsx` | Table | DataTable + RowActions | Low |
| `package-table.tsx` | Table | DataTable + RowActions | Low |
| `platform-users-table.tsx` | Table | DataTable + RowActions | Low |
| `node-table.tsx` | Table | DataTable (read-only) | Low |
| `team-table.tsx` | Table | DataTable + RowActions | Low |
| `tenant-developer-webhooks-page.tsx` | Table | DataTable + RowActions | Low |
| `sessions-table.tsx` | Table | DataTable (read-only) | Low |
| `tenant-cameras-page.tsx` | Table + custom filter | DataTable + FacetedFilter + ViewToggle + CardGrid | Medium |
| `admin cameras` | Table | DataTable + FacetedFilter + RowActions | Medium |
| `tenant-stream-profiles-page.tsx` | Card grid | DataTable + RowActions (layout change) | Medium |
| `audit-log-table.tsx` | Table + load-more | DataTable + server-side pagination | Medium |
| `tenant-recordings-page.tsx` | Table + native date + checkbox | DataTable + DateRangePicker + bulk actions | Medium |
| `platform-audit-log-page.tsx` | Table + load-more | DataTable + server-side pagination | Medium |
| `camera-status-table.tsx` | Dashboard table | Keep simple (not worth DataTable overhead) | Skip |
| `recordings-tab.tsx` | Detail tab table | DataTable (reuse recording columns) | Low |

### Socket.IO Integration (No Changes Needed)

The existing `useCameraStatus` hook updates `cameras` state. TanStack Table's `data` prop automatically reflects state changes:

```typescript
const [cameras, setCameras] = useState<Camera[]>([]);
useCameraStatus(orgId, (event) => {
  setCameras(prev => prev.map(c =>
    c.id === event.cameraId ? { ...c, status: event.status } : c
  ));
});
// DataTable re-renders only affected rows
return <DataTable columns={cameraColumns} data={cameras} />;
```

### Backend API Additions Required

| Endpoint | Purpose | Blocking Which UI Feature |
|----------|---------|--------------------------|
| `GET /api/recordings?cameraId=&projectId=&dateFrom=&dateTo=&status=&skip=&take=` | Cross-camera recordings with server-side filtering | Dedicated recordings page |
| `DELETE /api/recordings/bulk` (body: `{ ids: string[] }`) | Atomic bulk delete (replaces client-side Promise.all) | Recordings bulk delete |
| `GET /api/recordings/:id/download-url` | Presigned MinIO URL for clip download | Recordings download button |

## Suggested Build Order (Dependency-Driven)

```
Phase 1: Foundation Components (no page changes yet)
  1. npm install @tanstack/react-table
  2. Build data-table/ system (7 files)
     - data-table.tsx, toolbar, pagination, column-header, row-actions,
       faceted-filter, view-options
  3. Build date-picker/ (2 files)
     - date-picker.tsx, date-range-picker.tsx
  4. Build shared empty-state component (DRY 14 identical empty states)

Phase 2: Sidebar Overhaul (layout-level, affects all pages)
  5. Build app-sidebar.tsx wrapping ui/sidebar.tsx SidebarProvider
  6. Extract nav configs from PlatformNav + TenantNav into data arrays
  7. Update admin/layout.tsx to use SidebarProvider + AppSidebar
  8. Update app/layout.tsx to use SidebarProvider + AppSidebar
  9. Remove NavShell and old sidebar-nav.tsx

Phase 3: Simple Table Migrations (10 pages, low risk, high volume)
  10. Define column files for each: projects, sites, policies, api-keys,
      webhooks, orgs, packages, users, cluster-nodes, team
  11. Replace manual Table usage with <DataTable> in each page
  12. Add "..." row actions with Sheet for quick edit where applicable

Phase 4: Complex Feature Pages
  13. Cameras table: faceted status filter + row actions menu
       (Edit, Stream Profile, Disable, Delete, View Stream, Record, Embed Code)
  14. Camera card view: build camera-card/, hls-preview.tsx, view toggle
  15. Stream Profiles: convert card grid to DataTable with row actions
  16. Recordings page: DateRangePicker, cross-camera filter, bulk delete,
      download clips (needs backend API additions)
  17. Audit Log: server-side pagination via manualPagination

Phase 5: Tree Viewer (new layout pattern)
  18. npx shadcn@latest add resizable
  19. Build tree-viewer/ components (3 files)
  20. Projects page: split panel with tree nav + DataTable
  21. Map page: tree filter sidebar + existing CameraMap

Phase 6: View Stream + Map Enhancements + Login
  22. View Stream page: tabbed layout (Preview, Policies, Embed, Activity)
  23. Map camera preview popup (hover/click on marker)
  24. Map drag-drop marker for lat/long assignment
  25. Login page redesign with remember-me checkbox
```

**Phase ordering rationale:**
- **Phase 1 first** because DataTable and DatePicker are consumed by 13+ pages. Building foundations before migrations prevents rework.
- **Phase 2 second** because sidebar is a layout-level change. Easier to do before modifying individual page components (avoids merge conflicts).
- **Phase 3 before Phase 4** because simple migrations (10 pages) validate the DataTable API design before tackling complex cases. If the DataTable interface needs adjustment, fix it while only 10 pages use it, not 17.
- **Phase 4 before Phase 5** because camera table/card view and recordings are higher value than tree viewer, and recordings requires backend API additions (which can be built in parallel).
- **Phase 5 near end** because tree viewer is the most complex new UI pattern and has the smallest dependency footprint (only Projects and Map pages).
- **Phase 6 last** because View Stream page, map enhancements, and login redesign are self-contained features with no downstream dependencies.

## Sources

- Codebase inspection: 20 table files, 14 page components, nav system, hooks, ui primitives (HIGH confidence -- direct code review)
- `ui/sidebar.tsx` in codebase: full SidebarProvider with cookie persistence, Ctrl+B shortcut, mobile sheet, icon collapse (HIGH confidence)
- `ui/calendar.tsx` + `react-day-picker` v9 in package.json (HIGH confidence)
- `ui/sheet.tsx` based on @base-ui/react Dialog (HIGH confidence)
- TanStack Table v8: headless, TypeScript-first table library, standard shadcn/ui integration (HIGH confidence)
- `react-resizable-panels`: shadcn's resizable component dependency (HIGH confidence)
- hls.js v1.6.15 already installed in package.json (HIGH confidence)
