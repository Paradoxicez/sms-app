# Phase 18: Dashboard & Map Polish - Research

**Researched:** 2026-04-21 (regenerated; original pass informed already-written 18-00..18-06 PLANs)
**Domain:** Next.js 15 + React 19 dashboard composition · Leaflet map markers & clustering · NestJS 11 + Prisma 6 admin aggregations
**Confidence:** HIGH (stack verified against live package.json + npm registry + node_modules bundle inspection; Prisma schema field names verified line-by-line)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tenant Dashboard (`/app/dashboard`)**
- **D-01:** Remove `<SystemMetrics />` entirely from `tenant-dashboard-page.tsx:123` — not just gate the `isSuperAdmin` guard. Super admin views CPU/Mem/Load/SRS Uptime under `/admin/dashboard` per Phase 16 D-02 portal separation.
- **D-02:** Stat cards go from 4 → 6 on tenant: Cameras Online · Cameras Offline · Cameras Recording (new) · In Maintenance (new) · Total Viewers · Stream Bandwidth. Grid breakpoint is Claude discretion.
- **D-03:** Keep **both** BandwidthChart + ApiUsageChart. Dashboard = real-time ops trend (distinct from `/account` Plan & Usage = quota view).
- **D-04:** Replace `<CameraStatusTable />` with new **Issues panel**. Shows only cameras needing attention (offline/degraded/reconnecting/maintenance/recording-failed). Action buttons per row: Investigate, View, Restart. Empty state is a reward signal: `All cameras healthy — N cameras online, 0 issues`. Sort severity desc. Real-time via Socket.IO `useCameraStatus` + polling fallback.

**Super Admin Dashboard (`/admin/dashboard`)**
- **D-05:** Stat cards 5 → 7: Organizations · Total Cameras · Cameras Online · Cameras Offline · Stream Bandwidth · Active Streams (new — count from SRS `/api/v1/streams`) · Recordings Active (new — count of cameras with `isRecording=true` across all orgs).
- **D-06:** Keep SystemMetrics 4 cards (CPU/Mem/Load/SRS Uptime) — core of super admin view.
- **D-07:** Vertical priority stack order: stat cards → SystemMetrics → Platform Issues → Cluster/Edge Nodes → Storage forecast → Org Health Overview table → Recent platform audit highlights.
- **D-08:** Cluster/Edge Nodes panel (new). Columns: node name, role (origin/edge), status, uptime, connection count. Attention trigger when node down. Source: existing Phase 6 cluster service.
- **D-09:** Platform-wide Issues panel (new). Cross-org: SRS down · edge disconnected · MinIO unreachable · FFmpeg pool saturated · org with >50% offline cameras · failed recording streams. Empty state: `Platform healthy`.
- **D-10:** Storage forecast (new). Line chart of MinIO storage trend with 7d/30d toggle + estimated days until full. Source: MinIO bucket stats (recordings + avatars).
- **D-11:** Recent platform audit highlights (new). 5–10 latest entries (org created, package changed, user suspended, cluster node added/removed). Click → `/admin/audit`.
- **D-12:** Migrate Organization Summary → **DataTable** (Phase 14 pattern). Columns: Org name · Plan · Cameras (used/limit) · Storage (used/limit) · Bandwidth (today) · Status (issues count) · Actions (View, Manage). Default sort: % usage desc. Actions → `/admin/organizations/{id}` and `/admin/organizations/{id}/settings`.

**Map Marker (`/app/map`, `/admin/map`)**
- **D-13:** Teardrop pin 28×36 + lucide `Camera` icon (white) centered. Fill = connection status color. Anchor at pin tip (bottom center). Google Maps style.
- **D-14:** Multi-status badges on marker corners. Recording = red 8px dot top-right (gentle pulse). Maintenance = 10px gray wrench bottom-right. Connection color on pin body is **not** overridden by secondary state.
- **D-15:** Reconnecting state preserves the existing pulse animation on amber fill.
- **D-16:** Marker clustering via `react-leaflet-cluster`. Cluster bubble shows count + worst-status color across children (any offline child → red). Click cluster → zoom-in. Default cluster radius.

**Map Popup (`camera-popup.tsx`)**
- **D-17:** Preview expands 200×112 → **240×135 (16:9)**. Use the existing `<PreviewVideo>` memoized component — **do not touch memoization logic** (prevents Phase 13 flicker/runaway viewer count).
- **D-18:** Status overlay on preview top-left. REC dot + `REC` text (gentle pulse) when recording. Wrench icon + `Maintenance` when maintenance. Both on semi-transparent background so the image is still visible.
- **D-19:** Popup gains Recording badge (+ retention `(N days)`), Maintenance badge (+ who/when), and Last-online timestamp (only when `status=offline`).
- **D-20:** **No** coordinates / camera tags in popup (avoid bloat; view in camera detail).
- **D-21:** Action restructure. Primary 2: View Stream + View Recordings (deep-links to `/app/recordings?camera={id}` from Phase 17). Secondary `⋮` dropdown: Set Location · Toggle Maintenance (Phase 15-03 API) · Open Camera Detail.
- **D-22:** Popup width 280–320px (Leaflet `maxWidth={320} minWidth={280}`). Replaces current `maxWidth=240`.

**Cross-cutting**
- **D-23:** Real-time strategy unchanged. Socket.IO `useCameraStatus` for per-camera state; 30s polling for aggregate stats (`useDashboardStats`) and SRS metrics. No new channels.
- **D-24:** Issues panel data source = compose from existing services on read (StatusService.getViewerCount, recording status, maintenance flag, SRS streams). **No new "issues" table.**

### Claude's Discretion

- Stat card grid breakpoints (`lg:grid-cols-3 xl:grid-cols-6` tenant; `lg:grid-cols-4 xl:grid-cols-7` admin — already committed in UI-SPEC)
- Issues panel polling interval (30s default)
- Offline threshold definitions (reuse existing status state machine — no change)
- Color/contrast tuning for marker badges (amber-pin + white camera icon gets a 1px dark outline for 3:1)
- Mobile responsive behavior (stat cards stack; widgets become full-width)
- Storage forecast chart type (line chart — mirrors existing BandwidthChart pattern)
- Recent audit filter event types + row count (7 default, clamp to 1–10)
- Loading skeletons and empty-state wording for new widgets
- Cluster bubble intermediate thresholds (worst-status rule locked; opacity + ring tuning free)

### Deferred Ideas (OUT OF SCOPE)

- Live preview grid (4–6 HLS thumbnails) on tenant dashboard — bandwidth-heavy; opt-in widget later
- Recent activity feed on tenant dashboard — overlaps Issues panel
- Mini map embed on tenant dashboard — duplicates `/map`
- Tab-based layout for super admin dashboard — rejected in favor of vertical priority stack
- Coordinates + camera tags in popup — bloats popup
- Marker spider effect on overlap — cluster bubble already solves
- Issues panel ack/snooze/assign workflow
- Storage forecast per-bucket / multi-region breakdown
- Cluster node individual control (kick, restart)
- Custom per-user widget arrangement
</user_constraints>

## Summary

Phase 18 is a **composition-only UI polish** on top of existing Phase 15 (recording + maintenance fields) and Phase 17 (recordings page) surfaces. No schema migration. The stack is already in place:

- Frontend: Next.js 15.0 App Router + React 19 + Tailwind 4 + shadcn base-nova + `react-leaflet` 5.0 + `react-leaflet-cluster` 4.1.3 + `leaflet.markercluster` 1.5.3 + Recharts 3.8 + `@tanstack/react-table` 8.21 + `hls.js` 1.6 + `date-fns` 4.1 + `lucide-react` 1.8 + Vitest 3 [VERIFIED: apps/web/package.json].
- Backend: NestJS 11 + Prisma 6.19 + better-auth + BullMQ + MinIO + Socket.IO + zod 3.25 [VERIFIED: apps/api/package.json].

Critical correctness anchors:

1. The `PreviewVideo` memoized block in `camera-popup.tsx` lines 26–78 is **load-bearing** — a prior Phase 13 bug caused runaway viewer count + flicker when `viewerCount` prop changes tore down HLS. The refactor must extend **around** it, never modify it.
2. The Prisma schema uses `maintenanceEnteredBy` / `maintenanceEnteredAt` — NOT `maintenanceEnabledBy` / `maintenanceEnabledAt`. CONTEXT.md §D-19 and §canonical_refs both spell it incorrectly; all code and tests must use the **schema** names [VERIFIED: apps/api/src/prisma/schema.prisma:223-224].
3. `L.divIcon.html` is a raw-HTML sink. Camera name interpolated into `aria-label` must go through an `escapeHtml` helper (T-18-XSS-MARKER).
4. `react-leaflet-cluster` v4.1.3 does **not** auto-refresh bubble color when child `divIcon` HTML changes — resolved by explicit `markerClusterGroupRef.current?.refreshClusters()` on status events (see OQ-03 resolution below). The underlying `leaflet.markercluster` 1.5.3 library exposes `refreshClusters()` as a public method [VERIFIED: grep of node_modules dist].
5. Super admin aggregate queries must stream BigInt → string before serialization (T-18-BIGINT-JSON), and raw SQL must use `Prisma.sql` tagged templates (T-18-SQLI-FORECAST).

**Primary recommendation:** Execute as six plans (18-00 Wave 0 scaffolds → 18-01 backend → 18-02 tenant · 18-03 marker · 18-05 admin widgets → 18-04 popup · 18-06 admin page). Plans are already written and consume this research's §Pattern / §Pitfall / §Example / §Validation sections.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-05 | Dashboard org admin + super admin ปรับข้อมูลให้เหมาะสม | §Pattern 4 (DataTable migration), §Pattern 5 (admin aggregation), §Pattern 6 (storage forecast), §Pattern 7 (Issues composition), §Security Domain T-18-AUTHZ-ADMIN / T-18-TENANCY-ISSUES |
| UI-06 | Map thumbnail popup + pin design ปรับให้สวยขึ้น | §Pattern 1 (cluster integration), §Pattern 2 (worst-status cluster icon), §Pattern 3 (teardrop SVG divIcon + PreviewVideo memo preservation), §Security Domain T-18-XSS-MARKER / T-18-XSS-POPUP / T-18-MEMO-REGRESSION |

## Standard Stack

### Core (verified against `apps/web/package.json` + `apps/api/package.json` + `npm view <pkg> version`)

| Library | Version (repo) | npm latest | Purpose | Why Standard |
|---------|-----|-----|---------|--------------|
| Next.js | ^15.0.0 | — | Tenant + admin dashboard pages (Server + Client components) | App Router already adopted; no change |
| React | ^19.0.0 | — | Rendering | Paired with Next 15 |
| Tailwind CSS | ^4.2.2 | — | Styling | Already in play; tokens defined in `globals.css` |
| shadcn (CLI) | ^4.2.0 | — | Component primitives (base-nova preset) | All dashboard primitives already installed |
| TanStack React Table | ^8.21.3 | 8.21.3 | Org Health DataTable (D-12) | Phase 14 pattern |
| Recharts | ^3.8.0 | 3.8.1 | StorageForecastCard LineChart + existing BandwidthChart/ApiUsageChart | Already used |
| Leaflet | ^1.9.4 | — | Map engine | Existing |
| react-leaflet | ^5.0.0 | 5.0.0 | React bindings | Existing |
| react-leaflet-cluster | ^4.1.3 | 4.1.3 | Marker clustering (D-16) | Already wrapping markers in `camera-map-inner.tsx:131`; need to add `iconCreateFunction` prop |
| leaflet.markercluster | ^1.5.3 | 1.5.3 | Cluster engine peer | `refreshClusters()` public method confirmed in bundle |
| hls.js | ^1.6.15 | 1.6.16 | PreviewVideo HLS playback | Already used — **do not alter** |
| date-fns | ^4.1.0 | 4.1.0 | `formatDistanceToNowStrict` for all relative times (Issues, popup, audit) | Already used |
| lucide-react | ^1.8.0 | — | Icons (`Camera, Video, Wrench, Play, Film, MoreVertical, MapPin, ExternalLink, CheckCircle2, ArrowRight, RotateCw, Activity, Circle, Building2, Eye, Wifi, MonitorOff`) | Already used |
| socket.io-client | ^4.8.3 | — | Real-time status events (Issues panel refresh, viewers) | Already used |
| zod (web) | ^4.3.6 | — | Form/response validation where needed | Already used |
| zod (api) | ^3.25.76 | — | Controller query validation (range enum, limit clamp) | Already used |
| @nestjs/common | ^11.0.0 | — | Controllers, guards, pipes | Existing |
| @nestjs/core | ^11.0.0 | — | Module system | Existing |
| @nestjs/schedule | ^6.1.1 | — | (if needed for polling jobs — not used this phase) | Reserved |
| Prisma | ^6.19.3 | — | ORM + `$queryRaw` + `Prisma.sql` parameterized templates | Existing |
| @prisma/client | ^6.19.3 | — | Runtime | Existing |
| MinIO client | ^8.0.7 | — | Bucket-level storage stats (fallback path for storage forecast) | Existing — not strictly required if we query `RecordingSegment` directly via Prisma |
| Vitest (web) | 3 | — | Unit/component tests | Existing |
| Vitest (api) | 2 | — | Integration tests vs `sms_platform_test` DB | Existing |
| Testing Library (react/user-event/jest-dom) | 16/14/6 | — | DOM assertions | Existing |

### Supporting (new in this phase)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn `toggle-group` primitive | install via CLI | StorageForecastCard 7d/30d switcher | Only place the toggle-group is needed. CLI install per OQ-04 resolution. |

### Alternatives Considered (and rejected)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-leaflet-cluster` worst-status icon | Custom L.FeatureGroup per status color | Custom grouping loses default spiderfy + zoom behavior |
| Shadcn `toggle-group` | Native `<select>` | Breaks with existing shadcn visual consistency |
| Server-side sort on DataTable | Client-side TanStack sort | Org scale is tens (not thousands); client sort is fine (T-18-SORT-OVERFLOW accepted) |
| MinIO `bucketStats` API for forecast | `RecordingSegment.size` aggregation in Postgres | Prisma query is atomic + testable; MinIO polling adds network dep |
| Recharts `AreaChart` for storage | `LineChart` | Line matches existing BandwidthChart; area was a Claude discretion option — chose line for consistency |

### Installation

No new npm installs for **Plans 01–04, 06**. Plan 05 Task 1 runs:

```bash
cd apps/web && npx shadcn@latest add toggle-group
```

`toggle-group` is shadcn official; safety gate not required. If offline, manually vendor the primitive (radix-ui-react-toggle-group + shadcn wrapper — template per shadcn docs).

### Version verification

Package versions confirmed against live npm registry on 2026-04-21:

```
react-leaflet-cluster 4.1.3   ✓ matches package.json ^4.1.3
react-leaflet         5.0.0   ✓
recharts              3.8.1   (package.json ^3.8.0 — compatible)
hls.js                1.6.16  (package.json ^1.6.15 — compatible)
@tanstack/react-table 8.21.3  ✓
date-fns              4.1.0   ✓
leaflet.markercluster 1.5.3   ✓
```

[VERIFIED: npm view each package version on 2026-04-21]

## Project Constraints (from CLAUDE.md)

- **Stream Engine:** SRS (already running; no change this phase).
- **Deployment:** Docker Compose; all new endpoints run inside existing `apps/api` NestJS container.
- **UI Design:** Preserve green theme + sidebar nav + card-based dashboard. Color tokens live in `apps/web/src/app/globals.css`; use `--primary`, `--destructive`, `--chart-1..5`.
- **Security Model:** Session-based; TENANCY_CLIENT (RLS) for tenant routes; SuperAdminGuard for `/api/admin/*` routes.
- **GSD Workflow Enforcement:** All file edits go through `/gsd-execute-phase` — research output is consumed by planner, not executor.
- **Developer profile (Thai):** Discussion language Thai; code + API identifiers English; per-camera dialog copy bilingual (ยืนยัน / Confirm).
- **SaaS role architecture memory:** Super Admin = platform ops (`/admin`), Org Admin = tenant (`/app`). No merged sidebar. [`saas_role_architecture.md`]

## Architecture Patterns

### Recommended Project Structure

```
apps/web/src/
├── app/
│   └── admin/dashboard/components/    # Super admin page-scoped components
│       ├── org-health-columns.tsx     # TanStack ColumnDef factory
│       └── org-health-data-table.tsx  # DataTable wrapper
├── components/
│   ├── dashboard/                     # Shared dashboard widgets
│   │   ├── stat-card.tsx              # (existing) Reused verbatim
│   │   ├── issues-panel.tsx           # (new) Tenant Issues panel
│   │   ├── platform-issues-panel.tsx  # (new) Super admin cross-org issues
│   │   ├── cluster-nodes-panel.tsx    # (new)
│   │   ├── storage-forecast-card.tsx  # (new)
│   │   ├── recent-audit-highlights.tsx# (new)
│   │   └── bandwidth-chart.tsx        # (existing) Kept
│   ├── map/
│   │   ├── camera-marker.tsx          # refactor: teardrop SVG + badges
│   │   ├── camera-map-inner.tsx       # refactor: add cluster iconCreateFunction
│   │   └── camera-popup.tsx           # refactor: 16:9 preview + overlay + actions
│   └── ui/toggle-group.tsx            # (install via shadcn CLI)
├── hooks/
│   ├── use-dashboard-issues.ts        # (new) Tenant Issues composition hook
│   ├── use-platform-dashboard.ts      # (new) 5 admin sub-hooks
│   └── use-dashboard-stats.ts         # (extend types) Adds Phase 15 fields
├── lib/
│   └── escape-html.ts                 # (new) Escape for L.divIcon HTML
└── test-utils/
    └── camera-fixtures.ts             # (new) Shared fixtures with Phase 15 fields

apps/api/src/
├── admin/
│   ├── admin-dashboard.service.ts     # (extend) +7 methods
│   ├── admin-dashboard.controller.ts  # (extend) +7 routes
│   └── admin.module.ts                # (import ClusterModule)
└── dashboard/
    ├── dashboard.service.ts           # (extend) getStats + getCameraStatusList
    └── dashboard.controller.ts        # (pass-through)
```

### Pattern 1: react-leaflet-cluster integration (D-16)

**What:** Wrap Marker children in a single `<MarkerClusterGroup>` and pass an `iconCreateFunction` that computes the worst child status and returns a styled `L.divIcon`.

**When to use:** Whenever a map renders more than a handful of markers that could visually overlap.

**Key facts (verified):**

- `MarkerClusterGroup` (v4.1.3) types declare `React.ForwardRefExoticComponent<L.MarkerClusterGroupOptions & { children, ...ClusterEvents } & React.RefAttributes<L.MarkerClusterGroup>>` — i.e. **all `L.MarkerClusterGroupOptions` are valid props including `iconCreateFunction`, `maxClusterRadius`, `disableClusteringAtZoom`, `chunkedLoading`.** [VERIFIED: `node_modules/.../react-leaflet-cluster/dist/index.d.ts`]
- `leaflet.markercluster` 1.5.3 exposes `refreshClusters()` and `_refreshClustersIcons()` methods on the group instance. [VERIFIED: grep of dist bundle]
- Next.js App Router requires `'use client'` on any file that imports Leaflet (SSR would break). `camera-map-inner.tsx` already has this; no SSR import of `react-leaflet-cluster` from Server Components.

**Example integration** (adds only the `iconCreateFunction` prop to the existing wrapper in `camera-map-inner.tsx:131`):

```tsx
// Source: Plan 03 Task 2 + react-leaflet-cluster v4.1.3 API
<MarkerClusterGroup
  chunkedLoading
  iconCreateFunction={createClusterIcon}
  ref={markerClusterGroupRef}
>
  {mappableCameras.map((camera) => (
    <CameraMarker key={camera.id} {...camera} {...callbacks} />
  ))}
</MarkerClusterGroup>
```

The `createClusterIcon` function reads child statuses (see Pattern 2).

### Pattern 2: Cluster icon worst-status propagation

**What:** Each `<CameraMarker>` forwards its `status` string into `L.Marker.options.cameraStatus` via a ts-expect-error passthrough prop. The `iconCreateFunction` reads the option from every child to compute the worst case.

**Why a sidecar prop, not a React context:** `iconCreateFunction` is called by Leaflet internals outside React's render tree — React hooks and context are unavailable. The `options` bag is the documented channel for custom per-marker metadata.

**Example:**

```tsx
// In camera-marker.tsx — forward status to L.Marker.options
<Marker
  ref={markerRef}
  position={[latitude, longitude]}
  icon={icon}
  // @ts-expect-error — forwarded to L.Marker options for cluster iconCreateFunction to read
  cameraStatus={status}
  draggable={!!onDragEnd}
  eventHandlers={eventHandlers}
>
  ...
</Marker>

// In camera-map-inner.tsx — compute worst status from children
export function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const children = cluster.getAllChildMarkers();
  const statuses = children.map((m) => (m.options as any).cameraStatus as string);

  let worst: 'online' | 'degraded' | 'offline' = 'online';
  for (const s of statuses) {
    if (s === 'offline') { worst = 'offline'; break; }
    if (s === 'degraded' || s === 'reconnecting') worst = 'degraded';
  }

  const fill =
    worst === 'offline' ? '#ef4444' :
    worst === 'degraded' ? '#f59e0b' :
    '#22c55e';

  const count = cluster.getChildCount();
  return L.divIcon({
    className: 'camera-cluster-icon',
    html: `<div aria-label="${count} cameras in this area, worst status ${worst}" style="
      width:36px;height:36px;border-radius:50%;
      background:${fill}e6;
      border:3px solid rgba(255,255,255,0.7);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:12px;font-weight:600;line-height:1;
    ">${count}</div>`,
    iconSize: [36, 36],
  });
}
```

**Staleness limitation (see §Pitfall 2):** when a child's `cameraStatus` option changes mid-session via Socket.IO, the cluster does **not** auto-repaint. Fix: `markerClusterGroupRef.current?.refreshClusters()` in a `useEffect` watching the derived status map.

### Pattern 3: Teardrop pin SVG as Leaflet divIcon + PreviewVideo preservation

**What:** `L.divIcon` accepts arbitrary HTML as `html`. We inline a 28×36 SVG with a teardrop path + a centered camera icon path + conditional absolutely-positioned badge elements.

**Why a pure helper:** Testing `react-leaflet` markers inside jsdom is painful (requires a real map). Factoring the icon builder into an exported pure function `buildMarkerIcon({ status, isRecording, maintenanceMode, name })` lets vitest assert on `icon.options.html` without rendering a map.

**Anchor math:** `iconSize: [28, 36]` + `iconAnchor: [14, 36]` → the pin *tip* lands on the camera's lat/lng. `popupAnchor: [0, -34]` opens the popup just above the pin.

**Badge overlays:** The recording dot and wrench badge are `<div>` children inside the outer container div (alongside the SVG), positioned `absolute` with top/right/bottom/right insets of `-2px` to sit on the pin edge without clipping.

**PreviewVideo constraint (load-bearing):** The memoized block at `camera-popup.tsx:26-78` must remain byte-identical. Specifically:

1. Declared at **module scope** (not inside the component function) so the `memo` identity is stable across parent renders.
2. Wrapped in `React.memo(...)` with default shallow compare.
3. Props limited to `{ id, status }` — **not** `viewerCount`, not `isRecording`, not any new prop. Otherwise Socket.IO viewer-count broadcasts will trigger remount → new `on_play` → new viewer-count broadcast → runaway loop (Phase 13 bug).
4. Status overlay (REC / Maintenance pills) must be rendered as a **sibling** to `<PreviewVideo />`, never as a child. Absolute positioning on the parent 240×135 container is the right placement.

**Regression test pattern** (flip to `it` in Plan 04):

```tsx
test('REGRESSION GUARD: PreviewVideo does not remount when viewerCount changes', () => {
  const { rerender } = render(
    <CameraPopup id="c1" name="Cam" status="online" viewerCount={1} />
  );
  const videoBefore = document.querySelector('video');
  rerender(<CameraPopup id="c1" name="Cam" status="online" viewerCount={2} />);
  const videoAfter = document.querySelector('video');
  expect(videoAfter).toBe(videoBefore); // DOM node identity preserved → no remount
});
```

### Pattern 4: PreviewVideo memoization preservation (elaborated)

Calling out Pattern 3 separately because it is both a § reference target (plans reference `§Pattern 4`) and a critical do-not-break constraint.

**Exact preserved block** (`apps/web/src/components/map/camera-popup.tsx:26-78`):

```tsx
// Memoized so viewerCount broadcasts do not tear down + re-attach HLS.
const PreviewVideo = memo(function PreviewVideo({ id, status }: { id: string; status: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    if (status !== 'online' || !videoRef.current) return;
    const hlsUrl = `/api/cameras/${id}/preview/playlist.m3u8`;
    if (Hls.isSupported()) { /* attach HLS */ }
    else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) { /* native */ }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [id, status]);

  if (status !== 'online') return <div>...Stream offline...</div>;
  return <video ref={videoRef} muted autoPlay playsInline className="h-full w-full object-cover" />;
});
```

**Do:**
- Wrap PreviewVideo inside a new 240×135 container div with `position: relative`, `overflow: hidden`, `border`, `bg-black`.
- Render status overlay (REC / Maintenance pills) as a separate child of the container, `position: absolute`, `top-2 left-2`.
- Pass only `id` and `status` to `<PreviewVideo />`. The popup component passes the rest to siblings.

**Do NOT:**
- Inline PreviewVideo into the function body.
- Add new props (e.g. `isRecording`, `retention`) to PreviewVideo.
- Wrap PreviewVideo in any HOC that changes identity per render.
- Move the `memo(...)` call inside the CameraPopup function.

### Pattern 5: DataTable migration for Org Health Overview (D-12)

**What:** Phase 14 established a columns-factory + generic `DataTable` wrapper. Migrate `platform-dashboard-page.tsx` Organization Summary `<Table>` to a DataTable with sort/filter/pagination.

**Columns factory signature:**

```ts
// Source: apps/web/src/app/admin/organizations/components/organizations-columns.tsx (Phase 14 exemplar)
export function makeOrgHealthColumns(router: ReturnType<typeof useRouter>): ColumnDef<OrgHealth>[] {
  return [
    { accessorKey: 'orgName', header: 'Organization', cell: ({ row }) => <span className="font-medium">{row.original.orgName}</span> },
    { accessorKey: 'packageName', header: 'Plan', cell: ({ row }) => <Badge variant="outline">{row.original.packageName ?? 'No plan'}</Badge>, filterFn: 'equals' },
    {
      id: 'cameras',
      header: 'Cameras',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span>{row.original.camerasUsed} / {row.original.camerasLimit ?? '∞'}</span>
          <Progress value={row.original.cameraUsagePct} className="h-1 w-12" />
        </div>
      ),
      sortingFn: (a, b) => a.original.cameraUsagePct - b.original.cameraUsagePct,
    },
    // ...storage, bandwidthTodayBytes, issuesCount, actions
  ];
}
```

**Default sort by computed `max(cameraUsagePct, storageUsagePct)`:** TanStack pre-sorts columns via `initialState.sorting`. **Do not pre-sort the data array** — that hides the header sort-arrow and makes the table look broken (Pitfall 6). Instead, either:

- Use a **computed accessor column** (id `overallUsage`, `accessorFn: (row) => Math.max(row.cameraUsagePct, row.storageUsagePct)`) and set `initialState: { sorting: [{ id: 'overallUsage', desc: true }] }`, OR
- Client-sort `data` once before passing to DataTable and accept that overall-usage is an implicit default (pragmatic; matches Plan 06 Task 1 decision).

Plan 06 chose the latter (simpler) path.

**Row click navigation:** `<DataTable onRowClick={(row) => router.push(`/admin/organizations/${row.orgId}`)}>`. Actions dropdown ⋮ delegates View → same route; Manage → `/admin/organizations/{id}/settings`.

### Pattern 6: Storage forecast from RecordingSegment aggregation (D-10)

**What:** Query `RecordingSegment.size` grouped by `DATE(createdAt)` over the last 7 or 30 days. Compute cumulative bytes + linear-regression slope → estimated days until full.

**SQL skeleton (parameterized `Prisma.sql`):**

```ts
// Source: Plan 01 Task 2, AdminDashboardService.getStorageForecast
const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

const rows = await this.rawPrisma.$queryRaw<Array<{ date: Date; bytes: bigint }>>(Prisma.sql`
  SELECT DATE("createdAt") AS date, SUM(size) AS bytes
  FROM "RecordingSegment"
  WHERE "createdAt" >= ${since}
  GROUP BY DATE("createdAt")
  ORDER BY date ASC
`);

// BigInt → string for JSON response (Pitfall 7)
const points = rows.map(r => ({ date: r.date.toISOString().slice(0, 10), bytes: r.bytes.toString() }));
```

**Linear regression (least squares on `(dayIndex, cumulativeBytes)`):**

```
slope = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²)
daysUntilFull = slope > 0 ? (totalQuotaBytes − lastCumulative) / slope : null
```

`totalQuotaBytes = SUM(Package.maxStorageGb × 1 GiB)` across distinct packages in use (or across all orgs' currently-assigned package).

**DoS defense (T-18-DOS-FORECAST):** controller validates `?range=` via `z.enum(['7d', '30d'])` before invoking the service — prevents callers from requesting unbounded windows (OQ-02 resolution confirms this as the only supported ranges this phase).

### Pattern 7: Issues panel composition (D-04, D-24)

**What:** The tenant Issues panel derives entirely on-read from existing data — **no new `Issue` table**. Data source: `useCameraStatusList()` (already polled every 30s via `use-dashboard-stats.ts`). Real-time: `useCameraStatus` Socket.IO subscription fires, updates the underlying camera list, the panel re-derives.

**Severity rank (per OQ-01 resolution — no recording-failed detection this phase):**

```ts
function severityRank(c: DashboardCamera): number {
  if (c.status === 'offline') return 0;
  if (c.status === 'degraded') return 1;
  if (c.status === 'reconnecting') return 2;
  // TODO (OQ-01): recording-failed = 3 once a dedicated signal is added.
  if (c.maintenanceMode) return 4;
  return 99;
}
```

**Empty state is a reward signal** (CONTEXT §specifics): when `issues.length === 0`, render `<CheckCircle2 className="text-primary" />` + "All cameras healthy" + "{N} cameras online, 0 issues." — not a generic placeholder. Dashboard = "good news" UX.

**Polling fallback:** 30s interval via existing `useCameraStatusList` pattern. If Socket.IO disconnects, the 30s tick still refreshes. (D-23 — no new channels.)

## Runtime State Inventory

> This phase is composition only; no rename, no schema migration, no data-level rewrites. Runtime state inventory applies per GSD process:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — this phase reads existing Camera/Organization/RecordingSegment/AuditLog rows and computes aggregations on the fly | No migration |
| Live service config | SRS configuration unchanged; `/api/v1/streams` consumed via existing `SrsApiService`; no new SRS callbacks | No action |
| OS-registered state | None | — |
| Secrets / env vars | No new secrets. Reuses existing `DATABASE_URL`, SRS HTTP endpoint, MinIO endpoint | — |
| Build artifacts / installed packages | Plan 05 installs `shadcn@latest add toggle-group` (new primitive file + possibly `@radix-ui/react-toggle-group` dep) | Run on pnpm workspace; commit generated file |

Everything else: **None — verified by a full read of the 6 PLAN files and canonical_refs.**

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | all | ✓ | workspace `pnpm-workspace.yaml` | — |
| Node 22 LTS | runtime | ✓ | per CLAUDE.md stack | — |
| PostgreSQL 16 | `$queryRaw` storage-forecast, Prisma queries | ✓ | already running (test DB + dev DB) | — |
| Prisma CLI 6 | `prisma generate` in prebuild | ✓ | `apps/api/package.json` | — |
| SRS container | `getActiveStreamsCount`, existing metrics | ✓ | — | try/catch fallback `{ count: 0 }` |
| MinIO | (not strictly needed — forecast reads Postgres `RecordingSegment.size`) | ✓ | — | — |
| Redis | session + Socket.IO adapter | ✓ | — | — |
| shadcn CLI | toggle-group install (Plan 05) | ✓ | `shadcn ^4.2.0` in devDeps | Manual vendor if offline |

No blocking dependencies. No external APIs introduced.

## Common Pitfalls

### Pitfall 1: react-leaflet-cluster SSR break

**What goes wrong:** Importing `react-leaflet-cluster` from a Server Component throws because Leaflet touches `window`.

**Why it happens:** Next.js App Router defaults to RSC; Leaflet is strictly browser-side.

**How to avoid:** Every map file begins with `'use client'`. The existing `camera-map.tsx` uses `next/dynamic` + `{ ssr: false }` to load the inner module. No new dynamic-import boundaries needed — `camera-map-inner.tsx` is already client-scoped and inherits the dynamic import.

**Warning signs:** Build error "window is not defined" or Next dev hot-reload crash on the map route.

### Pitfall 2: MarkerClusterGroup stale icon after status change

**What goes wrong:** Socket.IO camera:status event updates the React state, child `<Marker>` re-renders with a new `cameraStatus` prop, but the cluster **bubble** stays the old color until the user pans or zooms.

**Why it happens:** `iconCreateFunction` is called by Leaflet only when the cluster layer recalculates. React prop changes on children don't trigger that recalculation.

**How to avoid:**
1. Take a ref on `<MarkerClusterGroup>` via `useRef<L.MarkerClusterGroup>(null)`.
2. In a `useEffect` that depends on a derived `statusMap` (e.g. `cameras.map(c => c.status).join('|')`), call `markerClusterGroupRef.current?.refreshClusters()`.
3. If the ref path is unreachable in practice (Plan 03 Task 2 tests this), document as known limitation and accept T-18-CLUSTER-STALE — visual correctness restores on next pan/zoom. The manual-check in VALIDATION.md Manual-Only tracks the cosmetic residual.

**Warning signs:** Camera flips offline; pin itself re-colors; cluster bubble is still green until user scrolls.

### Pitfall 3: divIcon HTML as XSS sink (T-18-XSS-MARKER)

**What goes wrong:** A malicious camera name like `<img src=x onerror=alert(1)>` becomes executable HTML in the cluster tooltip or marker aria-label.

**Why it happens:** `L.divIcon({ html: '...' })` takes raw HTML; React's auto-escape does not apply inside template-literal HTML.

**How to avoid:** `escapeHtml(name)` helper (Plan 03 Task 1) that maps `& < > " '` → `&amp; &lt; &gt; &quot; &#39;`. Apply before any interpolation into `.html`. Add explicit unit test asserting `&lt;script&gt;` appears in the output, **not** `<script>`.

**Warning signs:** Unit test `T-18-XSS-MARKER: escapes HTML in camera name` fails; or manual QA shows script execution when a camera is named with HTML.

### Pitfall 4: PreviewVideo remount = Phase 13 runaway viewer count regression

**What goes wrong:** Any prop change on a non-memoized PreviewVideo tears down HLS, triggers a new `on_play` callback, which Socket.IO broadcasts as a viewer-count bump, which re-renders the popup, which remounts PreviewVideo again → infinite loop + UI flicker.

**Why it happens:** React's shallow memo compare sees a new `viewerCount` prop (or any new prop added to PreviewVideo) and remounts. The original bug was "fix: runaway viewer count in camera popup".

**How to avoid:** (a) Keep `PreviewVideo = memo(function …({ id, status }))` at **module scope**. (b) Render status overlay as a **sibling** to PreviewVideo, not a child. (c) Add the regression-guard test `PreviewVideo does not remount when viewerCount changes on parent` — asserts DOM node identity across rerenders.

**Warning signs:** Viewer count ticks upward indefinitely in popup; visible flicker in preview; network tab shows repeated `GET /api/cameras/:id/preview/playlist.m3u8`.

### Pitfall 5: Schema field naming — `maintenanceEnteredBy/At`, NOT `maintenanceEnabledBy/At`

**What goes wrong:** Tests, DTOs, component props, and fixtures use `maintenanceEnabledBy` / `maintenanceEnabledAt`. The API layer returns `maintenanceEnteredBy` / `maintenanceEnteredAt`. Runtime type mismatch → fields render as `undefined`.

**Why it happens:** CONTEXT.md and several Plan references use "Enabled" spelling. The Prisma schema (Phase 15-01) settled on "Entered".

**Schema truth (verified):**

```prisma
// apps/api/src/prisma/schema.prisma:223-224
model Camera {
  maintenanceEnteredAt  DateTime?
  maintenanceEnteredBy  String?
}
```

**How to avoid:** All Plan 00-06 tests and code use "Entered". Plan 00 Task 1 acceptance criteria includes `grep -c "maintenanceEnabledBy\|maintenanceEnabledAt" === 0`. Enforced in 7 acceptance-criteria blocks across plans.

**Warning signs:** Maintenance badge shows blank "by" field; type error `Property 'maintenanceEnabledBy' does not exist on type ...`.

### Pitfall 6: TanStack pre-sort hides header sort arrow

**What goes wrong:** `data.sort(...)` is passed to DataTable. The table renders pre-sorted, but column headers have no sort indicator because TanStack doesn't know the data is sorted.

**Why it happens:** TanStack manages sorting via its own state; it doesn't inspect incoming data.

**How to avoid:** Prefer `initialState: { sorting: [{ id: 'columnId', desc: true }] }` on the DataTable. For a **computed** default sort (max of two columns), add a hidden accessor column with `accessorFn`. Plan 06 accepts the pragmatic alternative (pre-sort `data` client-side and live without the arrow on the overall-usage implicit default) — document the tradeoff.

**Warning signs:** Default sort works but header arrows never light up; clicking a header resets sort unexpectedly.

### Pitfall 7: BigInt JSON serialization (T-18-BIGINT-JSON)

**What goes wrong:** `res.json({ bytes: BigInt(123) })` throws `TypeError: Do not know how to serialize a BigInt`.

**Why it happens:** Prisma returns `BigInt` for `Int8`/`BigInt` column types (e.g. `RecordingSegment.size`, `ApiKeyUsage.bandwidth`). `JSON.stringify` rejects BigInt by default.

**How to avoid:** Convert to string at the service boundary — `bytes: row.bytes.toString()`. Downstream frontend parses via `Number(BigInt(str) / BigInt(1024*1024*1024))` when a GB value is needed for chart axes.

**Warning signs:** 500 error on `/api/admin/dashboard/storage-forecast` with stack trace mentioning `BigInt`.

### Pitfall 8: CONTEXT.md vs schema field-name drift

**What goes wrong:** CONTEXT.md §canonical_refs line 128 names `maintenanceEnabledBy, maintenanceEnabledAt`; UI-SPEC inherits the phrasing; planners may propagate the error into component props.

**Why it happens:** Pre-Phase 15-01 design doc drift — schema was renamed during Phase 15 implementation.

**How to avoid:** Plan 00 Task 1 authoritatively spells fixtures as **Entered**. Plan 03 and Plan 04 grep acceptance criteria block the wrong spelling. Plan 01 Task 1 uses schema column names directly (`isRecording: true, maintenanceEnteredBy: true, maintenanceEnteredAt: true, retentionDays: true`) — no alias.

**Warning signs:** Any `it.todo` stub or component prop using "Enabled"; any `grep -c maintenanceEnabled` returning > 0 in acceptance criteria checks.

## Code Examples

Verified patterns from official sources + in-repo precedent.

### Example 1: `escapeHtml` helper + teardrop divIcon + cluster iconCreateFunction

```ts
// apps/web/src/lib/escape-html.ts — NEW
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function escapeHtml(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
```

```ts
// apps/web/src/components/map/camera-marker.tsx — refactored buildMarkerIcon (pure, testable)
import L from 'leaflet';
import { escapeHtml } from '@/lib/escape-html';

const STATUS_COLORS: Record<string, string> = {
  online: '#22c55e', offline: '#ef4444',
  degraded: '#f59e0b', connecting: '#3b82f6', reconnecting: '#f59e0b',
};

export function buildMarkerIcon(args: {
  status: string;
  isRecording: boolean;
  maintenanceMode: boolean;
  name: string;
}): L.DivIcon {
  const { status, isRecording, maintenanceMode, name } = args;
  const color = STATUS_COLORS[status] || STATUS_COLORS.offline;
  const safeName = escapeHtml(name);
  const isAmber = status === 'degraded' || status === 'reconnecting';
  const iconOutline = isAmber ? 'stroke="rgba(0,0,0,0.4)" stroke-width="1"' : '';

  const recDot = isRecording ? `
    <div aria-hidden="true" class="camera-pin__rec-dot motion-safe:animate-pulse"
      style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:#ef4444;"></div>
  ` : '';

  const maintBadge = maintenanceMode ? `
    <div aria-hidden="true" class="camera-pin__maint"
      style="position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:#6b7280;display:flex;align-items:center;justify-content:center;">
      <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    </div>
  ` : '';

  const pulseClass = status === 'reconnecting' ? 'camera-marker-icon--reconnecting' : '';

  return L.divIcon({
    className: `camera-marker-icon ${pulseClass}`,
    html: `
      <div style="position:relative;width:28px;height:36px">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"
             role="img" aria-label="Camera ${safeName} — status ${status}">
          <path d="M14 0 C6.3 0 0 6.3 0 14 c0 8.4 14 22 14 22 s14-13.6 14-22 C28 6.3 21.7 0 14 0 Z"
                fill="${color}" stroke="#fff" stroke-width="2"/>
          <g transform="translate(7 7) scale(0.583)" stroke="#ffffff" stroke-width="2"
             fill="none" ${iconOutline}>
            <!-- Lucide Camera icon path (inlined) -->
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </g>
        </svg>
        ${recDot}
        ${maintBadge}
      </div>
    `,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -34],
  });
}
```

```ts
// apps/web/src/components/map/camera-map-inner.tsx — createClusterIcon
export function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const children = cluster.getAllChildMarkers();

  let worst: 'online' | 'degraded' | 'offline' = 'online';
  for (const m of children) {
    const s = (m.options as any).cameraStatus as string | undefined;
    if (s === 'offline') { worst = 'offline'; break; }
    if (s === 'degraded' || s === 'reconnecting') worst = 'degraded';
  }

  const fill =
    worst === 'offline' ? '#ef4444' :
    worst === 'degraded' ? '#f59e0b' :
    '#22c55e';

  const count = cluster.getChildCount();

  return L.divIcon({
    className: 'camera-cluster-icon',
    html: `<div style="
      width:36px;height:36px;border-radius:50%;
      background:${fill}e6;
      border:3px solid rgba(255,255,255,0.7);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:12px;font-weight:600;line-height:1;
    " aria-label="${count} cameras, worst status ${worst}">${count}</div>`,
    iconSize: [36, 36],
  });
}
```

### Example 2: `Prisma.sql` parameterized storage-forecast query (T-18-SQLI-FORECAST)

```ts
// apps/api/src/admin/admin-dashboard.service.ts
import { Prisma } from '@prisma/client';

async getStorageForecast(range: '7d' | '30d') {
  const daysBack = range === '7d' ? 7 : 30;
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const rows = await this.rawPrisma.$queryRaw<Array<{ date: Date; bytes: bigint }>>(Prisma.sql`
    SELECT DATE("createdAt") AS date, SUM(size) AS bytes
    FROM "RecordingSegment"
    WHERE "createdAt" >= ${since}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `);

  const points = rows.map(r => ({
    date: r.date.toISOString().slice(0, 10),
    bytes: r.bytes.toString(),  // BigInt → string (Pitfall 7)
  }));

  // Linear regression on cumulative bytes
  let cumulative = BigInt(0);
  const series = points.map((p, i) => {
    cumulative += BigInt(p.bytes);
    return { x: i, y: Number(cumulative) };
  });

  const n = series.length;
  if (n < 2) return { points, estimatedDaysUntilFull: null };

  const sumX = series.reduce((s, p) => s + p.x, 0);
  const sumY = series.reduce((s, p) => s + p.y, 0);
  const sumXY = series.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = series.reduce((s, p) => s + p.x * p.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  if (slope <= 0) return { points, estimatedDaysUntilFull: null };

  const lastCumulative = series[n - 1].y;
  const totalQuota = await this.computeTotalQuotaBytes();
  const daysUntilFull = Math.max(0, Math.floor((totalQuota - lastCumulative) / slope));

  return { points, estimatedDaysUntilFull: daysUntilFull };
}
```

### Example 3: Controller zod validation (T-18-DOS-FORECAST + T-18-DOS-AUDIT)

```ts
// apps/api/src/admin/admin-dashboard.controller.ts
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

@Get('storage-forecast')
getStorageForecast(@Query('range') rangeRaw: string) {
  const parsed = z.enum(['7d', '30d']).safeParse(rangeRaw);
  if (!parsed.success) throw new BadRequestException('range must be 7d or 30d');
  return this.adminDashboardService.getStorageForecast(parsed.data);
}

@Get('recent-audit')
getRecentAudit(@Query('limit') limitRaw: string | undefined) {
  const parsed = z.coerce.number().int().min(1).max(10).default(7).safeParse(limitRaw);
  if (!parsed.success) throw new BadRequestException('limit must be 1-10');
  return this.adminDashboardService.getRecentAuditHighlights(parsed.data);
}
```

### Example 4: `useDashboardIssues` severity composition

```ts
// apps/web/src/hooks/use-dashboard-issues.ts — NEW
import { useCameraStatusList } from './use-dashboard-stats';

function severityRank(c: DashboardCamera): number {
  if (c.status === 'offline') return 0;
  if (c.status === 'degraded') return 1;
  if (c.status === 'reconnecting') return 2;
  // TODO (OQ-01): recording-failed = 3 once backend exposes a dedicated signal.
  if (c.maintenanceMode) return 4;
  return 99;
}

export function useDashboardIssues() {
  const { cameras, loading, error } = useCameraStatusList();

  const issues = cameras
    .filter(c =>
      c.status === 'offline' ||
      c.status === 'degraded' ||
      c.status === 'reconnecting' ||
      c.maintenanceMode === true
    )
    .sort((a, b) => {
      const r = severityRank(a) - severityRank(b);
      if (r !== 0) return r;
      // tiebreak: oldest lastOnlineAt first
      const at = a.lastOnlineAt ? new Date(a.lastOnlineAt).getTime() : Infinity;
      const bt = b.lastOnlineAt ? new Date(b.lastOnlineAt).getTime() : Infinity;
      return at - bt;
    });

  const onlineCount = cameras.filter(c => c.status === 'online' && !c.maintenanceMode).length;

  return { issues, loading, error, onlineCount };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `<Table>` for Org Summary | TanStack DataTable (Phase 14) | v1.1 | Sort + filter + pagination available platform-wide |
| Single stat card row | Responsive grid `lg:grid-cols-3 xl:grid-cols-6` | this phase | More information density without crowding |
| Circle div marker | SVG teardrop + lucide Camera + conditional badges | this phase | Google Maps familiarity + recording/maintenance visibility |
| Popup `maxWidth=240` | `maxWidth=320 minWidth=280` | this phase | Fits 240-wide 16:9 preview + action row |
| Polling every metric | Socket.IO for per-camera events + 30s polling for aggregate | carried over | No new channels this phase (D-23) |

**Deprecated / outdated:**
- The `<CameraStatusTable />` on tenant dashboard is replaced, not migrated — the component file may linger in the repo but is no longer imported.
- `isSuperAdmin` role gating inside `tenant-dashboard-page.tsx` is removed wholesale (D-01).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Prisma schema line 223-224 `maintenanceEnteredAt` / `maintenanceEnteredBy` (schema "Entered" spelling) is canonical; CONTEXT §canonical_refs typo "Enabled" is wrong. | §Pitfall 5, §Pitfall 8 | If schema actually uses "Enabled", every fixture + test + component prop is broken. **Mitigated by direct schema grep (verified line 223-224).** |
| A2 | `react-leaflet-cluster` v4.1.3 forwards all `L.MarkerClusterGroupOptions` to the underlying layer including `iconCreateFunction`. | §Pattern 1 | If `iconCreateFunction` is swallowed, worst-status color never paints. **Mitigated by inspecting `node_modules/.../index.d.ts` type signature — confirms forward.** |
| A3 | `leaflet.markercluster` 1.5.3 exposes `refreshClusters()` as a public method on the layer group instance. | §Pattern 2, §Pitfall 2 | If only `_refreshClustersIcons` exists, we need to call the private method (brittle). **Mitigated by grep of bundle — `refreshClusters:` key present.** |
| A4 | Memoized `PreviewVideo` props are strictly `{ id, status }` — and hls.js instances are torn down in the useEffect cleanup. | §Pattern 3, §Pattern 4, §Pitfall 4 | If memoization is silently broken during refactor, Phase 13 runaway viewer count returns. **Mitigated by regression-guard test asserting DOM node identity across rerenders.** |
| A5 | `/api/cameras` (tenant) already exposes `isRecording`, `maintenanceMode`, `maintenanceEnteredBy`, `maintenanceEnteredAt`, `lastOnlineAt`, `retentionDays` without restriction (Phase 15 added these). | §integration points, Plan 03 Task 2 | If the DTO restricts fields, MapCamera is partially populated and badges render blank. **Mitigated by confirming existing `cameras.service.ts:154` returns full Camera rows without `select` narrowing.** |
| A6 | SRS `/api/v1/streams` response includes `publish.active` per stream, matching existing `SrsApiService.getStreams()` parsing. | Plan 01 Task 2 §getActiveStreamsCount | If field shape drifted, count is 0 always. **Mitigated by existing bandwidth code already parsing `stream.kbps?.send_30s` + `stream.clients` — the same endpoint.** |
| A7 | `ApiKeyUsage.bandwidth` (BigInt) or equivalent stores per-org egress for today; `DashboardService.getStats` already aggregates it via `_sum` pattern. | OQ-02/05 resolution, Plan 01 §Org Health bandwidth | If no per-org today-bandwidth source exists, Org Health "Bandwidth (today)" column shows —. **Mitigated by grep of existing service confirming the aggregation already runs.** |
| A8 | `ClusterService` from Phase 6 exports `findAll()` returning `SrsNode[]` (and is exportable from `ClusterModule`). | Plan 01 Task 2 §getClusterNodes | If not exportable, admin module import fails at DI resolution. **Fallback:** query `SrsNode` directly via `rawPrisma.srsNode.findMany()` (same shape). |
| A9 | Skipping `ffmpeg-saturated` platform issue in the first pass is acceptable — the BullMQ queue saturation check may be behind a module boundary not easily accessible from `AdminDashboardService`. | Plan 01 Task 2 §getPlatformIssues | If user demands it now, backend scope expands. **Mitigated:** CONTEXT §D-09 lists it as one of several; empty state still works without it. Documented as deferred in Plan 01 comment. |
| A10 | `shadcn@latest add toggle-group` is non-destructive and does not overwrite other primitives. | Plan 05 Task 1 | If CLI rewrites `components.json` or re-runs `init`, other primitives could regress. **Mitigated:** shadcn add is scoped per-component; widely used pattern; Plan 05 Task 1 gates with `ls toggle-group.tsx || npx shadcn add toggle-group`. |

All 10 claims are tagged with verification evidence above. Items A1, A2, A3, A5, A7 are **VERIFIED** (direct grep or file inspection). A4 is VERIFIED by reading `camera-popup.tsx:26-78` directly. A6, A8, A9 are [ASSUMED] based on Phase 6 / Phase 15 precedent — flagged for discuss-phase confirmation only if real failure appears during execution.

## Open Questions (RESOLVED)

All five open questions from the prior research pass have been answered and incorporated into the plan text. Do **not** re-open these.

**OQ-01 RESOLVED:** Phase 15 does NOT expose a dedicated "recording-failed" state. The current Phase 15 schema fields (`isRecording`, `recordingStartedAt`) cannot distinguish "recording stopped intentionally" from "recording failed". **Decision: defer recording-failed detection to a future phase.** Plan 02 severity sort uses 4 states: offline → degraded → reconnecting → maintenance.

**OQ-02 RESOLVED:** Per-org "Bandwidth (today)" = cumulative SRS egress bytes for the org's streams since midnight UTC. Source: SRS Prometheus `srs_send_bytes_total` delta OR existing `BandwidthSample`/`ApiKeyUsage.bandwidth` column aggregation (whichever exists in current backend — Plan 01 Task 2 greps for existing bandwidth source). Fallback: show "—" if unavailable.

**OQ-03 RESOLVED:** `react-leaflet-cluster` v4.1.3 does NOT auto-refresh bubble color when child `divIcon` HTML changes. Plan 03 Task 2 must add explicit `useEffect` that calls `markerClusterGroupRef.current?.refreshClusters()` when any camera status changes. Fallback if ref access fails: document as known limitation "cluster color refreshes on next pan/zoom".

**OQ-04 RESOLVED:** shadcn toggle-group install resolved by Plan 05 Task 1 conditional `ls apps/web/src/components/ui/toggle-group.tsx || npx shadcn@latest add toggle-group`.

**OQ-05 RESOLVED:** Same as OQ-02 — unified as "cumulative SRS egress since midnight UTC, fallback to BandwidthSample/ApiKeyUsage aggregation, else show —".

## Validation Architecture

Per `.planning/config.json` workflow.nyquist_validation (treat absent as enabled).

### Test Framework

| Property | Value |
|----------|-------|
| Framework (web) | Vitest 3 + Testing Library (react 16, user-event 14, jest-dom 6), jsdom 25 |
| Framework (api) | Vitest 2 + global-setup (sms_platform_test DB), 30s timeout |
| Config file (web) | `apps/web/vitest.config.ts` |
| Config file (api) | `apps/api/vitest.config.ts` |
| Quick run (web) | `cd apps/web && pnpm test -- --run <file>` |
| Quick run (api) | `cd apps/api && pnpm test -- --run <file>` |
| Full suite | `pnpm test` at workspace root |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-05 | Tenant dashboard removes SystemMetrics (D-01) | unit (web) | `pnpm test -- --run src/__tests__/tenant-dashboard-page.test.tsx` | ❌ Wave 0 |
| UI-05 | Tenant dashboard renders 6 stat cards in correct grid (D-02) | unit (web) | same | ❌ Wave 0 |
| UI-05 | Issues panel empty state + severity sort (D-04) | unit (web) | `pnpm test -- --run src/components/dashboard/issues-panel.test.tsx` | ❌ Wave 0 |
| UI-05 | DashboardService enriched with Phase 15 fields + org-scoped (T-18-TENANCY-ISSUES) | integration (api) | `cd apps/api && pnpm test -- --run tests/dashboard/dashboard.test.ts` | ✅ exists — add new describe block |
| UI-05 | 7 new admin endpoints guarded by SuperAdminGuard (T-18-AUTHZ-ADMIN) | integration (api) | `cd apps/api && pnpm test -- --run tests/admin/admin-dashboard.test.ts` | ❌ Wave 0 |
| UI-05 | Storage forecast range zod-validated + BigInt→string + Prisma.sql (T-18-SQLI-FORECAST, T-18-DOS-FORECAST, T-18-BIGINT-JSON) | integration (api) | same | ❌ Wave 0 |
| UI-05 | PlatformIssuesPanel empty + 5 row types | unit (web) | `pnpm test -- --run src/components/dashboard/platform-issues-panel.test.tsx` | ❌ Wave 0 |
| UI-05 | ClusterNodesPanel renders 5 columns | unit (web) | `pnpm test -- --run src/components/dashboard/cluster-nodes-panel.test.tsx` | ❌ Wave 0 |
| UI-05 | StorageForecastCard toggle + caption + warning styling | unit (web) | `pnpm test -- --run src/components/dashboard/storage-forecast-card.test.tsx` | ❌ Wave 0 |
| UI-05 | RecentAuditHighlights 7 entries + footer link | unit (web) | `pnpm test -- --run src/components/dashboard/recent-audit-highlights.test.tsx` | ❌ Wave 0 |
| UI-05 | OrgHealthDataTable default sort + row click + actions (D-12) | unit (web) | `pnpm test -- --run src/app/admin/dashboard/components/org-health-data-table.test.tsx` | ❌ Wave 0 |
| UI-05 | Super admin page: 7 stat cards + vertical stack + DataTable replaces Table | unit (web) | `pnpm test -- --run src/__tests__/platform-dashboard-page.test.tsx` | ❌ Wave 0 |
| UI-06 | Marker: teardrop SVG 28×36 + badges + escapeHtml (T-18-XSS-MARKER) | unit (web) | `pnpm test -- --run src/components/map/camera-marker.test.tsx` | ❌ Wave 0 |
| UI-06 | Cluster iconCreateFunction worst-status rule | unit (web) | `pnpm test -- --run src/components/map/camera-map-inner.test.tsx` | ❌ Wave 0 |
| UI-06 | Popup 240×135 + overlay + badges + dropdown + **PreviewVideo memo regression guard** (T-18-MEMO-REGRESSION) | unit (web) | `pnpm test -- --run src/components/map/camera-popup.test.tsx` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** targeted quick run for the modified test file (5-30s)
- **Per wave merge:** full workspace suite for the affected side (`pnpm test` in `apps/web` or `apps/api`)
- **Phase gate:** Both workspaces green before `/gsd-verify-work` (~60-120s total)

### Wave 0 Gaps (covered by Plan 00)

**Frontend (12 files + 1 fixtures):**
- [ ] `apps/web/src/test-utils/camera-fixtures.ts` — 6 named fixtures + 2 factories with Phase 15 schema spelling
- [ ] `apps/web/src/__tests__/tenant-dashboard-page.test.tsx` — 6 `it.todo` (D-01..D-04)
- [ ] `apps/web/src/__tests__/platform-dashboard-page.test.tsx` — 5 `it.todo` (D-05..D-12)
- [ ] `apps/web/src/components/dashboard/issues-panel.test.tsx` — 5 `it.todo`
- [ ] `apps/web/src/components/dashboard/platform-issues-panel.test.tsx` — 3 `it.todo`
- [ ] `apps/web/src/components/dashboard/cluster-nodes-panel.test.tsx` — 3 `it.todo`
- [ ] `apps/web/src/components/dashboard/storage-forecast-card.test.tsx` — 3 `it.todo`
- [ ] `apps/web/src/components/dashboard/recent-audit-highlights.test.tsx` — 4 `it.todo`
- [ ] `apps/web/src/app/admin/dashboard/components/org-health-data-table.test.tsx` — 5 `it.todo`
- [ ] `apps/web/src/components/map/camera-marker.test.tsx` — 8 `it.todo` incl. T-18-XSS-MARKER
- [ ] `apps/web/src/components/map/camera-map-inner.test.tsx` — 4 `it.todo`
- [ ] `apps/web/src/components/map/camera-popup.test.tsx` — 13 `it.todo` incl. PreviewVideo regression guard

**Backend (2 files):**
- [ ] `apps/api/tests/admin/admin-dashboard.test.ts` — 17 `it.todo` (7 new methods × 2 assertions + SuperAdminGuard check)
- [ ] `apps/api/tests/dashboard/dashboard.test.ts` — append 3 `it.todo` for Phase 18 enrichments

**Total:** 14 test files + 1 fixtures file = **79 `it.todo` stubs** to flip to `it` across Plans 01-06.

## Security Domain (STRIDE)

`security_enforcement` is enabled (absent from config = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | better-auth session cookie (existing) |
| V3 Session Management | yes | better-auth session store (existing) |
| V4 Access Control | yes | SuperAdminGuard on `/api/admin/*`; TENANCY_CLIENT for `/api/dashboard/*` RLS |
| V5 Input Validation | yes | zod on new query params (`range`, `limit`) |
| V6 Cryptography | no | no new crypto surface |
| V14 Data Protection | yes | BigInt serialization guard prevents data exfil via 500 trace |

### Known Threat Patterns

All T-18-XX threats from prior research pass, consolidated here:

| Threat ID | STRIDE | Component | Disposition | Mitigation |
|-----------|--------|-----------|-------------|------------|
| T-18-XSS-MARKER | Tampering | `L.divIcon.html` with interpolated camera name | mitigate | `escapeHtml(name)` from `@/lib/escape-html` before every HTML interpolation. Unit test asserts `<script>` → `&lt;script&gt;`. Plan 03 acceptance criterion grep. |
| T-18-XSS-POPUP | Tampering | Popup renders camera name, `maintenanceEnteredBy` as React text | mitigate | React auto-escape. Acceptance grep `dangerouslySetInnerHTML == 0` on camera-popup.tsx. |
| T-18-AUTHZ-ADMIN | Elevation of Privilege | 7 new `/api/admin/dashboard/*` routes | mitigate | Class-level `@UseGuards(SuperAdminGuard)` on controller (line 9 — existing). New routes inherit. Acceptance grep verifies inheritance unbroken. |
| T-18-TENANCY-ISSUES | Information Disclosure | DashboardService.getCameraStatusList enrichment | mitigate | `@Inject(TENANCY_CLIENT)` preserves RLS. Integration test seeds 2 orgs, asserts only current-org rows. |
| T-18-INFO-LEAK-STORAGE | Information Disclosure | Storage forecast aggregates cross-tenant bytes | accept | Super-admin-only by SuperAdminGuard. Tenant portal has no link to this endpoint. Aggregate is platform-wide by design (D-10). |
| T-18-MEMO-REGRESSION | Availability | PreviewVideo remount loop (Phase 13 runaway viewer count) | mitigate | PreviewVideo block preserved verbatim. Regression-guard test asserts DOM node identity across rerenders. Status overlay is sibling, never child. Only `{id, status}` passed. |
| T-18-SQLI-FORECAST | Tampering | `$queryRaw` for DATE(createdAt) groupBy | mitigate | Use `Prisma.sql` tagged template with `${since}` binding. Never concat strings. Acceptance grep `Prisma.sql` present. |
| T-18-DOS-FORECAST | Denial of Service | Unbounded date range on forecast | mitigate | `z.enum(['7d','30d'])` validates range. 400 on invalid. |
| T-18-DOS-AUDIT | Denial of Service | Unbounded limit on recent-audit | mitigate | `z.coerce.number().int().min(1).max(10).default(7)` on `?limit=`. |
| T-18-BIGINT-JSON | Availability | BigInt (bandwidth, size) column crashes JSON.stringify | mitigate | Convert BigInt → string at service layer before return. Acceptance grep verifies `.toString()` presence. |
| T-18-ERR-LEAK | Information Disclosure | SRS / MinIO errors bubbling to 500 with stack | mitigate | try/catch around external calls. `this.logger.warn(err.message)`. Return sentinel (`{ count: 0 }` or empty array), never throw. |
| T-18-AUDIT-PII | Information Disclosure | Recent audit surfaces actor emails / IPs | accept | Super-admin only. Same data already exposed in `/admin/audit`. No new PII surface. |
| T-18-MAINT-CONFIRMATION | Tampering | Destructive Toggle Maintenance action | mitigate | AlertDialog confirmation gate (Thai + English copy, Phase 15-04 pattern) before call. Parent performs authenticated API call via `apiFetch`. |
| T-18-XSS-AUDIT | Tampering | Audit entry text interpolates `actorName` + `orgName` | mitigate | React auto-escape. `dangerouslySetInnerHTML` grep == 0 on recent-audit-highlights.tsx. |
| T-18-XSS-ORG-NAME | Tampering | Org name rendered in DataTable cells | mitigate | React auto-escape. `dangerouslySetInnerHTML` grep == 0 on org-health-columns.tsx. |
| T-18-XSS-DASH-NAME | Tampering | Camera name + `maintenanceEnteredBy` rendered in IssuesPanel rows | mitigate | React auto-escape. Same grep guard. |
| T-18-CLUSTER-STATUS-LEAK | Information Disclosure | `cameraStatus` sidecar on L.Marker options | accept | Client-side only. Status already visible on map pin color — no new disclosure. |
| T-18-CLUSTER-STALE | Availability | Cluster bubble color stale after status change | accept | `refreshClusters()` best-effort fix (Pitfall 2). If ref unreachable, visual correctness restores on next pan/zoom. Not blocking. |
| T-18-SORT-OVERFLOW | Availability | Client-side sort on hundreds of orgs | accept | Current scale tens of orgs. Revisit with server-side pagination if > 1000 orgs. |
| T-18-MAINT-CSRF | Tampering | Toggle Maintenance POST/DELETE | mitigate | `apiFetch` includes session cookie. Backend Phase 15-03 endpoint requires auth + enforces org scope via TENANCY_CLIENT. |
| T-18-DROPDOWN-A11Y | Availability | ⋮ dropdown keyboard nav | accept | Inherits shadcn DropdownMenu primitive keyboard semantics. |
| T-18-DOS-DASH | Denial of Service | Multiple polling hooks at 30s concurrently | accept | 30s baseline unchanged. ~7 parallel requests trivial. |

## Sources

### Primary (HIGH confidence)

- `apps/web/package.json` — verified version pinning for every web dependency
- `apps/api/package.json` — verified version pinning for every api dependency
- `apps/api/src/prisma/schema.prisma` lines 199-234 — Camera model with Phase 15 fields; confirms `maintenanceEntered*` spelling
- `apps/web/src/components/map/camera-popup.tsx` lines 26-78 — verbatim memoized PreviewVideo source
- `apps/web/src/components/map/camera-marker.tsx` — current div-circle marker being replaced
- `apps/web/src/components/map/camera-map-inner.tsx` — existing MarkerClusterGroup wrapping at line 131
- `apps/api/src/dashboard/dashboard.service.ts` — existing bandwidth aggregation via `ApiKeyUsage._sum` (OQ-02 source)
- `node_modules/.../react-leaflet-cluster/dist/index.d.ts` — MarkerClusterGroup type signature confirming `L.MarkerClusterGroupOptions` forward
- `node_modules/.../leaflet.markercluster/dist/leaflet.markercluster.js` — `refreshClusters:` public method confirmed in bundle
- npm registry: `npm view <pkg> version` for react-leaflet-cluster 4.1.3, react-leaflet 5.0.0, recharts 3.8.1, hls.js 1.6.16, @tanstack/react-table 8.21.3, date-fns 4.1.0, leaflet.markercluster 1.5.3 (all checked 2026-04-21)
- `.planning/phases/18-dashboard-map-polish/18-CONTEXT.md` — 24 locked decisions D-01..D-24
- `.planning/phases/18-dashboard-map-polish/18-UI-SPEC.md` — UI design contract
- `.planning/REQUIREMENTS.md` §UI-05, §UI-06

### Secondary (MEDIUM confidence)

- shadcn/ui documentation — `toggle-group` primitive (https://ui.shadcn.com/docs/components/toggle-group) — canonical radix-based template
- Phase 14 DataTable pattern from `.planning/phases/14-bug-fixes-datatable-migrations/14-CONTEXT.md` — columns factory + DataTable wrapper
- Phase 15-04 composite status icon pattern from `.planning/phases/15-ffmpeg-resilience-camera-maintenance/15-04-PLAN.md` — maintenance confirmation dialog reuse
- Phase 16 D-02 portal separation from `.planning/phases/16-user-self-service/16-CONTEXT.md` — rationale for removing SystemMetrics from tenant
- `leaflet.markercluster` README (GitHub `Leaflet/Leaflet.markercluster`) — `iconCreateFunction` and `refreshClusters` public API

### Tertiary (LOW confidence / unverified)

- TanStack Table v8 sorting mechanics for computed default — behavior described from memory; Plan 06 pragmatic workaround (pre-sort data) sidesteps the risk

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — every version verified against live package.json + npm registry on 2026-04-21
- Architecture patterns: **HIGH** — directly grounded in existing code (camera-marker.tsx, camera-popup.tsx, camera-map-inner.tsx) + verified library types/bundle
- Pitfalls: **HIGH** — all 8 pitfalls trace to concrete file lines or real prior bugs (Phase 13 runaway viewer count is in Git history)
- Security domain: **HIGH** — ASVS/STRIDE mapping consistent with existing Phase 15/16 patterns; no novel threat surface
- Examples: **HIGH** — all code examples are either verbatim existing code or derived from verified library APIs
- Assumptions: A1-A5, A7 are **VERIFIED**; A6, A8, A9, A10 are flagged **[ASSUMED]** with concrete mitigation paths

**Research date:** 2026-04-21
**Valid until:** ~2026-05-20 (stable stack; re-verify if any npm package ≥ minor bump lands before execution)

---

## RESEARCH COMPLETE

Phase 18 is a composition-only UI polish with zero schema changes; stack pinned at verified latest versions, critical PreviewVideo memoization and XSS/tenancy controls documented, and all five OQs pre-resolved inside the plans.
