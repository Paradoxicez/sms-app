# Technology Stack: v1.1 UI Overhaul

**Project:** SMS Platform -- UI Overhaul Milestone
**Researched:** 2026-04-17
**Overall confidence:** HIGH

## Existing Stack (DO NOT change)

Already installed and validated in v1.0:

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.x | App Router, SSR |
| React | 19.x | UI framework |
| shadcn/ui | 4.2.0 (base-nova style, base-ui primitives) | Component library |
| Tailwind CSS | 4.2.x | Styling |
| react-day-picker | 9.14.0 | Calendar/datepicker (used by shadcn Calendar) |
| Leaflet + react-leaflet | 1.9.4 / 5.0.0 | Maps |
| leaflet.markercluster | 1.5.3 | Map marker clustering |
| hls.js | 1.6.15 | HLS video playback |
| Socket.IO client | 4.8.3 | Real-time updates |
| lucide-react | 1.8.0 | Icons |
| react-hook-form + zod | 7.72.1 / 4.3.6 | Forms and validation |
| cmdk | 1.1.1 | Command palette |
| recharts | 3.8.0 | Charts |
| date-fns | 4.1.0 | Date utilities |
| sonner | 2.0.7 | Toast notifications |
| class-variance-authority | 0.7.1 | Component variants |

### Existing shadcn/ui Components (already installed)

```
alert-dialog, avatar, badge, breadcrumb, button, calendar, card, chart,
collapsible, command, dialog, dropdown-menu, hover-card, input-group,
input, label, popover, progress, radio-group, scroll-area, select,
separator, sheet, sidebar, skeleton, slider, sonner, switch, table,
tabs, textarea, toggle, tooltip
```

---

## New Dependencies Required

### 1. @tanstack/react-table (REQUIRED -- single new npm dependency)

| Property | Value |
|----------|-------|
| Package | `@tanstack/react-table` |
| Version | `^8.21.3` (stable, latest) |
| Purpose | Headless table logic: sorting, filtering, pagination, column visibility, row selection, row actions |
| Why | shadcn's Data Table pattern is built on TanStack Table. The existing `table.tsx` is only the presentational shell (HTML table elements with styling). TanStack provides ALL interactive logic: column sorting, multi-column filtering, pagination state, row selection for bulk actions, column visibility toggles. This is the standard approach documented at ui.shadcn.com/docs/components/base/data-table. Every table page (cameras, stream profiles, recordings, API keys, users, audit log, webhooks) needs this. |
| Confidence | HIGH -- official shadcn documentation prescribes this exact pairing |

**Do NOT use v9.0.0-alpha.** The alpha (released April 2026) has breaking API changes and the shadcn data-table pattern targets v8 stable. Stick with 8.21.x.

---

## Conditionally Required

### 2. @dnd-kit/react (MAYBE -- depends on UX design)

| Property | Value |
|----------|-------|
| Package | `@dnd-kit/react` |
| Version | `^0.4.0` |
| Purpose | Drag camera from sidebar list onto map to set lat/long |
| Confidence | MEDIUM |

**When this IS needed:** If the "drag-drop marker placement" feature means dragging a camera item from a sidebar list and dropping it onto the map to assign coordinates.

**When this is NOT needed:** If the feature means either (a) clicking on the map to place a marker, or (b) dragging an already-placed marker to reposition it. Both are handled natively by react-leaflet:
- Click-to-place: `useMapEvents({ click: (e) => setPosition(e.latlng) })`
- Drag existing marker: `<Marker draggable eventHandlers={{ dragend: ... }} />`

**Recommendation:** Start WITHOUT @dnd-kit. Implement click-to-place + draggable markers first (zero new deps). Only add @dnd-kit if the UX specifically requires dragging from a list panel onto the map.

---

## NO New Dependencies Needed For These Features

### Unified Data Tables (filter, pagination, sorting, quick actions)

| Need | Covered By |
|------|------------|
| Table presentation | `table.tsx` (shadcn, already installed) |
| Interactive logic | `@tanstack/react-table` (new, see above) |
| Quick actions dropdown | `dropdown-menu.tsx` (already installed) |
| Filter inputs | `input.tsx`, `select.tsx`, `popover.tsx`, `command.tsx` (all installed) |
| Search/filter popover | `popover.tsx` + `command.tsx` (already installed) |
| Pagination controls | Add `pagination` via shadcn CLI (see below) |

### Tree Viewer (Project > Site > Camera hierarchy)

| Need | Covered By |
|------|------------|
| Expand/collapse nodes | `collapsible.tsx` (already installed) |
| Scrollable tree | `scroll-area.tsx` (already installed) |
| Tree node icons | lucide-react: `ChevronRight`, `Folder`, `FolderOpen`, `Camera`, `Building2`, `MapPin` |
| Selection state | React useState/useContext |

Build a recursive `<TreeNode>` component. The hierarchy is only 3 levels deep -- no tree library warranted. A custom 50-line component with shadcn Collapsible is simpler and more maintainable than any tree library.

### Collapsible Sidebar

The existing `sidebar.tsx` already has FULL collapsible support:
- `SidebarProvider` with `open`/`setOpen` state management
- Cookie-based persistence (`sidebar_state` cookie, 7-day expiry)
- `collapsible` prop: `"offcanvas"` | `"icon"` | `"none"`
- Mobile: auto-switches to Sheet overlay
- `SidebarTrigger` toggle button component

**Work needed:** Set `collapsible="icon"` on the Sidebar component and ensure nav items render icon-only when collapsed. This is pure configuration -- zero new dependencies.

### Slide-in Panels / Sheet Dialogs

`sheet.tsx` is already installed (base-ui Dialog underneath). Use for:
- Camera quick actions side panel
- View Stream detail panel
- Bulk edit / bulk delete confirmation
- Any slide-in overlay that's not a full page navigation

### Card View with Live HLS Preview Grid

| Need | Covered By |
|------|------------|
| Card container | `card.tsx` (already installed) |
| HLS playback | `hls.js` (already installed) |
| Grid layout | Tailwind CSS grid classes |
| Table/Card toggle | `toggle-group` component (add via CLI) or shadcn `Tabs` |
| View toggle icons | lucide-react: `LayoutGrid`, `LayoutList` |

**Performance note:** Lazy-load HLS instances using IntersectionObserver. Only initialize hls.js for cards in the viewport. Cap concurrent HLS players at 6-9 to avoid browser connection limits and memory issues.

### Unified Datepicker (single/range/multiple)

react-day-picker v9 (already installed at 9.14.0) and `calendar.tsx` (already installed) natively support:
- `mode="single"` -- single date selection
- `mode="range"` -- date range with start/end
- `mode="multiple"` -- multiple non-consecutive dates
- `numberOfMonths={2}` -- two-month view for range picking

Build a `<DatePicker>` wrapper composing: `Popover` + `Calendar` + `date-fns` format. One component, three modes via prop. Zero new dependencies.

### Map Features (drag-drop markers, preview popup, filter)

| Need | Covered By |
|------|------------|
| Draggable markers | react-leaflet `<Marker draggable>` + `dragend` event (native) |
| Click-to-place | `useMapEvents` hook from react-leaflet (native) |
| Camera preview popup | react-leaflet `<Popup>` + hls.js mini-player |
| Hover tooltip | react-leaflet `<Tooltip>` (native) |
| Marker clustering | `leaflet.markercluster` (already installed) |
| Filter sidebar | shadcn `Select`, `Input`, `Badge` (all installed) |

### Login Page Redesign

All form components already available: `input.tsx`, `button.tsx`, `label.tsx`, `card.tsx`. Add `checkbox` via shadcn CLI for "Remember me" toggle.

---

## shadcn Components to Add via CLI

These are NOT npm dependencies. shadcn components are copy-pasted source files added via the CLI:

```bash
cd apps/web

# Table pagination controls
npx shadcn@latest add pagination

# Login "remember me" checkbox
npx shadcn@latest add checkbox

# Table/card view toggle
npx shadcn@latest add toggle-group

# Split panel for tree + table layout
npx shadcn@latest add resizable
```

**Optional (add if needed during implementation):**
```bash
# Right-click context menu for table rows
npx shadcn@latest add context-menu

# Multi-select for bulk filter chips
npx shadcn@latest add badge  # already installed
```

---

## Installation Summary

```bash
cd apps/web

# === REQUIRED: One new npm dependency ===
npm install @tanstack/react-table@^8.21.3

# === CONDITIONAL: Only if drag-from-list-to-map UX ===
# npm install @dnd-kit/react@^0.4.0

# === shadcn components (CLI, not npm) ===
npx shadcn@latest add pagination checkbox toggle-group resizable
```

**Total new npm dependencies: 1 (or 2 if @dnd-kit needed)**

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| ag-grid / react-data-grid | Heavy (200KB+), opinionated styling clashes with shadcn, paid enterprise features | @tanstack/react-table + shadcn Table |
| MUI DataGrid / Ant Design Table | Wrong design system, would clash with base-ui primitives | @tanstack/react-table + shadcn Table |
| react-beautiful-dnd | Deprecated and unmaintained since 2024, no React 19 support | @dnd-kit/react if DnD needed |
| react-dnd | Complex multi-backend API, HTML5 backend issues | @dnd-kit/react if DnD needed |
| react-arborist / react-treeview | Over-engineering for 3-level hierarchy, adds bundle weight for no gain | Custom component with shadcn Collapsible |
| react-datepicker | Already have react-day-picker v9 via shadcn Calendar with full feature parity | Existing react-day-picker v9 |
| react-virtualized / react-window | Premature optimization; tables will use server-side pagination (max 50 rows visible). Add only if a specific page needs 1000+ visible rows | Native scrolling + pagination |
| framer-motion | Already have tw-animate-css. Sidebar collapse and sheet transitions use CSS transitions. Only consider if complex spring/gesture animations needed | Tailwind CSS transitions + tw-animate-css |
| react-resizable-panels (directly) | shadcn `resizable` component wraps this already with proper styling | `npx shadcn@latest add resizable` |
| nuqs (URL state management) | Nice-to-have for table filter persistence via URL, but adds complexity. Use React state first, add nuqs only if URL-shareable filters become a requirement | React useState + optional localStorage |

---

## Architecture Notes for Implementation

### Reusable DataTable Pattern

Build ONE generic `<DataTable<TData>>` component:

```
<DataTable>
  props: columns, data, searchKey, filterableColumns, pageSize
  internally:
    - useReactTable() from @tanstack/react-table
    - <DataTableToolbar> (search, filters, view toggle)
    - <Table> from shadcn (presentation)
    - <DataTablePagination> (page controls)
    - Row actions via <DropdownMenu>
```

Every page passes different `columns` and `data` to the same `<DataTable>`. This ensures consistent UX across: cameras, stream profiles, recordings, API keys, users, audit log, webhooks.

### HLS Card Grid Performance Strategy

1. Use IntersectionObserver to detect visible cards
2. Initialize hls.js only for cards in viewport
3. Destroy hls.js instance when card leaves viewport
4. Cap at 6 concurrent HLS connections (browser limit is ~6 per domain)
5. Use poster image / last-known thumbnail as placeholder for off-screen cards
6. Consider using low-bitrate stream profile for grid previews

### Tree + Table Split Panel

Use shadcn `Resizable` (wraps react-resizable-panels):
- Left: `<ProjectTree>` (recursive Collapsible nodes, ~200px default width)
- Right: `<DataTable>` filtered by selected tree node
- Persist split ratio in localStorage
- On mobile: tree collapses to a dropdown/sheet instead of side panel

---

## Version Compatibility

| New Package | Compatible With | Verified |
|-------------|-----------------|----------|
| @tanstack/react-table 8.21.x | React 19, Next.js 15, TypeScript 5.7 | YES -- supports React 16.8+ |
| @dnd-kit/react 0.4.x | React 19 | YES -- designed for React 18+, works with 19 |
| shadcn CLI components | base-nova style, base-ui primitives | YES -- same component system as existing |

---

## Sources

- [shadcn Data Table docs](https://ui.shadcn.com/docs/components/base/data-table) -- Official TanStack Table integration (HIGH confidence)
- [shadcn Sidebar docs](https://ui.shadcn.com/docs/components/radix/sidebar) -- Collapsible modes: offcanvas, icon, none (HIGH confidence)
- [shadcn Date Picker docs](https://ui.shadcn.com/docs/components/radix/date-picker) -- Popover + Calendar composition (HIGH confidence)
- [@tanstack/react-table npm](https://www.npmjs.com/package/@tanstack/react-table) -- v8.21.3 stable (HIGH confidence)
- [@dnd-kit/react npm](https://www.npmjs.com/package/@dnd-kit/react) -- v0.4.0 (HIGH confidence)
- [react-leaflet draggable marker](https://react-leaflet.js.org/docs/example-draggable-marker/) -- Native drag support (HIGH confidence)
- [OpenStatus data-table reference](https://data-table.openstatus.dev/) -- shadcn + TanStack Table patterns (MEDIUM confidence)

---
*Stack research for: SMS Platform v1.1 UI Overhaul*
*Researched: 2026-04-17*
