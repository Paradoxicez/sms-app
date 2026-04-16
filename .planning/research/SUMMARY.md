# Project Research Summary

**Project:** SMS Platform v1.1 UI Overhaul
**Domain:** Surveillance Management SaaS -- Frontend component architecture overhaul
**Researched:** 2026-04-17
**Confidence:** HIGH

## Executive Summary

The v1.1 milestone is a pure frontend overhaul of the SMS Platform dashboard. The core problem is 20 hand-rolled table implementations with no shared abstraction, a custom sidebar that ignores the already-installed shadcn Sidebar component, native date inputs clashing with the design system, and no quick-action patterns for camera management. The research confirms that nearly everything needed is already installed -- the existing stack (Next.js 15, React 19, shadcn/ui with base-ui primitives, hls.js, Leaflet, react-day-picker) covers all features. Only one new npm dependency is required: `@tanstack/react-table` v8.21.x for headless table logic.

The recommended approach is to build a reusable `DataTable<T>` component system first, then migrate all 20 tables to it before tackling complex features like camera card views with HLS preview, project tree viewer, or map enhancements. The sidebar migration to shadcn's collapsible `SidebarProvider` must happen early because it is a layout-level change that affects every page -- doing it late means retrofitting. The build order is strictly dependency-driven: foundations first, simple table migrations second (to validate the DataTable API), complex feature pages third, tree viewer and map enhancements last.

The top risks are: (1) multiple simultaneous HLS players crashing the browser tab from memory exhaustion -- each hls.js instance buffers video indefinitely unless explicitly capped, (2) sidebar collapse breaking existing layout math that assumes a fixed 240px width, and (3) TanStack Table column definitions failing to cross the Next.js server/client component boundary. All three have well-documented prevention strategies identified in the pitfalls research. The base-ui vs Radix composition pattern mismatch is a recurring trap that affects every phase adding UI components.

## Key Findings

### Recommended Stack

The existing stack requires no changes. The codebase already has Next.js 15, React 19, shadcn/ui (base-nova style with base-ui primitives), Tailwind CSS 4.2, hls.js, Leaflet, react-day-picker v9, Socket.IO, recharts, react-hook-form + zod, and 33 installed shadcn/ui components.

**New dependencies (minimal):**
- `@tanstack/react-table` v8.21.x: Headless table logic (sorting, filtering, pagination, row selection) -- the standard shadcn Data Table integration. Do NOT use v9 alpha.
- `react-resizable-panels` via `npx shadcn@latest add resizable`: Split panel for tree viewer. Added through shadcn CLI, not direct npm install.

**shadcn components to add via CLI (not npm):**
- `pagination`, `checkbox`, `toggle-group`, `resizable`

**What NOT to add:** ag-grid (heavy, clashes with shadcn), react-beautiful-dnd (deprecated), react-arborist (overkill for 3-level tree), framer-motion (already have tw-animate-css), MUI/Ant Design (wrong design system).

### Expected Features

**Must have (table stakes):**
- Unified DataTable with sort, filter, pagination, row selection -- foundation for 7+ features
- Quick action "..." menus on all table rows (currently only Projects page has this)
- Collapsible sidebar using already-installed shadcn Sidebar component
- Unified DatePicker/DateRangePicker replacing native date inputs
- Camera table with quick actions (Edit, View Stream, Disable, Record, Embed Code)
- Dedicated recordings page with cross-camera filters and bulk delete
- Stream profiles as table (replacing card grid for consistency)
- Login redesign with "remember me"

**Should have (differentiators):**
- Camera card/table view toggle with live HLS preview thumbnails
- View Stream page consolidating preview + policies + embed + activity
- Project tree viewer (split panel: tree left, DataTable right)
- Download recording clips via presigned MinIO URLs

**Defer (v1.2+):**
- Map tree viewer with drag-drop marker placement
- Map camera preview popup on hover
- Dark mode

### Architecture Approach

The architecture follows a component composition pattern: a generic `DataTable<T>` system (7 files) that every page consumes by providing typed column definitions and data. Column definitions live in separate `"use client"` files to avoid the Next.js server/client boundary issue. Quick actions use Sheet (slide-in panel) for edit forms and AlertDialog for destructive confirmations. The sidebar migrates from a custom 178-line NavShell to shadcn's SidebarProvider with cookie-persisted collapse state. Real-time camera status updates flow through the existing `useCameraStatus` Socket.IO hook into TanStack Table's reactive `data` prop -- no new real-time infrastructure needed.

**Major components:**
1. `data-table/` (7 files) -- Reusable table system: core table, toolbar, pagination, column header, row actions, faceted filter, view options
2. `date-picker/` (2 files) -- DatePicker and DateRangePicker wrapping existing Calendar + Popover
3. `nav/app-sidebar.tsx` -- Collapsible sidebar wrapping shadcn SidebarProvider with role-based nav filtering
4. `tree-viewer/` (3 files) -- Split panel with recursive tree navigation and DataTable content
5. `camera-card/` (3 files) -- Card view with viewport-aware HLS preview, lazy loading

### Critical Pitfalls

1. **Multiple HLS players crash the browser** -- Cap concurrent players at 4-6, use IntersectionObserver for viewport-only playback, set aggressive buffer limits (`backBufferLength: 0`, `maxBufferLength: 4`), disable Web Workers in grid mode. Design this into the card component from day one.

2. **Sidebar collapse breaks existing layout** -- Current layout assumes fixed 240px sidebar. Leaflet maps and Recharts charts do not auto-resize. Must dispatch `window resize` event on sidebar transition end, replace `calc()` expressions with CSS custom properties, and place SidebarProvider in root layout.

3. **TanStack Table columns fail server/client boundary** -- Column definitions contain JSX render functions that cannot serialize across the Next.js boundary. Define columns in separate `"use client"` files, never pass as props from Server Components.

4. **base-ui vs Radix pattern mismatch** -- Project uses base-ui (`render` prop) but most shadcn tutorials show Radix (`asChild`). Every new component must use the base-ui variant. Establish a component addition checklist in Phase 1.

5. **Bulk operations without optimistic UI** -- Deleting 50 recordings with synchronous UI blocking causes users to double-click or navigate away. Use optimistic removal with undo toast, background job pattern for actual deletion.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation Components
**Rationale:** DataTable is consumed by 13+ pages. DatePicker is used in 2+ filter bars. Building these first prevents rework. Also establishes the base-ui component addition checklist.
**Delivers:** Reusable DataTable system (7 files), DatePicker/DateRangePicker (2 files), shared empty-state component, component addition checklist for base-ui.
**Addresses:** Unified data tables (table stakes), unified datepicker (table stakes)
**Avoids:** Table pattern divergence (Pitfall 3), base-ui/Radix confusion (Pitfall 6)

### Phase 2: Sidebar Overhaul
**Rationale:** Layout-level change that affects every page. Must happen before individual page modifications to avoid merge conflicts and ensure all subsequent work builds on the collapsible layout.
**Delivers:** Collapsible sidebar with icon mode, cookie persistence, keyboard shortcut (Cmd+B), mobile sheet behavior. Removes old NavShell.
**Addresses:** Collapsible sidebar (table stakes)
**Avoids:** Sidebar breaks layout (Pitfall 2). Dispatch resize events for maps/charts.

### Phase 3: Simple Table Migrations
**Rationale:** 10 low-complexity pages validate the DataTable API before tackling complex cases. If the interface needs adjustment, fix it while only 10 pages use it.
**Delivers:** 10 pages migrated to DataTable with consistent sorting, filtering, pagination, and "..." row action menus. Pages: projects, sites, policies, API keys, webhooks, orgs, packages, users, cluster nodes, team.
**Addresses:** Quick action menus (table stakes), column sorting (table stakes), pagination (table stakes)
**Avoids:** Prop-drilling action handlers (Architecture anti-pattern 3)

### Phase 4: Complex Feature Pages
**Rationale:** Camera table, stream profiles, and recordings are the highest-value pages requiring more complex DataTable usage (faceted filters, card view toggle, server-side pagination, bulk actions). Backend API additions for cross-camera recordings can be built in parallel.
**Delivers:** Camera table with faceted status filter + full quick actions, camera card view toggle with HLS preview, stream profiles as table, recordings page with cross-camera filters + date range picker + bulk delete, audit log with server-side pagination.
**Addresses:** Camera quick actions (table stakes), recordings page filters (table stakes), camera card view (differentiator), stream profiles table (differentiator), bulk delete (table stakes)
**Avoids:** HLS multi-player memory crash (Pitfall 1), bulk operation UX stall (Pitfall 7), mixed client/server pagination (Architecture anti-pattern 1)
**Backend work needed:** `GET /api/recordings` with cross-camera filters, `DELETE /api/recordings/bulk`, `GET /api/recordings/:id/download-url`

### Phase 5: Tree Viewer
**Rationale:** Most complex new UI pattern with smallest dependency footprint (only Projects and Map pages). Requires resizable panels, recursive tree component, and careful performance design for 500+ nodes.
**Delivers:** Split-panel tree viewer (Project > Site > Camera hierarchy), projects page with tree navigation + DataTable, tree search/filter.
**Addresses:** Project tree viewer (differentiator)
**Avoids:** Tree performance without virtualization (Pitfall 5), tree selection state in URL (Architecture anti-pattern 5)

### Phase 6: View Stream, Map Enhancements, Login
**Rationale:** Self-contained features with no downstream dependencies. Can be built in any order. Map drag-drop and preview popup may be deferred to v1.2 based on timeline.
**Delivers:** View Stream page (preview + policies + embed + activity), login redesign with remember-me, optionally map drag-drop markers and camera preview popup.
**Addresses:** View Stream page (differentiator), login redesign (table stakes), download clips (differentiator)
**Avoids:** Leaflet drag-drop snap-back (Pitfall 4), login autofill regression (UX pitfall)

### Phase Ordering Rationale

- **Foundations before migrations:** DataTable and DatePicker are consumed everywhere. Building them first ensures consistent API across all consumers.
- **Sidebar before page work:** Every page component must work within the collapsible layout. Changing the sidebar after modifying pages means double-testing everything.
- **Simple migrations before complex:** 10 easy pages validate the DataTable design. Cheaper to fix the API with 10 consumers than 17.
- **Complex features before tree viewer:** Camera table/recordings are higher user value. Tree viewer is a new pattern with performance risks.
- **View Stream and map last:** No other features depend on these. Can be cut from v1.1 if timeline is tight.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Complex Feature Pages):** HLS card view performance requires prototyping the IntersectionObserver + hls.js lifecycle. Recordings page needs backend API design for cross-camera filters with server-side pagination.
- **Phase 5 (Tree Viewer):** Virtualization strategy needs prototyping at 500+ nodes with Socket.IO updates. May need React Arborist or TanStack Virtual.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Well-documented shadcn + TanStack Table pattern with official examples.
- **Phase 2 (Sidebar):** The shadcn Sidebar component is already installed with full documentation. Configuration only.
- **Phase 3 (Simple Migrations):** Mechanical application of Phase 1 patterns. No novel work.
- **Phase 6 (View Stream, Login):** Standard page composition with existing components.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Only 1 new npm dependency needed. All technologies already installed and validated in v1.0. Official shadcn documentation prescribes TanStack Table integration. |
| Features | HIGH | Feature set derived from VMS industry analysis and direct codebase inspection of 20 existing table files. Competitor analysis (Milestone, Eagle Eye, Verkada) validates priorities. |
| Architecture | HIGH | Component hierarchy based on direct codebase audit of 33 shadcn components, 14 page components, and 11 hooks. Build order driven by dependency graph, not guesswork. |
| Pitfalls | HIGH | All critical pitfalls sourced from GitHub issues with reproduction steps, official hls.js documentation, and TanStack Table issue tracker. base-ui migration pitfall confirmed by shadcn community discussions. |

**Overall confidence:** HIGH

### Gaps to Address

- **Backend API for cross-camera recordings:** The current API is per-camera only. Phase 4 requires `GET /api/recordings` with cross-camera filters and server-side pagination. This endpoint needs design during Phase 4 planning.
- **HLS card view performance budget:** Exact cap (4 vs 6 vs 9 concurrent players) needs empirical testing with the actual camera streams. Prototype early in Phase 4.
- **Tree virtualization threshold:** Research suggests virtualization is needed at 500+ nodes. The actual dataset size per customer (projects x sites x cameras) determines whether React Arborist or a simple recursive Collapsible component is sufficient. Assess during Phase 5 planning.
- **@dnd-kit necessity:** Whether drag-from-list-to-map is needed (requires @dnd-kit) or click-to-place + draggable markers (zero deps) is sufficient. UX decision deferred to Phase 6.

## Sources

### Primary (HIGH confidence)
- [shadcn Data Table docs](https://ui.shadcn.com/docs/components/base/data-table) -- TanStack Table integration pattern
- [shadcn Sidebar docs](https://ui.shadcn.com/docs/components/radix/sidebar) -- Collapsible modes, cookie persistence
- [TanStack Table + Next.js App Router issue #5165](https://github.com/TanStack/table/issues/5165) -- Server/client boundary problem
- [hls.js memory leak issues #1220, #5402](https://github.com/video-dev/hls.js/issues/5402) -- Multi-player memory growth
- [HLS.js cautionary tale -- Mux](https://www.mux.com/blog/an-hls-js-cautionary-tale-qoe-and-video-player-memory) -- backBufferLength problem
- [base-ui useRender documentation](https://base-ui.com/react/utils/use-render) -- Render prop API reference
- Codebase inspection: 20 table files, 33 shadcn components, 14 page components, 11 hooks

### Secondary (MEDIUM confidence)
- [OpenStatus data-table reference](https://data-table.openstatus.dev/) -- shadcn + TanStack Table patterns
- [Easton Blog -- shadcn Sidebar layout](https://eastondev.com/blog/en/posts/dev/20260327-shadcn-ui-sidebar-layout/) -- SidebarProvider placement
- [basecn migration guide](https://basecn.dev/docs/get-started/migrating-from-radix-ui) -- asChild to render prop conversion
- [VMS UX Best Practices -- Hicron](https://hicronsoftware.com/blog/vms-user-friendly-design/) -- VMS design principles
- [Enterprise Data Table Patterns -- Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) -- Table UX research

---
*Research completed: 2026-04-17*
*Ready for roadmap: yes*
