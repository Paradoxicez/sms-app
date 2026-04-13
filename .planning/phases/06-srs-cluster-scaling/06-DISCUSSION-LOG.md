# Phase 6: SRS Cluster & Scaling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 06-srs-cluster-scaling
**Areas discussed:** Node Topology, Config Generation, Load Balancing, Failover & Health

---

## Node Topology

### Edge node location

| Option | Description | Selected |
|--------|-------------|----------|
| Same server | Edge as Docker containers on same server — fits Docker Compose constraint | |
| Remote servers | Edge on separate servers — better scale but cross-network complexity | |
| Both (hybrid) | Support both local Docker and remote servers — flexible | ✓ |

**User's choice:** Hybrid — support both local Docker containers and remote SRS servers
**Notes:** User chose hybrid for flexibility despite added complexity

### Node registration

| Option | Description | Selected |
|--------|-------------|----------|
| Manual register | Admin fills form with node URL, name, role — simple and controlled | ✓ |
| Auto-discovery | Edge nodes self-register via agent/sidecar at boot — automatic but complex | |

**User's choice:** Manual register via web UI
**Notes:** None

---

## Config Generation

### Config delivery mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| API endpoint | Edge nodes pull config via GET /api/nodes/{id}/config — works for both local and remote | ✓ |
| Volume mount + SSH | Local uses volume, remote uses SSH/SCP — requires SSH credentials | |
| You decide | Claude chooses during planning | |

**User's choice:** API endpoint
**Notes:** None

### Config reload behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-reload all | Backend regenerates and triggers reload on all affected nodes automatically | ✓ |
| Manual reload per node | Admin clicks reload per node — more control but manual | |

**User's choice:** Auto-reload all nodes
**Notes:** None

---

## Load Balancing

### Edge selection metric

| Option | Description | Selected |
|--------|-------------|----------|
| Least viewers | Choose edge with fewest active viewers via SRS /api/v1/clients | ✓ |
| Least bandwidth | Choose by bandwidth usage from /api/v1/summaries | |
| Round-robin | Cycle through nodes — simple but ignores actual load | |
| Weighted (admin set) | Admin assigns weight per node — controlled but manual | |

**User's choice:** Least viewers
**Notes:** None

### Playback URL routing

| Option | Description | Selected |
|--------|-------------|----------|
| Direct to edge | Session URL points to edge HLS endpoint directly — no backend video traffic | ✓ |
| Backend proxy | Backend proxies video from edge to viewer — centralized security but heavy bandwidth | |

**User's choice:** Direct to edge
**Notes:** User requested detailed explanation before deciding. Key factor: bandwidth should not flow through API server, and Phase 3 on_play callback already validates JWT on SRS side.

---

## Failover & Health

### Health check interval

| Option | Description | Selected |
|--------|-------------|----------|
| 10 seconds | Poll every 10s, miss 3 = 30s to detect down | ✓ |
| 30 seconds | Poll every 30s, miss 3 = 90s to detect down | |
| You decide | Claude chooses during planning | |

**User's choice:** 10 seconds
**Notes:** None

### Viewer failover

| Option | Description | Selected |
|--------|-------------|----------|
| New session on retry | Viewer sees interruption, hls.js retries, client requests new session → gets different edge | ✓ |
| Transparent failover | Backend pushes new URL via WebSocket — seamless but complex, requires embed snippet changes | |

**User's choice:** New session on retry
**Notes:** None

### Node recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-recover | Health check passes → auto mark online → resume accepting sessions | ✓ |
| Manual re-enable | Admin must click to re-enable — safer but manual | |

**User's choice:** Auto-recover
**Notes:** None

---

## Claude's Discretion

- Prisma schema design for SrsNode table
- BullMQ job structure for health check polling
- SRS edge config template syntax
- Node management UI layout
- Error handling for unreachable nodes
- Migration path from single-SRS to origin

## Deferred Ideas

- Redesign camera detail page — UI todo, not cluster-related
- Geo-routing — v2 feature
- Auto-scaling edge containers — beyond v1 scope
- Edge-to-edge relay — not needed for v1
