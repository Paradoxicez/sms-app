# Stack Research

**Domain:** CCTV Streaming SaaS Platform
**Researched:** 2026-04-08
**Confidence:** HIGH (SRS core), MEDIUM (web app stack)

---

## SRS Deep Dive (Stream Engine)

### Version and Deployment

| Property | Value | Notes |
|----------|-------|-------|
| Version | v6.0-r0 (v6.0.184) | Stable release, Dec 2024. Docker tag: `ossrs/srs:6` |
| Language | ANSI C++ (ST coroutines) | ~170K lines of code |
| License | MIT | Fully open source |
| Docker Image | `ossrs/srs:6` | Also: `ossrs/srs:v6.0-r0`, `ossrs/srs:6.0.184` |

### 1. Input (Ingest) Protocols

| Protocol | Native Support | How It Works |
|----------|---------------|--------------|
| RTMP | YES (native) | Cameras/encoders push RTMP directly to SRS on port 1935 |
| SRT | YES (native) | Cameras push SRT to SRS on port 10080/udp |
| WebRTC (WHIP) | YES (native) | Browsers/apps push via WHIP endpoint |
| GB28181 | PARTIAL | SIP signaling removed from SRS core; media-only via separate repo |
| RTSP | NO (removed) | Must use FFmpeg ingest to pull RTSP and push as RTMP to SRS |
| HTTP-TS | YES (native) | HTTP-based TS stream ingest |

**CRITICAL: RTSP is NOT natively supported by SRS.** RTSP push was deprecated and removed. The official pattern is:

```
IP Camera (RTSP) --> FFmpeg (pull RTSP, push RTMP) --> SRS (port 1935)
```

SRS has a built-in **Ingest** module that manages FFmpeg processes for you. You configure it in `srs.conf` and SRS spawns/manages FFmpeg child processes automatically.

### 2. Output (Delivery) Protocols

| Protocol | Native Support | Port | Use Case |
|----------|---------------|------|----------|
| HLS | YES | 8080 (HTTP) | Primary delivery for browsers (our target) |
| HTTP-FLV | YES | 8080 (HTTP) | Low-latency browser playback via FLV.js |
| HTTP-TS | YES | 8080 (HTTP) | TS over HTTP |
| WebRTC (WHEP) | YES | 8000/udp | Sub-second latency playback |
| RTMP | YES | 1935 | Legacy player support |
| MPEG-DASH | YES | 8080 (HTTP) | Alternative to HLS |
| SRT | YES | 10080/udp | Low-latency output |

### 3. Codec Support (v6)

| Codec | Support | Notes |
|-------|---------|-------|
| H.264/AVC | YES | All protocols |
| H.265/HEVC | YES (v6 new) | All major protocols -- RTMP, HLS, HTTP-FLV, SRT |
| AV1 | YES | Experimental |
| VP9 | YES | WebRTC |
| AAC | YES | Default audio codec |
| Opus | YES | WebRTC audio |
| G.711 | YES | VoIP/telephony audio |
| MP3 | YES | HLS audio |

### 4. HTTP API Surface

**Listen port:** 1985 (configurable)

**System Information:**

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/api/v1/versions` | GET | SRS version (major, minor, revision) |
| `/api/v1/summaries` | GET | System summary: CPU, memory, network, load, uptime |
| `/api/v1/rusages` | GET | Process resource usage stats |
| `/api/v1/self_proc_stats` | GET | SRS process statistics |
| `/api/v1/system_proc_stats` | GET | System-wide process statistics |
| `/api/v1/meminfos` | GET | System memory information |
| `/api/v1/features` | GET | List of enabled features |

**Stream and Client Management:**

| Endpoint | Method | Parameters | Returns |
|----------|--------|-----------|---------|
| `/api/v1/vhosts` | GET | - | All virtual hosts |
| `/api/v1/vhosts/{id}` | GET | vhost ID | Specific vhost details |
| `/api/v1/streams` | GET | `?start=N&count=N` | Active streams (paginated, default 10) |
| `/api/v1/streams/{id}` | GET | stream ID | Stream details (codec, bitrate, resolution, clients) |
| `/api/v1/clients` | GET | `?start=N&count=N` | Connected clients (paginated) |
| `/api/v1/clients/{id}` | GET | client ID | Client details |
| `/api/v1/clients/{id}` | DELETE | client ID | Kick/disconnect a client |

**WebRTC Endpoints:**

| Endpoint | Method | Content-Type | Purpose |
|----------|--------|-------------|---------|
| `/rtc/v1/whip/?app={app}&stream={stream}` | POST | application/sdp | WebRTC publish (WHIP) |
| `/rtc/v1/whep/?app={app}&stream={stream}` | POST | application/sdp | WebRTC play (WHEP) |

**Control Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/raw?rpc=reload` | GET | Hot-reload configuration (like `killall -1 srs`) |

**Authentication:** Basic HTTP Auth supported via config (`username:password`).

**API Rate:** Supports ~370 requests/second.

**IMPORTANT LIMITATION:** The HTTP RAW API (which allowed dynamic DVR control, stream management) was **removed in v4+** due to instability. You cannot dynamically start/stop recording or add streams via API alone. Configuration changes require editing `srs.conf` and calling `/api/v1/raw?rpc=reload`.

### 5. RTSP Ingest Pattern (How Cameras Connect)

SRS does NOT speak RTSP. The pattern is:

```
[IP Camera] --RTSP--> [FFmpeg] --RTMP--> [SRS] --HLS/FLV--> [Browser]
```

**Option A: SRS Built-in Ingest (configured in srs.conf)**

```nginx
vhost __defaultVhost__ {
    ingest camera_001 {
        enabled     on;
        input {
            type    stream;
            url     rtsp://admin:password@192.168.1.100:554/stream1;
        }
        ffmpeg      /usr/local/bin/ffmpeg;
        engine {
            enabled     off;
            output      rtmp://127.0.0.1:1935/live/camera_001;
        }
    }
}
```

When `engine.enabled` is `off`, FFmpeg does remux only (no transcoding) -- just repackages RTSP to RTMP. This is the most efficient mode for passthrough.

**Option B: External FFmpeg (managed by your backend)**

```bash
ffmpeg -rtsp_transport tcp -i rtsp://admin:pass@192.168.1.100:554/stream1 \
  -c copy -f flv rtmp://127.0.0.1:1935/live/camera_001
```

**Option B is recommended for this project** because:
- Your backend needs to dynamically add/remove cameras without editing srs.conf
- You can track FFmpeg process lifecycle per camera
- You can implement reconnection logic in your application
- SRS ingest requires config reload for each new camera

### 6. Transcoding

SRS does NOT transcode natively. It forks FFmpeg child processes.

**Configuration-based transcoding (in srs.conf):**

```nginx
vhost __defaultVhost__ {
    transcode {
        enabled     on;
        ffmpeg      /usr/local/bin/ffmpeg;
        engine sd {
            enabled     on;
            vcodec      libx264;
            vbitrate    800;
            vfps        25;
            vwidth      640;
            vheight     360;
            vpreset     superfast;
            acodec      libfdk_aac;
            abitrate    64;
            asample_rate 44100;
            achannels   2;
            output      rtmp://127.0.0.1:1935/[app]/[stream]_sd;
        }
    }
}
```

The transcoded stream publishes back to SRS as a new stream (e.g., `camera_001_sd`).

**Limitations:**
- Hardware acceleration (h264_nvenc, etc.) is NOT supported in SRS transcode config -- only `libx264`
- Audio transcoding has significant performance cost
- No API to control transcoding dynamically -- config file only

**Recommended approach for this project:** Handle transcoding via your own FFmpeg processes (same as ingest). Your backend spawns FFmpeg with the exact parameters needed, giving full control over codecs, hardware acceleration, and lifecycle.

### 7. Recording (DVR)

SRS supports DVR recording to FLV and MP4 formats.

**DVR Plans:**
- `session` -- one file per publish session (camera connect to disconnect)
- `segment` -- split into files by duration (configurable via `dvr_duration`)

**Configuration:**

```nginx
vhost __defaultVhost__ {
    dvr {
        enabled         on;
        dvr_apply       all;
        dvr_plan        segment;
        dvr_path        ./objs/nginx/html/[app]/[stream]/[2006]-[01]-[02]_[15]-[04]-[05].[timestamp].flv;
        dvr_duration    3600;
        dvr_wait_keyframe on;
    }
}
```

**Path variables:** `[vhost]`, `[app]`, `[stream]`, `[2006]` (year), `[01]` (month), `[02]` (day), `[15]` (hour), `[04]` (minute), `[05]` (second), `[timestamp]`.

**Dynamic DVR control:** The old HTTP RAW API for start/stop DVR was removed in v4+. Current alternatives:
1. Use `on_publish` HTTP callback to decide whether to record (return 0 to allow, non-0 to reject)
2. Use `on_dvr` callback to be notified when a DVR file is created
3. For start/stop control: manage separate FFmpeg recording processes from your backend

**Recommended for this project:** Use SRS DVR for always-on recording, but manage recording lifecycle from your backend using FFmpeg for cameras that need on-demand recording.

### 8. HLS Configuration

**Key settings:**

| Setting | Default | Recommended | Purpose |
|---------|---------|-------------|---------|
| `hls_fragment` | 10s | 2s | TS segment duration |
| `hls_window` | 60s | 10s | M3U8 playlist window |
| `hls_td_ratio` | 1.0 | 1.0 | Target duration ratio |
| `hls_wait_keyframe` | on | on | Align segments to keyframes |
| `hls_cleanup` | on | on | Delete expired segments |
| `hls_dispose` | 120s | 30s | Cleanup after stream stops |
| `hls_use_fmp4` | off | on | Use fMP4 instead of MPEG-TS (modern, better codec support) |
| `hls_keys` | off | on | AES-128 encryption for segments |
| `hls_ctx` | on | on | Session tracking for HLS playback |

**Low-latency HLS config:**

```nginx
vhost __defaultVhost__ {
    hls {
        enabled         on;
        hls_fragment    2;
        hls_window      10;
        hls_wait_keyframe on;
        hls_use_fmp4    on;
        hls_fmp4_file   [app]/[stream]-[seq].m4s;
        hls_init_file   [app]/[stream]/init.mp4;
        hls_path        ./objs/nginx/html;
        hls_m3u8_file   [app]/[stream].m3u8;
        hls_cleanup     on;
        hls_dispose     30;
        hls_keys        on;
        hls_fragments_per_key 5;
        hls_key_file    [app]/[stream]-[seq].key;
        hls_key_url     https://your-api.com/keys;
    }
}
```

**Achievable latency:** ~5-8 seconds with 2-second fragments. This is standard HLS latency, not LL-HLS (SRS does not support Apple's LL-HLS with partial segments natively). For sub-second latency, use WebRTC (WHEP) or HTTP-FLV instead.

**HLS Encryption (hls_keys):** SRS supports AES-128 encryption of HLS segments. The `hls_key_url` can point to your backend API, allowing you to serve keys only to authenticated sessions. This is the primary mechanism for securing HLS playback URLs.

### 9. HTTP Callbacks (Authentication/Security Hooks)

SRS sends HTTP POST requests to your backend on stream events. This is the primary integration point.

**Supported callbacks:**

| Event | Trigger | Key Data Fields |
|-------|---------|-----------------|
| `on_publish` | Client starts publishing a stream | `action`, `client_id`, `ip`, `vhost`, `app`, `stream`, `param` |
| `on_unpublish` | Client stops publishing | Same as on_publish |
| `on_play` | Client starts playing a stream | Same + `pageUrl` |
| `on_stop` | Client stops playing | Same as on_play |
| `on_dvr` | DVR file created | `cwd`, `file` (path to recorded file) |
| `on_hls` | HLS segment created | `duration`, `file`, `url`, `m3u8`, `seq_no` |

**Configuration:**

```nginx
vhost __defaultVhost__ {
    http_hooks {
        enabled         on;
        on_publish      http://backend:3000/api/hooks/on_publish;
        on_unpublish    http://backend:3000/api/hooks/on_unpublish;
        on_play         http://backend:3000/api/hooks/on_play;
        on_stop         http://backend:3000/api/hooks/on_stop;
        on_dvr          http://backend:3000/api/hooks/on_dvr;
        on_hls          http://backend:3000/api/hooks/on_hls;
    }
}
```

**Authentication pattern:** Your backend validates the `param` field (which contains URL query parameters like tokens) and returns:
- `{"code": 0}` with HTTP 200 to allow
- Any non-zero code or non-200 status to reject (SRS disconnects the client)

**Token-based auth example:**
```
rtmp://srs:1935/live/camera_001?token=abc123&expire=1700000000
```
SRS sends the full `param` string (`?token=abc123&expire=1700000000`) to your `on_publish` callback. Your backend validates the token.

**For HLS playback auth:** Use `on_play` callback with `hls_ctx on` to track HLS sessions. SRS will call `on_play` when an HLS viewer first requests the m3u8, passing the session context. Combined with `hls_keys`, you can serve encryption keys only to validated sessions.

### 10. Monitoring and Metrics

**HTTP API metrics (port 1985):**
- `/api/v1/summaries` -- CPU, memory, network bandwidth, connections, uptime
- `/api/v1/streams/{id}` -- Per-stream: codec info, bitrate, resolution, connected clients count
- `/api/v1/clients` -- Per-client: IP, connection time, stream being watched

**Prometheus Exporter (port 9972):**

```nginx
exporter {
    enabled     on;
    listen      9972;
    label       production;
    tag         srs-origin;
}
```

Known metrics include:
- `srs_receive_bytes_total` -- Total bytes received (ingest bandwidth)
- `srs_send_bytes_total` -- Total bytes sent (delivery bandwidth)

Query example: `rate(srs_receive_bytes_total[10s])*8` gives input bitrate in bits/sec.

Integrate with Prometheus + Grafana for dashboards.

### 11. SRS Limitations (What MediaMTX Can Do That SRS Cannot)

| Capability | SRS | MediaMTX |
|-----------|-----|----------|
| Native RTSP ingest | NO (requires FFmpeg) | YES |
| Native RTSP output | NO (planned for v7) | YES |
| RTSP proxy/relay | NO | YES |
| Dynamic stream management via API | LIMITED (config + reload) | YES (REST API) |
| LL-HLS (Apple spec) | NO (standard HLS only, ~5s latency) | YES |
| Hardware transcoding | NO (libx264 only via config) | Via FFmpeg externally |
| Dynamic recording start/stop | NO (removed in v4) | YES |
| RTMPS (RTMP over TLS) | NO (planned for v7) | YES |
| Configuration hot-reload | YES (but limited scope) | Full dynamic config |
| Native Go binary | NO (C++) | YES (Go, single binary) |

**What SRS does BETTER than MediaMTX:**
- Edge/origin clustering for massive viewer scaling
- HTTP callbacks for deep integration with business logic
- Prometheus metrics exporter
- HLS encryption (AES-128)
- Proven at CDN scale (640K+ concurrent viewers documented)
- Better WebRTC support (WHIP/WHEP)
- H.265/HEVC across all protocols
- Much larger community and documentation

### 12. Docker Setup

**Ports:**

| Port | Protocol | Service |
|------|----------|---------|
| 1935 | TCP | RTMP ingest/playback |
| 1985 | TCP | HTTP API |
| 8080 | TCP | HTTP server (HLS, HTTP-FLV, HTTP-TS) |
| 8000 | UDP | WebRTC |
| 10080 | UDP | SRT |
| 9972 | TCP | Prometheus exporter |

**Docker Compose:**

```yaml
services:
  srs:
    image: ossrs/srs:6
    restart: unless-stopped
    ports:
      - "1935:1935"
      - "1985:1985"
      - "8080:8080"
      - "8000:8000/udp"
      - "10080:10080/udp"
      - "9972:9972"
    volumes:
      - ./conf/srs.conf:/usr/local/srs/conf/srs.conf
      - ./data:/usr/local/srs/objs
    environment:
      - CANDIDATE=${SERVER_IP}  # Required for WebRTC
      - SRS_EXPORTER_ENABLED=on
```

**Volume mounts:**
- `/usr/local/srs/conf/srs.conf` -- Main configuration file
- `/usr/local/srs/objs` -- Data directory (HLS segments, DVR files, logs)
- `/usr/local/srs/objs/nginx/html` -- Where HLS m3u8 and segments are written

### 13. FFmpeg + SRS Pipeline (RTSP Pull to RTMP Push)

**The complete camera-to-browser pipeline:**

```
[IP Camera]                    [SRS Server]                [Browser]
 RTSP :554  --FFmpeg pull-->  RTMP :1935  --auto-->  HLS :8080/live/cam.m3u8
                                          --auto-->  FLV :8080/live/cam.flv
                                          --auto-->  WebRTC :8000
```

**FFmpeg command for camera ingest (managed by backend):**

```bash
ffmpeg \
  -rtsp_transport tcp \
  -i "rtsp://admin:pass@192.168.1.100:554/Streaming/Channels/101" \
  -c:v copy \
  -c:a aac \
  -f flv \
  "rtmp://srs:1935/live/camera_001?token=ingest_secret_123"
```

Key flags:
- `-rtsp_transport tcp` -- Use TCP for RTSP (more reliable than UDP for most cameras)
- `-c:v copy` -- No video transcoding (passthrough, low CPU)
- `-c:a aac` -- Transcode audio to AAC (required for HLS compatibility)
- `-f flv` -- Output as FLV container (RTMP transport)

**For transcoding (when camera output is not H.264 or resolution change needed):**

```bash
ffmpeg \
  -rtsp_transport tcp \
  -i "rtsp://admin:pass@192.168.1.100:554/stream1" \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -vf "scale=1280:720" \
  -b:v 2000k -maxrate 2500k -bufsize 5000k \
  -c:a aac -b:a 128k \
  -f flv \
  "rtmp://srs:1935/live/camera_001_720p"
```

**Reconnection pattern (in your backend process manager):**

```
On FFmpeg exit:
  1. Check exit code
  2. If camera still supposed to be active:
     a. Wait 5 seconds
     b. Test RTSP URL connectivity
     c. Restart FFmpeg process
     d. Update camera status to "reconnecting"
  3. If repeated failures (>5):
     a. Mark camera as "degraded"
     b. Send webhook notification
     c. Backoff reconnection interval
```

### 14. Edge Clustering (Scaling for Multiple Viewers)

SRS supports origin-edge architecture for scaling viewer count:

```
                          +--> [Edge 1] --> Viewers (region A)
[Camera] --> [Origin SRS] +--> [Edge 2] --> Viewers (region B)
                          +--> [Edge 3] --> Viewers (region C)
```

- Edge servers cache streams from origin
- Only ONE connection from each edge to origin per stream
- Supports multiple origin servers for failover
- Edge auto-reconnects to next origin on failure

**For v1 (Docker Compose):** Not needed. Single SRS origin handles hundreds of concurrent HLS viewers. Edge clustering is for when you need thousands+ viewers per stream.

---

## Recommended Web App Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22 LTS | Runtime | Mature ecosystem, excellent for managing FFmpeg child processes, strong async I/O for handling callbacks from SRS |
| NestJS | 11.x | Backend framework | Modular architecture fits multi-tenant SaaS, built-in guards/interceptors for auth, excellent TypeScript support, dependency injection makes testing easy |
| PostgreSQL | 16 | Primary database | Best multi-tenant support (RLS), JSONB for flexible config, proven at scale, strong TypeScript ORM ecosystem |
| Prisma | 6.x | ORM | Type-safe database access, auto-generated types, migration system, works great with NestJS |
| Next.js | 15.x | Frontend framework | React-based, SSR for dashboard, App Router for modern patterns, excellent developer experience |
| Redis | 7.x | Cache/sessions | Session storage, playback token validation cache, FFmpeg process state, real-time pub/sub for status updates |
| FFmpeg | 7.x | Media processing | RTSP pull, transcoding, recording -- all media operations outside SRS's native capabilities |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hls.js | 1.5.x | HLS player (browser) | Embed component for playing HLS streams in browsers |
| Bull/BullMQ | 5.x | Job queue | Managing FFmpeg process lifecycle, scheduled tasks, camera health checks |
| Socket.IO | 4.x | WebSocket | Real-time camera status updates to dashboard, live stream health |
| node-fluent-ffmpeg | 2.x | FFmpeg wrapper | Programmatic FFmpeg command building and process management |
| passport | 0.7.x | Authentication | Session-based auth with email/password strategy |
| ioredis | 5.x | Redis client | High-performance Redis client for Node.js |
| zod | 3.x | Validation | Request validation, config schema validation |
| @nestjs/swagger | 8.x | API docs | Auto-generated OpenAPI docs for developer portal |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker Compose | Local dev + production | Single deployment target per project constraints |
| TypeScript | 5.7+ | Entire codebase, strict mode |
| ESLint + Prettier | Code quality | Standard NestJS config |
| Vitest | Testing | Fast, TypeScript-native, good NestJS integration |
| GitHub Actions | CI/CD | Lint, test, build Docker images |

## Architecture Decision: Why NestJS over Fastify/Express

**NestJS** because:
1. **Multi-tenant SaaS needs structure** -- NestJS modules map perfectly to tenant isolation, camera management, stream engine, etc.
2. **Guards and interceptors** -- Built-in patterns for auth, tenant resolution, rate limiting
3. **Dependency injection** -- Clean separation between SRS integration layer, FFmpeg management, and business logic
4. **OpenAPI generation** -- Developer portal needs auto-generated API docs
5. **Can use Fastify under the hood** -- Get NestJS structure with Fastify performance (`@nestjs/platform-fastify`)

## Architecture Decision: Why Shared-Schema Multi-Tenancy

Use **shared tables with `org_id` column** (not schema-per-tenant) because:
1. Simpler migrations -- one schema to update
2. Better for <1000 tenants (our scale for v1)
3. PostgreSQL Row-Level Security (RLS) provides isolation
4. No connection pooling complexity
5. Can migrate to schema-per-tenant later if needed

## Installation

```bash
# Backend (NestJS)
npm install @nestjs/core @nestjs/common @nestjs/platform-fastify
npm install @nestjs/swagger @prisma/client prisma
npm install bullmq ioredis socket.io @nestjs/websockets
npm install passport passport-local @nestjs/passport
npm install zod class-validator class-transformer
npm install fluent-ffmpeg

# Frontend (Next.js)
npx create-next-app@latest dashboard --typescript --tailwind --app
npm install hls.js socket.io-client
npm install @tanstack/react-query axios
npm install leaflet react-leaflet  # Map view

# Dev dependencies
npm install -D @types/fluent-ffmpeg @types/passport-local
npm install -D vitest @nestjs/testing
npm install -D eslint prettier
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| NestJS | Fastify (raw) | If you need maximum performance and minimal overhead, no multi-tenant complexity |
| NestJS | Go (Fiber/Echo) | If FFmpeg management is the bottleneck and you need better process control |
| PostgreSQL | MySQL | Never for this use case -- PostgreSQL RLS is critical for multi-tenancy |
| Prisma | Drizzle ORM | If you need more SQL control and less abstraction; Drizzle is faster but less mature |
| Next.js | Vite + React | If the dashboard is purely client-side with no SEO needs |
| Redis | In-memory (Node) | Never for production -- need persistence for sessions and process state across restarts |
| BullMQ | Agenda | If you prefer MongoDB-based job queues (not recommended with PostgreSQL stack) |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| SRS built-in ingest for dynamic cameras | Requires config edit + reload for each camera; no API control | External FFmpeg managed by backend |
| SRS built-in transcode config | Limited to libx264, no hardware accel, no API control | External FFmpeg with full codec options |
| SRS HTTP RAW API for DVR control | Removed in v4+, no longer functional | Backend-managed recording via FFmpeg or SRS DVR config with callbacks |
| MediaMTX | Unstable streams, poor scaling, missing transcoding/recording | SRS with FFmpeg wrapper |
| MongoDB | Wrong tool for relational multi-tenant data with complex queries | PostgreSQL |
| GraphQL | Over-engineering for this domain; REST is simpler and sufficient | REST API with OpenAPI |
| Nginx as HLS server | Unnecessary layer; SRS serves HLS directly on port 8080 | SRS built-in HTTP server |
| Schema-per-tenant (PostgreSQL) | Operational complexity not justified at this scale | Shared schema with org_id + RLS |

## Complete SRS Configuration Template

```nginx
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

rtc_server {
    enabled         on;
    listen          8000;
    candidate       $CANDIDATE;
}

srt_server {
    enabled         on;
    listen          10080;
}

exporter {
    enabled         on;
    listen          9972;
    label           production;
    tag             sms-platform;
}

vhost __defaultVhost__ {
    hls {
        enabled         on;
        hls_fragment    2;
        hls_window      10;
        hls_wait_keyframe on;
        hls_use_fmp4    on;
        hls_fmp4_file   [app]/[stream]-[seq].m4s;
        hls_init_file   [app]/[stream]/init.mp4;
        hls_path        ./objs/nginx/html;
        hls_m3u8_file   [app]/[stream].m3u8;
        hls_cleanup     on;
        hls_dispose     30;
        hls_keys        on;
        hls_fragments_per_key 5;
        hls_key_file    [app]/[stream]-[seq].key;
        hls_key_url     http://backend:3000/api/v1/hls/keys;
        hls_ctx         on;
    }

    dvr {
        enabled         on;
        dvr_apply       all;
        dvr_plan        segment;
        dvr_path        ./objs/nginx/html/[app]/[stream]/[2006]-[01]-[02]_[15]-[04]-[05].flv;
        dvr_duration    3600;
        dvr_wait_keyframe on;
    }

    http_hooks {
        enabled         on;
        on_publish      http://backend:3000/api/v1/hooks/on_publish;
        on_unpublish    http://backend:3000/api/v1/hooks/on_unpublish;
        on_play         http://backend:3000/api/v1/hooks/on_play;
        on_stop         http://backend:3000/api/v1/hooks/on_stop;
        on_dvr          http://backend:3000/api/v1/hooks/on_dvr;
        on_hls          http://backend:3000/api/v1/hooks/on_hls;
    }

    http_remux {
        enabled     on;
        mount       [vhost]/[app]/[stream].flv;
    }

    rtc {
        enabled     on;
        rtmp_to_rtc on;
    }
}
```

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| SRS v6.0.184 | FFmpeg 5.x-7.x | FFmpeg 7.x recommended for H.265 support |
| NestJS 11.x | Node.js 20-22 | Node 22 LTS recommended |
| Prisma 6.x | PostgreSQL 14-16 | PostgreSQL 16 recommended for RLS improvements |
| hls.js 1.5.x | fMP4 HLS segments | Required for playing SRS fMP4 HLS output |
| Next.js 15.x | React 19 | App Router (not Pages Router) |

## Sources

- [SRS HTTP API v6 docs](https://ossrs.net/lts/en-us/docs/v6/doc/http-api) -- API endpoints, authentication (HIGH confidence)
- [SRS Ingest docs](https://ossrs.net/lts/en-us/docs/v5/doc/ingest) -- RTSP pull via FFmpeg configuration (HIGH confidence)
- [SRS Introduction v6](https://ossrs.net/lts/en-us/docs/v6/doc/introduction) -- Protocol and codec support (HIGH confidence)
- [SRS HTTP Callback docs](https://ossrs.net/lts/en-us/docs/v5/doc/http-callback) -- All callback events and auth patterns (HIGH confidence)
- [SRS HLS docs v7](https://ossrs.net/lts/en-us/docs/v7/doc/hls) -- Full HLS configuration reference (HIGH confidence)
- [SRS DVR docs](https://ossrs.net/lts/en-us/docs/v4/doc/dvr) -- Recording configuration and formats (HIGH confidence)
- [SRS FFmpeg transcoding docs](https://ossrs.net/lts/en-us/docs/v5/doc/ffmpeg) -- Transcoding configuration (HIGH confidence)
- [SRS Prometheus exporter](https://ossrs.net/lts/en-us/docs/v5/doc/exporter) -- Metrics and monitoring setup (MEDIUM confidence -- limited metric list)
- [SRS Edge cluster docs](https://ossrs.net/lts/en-us/docs/v5/doc/edge) -- Origin-edge architecture (HIGH confidence)
- [SRS GitHub releases](https://github.com/ossrs/srs/releases) -- v6.0-r0 release Dec 2024 (HIGH confidence)
- [SRS Docker Hub](https://hub.docker.com/r/ossrs/srs) -- Docker image tags (HIGH confidence)
- [SRS RTSP removal issue #2304](https://github.com/ossrs/srs/issues/2304) -- RTSP support removed (HIGH confidence)
- [SRS RAW API removal issue #2653](https://github.com/ossrs/srs/issues/2653) -- Dynamic DVR control removed (HIGH confidence)
- [SRS GB28181 sunset issue #2845](https://github.com/ossrs/srs/issues/2845) -- GB28181 SIP removed from core (HIGH confidence)
- [MediaMTX GitHub](https://github.com/bluenviron/mediamtx) -- Feature comparison reference (MEDIUM confidence)

---
*Stack research for: CCTV Streaming SaaS Platform*
*Researched: 2026-04-08*
