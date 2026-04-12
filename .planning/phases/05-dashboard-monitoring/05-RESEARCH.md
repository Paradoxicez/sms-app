# Phase 5: Dashboard & Monitoring - Research

**Researched:** 2026-04-12
**Domain:** Real-time dashboard, map visualization, audit logging, notifications, log streaming
**Confidence:** HIGH

## Summary

Phase 5 builds a monitoring hub on top of the existing NestJS + Next.js stack. The core work spans six feature areas: (1) dashboard with stat cards and charts, (2) map view with Leaflet, (3) audit log via NestJS interceptor, (4) notification system via Socket.IO, (5) SRS live log streaming, and (6) camera detail page redesign. All real-time infrastructure already exists (StatusGateway with Socket.IO, org-scoped rooms) and needs extension, not replacement. Chart data comes from two sources: SRS `/api/v1/summaries` for system metrics and the existing `ApiKeyUsage` table for bandwidth/API usage over time.

The biggest complexity is the audit log interceptor -- it must capture write operations across all controllers without modifying each one, store efficiently in PostgreSQL with RLS, and handle the details (JSON diff) without performance impact. The map view requires careful handling of Leaflet's SSR incompatibility with Next.js (must dynamic-import with `ssr: false`). The notification system leverages existing Socket.IO patterns but needs a new user-scoped room pattern alongside the existing org-scoped rooms.

**Primary recommendation:** Build in layers -- database schema + backend services first (audit log, notifications, dashboard aggregation endpoints), then Socket.IO extensions (notifications, log streaming), then frontend pages. Use shadcn chart component (Recharts wrapper) for all charts, react-leaflet 5 for maps, and NestJS interceptor pattern for audit logging.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Full monitoring hub layout -- stat cards row + charts + camera status list
- **D-02:** Org admin/operator dashboard shows camera stats + charts (no system metrics)
- **D-03:** Super admin dashboard includes system metrics (CPU, RAM, storage, SRS node stats)
- **D-04:** Charts use shadcn/ui chart components (built on Recharts)
- **D-05:** Bandwidth and API usage charts support 24h / 7d / 30d time range toggle
- **D-06:** Real-time updates via WebSocket + polling hybrid (status via Socket.IO, charts via 30s polling)
- **D-07:** Map library: Leaflet + react-leaflet (OpenStreetMap tiles, no API key)
- **D-08:** Click camera marker shows popup with name, status, viewers, mini HLS preview
- **D-09:** Cluster markers for nearby cameras
- **D-10:** Map view gated by FeatureKey.MAP feature toggle
- **D-11:** Track all write actions with actor, action type, resource, timestamp, IP, details
- **D-12:** Audit log UI with filters: actor, action type, date range
- **D-13:** Audit log gated by FeatureKey.AUDIT_LOG feature toggle
- **D-14:** Audit log via NestJS interceptor stored in PostgreSQL audit_log table with org_id RLS
- **D-15:** Tail SRS log file via WebSocket (Socket.IO namespace, level filter)
- **D-16:** SRS log viewer is super admin only
- **D-17:** In-app notifications only (no email), bell icon with dropdown
- **D-18:** Notification types: Camera events + System alerts
- **D-19:** User notification preferences per event type
- **D-20:** Notifications stored in PostgreSQL with read/unread status
- **D-21:** Redesign camera detail page with tabs (Overview, Settings, Activity)

### Claude's Discretion
- Exact component layout and spacing within dashboard sections
- Leaflet tile provider choice (OSM default)
- Marker icon design and status color coding on map
- Audit log table pagination strategy and page size
- SRS log file path detection and tail implementation
- Notification bell badge design and animation
- Notification storage schema and cleanup/retention
- Camera detail page specific layout decisions
- System metrics polling interval and SRS API field mapping
- Chart data aggregation backend endpoints design

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | Dashboard with camera status summary, bandwidth chart, API usage stats | Stat cards from camera table aggregation + SRS API, charts from ApiKeyUsage table, shadcn chart component |
| DASH-02 | Real-time camera status and viewer count updates via WebSocket | Extend existing StatusGateway; frontend via use-camera-status hook pattern |
| DASH-03 | Map view showing camera locations with status indicators and click-to-preview | react-leaflet 5.0.0 + leaflet 1.9.4 with react-leaflet-cluster 4.1.3 for marker clustering |
| DASH-04 | System metrics display (CPU, memory, storage, SRS node stats) | SrsApiService.getSummaries() already available; map response fields to stat cards |
| DASH-05 | Audit log tracking all user actions | NestJS interceptor captures POST/PUT/PATCH/DELETE, stores in audit_log table with RLS |
| DASH-06 | Notification system for camera events and system alerts | New Notification model in PostgreSQL, Socket.IO user-scoped rooms, BullMQ for delivery |
| DASH-07 | Live stream engine logs viewable in UI | Node.js fs.watch/tail on SRS log file, stream via Socket.IO to admin UI |
</phase_requirements>

## Standard Stack

### Core (New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | 3.8.1 | Chart rendering | shadcn chart component wraps Recharts; D-04 locked decision [VERIFIED: npm registry] |
| leaflet | 1.9.4 | Map engine | D-07 locked decision; open-source, no API key, React 19 compatible via react-leaflet [VERIFIED: npm registry] |
| react-leaflet | 5.0.0 | React wrapper for Leaflet | Peer deps: React ^19.0.0, Leaflet ^1.9.0 -- exact match for project stack [VERIFIED: npm registry] |
| react-leaflet-cluster | 4.1.3 | Marker clustering | Peer deps: react-leaflet ^5.0.0, React ^19.0.0 -- wraps leaflet.markercluster [VERIFIED: npm registry] |
| leaflet.markercluster | 1.5.3 | Leaflet clustering plugin | Required by react-leaflet-cluster [VERIFIED: npm registry] |
| @types/leaflet | 1.9.21 | TypeScript types for Leaflet | [VERIFIED: npm registry] |

### Already Installed (No Changes Needed)

| Library | Version | Purpose |
|---------|---------|---------|
| socket.io / socket.io-client | 4.8.3 | Real-time WebSocket (StatusGateway) [VERIFIED: package.json] |
| @nestjs/websockets + @nestjs/platform-socket.io | 11.1.18 | NestJS Socket.IO integration [VERIFIED: package.json] |
| @nestjs/schedule | 6.1.1 | Cron jobs (notification cleanup) [VERIFIED: package.json] |
| bullmq / @nestjs/bullmq | 5.73.2 / 11.0.4 | Job queue (notification delivery) [VERIFIED: package.json] |
| ioredis | 5.10.1 | Redis client [VERIFIED: package.json] |
| hls.js | 1.6.15 | HLS playback for map preview popups [VERIFIED: package.json] |
| lucide-react | 1.8.0 | Icons (LayoutDashboard, MapPin, FileText, Bell) [VERIFIED: package.json] |

### shadcn Component to Add

```bash
npx shadcn@latest add chart
```

This adds a Recharts-based chart component with theme-aware CSS variable colors (--chart-1 through --chart-5). [VERIFIED: UI-SPEC confirms chart colors already in globals.css]

### Installation (Frontend)

```bash
cd apps/web
npm install leaflet react-leaflet react-leaflet-cluster leaflet.markercluster @types/leaflet
npx shadcn@latest add chart
```

### Installation (Backend)

No new backend dependencies needed. All required packages (Socket.IO, BullMQ, Prisma, ioredis) already installed.

## Architecture Patterns

### Recommended Project Structure

```
apps/api/src/
  audit/                    # NEW - Audit log module
    audit.module.ts
    audit.service.ts
    audit.controller.ts
    audit.interceptor.ts    # Global NestJS interceptor for write ops
    dto/
  notifications/            # NEW - Notification module
    notifications.module.ts
    notifications.service.ts
    notifications.controller.ts
    notifications.gateway.ts  # Socket.IO for real-time delivery
    notifications.processor.ts  # BullMQ job for batch delivery
    dto/
  dashboard/                # NEW - Dashboard aggregation module
    dashboard.module.ts
    dashboard.service.ts
    dashboard.controller.ts
  srs/
    srs-log.gateway.ts      # NEW - SRS log streaming via Socket.IO

apps/web/src/
  app/admin/
    dashboard/page.tsx      # NEW - Dashboard page
    map/page.tsx            # NEW - Map view page
    audit-log/page.tsx      # NEW - Audit log page
    cameras/[id]/page.tsx   # REDESIGN - Tabbed camera detail
  components/
    dashboard/              # NEW
      stat-card.tsx
      bandwidth-chart.tsx
      api-usage-chart.tsx
      camera-status-table.tsx
      system-metrics.tsx
    map/                    # NEW
      camera-map.tsx        # Dynamic import wrapper (ssr: false)
      camera-marker.tsx
      camera-popup.tsx
    notifications/          # NEW
      notification-bell.tsx
      notification-dropdown.tsx
      notification-item.tsx
    srs-logs/               # NEW
      log-viewer.tsx
  hooks/
    use-notifications.ts    # NEW - Socket.IO hook for notifications
    use-srs-logs.ts         # NEW - Socket.IO hook for log streaming
    use-dashboard-stats.ts  # NEW - Polling hook for chart data
```

### Pattern 1: Audit Log Interceptor (D-14)

**What:** Global NestJS interceptor that captures all write operations (POST/PUT/PATCH/DELETE) and logs them to the audit_log table.
**When to use:** Applied globally via APP_INTERCEPTOR or selectively via @UseInterceptors.

```typescript
// Source: NestJS interceptor pattern [VERIFIED: codebase uses this pattern]
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly cls: ClsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only audit write operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const startData = {
      method,
      path: request.path,
      body: request.body,
      userId: request.user?.id,
      orgId: this.cls.get('ORG_ID'),
      ip: request.ip || request.headers['x-forwarded-for'],
    };

    return next.handle().pipe(
      tap((responseData) => {
        // Fire-and-forget audit log write
        this.auditService.log({
          ...startData,
          action: this.deriveAction(method, request.path),
          resource: this.deriveResource(request.path),
          resourceId: responseData?.id || request.params?.id,
          details: request.body,
        }).catch(() => {}); // Never block the response
      }),
    );
  }
}
```

**Key design decisions:**
- Fire-and-forget: Audit write failures must NEVER block the response [ASSUMED]
- Derive action from HTTP method: POST=create, PUT/PATCH=update, DELETE=delete
- Store request body as details JSON (sanitize passwords/secrets)
- Exclude internal endpoints (SRS callbacks, health checks) via path matching
- Use CLS for orgId (already established pattern in codebase) [VERIFIED: prisma-tenancy.extension.ts]

### Pattern 2: Leaflet SSR Guard (Next.js + Leaflet)

**What:** Leaflet requires `window` and cannot run during SSR. Must use dynamic import.
**When to use:** Any component rendering Leaflet maps.

```typescript
// Source: Next.js dynamic import pattern [VERIFIED: Next.js docs]
// apps/web/src/components/map/camera-map.tsx
import dynamic from 'next/dynamic';

const MapContainer = dynamic(
  () => import('./camera-map-inner'),
  { ssr: false, loading: () => <MapSkeleton /> }
);

// camera-map-inner.tsx -- actual Leaflet usage
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
```

**Critical:** The `leaflet/dist/leaflet.css` import MUST be in the client-only component, not in a layout or server component. [ASSUMED]

### Pattern 3: User-Scoped Socket.IO Rooms (Notifications)

**What:** Extend existing org-scoped room pattern to add user-scoped rooms for notifications.
**When to use:** Notification delivery targeting specific users.

```typescript
// Existing pattern [VERIFIED: status.gateway.ts]
// org:${orgId} rooms for camera status broadcasts

// NEW: user:${userId} rooms for notification delivery
async handleConnection(client: Socket) {
  const orgId = client.handshake.query.orgId as string;
  const userId = client.handshake.query.userId as string;
  if (orgId) client.join(`org:${orgId}`);
  if (userId) client.join(`user:${userId}`);
}

// Emit notification to specific user
this.server.to(`user:${userId}`).emit('notification:new', payload);
```

### Pattern 4: Chart Data Aggregation Endpoint

**What:** Backend endpoints that aggregate ApiKeyUsage data for chart rendering.
**When to use:** Dashboard bandwidth and API usage charts.

```typescript
// Leverage existing ApiKeyUsage table [VERIFIED: schema.prisma]
// Aggregate by date for time-series charts
async getUsageTimeSeries(orgId: string, range: '24h' | '7d' | '30d') {
  const since = new Date();
  if (range === '24h') since.setHours(since.getHours() - 24);
  else if (range === '7d') since.setDate(since.getDate() - 7);
  else since.setDate(since.getDate() - 30);

  return this.prisma.$queryRaw`
    SELECT date, SUM(requests) as requests, SUM(bandwidth) as bandwidth
    FROM "ApiKeyUsage" aku
    JOIN "ApiKey" ak ON aku."apiKeyId" = ak.id
    WHERE ak."orgId" = ${orgId} AND aku.date >= ${since}
    GROUP BY date ORDER BY date
  `;
}
```

### Pattern 5: SRS Log File Tailing

**What:** Read SRS log file in real-time using Node.js fs.watch + readline.
**When to use:** SRS live log viewer (D-15).

```typescript
// SRS log file location in Docker: /usr/local/srs/objs/srs.log [CITED: CLAUDE.md SRS Docker section]
// Backend tails the file and streams via Socket.IO
import { createReadStream, watch } from 'fs';
import { createInterface } from 'readline';

// Use fs.watch() for file change detection
// Stream new lines via Socket.IO to connected admins
// Parse log level from line format: [timestamp][level] message
```

**Recommendation:** Use `tail` child process (`spawn('tail', ['-f', '-n', '100', logPath])`) for simplicity and reliability over manual fs.watch. The SRS container mounts log volume, so the file is accessible from the API container via shared Docker volume. [ASSUMED]

### Anti-Patterns to Avoid
- **Polling for everything:** Don't poll for camera status -- use existing Socket.IO. Only poll for aggregated chart data (D-06 decision).
- **Storing audit logs in Redis:** Store in PostgreSQL for queryability and RLS. Redis is only for real-time counters (already used for API key usage).
- **Rendering Leaflet server-side:** Will crash. Always use `dynamic(..., { ssr: false })`.
- **Blocking responses for audit writes:** Audit interceptor must be fire-and-forget.
- **Large notification payloads via Socket.IO:** Send minimal payload (id, type, title), let frontend fetch details if needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart rendering | Custom SVG/Canvas charts | shadcn chart (Recharts) | Theme-aware, responsive, accessible, matches design system |
| Map clustering | Custom clustering algorithm | react-leaflet-cluster (leaflet.markercluster) | Edge cases in clustering math, zoom level handling, animation |
| Log file tailing | Custom fs.watch + position tracking | `child_process.spawn('tail', ['-f', ...])` | Handles file rotation, partial lines, buffering correctly |
| Time-series aggregation | In-memory aggregation | PostgreSQL GROUP BY with date functions | Already have ApiKeyUsage table; SQL is correct tool |
| Real-time delivery | Custom WebSocket server | Socket.IO (already installed) | Room management, reconnection, namespace isolation |

## Common Pitfalls

### Pitfall 1: Leaflet CSS Missing in Next.js
**What goes wrong:** Map renders but tiles are offset, markers invisible, controls broken.
**Why it happens:** Leaflet CSS not imported; Next.js doesn't auto-include it.
**How to avoid:** Import `leaflet/dist/leaflet.css` in the client-only map component. Also import `leaflet.markercluster/dist/MarkerCluster.css` and `leaflet.markercluster/dist/MarkerCluster.Default.css`.
**Warning signs:** Map tiles visible but offset by ~50px; markers appear as broken images.

### Pitfall 2: Leaflet Default Marker Icons Broken in Bundlers
**What goes wrong:** Default blue marker icons show as broken images.
**Why it happens:** Webpack/Turbopack doesn't resolve Leaflet's icon image paths correctly.
**How to avoid:** Override default icon with explicit path or use custom SVG/div markers (better for status coloring anyway).
```typescript
import L from 'leaflet';
// Fix default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: '/marker-icon.png',
  iconRetinaUrl: '/marker-icon-2x.png',
  shadowUrl: '/marker-shadow.png',
});
// OR use DivIcon for custom status-colored markers (recommended)
```
**Warning signs:** Console error about missing icon images.

### Pitfall 3: Audit Log Interceptor Missing orgId
**What goes wrong:** Audit entries created without orgId, breaking RLS queries.
**Why it happens:** CLS context not set for some routes (super admin, SRS callbacks).
**How to avoid:** Always set orgId in interceptor; for super admin operations, use the target resource's orgId from the request/response. Skip audit for SRS callback endpoints entirely.
**Warning signs:** Audit log page shows empty even after performing actions.

### Pitfall 4: Socket.IO Namespace Confusion
**What goes wrong:** Notifications don't reach clients, or camera status events stop working.
**Why it happens:** Adding new Socket.IO events to wrong namespace, or client connecting to wrong namespace.
**How to avoid:** Existing StatusGateway uses `/camera-status` namespace. For notifications, either (a) add events to same gateway or (b) create new namespace `/notifications`. Keep it consistent. Frontend must connect to correct namespace.
**Warning signs:** Socket connected but no events received; check namespace in browser DevTools Network/WS tab.

### Pitfall 5: Chart Re-rendering Performance
**What goes wrong:** Dashboard becomes sluggish with multiple charts updating every 30 seconds.
**Why it happens:** Recharts re-renders entire chart on data change; React re-renders parent components.
**How to avoid:** Memoize chart data with `useMemo`, wrap chart components in `React.memo`, use stable keys. Don't put chart data in parent state that triggers full page re-render.
**Warning signs:** Dashboard feels laggy after 2-3 minutes; React DevTools shows unnecessary re-renders.

### Pitfall 6: Audit Log Table Growth
**What goes wrong:** audit_log table grows unbounded, slowing queries and consuming storage.
**Why it happens:** Every write operation creates a row; high-traffic orgs accumulate fast.
**How to avoid:** Add a retention policy (e.g., 90 days). Use a BullMQ scheduled job to delete old entries. Add index on `(orgId, createdAt)` for efficient range queries and cleanup.
**Warning signs:** Audit log page load times increase over weeks.

## Code Examples

### Database Schema Additions (Prisma)

```prisma
// Source: Project patterns [VERIFIED: existing schema.prisma patterns]

// Audit Log
model AuditLog {
  id         String   @id @default(uuid())
  orgId      String
  userId     String?  // null for system actions
  action     String   // "create" | "update" | "delete"
  resource   String   // "camera" | "project" | "site" | "policy" etc.
  resourceId String?
  method     String   // HTTP method
  path       String   // Request path
  ip         String?
  details    Json?    // Request body / change description
  createdAt  DateTime @default(now())

  @@index([orgId, createdAt])
  @@index([orgId, userId])
  @@index([orgId, resource])
  @@index([orgId, action])
}

// Notifications
model Notification {
  id        String   @id @default(uuid())
  orgId     String
  userId    String   // Target user
  type      String   // "camera.online" | "camera.offline" | "camera.degraded" | "system.alert"
  title     String
  body      String?
  data      Json?    // Additional context (cameraId, etc.)
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  @@index([userId, read, createdAt])
  @@index([orgId, createdAt])
}

// User Notification Preferences
model NotificationPreference {
  id        String   @id @default(uuid())
  userId    String
  orgId     String
  eventType String   // "camera.online" | "camera.offline" | etc.
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, orgId, eventType])
}
```

### RLS Policies for New Tables

```sql
-- Audit log: org members can read their org's logs
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_org_isolation ON "AuditLog"
  USING ("orgId" = current_setting('app.current_org_id', true));

-- Notifications: users see only their own
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_user_isolation ON "Notification"
  USING ("orgId" = current_setting('app.current_org_id', true));

-- Preferences: users manage their own
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY pref_org_isolation ON "NotificationPreference"
  USING ("orgId" = current_setting('app.current_org_id', true));
```

### Notification Integration with StatusService

```typescript
// Source: Existing StatusService pattern [VERIFIED: status.service.ts]
// Hook into status transitions to create notifications

async transition(cameraId: string, orgId: string, newStatus: string): Promise<void> {
  // ... existing logic ...

  // NEW: Create notifications for camera events
  const notifiableStatuses = ['online', 'offline', 'degraded'];
  if (notifiableStatuses.includes(newStatus)) {
    this.notificationsService.createForCameraEvent(orgId, cameraId, newStatus)
      .catch((err) => {
        this.logger.warn(`Failed to create notification: ${err.message}`);
      });
  }
}
```

### SRS Summaries Field Mapping

```typescript
// Source: CLAUDE.md SRS API reference [VERIFIED: CLAUDE.md]
// /api/v1/summaries returns system data for super admin dashboard

interface SrsSummary {
  data: {
    ok: boolean;
    now_ms: number;
    self: {
      version: string;
      pid: number;
      ppid: number;
      argv: string;
      cwd: string;
      mem_kbyte: number;      // -> Memory stat card
      mem_percent: number;     // -> Memory % display
      cpu_percent: number;     // -> CPU stat card
      srs_uptime: number;     // -> Uptime stat card (seconds)
    };
    system: {
      cpu_percent: number;     // -> System CPU
      disk_read_KBps: number;
      disk_write_KBps: number;
      mem_ram_kbyte: number;
      mem_ram_percent: number;
      mem_swap_kbyte: number;
      mem_swap_percent: number;
      cpus: number;
      cpus_online: number;
      uptime: number;
      ilde_time: number;       // Note: SRS typo "ilde" not "idle"
      load_1m: number;
      load_5m: number;
      load_15m: number;
    };
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-leaflet v4 | react-leaflet v5 with React 19 support | 2025 | Can use with project's React 19 [VERIFIED: npm peerDeps] |
| @react-leaflet/markercluster | react-leaflet-cluster | 2024 | @react-leaflet/markercluster unmaintained; react-leaflet-cluster actively maintained and supports v5 [VERIFIED: npm registry] |
| Custom chart components | shadcn chart (Recharts wrapper) | 2024 | Theme-aware, CSS variable colors, consistent with design system |
| Manual Socket.IO rooms | NestJS @WebSocketGateway with namespaces | Stable | Project already uses this pattern |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Audit interceptor should be fire-and-forget (never block response) | Architecture Patterns | If wrong, could add latency to all write operations |
| A2 | `leaflet/dist/leaflet.css` must be in client-only component for Next.js | Architecture Patterns | Map styling will break if imported in wrong location |
| A3 | SRS log file accessible via shared Docker volume from API container | Architecture Patterns | Log streaming feature won't work; need alternative approach |
| A4 | `tail -f` via child_process more reliable than fs.watch for log tailing | Don't Hand-Roll | If wrong, may need to implement custom watcher |
| A5 | 90-day retention is reasonable default for audit logs | Pitfalls | May need adjustment based on compliance requirements |

## Open Questions

1. **SRS Log File Path in Docker Compose**
   - What we know: SRS writes to `/usr/local/srs/objs/srs.log` inside its container
   - What's unclear: Whether the current docker-compose.yml mounts this path as a volume accessible to the API container
   - Recommendation: Check docker-compose.yml; if not mounted, add shared volume. Alternatively, use `docker logs` approach via Docker API.

2. **Chart Data Granularity for 24h Range**
   - What we know: ApiKeyUsage stores daily aggregates (one row per key per day)
   - What's unclear: 24h chart needs hourly granularity, but daily aggregation means only 1-2 data points for 24h
   - Recommendation: For 24h range, use Redis real-time counters (already tracked per request) with hourly bucketing. For 7d/30d, use PostgreSQL ApiKeyUsage table.

3. **Notification Cleanup Strategy**
   - What we know: Notifications stored in PostgreSQL; will grow over time
   - What's unclear: Exact retention period and cleanup trigger
   - Recommendation: BullMQ scheduled job (daily at 01:00 UTC) to delete notifications older than 30 days. User preference to keep/dismiss.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/api && npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Dashboard aggregation endpoint returns stat data | unit | `cd apps/api && npx vitest run tests/dashboard/dashboard.test.ts -t "stats" --reporter=verbose` | Wave 0 |
| DASH-02 | StatusGateway broadcasts status updates | unit | `cd apps/api && npx vitest run tests/status/status-gateway.test.ts --reporter=verbose` | Wave 0 |
| DASH-03 | Map endpoint returns cameras with location data | unit | `cd apps/api && npx vitest run tests/dashboard/map.test.ts --reporter=verbose` | Wave 0 |
| DASH-04 | System metrics endpoint proxies SRS summaries | unit | `cd apps/api && npx vitest run tests/dashboard/system-metrics.test.ts --reporter=verbose` | Wave 0 |
| DASH-05 | Audit interceptor captures write operations | unit | `cd apps/api && npx vitest run tests/audit/audit-interceptor.test.ts --reporter=verbose` | Wave 0 |
| DASH-06 | NotificationService creates and delivers notifications | unit | `cd apps/api && npx vitest run tests/notifications/notifications.test.ts --reporter=verbose` | Wave 0 |
| DASH-07 | SRS log gateway streams log lines | unit | `cd apps/api && npx vitest run tests/srs/srs-log-gateway.test.ts --reporter=verbose` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd apps/api && npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/api/tests/dashboard/dashboard.test.ts` -- covers DASH-01
- [ ] `apps/api/tests/dashboard/map.test.ts` -- covers DASH-03
- [ ] `apps/api/tests/dashboard/system-metrics.test.ts` -- covers DASH-04
- [ ] `apps/api/tests/audit/audit-interceptor.test.ts` -- covers DASH-05
- [ ] `apps/api/tests/notifications/notifications.test.ts` -- covers DASH-06
- [ ] `apps/api/tests/srs/srs-log-gateway.test.ts` -- covers DASH-07

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing AuthGuard on all dashboard endpoints; super admin role check for system metrics and SRS logs |
| V3 Session Management | no | Existing session infrastructure unchanged |
| V4 Access Control | yes | RLS on audit_log and notification tables; FeatureGuard for MAP and AUDIT_LOG; role-based dashboard views (org admin vs super admin) |
| V5 Input Validation | yes | Zod validation on audit log filter params, notification preference updates, dashboard time range params |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Audit log data exposure across tenants | Information Disclosure | RLS policy on audit_log table with orgId [VERIFIED: existing RLS pattern] |
| Notification spoofing via Socket.IO | Spoofing | Validate orgId/userId from authenticated session on WebSocket connection, not from client query params |
| SRS log exposure to non-admins | Information Disclosure | Super admin role check on SRS log gateway connection; reject non-admin Socket.IO joins |
| Audit log details containing secrets | Information Disclosure | Sanitize request body in interceptor: strip password, secret, token fields before storing |
| Map view leaking camera locations cross-tenant | Information Disclosure | RLS on camera table already enforced; map endpoint uses tenancy client [VERIFIED: existing pattern] |

## Sources

### Primary (HIGH confidence)
- `apps/api/src/status/status.gateway.ts` -- Existing Socket.IO pattern with org-scoped rooms
- `apps/api/src/status/status.service.ts` -- Camera status state machine and transition hooks
- `apps/api/src/srs/srs-api.service.ts` -- getSummaries(), getStreams(), getClients() methods
- `apps/api/src/prisma/schema.prisma` -- Current database schema with RLS patterns
- `apps/api/src/api-keys/api-keys.service.ts` -- ApiKeyUsage aggregation pattern
- `apps/api/src/tenancy/prisma-tenancy.extension.ts` -- CLS-based org context injection
- `apps/api/src/features/feature-key.enum.ts` -- FeatureKey.MAP and FeatureKey.AUDIT_LOG
- `.planning/phases/05-dashboard-monitoring/05-UI-SPEC.md` -- Visual design contract
- npm registry -- Verified all package versions and peer dependencies

### Secondary (MEDIUM confidence)
- CLAUDE.md -- SRS API surface, Docker setup, HLS configuration reference
- `.planning/phases/05-dashboard-monitoring/05-CONTEXT.md` -- All 21 locked decisions

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified via npm registry, peer deps confirmed compatible
- Architecture: HIGH -- patterns derived from existing codebase, minimal new patterns needed
- Pitfalls: HIGH -- Leaflet SSR issues and marker icon problems are well-documented community knowledge

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable ecosystem, no fast-moving dependencies)
