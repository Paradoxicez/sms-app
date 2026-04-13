# Phase 6: SRS Cluster & Scaling - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-node SRS origin/edge clustering with load balancing, auto-failover, and node management UI. Platform can scale HLS delivery across multiple SRS nodes. No new ingest features, no recording changes, no playback token changes — those are other phases.

</domain>

<decisions>
## Implementation Decisions

### Node Topology
- **D-01:** Hybrid model — support both local Docker containers and remote SRS servers as edge nodes
- **D-02:** Single origin node (existing SRS instance becomes origin), multiple edge nodes
- **D-03:** Data model stores node URL, role (origin/edge), status, and metadata — works regardless of whether node is local or remote
- **D-04:** Admin registers edge nodes manually via web UI form (name, URL, role) — backend validates connection before saving

### Config Generation & Delivery
- **D-05:** Backend generates separate srs.conf per node — origin config (ingest + HLS + callbacks) vs edge config (edge mode pointing to origin, no ingest)
- **D-06:** Config served via API endpoint `GET /api/nodes/{id}/config` — edge nodes pull their config from backend (works for both local and remote)
- **D-07:** When system settings change (e.g. HLS fragment size via UI), backend auto-regenerates config and triggers reload on ALL affected nodes automatically
- **D-08:** Reload via SRS `/api/v1/raw?rpc=reload` per node — extend existing `SrsApiService` to support multiple node URLs

### Load Balancing
- **D-09:** Playback sessions routed to edge with least active viewers — metric from SRS `/api/v1/clients` count per node
- **D-10:** Direct-to-edge routing — session URL points directly to edge node HLS endpoint (e.g. `https://edge2:8080/live/cam123.m3u8?token=xxx`), no backend proxy for video traffic
- **D-11:** Only healthy online edge nodes considered for routing — offline/degraded nodes excluded from selection

### Failover & Health Monitoring
- **D-12:** Health check every 10 seconds via SRS `/api/v1/summaries` per node — miss 3 consecutive checks (30s) marks node as offline
- **D-13:** When edge goes down, viewers experience stream interruption — hls.js retries, then client requests new session from backend which returns URL of a different healthy edge node (new session on retry pattern)
- **D-14:** Auto-recovery — when offline node passes health check again, automatically mark online and resume accepting new sessions
- **D-15:** Health metrics stored for dashboard display: CPU, memory, bandwidth, active connections per node

### Claude's Discretion
- Prisma schema design for SrsNode table (fields, indexes, relations)
- BullMQ job structure for health check polling
- SRS edge config template (exact vhost/edge configuration syntax)
- Node management UI layout and placement in admin panel
- Error handling for unreachable nodes during config push/reload
- How to handle the transition from single-SRS to origin (migration path)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SRS Clustering
- `CLAUDE.md` §Edge Clustering — Origin-edge architecture, edge auto-reconnect, multi-origin failover
- `CLAUDE.md` §SRS HTTP API Surface — `/api/v1/summaries`, `/api/v1/streams`, `/api/v1/clients` endpoints for health and load metrics
- `CLAUDE.md` §HLS Configuration — Fragment, window, encryption settings that must be replicated across nodes
- `CLAUDE.md` §Docker Setup — Port mappings (1935, 1985, 8080, 8000, 10080) needed per node

### Requirements
- `.planning/REQUIREMENTS.md` §SRS Cluster — CLUSTER-01 through CLUSTER-05 requirements

### Existing SRS Integration (Phase 2)
- `apps/api/src/srs/srs-api.service.ts` — Current single-node SRS API client (must extend for multi-node)
- `apps/api/src/settings/settings.service.ts` — Current srs.conf generation (must extend for per-node configs)
- `apps/api/src/srs/srs-callback.controller.ts` — SRS callbacks (origin keeps callbacks, edge may need subset)
- `docker-compose.yml` — Current single SRS container setup

### Playback Integration (Phase 3)
- `.planning/phases/03-playback-security/03-CONTEXT.md` — JWT playback tokens, `on_play` callback validation (edge nodes must also validate)

### Phase 2 Decisions
- `.planning/phases/02-stream-engine-camera-management/02-CONTEXT.md` — SRS integration patterns, FFmpeg process management, settings model

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/srs/srs-api.service.ts` — SRS API client with `getVersions()`, `getStreams()`, `getSummaries()`, `getClients()`, `reloadConfig()` — needs refactoring to accept node URL parameter instead of single hardcoded `baseUrl`
- `apps/api/src/settings/settings.service.ts` — `generateSrsConfig()` generates origin-style config — needs edge config variant and per-node generation
- `apps/api/src/status/status.gateway.ts` — WebSocket gateway pattern for real-time updates — reusable for node status broadcasting
- `apps/api/src/srs/srs-callback.controller.ts` — SRS callback handlers — origin keeps these, edge callbacks may route differently

### Established Patterns
- BullMQ for background jobs (FFmpeg process management in Phase 2) — reuse for health check polling
- WebSocket (Socket.IO) for real-time status updates (camera status in Phase 2/5) — reuse for node status
- `@Global()` module pattern for cross-cutting services (TenancyModule, FeaturesModule)
- SystemSettings table for system-wide config — SrsNode will be a new system-level table (no org_id, super admin only)

### Integration Points
- `apps/api/src/playback/` — Session creation must be updated to select edge node for HLS URL
- `apps/api/src/app.module.ts` — New ClusterModule registers here
- `docker-compose.yml` — Edge containers added here for local nodes
- `apps/web/src/app/admin/` — Node management UI page in admin panel

</code_context>

<specifics>
## Specific Ideas

- Direct-to-edge means embed code from Phase 4 continues to work — client just gets a different edge URL each session
- SRS `on_play` callback on edge nodes validates JWT tokens same as origin (Phase 3 pattern)
- Health check data feeds into Phase 5 dashboard (DASH-04 system metrics) — node stats display alongside existing CPU/memory metrics

</specifics>

<deferred>
## Deferred Ideas

- **Redesign camera detail page** — UI todo, not related to SRS clustering (reviewed, not folded)
- Geo-routing based on viewer location — v2 feature (ADV-06 multi-region deployment)
- Auto-scaling (spin up/down edge containers based on load) — beyond v1 Docker Compose scope
- Edge-to-edge relay (multi-tier clustering) — not needed for v1 scale

</deferred>

---

*Phase: 06-srs-cluster-scaling*
*Context gathered: 2026-04-13*
