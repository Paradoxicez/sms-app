# Phase 5: Dashboard & Monitoring - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Operators and admins can monitor camera status, system health, and all platform activity through a real-time dashboard. Includes dashboard with stat cards and charts, map view with camera locations, audit log for all write actions, in-app notification system, and live SRS log viewer. No recordings (Phase 7), no cluster scaling (Phase 6). Folded: Redesign camera detail page.

</domain>

<decisions>
## Implementation Decisions

### Dashboard Layout & Widgets
- **D-01:** Full monitoring hub layout — stat cards row (cameras online/offline, total viewers, bandwidth) at top + charts (bandwidth over time, API usage) in middle + camera status list at bottom
- **D-02:** Org admin/operator dashboard shows camera stats + charts (no system metrics) — stat cards, bandwidth chart, API usage chart, camera status list
- **D-03:** Super admin dashboard includes system metrics (CPU, RAM, storage, SRS node stats via `/api/v1/summaries`) in addition to camera stats
- **D-04:** Charts use shadcn/ui chart components (built on Recharts) — consistent with existing shadcn design system, theme-aware colors via CSS variables
- **D-05:** Bandwidth and API usage charts support 24h / 7d / 30d time range toggle
- **D-06:** Real-time updates via WebSocket + polling hybrid — camera status updates via existing StatusGateway (Socket.IO), charts and aggregate stats via polling every 30s

### Map View
- **D-07:** Map library: Leaflet + react-leaflet — open-source, free, no API key required, OpenStreetMap tiles. Suitable for self-hosted deployment
- **D-08:** Click camera marker on map shows popup with camera name, status, viewer count, and mini HLS live preview player
- **D-09:** Cluster markers for nearby cameras — markers grouped into numbered clusters, zoom to expand. Supports 100+ cameras without visual clutter
- **D-10:** Map view gated by FeatureKey.MAP feature toggle (already exists in feature-key.enum.ts)

### Audit Log
- **D-11:** Track all write actions — create/update/delete on cameras, projects, sites, policies, stream profiles, API keys, webhooks, user management, org settings, stream engine settings. Each entry: actor (user), action type, resource, timestamp, IP address, details (JSON diff or description)
- **D-12:** Audit log UI with filters: by actor (who), action type (what), and date range — covers primary investigation use cases
- **D-13:** Audit log gated by FeatureKey.AUDIT_LOG feature toggle (already exists in feature-key.enum.ts)
- **D-14:** Audit log implementation via NestJS interceptor — captures write operations automatically across all controllers, stored in PostgreSQL audit_log table with org_id for RLS

### SRS Live Logs
- **D-15:** Tail SRS log file via WebSocket — backend reads SRS log file with tail -f equivalent, streams to UI via Socket.IO namespace. UI shows real-time log stream with level filter (info/warn/error)
- **D-16:** SRS log viewer is super admin only — accessible from Stream Engine settings page

### Notification System
- **D-17:** In-app notifications only (no email for v1) — notification bell icon in header with dropdown list, real-time delivery via Socket.IO
- **D-18:** Notification types: Camera events (online/offline/degraded/reconnecting) + System alerts (disk space low, SRS down, high CPU). Camera events leverage existing StatusService state machine transitions
- **D-19:** User notification preferences per event type — enable/disable each notification type individually to reduce noise
- **D-20:** Notifications stored in PostgreSQL with read/unread status, paginated list in dropdown

### Camera Detail Page Redesign (Folded Todo)
- **D-21:** Redesign camera detail page as part of dashboard improvements — integrate live preview, status info, stream details, and quick actions into improved layout

### Claude's Discretion
- Exact component layout and spacing within dashboard sections
- Leaflet tile provider choice (OSM default, option for others)
- Marker icon design and status color coding on map
- Audit log table pagination strategy and page size
- SRS log file path detection and tail implementation
- Notification bell badge design and animation
- Notification storage schema and cleanup/retention
- Camera detail page specific layout decisions
- System metrics polling interval and SRS API field mapping
- Chart data aggregation backend endpoints design

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dashboard & Monitoring Requirements
- `.planning/REQUIREMENTS.md` §Dashboard & Monitoring — DASH-01 through DASH-07 requirements
- `.planning/ROADMAP.md` §Phase 5 — Success criteria (5 items) and dependencies

### Existing WebSocket Infrastructure
- `apps/api/src/status/status.gateway.ts` — StatusGateway with camera:status and camera:viewers events, org-scoped rooms
- `apps/api/src/status/status.service.ts` — Camera status state machine
- `apps/web/src/hooks/use-camera-status.ts` — Frontend Socket.IO hook for camera status

### SRS API Integration
- `apps/api/src/srs/srs-api.service.ts` — getSummaries(), getStreams(), getClients() for system metrics and stream data
- `CLAUDE.md` §SRS HTTP API Surface — Full SRS API endpoints reference
- `CLAUDE.md` §SRS Monitoring and Metrics — Available metrics from SRS

### Feature Toggles
- `apps/api/src/features/feature-key.enum.ts` — FeatureKey.MAP and FeatureKey.AUDIT_LOG already defined

### UI Components
- `apps/web/src/components/sidebar-nav.tsx` — Current navigation structure (needs dashboard/monitoring entries)
- `apps/web/src/components/ui/` — 30+ shadcn/ui components available (no chart component yet — add via `npx shadcn@latest add chart`)

### Prior Phase Context
- `.planning/phases/02-stream-engine-camera-management/02-CONTEXT.md` — D-07 WebSocket status updates, D-12 SRS callbacks, D-14 internal HLS preview
- `.planning/phases/04-developer-experience/04-CONTEXT.md` — D-03 API key usage tracking (bandwidth/API data source for charts)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **StatusGateway (Socket.IO):** Real-time camera status broadcasting already implemented — extend for notifications and dashboard updates
- **SrsApiService:** getSummaries/getStreams/getClients methods ready for system metrics dashboard
- **FeatureKey enum:** MAP and AUDIT_LOG feature flags already defined — use FeatureGuard for conditional rendering
- **shadcn/ui components:** 30+ components (Card, Table, Badge, Tabs, etc.) — add chart component for dashboard charts
- **use-camera-status hook:** Frontend Socket.IO integration pattern to replicate for notifications

### Established Patterns
- Socket.IO with org-scoped rooms (`org:{orgId}`) for multi-tenant real-time data
- shadcn/ui + Tailwind CSS for all UI components
- NestJS modules with guards and interceptors for cross-cutting concerns
- BullMQ for background job processing (can use for notification delivery)

### Integration Points
- Sidebar navigation needs new Dashboard, Map, Audit Log menu items
- StatusGateway needs new Socket.IO namespaces or events for notifications and log streaming
- API key usage tracking (Phase 4) provides bandwidth/API usage data for charts
- Camera detail page (`apps/web/src/app/admin/cameras/[id]/page.tsx`) needs redesign

</code_context>

<specifics>
## Specific Ideas

- shadcn/ui charts (https://ui.shadcn.com/charts/area) for all chart components — area charts for bandwidth/usage over time, consistent with existing design system
- Full monitoring hub style dashboard — data-dense, NOC-like with cards + charts + system metrics + camera activity

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

### Reviewed Todos (not folded)
None — the matched todo (Redesign camera detail page) was folded into scope.

</deferred>

---

*Phase: 05-dashboard-monitoring*
*Context gathered: 2026-04-12*
