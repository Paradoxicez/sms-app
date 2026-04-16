# Pitfalls Research

**Domain:** UI Overhaul for Next.js 15 Surveillance Platform (adding unified tables, multi-HLS players, tree viewer, collapsible sidebar, Leaflet drag-drop, recordings bulk ops, datepicker replacement, login redesign)
**Researched:** 2026-04-17
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Multiple Simultaneous HLS Players Crash the Browser Tab

**What goes wrong:**
Card view showing 6-12+ camera previews each with their own hls.js instance causes memory to climb past 1.5GB within 15-20 minutes. Each HLS instance creates a separate MediaSource, downloads segments into SourceBuffers, and the default `backBufferLength: Infinity` means played segments are never freed. The browser tab eventually freezes or crashes.

**Why it happens:**
The existing `HlsPlayer` component (`apps/web/src/app/admin/cameras/components/hls-player.tsx`) is designed for single-stream viewing. It sets `maxBufferLength: 10` and `backBufferLength: 0` for live mode, which is good for one player but insufficient when multiplied across a grid. Each instance also spawns its own Web Worker (`enableWorker: true`), and browsers limit concurrent MediaSource instances (Chrome caps around 75, but memory is the real constraint).

**How to avoid:**
1. **Viewport-only playback:** Use IntersectionObserver to only activate HLS instances for cards visible in the viewport. Cards scrolled out of view get `hls.destroy()` called immediately.
2. **Cap concurrent players at 4-6 max.** Even visible cards beyond this count should show a static thumbnail with a "click to play" overlay.
3. **Aggressive buffer settings for grid mode:** `backBufferLength: 0`, `maxBufferLength: 4`, `maxBufferSize: 2 * 1000 * 1000` (2MB per player).
4. **Single worker mode:** Set `enableWorker: false` in grid mode to avoid spawning 12+ Web Workers. The performance hit per-player is negligible at low buffer sizes.
5. **Thumbnail fallback:** For large grids (12+), use periodic snapshot images from the backend instead of live HLS. Only upgrade to HLS on hover/click.

**Warning signs:**
- Browser DevTools Memory tab shows steady climb during card view usage
- `performance.memory.usedJSHeapSize` exceeds 500MB with card view open
- Users report "Aw, Snap!" or tab freezes after leaving dashboard open

**Phase to address:**
Camera card view phase. Must be designed into the card view component from day one -- retrofitting viewport-aware playback into existing grid is painful.

---

### Pitfall 2: Sidebar Collapse Breaks Existing Layout Math

**What goes wrong:**
The current admin layout (`apps/web/src/app/admin/layout.tsx`) uses `<div className="flex min-h-screen">` with a fixed `md:w-[240px]` sidebar. The main content is `flex-1`. Replacing `SidebarNav`/`PlatformNav` with shadcn's collapsible `SidebarProvider` changes the width from 240px to 48px (3rem icon mode), causing:
- Map components (`CameraMapInner`) that use `h-[calc(100vh-10rem)]` heights don't account for sidebar width changes, causing Leaflet's `invalidateSize()` to not fire and the map renders with stale dimensions.
- Dashboard chart containers (Recharts) don't re-render on sidebar width change, leaving blank space or overflowing.
- Content that relies on `flex-1` may flash/jump during the CSS transition.

**Why it happens:**
The current layout has no concept of sidebar state. `PlatformNav` is a static 240px aside. shadcn's `SidebarProvider` manages state via cookie (`sidebar_state`) and CSS custom properties, but existing page components don't subscribe to sidebar state changes and don't trigger resize recalculations.

**How to avoid:**
1. **Place `SidebarProvider` in the root admin layout**, not in individual pages. The existing `sidebar.tsx` UI component already has cookie persistence (`SIDEBAR_COOKIE_NAME = "sidebar_state"` with 7-day max age).
2. **Trigger resize events on transition end.** After sidebar animation completes (200ms), dispatch `window.dispatchEvent(new Event('resize'))` so Leaflet maps and Recharts pick up the new dimensions.
3. **Replace calc-based heights** in map components with CSS that responds to the sidebar CSS custom property (`--sidebar-width`).
4. **Use `transition-[width]` not `transition-all`** on sidebar to avoid animating unrelated properties.
5. **Test collapsed state persistence.** The shadcn sidebar stores state in a cookie -- if the `SidebarProvider` is placed wrong (per-page instead of layout), it resets on every navigation.

**Warning signs:**
- Map appears zoomed wrong or has gray tiles after sidebar toggle
- Charts have empty whitespace on the right after expanding sidebar
- Sidebar state resets when navigating between pages

**Phase to address:**
Sidebar collapse must be the FIRST UI change implemented because every subsequent component (tables, maps, tree viewer) must be built to work within the collapsible layout. Doing it later means retrofitting every page.

---

### Pitfall 3: TanStack Table Column Definitions Cannot Be Passed as Server Component Props

**What goes wrong:**
In Next.js 15 App Router, page components are Server Components by default. TanStack Table column definitions often include `cell` render functions (JSX) and event handlers (onClick for quick actions). Passing column definitions from a Server Component parent to a Client Component table triggers: `"Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with 'use server'."` This breaks the entire table pattern.

**Why it happens:**
Developers define columns in the page file alongside data fetching, then pass both `data` and `columns` to a `<DataTable>` client component. The column `cell` property is a function, which cannot cross the server-client boundary.

**How to avoid:**
1. **Define columns in a separate client file** (`columns.tsx` with `"use client"`), imported by the client DataTable component, not passed as props from server.
2. **Pattern:** Server Component fetches data and passes raw data to Client Component. Client Component imports its own column definitions internally.
3. **For quick action menus (edit, delete, etc.):** Pass callback names/action types as serializable data, not function references. The client component maps action types to handlers.
4. **Standardize early:** Create a `DataTable<T>` generic component that encapsulates TanStack Table setup, pagination, filtering, and sorting. Every page reuses this one component.

**Warning signs:**
- Build errors about functions in Server Component props
- Each table implementation diverges from the pattern (currently: 10 different table files with no shared abstraction)
- Duplicate pagination/filter/sort logic across tables

**Phase to address:**
Unified table infrastructure phase. Must establish the DataTable pattern BEFORE migrating individual tables. Build the generic component first, migrate one table to prove the pattern, then migrate the rest.

---

### Pitfall 4: Leaflet Drag-Drop Markers Break on Re-render

**What goes wrong:**
When adding drag-drop marker placement for camera lat/long, the marker position is stored in React state. Dragging a marker fires `dragend`, which updates state, which triggers a re-render, which re-creates the Marker component, which resets the marker position to the old state value (race condition). The marker "snaps back" to its previous position.

**Why it happens:**
React-Leaflet markers are controlled components. If the parent re-renders during a drag operation, the marker's position prop overrides the user's drag. The existing `CameraMapInner` component uses `useMemo` for camera filtering, which is fine for static markers but breaks with interactive drag-drop.

**How to avoid:**
1. **Use `useRef` for drag state**, not `useState`. Store the dragged position in a ref during the drag, only commit to state on `dragend` with the ref value.
2. **Use `eventHandlers` prop on `<Marker>`** with `dragend: (e) => { const latlng = e.target.getLatLng(); setPosition(latlng); }` -- this reads from the Leaflet marker instance directly, not from React state.
3. **Wrap draggable markers in `React.memo`** with a custom comparator that ignores position changes during active drag.
4. **For the tree viewer + map split panel:** The map component MUST NOT unmount/remount when the tree selection changes. Use CSS visibility or a stable key, not conditional rendering.

**Warning signs:**
- Marker visually snaps back after drag
- Console shows multiple rapid state updates during drag
- Map markers flicker when selecting different cameras in tree panel

**Phase to address:**
Map tree viewer phase. The existing map implementation is read-only -- drag-drop is a fundamentally different interaction model.

---

### Pitfall 5: Tree Viewer with 500+ Camera Nodes Freezes Without Virtualization

**What goes wrong:**
Rendering a tree of Project > Site > Camera with all nodes expanded causes the browser to create 500-2000+ DOM nodes. Each node may have status indicators updated via Socket.IO, causing cascade re-renders. The tree becomes unresponsive -- clicking to expand/collapse takes 200-500ms.

**Why it happens:**
Naive tree implementations render all nodes in the DOM. With Socket.IO camera status updates (`camera:status` events in `use-camera-status.ts` hook), each status change triggers a re-render of the entire tree if state is lifted to the tree root.

**How to avoid:**
1. **Use a virtualized tree library.** React Arborist or headless-tree with TanStack Virtual provide windowed rendering -- only visible nodes create DOM elements.
2. **Isolate Socket.IO updates.** Each camera node should subscribe to its own status independently (or use a context/store that provides granular subscriptions), NOT re-render the entire tree on every status event.
3. **Lazy-load children.** Don't fetch all cameras for all sites upfront. Expand a site node -> fetch its cameras on demand.
4. **Debounce bulk status updates.** If 50 cameras go offline simultaneously (SRS restart), batch the UI updates into a single render cycle using `requestAnimationFrame` or React's `startTransition`.

**Warning signs:**
- Tree panel visibly lags when expanding nodes
- React DevTools Profiler shows >16ms renders on tree component
- Memory grows as tree is fully expanded

**Phase to address:**
Project tree viewer phase. Architecture must be designed for virtualization from the start -- adding virtualization to a non-virtual tree is essentially a rewrite.

---

### Pitfall 6: base-ui Render Props Pattern Conflicts with Copied Radix-Style Code

**What goes wrong:**
The codebase uses `@base-ui/react@^1.3.0` for 23 UI components (all in `apps/web/src/components/ui/`). shadcn/ui historically used Radix primitives with `asChild` for composition. base-ui uses `render` prop instead. When adding new shadcn components (datepicker, command palette, etc.) or copying shadcn examples, the `asChild` pattern does not exist in base-ui. Components silently fail to compose or render extra wrapper elements.

**Why it happens:**
shadcn/ui now supports both Radix and base-ui, but most tutorials and examples online still show Radix patterns. Developers copy code from shadcn docs without checking which primitive library is in use. The base-ui `render` prop requires explicit prop spreading (`{...props}`) while Radix's `asChild` does it implicitly.

**How to avoid:**
1. **Audit which primitive library you are on.** This project uses base-ui (`@base-ui/react`). All new components must use the `render` prop pattern, not `asChild`.
2. **When copying shadcn component code**, always select the "Base UI" variant from the shadcn docs (they now offer both).
3. **Create a migration checklist** for any component being added: replace `asChild` with `render={<Component />}`, ensure `{...props}` spreading is explicit.
4. **Do NOT mix Radix and base-ui in the same project.** Pick one. This project has already picked base-ui.

**Warning signs:**
- TypeScript errors about `asChild` not being a valid prop
- Components render extra wrapper `<div>` or `<span>` elements
- Composition breaks (e.g., Button inside DropdownMenuItem doesn't merge correctly)

**Phase to address:**
Every phase that adds UI components. Establish a "component addition checklist" in phase 1 of the overhaul.

---

### Pitfall 7: Bulk Operations on Recordings Page Without Optimistic UI Causes UX Stall

**What goes wrong:**
Selecting 50 recordings and clicking "Delete" sends 50 API calls (or one bulk endpoint). Without optimistic UI, the table shows all 50 items with spinners for 5-30 seconds. Users don't know if it's working. They click delete again, causing duplicate requests. Or they navigate away, leaving orphaned operations.

**Why it happens:**
Bulk operations are inherently slow (deleting recording files from MinIO, updating database rows). If the UI waits for server confirmation before updating, the perceived performance is terrible.

**How to avoid:**
1. **Optimistic removal:** Remove selected rows from the table immediately on action. Show a toast with "Undo" option (5-second window). After undo window closes, fire the actual API call.
2. **Background job pattern:** For bulk delete, the API should return immediately with a job ID. The frontend polls or receives Socket.IO updates for completion. Show a progress indicator.
3. **Disable selection/actions during pending operations** to prevent double-submit.
4. **Add confirmation dialog** for destructive bulk operations (delete 50 recordings is irreversible).

**Warning signs:**
- Users report "nothing happened" after clicking bulk delete
- Duplicate delete API calls in server logs
- Recordings reappear after page refresh (delete failed silently)

**Phase to address:**
Recordings page phase. Design the bulk operation UX pattern before building the page.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Each table has its own pagination/filter logic (current state: 10 separate table files) | Fast initial development | Every table behaves slightly differently, bugs fixed in one aren't fixed in others | Never -- unify before adding more tables |
| Using `useState` for all table state (filter, sort, page) | Simple, no URL sync | Users lose table state on navigation, can't share filtered views via URL | Only for non-filterable tables. Filtered tables should sync to URL params |
| Inline HLS player in card view without viewport awareness | "It works" for 2-4 cameras | Memory leak crashes for 10+ cameras | Never for grid/card views. Acceptable for single-player detail pages |
| Hardcoded sidebar width (240px) in calc() expressions | Quick layout | Every component breaks when sidebar becomes collapsible | Never -- use CSS custom properties or flex/grid |
| Storing tree expand/collapse state in component state only | Simple implementation | Tree resets when navigating away and returning | Acceptable for MVP, but should persist to URL or localStorage before release |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Leaflet + Next.js App Router | Importing leaflet CSS in a Server Component or in `globals.css` without checking if it loads | Import CSS only inside the dynamically imported client component (`camera-map-inner.tsx` pattern already does this correctly -- preserve this pattern) |
| Socket.IO + TanStack Table | Subscribing to status updates in the table component, causing full table re-render on every event | Use a separate state store (React context or zustand). Table reads from store. Socket updates write to store. Only affected rows re-render via `React.memo` |
| react-day-picker + base-ui Popover | Using Radix Popover examples from shadcn docs for the datepicker popover | Ensure the Calendar popover uses base-ui's `Popover` with `render` prop, not Radix's `asChild` pattern |
| hls.js + React strict mode | HLS instance created twice in development (StrictMode double-mount), causing "MediaSource already attached" errors | The existing cleanup in `useEffect` return handles this, but new card view components must replicate the same cleanup pattern |
| TanStack Table + Server-side pagination | Fetching all data client-side and paginating in-memory | For cameras/recordings with 100+ items, implement server-side pagination. Pass `page` and `pageSize` to API, return `{ data, total }`. TanStack Table supports `manualPagination` mode |
| Leaflet MapContainer + sidebar toggle | Map does not auto-resize when container width changes | Call `map.invalidateSize()` on sidebar transition end. Use `useMap()` hook inside the map component to listen for container resize |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Rendering all HLS players in card grid | Tab memory exceeds 1GB, browser crashes | IntersectionObserver + max 4-6 concurrent players | 8+ simultaneous HLS streams |
| Unvirtualized tree with Socket.IO updates | Tree panel lags on expand/collapse, high CPU | Virtualized tree (React Arborist) + isolated status subscriptions | 200+ camera nodes with active status updates |
| Re-rendering entire page on sidebar toggle | Visible jank during sidebar animation | CSS transition on sidebar width only, `React.memo` on main content area | Any page with heavy content (map, charts, tables) |
| Bulk recording downloads without streaming | Server buffers entire ZIP in memory, 504 timeout | Stream ZIP creation or use presigned MinIO URLs for direct download | 10+ recordings selected for download, each >100MB |
| Uncontrolled re-renders from react-hook-form in table filters | Typing in filter input causes full table re-render | Use `useWatch` for specific fields, not `watch()` on entire form. Or debounce filter input by 300ms | Tables with 100+ visible rows |
| TanStack Table without `useMemo` on data/columns | Table re-renders on every parent render, even if data hasn't changed | Wrap `data` and `columns` in `useMemo`. TanStack Table docs explicitly warn about this | Any table with frequent parent re-renders (Socket.IO updates, timers) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Bulk delete endpoint without rate limiting | Attacker or buggy client deletes all recordings | Rate limit bulk operations (max 100 items per request, max 5 bulk operations per minute) |
| HLS player card view loading streams without session validation | Expired playback sessions still show video in cached cards | Validate session on each HLS manifest request (SRS callback already does this), but also handle 403 gracefully in the player UI |
| Drag-drop marker updates without authorization check | Operator role user moves camera markers they shouldn't edit | Backend must verify user role + camera ownership on lat/long update endpoint |
| Tree viewer exposing cross-org cameras | Multi-tenant data leak in tree hierarchy | Ensure tree API endpoints filter by `orgId` from session, not from query params. RLS should handle this but verify |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Card view as default for 100+ cameras | Page loads slowly, overwhelming visual noise | Default to table view. Card view available as toggle. Remember user preference in localStorage |
| Collapsible sidebar without keyboard shortcut | Power users frustrated, accessibility issue | shadcn sidebar already includes Cmd+B shortcut (`SIDEBAR_KEYBOARD_SHORTCUT = "b"`). Ensure it works |
| Datepicker replacement changes date format | Users accustomed to existing format get confused | Match the exact display format of native pickers being replaced. Audit every date display |
| Tree viewer without search/filter | Users with 200+ cameras cannot find what they need | Add search input at top of tree panel. Filter tree nodes as user types |
| Removing camera detail page entirely for quick actions | Users lose the "full view" context for complex operations | Keep a "View Stream" detail page accessible from quick actions. Quick actions replace navigation-heavy workflows, not detailed views |
| Login redesign losing browser autofill | Users have to re-enter credentials after redesign | Ensure `<input name="email">` and `<input name="password">` maintain the same `name` attributes for browser autofill continuity |

## "Looks Done But Isn't" Checklist

- [ ] **Unified table:** Often missing keyboard navigation (arrow keys between rows, Enter to open) -- verify with keyboard-only testing
- [ ] **Card view HLS:** Often missing cleanup on unmount -- verify no `hls.js` instances survive after navigating away from card view page
- [ ] **Collapsible sidebar:** Often missing mobile behavior -- verify Sheet/drawer still works on mobile when sidebar is in icon mode
- [ ] **Tree viewer:** Often missing empty states -- verify "No cameras in this site" message when expanding empty site node
- [ ] **Drag-drop markers:** Often missing undo -- verify user can revert marker position (not just re-drag)
- [ ] **Bulk operations:** Often missing partial failure handling -- verify UI shows which items failed when 3 of 50 deletes fail
- [ ] **Datepicker:** Often missing timezone handling -- verify date ranges work correctly across timezone boundaries (server stores UTC, UI displays local)
- [ ] **Login redesign:** Often missing error state styling -- verify validation errors, rate limit messages, and server error states are all styled
- [ ] **Quick actions menu:** Often missing loading states -- verify "Delete" shows spinner and disables other actions while pending
- [ ] **Recordings page:** Often missing "no results" state for filters -- verify empty state when date range filter returns zero recordings

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| HLS memory leak in card view | MEDIUM | Add IntersectionObserver wrapper around existing HlsPlayer. Max 4 hours work if player component stays the same API |
| Sidebar breaks layout | HIGH | If layout was built assuming fixed width, every page's spacing needs audit. Use CSS custom properties from start to avoid |
| Table pattern divergence (no unified component) | HIGH | Must build generic DataTable, then migrate each of 10 existing tables. ~2 hours per table migration |
| Leaflet marker snap-back | LOW | Fix is localized to drag event handler. Switch from `useState` to `useRef` for drag tracking. 1-2 hours |
| Tree performance | HIGH | Retrofitting virtualization requires rewriting tree component from scratch. Choose virtualized approach upfront |
| base-ui/Radix confusion | MEDIUM | Audit all UI components for pattern consistency. ~30 min per component to fix |
| Bulk operation failures | MEDIUM | Add job queue pattern for bulk ops, update frontend to poll status. ~1 day |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Sidebar collapse breaks layout | Phase 1 (Foundation) | Toggle sidebar on every page -- map, dashboard, tables all resize correctly |
| base-ui render prop confusion | Phase 1 (Foundation) | Component addition checklist established, one new component added correctly |
| TanStack Table server/client boundary | Phase 2 (Unified Tables) | Generic DataTable component works with server-fetched data, columns defined client-side |
| Table pattern divergence | Phase 2 (Unified Tables) | All 10 existing tables migrated to shared DataTable component |
| HLS multi-player memory leak | Phase 3 (Camera Card View) | Card view with 12 cameras open for 30 min, memory stays under 500MB |
| Tree viewer performance | Phase 4 (Tree Viewer) | 500-node tree with Socket.IO updates, expand/collapse under 50ms |
| Leaflet drag-drop snap-back | Phase 5 (Map Enhancement) | Drag marker to new position, no snap-back, position persists after save |
| Bulk operation UX stall | Phase 6 (Recordings Page) | Select 50 recordings, bulk delete, UI responds within 500ms (optimistic) |
| Datepicker format mismatch | Phase 7 (Datepicker Replacement) | All date displays match previous format, timezone handling verified |
| Login autofill regression | Phase 8 (Login Redesign) | Browser autofill still works after redesign, "remember me" persists session |

## Sources

- [hls.js memory leak with multiple players - GitHub Issue #1220](https://github.com/video-dev/hls.js/issues/1220) -- confirms memory grows with multiple instances (HIGH confidence)
- [hls.js memory increase with live streaming - GitHub Issue #5402](https://github.com/video-dev/hls.js/issues/5402) -- documents multi-screen memory growth pattern (HIGH confidence)
- [HLS.js cautionary tale: QoE and video player memory - Mux](https://www.mux.com/blog/an-hls-js-cautionary-tale-qoe-and-video-player-memory) -- backBufferLength default Infinity problem (HIGH confidence)
- [hls.js memory limit discussion - GitHub Issue #2668](https://github.com/video-dev/hls.js/issues/2668) -- developer seeking 200MB cap (MEDIUM confidence)
- [Migrating from Radix UI to Base UI - basecn](https://basecn.dev/docs/get-started/migrating-from-radix-ui) -- asChild vs render prop migration guide (HIGH confidence)
- [shadcn/ui Base UI migration discussion - GitHub #9562](https://github.com/shadcn-ui/ui/discussions/9562) -- community migration guide (MEDIUM confidence)
- [base-ui useRender documentation](https://base-ui.com/react/utils/use-render) -- official render prop API reference (HIGH confidence)
- [Radix to base-ui asChild conversion gist](https://gist.github.com/phibr0/48ac88eafbd711784963a3b72015fd09) -- automated conversion script (MEDIUM confidence)
- [shadcn Sidebar documentation](https://ui.shadcn.com/docs/components/radix/sidebar) -- cookie persistence, keyboard shortcuts, transition config (HIGH confidence)
- [shadcn Sidebar layout best practices - Easton Blog](https://eastondev.com/blog/en/posts/dev/20260327-shadcn-ui-sidebar-layout/) -- SidebarProvider placement guidance (MEDIUM confidence)
- [Next.js Leaflet dynamic import issue #18336](https://github.com/vercel/next.js/issues/18336) -- SSR compatibility challenges (HIGH confidence)
- [TanStack Table + Next.js App Router issue #5165](https://github.com/TanStack/table/issues/5165) -- column definition serialization problem (HIGH confidence)
- Codebase analysis: 10 existing table implementations with no shared abstraction, base-ui used across 23 UI components, existing HLS player designed for single-stream use (HIGH confidence -- direct code inspection)

---
*Pitfalls research for: SMS Platform v1.1 UI Overhaul*
*Researched: 2026-04-17*
