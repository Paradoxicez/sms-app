<!-- GSD:project-start source:PROJECT.md -->
## Project

**SMS Platform (Surveillance Management System)**

A SaaS platform that lets developers embed live CCTV streams on their websites without managing streaming infrastructure. The platform ingests RTSP/RTMP/SRT camera feeds, converts them to HLS, and provides secure, time-limited playback URLs via API. Developers register cameras, configure stream profiles, and get embeddable links — the platform handles all transcoding, delivery, and access control.

**Core Value:** Developers can get a secure HLS playback URL for any registered camera via a single API call, and embed it on their website immediately.

### Constraints

- **Stream Engine**: SRS (Simple Realtime Server) — replacing MediaMTX
- **Deployment**: Docker Compose (single server, self-hosted)
- **UI Design**: Preserve existing UI patterns from screenshots (green theme, sidebar nav, card-based dashboard)
- **Security Model**: Session-based playback URLs + domain allowlist + API key (proven sufficient in v1)
- **Tech Stack**: To be determined by research — let best practices guide the choice
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
| Endpoint | Method | Returns |
|----------|--------|---------|
| `/api/v1/versions` | GET | SRS version (major, minor, revision) |
| `/api/v1/summaries` | GET | System summary: CPU, memory, network, load, uptime |
| `/api/v1/rusages` | GET | Process resource usage stats |
| `/api/v1/self_proc_stats` | GET | SRS process statistics |
| `/api/v1/system_proc_stats` | GET | System-wide process statistics |
| `/api/v1/meminfos` | GET | System memory information |
| `/api/v1/features` | GET | List of enabled features |
| Endpoint | Method | Parameters | Returns |
|----------|--------|-----------|---------|
| `/api/v1/vhosts` | GET | - | All virtual hosts |
| `/api/v1/vhosts/{id}` | GET | vhost ID | Specific vhost details |
| `/api/v1/streams` | GET | `?start=N&count=N` | Active streams (paginated, default 10) |
| `/api/v1/streams/{id}` | GET | stream ID | Stream details (codec, bitrate, resolution, clients) |
| `/api/v1/clients` | GET | `?start=N&count=N` | Connected clients (paginated) |
| `/api/v1/clients/{id}` | GET | client ID | Client details |
| `/api/v1/clients/{id}` | DELETE | client ID | Kick/disconnect a client |
| Endpoint | Method | Content-Type | Purpose |
|----------|--------|-------------|---------|
| `/rtc/v1/whip/?app={app}&stream={stream}` | POST | application/sdp | WebRTC publish (WHIP) |
| `/rtc/v1/whep/?app={app}&stream={stream}` | POST | application/sdp | WebRTC play (WHEP) |
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/raw?rpc=reload` | GET | Hot-reload configuration (like `killall -1 srs`) |
### 5. RTSP Ingest Pattern (How Cameras Connect)
- Your backend needs to dynamically add/remove cameras without editing srs.conf
- You can track FFmpeg process lifecycle per camera
- You can implement reconnection logic in your application
- SRS ingest requires config reload for each new camera
### 6. Transcoding
- Hardware acceleration (h264_nvenc, etc.) is NOT supported in SRS transcode config -- only `libx264`
- Audio transcoding has significant performance cost
- No API to control transcoding dynamically -- config file only
### 7. Recording (DVR)
- `session` -- one file per publish session (camera connect to disconnect)
- `segment` -- split into files by duration (configurable via `dvr_duration`)
### 8. HLS Configuration
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
### 9. HTTP Callbacks (Authentication/Security Hooks)
| Event | Trigger | Key Data Fields |
|-------|---------|-----------------|
| `on_publish` | Client starts publishing a stream | `action`, `client_id`, `ip`, `vhost`, `app`, `stream`, `param` |
| `on_unpublish` | Client stops publishing | Same as on_publish |
| `on_play` | Client starts playing a stream | Same + `pageUrl` |
| `on_stop` | Client stops playing | Same as on_play |
| `on_dvr` | DVR file created | `cwd`, `file` (path to recorded file) |
| `on_hls` | HLS segment created | `duration`, `file`, `url`, `m3u8`, `seq_no` |
- `{"code": 0}` with HTTP 200 to allow
- Any non-zero code or non-200 status to reject (SRS disconnects the client)
### 10. Monitoring and Metrics
- `/api/v1/summaries` -- CPU, memory, network bandwidth, connections, uptime
- `/api/v1/streams/{id}` -- Per-stream: codec info, bitrate, resolution, connected clients count
- `/api/v1/clients` -- Per-client: IP, connection time, stream being watched
- `srs_receive_bytes_total` -- Total bytes received (ingest bandwidth)
- `srs_send_bytes_total` -- Total bytes sent (delivery bandwidth)
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
- Edge/origin clustering for massive viewer scaling
- HTTP callbacks for deep integration with business logic
- Prometheus metrics exporter
- HLS encryption (AES-128)
- Proven at CDN scale (640K+ concurrent viewers documented)
- Better WebRTC support (WHIP/WHEP)
- H.265/HEVC across all protocols
- Much larger community and documentation
### 12. Docker Setup
| Port | Protocol | Service |
|------|----------|---------|
| 1935 | TCP | RTMP ingest/playback |
| 1985 | TCP | HTTP API |
| 8080 | TCP | HTTP server (HLS, HTTP-FLV, HTTP-TS) |
| 8000 | UDP | WebRTC |
| 10080 | UDP | SRT |
| 9972 | TCP | Prometheus exporter |
- `/usr/local/srs/conf/srs.conf` -- Main configuration file
- `/usr/local/srs/objs` -- Data directory (HLS segments, DVR files, logs)
- `/usr/local/srs/objs/nginx/html` -- Where HLS m3u8 and segments are written
### 13. FFmpeg + SRS Pipeline (RTSP Pull to RTMP Push)
- `-rtsp_transport tcp` -- Use TCP for RTSP (more reliable than UDP for most cameras)
- `-c:v copy` -- No video transcoding (passthrough, low CPU)
- `-c:a aac` -- Transcode audio to AAC (required for HLS compatibility)
- `-f flv` -- Output as FLV container (RTMP transport)
### 14. Edge Clustering (Scaling for Multiple Viewers)
- Edge servers cache streams from origin
- Only ONE connection from each edge to origin per stream
- Supports multiple origin servers for failover
- Edge auto-reconnects to next origin on failure
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
## Architecture Decision: Why Shared-Schema Multi-Tenancy
## Installation
# Backend (NestJS)
# Frontend (Next.js)
# Dev dependencies
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### Prisma schema change workflow

Any edit to `apps/api/src/prisma/schema.prisma` MUST be followed by all four steps — skipping any one produces silent runtime errors (caught in controller try/catch blocks) with DB rows that appear to succeed but whose fields never write:

1. `pnpm --filter @sms-platform/api db:reset` — drops the dev DB, replays migration history (`prisma migrate reset --force --skip-seed`), and regenerates the Prisma client. Phase 23 (DEBT-05) replaced `db:push` with this — the migration history is now the source of truth. For schema changes, run `prisma migrate dev --name <change>` to produce a new migration directory; do NOT edit existing migrations or fall back to `db:push`.
2. Rebuild the API: `pnpm --filter @sms-platform/api build` — SWC compiles source and bundles the new client types.
3. Restart every long-running API process. `node dist/main` holds the Prisma client in memory and will NOT pick up the regenerated one. Use `pnpm --filter @sms-platform/api start:prod` for prod, `start:dev` for tsx-watch dev.
4. Verify: `curl http://localhost:3003/api/srs/callbacks/metrics` — the `archives` block should not show `status: failing` with `lastFailureMessage` mentioning the new field name.

Fail-fast observability: `ArchiveMetricsService` tracks archive success/failure counts; failures are surfaced via the metrics endpoint above so schema/client mismatches do not stay hidden behind `{code:0}` SRS callbacks.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:deploy-convention-start source:phase-24 -->
## Deploy Folder Convention

**Locked in Phase 24 (2026-04-27).** These rules prevent dev/prod artifact contamination as v1.3 deploy work lands across Phases 25-30. Every Claude session and human contributor MUST honor them.

1. **`deploy/` = production-only artifacts** (compose, Caddyfile, scripts, env example, prod docs). Never place dev tooling under `deploy/`. Phase 26 lands `deploy/docker-compose.yml`; Phase 27 lands `deploy/Caddyfile`; Phase 29 lands `deploy/scripts/{bootstrap,update,backup,restore,init-secrets}.sh` and prod docs (`deploy/README.md`, `deploy/BACKUP-RESTORE.md`, `deploy/TROUBLESHOOTING.md`).
2. **`apps/` = dev workflow source** (NestJS api, Next.js web, Prisma schema). Never colocate prod-only configs under `apps/`. Phase 25 lands the production multi-stage `apps/api/Dockerfile` and `apps/web/Dockerfile`, but those are image-build inputs — they belong with the source they build, not under `deploy/`.
3. **`apps/api/Dockerfile.dev` = unused dev container reference.** It is byte-identical to the original pre-Phase-24 dev Dockerfile (kept for future "containerize dev" workflows). The production Dockerfile (Phase 25+) lands at `apps/api/Dockerfile` (no suffix). Do NOT rename `Dockerfile.dev` back; do NOT overwrite it with multi-stage prod content.
4. **`pnpm-workspace.yaml` lists ONLY `apps/api` and `apps/web`.** `deploy/` MUST NOT contain a `package.json` — pnpm workspace globs would silently pick it up as a workspace member. If you need scripts under `deploy/scripts/`, write bash (or POSIX sh / Makefile) — never JavaScript packages.
5. **Use `scripts/dev-smoke.sh` to detect dev-workflow regressions** whenever you change `deploy/`, `docker-compose.yml` (root, dev), `.dockerignore`, or `apps/api/Dockerfile.dev`. The script boots `pnpm dev`, probes ports 3003 (api) + 3002 (web) for liveness, and exits 0 on success.

**Cross-reference:** root `.dockerignore` (Phase 24) closes Pitfall 8 (`.env` in image layer = BLOCKER for GA). Per-app `.dockerignore` files (Phase 25, under `apps/api/.dockerignore` and `apps/web/.dockerignore`) inherit and extend; Docker BuildKit applies the closest `.dockerignore` to each build context.
<!-- GSD:deploy-convention-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
