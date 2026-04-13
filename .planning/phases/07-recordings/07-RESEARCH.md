# Phase 7: Recordings - Research

**Researched:** 2026-04-13
**Domain:** HLS segment archival, object storage (MinIO), dynamic HLS manifest generation, retention management
**Confidence:** HIGH

## Summary

Phase 7 implements recording by intercepting SRS `on_hls` callbacks to archive fMP4 segments to MinIO/S3, with browsing/playback via dynamically generated HLS manifests. The architecture leverages existing infrastructure: SRS callback handlers (log-only, ready for recording logic), BullMQ job queue (repeatable jobs for retention cleanup and recording schedules), NotificationsModule (storage alerts), and FeatureKey.RECORDINGS (already defined in enum).

The key technical challenge is the `on_hls` callback pipeline: SRS writes fMP4 segments to its HLS output directory, fires `on_hls` to the backend with segment metadata (file path, duration, seq_no), and the backend must read the segment from the shared Docker volume and upload to MinIO. The second challenge is dynamic m3u8 manifest generation for playback -- assembling segments from MinIO with correct `#EXTINF` durations and `#EXT-X-MAP` init segment references for fMP4 format.

MinIO adds one new Docker Compose service with S3-compatible API. The `minio` npm package (v8.0.7) provides `putObject`, `getObject`, `presignedGetObject`, `removeObject`, and `listObjects` -- all operations needed for this phase. No additional media processing libraries are needed since segments are stored as-is (no transcoding/merging per D-05).

**Primary recommendation:** Build a RecordingsModule with MinIO client wrapper service, extend `onHls()` callback handler, add BullMQ queues for retention cleanup and recording schedules, and implement dynamic m3u8 generation endpoint for playback.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Manual + Schedule recording trigger -- operators start/stop via button, configure scheduled recording windows (e.g., 08:00-18:00)
- **D-02:** on_hls callback archive mechanism -- SRS creates HLS segments, on_hls fires to backend, backend checks recording flag in DB, if enabled reads segment from shared volume and uploads to MinIO
- **D-03:** Schedule implementation via BullMQ repeatable jobs -- cron jobs toggle recording flag per camera at configured start/stop times
- **D-04:** Per-org bucket structure in MinIO -- one bucket per org (e.g., `org-{id}`), path: `{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}_{seq_no}.m4s`
- **D-05:** Store HLS fMP4 segments directly (.m4s files) -- no transcoding or merging to MP4. Backend generates m3u8 manifests dynamically for playback
- **D-06:** Docker Compose must add MinIO service with shared volume for SRS HLS output accessible by API container
- **D-07:** Timeline bar + calendar UI -- date selection, 24-hour horizontal timeline, colored segments, click/drag to select time range, hls.js playback
- **D-08:** Dynamic HLS manifest -- backend queries DB for segments in requested time range, generates m3u8 pointing to MinIO segments via pre-signed URLs or backend proxy
- **D-09:** Recording playback page lives within camera detail (new "Recordings" tab alongside existing tabs)
- **D-10:** Per-camera retention with org default -- each camera can override retention period, falls back to org-level default
- **D-11:** Storage quota enforcement -- alert at 80% and 90% of maxStorageGb. At 100% block new recordings. Uses NotificationsModule
- **D-12:** BullMQ cron cleanup job runs every hour -- scans for segments past retention, deletes from MinIO and removes DB records

### Claude's Discretion
- Prisma schema design for Recording, RecordingSegment, RecordingSchedule tables
- MinIO client library choice and configuration
- Exact timeline bar component implementation
- m3u8 manifest generation logic details
- Segment metadata tracking in DB (duration, size, sequence number)
- Storage usage calculation and caching strategy
- Error handling for failed uploads and partial recordings

### Deferred Ideas (OUT OF SCOPE)
- Redesign camera detail page -- existing 5-tab structure accommodates new Recordings tab
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REC-01 | Record camera streams via on_hls callback archiving segments to MinIO/S3 | on_hls callback body documented, MinIO putObject API verified, shared volume mount pattern established |
| REC-02 | Browse and playback recorded footage with time-range selection | Dynamic m3u8 generation pattern researched, hls.js already installed, timeline UI spec approved |
| REC-03 | Start/stop recording per camera | Recording flag in DB + on_hls conditional check pattern, Socket.IO for real-time status |
| REC-04 | Configurable retention policies per camera and per plan | BullMQ repeatable job pattern from Phase 6, per-camera override with org default fallback |
| REC-05 | Storage quota enforcement per organization with alerts | Package.maxStorageGb exists, NotificationsModule ready, storage calculation via MinIO listObjects or DB aggregation |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stream Engine:** SRS v6 (ossrs/srs:6) -- HLS segments served from `/usr/local/srs/objs/nginx/html`
- **Deployment:** Docker Compose single server
- **Tech Stack:** NestJS 11, Prisma 6, Next.js 15, PostgreSQL 16, Redis 7, BullMQ 5
- **HLS Config:** fMP4 segments (hls_use_fmp4 on), 2s fragments, 10s window
- **Callbacks:** on_hls already registered at `http://api:3001/api/srs/callbacks/on-hls`
- **No hand-rolling:** Use BullMQ for job queues, hls.js for playback, existing NotificationsModule for alerts
- **RLS pattern:** All org-scoped tables use shared-schema + org_id with PostgreSQL RLS

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| minio | 8.0.7 | MinIO/S3 client for Node.js | Official MinIO JavaScript SDK, S3-compatible API, supports putObject/getObject/presignedGetObject/removeObject/listObjects [VERIFIED: npm registry] |
| bullmq | 5.73.2 | Job queue for retention cleanup + recording schedules | Already installed, BullMQ repeatable job pattern established in Phase 6 [VERIFIED: package.json] |
| @nestjs/bullmq | 11.0.4 | NestJS BullMQ integration | Already installed [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hls.js | (already installed) | HLS playback in browser | Recording playback in Recordings tab [VERIFIED: web package.json] |
| socket.io | 4.8.3 | Real-time recording status | Broadcast recording start/stop events [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| minio npm | @aws-sdk/client-s3 | AWS SDK is larger (70+ packages), minio is purpose-built, simpler API, lighter footprint |
| Backend proxy for segments | Pre-signed URLs directly to MinIO | Pre-signed URLs reduce backend load but expose MinIO endpoint to clients; backend proxy is simpler for auth |
| DB-based storage tracking | MinIO listObjects for size calculation | DB aggregation is faster; listObjects is O(n) and slow for large buckets |

**Installation:**
```bash
cd apps/api && npm install minio
```

**Version verification:** `minio@8.0.7` confirmed as latest via npm registry on 2026-04-13 [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Module Structure
```
apps/api/src/
  recordings/
    recordings.module.ts          # NestJS module with BullMQ queues
    recordings.controller.ts      # REST endpoints (start/stop, list, playback manifest)
    recordings.service.ts         # Core recording logic
    recordings.gateway.ts         # Socket.IO /recording-status namespace
    minio.service.ts              # MinIO client wrapper (bucket ops, upload, presigned URLs)
    manifest.service.ts           # Dynamic m3u8 generation
    retention.service.ts          # Retention policy logic
    retention.processor.ts        # BullMQ processor for hourly cleanup
    schedule.processor.ts         # BullMQ processor for recording schedules
    dto/
      start-recording.dto.ts
      create-schedule.dto.ts
      update-retention.dto.ts
      recording-query.dto.ts
```

### Pattern 1: on_hls Callback Pipeline
**What:** SRS fires on_hls for every HLS segment created. Backend conditionally archives to MinIO.
**When to use:** Every time a camera has recording enabled.
**Example:**
```typescript
// Source: CLAUDE.md §SRS HTTP Callbacks + CONTEXT.md D-02
// on_hls callback body from SRS:
// { action, client_id, ip, vhost, app, stream, param, duration, cwd, file, url, m3u8, m3u8_url, seq_no, server_id, stream_url, stream_id }

async onHls(body: OnHlsCallbackDto): Promise<{ code: number }> {
  const { orgId, cameraId } = this.parseStreamKey(body.stream, body.app);
  if (!orgId || !cameraId) return { code: 0 };

  // Check if recording is active for this camera
  const recording = await this.recordingsService.getActiveRecording(cameraId, orgId);
  if (!recording) return { code: 0 };

  // Check storage quota before upload
  const quotaOk = await this.recordingsService.checkStorageQuota(orgId);
  if (!quotaOk) {
    // Emit storage alert, don't archive
    return { code: 0 };
  }

  // Read segment from shared volume and upload to MinIO
  const segmentPath = body.file; // e.g., ./objs/nginx/html/live/{orgId}/{cameraId}/...
  await this.recordingsService.archiveSegment(recording.id, orgId, cameraId, {
    filePath: segmentPath,
    duration: body.duration,
    seqNo: body.seq_no,
    url: body.url,
  });

  return { code: 0 };
}
```

### Pattern 2: Dynamic m3u8 Manifest Generation
**What:** Backend generates HLS playlist on-the-fly from DB segment records for a given time range.
**When to use:** When user requests playback of recorded footage.
**Example:**
```typescript
// Source: HLS spec + CONTEXT.md D-08
// fMP4 HLS manifest requires #EXT-X-MAP for init segment
generateManifest(segments: RecordingSegment[], initSegmentUrl: string): string {
  let m3u8 = '#EXTM3U\n';
  m3u8 += '#EXT-X-VERSION:7\n'; // Version 7 for fMP4
  m3u8 += '#EXT-X-TARGETDURATION:3\n';
  m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
  m3u8 += `#EXT-X-MAP:URI="${initSegmentUrl}"\n`;

  for (const seg of segments) {
    m3u8 += `#EXTINF:${seg.duration.toFixed(6)},\n`;
    m3u8 += `${seg.presignedUrl}\n`;
  }

  m3u8 += '#EXT-X-ENDLIST\n';
  return m3u8;
}
```

### Pattern 3: MinIO Client Wrapper Service
**What:** Singleton NestJS service wrapping MinIO client operations.
**When to use:** All MinIO interactions go through this service.
**Example:**
```typescript
// Source: MinIO JS docs (https://github.com/minio/minio-js)
@Injectable()
export class MinioService implements OnModuleInit {
  private client: Client;

  async onModuleInit() {
    this.client = new Client({
      endPoint: this.configService.get('MINIO_ENDPOINT', 'minio'),
      port: this.configService.get('MINIO_PORT', 9000),
      useSSL: false,
      accessKey: this.configService.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  async ensureBucket(orgId: string): Promise<void> {
    const bucket = `org-${orgId}`;
    const exists = await this.client.bucketExists(bucket);
    if (!exists) await this.client.makeBucket(bucket);
  }

  async uploadSegment(orgId: string, objectPath: string, filePath: string): Promise<void> {
    const bucket = `org-${orgId}`;
    const stream = createReadStream(filePath);
    await this.client.putObject(bucket, objectPath, stream);
  }

  async getPresignedUrl(orgId: string, objectPath: string, expirySeconds = 3600): Promise<string> {
    return this.client.presignedGetObject(`org-${orgId}`, objectPath, expirySeconds);
  }

  async removeObject(orgId: string, objectPath: string): Promise<void> {
    await this.client.removeObject(`org-${orgId}`, objectPath);
  }
}
```

### Pattern 4: BullMQ Repeatable Job for Retention Cleanup
**What:** Hourly cron job that scans for expired segments and deletes them.
**When to use:** Automatically, every hour (per D-12).
**Example:**
```typescript
// Source: Phase 6 cluster-health.processor.ts pattern
@Processor('recording-retention')
export class RetentionProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    // Query segments older than retention period per camera
    // Delete from MinIO + remove DB records
    // Update storage usage cache
  }
}

// In module:
BullModule.registerQueue({ name: 'recording-retention' }),
BullModule.registerQueue({ name: 'recording-schedule' }),
```

### Anti-Patterns to Avoid
- **Storing full file content in DB:** Only store metadata (path, duration, size, seq_no) in PostgreSQL. Actual segments go to MinIO.
- **Synchronous MinIO uploads in callback:** The on_hls callback should not block SRS. Use fire-and-forget with error logging, or enqueue to BullMQ if upload latency is a concern.
- **Generating m3u8 files and storing them:** Manifests should be generated dynamically per request, not pre-generated and stored. Time range is user-selected at playback time.
- **Using SRS built-in DVR:** DVR config requires srs.conf reload per camera, was partially removed in v4. External archival via on_hls is the correct approach (per D-02).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Object storage client | Custom HTTP S3 client | `minio` npm package (8.0.7) | S3 protocol is complex (signing, multipart, retry); minio handles all edge cases |
| Job scheduling | Custom setInterval/cron | BullMQ repeatable jobs | Already in stack, persistent across restarts, distributed locking, retry logic |
| HLS playback | Custom video player | hls.js (already installed) | fMP4 parsing, ABR, error recovery, browser compatibility |
| Storage alerts | Custom polling system | NotificationsModule (Phase 5) | Already has delivery preferences, Socket.IO broadcast, notification bell UI |
| Presigned URL generation | Custom token + redirect | MinIO `presignedGetObject` | Time-limited, cryptographically signed, standard S3 presigned URLs |

**Key insight:** The recording pipeline is mostly glue code connecting existing systems (SRS callbacks -> file read -> MinIO upload -> DB metadata). The complexity is in edge cases (failed uploads, partial recordings, init segment tracking for fMP4) not in the core flow.

## Common Pitfalls

### Pitfall 1: Missing fMP4 Init Segment
**What goes wrong:** fMP4 HLS uses a separate initialization segment (`init.mp4` or `.m4s` with moov atom) that contains codec configuration. Without it, the player cannot decode any media segments.
**Why it happens:** SRS writes the init segment once when a stream starts publishing. The on_hls callback fires for media segments but the init segment may not trigger a separate callback.
**How to avoid:** When recording starts (or on first on_hls callback for a recording session), detect and archive the init segment from the m3u8 file's `#EXT-X-MAP:URI` directive. Store its MinIO path in the Recording model. Include it in every generated m3u8 manifest.
**Warning signs:** Player shows error "fMP4 init segment not found" or plays audio-only.

### Pitfall 2: on_hls Callback Volume Under Load
**What goes wrong:** With 2s HLS fragments, each camera generates 30 callbacks/minute. 50 cameras = 1,500 callbacks/minute, each requiring a file read + MinIO upload.
**Why it happens:** on_hls fires for every segment regardless of recording state. The check-and-skip path must be fast.
**How to avoid:** Cache active recording flags in Redis (or in-memory Map) for O(1) lookup. Don't query DB on every callback. Only read file + upload when recording is active. Consider queueing uploads via BullMQ if MinIO latency is a concern.
**Warning signs:** SRS callback timeouts (default 30s), segment files being cleaned up before upload.

### Pitfall 3: SRS Segment Cleanup Race Condition
**What goes wrong:** SRS has `hls_cleanup on` and `hls_dispose 30` -- it deletes old segments after 30s. If the backend doesn't read the segment file quickly enough after on_hls fires, the file may already be deleted.
**Why it happens:** The on_hls callback fires when a segment is created, but SRS manages its own cleanup lifecycle independently.
**How to avoid:** Process on_hls callbacks synchronously (read file immediately in the callback handler before returning). Alternatively, increase `hls_dispose` to give more buffer time (e.g., 120s). The file path is in `body.file` -- read it immediately.
**Warning signs:** ENOENT errors when reading segment files, gaps in recorded footage.

### Pitfall 4: Storage Quota Calculation Drift
**What goes wrong:** If storage usage is only calculated from DB records (SUM of segment sizes), it can drift from actual MinIO usage due to failed deletes, orphaned objects, or partial uploads.
**Why it happens:** Distributed systems have eventual consistency. DB and MinIO can disagree.
**How to avoid:** Use DB-based calculation as primary (fast, indexed) but run periodic reconciliation job that compares DB totals with MinIO `listObjects` actual sizes. Cache the calculated total in Redis with short TTL (5 minutes).
**Warning signs:** Storage alerts not matching actual usage, quota not enforced correctly.

### Pitfall 5: Docker Volume Sharing Between SRS and API
**What goes wrong:** API container cannot read SRS HLS segment files.
**Why it happens:** SRS writes to its own named volume (`srs_data:/usr/local/srs/objs`). The API container doesn't have access to this volume by default.
**How to avoid:** Mount `srs_data` volume in both SRS and API containers. SRS writes to `/usr/local/srs/objs/nginx/html`, API reads from the same mount. Alternatively, use a named volume shared between both services.
**Warning signs:** ENOENT or EACCES errors when reading segment files in on_hls handler.

### Pitfall 6: m3u8 Pre-signed URL Expiration During Playback
**What goes wrong:** User starts playing a 2-hour recording. Pre-signed URLs in the m3u8 expire after 1 hour. Player fails mid-playback.
**Why it happens:** All segment URLs are generated at manifest request time with the same expiry.
**How to avoid:** Either (a) set pre-signed URL expiry to be generous (e.g., 4 hours), or (b) use a backend proxy endpoint that streams segments from MinIO (simpler auth, no expiry issues, but adds backend load). Recommendation: backend proxy is simpler and more secure for this use case.
**Warning signs:** 403 errors from MinIO during playback after some time.

## Code Examples

### Docker Compose MinIO Service Addition
```yaml
# Source: MinIO Docker docs (https://github.com/minio/minio/blob/master/docs/docker/README.md)
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"    # S3 API
      - "9001:9001"    # Console UI
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - sms-network

volumes:
  minio_data:
```
[VERIFIED: MinIO Docker documentation]

### Shared Volume Mount for SRS + API
```yaml
# Both services mount the same volume for HLS segment access
  srs:
    volumes:
      - ./config/srs.conf:/usr/local/srs/conf/srs.conf
      - srs_hls:/usr/local/srs/objs/nginx/html  # HLS output

  api:
    volumes:
      - srs_hls:/srs-hls:ro  # Read-only mount of SRS HLS output

volumes:
  srs_hls:
```
[ASSUMED -- volume sharing pattern is standard Docker Compose]

### Prisma Schema Additions (Recommended)
```prisma
// Source: Project conventions from existing schema patterns

model Recording {
  id            String    @id @default(uuid())
  orgId         String
  cameraId      String
  status        String    @default("recording") // "recording" | "complete" | "error"
  startedAt     DateTime  @default(now())
  stoppedAt     DateTime?
  totalSize     BigInt    @default(0)       // bytes
  totalDuration Float     @default(0)       // seconds
  initSegment   String?                     // MinIO path to fMP4 init segment
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  segments      RecordingSegment[]

  @@index([orgId])
  @@index([cameraId])
  @@index([orgId, cameraId, startedAt])
  @@index([status])
}

model RecordingSegment {
  id           String    @id @default(uuid())
  orgId        String
  recordingId  String
  recording    Recording @relation(fields: [recordingId], references: [id], onDelete: Cascade)
  cameraId     String
  objectPath   String    // MinIO path: {cameraId}/{YYYY-MM-DD}/{HH-MM-SS}_{seq_no}.m4s
  duration     Float     // seconds
  size         BigInt    // bytes
  seqNo        Int
  timestamp    DateTime  // actual time of segment
  createdAt    DateTime  @default(now())

  @@index([orgId])
  @@index([recordingId])
  @@index([cameraId, timestamp])
  @@index([orgId, cameraId, timestamp])  // For time-range queries
}

model RecordingSchedule {
  id           String    @id @default(uuid())
  orgId        String
  cameraId     String
  scheduleType String    // "daily" | "weekly" | "custom"
  config       Json      // { startTime, endTime, days?, windows? }
  enabled      Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([orgId])
  @@index([cameraId])
  @@index([enabled])
}
```
[ASSUMED -- schema design is Claude's discretion per CONTEXT.md]

### OrgSettings Extension for Default Retention
```prisma
// Add to existing OrgSettings model:
  defaultRetentionDays Int @default(30)
```
[ASSUMED -- follows existing OrgSettings pattern]

### Camera Extension for Per-Camera Retention
```prisma
// Add to existing Camera model:
  retentionDays    Int?     // null = use org default
  isRecording      Boolean  @default(false)  // current recording state
```
[ASSUMED -- per-camera override pattern from D-10]

### on_hls Callback Body DTO
```typescript
// Source: SRS HTTP Callback docs (https://ossrs.net/lts/en-us/docs/v5/doc/http-callback)
import { z } from 'zod';

export const onHlsCallbackSchema = z.object({
  action: z.literal('on_hls'),
  client_id: z.string(),
  ip: z.string(),
  vhost: z.string(),
  app: z.string(),
  stream: z.string(),
  param: z.string().optional(),
  duration: z.number(),        // segment duration in seconds
  cwd: z.string(),             // SRS working directory
  file: z.string(),            // absolute file path of segment
  url: z.string(),             // relative URL of segment
  m3u8: z.string(),            // absolute path to m3u8 playlist
  m3u8_url: z.string(),        // relative URL of m3u8
  seq_no: z.number(),          // sequence number
  server_id: z.string().optional(),
  stream_url: z.string().optional(),
  stream_id: z.string().optional(),
});
```
[CITED: https://ossrs.net/lts/en-us/docs/v5/doc/http-callback]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SRS built-in DVR (config-based) | External archival via on_hls callback | SRS v4 (DVR API removed) | Must use callback + external storage instead of SRS native recording |
| MPEG-TS HLS segments (.ts) | fMP4 HLS segments (.m4s) | SRS v6 | Better codec support (H.265), smaller overhead, requires #EXT-X-MAP init segment handling |
| Static m3u8 files on disk | Dynamic m3u8 generation per request | Current best practice | Enables time-range selection, pre-signed URLs, no file management |
| Local disk recording storage | Object storage (MinIO/S3) | Industry standard | Scalable, separate storage lifecycle, S3-compatible API |

**Deprecated/outdated:**
- SRS RAW API for DVR control: Removed in v4+, no longer functional [CITED: https://github.com/ossrs/srs/issues/2653]
- SRS ingest-based recording: Requires config reload per camera, not suitable for dynamic recording [VERIFIED: CLAUDE.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Docker named volume can be shared read-only between SRS and API containers for segment file access | Architecture Patterns | HIGH -- if volume sharing doesn't work, entire on_hls pipeline fails. Alternative: copy via API or use MinIO directly from SRS (not feasible) |
| A2 | SRS on_hls callback fires BEFORE segment cleanup (hls_dispose) | Common Pitfalls | HIGH -- if callback fires after cleanup, segment file is already deleted |
| A3 | fMP4 init segment is available at a predictable path in SRS HLS output directory | Common Pitfalls | MEDIUM -- if init segment path is not predictable, need to parse m3u8 to find it |
| A4 | Prisma schema design with Recording/RecordingSegment/RecordingSchedule tables | Code Examples | LOW -- schema is Claude's discretion, can be adjusted |
| A5 | MinIO healthcheck uses `mc ready local` command | Code Examples | LOW -- Docker healthcheck may need adjustment for MinIO image |
| A6 | Backend proxy approach for segment delivery is preferable over direct pre-signed URLs | Common Pitfalls | LOW -- either approach works, proxy is simpler for auth |

## Open Questions

1. **Init segment handling for fMP4**
   - What we know: fMP4 HLS requires an init segment referenced by `#EXT-X-MAP`. SRS generates this when a stream starts.
   - What's unclear: Does SRS fire on_hls for the init segment, or only for media segments? Is the init segment path predictable?
   - Recommendation: On first on_hls for a recording session, parse the m3u8 file (path in `body.m3u8`) to extract `#EXT-X-MAP:URI` and archive the init segment separately.

2. **Segment file path resolution in Docker**
   - What we know: SRS sends `file: "./objs/nginx/html/live/{orgId}/{cameraId}/..."` in on_hls body. The `cwd` field is `/usr/local/srs`.
   - What's unclear: In the API container, the mount point will be different (e.g., `/srs-hls`). Need to map paths.
   - Recommendation: Strip the SRS prefix from `body.file` or `body.url` and prepend the API container's mount path.

3. **Segment size tracking**
   - What we know: on_hls body includes `duration` but not `size` (file size in bytes).
   - What's unclear: Need file size for storage quota tracking.
   - Recommendation: Use `fs.stat()` on the segment file before uploading to get actual size, or get the size from the MinIO putObject response.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | MinIO service, shared volumes | Yes | 28.3.2 | -- |
| MinIO Docker image | Object storage | Yes (pulled) | latest | -- |
| minio npm package | Backend MinIO client | Not yet installed | 8.0.7 (latest) | Install in Wave 0 |
| PostgreSQL | DB tables for recordings | Yes | 16 | -- |
| Redis | BullMQ queues for retention/schedule | Yes | 7 (alpine) | -- |
| SRS | on_hls callbacks, HLS segment generation | Yes | v6.0 | -- |
| hls.js | Recording playback in browser | Yes (installed) | -- | -- |

**Missing dependencies with no fallback:**
- None -- all dependencies available or installable

**Missing dependencies with fallback:**
- `minio` npm package needs installation (install step in Wave 0)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && npx vitest run tests/recordings/ --reporter=verbose` |
| Full suite command | `cd apps/api && npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REC-01 | on_hls callback archives segment to MinIO when recording active | unit | `npx vitest run tests/recordings/archive-segment.test.ts -t "archives segment"` | No -- Wave 0 |
| REC-01 | on_hls callback skips archive when recording inactive | unit | `npx vitest run tests/recordings/archive-segment.test.ts -t "skips when not recording"` | No -- Wave 0 |
| REC-02 | Dynamic m3u8 manifest generated for time range | unit | `npx vitest run tests/recordings/manifest.test.ts -t "generates manifest"` | No -- Wave 0 |
| REC-03 | Start recording creates Recording record and sets flag | unit | `npx vitest run tests/recordings/recording-lifecycle.test.ts -t "starts recording"` | No -- Wave 0 |
| REC-03 | Stop recording finalizes Recording and clears flag | unit | `npx vitest run tests/recordings/recording-lifecycle.test.ts -t "stops recording"` | No -- Wave 0 |
| REC-04 | Retention cleanup deletes expired segments | unit | `npx vitest run tests/recordings/retention.test.ts -t "deletes expired"` | No -- Wave 0 |
| REC-05 | Storage quota blocks new recordings at 100% | unit | `npx vitest run tests/recordings/storage-quota.test.ts -t "blocks at quota"` | No -- Wave 0 |
| REC-05 | Storage alerts sent at 80% and 90% thresholds | unit | `npx vitest run tests/recordings/storage-quota.test.ts -t "sends alert"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && npx vitest run tests/recordings/ --reporter=verbose`
- **Per wave merge:** `cd apps/api && npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/recordings/archive-segment.test.ts` -- covers REC-01 (on_hls callback pipeline)
- [ ] `tests/recordings/manifest.test.ts` -- covers REC-02 (m3u8 generation)
- [ ] `tests/recordings/recording-lifecycle.test.ts` -- covers REC-03 (start/stop)
- [ ] `tests/recordings/retention.test.ts` -- covers REC-04 (retention cleanup)
- [ ] `tests/recordings/storage-quota.test.ts` -- covers REC-05 (quota enforcement + alerts)
- [ ] `tests/recordings/schedule.test.ts` -- covers D-03 (BullMQ schedule jobs)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Recording endpoints protected by existing AuthGuard + FeatureGuard |
| V3 Session Management | No | Uses existing session infrastructure |
| V4 Access Control | Yes | FeatureGuard (FeatureKey.RECORDINGS) + org-scoped RLS on Recording tables |
| V5 Input Validation | Yes | Zod schemas for all recording DTOs, on_hls callback body validation |
| V6 Cryptography | No | MinIO pre-signed URLs use HMAC-SHA256 (handled by minio SDK) |

### Known Threat Patterns for Recording Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized recording access | Information Disclosure | RLS on Recording/RecordingSegment tables, FeatureGuard on endpoints |
| Path traversal via on_hls file path | Tampering | Validate and sanitize file paths from SRS callback, restrict to known mount prefix |
| Storage quota bypass via rapid uploads | Denial of Service | Atomic quota check before each upload, quota enforcement in on_hls handler |
| MinIO credential exposure | Information Disclosure | Env vars for MinIO credentials, never expose to frontend, backend proxy for segment access |
| Cross-org segment access | Elevation of Privilege | Per-org buckets in MinIO, RLS on DB, org_id validation on all endpoints |

## Sources

### Primary (HIGH confidence)
- SRS HTTP Callback docs (https://ossrs.net/lts/en-us/docs/v5/doc/http-callback) -- on_hls callback body fields
- MinIO JS GitHub (https://github.com/minio/minio-js) -- Client API reference
- npm registry -- minio@8.0.7 version verification
- Existing codebase -- BullMQ patterns, Prisma schema, SRS callback controller, docker-compose.yml

### Secondary (MEDIUM confidence)
- MinIO Docker docs (https://github.com/minio/minio/blob/master/docs/docker/README.md) -- Docker Compose setup
- SRS HLS docs (https://ossrs.net/lts/en-us/docs/v7/doc/hls) -- fMP4 configuration reference

### Tertiary (LOW confidence)
- Docker shared volume patterns between containers -- standard practice but not verified in this specific setup

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- minio package verified, all other dependencies already in project
- Architecture: HIGH -- patterns directly extend existing codebase (callbacks, BullMQ, Prisma)
- Pitfalls: MEDIUM -- fMP4 init segment handling and volume sharing need runtime verification
- Schema design: MEDIUM -- follows project conventions but is Claude's discretion

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable domain, 30 days)
