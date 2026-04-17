# Phase 13: Hierarchy & Map - Research

**Researched:** 2026-04-17
**Domain:** Tree UI component, resizable split panel, Leaflet map integration, drag-drop marker placement
**Confidence:** HIGH

## Summary

Phase 13 transforms the Projects page into a split-panel layout with a collapsible hierarchy tree on the left and context-sensitive DataTable on the right, while enhancing the Map page with a floating tree overlay for filtering and a click-to-place workflow for setting camera coordinates.

The codebase already has all required infrastructure: DataTable system (Phase 8), camera DataTable with columns/card view/View Stream sheet (Phase 11), Leaflet map with marker clustering and camera popups, shadcn Collapsible/Breadcrumb/ScrollArea/Sheet components, and full CRUD API endpoints for projects, sites, and cameras. The primary work is composing these into new layouts and adding tree-specific UI logic.

No new npm packages are needed. The resizable panel uses a custom pointer-events drag handler (CSS + React state). The tree component is built from existing shadcn primitives (Collapsible, ScrollArea, Input). Leaflet's `useMapEvents` hook handles click-to-place, and react-leaflet's `Marker` component natively supports `draggable` prop with `eventHandlers.dragend`.

**Primary recommendation:** Build a single shared `HierarchyTree` component with a render-prop/callback pattern so it can drive both the Projects page DataTable and the Map page marker filtering without duplication.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Tree displays Project (Folder icon + name + "(N sites)"), Site (MapPin icon + name + "(N cameras)"), Camera (status dot + name)
- D-02: All nodes collapsible/expandable with chevron indicators
- D-03: Search box at top of tree panel -- filters to matching nodes + parent chain, debounce 200ms
- D-04: Tree component shared between Projects page and Map page
- D-05: Resizable split panel -- user can drag divider between tree and DataTable
- D-06: Default tree width ~280px, min ~200px, max ~400px
- D-07: Mobile/tablet: tree hidden by default, DataTable full-width with breadcrumb, toggle button opens tree as drawer/sheet overlay
- D-08: Table shows direct children of selected node: Root -> Projects, Project -> Sites, Site -> Cameras (reuse Phase 11 DataTable columns)
- D-09: Default state: root selected, tree collapsed, table shows all projects
- D-10: Breadcrumb above DataTable reflects current tree position, clickable to navigate up
- D-11: Projects table columns: Name, Sites count, Created, Actions
- D-12: Sites table columns: Name, Cameras count, Location, Created, Actions
- D-13: Cameras at site level reuses Phase 11 camera DataTable
- D-14: Tree on map page is floating overlay panel (top-left), not side panel
- D-15: Floating panel can be opened/closed with toggle button
- D-16: Selecting node in map tree filters markers + zooms/fits bounds to those cameras
- D-17: Same tree component as Projects page, but click filters map instead of updating table
- D-18: Location editing requires explicit initiation ("Set Location" button)
- D-19: Placement mode: crosshair cursor, click to place, confirm/cancel popup
- D-20: Confirm -> PATCH camera lat/lng; Cancel -> revert
- D-21: Cameras without lat/lng show in tree but not on map; tree surfaces "no location" cameras
- D-22: Keep existing CameraPopup as-is (name, status, HLS preview, viewer count)
- D-23: Update "View Details" link to open View Stream sheet instead of camera detail page

### Claude's Discretion
- Resizable panel implementation (CSS resize, react-resizable, or custom drag handler)
- Tree component library choice (custom build vs radix-ui tree vs react-arborist)
- Floating panel animation and positioning
- Placement mode visual feedback (crosshair, pulsing marker, instructions tooltip)
- Tree expand/collapse animation
- Loading states for tree data fetch
- Empty states (no projects, no sites, no cameras)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HIER-01 | User can navigate Project > Site > Camera hierarchy via tree viewer on left panel | HierarchyTree component with collapsible nodes, search, selection; split panel layout with resizable divider |
| HIER-02 | User sees data table on right panel showing children of selected tree node | Navigation matrix (root->projects, project->sites, site->cameras); reuse DataTable + Phase 11 camera columns |
| MAP-01 | User can filter cameras on map using tree viewer (same as project tree) | Floating overlay panel with same HierarchyTree; `filteredCameraIds` prop on CameraMap; FitBounds to filtered subset |
| MAP-02 | User can drag-drop marker on map to set camera lat/lng | Click-to-place via `useMapEvents` hook; confirm/cancel flow; PATCH `/api/cameras/{id}` with `{location: {lat, lng}}` |
| MAP-03 | User can hover/click map marker to see camera preview popup | Already implemented in CameraPopup; update "View Details" to open View Stream sheet; add "Set Location" button |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-leaflet | 5.0.0 | Map component library | Already used in CameraMap; native `draggable` prop on Marker, `useMapEvents` hook for click handling [VERIFIED: apps/web/package.json] |
| leaflet | 1.9.4 | Map engine | Already used; provides `L.latLngBounds`, `L.divIcon`, map event system [VERIFIED: apps/web/package.json] |
| @tanstack/react-table | 8.21.3 | DataTable engine | Already used in Phase 8 DataTable system [VERIFIED: apps/web/package.json] |
| lucide-react | 1.8.0 | Icons | Folder, MapPin, MapPinOff, ChevronRight, Search, PanelLeft, X icons needed [VERIFIED: apps/web/package.json] |
| date-fns | 4.1.0 | Date formatting | `formatDistanceToNow` for Created columns [VERIFIED: apps/web/package.json] |

### Supporting (Already Installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-leaflet-cluster | 4.1.3 | Marker clustering | Already used in CameraMapInner for grouping markers at zoom levels [VERIFIED: apps/web/package.json] |
| hls.js | 1.6.15 | HLS playback in popup | Already used in CameraPopup for mini HLS preview [VERIFIED: apps/web/package.json] |
| sonner (toast) | Already installed | Toast notifications | "Project created", "Location updated", etc. [VERIFIED: existing usage in tenant-projects-page.tsx] |

### New Dependencies

**None required.** All packages are already installed. [VERIFIED: UI-SPEC explicitly states "No new shadcn components needed" and "No additional library needed" for resizable panel]

## Architecture Patterns

### Recommended Project Structure

```
apps/web/src/
  components/
    hierarchy/
      hierarchy-tree.tsx          # Shared tree component (D-04)
      tree-node.tsx               # Individual node renderer
      tree-search.tsx             # Search input with filter logic
      use-hierarchy-data.ts       # Hook: fetch projects > sites > cameras tree
    map/
      camera-map.tsx              # Existing (add filteredCameraIds prop)
      camera-map-inner.tsx        # Existing (accept filtered cameras)
      camera-marker.tsx           # Existing (add draggable mode)
      camera-popup.tsx            # Existing (update View Details -> View Stream)
      map-tree-overlay.tsx        # NEW: floating panel wrapper for tree on map
      placement-mode.tsx          # NEW: click-to-place UI state machine
    pages/
      tenant-projects-page.tsx    # OVERWRITE: split panel with tree + DataTable
      tenant-map-page.tsx         # OVERWRITE: map with tree overlay + placement
  app/admin/projects/
    components/
      projects-columns.tsx        # NEW: "use client" column defs for projects table
      sites-columns.tsx           # NEW: "use client" column defs for sites table
      hierarchy-split-panel.tsx   # NEW: resizable container (tree left, table right)
```

### Pattern 1: Shared Tree with Callback Injection

**What:** A single `HierarchyTree` component that accepts an `onSelect` callback. The Projects page passes a callback that updates DataTable context; the Map page passes a callback that filters map markers.

**When to use:** Any time the same navigation component drives different downstream behavior.

**Example:**

```typescript
// hierarchy-tree.tsx
interface HierarchyTreeProps {
  onSelect: (node: TreeNode | null) => void;
  selectedId?: string | null;
  className?: string;
}

// Projects page usage
<HierarchyTree onSelect={(node) => setSelectedNode(node)} selectedId={selectedNode?.id} />

// Map page usage
<HierarchyTree onSelect={(node) => setFilterNode(node)} selectedId={filterNode?.id} />
```

[VERIFIED: D-04 requires shared component, D-08/D-16 define different click behaviors]

### Pattern 2: Resizable Split Panel with Pointer Events

**What:** Custom drag handler using `onPointerDown` on a divider element, tracking mouse position to resize the left panel width. Uses CSS `resize: none` (not the CSS `resize` property) -- entirely JavaScript-driven for full control.

**When to use:** Resizable panels where min/max constraints and mobile breakpoint switching are needed.

**Example:**

```typescript
// hierarchy-split-panel.tsx
function HierarchySplitPanel({ tree, table }: Props) {
  const [width, setWidth] = useState(280);
  const isDragging = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const newWidth = Math.min(400, Math.max(200, e.clientX - containerLeft));
    setWidth(newWidth);
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div className="flex h-[calc(100vh-...)]">
      <div style={{ width }} className="shrink-0 overflow-hidden border-r">
        {tree}
      </div>
      <div
        className="w-2 cursor-col-resize shrink-0 flex items-center justify-center hover:bg-primary/20"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
      />
      <div className="flex-1 min-w-0 overflow-auto">{table}</div>
    </div>
  );
}
```

[ASSUMED: Custom pointer-events approach recommended over libraries for this constrained use case]

### Pattern 3: Placement Mode State Machine

**What:** A state machine for map click-to-place: `idle` -> `placing` (crosshair cursor, listening for click) -> `confirming` (preview marker, confirm/cancel popup) -> `idle`.

**When to use:** Any multi-step user interaction that modifies map state.

**Example:**

```typescript
type PlacementState =
  | { mode: 'idle' }
  | { mode: 'placing'; cameraId: string; cameraName: string }
  | { mode: 'confirming'; cameraId: string; cameraName: string; lat: number; lng: number };
```

[VERIFIED: D-18 through D-20 describe this exact flow]

### Pattern 4: Tree Search with Parent Chain Preservation

**What:** When the search filter is active, show matching nodes and all their ancestors, even if ancestors don't match. This ensures tree structure is always visible.

**When to use:** Any hierarchical filter that must preserve context.

**Example:**

```typescript
function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  return nodes.reduce<TreeNode[]>((acc, node) => {
    const matchesQuery = node.name.toLowerCase().includes(query.toLowerCase());
    const filteredChildren = node.children ? filterTree(node.children, query) : [];

    if (matchesQuery || filteredChildren.length > 0) {
      acc.push({
        ...node,
        children: matchesQuery ? node.children : filteredChildren,
      });
    }
    return acc;
  }, []);
}
```

[VERIFIED: D-03 specifies "show matching nodes and their parent chain"]

### Anti-Patterns to Avoid

- **Separate tree components for Projects and Map:** D-04 explicitly requires a shared component. Do not create `ProjectTree` and `MapTree` -- create one `HierarchyTree` with callbacks.
- **Inline Leaflet imports in server components:** react-leaflet MUST be dynamically imported with `ssr: false`. The existing `camera-map.tsx` pattern (`dynamic(() => import(...), { ssr: false })`) must be preserved. [VERIFIED: existing code pattern]
- **Fetching tree data per-level on expand:** The hierarchy is small enough (projects * sites * cameras per org) to fetch in one call. Lazy loading adds complexity without benefit at this scale. [ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Marker clustering | Custom clustering logic | `react-leaflet-cluster` (already used) | Edge cases with zoom levels, animation, cluster splitting |
| DataTable sorting/filtering/pagination | Manual table logic | `@tanstack/react-table` via DataTable component | Already built in Phase 8, well-tested |
| HLS video playback | Custom media source buffer management | `hls.js` (already used in CameraPopup) | Codec negotiation, ABR, error recovery |
| Scroll overflow in tree panel | Custom scroll handling | shadcn `ScrollArea` (already installed) | Cross-browser scrollbar styling, touch support |
| Mobile drawer overlay | Custom slide-in panel | shadcn `Sheet side="left"` (already installed) | Animation, backdrop, focus trap, accessibility |
| Breadcrumb with separators | Custom breadcrumb markup | shadcn `Breadcrumb` components (already installed) | ARIA nav, separator rendering, responsive truncation |

**Key insight:** This phase is primarily a composition phase -- nearly every UI primitive is already available. The risk is in the interaction wiring (tree selection -> table update, tree selection -> map filter, placement mode state), not in missing components.

## Common Pitfalls

### Pitfall 1: Leaflet Container Resize After Panel Width Change

**What goes wrong:** When the resizable panel width changes, the Leaflet map container size changes but Leaflet doesn't know about it. Map tiles render incorrectly with gray areas.
**Why it happens:** Leaflet caches its container size and only recalculates on `invalidateSize()`.
**How to avoid:** Call `map.invalidateSize()` after resizer drag ends. The existing `ResizeHandler` in `camera-map-inner.tsx` only listens for `window.resize` events -- it won't catch panel resizing. For the map page floating panel, this is less of an issue since the panel overlays the map rather than sharing horizontal space.
**Warning signs:** Gray tiles, markers in wrong positions, map not filling container.

### Pitfall 2: Stale Tree Data After CRUD Operations

**What goes wrong:** User creates a project via dialog, but the tree doesn't update because tree data is fetched separately from table data.
**Why it happens:** Tree and table may have separate fetch hooks that don't share invalidation.
**How to avoid:** Use a single `useHierarchyData` hook that returns both tree structure and table data. After any CRUD operation, refetch from this single hook. Or use a shared `refreshKey` counter.
**Warning signs:** Tree shows stale counts after create/delete operations.

### Pitfall 3: HLS Player Memory Leak in Map Popups

**What goes wrong:** Each time a popup opens, a new hls.js instance is created. If the user clicks many markers without closing popups, memory grows.
**Why it happens:** Leaflet popups may not trigger React cleanup when the popup is closed by clicking elsewhere on the map.
**How to avoid:** The existing `CameraPopup` already handles cleanup in its `useEffect` return. However, verify that Leaflet's popup close event triggers React unmount. If not, use Leaflet's `popupclose` event to manually destroy the hls instance.
**Warning signs:** Browser memory climbing when interacting with map markers.

### Pitfall 4: Tree Node Click Bubbling

**What goes wrong:** Clicking the chevron to expand a node also triggers the selection callback, causing unexpected table navigation.
**Why it happens:** Click event bubbles from chevron to the node row.
**How to avoid:** `e.stopPropagation()` on the chevron click handler. Separate expand/collapse (chevron click) from selection (node label/row click).
**Warning signs:** Expanding a node also changes the DataTable content.

### Pitfall 5: Mobile Breakpoint Mismatch with Sheet

**What goes wrong:** On tablets at exactly 768px, the layout may flicker between split-panel and drawer mode.
**Why it happens:** CSS media query at `md:` (768px) and JavaScript `matchMedia` may not agree.
**How to avoid:** Use a single source of truth for the breakpoint -- either CSS-only with responsive utilities, or a `useMediaQuery` hook that drives both layout and sheet visibility.
**Warning signs:** Layout jumping on iPad-width screens.

## Code Examples

### Hierarchy Data Hook

```typescript
// Source: Derived from existing API endpoints in cameras.controller.ts
// GET /api/projects returns projects with _count.sites
// GET /api/projects/:id returns project with sites (including _count.cameras)
// GET /api/cameras returns all cameras with location

interface TreeNode {
  id: string;
  type: 'project' | 'site' | 'camera';
  name: string;
  childCount: number;
  status?: string;
  hasLocation?: boolean;
  children?: TreeNode[];
}

async function fetchHierarchyTree(): Promise<TreeNode[]> {
  // Option A: Single endpoint (needs new backend route)
  // Option B: Compose from existing endpoints (3 calls)
  const [projects, cameras] = await Promise.all([
    apiFetch<Project[]>('/api/projects'),       // includes _count.sites
    apiFetch<CameraRow[]>('/api/cameras'),       // includes site.id, location
  ]);

  // For each project, fetch its sites
  // This is N+1 -- consider adding a /api/hierarchy endpoint
  // that returns the full tree in one call
}
```

[VERIFIED: API endpoints exist -- GET /api/projects, GET /api/projects/:id (includes sites with camera counts), GET /api/cameras]

### Backend Consideration: Hierarchy Endpoint

The current API requires multiple calls to build the tree:
1. `GET /api/projects` -- returns projects with `_count.sites`
2. `GET /api/projects/:id` -- returns project with sites and `_count.cameras` (one call per project)
3. `GET /api/cameras` -- returns all cameras

For a small number of projects, calling `GET /api/projects` then `GET /api/projects/:id` for each is acceptable. But a dedicated `GET /api/hierarchy` endpoint that returns the full tree in one response would be cleaner. [ASSUMED: N+1 pattern is acceptable at this scale, but a single endpoint is recommended]

### Draggable Marker with react-leaflet v5

```typescript
// Source: https://react-leaflet.js.org/docs/example-draggable-marker/
import { Marker, Popup, useMapEvents } from 'react-leaflet';

function PlacementMarker({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  const [position, setPosition] = useState<[number, number] | null>(null);

  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
      onPlace(e.latlng.lat, e.latlng.lng);
    },
  });

  return position ? (
    <Marker position={position} icon={pulsingGreenIcon} />
  ) : null;
}
```

[CITED: https://react-leaflet.js.org/docs/example-draggable-marker/]

### Camera Location Update (Existing API)

```typescript
// Source: apps/api/src/cameras/dto/update-camera.dto.ts
// PATCH /api/cameras/:id
await apiFetch(`/api/cameras/${cameraId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    location: { lat: 13.7563, lng: 100.5018 },
  }),
});
```

[VERIFIED: UpdateCameraSchema accepts `location: { lat: number, lng: number }` as optional field]

### FitBounds to Filtered Cameras

```typescript
// Source: Existing FitBounds component in camera-map-inner.tsx
// Enhanced to accept filtered camera subset
function FitBounds({ cameras }: { cameras: Array<{ latitude: number; longitude: number }> }) {
  const map = useMap();

  useEffect(() => {
    if (cameras.length === 0) return;
    if (cameras.length === 1) {
      map.setView([cameras[0].latitude, cameras[0].longitude], 16);
      return;
    }
    const bounds = L.latLngBounds(
      cameras.map((c) => [c.latitude, c.longitude] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [map, cameras]);

  return null;
}
```

[VERIFIED: Existing FitBounds pattern in camera-map-inner.tsx, enhanced for single-camera zoom per D-16]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate project detail page (`/app/projects/[id]`) | Tree navigation in split panel -- no separate page needed | This phase | Project detail route can be removed or redirected |
| Simple `<Table>` for projects/sites | DataTable with sorting/filtering/pagination | Phase 8 | Projects and Sites tables now use the same DataTable system as cameras |
| Static map markers (no filtering) | Tree-driven map marker filtering with bounds fitting | This phase | Map becomes interactive navigation tool, not just display |
| "View Details" link to camera detail page | "View Stream" button opens Sheet overlay | Phase 11 -> Phase 13 | Camera popup and tree both use View Stream sheet |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Custom pointer-events drag handler is sufficient for resizable panel (no library needed) | Architecture Patterns | Low -- can swap to a library if edge cases emerge (touch events, iframe interactions) |
| A2 | N+1 API calls for tree data (one per project) is acceptable at this scale | Code Examples | Medium -- if orgs have many projects, this could be slow. Mitigate with a dedicated hierarchy endpoint |
| A3 | Full hierarchy tree is small enough to fetch in one call (no lazy loading needed) | Anti-Patterns | Low -- typical surveillance org has 5-20 projects with 2-10 sites each |

## Open Questions

1. **Hierarchy API endpoint**
   - What we know: Current API requires `GET /api/projects` + `GET /api/projects/:id` per project to build full tree with camera data
   - What's unclear: Whether to add a dedicated `GET /api/hierarchy` endpoint or compose on the frontend
   - Recommendation: Add a `GET /api/hierarchy` endpoint in the backend that returns the full Project > Site > Camera tree with counts in a single response. This avoids N+1 calls and is a simple Prisma query with nested includes. If time-constrained, compose from existing endpoints on the frontend.

2. **Project detail page removal**
   - What we know: The tree replaces the need for `/admin/projects/[id]` route
   - What's unclear: Whether to delete the route or keep it as a redirect
   - Recommendation: Keep the route file but redirect to `/admin/projects` with the project auto-selected in the tree. This prevents broken links.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified -- this phase is purely frontend UI composition using already-installed packages).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + jsdom |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/web && npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIER-01 | Tree renders projects/sites/cameras with correct icons and counts | unit | `cd apps/web && npx vitest run src/__tests__/hierarchy-tree.test.tsx -x` | No -- Wave 0 |
| HIER-01 | Tree search filters nodes and preserves parent chain | unit | `cd apps/web && npx vitest run src/__tests__/hierarchy-tree.test.tsx -x` | No -- Wave 0 |
| HIER-02 | Selecting tree node updates DataTable to show correct children | unit | `cd apps/web && npx vitest run src/__tests__/hierarchy-split-panel.test.tsx -x` | No -- Wave 0 |
| MAP-01 | Selecting tree node filters map markers | unit | `cd apps/web && npx vitest run src/__tests__/map-tree-overlay.test.tsx -x` | No -- Wave 0 |
| MAP-02 | Placement mode state machine transitions correctly | unit | `cd apps/web && npx vitest run src/__tests__/placement-mode.test.tsx -x` | No -- Wave 0 |
| MAP-03 | CameraPopup renders View Stream button and Set Location button | unit | `cd apps/web && npx vitest run src/__tests__/camera-popup.test.tsx -x` | No -- Wave 0 |

### Sampling Rate

- **Per task commit:** `cd apps/web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd apps/web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/web/src/__tests__/hierarchy-tree.test.tsx` -- covers HIER-01 (tree rendering + search)
- [ ] `apps/web/src/__tests__/hierarchy-split-panel.test.tsx` -- covers HIER-02 (tree-to-table navigation)
- [ ] `apps/web/src/__tests__/map-tree-overlay.test.tsx` -- covers MAP-01 (tree filtering map)
- [ ] `apps/web/src/__tests__/placement-mode.test.tsx` -- covers MAP-02 (state machine)
- [ ] `apps/web/src/__tests__/camera-popup.test.tsx` -- covers MAP-03 (updated popup buttons)

Note: Leaflet tests require mocking `window.L` and `MapContainer`. Use `vi.mock('react-leaflet')` for map component tests.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Already handled by AuthGuard in NestJS |
| V3 Session Management | No | Already handled by existing session system |
| V4 Access Control | Yes | RLS on org_id ensures users only see their own projects/sites/cameras. Existing `getOrgId()` pattern in controller enforces this. [VERIFIED: cameras.controller.ts uses `this.getOrgId()` for all operations] |
| V5 Input Validation | Yes | Zod schemas for create/update project, site, camera. Location update validated as `{ lat: number, lng: number }`. [VERIFIED: update-camera.dto.ts] |
| V6 Cryptography | No | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User sets camera location to coordinates outside valid range | Tampering | Zod validates lat/lng as numbers; consider adding range validation (-90 to 90, -180 to 180) [ASSUMED: not currently validated] |
| Cross-org tree data leakage | Information Disclosure | RLS + org_id scoping already prevents this. All queries go through `this.tenancy` which applies RLS. [VERIFIED: cameras.service.ts uses `this.tenancy.project.findMany()`] |

## Sources

### Primary (HIGH confidence)
- `apps/web/src/components/map/camera-map-inner.tsx` -- Existing Leaflet map implementation, FitBounds, ResizeHandler
- `apps/web/src/components/map/camera-marker.tsx` -- Current marker implementation (not draggable)
- `apps/web/src/components/map/camera-popup.tsx` -- Current popup with HLS preview, "View Details" link to update
- `apps/web/src/components/pages/tenant-projects-page.tsx` -- Current projects page to replace
- `apps/web/src/components/pages/tenant-map-page.tsx` -- Current map page to enhance
- `apps/web/src/components/ui/data-table/data-table.tsx` -- DataTable component API (columns, searchKey, facetedFilters, toolbar, emptyState)
- `apps/api/src/cameras/cameras.controller.ts` -- All project/site/camera CRUD endpoints
- `apps/api/src/cameras/cameras.service.ts` -- Prisma queries for hierarchy data
- `apps/api/src/cameras/dto/update-camera.dto.ts` -- Camera location update schema
- `apps/api/src/prisma/schema.prisma` -- Project > Site > Camera data model
- `apps/web/package.json` -- All dependency versions verified

### Secondary (MEDIUM confidence)
- [react-leaflet draggable marker docs](https://react-leaflet.js.org/docs/example-draggable-marker/) -- Draggable marker pattern with eventHandlers
- [react-leaflet events docs](https://react-leaflet.js.org/docs/example-events/) -- useMapEvents for click-to-place

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages already installed and verified in package.json
- Architecture: HIGH -- building on well-established existing patterns (DataTable, Leaflet map, shadcn components)
- Pitfalls: MEDIUM -- Leaflet resize and popup memory issues are known but specific edge cases depend on implementation

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days -- stable tech stack, no expected breaking changes)
