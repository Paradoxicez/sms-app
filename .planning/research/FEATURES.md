# Feature Research: v1.1 UI Overhaul

**Domain:** Surveillance Management SaaS Platform -- UI/UX patterns for camera management
**Researched:** 2026-04-17
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features operators and developers expect from any modern surveillance/monitoring management UI. Missing these makes the platform feel unfinished compared to Milestone XProtect, Eagle Eye Networks, Verkada, or even open-source NVR interfaces.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Unified data tables with sort, filter, pagination | Every SaaS dashboard has consistent tables. Current tables are bare -- no pagination, no column sorting, inconsistent filter patterns across pages. Users managing 50+ cameras/recordings cannot function without these. | HIGH | None (foundation component) | Build as reusable `DataTable` wrapper around TanStack Table + shadcn. Server-side pagination for recordings (large datasets). Client-side for cameras/profiles (small datasets). |
| Table "..." quick action menus | Standard enterprise pattern -- MoreHorizontal dropdown per row for Edit, Delete, View, etc. Projects page already has this; cameras, recordings, stream profiles, API keys pages do not. | LOW | Unified data tables | Already have DropdownMenu component. Just needs consistent application across all table pages. |
| Column sorting | Users expect click-to-sort on table headers. Surveillance operators sort by status, name, date, size constantly. | LOW | Unified data tables | TanStack Table handles this natively. |
| Pagination | Tables without pagination break at scale. 100+ cameras, 1000+ recordings -- must paginate. Current recordings page loads all at once with client-side filtering only. | MEDIUM | Unified data tables | Server-side for recordings (needs backend API changes). Client-side acceptable for cameras, profiles, projects. |
| Collapsible sidebar | Every modern SaaS app (Linear, Notion, Vercel) has a collapsible sidebar. Fixed 240px sidebar wastes screen real estate on camera preview pages and map view. | MEDIUM | None | shadcn's `Sidebar` component already installed in codebase but not used. Current `sidebar-nav.tsx` is custom. Must migrate to shadcn Sidebar with `collapsible="icon"` mode. Persist state via cookie. |
| Unified datepicker components | Native `<input type="date">` looks broken on many browsers, inconsistent styling. Recordings page uses native date inputs that clash with shadcn design system. | LOW | None | shadcn Calendar + Popover already in codebase. Build DatePicker and DateRangePicker wrappers. |
| Camera quick actions menu | Users should not need to navigate to a 5-tab detail page just to start/stop stream, toggle recording, or copy embed code. Quick actions from the table row are standard in VMS software. | MEDIUM | Unified data tables, quick action menus | Actions: Edit, View Stream, Stream Profile, Enable/Disable, Start/Stop Recording, Copy Embed Code, Delete. Some actions need API calls inline. |
| Recordings page filters (all cameras) | Current recordings page requires selecting a single camera first. Operators need to see all recordings across all cameras, filter by project/site/camera/date/status. This is table stakes for any VMS. | MEDIUM | Unified data tables, server-side pagination | Needs new backend endpoint: `GET /api/recordings` with query params for camera, project, site, date range, status. Current endpoint is per-camera only. |
| Bulk delete for recordings | Already partially implemented (checkboxes exist). Needs to work with paginated data and across cameras. | LOW | Recordings page filters | Selection state must persist across pagination. Add "select all on this page" and "select all matching filter" patterns. |
| Login redesign with remember me | Current login is basic. "Remember me" is expected for operator workflows where people log in daily. | LOW | None (auth change) | Better Auth supports session duration config. "Remember me" = longer session TTL. UI redesign is cosmetic. |

### Differentiators (Competitive Advantage)

Features that elevate SMS above basic VMS dashboards. Not required for v1.1 launch, but high value.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Camera table/card view toggle with HLS live preview | Most VMS show either a grid of live feeds OR a table of cameras. Toggling between table (data-dense, sortable) and card (visual preview) views in one page is uncommon and powerful. Cards showing actual HLS live thumbnails make this a standout feature. | HIGH | Unified data tables, HLS player component | Card view needs HLS.js player per card. Performance concern: 20+ simultaneous HLS streams = high bandwidth. Implement lazy loading -- only play visible cards. Use IntersectionObserver to pause off-screen streams. |
| View Stream page (preview + policies + embed + activity) | Consolidates the most common camera workflows into one focused page instead of a 5-tab detail page. Preview stream, see/edit policies, grab embed code, view recent activity -- all in one view. | MEDIUM | Camera quick actions (links to this page) | This replaces the need to navigate through camera detail tabs for the most common tasks. Keep camera detail page for advanced settings (connection config, stream profile assignment). |
| Project tree viewer (split panel: tree left, data table right) | Hierarchical tree navigation (Project > Site > Camera) with a data table on the right is the standard VMS pattern (Milestone XProtect uses this exact layout). Currently SMS has flat lists. Tree view makes large deployments navigable. | HIGH | Unified data tables | Split panel layout: resizable tree (250-350px) on left, data table on right. Tree nodes show counts (e.g., "Office Building (3 sites, 12 cameras)"). Clicking a node filters the right table. |
| Map with tree viewer filter and drag-drop markers | Combining tree filter with map lets operators see cameras by location within their hierarchy. Drag-drop marker placement eliminates manual lat/lng entry -- a major pain point. | HIGH | Project tree viewer, map component | Leaflet supports drag events. Need: (1) tree filter panel overlaying map, (2) drag marker to set lat/lng, (3) save location on drop. Current map has no editing capability. |
| Download recording clips | Operators expect to download recorded footage as MP4 files. Current system only plays back in browser. | MEDIUM | Recordings page | Needs backend: generate download URL from MinIO, possibly transcode segment range to MP4. Consider pre-signed URL pattern for large files. |
| Stream profiles as table (replacing cards) | Cards are nice for 3-5 profiles but become unwieldy at 10+. Table view with quick actions is more scalable and consistent with rest of UI. | LOW | Unified data tables | Simple migration from card grid to DataTable. Keep "Default" badge, mode badge. Add quick actions: Edit, Duplicate, Set Default, Delete. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time auto-refresh on all tables | "I want to see camera status change instantly in the table" | Polling every 2s on tables with 100+ rows causes excessive re-renders and API load. Socket.IO status updates already exist but full table refresh is wasteful. | Use targeted Socket.IO updates for status column only (already implemented). Add a manual "Refresh" button. Show "last updated" timestamp. |
| Inline cell editing in tables | "Let me edit camera name right in the table" | Increases component complexity massively. Accidental edits. Validation becomes inline. Conflicts with quick action menus. | Use quick action menu > "Edit" which opens a focused dialog. Faster to build, less error-prone. |
| Drag-and-drop row reordering in tables | "Let me reorder cameras by dragging" | Camera order is meaningless -- they should be sorted by status/name/date. DnD in tables is complex (especially with pagination) and adds no value for surveillance data. | Provide column sorting. Users sort by what matters to them. |
| Multi-grid live view (2x2, 3x3, 4x4 camera grids) | "Show me 9 cameras at once like a security monitor" | This is a viewer feature, not a management feature. SMS is a developer platform for embedding streams, not a security guard's workstation. Building a multi-grid viewer is a separate product. | Card view toggle with HLS preview serves the "quick visual check" need. Multi-grid is out of scope -- developers embed streams on their own sites. |
| Customizable dashboard with drag-drop widgets | "Let me arrange my dashboard cards" | Enormous complexity for marginal value at this stage. Dashboard layout works well as designed. Widget systems need persistence, layout engine, responsive breakpoints. | Keep curated dashboard layout. Add more cards/metrics if needed, but designer decides layout, not user. |
| Dark mode toggle | "Every modern app has dark mode" | Current green theme is the brand identity. Supporting two themes doubles CSS testing surface. Not a v1.1 priority. | Defer to v1.2+. If implemented, use shadcn's built-in dark mode support which is already configured in the codebase. |

## Feature Dependencies

```
[Unified DataTable component]
    |--required-by--> [Camera table + quick actions]
    |--required-by--> [Recordings page (dedicated)]
    |--required-by--> [Stream profiles table]
    |--required-by--> [Project tree viewer (right panel)]
    |--required-by--> [All admin tables (users, API keys, audit log, webhooks)]

[Unified DatePicker / DateRangePicker]
    |--required-by--> [Recordings page filters]
    |--required-by--> [Audit log page filters]

[Collapsible sidebar]
    |--independent-- (no dependencies, no dependents in this milestone)

[Login redesign]
    |--independent-- (no dependencies, no dependents in this milestone)

[Camera quick actions menu]
    |--requires--> [Unified DataTable]
    |--enables--> [View Stream page] (quick action links to it)

[View Stream page]
    |--requires--> [HLS player component] (already exists)
    |--requires--> [Policies display] (already exists in camera detail)
    |--requires--> [Embed code generator] (already exists)

[Project tree viewer]
    |--requires--> [Unified DataTable] (right panel)
    |--requires--> [Tree component] (new, use recursive Collapsible or react-arborist)
    |--enables--> [Map tree viewer filter]

[Map tree viewer + drag-drop]
    |--requires--> [Project tree viewer component] (reuse tree)
    |--requires--> [Leaflet drag events] (new capability)

[Camera card view with HLS preview]
    |--requires--> [Unified DataTable] (toggle lives in table toolbar)
    |--requires--> [HLS player component] (exists)
    |--requires--> [IntersectionObserver lazy loading] (new, for performance)

[Recordings dedicated page]
    |--requires--> [Unified DataTable]
    |--requires--> [Unified DateRangePicker]
    |--requires--> [Backend: GET /api/recordings with cross-camera filters]

[Download clips]
    |--requires--> [Recordings dedicated page]
    |--requires--> [Backend: pre-signed download URL from MinIO]
```

### Dependency Notes

- **Unified DataTable is the critical foundation:** 7 of 12 features depend on it. Build this first.
- **DatePicker is a quick win with wide impact:** Small component, used in recordings and audit log.
- **Collapsible sidebar and login redesign are independent:** Can be built in parallel with anything.
- **Tree viewer is the most complex dependency chain:** Tree component > project tree viewer > map tree filter. Plan for this to be a later phase.
- **Camera card view has a hidden performance dependency:** HLS live preview in cards needs IntersectionObserver-based lazy loading or it will crush bandwidth with 20+ cameras.

## MVP Definition (v1.1 Milestone)

### Launch With (Must Have)

- [ ] **Unified DataTable component** -- Foundation for all table improvements. TanStack Table + shadcn. Sorting, filtering, pagination, row selection, quick actions.
- [ ] **Unified DatePicker / DateRangePicker** -- Replace all native date inputs. Small effort, big visual consistency win.
- [ ] **Collapsible sidebar** -- Migrate from custom sidebar-nav to shadcn Sidebar component. Cookie-persisted state.
- [ ] **Camera table with quick actions** -- Apply DataTable to cameras page. Add "..." menu with Edit, View Stream, Disable, Delete, Record, Embed Code.
- [ ] **Recordings dedicated page** -- All cameras, filter by camera/project/date/status, bulk delete. Needs backend endpoint.
- [ ] **Stream profiles as table** -- Replace card layout with DataTable. Quick actions for Edit, Duplicate, Delete.
- [ ] **Login redesign with remember me** -- Cosmetic + session TTL extension for "remember me" checkbox.

### Add After Core Tables Work (Should Have)

- [ ] **Camera card view toggle with HLS preview** -- After DataTable is solid, add view toggle. Requires lazy-load HLS optimization.
- [ ] **View Stream page** -- After camera quick actions exist (one action links here). Consolidate preview + policies + embed + activity.
- [ ] **Project tree viewer** -- After DataTable is done (it's the right panel). Tree component is new and complex.
- [ ] **Download recording clips** -- After recordings page is rebuilt. Backend pre-signed URL work needed.

### Defer to v1.2+ (Future)

- [ ] **Map tree viewer with drag-drop markers** -- Depends on tree viewer being stable. Drag-drop marker placement is complex.
- [ ] **Map camera preview popup on hover** -- Nice but not essential. HLS popup on hover has performance implications.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase Suggestion |
|---------|------------|---------------------|----------|------------------|
| Unified DataTable component | HIGH | HIGH | P1 | Phase 1 (foundation) |
| Unified DatePicker/DateRangePicker | MEDIUM | LOW | P1 | Phase 1 (foundation) |
| Collapsible sidebar | MEDIUM | MEDIUM | P1 | Phase 1 (independent) |
| Login redesign + remember me | LOW | LOW | P1 | Phase 1 (independent) |
| Camera table + quick actions | HIGH | MEDIUM | P1 | Phase 2 (applies DataTable) |
| Stream profiles table | MEDIUM | LOW | P1 | Phase 2 (applies DataTable) |
| Recordings dedicated page | HIGH | HIGH | P1 | Phase 3 (needs backend work) |
| Camera card view + HLS preview | HIGH | HIGH | P2 | Phase 3 or 4 |
| View Stream page | MEDIUM | MEDIUM | P2 | Phase 4 |
| Project tree viewer | MEDIUM | HIGH | P2 | Phase 4 or 5 |
| Download clips | MEDIUM | MEDIUM | P2 | Phase 3 (with recordings) |
| Map tree viewer + drag-drop | LOW | HIGH | P3 | Phase 5 or defer |
| Map camera preview popup | LOW | MEDIUM | P3 | Phase 5 or defer |

## Competitor Feature Analysis

| Feature | Milestone XProtect | Eagle Eye Networks | Verkada | SMS v1.1 Approach |
|---------|-------------------|-------------------|---------|-------------------|
| Camera hierarchy | Device tree (tree nav, groups, drag-drop) | Layouts + site grouping | Tags + locations | Project > Site > Camera tree viewer (split panel) |
| Table views | Basic lists, not data-table focused | Searchable lists | Clean tables with filters | TanStack Table with full sort/filter/paginate |
| Card/grid + table toggle | Grid-focused (video wall) | Grid layouts | Grid + list toggle | Table default, card toggle with HLS preview |
| Quick actions | Right-click context menus | Inline action buttons | Hover action overlay | "..." dropdown menu per row (standard SaaS pattern) |
| Map view | Static map with markers | Interactive map, site-based | Floor plan + map | Leaflet map with tree filter, drag-drop placement |
| Recordings browse | Timeline scrubber per camera | Calendar + timeline | Timeline + search | Dedicated page with cross-camera filters, date range, bulk ops |
| Sidebar | Collapsible tree panels | Fixed sidebar | Collapsible sidebar | shadcn Sidebar with icon collapse mode |
| Download footage | Export clips with player | Cloud download | Direct download | Pre-signed URL download from MinIO |

**Key insight:** Milestone and Eagle Eye are desktop-heavy VMS products. Verkada is the closest competitor in terms of modern web UI. SMS should aim for Verkada-level polish with a developer-first twist (embed codes, API keys are unique differentiators competitors lack).

## Sources

- [Data Table UX Patterns & Best Practices -- Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) -- Enterprise table patterns (sorting, filtering, pagination, bulk actions, column config)
- [Top 6 Features Every VMS Dashboard Should Have -- The Boring Lab](https://theboringlab.com/top-6-features-every-vms-dashboard-should-have-in-2024/) -- VMS dashboard feature requirements
- [shadcn/ui Sidebar Documentation](https://ui.shadcn.com/docs/components/radix/sidebar) -- Collapsible sidebar component with icon mode, cookie persistence
- [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/radix/data-table) -- TanStack Table integration pattern
- [tablecn (sadmann7)](https://github.com/sadmann7/tablecn) -- Server-side sorting, filtering, pagination reference implementation
- [OpenStatus Data Table](https://data-table.openstatus.dev/) -- React data table with filters, shadcn + TanStack Table
- [Milestone XProtect Views](https://doc.milestonesys.com/2024R1/en-US/standard_features/sf_sc/sf_viewing/current/sc_workingwithviews.htm) -- VMS tree view and device hierarchy patterns
- [VMS UX Best Practices -- Hicron Software](https://hicronsoftware.com/blog/vms-user-friendly-design/) -- VMS user-friendly design principles

---
*Feature research for: SMS Platform v1.1 UI Overhaul*
*Researched: 2026-04-17*
