# Phase 2: Stream Engine & Camera Management - Research

**Researched:** 2026-04-09
**Domain:** FFmpeg process management, SRS streaming integration, camera CRUD with hierarchy, real-time status monitoring
**Confidence:** HIGH

## Summary

Phase 2 builds the core streaming pipeline: camera registration with Project > Site > Camera hierarchy, FFmpeg process management via BullMQ, RTSP-to-RTMP-to-HLS delivery through SRS, real-time camera status via Socket.IO, and stream engine settings UI. This is the highest-risk phase because it integrates multiple external processes (FFmpeg child processes, SRS container) with the NestJS backend.

The existing Phase 1 foundation provides PrismaModule, TenancyModule (CLS-based org_id injection with RLS), FeaturesModule, and AdminModule patterns. All new database tables must follow the org_id + RLS pattern established in Phase 1. The tenancy extension automatically sets `app.current_org_id` via `set_config()` within transactions.

**Primary recommendation:** Build the FFmpeg process manager as a BullMQ-based service with one job per camera stream, using `node-fluent-ffmpeg` for command construction. Use Socket.IO gateway for real-time status push. SRS runs as a Docker container alongside existing postgres/redis services, with HTTP callbacks pointing back to the NestJS API.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Strict hierarchy: Project > Site > Camera -- must create Project and Site before adding a camera
- **D-02:** Camera fields -- Required: name, stream URL (RTSP/SRT). Optional: location (lat/lng), tags, description, thumbnail
- **D-03:** Test connection (ffprobe) is optional -- separate "Test Connection" button, not required before save
- **D-04:** Bulk import supports CSV + JSON upload with medium-sized dialog showing camera table with status, editable inline for corrections before confirm
- **D-05:** Bulk import flow: Upload file -> preview dialog -> confirm import (all saved as offline) -> BullMQ background job runs ffprobe per camera -> updates status + codec info
- **D-06:** 5-state machine: online, offline, degraded, connecting, reconnecting
- **D-07:** Status updates pushed to UI via WebSocket (Socket.IO) in real-time
- **D-08:** BullMQ job queue for FFmpeg process lifecycle -- each camera stream is a job in Redis queue
- **D-09:** Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s... up to 5min max) then stop and mark offline
- **D-10:** H.265 auto-detection via ffprobe at registration -- stores needsTranscode flag
- **D-11:** Stream profiles are fully custom -- user creates any combination of codec, resolution, FPS, bitrate, audio mode
- **D-12:** All 6 SRS HTTP callbacks registered from day 1
- **D-13:** WebRTC (WHEP) output implemented in Phase 2
- **D-14:** Internal preview uses direct HLS URL via backend proxy with session check
- **D-15:** UI labels use "Stream Engine" -- never mention "SRS"
- **D-16:** Two-tier settings: System-level (Super admin, generates srs.conf) and Per-org (Org admin, stored in DB)

### Claude's Discretion
- Exact Prisma schema design for Project, Site, Camera, StreamProfile, OrgSettings tables
- BullMQ queue naming and job structure
- FFmpeg command construction and argument patterns
- Socket.IO room strategy for camera status broadcasts
- SRS srs.conf template structure and reload mechanism
- Backend proxy implementation for internal HLS preview
- Error handling patterns for FFmpeg process failures

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAM-01 | Register camera with RTSP/SRT URL, name, location, tags | Prisma schema design, CRUD module pattern, ffprobe validation |
| CAM-02 | Project > Site > Camera hierarchy | Prisma relations with cascading org_id, nested CRUD endpoints |
| CAM-03 | Start/stop stream per camera (spawns/kills FFmpeg process) | BullMQ job queue, fluent-ffmpeg process management |
| CAM-04 | Camera status monitoring with 5-state machine | State machine pattern, Socket.IO gateway, SRS callbacks |
| CAM-05 | Auto-reconnect with exponential backoff | BullMQ retry strategy, backoff configuration |
| CAM-06 | Test connection via ffprobe | child_process.exec ffprobe command, codec/resolution parsing |
| CAM-07 | Bulk camera import via CSV/JSON | csv-parse library, file upload handling, BullMQ batch job |
| STREAM-01 | FFmpeg process manager | BullMQ worker with sandboxed processor, process lifecycle tracking |
| STREAM-02 | RTSP pull via FFmpeg -> RTMP push to SRS | fluent-ffmpeg command construction, SRS RTMP ingest on port 1935 |
| STREAM-03 | SRS delivers HLS output (fMP4, 2s fragments, AES-128) | SRS srs.conf template with hls_use_fmp4, hls_fragment, hls_keys |
| STREAM-04 | SRS HTTP callbacks integration | NestJS controller endpoints for 6 callback events |
| STREAM-05 | Stream profiles (passthrough vs transcode) | StreamProfile model, FFmpeg argument builder based on profile |
| STREAM-06 | H.265 auto-detection and transcoding | ffprobe codec detection, needsTranscode flag, -c:v libx264 fallback |
| STREAM-07 | Stream engine settings via web UI | System settings -> srs.conf generator, org settings -> DB |
| STREAM-08 | WebRTC (WHEP) output support | SRS native WHEP on port 8000/udp, Docker port exposure |

</phase_requirements>

## Standard Stack

### Core (New for Phase 2)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bullmq | 5.73.2 | Job queue for FFmpeg lifecycle | Redis-backed, supports retry/backoff/concurrency, NestJS first-class integration [VERIFIED: npm registry] |
| @nestjs/bullmq | 11.0.4 | NestJS BullMQ integration | Official NestJS module, decorator-based processors [VERIFIED: npm registry] |
| socket.io | 4.8.3 | WebSocket server | Real-time camera status push, room-based broadcasting [VERIFIED: npm registry] |
| @nestjs/websockets | 11.1.18 | NestJS WebSocket integration | Official gateway decorators [VERIFIED: npm registry] |
| @nestjs/platform-socket.io | 11.1.18 | Socket.IO adapter for NestJS | Bridges Socket.IO with NestJS gateway pattern [VERIFIED: npm registry] |
| fluent-ffmpeg | 2.1.3 | FFmpeg command builder | Programmatic FFmpeg command construction, event-based process monitoring [VERIFIED: npm registry] |
| @types/fluent-ffmpeg | 2.1.28 | TypeScript types | Type safety for fluent-ffmpeg API [VERIFIED: npm registry] |
| hls.js | 1.6.15 | HLS player (browser) | Play HLS streams in browser, fMP4 segment support [VERIFIED: npm registry] |
| csv-parse | 6.2.1 | CSV parsing | For bulk camera import CSV handling [VERIFIED: npm registry] |
| @nestjs/schedule | 6.1.1 | Scheduled tasks | Camera health check cron jobs [VERIFIED: npm registry] |

### Existing (From Phase 1)

| Library | Version | Purpose |
|---------|---------|---------|
| @nestjs/core | ^11.0.0 | Framework |
| @prisma/client | ^6.19.3 | ORM |
| ioredis | ^5.10.1 | Redis client (shared with BullMQ) |
| nestjs-cls | ^6.2.0 | CLS for org context |
| zod | ^3.25.76 | Validation |
| @nestjs/swagger | ^11.0.0 | API docs |

### Infrastructure (Docker)

| Service | Image | Purpose |
|---------|-------|---------|
| SRS | ossrs/srs:6 | Stream engine (RTMP ingest -> HLS delivery) [VERIFIED: CLAUDE.md] |
| FFmpeg | linuxserver/ffmpeg:latest or built into API container | RTSP pull + transcode [ASSUMED] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BullMQ | Agenda | MongoDB-based, wrong fit for PostgreSQL stack |
| fluent-ffmpeg | raw child_process | Less ergonomic, manual argument construction, no built-in event handling |
| Socket.IO | ws (raw WebSocket) | No room broadcasting, no reconnection, no namespaces |
| csv-parse | papaparse | papaparse is browser-first; csv-parse is Node.js native, streaming |

**Installation (API):**
```bash
npm install bullmq @nestjs/bullmq socket.io @nestjs/websockets @nestjs/platform-socket.io fluent-ffmpeg csv-parse @nestjs/schedule
npm install -D @types/fluent-ffmpeg
```

**Installation (Web):**
```bash
npm install hls.js socket.io-client
```

**FFmpeg in Docker:** FFmpeg is NOT installed on host machine [VERIFIED: environment check]. Must be available inside the API container or as a sidecar. Recommended approach: use a Dockerfile for the API service that includes FFmpeg installation (e.g., `apt-get install -y ffmpeg` on Debian-based Node image). This way `fluent-ffmpeg` can spawn FFmpeg/ffprobe child processes.

## Architecture Patterns

### Recommended Project Structure

```
apps/api/src/
  cameras/
    cameras.module.ts           # CameraModule - CRUD + hierarchy
    cameras.controller.ts       # REST endpoints for Project/Site/Camera
    cameras.service.ts           # Business logic, ffprobe integration
    dto/                        # Zod schemas for camera/project/site DTOs
    entities/                   # Type interfaces
  streams/
    streams.module.ts           # StreamModule - FFmpeg lifecycle
    streams.controller.ts       # Start/stop stream endpoints
    streams.service.ts          # FFmpeg process orchestration
    stream-profile.service.ts   # Profile CRUD and FFmpeg arg builder
    ffmpeg/
      ffmpeg.service.ts         # fluent-ffmpeg wrapper
      ffmpeg-command.builder.ts # Build FFmpeg args from profile
      ffprobe.service.ts        # Probe camera codec/resolution
    processors/
      stream.processor.ts      # BullMQ worker for stream jobs
  srs/
    srs.module.ts               # SRS integration module
    srs-callback.controller.ts  # HTTP callback endpoints (on_publish etc.)
    srs-config.service.ts       # Generate srs.conf from settings
    srs-api.service.ts          # Query SRS HTTP API (/api/v1/streams etc.)
  status/
    status.module.ts            # Camera status + WebSocket
    status.gateway.ts           # Socket.IO gateway
    status.service.ts           # State machine, status tracking
  settings/
    settings.module.ts          # Stream engine settings
    settings.controller.ts      # System + org settings endpoints
    settings.service.ts         # srs.conf generation + reload
```

### Pattern 1: BullMQ Job-per-Camera Stream

**What:** Each camera stream start creates a BullMQ job. The worker spawns FFmpeg. Job completion/failure maps to camera status transitions.

**When to use:** Always for FFmpeg process lifecycle.

```typescript
// Queue naming convention
const STREAM_QUEUE = 'stream:ffmpeg';
const PROBE_QUEUE = 'stream:probe';

// Job structure
interface StreamJobData {
  cameraId: string;
  orgId: string;
  rtspUrl: string;
  streamKey: string;       // e.g., "live/{orgId}/{cameraId}"
  profile: StreamProfile;  // passthrough or transcode settings
  attempt: number;         // for backoff tracking
}

// BullMQ module registration
@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: 'localhost', port: 6379 },
    }),
    BullModule.registerQueue(
      { name: STREAM_QUEUE },
      { name: PROBE_QUEUE },
    ),
  ],
})
export class StreamModule {}
```
[ASSUMED - pattern based on NestJS/BullMQ conventions]

### Pattern 2: Camera Status State Machine

**What:** Finite state machine with 5 states and defined transitions.

```
                     +-----------+
      start          |           |     ffmpeg started
   --------->  connecting  --------->  online
                     |           |        |
                     +-----------+        |
                                          |  ffmpeg error
                                          v
                     +-----------+   reconnecting
      stop           |           |     ^    |
   <---------  offline   <-------+     |    |  retry (backoff)
                     |     max retries  +----+
                     +-----------+
                                     degraded (high error rate but still streaming)
```

Valid transitions:
- `offline -> connecting`: user starts stream
- `connecting -> online`: FFmpeg + SRS confirm publish
- `online -> reconnecting`: FFmpeg process exits unexpectedly
- `reconnecting -> online`: retry succeeds
- `reconnecting -> offline`: max retries exceeded (backoff > 5 min)
- `online -> degraded`: high packet loss or bitrate drop detected
- `degraded -> online`: metrics recover
- `* -> offline`: user stops stream

[ASSUMED - designed from D-06/D-09 requirements]

### Pattern 3: SRS HTTP Callback Handler

**What:** SRS posts JSON to NestJS endpoints on stream events. Backend validates and updates camera status.

```typescript
// SRS callback endpoint - no auth needed (internal network only)
@Controller('srs/callbacks')
export class SrsCallbackController {
  @Post('on_publish')
  async onPublish(@Body() body: SrsCallbackDto) {
    // Extract orgId and cameraId from stream key: "live/{orgId}/{cameraId}"
    // Update camera status to 'online'
    // Return { code: 0 } to allow publish
    return { code: 0 };
  }

  @Post('on_unpublish')
  async onUnpublish(@Body() body: SrsCallbackDto) {
    // Update camera status (may trigger reconnect)
    return { code: 0 };
  }

  @Post('on_play')
  async onPlay(@Body() body: SrsCallbackDto) {
    // Track viewer count
    return { code: 0 };
  }
}
```
[VERIFIED: CLAUDE.md SRS HTTP Callbacks section - return `{code: 0}` with HTTP 200 to allow]

### Pattern 4: Socket.IO Room Strategy for Status Broadcasting

**What:** Use org-scoped rooms for camera status updates. Each authenticated client joins their org room.

```typescript
@WebSocketGateway({ namespace: '/camera-status', cors: true })
export class StatusGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  async handleConnection(client: Socket) {
    // Validate session token from handshake
    // Join org room: client.join(`org:${orgId}`)
  }

  broadcastStatus(orgId: string, cameraId: string, status: CameraStatus) {
    this.server.to(`org:${orgId}`).emit('camera:status', { cameraId, status });
  }
}
```
[ASSUMED - standard Socket.IO room pattern]

### Pattern 5: SRS Config Generation and Reload

**What:** Generate `srs.conf` from DB settings, write to Docker volume, trigger SRS reload via API.

```typescript
// Generate srs.conf from settings
async generateConfig(settings: SystemSettings): Promise<string> {
  return `
listen              1935;
max_connections     1000;
daemon              off;
srs_log_tank        console;

http_server {
    enabled         on;
    listen          8080;
}

http_api {
    enabled         on;
    listen          1985;
}

vhost __defaultVhost__ {
    hls {
        enabled         on;
        hls_fragment    ${settings.hlsFragment || 2};
        hls_window      ${settings.hlsWindow || 10};
        hls_cleanup     on;
        hls_dispose     30;
        hls_wait_keyframe on;
        hls_use_fmp4    on;
        ${settings.hlsEncryption ? `
        hls_keys        on;
        hls_fragments_per_key 10;
        hls_key_file    [app]/[stream]-[seq].key;
        hls_key_file_path /usr/local/srs/objs/nginx/html;
        hls_key_url     /keys/[app]/[stream]-[seq].key;
        ` : ''}
    }

    http_hooks {
        enabled         on;
        on_publish      http://host.docker.internal:3001/srs/callbacks/on_publish;
        on_unpublish    http://host.docker.internal:3001/srs/callbacks/on_unpublish;
        on_play         http://host.docker.internal:3001/srs/callbacks/on_play;
        on_stop         http://host.docker.internal:3001/srs/callbacks/on_stop;
        on_hls          http://host.docker.internal:3001/srs/callbacks/on_hls;
        on_dvr          http://host.docker.internal:3001/srs/callbacks/on_dvr;
    }

    rtc {
        enabled     on;
        rtmp_to_rtc on;
    }
}`;
}

// Reload via SRS HTTP API
async reloadSrs(): Promise<void> {
  await fetch('http://localhost:1985/api/v1/raw?rpc=reload');
}
```
[VERIFIED: CLAUDE.md SRS HLS Configuration and HTTP Callbacks sections]

### Pattern 6: FFmpeg Command Construction

**What:** Build FFmpeg command based on stream profile (passthrough vs transcode).

```typescript
// Passthrough (H.264 camera)
// ffmpeg -rtsp_transport tcp -i rtsp://camera-url -c:v copy -c:a aac -f flv rtmp://srs:1935/live/orgId/cameraId

// Transcode (H.265 camera or custom profile)
// ffmpeg -rtsp_transport tcp -i rtsp://camera-url -c:v libx264 -preset veryfast -b:v 2000k
//   -vf scale=1920:1080 -r 30 -c:a aac -b:a 128k -f flv rtmp://srs:1935/live/orgId/cameraId

buildCommand(camera: Camera, profile: StreamProfile): FfmpegCommand {
  const streamKey = `live/${camera.orgId}/${camera.id}`;
  const cmd = ffmpeg(camera.streamUrl)
    .inputOptions(['-rtsp_transport', 'tcp'])
    .output(`rtmp://srs:1935/${streamKey}`)
    .outputFormat('flv');

  if (profile.codec === 'copy' || (!camera.needsTranscode && profile.codec === 'auto')) {
    cmd.videoCodec('copy');
  } else {
    cmd.videoCodec('libx264')
       .addOutputOptions(['-preset', profile.preset || 'veryfast']);
    if (profile.bitrate) cmd.videoBitrate(profile.bitrate);
    if (profile.resolution) cmd.size(profile.resolution);
    if (profile.fps) cmd.fps(profile.fps);
  }

  cmd.audioCodec('aac');
  if (profile.audioBitrate) cmd.audioBitrate(profile.audioBitrate);

  return cmd;
}
```
[VERIFIED: CLAUDE.md FFmpeg + SRS Pipeline section for flags; fluent-ffmpeg API is ASSUMED]

### Pattern 7: Backend HLS Proxy for Internal Preview

**What:** Proxy HLS requests through backend with session authentication. No JWT tokens needed (Phase 3).

```typescript
@Get('cameras/:id/preview/playlist.m3u8')
@UseGuards(AuthGuard)
async getPreviewPlaylist(@Param('id') id: string, @Res() res: Response) {
  // Verify user has access to this camera (org_id + role check)
  const camera = await this.cameraService.findOne(id);
  const streamKey = `live/${camera.orgId}/${camera.id}`;

  // Proxy from SRS
  const hlsUrl = `http://srs:8080/${streamKey}.m3u8`;
  const upstream = await fetch(hlsUrl);
  res.set('Content-Type', 'application/vnd.apple.mpegurl');
  // Rewrite segment URLs to also go through proxy
  const body = await upstream.text();
  const rewritten = body.replace(/(.+\.m4s)/g, `/api/cameras/${id}/preview/$1`);
  res.send(rewritten);
}
```
[ASSUMED - standard proxy pattern for authenticated HLS]

### Anti-Patterns to Avoid

- **Storing FFmpeg PID in database:** PIDs are ephemeral and not valid across restarts. Use BullMQ job state instead.
- **Editing srs.conf per camera:** SRS uses vhost-level config, not per-stream. Camera management is dynamic via FFmpeg processes pushing RTMP to SRS.
- **Polling camera status:** Use SRS HTTP callbacks + FFmpeg process events, not periodic polling.
- **Running FFmpeg as root:** Use non-root user in Docker container for security.
- **Synchronous ffprobe in request handler:** Always run ffprobe asynchronously via BullMQ job or at minimum in a background thread.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job queue with retry/backoff | Custom Redis pub/sub queue | BullMQ + @nestjs/bullmq | Exponential backoff, job state persistence, concurrency control, dead letter queue |
| FFmpeg command construction | String concatenation of args | fluent-ffmpeg | Handles escaping, provides events (progress, error, end), process management |
| WebSocket with rooms | Raw ws library + custom rooms | Socket.IO + @nestjs/websockets | Auto-reconnection, room broadcasting, namespace isolation, fallback transports |
| CSV parsing | Manual string splitting | csv-parse | Handles quoting, escaping, encoding, streaming for large files |
| HLS player | Custom fetch + MSE | hls.js | Handles fMP4 segments, adaptive bitrate, error recovery, wide browser support |
| Cron scheduling | setInterval | @nestjs/schedule | Decorator-based, integrates with NestJS lifecycle, supports cron expressions |
| SRS config templating | Manual string building | Template literals with settings object | Keep simple -- srs.conf is not complex enough to need a template engine |

## Common Pitfalls

### Pitfall 1: FFmpeg Zombie Processes
**What goes wrong:** FFmpeg child processes survive Node.js restart or crash, consuming CPU and memory.
**Why it happens:** Node.js `child_process.spawn()` doesn't automatically kill children on parent exit.
**How to avoid:** 
- Track all FFmpeg PIDs in Redis (BullMQ job metadata)
- On API startup, kill orphaned FFmpeg processes (check Redis for "active" jobs, compare with running processes)
- Use `detached: false` in spawn options
- Handle SIGTERM/SIGINT in the API process to clean up children
**Warning signs:** CPU usage climbing after API restarts, duplicate streams appearing.

### Pitfall 2: SRS Callback URL Routing in Docker
**What goes wrong:** SRS container cannot reach NestJS API for HTTP callbacks.
**Why it happens:** `localhost` inside SRS container refers to the SRS container itself, not the host.
**How to avoid:** 
- Use `host.docker.internal` (macOS/Windows) or Docker network service name
- For Docker Compose: use the service name (e.g., `http://api:3001/srs/callbacks/...`)
- Put SRS and API on the same Docker network
**Warning signs:** SRS logs show connection refused for callback URLs.

### Pitfall 3: HLS Latency Appears High (>10s)
**What goes wrong:** HLS playback has 15-30s latency instead of expected 5-8s.
**Why it happens:** Default SRS `hls_fragment=10` and `hls_window=60` are too conservative. Also, camera GOP (keyframe interval) affects segment alignment.
**How to avoid:**
- Set `hls_fragment 2` and `hls_window 10` (per CLAUDE.md recommendation)
- Ensure camera keyframe interval matches or is smaller than hls_fragment
- Use `hls_wait_keyframe on` to align segments
**Warning signs:** m3u8 playlist shows segments > 4s duration.

### Pitfall 4: org_id Missing on New Tables
**What goes wrong:** Data leaks between tenants because RLS policy doesn't filter correctly.
**Why it happens:** Forgetting to add `orgId` column or RLS policy to new tables (Project, Site, Camera, StreamProfile).
**How to avoid:**
- Every new table that stores tenant data MUST have `orgId String` column
- Create RLS policy in migration: `CREATE POLICY ... USING (org_id = current_setting('app.current_org_id'))`
- Use `TENANCY_CLIENT` (not raw PrismaService) for all org-scoped queries
**Warning signs:** Users seeing cameras from other organizations.

### Pitfall 5: BullMQ Connection Sharing with ioredis
**What goes wrong:** BullMQ and existing ioredis instance conflict or create too many connections.
**Why it happens:** BullMQ creates its own Redis connections internally. Using the same ioredis instance can cause issues.
**How to avoid:**
- Let BullMQ create its own connections via `connection` config (host/port)
- Don't pass an existing ioredis client directly to BullMQ (it needs separate connections for pub/sub)
- Monitor Redis connection count
**Warning signs:** Redis `maxclients` errors, BullMQ jobs stuck in "waiting" state.

### Pitfall 6: RTSP Camera Authentication in FFmpeg
**What goes wrong:** FFmpeg fails to connect to cameras that require authentication.
**Why it happens:** RTSP URLs with embedded credentials (rtsp://user:pass@ip:port/path) may have special characters that need URL-encoding.
**How to avoid:**
- URL-encode credentials in RTSP URL before passing to FFmpeg
- Support both embedded credentials and separate username/password fields in camera registration
- Test connection (ffprobe) validates authentication works before save
**Warning signs:** FFmpeg exits with "401 Unauthorized" or "RTSP connection timeout".

### Pitfall 7: H.265 Detection False Negatives
**What goes wrong:** Camera is H.265 but `needsTranscode` is set to false, resulting in HLS playback failure.
**Why it happens:** ffprobe output parsing error, or camera switches codec after registration.
**How to avoid:**
- Parse ffprobe JSON output (`-print_format json`) for `codec_name` field
- Also check on first `on_publish` callback if SRS reports codec info
- Store detected codec in camera record for debugging
**Warning signs:** HLS player shows black screen or "codec not supported" error.

## Prisma Schema Design (Claude's Discretion)

Recommended schema additions for Phase 2:

```prisma
model Project {
  id          String   @id @default(uuid())
  orgId       String
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  sites       Site[]

  @@index([orgId])
}

model Site {
  id          String   @id @default(uuid())
  orgId       String
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name        String
  description String?
  location    Json?    // { lat: number, lng: number }
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  cameras     Camera[]

  @@index([orgId])
  @@index([projectId])
}

model Camera {
  id              String       @id @default(uuid())
  orgId           String
  siteId          String
  site            Site         @relation(fields: [siteId], references: [id], onDelete: Cascade)
  name            String
  streamUrl       String       // RTSP or SRT URL
  description     String?
  location        Json?        // { lat: number, lng: number }
  tags            String[]     @default([])
  thumbnail       String?      // URL or path to thumbnail image
  status          String       @default("offline") // online|offline|degraded|connecting|reconnecting
  needsTranscode  Boolean      @default(false)
  codecInfo       Json?        // { video: "h264", audio: "aac", width: 1920, height: 1080, fps: 30 }
  streamProfileId String?
  streamProfile   StreamProfile? @relation(fields: [streamProfileId], references: [id])
  lastOnlineAt    DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@index([orgId])
  @@index([siteId])
  @@index([status])
}

model StreamProfile {
  id            String   @id @default(uuid())
  orgId         String
  name          String
  codec         String   @default("auto") // auto|copy|libx264
  preset        String?  @default("veryfast") // ultrafast|superfast|veryfast|faster|fast|medium
  resolution    String?  // e.g., "1920x1080", "1280x720", null for original
  fps           Int?     // null for original
  videoBitrate  String?  // e.g., "2000k", null for auto
  audioCodec    String   @default("aac")
  audioBitrate  String?  @default("128k")
  isDefault     Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  cameras       Camera[]

  @@index([orgId])
}

model OrgSettings {
  id                  String   @id @default(uuid())
  orgId               String   @unique
  defaultProfileId    String?
  maxReconnectAttempts Int     @default(10)
  autoStartOnBoot     Boolean  @default(false)
  defaultRecordingMode String  @default("none") // none|continuous|motion
  webhookUrl          String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([orgId])
}

model SystemSettings {
  id              String   @id @default(uuid())
  hlsFragment     Int      @default(2)
  hlsWindow       Int      @default(10)
  hlsEncryption   Boolean  @default(false)
  rtmpPort        Int      @default(1935)
  srtPort         Int      @default(10080)
  webrtcPort      Int      @default(8000)
  httpPort        Int      @default(8080)
  apiPort         Int      @default(1985)
  timeoutSeconds  Int      @default(30)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**RLS migrations needed:** Project, Site, Camera, StreamProfile, OrgSettings tables all need `org_id` column (matching Prisma `orgId`) with RLS policies matching Phase 1 pattern. SystemSettings is super-admin-only -- no RLS needed.

[ASSUMED - schema design based on requirements and Phase 1 patterns]

## Docker Compose Addition

```yaml
  srs:
    image: ossrs/srs:6
    ports:
      - "1935:1935"    # RTMP
      - "1985:1985"    # HTTP API
      - "8080:8080"    # HLS/HTTP-FLV
      - "8000:8000/udp" # WebRTC
      - "10080:10080/udp" # SRT
    volumes:
      - ./config/srs.conf:/usr/local/srs/conf/srs.conf
      - srs_data:/usr/local/srs/objs
    restart: unless-stopped
    networks:
      - sms-network

  api:
    build: ./apps/api
    ports:
      - "3001:3001"
    depends_on:
      - postgres
      - redis
      - srs
    networks:
      - sms-network

networks:
  sms-network:
    driver: bridge

volumes:
  srs_data:
```

Note: Using Docker network allows SRS callbacks to reach API via `http://api:3001/...` and API to push RTMP to `rtmp://srs:1935/...`. [ASSUMED - standard Docker Compose networking]

## Code Examples

### ffprobe Camera Test Connection

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

interface ProbeResult {
  codec: string;        // "h264" | "hevc" | "h265"
  width: number;
  height: number;
  fps: number;
  audioCodec: string;
  needsTranscode: boolean;
}

async function probeCamera(streamUrl: string): Promise<ProbeResult> {
  const cmd = `ffprobe -v quiet -print_format json -show_streams -rtsp_transport tcp "${streamUrl}"`;
  const { stdout } = await execAsync(cmd, { timeout: 15000 });
  const data = JSON.parse(stdout);

  const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
  const audioStream = data.streams.find((s: any) => s.codec_type === 'audio');

  if (!videoStream) throw new Error('No video stream found');

  const codec = videoStream.codec_name; // "h264", "hevc"
  const needsTranscode = ['hevc', 'h265'].includes(codec.toLowerCase());

  return {
    codec,
    width: videoStream.width,
    height: videoStream.height,
    fps: Math.round(eval(videoStream.r_frame_rate)), // "30/1" -> 30
    audioCodec: audioStream?.codec_name || 'none',
    needsTranscode,
  };
}
```
[ASSUMED - standard ffprobe JSON output parsing]

### BullMQ Stream Processor

```typescript
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('stream:ffmpeg')
export class StreamProcessor extends WorkerHost {
  constructor(
    private ffmpegService: FfmpegService,
    private statusService: StatusService,
  ) { super(); }

  async process(job: Job<StreamJobData>): Promise<void> {
    const { cameraId, orgId, rtspUrl, streamKey, profile } = job.data;

    await this.statusService.transition(cameraId, 'connecting');

    // This promise resolves when FFmpeg process ends
    await this.ffmpegService.startStream({
      input: rtspUrl,
      output: `rtmp://srs:1935/${streamKey}`,
      profile,
      onProgress: (progress) => job.updateProgress(progress),
    });
    // If FFmpeg exits cleanly, job completes
    // If FFmpeg exits with error, it throws -> BullMQ retries
  }
}
```
[ASSUMED - based on NestJS BullMQ processor pattern]

### Exponential Backoff Configuration

```typescript
// BullMQ queue configuration for auto-reconnect (D-09)
BullModule.registerQueue({
  name: 'stream:ffmpeg',
  defaultJobOptions: {
    attempts: 15,  // enough attempts for 1+2+4+8+16+32+64+128+256+300+300+300+300+300+300 = ~2011s total
    backoff: {
      type: 'custom',
    },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});

// Custom backoff strategy: exponential up to 5 minutes, then stop
function calculateBackoff(attemptsMade: number): number {
  const delay = Math.min(1000 * Math.pow(2, attemptsMade - 1), 300000); // max 5 min
  return delay;
}
```
[ASSUMED - BullMQ backoff configuration pattern]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SRS built-in ingest (srs.conf per camera) | External FFmpeg push to SRS RTMP | Always for dynamic cameras | No config reload needed per camera |
| MPEG-TS HLS segments | fMP4 HLS segments (`hls_use_fmp4 on`) | SRS v5+ | Better codec support (H.265), smaller segments |
| Standard HLS only | HLS + WebRTC WHEP dual output | SRS v6 | Sub-second latency option alongside HLS |
| BullMQ v3/v4 | BullMQ v5 | 2024 | Better TypeScript support, improved worker patterns |
| @nestjs/bull (Bull) | @nestjs/bullmq (BullMQ) | NestJS 10+ | BullMQ is the actively maintained fork |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FFmpeg should be installed in API Docker container via apt-get | Standard Stack | If team prefers sidecar container, architecture changes significantly |
| A2 | Docker Compose network allows `http://api:3001` from SRS | Docker Compose | If SRS can't reach API, callbacks fail -- need `host.docker.internal` or extra_hosts |
| A3 | fluent-ffmpeg API supports all needed event callbacks (progress, error, end) | Code Examples | If API differs, need to adjust process monitoring approach |
| A4 | Prisma schema with orgId + RLS policy per table follows Phase 1 pattern exactly | Schema Design | If Phase 1 used different RLS mechanism, need to align |
| A5 | `hls_use_fmp4 on` works with hls.js 1.6.x for playback | Architecture | If fMP4 has compatibility issues, fall back to MPEG-TS segments |
| A6 | BullMQ custom backoff function is supported via `backoff.type: 'custom'` | Code Examples | May need to use built-in exponential with cap instead |

## Open Questions (RESOLVED)

1. **FFmpeg Deployment Strategy**
   - What we know: FFmpeg is not on host machine. Need it available for API process.
   - What's unclear: Install in API Docker image vs. separate sidecar container vs. Alpine + static FFmpeg binary
   - RESOLVED: Install in API Dockerfile (`apt-get install -y ffmpeg`) -- simplest approach, same container as Node.js

2. **SRS Config File Location**
   - What we know: SRS reads from `/usr/local/srs/conf/srs.conf` inside container
   - What's unclear: Whether to mount from host `./config/srs.conf` or generate dynamically and write to Docker volume
   - RESOLVED: Mount from `./config/srs.conf` (committed to repo as template), regenerate and overwrite via API when settings change

3. **Stream Key Convention**
   - What we know: SRS uses `app/stream` pattern for RTMP URLs
   - What's unclear: Best naming convention for multi-tenant streams
   - RESOLVED: `live/{orgId}/{cameraId}` -- unique per camera, includes org isolation

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | API runtime | Yes | 22.11.0 | -- |
| Docker | SRS container | Yes | 28.3.2 | -- |
| Docker Compose | Service orchestration | Yes | v2.39.1 | -- |
| PostgreSQL | Database (via Docker) | Yes (Docker) | 16 | -- |
| Redis | BullMQ + cache (via Docker) | Yes (Docker) | 7-alpine | -- |
| FFmpeg | RTSP pull + transcode | No (not on host) | -- | Install in API Docker image |
| ffprobe | Camera test connection | No (not on host) | -- | Included with FFmpeg install |
| SRS | Stream engine | No (not yet in Docker Compose) | -- | Add ossrs/srs:6 to docker-compose.yml |

**Missing dependencies with no fallback:**
- None -- all can be resolved via Docker

**Missing dependencies with fallback:**
- FFmpeg/ffprobe: not on host, install in API Docker image via `apt-get install -y ffmpeg`
- SRS: not yet in docker-compose.yml, add `ossrs/srs:6` service

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/api && npx vitest run --reporter=verbose --coverage` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAM-01 | Camera CRUD with required/optional fields | unit + integration | `cd apps/api && npx vitest run tests/cameras/camera-crud.test.ts -t "create camera"` | Wave 0 |
| CAM-02 | Project > Site > Camera hierarchy enforcement | integration | `cd apps/api && npx vitest run tests/cameras/hierarchy.test.ts` | Wave 0 |
| CAM-03 | Start/stop stream spawns/kills FFmpeg | unit (mocked) | `cd apps/api && npx vitest run tests/streams/stream-lifecycle.test.ts` | Wave 0 |
| CAM-04 | Status state machine transitions | unit | `cd apps/api && npx vitest run tests/status/state-machine.test.ts` | Wave 0 |
| CAM-05 | Auto-reconnect with backoff | unit | `cd apps/api && npx vitest run tests/streams/reconnect.test.ts` | Wave 0 |
| CAM-06 | ffprobe test connection | unit (mocked) | `cd apps/api && npx vitest run tests/cameras/ffprobe.test.ts` | Wave 0 |
| CAM-07 | Bulk import CSV/JSON parse + validate | unit | `cd apps/api && npx vitest run tests/cameras/bulk-import.test.ts` | Wave 0 |
| STREAM-01 | FFmpeg process manager | unit (mocked) | `cd apps/api && npx vitest run tests/streams/ffmpeg-manager.test.ts` | Wave 0 |
| STREAM-02 | RTSP->RTMP pipeline command construction | unit | `cd apps/api && npx vitest run tests/streams/ffmpeg-command.test.ts` | Wave 0 |
| STREAM-03 | SRS HLS config generation | unit | `cd apps/api && npx vitest run tests/srs/config-generator.test.ts` | Wave 0 |
| STREAM-04 | SRS callback handling | integration | `cd apps/api && npx vitest run tests/srs/callbacks.test.ts` | Wave 0 |
| STREAM-05 | Stream profile -> FFmpeg args | unit | `cd apps/api && npx vitest run tests/streams/profile-builder.test.ts` | Wave 0 |
| STREAM-06 | H.265 detection flag | unit | `cd apps/api && npx vitest run tests/cameras/codec-detection.test.ts` | Wave 0 |
| STREAM-07 | Settings CRUD + srs.conf generation | integration | `cd apps/api && npx vitest run tests/settings/stream-engine.test.ts` | Wave 0 |
| STREAM-08 | WebRTC WHEP endpoint exposure | manual-only | Docker + browser test | -- |

### Sampling Rate
- **Per task commit:** `cd apps/api && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd apps/api && npx vitest run --reporter=verbose --coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/cameras/` directory -- all camera test files
- [ ] `tests/streams/` directory -- all stream/FFmpeg test files
- [ ] `tests/srs/` directory -- SRS callback and config test files
- [ ] `tests/settings/` directory -- stream engine settings tests
- [ ] `tests/status/` directory -- state machine tests
- [ ] Mock factory for Camera, Project, Site, StreamProfile entities

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | Session check on all camera/stream endpoints (existing AuthGuard) |
| V3 Session Management | Yes | Existing Better Auth session management |
| V4 Access Control | Yes | org_id RLS isolation + role-based guards (Operator+ for camera management) |
| V5 Input Validation | Yes | Zod schemas for all DTOs (camera fields, stream profile, settings) |
| V6 Cryptography | No | HLS AES-128 handled by SRS natively |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RTSP URL injection (command injection via camera URL) | Tampering | Validate URL format with Zod, never pass to shell directly -- use fluent-ffmpeg programmatic API |
| Cross-tenant camera access | Information Disclosure | RLS policies on all tables + org_id from CLS context |
| SRS callback spoofing | Spoofing | Restrict callback endpoints to internal Docker network, don't expose on public routes |
| FFmpeg resource exhaustion | Denial of Service | Enforce Package.maxCameras limit, BullMQ concurrency limit per org |
| Stream URL credential exposure in logs | Information Disclosure | Redact credentials from RTSP URLs in all log output |

## Sources

### Primary (HIGH confidence)
- `CLAUDE.md` - SRS API surface, HLS config, HTTP callbacks, FFmpeg pipeline, Docker ports, codec support
- `REQUIREMENTS.md` - CAM-01 through CAM-07, STREAM-01 through STREAM-08
- `02-CONTEXT.md` - All 16 locked decisions (D-01 through D-16)
- npm registry - All package versions verified via `npm view`

### Secondary (MEDIUM confidence)
- Phase 1 codebase analysis - TenancyModule pattern, Prisma schema, app.module.ts structure
- `02-UI-SPEC.md` - UI design contract for camera status colors, typography, spacing

### Tertiary (LOW confidence)
- fluent-ffmpeg API specifics - based on training data, not verified via Context7

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all versions verified via npm registry, peer dependencies confirmed
- Architecture: HIGH - patterns based on locked decisions from CONTEXT.md + existing codebase patterns
- Pitfalls: MEDIUM - based on training data and SRS documentation in CLAUDE.md, some are assumed from experience
- Prisma schema: MEDIUM - designed from requirements but exact field types and relations are discretionary

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable stack, 30-day validity)
