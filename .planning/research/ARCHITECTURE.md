# Architecture Patterns

**Domain:** CCTV Streaming SaaS Platform (SRS-based)
**Researched:** 2026-04-08

## Recommended Architecture

### High-Level System Diagram

```
                                    +------------------+
                                    |   Nginx Reverse  |
                                    |     Proxy        |
                                    |  (ports 80/443)  |
                                    +--------+---------+
                                             |
                    +------------------------+------------------------+
                    |                        |                        |
            +-------+-------+      +--------+--------+     +---------+---------+
            |   Frontend    |      |   Backend API   |     |   SRS Built-in    |
            |   (Next.js)   |      |   (Node/Nest)   |     |   HTTP Server     |
            |   Port 3000   |      |   Port 4000     |     |   Port 8080       |
            +---------------+      +--------+--------+     |   (HLS delivery)  |
                                            |              +---------+---------+
                    +---+-------------------+---+---+                |
                    |       |           |       |   |                |
              +-----+--+ +--+----+ +---+---+ +-+---+-+    +---------+---------+
              |PostgreSQL| | Redis | |Stream | |MinIO  |    |       SRS        |
              |  Port    | |Port   | |Manager| |Port   |    |  Media Server    |
              |  5432    | | 6379  | |Service| | 9000  |    |  RTMP:1935       |
              +----------+ +-------+ +---+---+ +-------+    |  API:1985        |
                                         |                  |  HTTP:8080       |
                              +----------+----------+       +---------+--------+
                              |    FFmpeg Process    |                 |
                              |    Pool (child       |     RTMP push  |
                              |    processes)        +-------->-------+
                              |                      |
                              +----------+-----------+
                                         |
                                   RTSP pull from
                                   IP Cameras
```

### The Critical Insight: SRS Cannot Dynamically Add Streams via API

**This is the single most important architectural finding.** SRS's HTTP API is **read-only** for stream management. You cannot create, start, or stop streams via the SRS API. The RAW API (write endpoints) was removed after SRS v4 due to data conflicts and crashes.

SRS offers two mechanisms for RTSP ingestion:
1. **Config-based Ingest**: Define ingest blocks in the SRS config file, then trigger a reload via `/api/v1/raw?rpc=reload`. This reloads the entire config.
2. **External FFmpeg processes**: Spawn FFmpeg separately to pull RTSP and push RTMP into SRS.

**Recommendation: Use the FFmpeg Process Pool pattern (Option 2).** This is how Oryx (the official SRS management stack) works -- a Go backend spawns and manages FFmpeg processes independently of SRS. This gives full dynamic control without touching SRS config files.

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Nginx** | TLS termination, reverse proxy, route to frontend/API/HLS | Frontend, Backend, SRS HTTP |
| **Frontend (Next.js)** | Dashboard UI, camera management, monitoring | Backend API (REST + WebSocket) |
| **Backend API (NestJS)** | Business logic, auth, multi-tenant, API keys, policies | PostgreSQL, Redis, Stream Manager, SRS API |
| **Stream Manager** | FFmpeg process lifecycle, health monitoring, reconnect | FFmpeg processes, SRS API (read), Redis, Backend |
| **FFmpeg Processes** | RTSP pull, transcode/remux, RTMP push to SRS | IP Cameras (RTSP), SRS (RTMP) |
| **SRS** | RTMP ingest, HLS segmentation, HTTP delivery, callbacks | FFmpeg (receives RTMP), Nginx (serves HLS), Backend (callbacks) |
| **PostgreSQL** | Persistent data: orgs, users, cameras, policies, audit log | Backend API |
| **Redis** | Session cache, stream state, pub/sub for real-time updates | Backend API, Stream Manager |
| **MinIO** | Recording storage (HLS segments, DVR files) | Backend API, SRS (on_dvr callback) |

### Stream Manager: The Orchestration Layer

The Stream Manager is the key architectural component. It lives **inside the Backend API process** (as a NestJS module) but manages a pool of FFmpeg child processes. It is NOT a separate container.

```
Stream Manager Module (within Backend)
  |
  +-- FFmpegProcessPool
  |     +-- Process registry (camera_id -> PID, state, health)
  |     +-- Spawn: ffmpeg -rtsp_transport tcp -i rtsp://camera -c copy -f flv rtmp://srs/live/cam-{id}
  |     +-- Monitor: watch stderr, detect disconnects, track bitrate
  |     +-- Reconnect: exponential backoff on failure
  |
  +-- HealthChecker
  |     +-- Poll SRS /api/v1/streams every 5s
  |     +-- Compare expected streams vs actual
  |     +-- Restart missing streams
  |
  +-- StateStore (Redis)
        +-- stream:{camera_id} -> {status, pid, started_at, viewers, bitrate}
        +-- Pub/Sub channel for real-time dashboard updates
```

## Data Flow

### 1. RTSP to HLS Pipeline (The Core Flow)

```
Step 1: Camera Registration
  Developer -> POST /api/cameras {rtsp_url, name, site_id}
  Backend -> Validate org/permissions -> Store in PostgreSQL
  Backend -> Return camera object (status: "inactive")

Step 2: Stream Start
  Operator -> POST /api/cameras/:id/start
  Backend -> Stream Manager -> Spawn FFmpeg process:
    ffmpeg -rtsp_transport tcp \
           -i rtsp://camera-ip:554/stream \
           -c:v copy -c:a aac \
           -f flv rtmp://srs:1935/live/org-{orgId}-cam-{cameraId}

Step 3: SRS Receives RTMP
  FFmpeg pushes RTMP -> SRS accepts on rtmp://srs:1935/live/org-{orgId}-cam-{cameraId}
  SRS triggers on_publish callback -> Backend validates stream name
  SRS auto-generates HLS segments at /live/org-{orgId}-cam-{cameraId}.m3u8

Step 4: HLS Available
  SRS writes .m3u8 + .ts files to disk (or serves via built-in HTTP on :8080)
  Nginx proxies /hls/* -> SRS :8080

Step 5: Playback Request
  Developer's app -> POST /api/playback/sessions {camera_id, api_key}
  Backend -> Validate API key, check policy (TTL, domain, rate limit, concurrency)
  Backend -> Generate signed session token (JWT with exp, camera_id, allowed_origins)
  Backend -> Return: { url: "https://platform/hls/session/{token}/stream.m3u8" }

Step 6: Browser Plays HLS
  hls.js -> GET /hls/session/{token}/stream.m3u8
  Nginx -> Backend middleware validates token (not expired, origin matches allowlist)
  Nginx -> Proxy to SRS :8080/live/org-{orgId}-cam-{cameraId}.m3u8
  hls.js plays stream
```

### 2. Stream URL Naming Convention (Multi-Tenant Isolation)

```
RTMP stream key: live/org-{orgId}-cam-{cameraId}
HLS public URL:  /hls/session/{sessionToken}/stream.m3u8  (proxied, validated)
HLS internal:    SRS serves at /live/org-{orgId}-cam-{cameraId}.m3u8

The session token approach means:
- SRS streams are never directly exposed to end users
- Each playback request gets a unique, time-limited URL
- Backend controls all access through token validation
- SRS does not need to know about tenants or security
```

### 3. Recording Flow

```
Option A: SRS DVR (Recommended for v1)
  SRS config: dvr { enabled on; dvr_apply live/org-{orgId}-cam-{cameraId}; }
  Problem: Requires config changes per camera -> use on_dvr callback instead

Option B: HLS Segment Archival (Recommended)
  SRS config: on_hls callback -> POST to Backend
  Backend receives: { duration, file, url, m3u8, seq_no }
  Backend -> Copy .ts segment to MinIO: recordings/{orgId}/{cameraId}/{date}/{seq}.ts
  Backend -> Build recording index in PostgreSQL
  Playback: Backend generates time-range m3u8 from stored segments

Why Option B:
- No SRS config changes needed per camera
- Backend controls which cameras record (policy-driven)
- Segments stored in object storage with retention policies
- Recording start/stop is a Backend decision, not SRS config
```

### 4. Playback Session Security Flow

```
                        Developer's Web App
                              |
                    POST /api/playback/sessions
                    { camera_id, api_key }
                              |
                        Backend API
                    1. Validate API key (Redis cache)
                    2. Check org owns camera (PostgreSQL)
                    3. Check policy: TTL, domain allowlist, rate limit
                    4. Check viewer concurrency limit
                    5. Generate JWT: { cam, org, exp, origins, session_id }
                    6. Store session in Redis (for counting active viewers)
                    7. Return { hls_url, expires_at }
                              |
                    hls.js requests:
                    GET /hls/s/{jwt}/stream.m3u8
                              |
                    Nginx auth_request -> Backend
                    1. Decode JWT, check exp
                    2. Check Origin header vs allowed origins
                    3. Increment viewer count
                    4. If valid: proxy to SRS internal HLS
                    5. If invalid: 403
```

## Patterns to Follow

### Pattern 1: FFmpeg Process Pool with Supervision

**What:** Backend spawns and supervises FFmpeg child processes, one per active camera stream.
**When:** Every camera stream start/stop operation.
**Why:** SRS cannot dynamically ingest RTSP. The backend must manage FFmpeg externally.

```typescript
// stream-manager.service.ts
interface FFmpegProcess {
  cameraId: string;
  process: ChildProcess;
  state: 'starting' | 'running' | 'reconnecting' | 'stopped' | 'error';
  startedAt: Date;
  restartCount: number;
  lastError?: string;
}

class StreamManagerService {
  private processes: Map<string, FFmpegProcess> = new Map();

  async startStream(camera: Camera): Promise<void> {
    const streamKey = `org-${camera.orgId}-cam-${camera.id}`;
    const args = [
      '-rtsp_transport', 'tcp',
      '-i', camera.rtspUrl,
      '-c:v', 'copy',      // passthrough (no transcode)
      '-c:a', 'aac',       // ensure AAC for HLS compatibility
      '-f', 'flv',
      `rtmp://srs:1935/live/${streamKey}`,
    ];

    const proc = spawn('ffmpeg', args);
    // Monitor stderr for health/errors
    // Implement reconnect with exponential backoff
    // Update Redis state on status changes
    // Publish state changes via Redis pub/sub
  }

  async stopStream(cameraId: string): Promise<void> {
    const entry = this.processes.get(cameraId);
    if (entry) {
      entry.process.kill('SIGTERM');
      // Cleanup Redis state
    }
  }
}
```

### Pattern 2: SRS HTTP Callbacks for Event-Driven Architecture

**What:** SRS notifies the backend of stream lifecycle events via HTTP POST callbacks.
**When:** Stream published, unpublished, HLS segment created, recording completed.
**Why:** Backend needs to know stream state without polling. Callbacks are SRS's primary integration mechanism.

```
# SRS config
vhost __defaultVhost__ {
    http_hooks {
        enabled on;
        on_publish   http://backend:4000/hooks/srs/on-publish;
        on_unpublish http://backend:4000/hooks/srs/on-unpublish;
        on_play      http://backend:4000/hooks/srs/on-play;
        on_stop      http://backend:4000/hooks/srs/on-stop;
        on_hls       http://backend:4000/hooks/srs/on-hls;
        on_dvr       http://backend:4000/hooks/srs/on-dvr;
    }
}
```

Backend callback handler:
- `on_publish`: Validate stream name matches a registered camera, update status to "online"
- `on_unpublish`: Update camera status to "offline", trigger reconnect if unexpected
- `on_play`: Count viewers, enforce concurrency limits (return non-0 to reject)
- `on_stop`: Decrement viewer count
- `on_hls`: Archive segment to MinIO if recording is enabled for this camera
- `on_dvr`: Move completed recording file to permanent storage

### Pattern 3: Token-Based HLS URL Proxying

**What:** Never expose SRS HLS URLs directly. All playback goes through Nginx + Backend token validation.
**When:** Every HLS playback request.
**Why:** Security -- TTL, domain allowlist, viewer limits all enforced at proxy layer.

```nginx
# Nginx config
location /hls/s/ {
    auth_request /auth/hls;
    auth_request_set $upstream_stream $upstream_http_x_stream_path;
    proxy_pass http://srs:8080/$upstream_stream;
}

location = /auth/hls {
    internal;
    proxy_pass http://backend:4000/auth/validate-hls-token;
    proxy_set_header X-Original-URI $request_uri;
    proxy_set_header X-Original-Origin $http_origin;
}
```

### Pattern 4: Redis for Real-Time State and Pub/Sub

**What:** Redis stores ephemeral stream state and broadcasts changes via pub/sub.
**When:** Stream status changes, viewer counts update, bandwidth stats refresh.
**Why:** Dashboard needs real-time updates. PostgreSQL is too slow for high-frequency state changes.

```
Redis keys:
  stream:status:{cameraId}     -> {status, pid, startedAt, bitrate, fps}  (TTL: 30s, refreshed by health check)
  stream:viewers:{cameraId}    -> SET of session_ids                       (for concurrency counting)
  session:{token}              -> {cameraId, orgId, expiresAt, origins}    (TTL: matches session TTL)
  org:bandwidth:{orgId}        -> current bandwidth usage                  (TTL: 60s, rolling)

Redis pub/sub:
  channel:stream-events        -> {type: "status_change", cameraId, oldStatus, newStatus}
  channel:org:{orgId}:events   -> org-scoped events for dashboard
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: SRS Config File Manipulation for Dynamic Streams

**What:** Writing SRS config files and reloading to add/remove camera ingests.
**Why bad:** Config file manipulation is fragile, creates race conditions, requires file system access between containers, and was the exact pattern that caused the RAW API removal in SRS v4. SRS reload affects ALL streams, not just the new one.
**Instead:** Use external FFmpeg processes managed by the backend. SRS only needs a static config for HLS/callback settings.

### Anti-Pattern 2: Exposing SRS HLS URLs Directly

**What:** Returning `http://srs:8080/live/stream.m3u8` to the client.
**Why bad:** No access control, no TTL, no domain restriction, no viewer counting. Anyone with the URL has permanent access.
**Instead:** Proxy all HLS through Nginx with token validation middleware.

### Anti-Pattern 3: Using SRS Ingest for Camera Management

**What:** Using SRS's built-in ingest feature (config-based FFmpeg spawning).
**Why bad:** SRS ingest is config-driven and static. Adding a camera requires modifying the config and reloading, which restarts all ingests. No fine-grained lifecycle control, no health monitoring, no reconnect logic.
**Instead:** Backend manages FFmpeg processes directly with full lifecycle control.

### Anti-Pattern 4: Storing Stream State in PostgreSQL

**What:** Writing every status change, viewer count update, and bitrate measurement to PostgreSQL.
**Why bad:** High-frequency writes overwhelm the database. Stream state is ephemeral -- if the server restarts, all streams restart anyway.
**Instead:** Redis for ephemeral state, PostgreSQL for persistent configuration only.

### Anti-Pattern 5: One SRS Instance Per Tenant

**What:** Spawning separate SRS containers per organization for isolation.
**Why bad:** Massive resource waste. SRS is designed to handle many streams. Tenant isolation is a backend concern (stream naming, access control), not a media server concern.
**Instead:** Single SRS instance. Isolate at the stream key naming level (`org-{id}-cam-{id}`) and enforce access in the backend.

## Docker Compose Topology

```yaml
# docker-compose.yml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/certs:/etc/nginx/certs
    depends_on:
      - frontend
      - backend
      - srs

  frontend:
    build: ./frontend
    # Next.js
    expose:
      - "3000"
    environment:
      - API_URL=http://backend:4000

  backend:
    build: ./backend
    # NestJS + Stream Manager (FFmpeg pool)
    expose:
      - "4000"
    environment:
      - DATABASE_URL=postgresql://user:pass@postgres:5432/sms
      - REDIS_URL=redis://redis:6379
      - SRS_API_URL=http://srs:1985
      - SRS_RTMP_URL=rtmp://srs:1935
      - MINIO_ENDPOINT=minio:9000
    depends_on:
      - postgres
      - redis
      - srs
      - minio
    # FFmpeg must be installed in this container image

  srs:
    image: ossrs/srs:v6
    expose:
      - "1935"   # RTMP (internal only -- FFmpeg pushes here)
      - "1985"   # HTTP API (internal only -- backend queries)
      - "8080"   # HLS HTTP (proxied via Nginx)
    volumes:
      - ./srs/srs.conf:/usr/local/srs/conf/srs.conf
      - srs-hls:/usr/local/srs/objs/nginx/html  # HLS segments

  postgres:
    image: postgres:16-alpine
    volumes:
      - pg-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=sms
      - POSTGRES_USER=sms
      - POSTGRES_PASSWORD=changeme

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes:
      - minio-data:/data
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=changeme

volumes:
  pg-data:
  redis-data:
  minio-data:
  srs-hls:
```

### Container Count: 6 Services

| Service | Image | Purpose | Ports (external) |
|---------|-------|---------|-----------------|
| **nginx** | nginx:alpine | Reverse proxy, TLS, HLS auth | 80, 443 |
| **frontend** | Custom (Next.js) | Dashboard UI | None (proxied) |
| **backend** | Custom (NestJS + FFmpeg) | API, stream management, callbacks | None (proxied) |
| **srs** | ossrs/srs:v6 | Media server (RTMP in, HLS out) | None (internal) |
| **postgres** | postgres:16 | Persistent data | None (internal) |
| **redis** | redis:7 | Cache, pub/sub, ephemeral state | None (internal) |
| **minio** | minio/minio | Object storage for recordings | None (internal) |

**Key design decision:** SRS ports are NOT exposed externally. All HLS traffic goes through Nginx with token validation. RTMP is internal only (FFmpeg -> SRS within Docker network).

### SRS Configuration (Static)

```
listen              1935;
max_connections     1000;
daemon              off;
srs_log_tank        console;

http_api {
    enabled         on;
    listen          1985;
}

http_server {
    enabled         on;
    listen          8080;
    dir             ./objs/nginx/html;
}

vhost __defaultVhost__ {
    hls {
        enabled         on;
        hls_fragment    2;
        hls_window      10;
        hls_cleanup     on;
        hls_dispose     30;
        hls_wait_keyframe on;
        hls_path        ./objs/nginx/html;
    }

    http_hooks {
        enabled         on;
        on_publish      http://backend:4000/hooks/srs/on-publish;
        on_unpublish    http://backend:4000/hooks/srs/on-unpublish;
        on_play         http://backend:4000/hooks/srs/on-play;
        on_stop         http://backend:4000/hooks/srs/on-stop;
        on_hls          http://backend:4000/hooks/srs/on-hls;
    }
}
```

This config is **static** -- it never changes at runtime. All dynamic behavior (which cameras stream, access control) is handled by the backend + FFmpeg pool.

## Real-Time Dashboard Updates

```
WebSocket Connection Flow:
  Browser -> Nginx (ws:// upgrade) -> Backend WebSocket Gateway

Backend gathers real-time data from:
  1. Redis pub/sub (stream status changes from Stream Manager)
  2. SRS API polling (GET /api/v1/summaries for system stats)
  3. SRS API polling (GET /api/v1/streams for per-stream bitrate/fps)
  4. Redis keys (viewer counts, bandwidth)

Backend pushes to connected dashboard clients:
  - Camera status changes (online/offline/degraded)
  - Viewer count updates
  - Bandwidth per org
  - System metrics (CPU, memory from SRS summaries)

Implementation: NestJS WebSocket Gateway with Redis pub/sub adapter
```

## Multi-Tenant Data Model

```
Organization (tenant boundary)
  |
  +-- Users (role: admin, operator, developer, viewer)
  +-- API Keys (scoped to project or site)
  +-- Package (limits: max_cameras, max_viewers, max_bandwidth, storage_gb)
  |
  +-- Projects
       |
       +-- Sites
            |
            +-- Cameras
            |     +-- rtsp_url, name, location, status
            |     +-- stream_profile_id (FK)
            |     +-- policy_id (FK, nullable)
            |
            +-- Policies (TTL, domain allowlist, rate limits, viewer limits)
            +-- Stream Profiles (resolution, codec, fps, audio mode)

All queries include org_id in WHERE clause (row-level tenant isolation).
API keys carry org_id -- every request is scoped.
Stream keys include org_id -- streams from different orgs never collide.
```

## Scalability Considerations

| Concern | 10 cameras | 100 cameras | 1000 cameras |
|---------|-----------|-------------|-------------|
| FFmpeg processes | Single backend handles easily | Moderate CPU/memory; monitor | Need multiple backend instances or dedicated stream worker |
| SRS capacity | Trivial | Single SRS handles fine | May need SRS edge cluster |
| HLS storage | Negligible | ~10GB/day if all active | Need aggressive cleanup, S3/MinIO |
| Redis | Trivial | Trivial | Still fine |
| PostgreSQL | Trivial | Trivial | Moderate with audit logs |
| Bandwidth | Depends on viewers | May need CDN | Definitely need CDN |

**Scaling path for 1000+ cameras:**
1. Extract Stream Manager into a separate service (worker pattern)
2. Multiple worker instances, each managing a subset of cameras
3. Redis-based work distribution (camera -> assigned worker)
4. SRS origin-edge cluster for HLS delivery
5. CDN for external viewer traffic

## Suggested Build Order

Based on component dependencies:

```
Phase 1: Foundation
  PostgreSQL schema + Backend API skeleton + Auth
  (Everything depends on this)

Phase 2: SRS Integration Core
  SRS container + static config
  Stream Manager with FFmpeg pool (start/stop one camera)
  SRS callbacks (on_publish, on_unpublish)
  Basic HLS playback (no security yet, direct SRS URL)
  (Proves the core RTSP -> HLS pipeline works)

Phase 3: Security Layer
  Nginx reverse proxy
  Playback session tokens (JWT)
  HLS URL proxying with auth_request
  API key management
  (Now playback is secure)

Phase 4: Multi-Tenant
  Organization model, user roles
  Package/limits system
  Scoped API keys
  Policy system (TTL, domains, rate limits)
  (Platform becomes multi-tenant)

Phase 5: Dashboard & Monitoring
  Frontend (Next.js) with real-time WebSocket
  Camera status dashboard
  Stream health monitoring
  Viewer/bandwidth stats
  (Users can see what's happening)

Phase 6: Recordings
  on_hls callback for segment archival
  MinIO storage
  Recording playback (VOD m3u8 generation)
  Retention policies
  (Complete feature set)
```

**Dependency rationale:**
- Phase 2 depends on Phase 1 (need DB for camera records)
- Phase 3 depends on Phase 2 (need working streams to secure)
- Phase 4 depends on Phase 3 (multi-tenant needs security first)
- Phase 5 depends on Phase 2+4 (need streams and tenants to monitor)
- Phase 6 depends on Phase 2 (need working streams to record)
- Phases 5 and 6 can be parallelized

## Sources

- [SRS HTTP API Documentation (v6)](https://ossrs.net/lts/en-us/docs/v6/doc/http-api) - HIGH confidence
- [SRS HTTP Callback Documentation (v5)](https://ossrs.net/lts/en-us/docs/v5/doc/http-callback) - HIGH confidence
- [SRS HLS Documentation (v5)](https://ossrs.net/lts/en-us/docs/v5/doc/hls) - HIGH confidence
- [SRS Ingest Documentation (v6)](https://ossrs.net/lts/en-us/docs/v6/doc/ingest) - HIGH confidence
- [SRS DVR Documentation (v5)](https://ossrs.net/lts/en-us/docs/v5/doc/dvr) - HIGH confidence
- [Oryx (SRS Stack) - GitHub](https://github.com/ossrs/oryx) - HIGH confidence (reference architecture)
- [SRS RAW API removal discussion](https://github.com/ossrs/srs/issues/319) - HIGH confidence
- [SRS Docker Hub](https://hub.docker.com/r/ossrs/srs) - HIGH confidence
- [SRS GitHub Repository](https://github.com/ossrs/srs) - HIGH confidence
