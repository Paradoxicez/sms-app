# Phase 18: Dashboard & Map Polish - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

ปรับ dashboard ทั้งสอง portal (`/app/dashboard` tenant + `/admin/dashboard` super admin) ให้ข้อมูลเหมาะกับ role และปรับ map marker/popup ให้สวยพร้อมสะท้อนสถานะใหม่ (recording + maintenance) จาก Phase 15. ครอบคลุม UI-05 (dashboard polish) + UI-06 (map polish). **ไม่ได้** เพิ่ม feature ใหม่ เช่น AI analytics, custom dashboards, ผู้ใช้ปรับ widget เอง — เป็น polish ของ surface ที่มีอยู่.

</domain>

<decisions>
## Implementation Decisions

### Tenant Dashboard (`/app/dashboard`)
- **D-01:** **ลบ `<SystemMetrics />`** (CPU/Mem/Load/SRS Uptime) ออกจาก `tenant-dashboard-page.tsx:123` ทั้งหมด — ไม่ใช่แค่ลบ guard `isSuperAdmin`. ขัด D-02 ของ Phase 16 (super admin ดู system metric ใน `/admin/dashboard` แทน)
- **D-02:** **Stat cards 6 ใบ** (เดิม 4 ใบ): Cameras Online, Cameras Offline, Cameras Recording (ใหม่), In Maintenance (ใหม่), Total Viewers, Stream Bandwidth. Layout grid `lg:grid-cols-3` (2 แถว) หรือ `lg:grid-cols-6` (1 แถว) — Claude เลือก
- **D-03:** **เก็บ BandwidthChart + ApiUsageChart** ทั้งคู่ — dashboard = real-time operations trend, ต่างกับ `/account` Plan & Usage ที่เป็น quota view
- **D-04:** **ลบ `<CameraStatusTable />` ออก** แทนด้วย **Issues panel** ใหม่:
  - แสดงเฉพาะกล้องผิดปกติ: status `offline` / `degraded` / `reconnecting` / `maintenance` mode / recording stopped (failed)
  - แต่ละแถวมี action button — Investigate (ไป camera detail), View, Restart (สำหรับ recording failed)
  - Empty state: "✅ All cameras healthy — N cameras online, 0 issues" — dashboard เป็น reward signal
  - Sort: severity desc (offline ก่อน, recording failed ถัดมา, maintenance สุดท้าย)
  - Real-time update ผ่าน Socket.IO `useCameraStatus` (มีอยู่แล้ว) + polling fallback (Claude discretion สำหรับ interval)

### Super Admin Dashboard (`/admin/dashboard`)
- **D-05:** **Stat cards 7 ใบ** (เดิม 5 ใบ): Organizations, Total Cameras, Cameras Online, Cameras Offline, Stream Bandwidth, Active Streams (ใหม่ — count จาก SRS `/api/v1/streams`), Recordings Active (ใหม่ — count cameras ที่ `isRecording=true` ทุก org)
- **D-06:** **เก็บ System Metrics 4 ใบเดิม** (CPU/Mem/Load/SRS Uptime) — เป็น core ของ super admin
- **D-07:** **Layout = vertical stack เรียงตาม priority**:
  1. Stat cards (7)
  2. System Metrics (4)
  3. Platform-wide Issues panel (attention)
  4. Cluster/Edge Nodes status
  5. Storage forecast chart
  6. Org Health Overview table (DataTable)
  7. Recent platform audit highlights
- **D-08:** **Cluster/Edge Nodes status panel** (ใหม่) — แสดง SRS cluster nodes จาก Phase 6: node name, role (origin/edge), status (online/down/syncing), uptime, connection count. Attention trigger ถ้า node down. Data จาก existing cluster service.
- **D-09:** **Platform-wide Issues panel** (ใหม่) — cross-org attention items: SRS down, edge node disconnected, MinIO unreachable, FFmpeg pool saturated, org with > 50% offline cameras, failed recording streams. Empty state: "✅ Platform healthy"
- **D-10:** **Storage forecast** (ใหม่) — line chart ของ MinIO storage trend (7d/30d toggle) + estimated days until full. Data จาก MinIO bucket stats (recordings + avatars buckets)
- **D-11:** **Recent platform audit highlights** (ใหม่) — 5-10 latest entries จาก audit log: org สร้างใหม่, package เปลี่ยน, user suspended, cluster node added/removed. Click → `/admin/audit` full log
- **D-12:** **Org Health Overview** (เดิม Org Summary table):
  - Migrate เป็น **DataTable เต็ม** (sort/filter/pagination — Phase 14 pattern)
  - Columns: Org name | Plan | Cameras (used/limit) | Storage (used/limit) | Bandwidth (today) | Status (issues count) | Actions (View, Manage)
  - Sort default: % usage desc (org ใกล้เต็ม plan ขึ้นก่อน)
  - Actions: View → `/admin/organizations/{id}`, Manage → `/admin/organizations/{id}/settings`

### Map Marker (`/app/map`, `/admin/map`)
- **D-13:** **Pin shape = Teardrop pin 28×36px** มี **camera icon (lucide `Camera`) สีขาวอยู่ตรงกลาง** + background = connection status color (green/red/amber/blue). Anchor ที่ปลายล่าง. มาตรฐาน Google Maps style; readability สูงเพราะ icon บอก "เป็นกล้อง" ชัดเจน
- **D-14:** **Multi-status badges บน marker** — secondary state แสดงเป็น badge มุม:
  - **Recording active** = red dot (ø8px) มุมขวาบน, กระพริบเบา ๆ ตอนกำลัง record
  - **Maintenance mode** = wrench icon (ø10px พื้นหลังเทา) มุมขวาล่าง
  - Connection status = สี pin หลัก (ไม่ override)
- **D-15:** **Reconnecting state** = pulse animation (เหมือนเดิม) บนสี amber
- **D-16:** **Marker clustering** — เปิดใช้ `react-leaflet-cluster`:
  - Cluster bubble แสดง count + สี = worst status ของ children (ถ้ามี offline แม้ 1 ตัว → cluster เป็นสีแดง)
  - Click cluster → zoom-in
  - Threshold: cluster เมื่อ marker overlap (default radius)

### Map Popup (Camera popup on marker click)
- **D-17:** **Preview ขยายเป็น 240×135px (16:9 มาตรฐาน)** — เดิม 200×112 อัตราส่วนแปลก. ใช้ HLS preview เดิม `<PreviewVideo>` (memoized — อย่าแตะ memoization pattern เพราะป้องกัน flicker/runaway viewer count)
- **D-18:** **Status overlay บน preview** (มุมซ้ายบน):
  - REC dot สีแดง + "REC" text กระพริบเบา ๆ ถ้ากำลัง record
  - Maintenance icon สีเทา + "Maintenance" ถ้า maintenance mode
  - ทั้งคู่อยู่บน semi-transparent background ไม่บังภาพ
- **D-19:** **เพิ่มข้อมูลใน popup** ใต้ name + viewer count:
  - **Recording status badge** — "Recording" + retention "(7 days)" ถ้า enabled
  - **Maintenance badge** — "Maintenance" + ผู้เปิด + เมื่อไร ถ้า enabled (เหมือน Phase 15-04 column)
  - **Last online timestamp** — "Offline 12 minutes ago" (เฉพาะ status = offline)
- **D-20:** **ไม่เพิ่ม coordinates / camera tags** ใน popup — รักษาขนาด popup ไม่ให้บวม. ดูได้ที่ camera detail
- **D-21:** **Action buttons restructure**:
  - Primary 2 ปุ่ม: **View Stream** (เปิด ViewStreamSheet เดิม) + **View Recordings** (ไป `/app/recordings?camera={id}` — ต่อยอดจาก Phase 17)
  - Secondary `⋮` dropdown menu: Set Location, Toggle Maintenance (call API จาก Phase 15-03), Open Camera Detail
- **D-22:** **Popup width = 280-320px** (เดิม `maxWidth=240`) — รองรับ preview 240px + padding + buttons row

### Cross-cutting
- **D-23:** **Real-time refresh strategy** — ใช้ pattern เดิม: Socket.IO `useCameraStatus` สำหรับ camera state changes; polling 30s สำหรับ aggregate stats (`useDashboardStats`); SRS metrics polling 30s. ไม่เพิ่ม channel ใหม่
- **D-24:** **Issues panel data source** = compose จาก existing services (StatusService.getViewerCount, recording status, maintenance flag, SRS streams) — ไม่ต้องสร้าง dedicated "issues" table; compute on read

### Claude's Discretion
- Exact stat card grid layout (`lg:grid-cols-3` vs `lg:grid-cols-6` for 6/7 cards)
- Issues panel polling interval fallback (default 30s)
- Issues threshold definitions (เช่น "offline" ตอนนี้ = > 60 วินาที? — ใช้ existing status logic)
- Color/contrast tuning สำหรับ marker badges (accessibility)
- Mobile responsive behavior สำหรับ dashboard (collapse stat cards, scroll widgets)
- Storage forecast chart type (line vs area chart)
- Recent audit highlights filter (event types, age)
- Loading skeletons สำหรับ widget ใหม่
- Empty states wording และ illustrations
- Cluster bubble color thresholds (worst-case = red ตามที่ระบุ; intermediate states Claude เลือก)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Tenant Dashboard
- `apps/web/src/components/pages/tenant-dashboard-page.tsx` — Current page composition, stat cards, charts, camera table, **SystemMetrics leak ที่ต้องลบ** (line 123)
- `apps/web/src/components/dashboard/system-metrics.tsx` — SystemMetrics component (ลบ usage จาก /app, เก็บไว้ใช้ใน /admin)
- `apps/web/src/components/dashboard/camera-status-table.tsx` — **ลบ component นี้** หลัง Issues panel พร้อม
- `apps/web/src/components/dashboard/bandwidth-chart.tsx` — เก็บ
- `apps/web/src/components/dashboard/api-usage-chart.tsx` — เก็บ
- `apps/web/src/components/dashboard/stat-card.tsx` — Reuse สำหรับ 6 ใบใหม่
- `apps/web/src/hooks/use-dashboard-stats.ts` — `useDashboardStats`, `useCameraStatusList`, `useSystemMetrics` — ต้องเพิ่ม `useDashboardIssues` หรือ derive จาก `useCameraStatusList` + recording status

### Super Admin Dashboard
- `apps/web/src/components/pages/platform-dashboard-page.tsx` — Current page composition, stat cards (5), system metrics (4), org summary table
- `apps/api/src/admin/admin-dashboard.service.ts` — `getPlatformStats`, `getSystemMetrics`, `getOrgSummary` — เพิ่ม endpoints ใหม่: active streams count, recordings active, cluster nodes status, storage forecast, recent audit highlights, org health (with usage)
- `apps/api/src/admin/admin-dashboard.controller.ts` — เพิ่ม route ใหม่
- `apps/api/src/admin/admin-audit-log.service.ts` — Source สำหรับ Recent platform audit highlights

### Map Marker
- `apps/web/src/components/map/camera-marker.tsx` — **Refactor หลัก**: เปลี่ยน div circle เป็น teardrop pin SVG + camera icon + multi-status badges
- `apps/web/src/components/map/camera-map-inner.tsx` — Wraps markers, อาจต้องเพิ่ม `react-leaflet-cluster` integration
- `apps/web/src/components/map/camera-map.tsx` — dynamic import wrapper

### Map Popup
- `apps/web/src/components/map/camera-popup.tsx` — **Refactor**: ขยาย preview (16:9), เพิ่ม status overlay, เพิ่ม badges, restructure actions
- `apps/web/src/components/pages/tenant-map-page.tsx` — Wires `onViewStream`/`onSetLocation`; เพิ่ม `onViewRecordings`/`onToggleMaintenance` handlers
- `apps/web/src/components/ui/avatar.tsx`, `apps/web/src/components/ui/dropdown-menu.tsx`, `apps/web/src/components/ui/badge.tsx` — Primitives

### Phase 15 (status icons + maintenance API)
- `.planning/phases/15-ffmpeg-resilience-camera-maintenance/15-04-PLAN.md` — Composite status icons pattern (online + recording + maintenance) — ใช้ pattern เดียวกันใน badges/Issues panel
- `.planning/phases/15-ffmpeg-resilience-camera-maintenance/15-03-PLAN.md` — Maintenance API (`POST/DELETE /cameras/:id/maintenance`) — ใช้ใน popup `⋮` menu Toggle Maintenance
- `apps/api/src/cameras/cameras.controller.ts` (lines เกี่ยวกับ maintenance endpoint)
- `apps/api/src/prisma/schema.prisma` §`model Camera` — `isRecording`, `maintenanceMode`, `maintenanceEnabledBy`, `maintenanceEnabledAt` fields

### Phase 16 (portal separation)
- `.planning/phases/16-user-self-service/16-CONTEXT.md` §D-02 — Portal separation: super admin ไม่ดู tenant data (กฎหลัก D-01)
- `.planning/phases/16-user-self-service/16-CONTEXT.md` §Plan & Usage — Reference patterns สำหรับ org-scoped usage queries

### Phase 17 (recordings page)
- `.planning/phases/17-recording-playback-timeline/17-CONTEXT.md` — `/app/recordings` page filter by `camera` query param — ใช้สำหรับ Map popup "View Recordings" link
- `apps/web/src/app/app/recordings/components/recordings-data-table.tsx`
- `apps/web/src/hooks/use-recordings.ts`

### DataTable pattern (Phase 14)
- `.planning/phases/14-bug-fixes-datatable-migrations/14-CONTEXT.md` §DataTable Migrations — columns factory + data-table wrapper + faceted filters (apply ใน Org Health Overview)
- `apps/web/src/components/ui/data-table/data-table.tsx`

### SRS Cluster (Phase 6 — for cluster nodes panel)
- `apps/api/src/srs-cluster/` (or wherever cluster service lives — Phase 6 artifact) — node listing for super admin Cluster panel
- `apps/api/src/srs/srs-api.service.ts` — `getStreams`, `getSummaries` — used for active streams count and system metrics

### MinIO (storage forecast)
- `apps/api/src/recordings/minio.service.ts` — Bucket stats source for storage forecast chart

### Status & Real-time
- `apps/api/src/status/status.service.ts` — `getViewerCount`, status state machine
- `apps/web/src/hooks/use-camera-status.ts` — Socket.IO subscription pattern (reuse for Issues panel real-time)

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §UI-05, §UI-06 — Phase 18 requirements
- `.planning/ROADMAP.md` §Phase 18 — Goal + 3 success criteria

### Project constraints
- `.planning/PROJECT.md` §Constraints — UI Design preserve existing patterns (green theme, sidebar nav, card-based dashboard); Stack constraints

### Memory (project-level)
- SaaS role architecture: Super Admin = platform ops (`/admin`), Org Admin = tenant (`/app`) — never one filtered sidebar

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`StatCard` component** (`apps/web/src/components/dashboard/stat-card.tsx`) — Use for both 6-card tenant + 7-card super admin
- **`useDashboardStats` + `useCameraStatusList`** — Backend already aggregates per-org camera state
- **`SrsApiService.getStreams()`** — Returns SRS streams (used for bandwidth, active stream count)
- **`SrsApiService.getSummaries()`** — Returns SRS system metrics
- **`StatusService.getViewerCount(cameraId)`** — Per-camera viewer count
- **`useCameraStatus` Socket.IO hook** — Real-time status updates pattern (used in tenant dashboard, map page; reuse for Issues panel)
- **`PreviewVideo` memoized component** in `camera-popup.tsx` — Critical: do NOT break memoization (prevents flicker/runaway viewer count loop)
- **`react-leaflet` Marker + Popup** — Already installed; teardrop pin = `L.divIcon` SVG content swap (no library change)
- **`DataTable` component system** (Phase 14) — Reuse for Org Health Overview migration
- **`AdminDashboardService.getOrgSummary`** — Aggregation pattern (groupBy camera by orgId+status); extend with usage joins
- **Audit log service** (Phase 5/14) — Source for super admin Recent activity widget

### Established Patterns
- **Portal separation**: `/app/*` (tenant via TENANCY_CLIENT, org_id scoped) vs `/admin/*` (super admin via raw PrismaService)
- **Tenant API**: `/api/...` with org context inferred from session; super admin: `/api/admin/...`
- **Real-time**: Socket.IO for status events (camera:status, camera:viewers); polling 30s for aggregate metrics
- **Charts**: existing tenant `BandwidthChart`/`ApiUsageChart` use Recharts (extend pattern for Storage forecast)
- **Status state machine**: online → degraded → reconnecting → offline with Phase 15 transitions allowed
- **Composite status icons** (Phase 15-04): connection icon + recording icon + maintenance icon — apply to map badges + Issues panel rows
- **Skeleton loading**: existing `<Skeleton>` component used throughout dashboard
- **Empty states**: card with centered icon + heading + description (used in map page; replicate for Issues panel)

### Integration Points
- **Tenant dashboard** (`tenant-dashboard-page.tsx`): remove SystemMetrics line 123, add Recording/Maintenance stat cards, replace `<CameraStatusTable />` with `<IssuesPanel />`
- **Issues panel** (new component, e.g. `apps/web/src/components/dashboard/issues-panel.tsx`): consumes `useCameraStatusList` + recording status; emits to navigation actions
- **Super admin dashboard** (`platform-dashboard-page.tsx`): add 2 stat cards (Active Streams, Recordings Active), insert 4 new sections (Cluster, Issues, Storage forecast, Recent audit), migrate Org Summary to DataTable
- **Backend `AdminDashboardService`**: add `getActiveStreamsCount`, `getRecordingsActive`, `getClusterNodes`, `getPlatformIssues`, `getStorageForecast`, `getRecentAuditHighlights`, `getOrgHealthOverview` methods
- **Map marker** (`camera-marker.tsx`): swap `divIcon` HTML to SVG teardrop + status badges; consume `isRecording` + `maintenanceMode` from camera data
- **Map data flow** (`tenant-map-page.tsx`): `apiFetch<Array>('/api/cameras')` already returns `isRecording`/`maintenanceMode` (Phase 15) — verify, extend `MapCamera` type, propagate to marker
- **Map clustering** (`camera-map-inner.tsx`): wrap markers in `<MarkerClusterGroup>` from `react-leaflet-cluster` (new dep)
- **Map popup** (`camera-popup.tsx`): expand layout, add overlay/badges, restructure actions, wire `onViewRecordings` + `onToggleMaintenance` props
- **`/api/cameras` endpoint**: verify response shape includes `isRecording`, `maintenanceMode`, `maintenanceEnabledBy`, `maintenanceEnabledAt`, `lastOnlineAt`

</code_context>

<specifics>
## Specific Ideas

- **Issues panel as "reward signal"** — empty state ("All cameras healthy ✓") เป็น UX pattern ที่ powerful: ผู้ใช้เปิดมาแล้วเห็นว่าไม่มีอะไรต้องทำ = ดี ไม่ใช่ dashboard ว่าง
- **Map marker = Google Maps style teardrop** — familiar mental model, anchor ปลายล่างชี้ตำแหน่งจริง ๆ, camera icon ตรงกลางบอก "เป็นกล้อง" ชัดเจน
- **Multi-status visualization on marker** — สี pin = primary (connection); badges มุม = secondary (recording, maintenance) — operator scan ได้ทีเดียว ไม่ต้องคลิก popup
- **Super admin dashboard ≠ dashboard ทั่วไป** — ผู้ใช้ที่เปิดคือ platform operator ดูเชิง infrastructure / cross-org. Layout vertical stack ตาม priority ให้ scroll ตามลำดับเข้ากับ workflow
- **Org Health Overview = "ใครใกล้เต็ม plan"** sort default — super admin จะ proactive contact org ที่กำลังจะต้อง upgrade
- **Popup actions: View Stream + View Recordings primary** — บ่อยสุด 2 actions; secondary actions (Set Location, Toggle Maintenance, Detail) ซ่อนใน `⋮` ลด visual noise
- **PreviewVideo memoization บัญญัติ** — ห้ามแตะ memo logic เพราะ Phase 13 เคยเกิด bug runaway viewer count + flicker (โน้ตใน `camera-popup.tsx:30-32` warns ห้ามให้ viewer-count event remount)

</specifics>

<deferred>
## Deferred Ideas

- **Live preview grid (4-6 thumbnails) บน tenant dashboard** — bandwidth-heavy (6× HLS streams); add as opt-in widget setting in future
- **Recent activity feed บน tenant dashboard** — overlap กับ Issues panel; revisit ถ้า user feedback ขอ historical view
- **Mini map embed บน tenant dashboard** — duplicates `/map` page; not needed
- **Tab-based dashboard layout (super admin)** — alternative ที่ rejected; revisit ถ้า vertical stack scroll ยาวเกินจริง
- **Coordinates + camera tags ใน popup** — ทำ popup บวม; ดูได้ที่ camera detail page
- **Marker spider effect (เตือน overlap)** — `react-leaflet-cluster` จัดการ overlap แบบ cluster ดีกว่า; spider effect = nice-to-have
- **Issues panel auto-resolve / ack workflow** — ตอนนี้แสดงอย่างเดียว; future: mark as acknowledged, snooze, assign owner
- **Storage forecast multi-region / per-bucket breakdown** — ตอนนี้ aggregate ทั้ง MinIO; per-bucket detail = future
- **Cluster nodes individual control (kick clients, restart)** — แสดงสถานะอย่างเดียวใน Phase 18; control actions = future ops feature
- **Custom dashboard / widget arrangement per user** — feature flag drift risk; ไม่อยู่ใน Phase 18 scope

</deferred>

---

*Phase: 18-dashboard-map-polish*
*Context gathered: 2026-04-19*
