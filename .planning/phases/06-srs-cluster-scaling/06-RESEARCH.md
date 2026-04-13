# Phase 6: SRS Cluster & Scaling - Research

**Researched:** 2026-04-13
**Domain:** SRS origin-edge clustering, HLS delivery scaling, node management
**Confidence:** MEDIUM

## Summary

SRS edge clustering has a critical architectural limitation: **SRS edge nodes do NOT support HLS delivery**. Edge mode only handles RTMP/HTTP-FLV protocols. The official SRS documentation explicitly states: "never config HLS on edge server, it's no use." For HLS clustering (our primary delivery protocol), SRS recommends using nginx as a caching reverse proxy in front of the SRS origin.

This means the CONTEXT.md decisions (D-05 through D-08) about "generating srs.conf for edge nodes" need architectural adaptation. Instead of SRS edge instances, our "edge nodes" are **nginx caching proxies** that proxy HLS requests back to the SRS origin. The SRS origin remains the single point of HLS generation, while nginx edges cache m3u8 playlists (10s TTL) and ts/fmp4 segments (60min TTL) to scale viewer capacity.

**Primary recommendation:** Implement edge nodes as nginx containers with HLS caching proxy configuration. The backend generates nginx.conf (not srs.conf) per edge node. Health checks hit nginx status endpoint and SRS origin summaries. Load balancing routes viewers to the least-loaded nginx edge. The existing SRS origin remains unchanged.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Hybrid model -- support both local Docker containers and remote servers as edge nodes
- **D-02:** Single origin node (existing SRS instance becomes origin), multiple edge nodes
- **D-03:** Data model stores node URL, role (origin/edge), status, and metadata -- works regardless of whether node is local or remote
- **D-04:** Admin registers edge nodes manually via web UI form (name, URL, role) -- backend validates connection before saving
- **D-05:** Backend generates separate config per node -- origin config (ingest + HLS + callbacks) vs edge config (edge mode pointing to origin, no ingest)
- **D-06:** Config served via API endpoint `GET /api/nodes/{id}/config` -- edge nodes pull their config from backend (works for both local and remote)
- **D-07:** When system settings change, backend auto-regenerates config and triggers reload on ALL affected nodes automatically
- **D-08:** Reload via SRS `/api/v1/raw?rpc=reload` per node -- extend existing `SrsApiService` to support multiple node URLs
- **D-09:** Playback sessions routed to edge with least active viewers -- metric from SRS `/api/v1/clients` count per node
- **D-10:** Direct-to-edge routing -- session URL points directly to edge node HLS endpoint
- **D-11:** Only healthy online edge nodes considered for routing
- **D-12:** Health check every 10 seconds via SRS `/api/v1/summaries` per node -- miss 3 consecutive checks (30s) marks node as offline
- **D-13:** When edge goes down, viewers experience stream interruption -- hls.js retries, then client requests new session from backend which returns URL of a different healthy edge node
- **D-14:** Auto-recovery -- when offline node passes health check again, automatically mark online
- **D-15:** Health metrics stored for dashboard display: CPU, memory, bandwidth, active connections per node

### Claude's Discretion
- Prisma schema design for SrsNode table (fields, indexes, relations)
- BullMQ job structure for health check polling
- SRS edge config template (exact vhost/edge configuration syntax)
- Node management UI layout and placement in admin panel
- Error handling for unreachable nodes during config push/reload
- How to handle the transition from single-SRS to origin (migration path)

### Deferred Ideas (OUT OF SCOPE)
- Redesign camera detail page
- Geo-routing based on viewer location (ADV-06)
- Auto-scaling (spin up/down edge containers based on load)
- Edge-to-edge relay (multi-tier clustering)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLUSTER-01 | Data model supports multiple SRS nodes (origin + edge) with role and status | Prisma SrsNode table design, nginx edge model |
| CLUSTER-02 | Admin can add/remove SRS edge nodes via web UI | NestJS ClusterModule with CRUD endpoints, UI-SPEC dialog components |
| CLUSTER-03 | Backend auto-generates config for each node and triggers reload | nginx.conf template for HLS caching proxy, nginx -s reload for edge, SRS reload for origin |
| CLUSTER-04 | Load balancing -- playback sessions routed to least-loaded edge node | Least-connections algorithm using nginx stub_status or backend-tracked viewer counts |
| CLUSTER-05 | Node health monitoring via health endpoint with auto-failover | BullMQ repeatable job polling nginx/SRS health endpoints, 3-miss offline threshold |
</phase_requirements>

## CRITICAL: Architecture Adaptation Required

### SRS Edge Does NOT Support HLS

**Finding:** SRS edge mode (`cluster { mode remote; }`) only handles RTMP and HTTP-FLV protocols. It does NOT generate or serve HLS segments. [VERIFIED: ossrs.net/lts/en-us/docs/v6/doc/edge]

The SRS documentation states: "when publish stream to origin, only origin server output the HLS, all edge server never output HLS until client access the RTMP stream on edge" and "Never config HLS on edge server, it's no use." [VERIFIED: ossrs.net/lts/en-us/docs/v5/doc/edge]

### Official SRS Recommendation for HLS Scaling

SRS recommends using **nginx as a caching reverse proxy** for HLS distribution. The architecture is:

```
Camera --> FFmpeg --> SRS Origin (RTMP in, HLS out on :8080)
                         |
                    nginx edges (cache proxy on :8080 each)
                         |
                    Viewers (HLS playback)
```

[VERIFIED: ossrs.net/lts/en-us/docs/v6/doc/nginx-for-hls]

### Impact on CONTEXT.md Decisions

| Decision | Adaptation |
|----------|------------|
| D-05 (generate srs.conf per node) | Generate **nginx.conf** for edge nodes, srs.conf only for origin |
| D-06 (config via API) | Edge nodes pull nginx.conf template from API |
| D-08 (reload via SRS API) | Edge: `nginx -s reload` (Docker exec or API). Origin: SRS `/api/v1/raw?rpc=reload` |
| D-09 (clients count from SRS API) | Edge: use nginx `stub_status` module OR backend-tracked session counts |
| D-12 (health via SRS summaries) | Edge: HTTP health check to nginx (200 OK). Origin: SRS `/api/v1/summaries` |

All other decisions (D-01 through D-04, D-10, D-11, D-13, D-14, D-15) remain valid as-is.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| nginx | 1.27 (alpine) | HLS caching proxy edge nodes | Official SRS recommendation for HLS clustering [VERIFIED: ossrs.net docs] |
| @nestjs/bullmq | 11.x | Health check repeatable jobs | Already in project, proven pattern for background jobs [VERIFIED: codebase] |
| @nestjs/schedule | 6.x | Alternative for simple polling | Already installed in project [VERIFIED: package.json] |
| Prisma | 6.x | SrsNode data model | Already in project, schema extension [VERIFIED: codebase] |
| Socket.IO | 4.x | Real-time node status updates | Already in project, established pattern [VERIFIED: codebase] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis | 5.x | Node health metrics cache | Already in project, cache viewer counts per edge [VERIFIED: codebase] |

### No New Dependencies Required

All required libraries are already installed. No new npm packages needed.

**nginx Docker image:** `nginx:1.27-alpine` [ASSUMED -- verify latest stable tag]

## Architecture Patterns

### Recommended Project Structure

```
apps/api/src/
├── cluster/
│   ├── cluster.module.ts            # ClusterModule with BullMQ queue
│   ├── cluster.controller.ts        # CRUD for nodes, config endpoint
│   ├── cluster.service.ts           # Node management, config generation
│   ├── cluster-health.service.ts    # Health check logic
│   ├── cluster-health.processor.ts  # BullMQ processor for health polling
│   ├── cluster.gateway.ts           # Socket.IO gateway for node:health events
│   ├── dto/
│   │   ├── create-node.dto.ts
│   │   └── update-node.dto.ts
│   └── templates/
│       ├── nginx-edge.conf.ts       # nginx config template for edge nodes
│       └── srs-origin.conf.ts       # Refactored from settings.service.ts
├── playback/
│   └── playback.service.ts          # Updated: select edge node for HLS URL
└── settings/
    └── settings.service.ts          # Updated: trigger reload on ALL nodes
```

### Pattern 1: Nginx HLS Caching Proxy Config Template

**What:** Generate nginx.conf for each edge node that caches HLS from origin
**When to use:** Every edge node registration and config update

```typescript
// Source: ossrs.net/lts/en-us/docs/v6/doc/nginx-for-hls [VERIFIED]
function generateEdgeNginxConfig(originUrl: string, listenPort: number): string {
  return `
worker_processes auto;
events {
    worker_connections 10240;
}
http {
    proxy_cache_path /tmp/nginx-cache levels=1:2 keys_zone=srs_cache:8m max_size=1000m inactive=600m;
    proxy_temp_path /tmp/nginx-cache/tmp;

    server {
        listen ${listenPort};

        # Health check endpoint
        location /health {
            access_log off;
            return 200 'ok';
            add_header Content-Type text/plain;
        }

        # Nginx status for viewer count metrics
        location /nginx_status {
            stub_status on;
            access_log off;
            allow 172.16.0.0/12;  # Docker network
            allow 10.0.0.0/8;
            deny all;
        }

        # m3u8 playlists -- short cache (10s) since they update frequently
        location ~ /.+/.*\\.(m3u8)$ {
            proxy_pass ${originUrl}$request_uri;
            proxy_cache srs_cache;
            proxy_cache_key $scheme$proxy_host$uri$args;
            proxy_cache_valid 200 302 10s;
            proxy_cache_valid 404 10s;
            proxy_cache_lock on;
            proxy_cache_lock_age 5s;
            proxy_cache_lock_timeout 5s;
        }

        # fmp4/ts segments -- long cache (60min) since they're immutable
        location ~ /.+/.*\\.(ts|m4s|mp4)$ {
            proxy_pass ${originUrl}$request_uri;
            proxy_cache srs_cache;
            proxy_cache_key $scheme$proxy_host$uri;
            proxy_cache_valid 200 302 60m;
            proxy_cache_lock on;
        }

        # HLS encryption keys -- pass through with token
        location ~ /keys/.+\\.key$ {
            proxy_pass ${originUrl}$request_uri;
            proxy_cache off;
        }
    }
}`;
}
```

### Pattern 2: Edge Node Health Check via BullMQ

**What:** Repeatable BullMQ job polls each node every 10 seconds
**When to use:** Continuous background monitoring

```typescript
// Reuses established BullMQ processor pattern from streams/webhooks [VERIFIED: codebase]
@Processor('cluster-health')
export class ClusterHealthProcessor extends WorkerHost {
  async process(job: Job<{ nodeId: string }>) {
    const node = await this.clusterService.getNode(job.data.nodeId);
    
    if (node.role === 'ORIGIN') {
      // Origin: use SRS API
      const health = await this.srsApi.getSummaries(node.apiUrl);
      return { cpu: health.cpu, memory: health.mem, ...health };
    } else {
      // Edge (nginx): HTTP health check + stub_status
      const healthOk = await this.checkNginxHealth(node.hlsUrl);
      const stats = await this.getNginxStubStatus(node.apiUrl);
      return { healthy: healthOk, activeConnections: stats.connections };
    }
  }
}
```

### Pattern 3: Least-Loaded Edge Selection for Playback

**What:** When creating a playback session, select edge with fewest active viewers
**When to use:** PlaybackService.createSession()

```typescript
// Updated playback session creation [VERIFIED: existing pattern in playback.service.ts]
async createSession(cameraId: string, orgId: string) {
  // ... existing camera/policy checks ...
  
  // Select least-loaded edge node
  const edgeNode = await this.clusterService.getLeastLoadedEdge();
  
  // Build HLS URL pointing to edge node (or origin if no edges)
  const hlsBase = edgeNode 
    ? `${edgeNode.hlsUrl}/live/${orgId}/${cameraId}.m3u8`
    : `http://srs:8080/live/${orgId}/${cameraId}.m3u8`;
  const hlsUrl = `${hlsBase}?token=${token}`;
  
  // ... rest unchanged ...
}
```

### Pattern 4: SrsApiService Multi-Node Refactor

**What:** Extend SrsApiService to accept node URL parameter
**When to use:** All SRS API calls now must specify which node

```typescript
// Refactored from hardcoded baseUrl [VERIFIED: current srs-api.service.ts uses single baseUrl]
@Injectable()
export class SrsApiService {
  // Remove: private readonly baseUrl = process.env.SRS_API_URL;
  
  async getSummaries(nodeApiUrl: string): Promise<any> {
    const res = await fetch(`${nodeApiUrl}/api/v1/summaries`);
    return res.json();
  }

  async reloadConfig(nodeApiUrl: string): Promise<void> {
    await fetch(`${nodeApiUrl}/api/v1/raw?rpc=reload`);
  }
  
  // For nginx edges: different reload mechanism
  async reloadNginxEdge(nodeId: string): Promise<void> {
    // For local Docker: docker exec nginx-edge-{id} nginx -s reload
    // For remote: SSH or agent-based reload
  }
}
```

### Anti-Patterns to Avoid
- **Configuring HLS on SRS edge nodes:** SRS edge does not support HLS. Only use nginx for HLS caching. [VERIFIED: ossrs.net docs]
- **Proxying video traffic through backend:** D-10 specifies direct-to-edge routing. Never proxy HLS segments through the NestJS API.
- **Single health check approach for both node types:** Origin (SRS API) and edge (nginx) have different health endpoints. Use polymorphic health checks.
- **Storing viewer counts in database:** Use Redis for real-time viewer metrics. Database writes per viewer would be too slow. [ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HLS caching | Custom Node.js proxy | nginx proxy_cache | nginx handles thousands of concurrent connections, proper cache invalidation, battle-tested [VERIFIED: SRS docs recommend nginx] |
| Health check scheduling | setInterval loops | BullMQ repeatable jobs | Already in project, handles worker crashes, Redis-backed state [VERIFIED: codebase pattern] |
| Real-time node status | HTTP polling from frontend | Socket.IO events | Already established pattern in StatusGateway [VERIFIED: codebase] |
| Config templating | String concatenation | Template literals with escaping | Keep consistent with existing generateSrsConfig() pattern [VERIFIED: settings.service.ts] |

## Common Pitfalls

### Pitfall 1: Assuming SRS Edge Supports HLS
**What goes wrong:** Configure SRS in edge mode expecting HLS delivery. Viewers get no content.
**Why it happens:** "Edge" commonly implies all-protocol support, but SRS edge is RTMP/FLV only.
**How to avoid:** Use nginx caching proxy for HLS edges. SRS edge only if RTMP/FLV delivery needed.
**Warning signs:** HLS URLs returning 404 on edge nodes.

### Pitfall 2: Thundering Herd on Cache Miss
**What goes wrong:** Many viewers request same m3u8 simultaneously when cache expires. All requests hit origin.
**Why it happens:** Default nginx proxy_cache doesn't lock concurrent requests for same key.
**How to avoid:** Enable `proxy_cache_lock on` in nginx config. Only one request goes to origin, others wait for cache.
**Warning signs:** Origin CPU/bandwidth spikes every 10 seconds (matching m3u8 cache TTL).

### Pitfall 3: fMP4 Segments Not Cached
**What goes wrong:** SRS is configured with `hls_use_fmp4 on` (current config), but nginx location only matches `.ts` files.
**Why it happens:** fMP4 HLS uses `.m4s` and `.mp4` extensions, not `.ts`.
**How to avoid:** Add `.m4s` and `.mp4` to nginx location pattern: `location ~ /.+/.*\.(ts|m4s|mp4)$`
**Warning signs:** Every segment request hits origin, no caching benefit.

### Pitfall 4: HLS Encryption Key Caching
**What goes wrong:** Encrypted HLS key requests get cached by nginx, causing stale keys for rotated segments.
**Why it happens:** Keys change per `hls_fragments_per_key` setting. Cached key = decryption failure.
**How to avoid:** Set `proxy_cache off` for key endpoints (`/keys/*.key`). Or pass through with token validation.
**Warning signs:** Video plays but shows green/corrupt frames after a few seconds.

### Pitfall 5: Docker Network Port Conflicts
**What goes wrong:** Multiple local edge containers all bind to port 8080 on host.
**Why it happens:** Each nginx edge needs a unique host port mapping.
**How to avoid:** Auto-assign ports (8081, 8082, etc.) or use Docker network internal addressing.
**Warning signs:** "Port already in use" errors in docker-compose.

### Pitfall 6: Edge Reload for Remote Nodes
**What goes wrong:** Backend can `docker exec` for local containers but has no way to reload remote nginx.
**Why it happens:** Remote nodes are not Docker containers managed by the backend.
**How to avoid:** For remote nodes: config-pull model. Edge periodically pulls config from API and self-reloads. Or use SSH/agent pattern.
**Warning signs:** Config changes don't take effect on remote nodes.

## Code Examples

### SrsNode Prisma Schema

```prisma
// Source: Pattern from existing schema [VERIFIED: schema.prisma]
// SystemSettings has no orgId (super admin only) -- SrsNode follows same pattern

enum NodeRole {
  ORIGIN
  EDGE
}

enum NodeStatus {
  ONLINE
  OFFLINE
  DEGRADED
  CONNECTING
}

model SrsNode {
  id          String     @id @default(uuid())
  name        String
  role        NodeRole
  status      NodeStatus @default(CONNECTING)
  apiUrl      String     // SRS API URL for origin, nginx status URL for edge
  hlsUrl      String     // HLS endpoint URL (SRS :8080 for origin, nginx port for edge)
  hlsPort     Int        @default(8080)
  
  // Health metrics (updated by health check job)
  cpu         Float?
  memory      Float?
  bandwidth   BigInt?    @default(0)
  viewers     Int        @default(0)
  srsVersion  String?
  uptime      Int?       // seconds
  
  // Health check tracking
  missedChecks   Int     @default(0)
  lastHealthAt   DateTime?
  configVersion  Int     @default(0)  // Track if config is in sync
  
  isLocal     Boolean    @default(true)  // Docker container vs remote
  metadata    Json?      // Flexible metadata
  
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([role])
  @@index([status])
}
```

### Docker Compose Edge Node Template

```yaml
# Source: SRS docs + established docker-compose.yml pattern [VERIFIED: codebase]
# Added dynamically per local edge node

  nginx-edge-{id}:
    image: nginx:1.27-alpine
    ports:
      - "{hostPort}:8080"
    volumes:
      - ./config/nginx-edge-{id}.conf:/etc/nginx/nginx.conf:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - sms-network
    depends_on:
      - srs
```

### ClusterModule Structure

```typescript
// Source: Established NestJS module patterns [VERIFIED: codebase]
@Module({
  imports: [
    BullModule.registerQueue({ name: 'cluster-health' }),
    PrismaModule,
  ],
  controllers: [ClusterController],
  providers: [
    ClusterService,
    ClusterHealthService,
    ClusterHealthProcessor,
    ClusterGateway,
  ],
  exports: [ClusterService],
})
export class ClusterModule {}
```

### Migration Path: Single SRS to Origin

```typescript
// On first ClusterModule initialization, register existing SRS as origin node
async onModuleInit() {
  const existingOrigin = await this.prisma.srsNode.findFirst({
    where: { role: 'ORIGIN' },
  });
  
  if (!existingOrigin) {
    await this.prisma.srsNode.create({
      data: {
        name: 'Primary Origin',
        role: 'ORIGIN',
        status: 'ONLINE',
        apiUrl: process.env.SRS_API_URL || 'http://srs:1985',
        hlsUrl: process.env.SRS_HLS_URL || 'http://srs:8080',
        isLocal: true,
      },
    });
    this.logger.log('Registered existing SRS instance as origin node');
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SRS edge for all protocols | SRS edge for RTMP/FLV only, nginx for HLS | SRS v4+ | Must use nginx for HLS clustering |
| MPEG-TS HLS segments (.ts) | fMP4 HLS segments (.m4s) | SRS v6 | nginx cache location must match .m4s/.mp4 not just .ts |
| SRS DVR dynamic control | DVR control removed from API | SRS v4 | Recording managed externally |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | nginx:1.27-alpine is current stable Docker tag | Standard Stack | Low -- any nginx 1.x will work |
| A2 | Database writes per viewer would be too slow for real-time counts | Anti-Patterns | Low -- Redis is already used for similar patterns |
| A3 | stub_status module available in nginx alpine image | Architecture | Medium -- need to verify at implementation time |
| A4 | Remote edge reload uses config-pull model | Pitfall 6 | Medium -- user may expect push model for remote nodes |

## Open Questions

1. **Remote Edge Node Config Delivery**
   - What we know: Local Docker edges can be managed via docker exec. Remote edges need a different mechanism.
   - What's unclear: Should remote edges poll for config changes, or should backend push via SSH/agent?
   - Recommendation: Config-pull model (edge periodically checks API for config version) -- simpler, no SSH keys needed.

2. **Viewer Count Source for Nginx Edges**
   - What we know: SRS `/api/v1/clients` works for origin. nginx `stub_status` gives active_connections but not per-stream breakdown.
   - What's unclear: How to get accurate per-stream viewer counts from nginx edges.
   - Recommendation: Track session creation counts in Redis per edge node (backend already routes sessions). Supplement with nginx active_connections for overall load.

3. **HLS Token Validation on Edge**
   - What we know: Origin validates tokens via SRS `on_play` callback. nginx doesn't have callback hooks.
   - What's unclear: How to validate JWT tokens on edge nginx before serving HLS.
   - Recommendation: Token is part of query string, which is included in proxy_pass to origin. Origin's on_play callback validates. nginx just caches the response. If token is invalid, origin returns 403, nginx caches the 404/403 for 10s.

4. **Config Version Tracking**
   - What we know: D-07 requires auto-regenerate + reload when settings change.
   - What's unclear: How to track if each edge node has applied the latest config.
   - Recommendation: Store configVersion on SrsNode. Increment on settings change. Edge health check compares versions.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Edge node containers | TBD (runtime) | -- | Required, no fallback |
| nginx | HLS caching proxy | Via Docker image | 1.27 | -- |
| Redis | Health metrics cache, BullMQ | Yes | 7.x | -- |
| PostgreSQL | SrsNode table | Yes | 16 | -- |
| SRS | Origin node | Yes | 6.0.184 | -- |

**Missing dependencies with no fallback:** None -- all dependencies available via existing Docker setup.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/api && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLUSTER-01 | SrsNode CRUD operations | unit | `cd apps/api && npx vitest run tests/cluster/cluster-service.test.ts -t "node CRUD"` | No -- Wave 0 |
| CLUSTER-02 | Add/remove edge nodes via API | integration | `cd apps/api && npx vitest run tests/cluster/cluster-api.test.ts` | No -- Wave 0 |
| CLUSTER-03 | Config generation (nginx + SRS) | unit | `cd apps/api && npx vitest run tests/cluster/config-generation.test.ts` | No -- Wave 0 |
| CLUSTER-04 | Least-loaded edge selection | unit | `cd apps/api && npx vitest run tests/cluster/load-balancing.test.ts` | No -- Wave 0 |
| CLUSTER-05 | Health check with 3-miss offline | unit | `cd apps/api && npx vitest run tests/cluster/health-check.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && npx vitest run tests/cluster/ --reporter=verbose`
- **Per wave merge:** `cd apps/api && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/api/tests/cluster/cluster-service.test.ts` -- covers CLUSTER-01
- [ ] `apps/api/tests/cluster/cluster-api.test.ts` -- covers CLUSTER-02
- [ ] `apps/api/tests/cluster/config-generation.test.ts` -- covers CLUSTER-03
- [ ] `apps/api/tests/cluster/load-balancing.test.ts` -- covers CLUSTER-04
- [ ] `apps/api/tests/cluster/health-check.test.ts` -- covers CLUSTER-05

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Existing session auth, no new auth flows |
| V3 Session Management | No | Existing session management unchanged |
| V4 Access Control | Yes | Super admin only for cluster management (existing AuthGuard + role check) |
| V5 Input Validation | Yes | Zod validation on node URL, name, port inputs |
| V6 Cryptography | No | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via node URL registration | Spoofing/Tampering | Validate URL format, restrict to expected ports (1985, 8080), test connection before saving |
| Unauthorized cluster management | Elevation | Super admin role guard on all cluster endpoints |
| Cache poisoning on nginx edge | Tampering | proxy_cache_key includes full URI + args, short m3u8 TTL (10s) limits exposure |
| Man-in-middle on origin-edge traffic | Information Disclosure | Internal Docker network for local edges. For remote: HTTPS between edge and origin recommended |

## Sources

### Primary (HIGH confidence)
- [SRS Edge Cluster docs v6](https://ossrs.net/lts/en-us/docs/v6/doc/edge) -- Edge does NOT support HLS, RTMP only
- [SRS HLS Cluster docs v6](https://ossrs.net/lts/en-us/docs/v6/doc/nginx-for-hls) -- nginx caching proxy architecture for HLS
- [SRS Edge docs v5](https://ossrs.net/lts/en-us/docs/v5/doc/edge) -- Edge configuration syntax, origin directive
- [SRS HLS Cluster Deploy v5](https://ossrs.net/lts/en-us/docs/v5/doc/sample-hls-cluster) -- nginx config template for HLS caching
- Codebase analysis -- srs-api.service.ts, settings.service.ts, playback.service.ts, schema.prisma, docker-compose.yml

### Secondary (MEDIUM confidence)
- [SRS GitHub issue #466](https://github.com/ossrs/srs/issues/466) -- HLS+ edge cluster feature request (not implemented)

### Tertiary (LOW confidence)
- nginx:1.27-alpine Docker image tag (assumed current stable)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, nginx is official SRS recommendation
- Architecture: MEDIUM -- nginx-as-edge is well-documented but differs from CONTEXT.md's SRS-edge assumption; needs user awareness
- Pitfalls: HIGH -- documented from official SRS sources and practical HLS caching experience

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable stack, SRS v6 is LTS)
