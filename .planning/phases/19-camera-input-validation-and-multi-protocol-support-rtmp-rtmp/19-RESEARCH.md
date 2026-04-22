# Phase 19: Camera input validation and multi-protocol support (RTMP/RTMPS) - Research

**Researched:** 2026-04-22
**Domain:** Camera ingest pipeline — DTO validation, ffprobe, ffmpeg command builder, BullMQ probe queue, Prisma unique constraint, 3-state cell UI
**Confidence:** HIGH (nearly every decision is file:line-grounded in the existing codebase; a few `[CITED]` external facts on SRS response shape and ffmpeg protocol flags)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Probe Strategy (codec/resolution population)**
- **D-01:** Probe runs asynchronously on BullMQ `stream-probe` queue. `createCamera` (single) enqueues a probe job immediately after commit, same pattern as existing `bulkImport`. Save is never blocked by ffprobe; form returns as soon as the row is written.
- **D-02:** Probe also refreshes on stream start — the first successful FFmpeg ingest reads SRS `/api/v1/streams/{id}` and writes the authoritative `codecInfo` (ground truth, since FFmpeg is already running and has negotiated the stream).
- **D-03:** No sync inline probe, no hybrid reachability pre-check, no scheduled re-probe. Two triggers total: on create, and on stream start.
- **D-04:** BullMQ `jobId = "probe:{cameraId}"` for idempotency — mirrors the `camera:{cameraId}` dedup pattern from Phase 15 D-11. Duplicate enqueues are merged automatically.

**Probe UI States (codec/resolution column + detail)**
- **D-05:** Codec column renders three visual states + no-data (4 total): pending (spinner), failed (amber warning + error tooltip), no-data (`—`), success (existing `H.264 · 1920×1080`).
- **D-06:** When state is `failed`, a small retry icon renders inline in the cell. Clicking re-enqueues the probe job (same `jobId`, BullMQ drops if one is already queued).
- **D-07:** `codecInfo` JSON schema extends to carry status: `{ status: "pending" | "failed" | "success", video: {...}, audio: {...}, error: "...", probedAt: ISO }`. Replaces today's ad-hoc shape (empty `{}` or `{ error }` blob or populated).

**Duplicate Detection (bulk import + single add)**
- **D-08:** Duplicate policy: **skip-with-warning**, not hard-reject. In bulk import, rows whose URL exists (within-file or against-DB for the same org) are marked with a distinct "Duplicate" icon. The Import button stays enabled. On confirm, duplicates are silently skipped; the result toast lists how many were imported vs skipped.
- **D-09:** URL comparison is **exact string match**, not normalized. `rtsp://u:p@host/s1` ≠ `rtsp://u:p@host:554/s1`. Predictable, matches DB unique constraint.
- **D-10:** Duplicate detection happens at **three layers**: (a) client-side within-file dedup in `bulk-import-dialog.tsx` `validateRow`, (b) server-side pre-insert query in `cameras.service.ts` `bulkImport`, (c) Prisma `@@unique([orgId, streamUrl])` as the DB safety net that catches races.
- **D-11:** P2002 (Prisma unique violation) is caught and translated to `DuplicateStreamUrlError` at the service layer so API responses stay user-friendly.

**Protocol Support (RTMP/RTMPS)**
- **D-12:** Extend zod refine in `create-camera.dto.ts`, `update-camera.dto.ts`, `bulk-import.dto.ts` to accept `rtsp://|srt://|rtmp://|rtmps://`. No direct-ingest path via SRS callbacks — RTMP flows through FFmpeg just like RTSP.
- **D-13:** Protocol-branch the `-rtsp_transport tcp` flag in both `ffprobe.service.ts` and `ffmpeg-command.builder.ts`. Only add the flag when URL starts with `rtsp://`. For RTMP/SRT, omit it.
- **D-14:** Rename the internal job payload field `rtspUrl` → `inputUrl` (in `StreamJobData` and its callers). DB column `Camera.streamUrl` is already protocol-neutral and stays untouched.

**Frontend Validation (Add Camera + Bulk Import)**
- **D-15:** Add Camera dialog (`camera-form-dialog.tsx`) adds live prefix validation mirroring the backend zod refine (`rtsp|srt|rtmp|rtmps`). Submit button stays disabled with an inline error when the URL fails the prefix check.
- **D-16:** Bulk import (`bulk-import-dialog.tsx`) `validateRow` is extended: same prefix check as D-15, plus a non-empty host segment, plus within-file duplicate detection. Footer counter becomes "N valid, M duplicate" when duplicates exist.
- **D-17:** Bulk import server DTO (`bulk-import.dto.ts`) is brought to parity with `create-camera.dto.ts` — add `.url()` to the streamUrl field.

**Test URL Endpoint**
- **D-18:** No pre-save Test URL endpoint. Async probe + failed-state UI + retry cover the UX.

### Claude's Discretion
- Exact copy for error tooltips in the failed-probe state (English, concise — **resolved in UI-SPEC §"Error Reason Copy Dictionary"**)
- Migration strategy for existing duplicate rows before `@@unique([orgId, streamUrl])` applies: planner decides between (a) dedup query keeping oldest/newest, (b) soft-delete, (c) fail migration with operator runbook
- Whether to expose the probe `status` field to API clients or keep it internal (probably expose — cleaner contract for the UI)
- Exact regex/parser for the host segment in bulk-import client validation — use `new URL()` parsing where possible rather than regex

### Deferred Ideas (OUT OF SCOPE)
- SRS direct RTMP ingest (zero-transcode path via `on_publish`)
- Camera credentials as separate fields (rotation support)
- Scheduled re-probe (daily/weekly)
- URL normalization for duplicate detection
- CSV "Overwrite existing" import mode

</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 19 has **no explicit REQ-IDs** in REQUIREMENTS.md (v1.2 requirements are mapped to Phases 14–18). Phase 19 closes five gaps from the `camera-stream-validation-audit.md` investigation — map those gaps to internal REQ-IDs below.

| ID | Description | Research Support |
|----|-------------|------------------|
| P19-01 | Single-camera create enqueues ffprobe job (D-01) | `cameras.service.ts:127-152` `createCamera` has zero probe call today; `bulkImport` has the pattern at lines 356-369 to copy. Probe queue already registered at `streams.module.ts:15`. |
| P19-02 | Stream-start path refreshes codecInfo from SRS (D-02) | SRS on-publish callback at `srs-callback.controller.ts:23-31` is the integration point — already transitions camera to `online`. SRS `/api/v1/streams` returns `{video: {codec, profile, level, width, height}, audio: {codec, sample_rate, channel, profile}}` (verified externally, section "State of the Art" below). |
| P19-03 | `codecInfo` JSON schema extended with `status` + normalized `error` (D-07) | Today's write sites: `stream-probe.processor.ts:46-59` (success) + `:70-79` (failure) + `cameras.controller.ts:291-300` (test-connection). All three must emit the new shape. |
| P19-04 | 3-state codec cell UI + inline retry (D-05, D-06) | `cameras-columns.tsx:148-172` renders current cell; UI-SPEC component inventory calls out extraction to `codec-status-cell.tsx`. |
| P19-05 | Duplicate detection 3-layer (D-08, D-10, D-11) + zod-refine protocol extension (D-12, D-15, D-17) + bulk-import `validateRow` extension (D-16) | Current refine at `create-camera.dto.ts:5-8`, `update-camera.dto.ts:8-11`, `bulk-import.dto.ts:5-7`; client validateRow at `bulk-import-dialog.tsx:152-172`; existing P2002 pattern at `organizations.service.ts:25-27`. |
| P19-06 | Prisma `@@unique([orgId, streamUrl])` + migration for existing duplicates | Schema at `schema.prisma:199-234` has no unique today; repo uses `prisma db push` + hand-written SQL migrations (section "State of the Art"). |
| P19-07 | Protocol-branch ffprobe + ffmpeg builder (D-13) | Hardcode at `ffprobe.service.ts:24` and `ffmpeg-command.builder.ts:20`. |
| P19-08 | Rename `rtspUrl` → `inputUrl` in StreamJobData + all callers (D-14) | 7 file hits — see "Reusable Assets" below. |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

Load-bearing directives that the planner must NOT contradict:

- **Stream Engine = SRS** (v6.0-r0, MIT, Docker `ossrs/srs:6`). Replaces MediaMTX. No other engine considered.
- **SRS has NO native RTSP** — RTSP removed in v5+. All camera RTSP must flow through FFmpeg wrapper that pulls RTSP and pushes RTMP to SRS port 1935. This is the canonical pipeline; Phase 19 does NOT change it — it extends it to also accept RTMP/RTMPS/SRT inputs that flow through the same FFmpeg wrapper.
- **No SRS built-in ingest for dynamic cameras.** Backend-managed FFmpeg is the only path. Phase 19 therefore does NOT wire SRS `on_publish` as a camera-ingest trigger for RTMP (that is the deferred "zero-transcode path" in CONTEXT).
- **No GraphQL.** REST + OpenAPI only. Phase 19 adds no new REST endpoints (per D-18); existing `POST /cameras`, `POST /cameras/bulk-import`, `POST /cameras/:id/test-connection` absorb the new behavior.
- **Tech stack locked:** NestJS 11 + Prisma 6 + Next.js 15 + BullMQ 5 + ioredis 5 + FFmpeg 7.x + zod (3 API / 4 web). All Phase 19 work stays within this stack — no new runtime deps.
- **Deployment: Docker Compose single server.** No Kubernetes, no k8s-specific migration tooling.
- **UI: shadcn `base-nova` preset + Lucide icons + Tailwind.** No new component library. [VERIFIED: `apps/web/components.json`]

CLAUDE.md also notes `_rtsp_transport` is RTSP-only (§13 "FFmpeg + SRS Pipeline"). That directly supports D-13 and is the primary motivation.

## Summary

Phase 19 is an **extension phase**, not a greenfield build. Every single decision has an existing file to modify or a well-established pattern to mirror. The highest-leverage insight: the BullMQ `stream-probe` queue already exists (quick task 260421-f0c commit `1800a7d+ff1cdc1`), the `StreamProbeProcessor` is registered and working, and `bulkImport` already enqueues to it — the work is (1) copy that enqueue pattern into `createCamera`, (2) add a second enqueue call from the SRS `on-publish` callback path, (3) extend the payload shape, and (4) branch the ffprobe/ffmpeg protocol flag in two files.

Duplicate detection is the second lever. The 3-layer defense is standard: WHATWG `new URL()` for client within-file dedup (already idiomatic in the `ffprobe.service.ts:57-67` `redactUrl` helper — pattern already in the repo), `findMany({where: {orgId, streamUrl: {in: [...]}}})` for the server pre-check, and Prisma `@@unique([orgId, streamUrl])` as the race-safety net. The P2002 translation is a 3-line `try/catch` wrapper copied verbatim from `organizations.service.ts:24-28`.

The tripwire is the **migration for existing duplicates**: `prisma db push` (this repo's method — not `prisma migrate`) will fail loudly if duplicates exist. The planner must choose a cleanup strategy before the `@@unique` constraint applies. Recommended: a small pre-migration SQL script that keeps the oldest row per `(orgId, streamUrl)` tuple (matches D-14's "auto-restart on exit" defensive ethos — don't surprise the operator).

**Primary recommendation:** Plan the phase as 5 waves — (W0) test scaffolds + zod DTO update + codecInfo type, (W1) backend probe wiring (createCamera enqueue + on-publish refresh + protocol-branch builders), (W2) Prisma `@@unique` + migration script + P2002 translation + service-layer dedup, (W3) UI — codec-status-cell + bulk-import validateRow extension + camera-form live validation, (W4) rename `rtspUrl → inputUrl` (mechanical, goes last to avoid merge conflicts with W1).

## Standard Stack

### Core (already in repo, no installs)

| Library | Version (installed) | Version (latest) | Purpose | Why Standard |
|---------|---------------------|------------------|---------|--------------|
| @nestjs/bullmq | 11.0.4 | — | Queue decorators + `@InjectQueue` | [VERIFIED: `apps/api/package.json:22`] Already wiring `stream-probe` in `streams.module.ts:15` |
| bullmq | 5.73.2 | 5.75.2 | `stream-probe` queue worker | [VERIFIED: npm view bullmq version → 5.75.2] Minor bump only; no breaking changes. Repo's `jobId` idempotency pattern is stock BullMQ. |
| @prisma/client | 6.19.3 | 7.7.0 | ORM — adds `@@unique` + P2002 class | [VERIFIED: `apps/api/package.json:36`, npm view @prisma/client → 7.7.0] **DO NOT** bump in this phase — major-version change is out of scope. Current 6.x supports `@@unique` + `Prisma.PrismaClientKnownRequestError` exactly as we need. |
| zod | 3.25.76 (API) / 4.3.6 (web) | 4.3.6 | DTO schema + `.refine()` | [VERIFIED: both `package.json` files] Mismatch between API and web is pre-existing and NOT in Phase 19 scope. zod 3 `.refine()` API is compatible with the single-file changes we need. |
| fluent-ffmpeg | 2.1.3 | — | `inputOptions()` builder | [VERIFIED: `apps/api/package.json:30`] Already used in `ffmpeg-command.builder.ts:19-20`. Protocol-branch fix is a one-line conditional. |
| lucide-react | 1.8.0 | — | Icons `Loader2`, `AlertTriangle`, `RotateCw`, `Copy` | [VERIFIED: `apps/web/package.json:21`] All four icons already used elsewhere in the web app — `Loader2` + `animate-spin` pattern verified at `add-team-member-dialog.tsx:235`, `recordings-data-table.tsx:571,606`; `RotateCw` at `app/recordings/[id]/page.tsx:164`. |

### Supporting (no new additions needed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @base-ui/react + shadcn `tooltip` | 1.3.0 | Codec-cell tooltips | Already wired in `cameras-columns.tsx:64-117` (Status column). Pattern verified. |
| sonner | 2.0.7 | Post-import toast ("Imported N, skipped M duplicates") | Already wired in `bulk-import-dialog.tsx:5,228,341,349`. No new import. |
| xlsx | 0.18.5 | CSV/Excel parsing | Already wired at `bulk-import-dialog.tsx:6,136-150`. Unchanged. |
| @tanstack/react-table | 8.21.3 | DataTable | Unchanged; codec cell is just a `cell` renderer. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BullMQ `stream-probe` queue | Inline `Promise.resolve().then(...)` fire-and-forget | **D-01 rejects this.** Inline has no retry semantics, no idempotency dedup, no visibility. BullMQ is the chosen pattern (D-04) and we already have the queue. |
| WHATWG `new URL(streamUrl).hostname` host check | Regex `/^(rtsp|srt|rtmp|rtmps):\/\/[^/\s]+/i.test(url)` | [CITED: WHATWG URL Standard] URL parser handles IPv6, port, credentials, punycode, percent-encoding correctly. Regex misses edge cases. CONTEXT explicitly calls this out as Claude's discretion → use `new URL()`. |
| Normalize URL before dedup | Exact string match | **D-09 rejects normalization.** Predictable + matches DB unique constraint + avoids false-hide of real duplicates. |
| Prisma `@@unique([orgId, streamUrl])` | Application-only check | **D-10 rejects app-only.** DB constraint is the race safety net. The user explicitly chose "both" in Q3 of CONTEXT discussion. |
| `POST /cameras/test-url` endpoint (SSRF-adjacent) | No endpoint (D-18) | User explicitly said "ไม่ต้องมี test url ก็ได้" — the duplicate check + async probe covers the real user intent. |
| Scheduled re-probe every 24h | On-stream-start refresh | **D-03 rejects scheduled re-probe.** Stream-start trigger refreshes whenever the stream restarts — already covers the common case. |

**Installation:** None. All packages already present.

**Version verification:** Confirmed via `npm view` on 2026-04-22 — `zod@4.3.6`, `bullmq@5.75.2`, `@prisma/client@7.7.0`. Repo versions are 1–2 minor releases behind latest but API-compatible.

## Architecture Patterns

### Recommended File Change Map (grounded in existing structure)

```
apps/api/src/
├── cameras/
│   ├── dto/
│   │   ├── create-camera.dto.ts       # D-12: extend refine allowlist
│   │   ├── update-camera.dto.ts       # D-12: extend refine allowlist
│   │   └── bulk-import.dto.ts         # D-12 + D-17: allowlist + add .url()
│   ├── cameras.service.ts             # D-01: enqueue probe in createCamera
│   │                                    D-10b: pre-insert dedup query in bulkImport
│   │                                    D-11: P2002 → DuplicateStreamUrlError translation
│   │                                    + NEW: errors/duplicate-stream-url.error.ts (tiny)
│   ├── ffprobe.service.ts             # D-13: protocol-branch -rtsp_transport flag
│   └── cameras.module.ts              # unchanged (queue already re-registered L14)
├── streams/
│   ├── ffmpeg/ffmpeg-command.builder.ts   # D-13: same protocol-branch
│   ├── processors/
│   │   ├── stream.processor.ts        # D-14: rtspUrl → inputUrl
│   │   └── stream-probe.processor.ts  # D-07: extend codecInfo shape + D-02 normalize error tooltips
│   └── streams.service.ts             # D-14: rename in StreamJobData builder
├── resilience/
│   └── job-data.helper.ts             # D-14: one-line rename (line 28)
├── srs/
│   └── srs-callback.controller.ts     # D-02: enqueue probe from on-publish path
│   └── srs-api.service.ts             # NEW method: getStream(streamKey) for D-02 fetch
└── prisma/
    ├── schema.prisma                  # @@unique([orgId, streamUrl])
    └── migrations/
        └── camera_stream_url_unique/  # NEW migration folder (convention: `prisma db push` + hand-SQL)
            └── migration.sql          # dedup keep-oldest + ADD CONSTRAINT

apps/web/src/app/admin/cameras/components/
├── bulk-import-dialog.tsx             # D-16: validateRow + duplicate flag + 3rd counter + toast
├── camera-form-dialog.tsx             # D-15: live prefix validation + helper-text slot
├── cameras-columns.tsx                # D-05/D-06: replace codec cell with <CodecStatusCell>
└── codec-status-cell.tsx (NEW)        # 4-state cell extracted per UI-SPEC

apps/web/src/lib/
└── stream-url-validation.ts (NEW)     # shared validatePrefix() — per UI-SPEC optional
```

### Pattern 1: BullMQ Probe Enqueue with `jobId` Idempotency (D-04)

**What:** Every probe enqueue uses `jobId = "probe:{cameraId}"`. BullMQ deduplicates — a second enqueue while the first is still pending returns the same job without queuing a duplicate.

**When to use:** (a) `createCamera` after commit, (b) SRS `on-publish` callback → refresh from SRS, (c) inline retry icon click from the UI.

**Example (existing pattern to copy, file:line grounded):**

```typescript
// Source: apps/api/src/cameras/cameras.service.ts:356-369 (bulkImport already does this)
if (this.probeQueue) {
  for (const camera of cameras) {
    try {
      await this.probeQueue.add('probe-camera', {
        cameraId: camera.id,
        streamUrl: camera.streamUrl,
        orgId,
      }, {
        jobId: `probe:${camera.id}`,  // NEW — the existing bulk import lacks jobId; add here too
      });
    } catch (err) {
      this.logger.warn(`Failed to enqueue probe for camera ${camera.id}: ${(err as Error).message}`);
    }
  }
}
```

Pattern variants (all three share the same `jobId` so dedup works cross-trigger):

1. **createCamera (D-01):** Copy the above block minus the loop. Wrap in `if (this.probeQueue)` guard — the existing bulkImport path explicitly handles `probeQueue` being undefined in test environments (see comment at `cameras.service.ts:27-29`).

2. **SRS on-publish (D-02):** New method `CamerasService.refreshCodecFromSrs(cameraId, orgId)` called from `srs-callback.controller.ts:27` after the `statusService.transition(..., 'online')` call. The refresh enqueues a **different** kind of probe job — a "pull from SRS API" job, not a "run ffprobe" job. Two options for the planner:
   - **Option A:** New queue `stream-probe-from-srs` with its own processor that calls `SrsApiService.getStream(streamKey)` and writes `codecInfo`.
   - **Option B (simpler):** Keep one queue, add `source: 'ffprobe' | 'srs-api'` field to `ProbeJobData`, branch inside `StreamProbeProcessor.process`.
   - **Recommendation:** Option B. Single queue, single processor, less wiring. The `jobId` stays `probe:{cameraId}` regardless of source — so if a stream-start refresh is enqueued while an ffprobe is still pending, the stream-start version (authoritative) wins/merges correctly.

3. **UI retry (D-06):** New endpoint `POST /api/cameras/:id/probe` OR reuse `POST /api/cameras/:id/test-connection` with a thin wrapper that enqueues instead of calling ffprobe inline. **Recommendation:** Add a new dedicated `POST /cameras/:id/probe` — `test-connection` already runs synchronously (blocks) and that's the documented contract per `cameras.controller.ts:277-303`. A separate endpoint keeps the contracts clean.

### Pattern 2: Protocol-Branch FFmpeg/ffprobe Input Flags (D-13)

**What:** Only emit `-rtsp_transport tcp` when URL is `rtsp://`. For `rtmp`, `rtmps`, `srt`, omit.

**Rationale:** [CITED: FFmpeg protocols docs] `-rtsp_transport` is an RTSP demuxer option — for RTMP it's silently ignored by ffmpeg 6+ but emits a warning in logs; for SRT it's ignored. For cleanliness + log hygiene + defense against future ffmpeg versions that may reject unknown options more strictly, branch the flag.

**Example:**

```typescript
// In ffprobe.service.ts (replace line 24):
function inputOptionsFor(streamUrl: string): string[] {
  if (streamUrl.startsWith('rtsp://')) return ['-rtsp_transport', 'tcp'];
  if (streamUrl.startsWith('srt://'))  return ['-srt_streamid', '']; // optional; OK to return []
  // rtmp, rtmps, http(s): no input flags needed
  return [];
}

const flags = inputOptionsFor(streamUrl);
const cmd = `ffprobe -v quiet -print_format json -show_streams ${flags.join(' ')} "${streamUrl}"`;
```

```typescript
// In ffmpeg-command.builder.ts (replace line 20):
const cmd = ffmpeg(inputUrl)
  .output(outputUrl)
  .outputFormat('flv');

if (inputUrl.startsWith('rtsp://')) {
  cmd.inputOptions(['-rtsp_transport', 'tcp']);
}
// RTMP/RTMPS/SRT: no input flags needed for pull/ingest
```

**Testable branches (Wave 0 test scaffolds):**
- `buildFfmpegCommand("rtsp://...", ...)` produces `-rtsp_transport tcp` in args
- `buildFfmpegCommand("rtmp://...", ...)` does NOT include `-rtsp_transport`
- `buildFfmpegCommand("srt://...", ...)` does NOT include `-rtsp_transport`

### Pattern 3: Extended `codecInfo` JSON Schema (D-07)

**What:** Collapse today's ambiguous shapes (`{}`, `{error}`, `{codec, width, height, ...}`) into a single tagged-union shape with explicit `status`.

```typescript
// Type to add (e.g., apps/api/src/cameras/types/codec-info.ts — NEW file, shared with web via sync)
export type CodecInfoStatus = 'pending' | 'failed' | 'success';

export interface CodecInfo {
  status: CodecInfoStatus;
  video?: {
    codec: string;      // "H.264", "H.265", "HEVC"
    width: number;
    height: number;
    fps?: number;
    profile?: string;   // "High", "Main" — when from SRS /api/v1/streams
    level?: string;     // "3.2" — when from SRS
  };
  audio?: {
    codec: string;
    sampleRate?: number;
    channels?: number;
  };
  error?: string;       // normalized, short ("Connection refused", "Auth failed — check credentials", etc.)
  probedAt: string;     // ISO-8601
  source: 'ffprobe' | 'srs-api';  // which trigger wrote this
}
```

**Migration of existing rows:** The schema stays `Json?` — no DB migration needed for the shape change. But **readers** must handle legacy shapes gracefully:
- `{}` → treat as no-data (render `—`, not pending)
- `{ error, probedAt }` → treat as `{ status: "failed", error, probedAt }`
- `{ codec, width, height, ... }` → treat as `{ status: "success", video: {...}, ... }`

Provide a `normalizeCodecInfo(raw: unknown): CodecInfo | null` helper in `codec-status-cell.tsx` (or the shared `apps/web/src/lib/codec-info.ts`) and do the legacy mapping client-side. The planner should NOT do a bulk DB migration to rewrite existing rows — the normalize-on-read approach is simpler and self-healing (next probe writes the new shape).

### Pattern 4: Prisma `@@unique` + P2002 Translation (D-10c, D-11)

**What:** Add `@@unique([orgId, streamUrl])` to the Camera model. Wrap `create` + `createMany` + bulk import `$transaction` in try/catch and map `PrismaClientKnownRequestError.code === 'P2002'` to a domain-specific `DuplicateStreamUrlError`.

**Example (copy verbatim from existing pattern):**

```typescript
// Source: apps/api/src/organizations/organizations.service.ts:17-29 — already works in prod.
import { Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';

// NEW — apps/api/src/cameras/errors/duplicate-stream-url.error.ts
export class DuplicateStreamUrlError extends ConflictException {
  constructor(streamUrl: string) {
    super({
      code: 'DUPLICATE_STREAM_URL',
      message: 'A camera with this stream URL already exists in your organization.',
      streamUrl,
    });
  }
}

// Wrap in createCamera:
try {
  return this.tenancy.camera.create({ data: { orgId, siteId, ... } });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    // The @@unique is on (orgId, streamUrl); check that this is the matching target
    const target = (error.meta?.target as string[]) ?? [];
    if (target.includes('streamUrl')) {
      throw new DuplicateStreamUrlError(dto.streamUrl);
    }
  }
  throw error;
}
```

**Frontend consumption (per UI-SPEC):** The dialog's error handler branches on `error.code === 'DUPLICATE_STREAM_URL'` to show `A camera with this stream URL already exists.`

### Pattern 5: StreamJobData Field Rename `rtspUrl → inputUrl` (D-14)

**What:** The 7 file sites where `rtspUrl` appears all need the rename. This is a mechanical change.

**File list (from grep `rtspUrl` across `apps/api/src`):**

1. `streams/processors/stream.processor.ts:14` — interface field
2. `streams/processors/stream.processor.ts:45` — destructure
3. `streams/processors/stream.processor.ts:51` — guard check
4. `streams/processors/stream.processor.ts:53` — log message
5. `streams/processors/stream.processor.ts:65` — ffmpegService call
6. `streams/streams.service.ts:52` — StreamJobData build
7. `resilience/job-data.helper.ts:28` — shared StreamJobData build

The `ffmpegService.startStream(cameraId, rtspUrl, ...)` signature at `ffmpeg.service.ts:12` already uses the generic `inputUrl` name — no rename needed there, just the parameter binding at the call site.

**Recommendation for wave ordering:** Run this rename as the **last wave** to avoid merge conflicts with the probe/DTO changes. It's a pure search-and-replace with zero behavior change.

### Anti-Patterns to Avoid

- **Normalizing URL before duplicate check.** CONTEXT D-09 explicitly rejects this. Match strings exactly — predictable + matches DB constraint.
- **Hand-rolling a probe queue.** We already have `stream-probe` registered + `StreamProbeProcessor` running. Extend it; do not create a second probe queue.
- **Blocking save on probe.** D-01 is non-negotiable. `createCamera` returns as soon as the DB row is written. Probe runs async.
- **Bulk-rewriting existing `codecInfo` rows.** Legacy-tolerant reader is simpler. Next probe self-heals the shape.
- **Adding a new REST endpoint for Test URL.** D-18 rejects this. The retry icon (D-06) enqueues via either a thin wrapper or a dedicated `/probe` endpoint — no pre-save URL testing.
- **Skipping the P2002 `meta.target` check.** The Camera model has multiple potential unique violations (future: slug, external-id, etc.). Confirm the target is `streamUrl` before throwing `DuplicateStreamUrlError` — otherwise a future constraint violation would surface as a misleading error.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL prefix validation | Regex `^(rtsp|srt|rtmp|rtmps):\/\/.+$` with manual host extraction | `new URL(url)` + check `.protocol` and `.hostname` | WHATWG URL parser handles IPv6, percent-encoding, credentials, punycode. [CITED: MDN URL API] The parser throws on malformed URLs → catch = invalid. |
| P2002 → domain error | Raw `throw new Error("duplicate")` | `instanceof Prisma.PrismaClientKnownRequestError && code === 'P2002'` | Prisma provides typed error classes since v2. The `meta.target` array tells you WHICH unique constraint fired — critical when the model has multiple. Pattern verified at `organizations.service.ts:17-29`. |
| Retry-on-probe-fail backoff | Manual setTimeout + counter | BullMQ's built-in `attempts` + `backoff: { type: 'exponential', delay: 1000 }` | Already used in `streams.service.ts:63-71` for `stream-ffmpeg`. Same pattern fits `stream-probe`. BullMQ persists retry state across worker restarts; in-memory counters don't. |
| Idempotent enqueue from multiple triggers | Redis SET NX keyed on cameraId | BullMQ `jobId` option | [VERIFIED: `streams.service.ts:58,64`] `jobId` is the canonical pattern already in the repo. Phase 15 D-11 locks this convention. |
| Deep equality URL dedup | Normalize then lowercase then compare | Exact string match | D-09 — explicitly rejected normalization. |
| ffprobe JSON parsing | Regex over stderr | `ffprobe -print_format json` + `JSON.parse` | Already done at `ffprobe.service.ts:24-26`. Don't revert. |
| CSV parsing | Split-by-comma | `xlsx` library + `parseCSV` helper | Already installed + wired. `bulk-import-dialog.tsx:109-120` handles the CSV path; 136-150 handles Excel. |
| Toast notifications | Custom alert div | `sonner` | Already imported at `bulk-import-dialog.tsx:5` — use `toast.success` / `toast.error`. |

**Key insight:** This phase's risk surface is entirely in the **wiring** (enqueue call sites, protocol-branch, DTO allowlist, migration), not in building any new abstractions. Resist the urge to introduce a "StreamProtocolService" or "CameraUrlValidator" class — the logic is 3 lines per site and a shared helper module at most.

## Runtime State Inventory

Phase 19 is a **refactor + extension** phase (rename `rtspUrl`, add `@@unique`, extend zod allowlist). Applying the checklist:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | (a) `Camera.codecInfo Json?` column — today contains mix of `{}`, `{error, probedAt}`, `{codec, width, height, ...}` shapes; (b) Existing `Camera` rows may contain duplicate `streamUrl` values within the same `orgId` (no constraint today — verified `schema.prisma:199-234`) | (a) **No data migration needed for codecInfo** — reader normalizes on read; next probe self-heals. (b) **Data migration required** before `@@unique` applies — dedup query. Planner decides keep-oldest vs keep-newest (recommend keep-oldest: stable, minimizes notification churn). |
| Live service config | (a) BullMQ `stream-probe` queue — already registered in Redis (via `streams.module.ts:15`); no config to change. (b) SRS config (`config/srs.conf`) — no change needed; RTMP port 1935 already listening for FFmpeg→SRS push, Phase 19 reuses this path. | None. |
| OS-registered state | None. No systemd units, no cron, no Task Scheduler entries. The BullMQ worker runs inside the NestJS process. | None — verified by grep for `systemctl`, `cron`, `launchd` across `apps/api`. |
| Secrets/env vars | `SRS_API_URL` (used at `srs-api.service.ts:7`) — unchanged. `REDIS_URL` — unchanged. No new secrets introduced by Phase 19. | None. |
| Build artifacts | `@prisma/client` generated in `apps/api/node_modules/.prisma` — will regenerate after schema edit via `postinstall: prisma generate` + `prebuild: prisma generate` hooks (both in `apps/api/package.json:7,11`). | **Action:** after editing schema, run `pnpm run db:generate` in `apps/api/` to pick up the new `@@unique`. The planner should include this step explicitly — it's easy to forget and tests will then see stale types. |

**Additional tripwire: the repo uses `prisma db push` (NOT `prisma migrate dev`).** Verified at `apps/api/package.json:18`: `"db:push": "prisma db push && psql $DATABASE_URL_MIGRATE -f src/prisma/migrations/rls_apply_all/migration.sql"`. This means:
- There is no `_prisma_migrations` table with timestamped history
- Migrations are hand-written SQL files in named folders (`drop_org_settings_dead_fields/`, `rls_apply_all/`, etc.)
- The `prisma db push` will attempt to create the new unique constraint but will fail if duplicates exist — the error surfaces in the postgres logs, not Prisma's migration tool
- **Planner must add a pre-constraint SQL migration** (new folder `camera_stream_url_unique/migration.sql`) that runs BEFORE `prisma db push` and does the dedup cleanup
- **Testing:** the `db:test:setup` script (`scripts/setup-test-db.sh`) must also apply the dedup migration so tests see the unique constraint — verify the script picks up new migration folders by convention

## Common Pitfalls

### Pitfall 1: BullMQ job enqueue with empty data on race

**What goes wrong:** Two triggers fire in rapid succession (e.g., createCamera + a hypothetical re-import of the same CSV), and if the camera row is not yet visible to the second path's `findMany`, one enqueue sees `streamUrl: undefined`.

**Why it happens:** This exact bug was hit in the quick task 260421-g9o (MEMORY.md lists it). `StreamProcessor` was enqueuing jobs with empty data because of race between BootRecovery and the camera-health tick. The defensive guard is already in place at `stream.processor.ts:47-56`.

**How to avoid:**
- Mirror the guard in `StreamProbeProcessor.process`: if `!cameraId || !streamUrl`, log + return without throwing.
- Always pass `streamUrl` in the probe job payload, never rely on a DB lookup inside the processor (the DB read itself can return stale/null).
- Guard at the enqueue site: never call `probeQueue.add` without a non-empty `streamUrl`.

**Warning signs:** Probe queue depth grows + BullMQ stale jobs accumulate + no cameras actually get probed. Catch at log level: `ffprobe failed for camera undefined` or `Connection refused` with no host in the redacted URL.

### Pitfall 2: `prisma db push` fails silently on duplicates (migration tripwire)

**What goes wrong:** The schema edit `@@unique([orgId, streamUrl])` is committed, tests pass locally (empty test DB), but prod `prisma db push` errors out with a PostgreSQL constraint violation and the API fails to start.

**Why it happens:** [CITED: Prisma issue #6203, #17096] `prisma db push` adds a UNIQUE INDEX — if existing rows violate it, the index creation fails and the schema is out of sync. In this repo's flow (which doesn't use `prisma migrate`), there's no migration drift detection.

**How to avoid:**
- Add a pre-migration SQL file `src/prisma/migrations/camera_stream_url_unique/migration.sql` that does the dedup BEFORE the constraint. Example:
  ```sql
  -- Keep oldest per (orgId, streamUrl), delete the rest
  DELETE FROM "Camera" c
  USING "Camera" c2
  WHERE c."orgId" = c2."orgId"
    AND c."streamUrl" = c2."streamUrl"
    AND c."createdAt" > c2."createdAt";
  -- Then Prisma db push will succeed
  ```
- Run the dedup SQL BEFORE `prisma db push` in the deployment script: update `package.json:18` `db:push` target to chain dedup → `prisma db push` → RLS policies.
- **Operator runbook item:** the planner should document that the dedup is lossy (deleted cameras are gone) and recommend a manual export of the `Camera` table before the first deploy.

**Warning signs:** `ERROR: could not create unique index "Camera_orgId_streamUrl_key" DETAIL: Key ("orgId", "streamUrl")=(..., ...) is duplicated` in postgres logs during deploy.

### Pitfall 3: SRS `/api/v1/streams` response key lookup — app/name mismatch

**What goes wrong:** D-02 "refresh from SRS" calls `SrsApiService.getStreams()` and fails to find the camera because the `name` field doesn't match `{cameraId}`.

**Why it happens:** [VERIFIED: `dashboard.service.ts:71-84` + `camera-health.service.ts:77-79`] SRS stream name format is inconsistent: sometimes `app=live`, `name={orgId}/{cameraId}`; sometimes `app=live/{orgId}`, `name={cameraId}`. The codebase already handles both by constructing `fullPath = \`${app}/${name}\`` and checking `startsWith(\`live/${orgId}/\`)`.

**How to avoid:** Copy the exact same matching logic from `dashboard.service.ts:73-83` into the new `SrsApiService.getStream(streamKey)` method (if the planner chooses to add one) or directly into the probe processor's SRS-source branch. Don't reinvent the matcher.

**Warning signs:** Camera transitions to `online` (so `on_publish` fired) but `codecInfo.status` stays `pending` forever — the SRS refresh couldn't find the stream by name.

### Pitfall 4: zod version mismatch between API (3.x) and web (4.x)

**What goes wrong:** The planner extracts the zod schema into a shared package and imports it from both sides. zod 3 and zod 4 have different `.refine()` internals and different error-flattening output.

**Why it happens:** Pre-existing drift between `apps/api/package.json` (zod 3.25) and `apps/web/package.json` (zod 4.3). This is NOT a Phase 19 problem, but Phase 19 could trip on it if it shares schemas.

**How to avoid:** Keep the zod schemas duplicated in API and web. The refine rule is 1 line — duplication is cheap. Do NOT introduce a shared `@sms-platform/types` package in this phase. A future phase can unify zod versions.

**Warning signs:** Type errors on import from a shared path; runtime error shape mismatch when web parses an API error response.

### Pitfall 5: `@InjectQueue('stream-probe')` fails in tests

**What goes wrong:** A new test for `createCamera`'s probe enqueue fails because `BullModule` isn't bootstrapped in the test context, and Nest's DI throws "Nest can't resolve dependency of StreamProbeProcessor".

**Why it happens:** [VERIFIED: `cameras.service.ts:28-29` comment] The existing `bulkImport` explicitly injects the queue as **optional** (`@InjectQueue('stream-probe') private readonly probeQueue?: Queue`) and guards with `if (this.probeQueue)`. Tests pass `undefined` for the queue (`tests/cameras/bulk-import.test.ts:26-27`).

**How to avoid:** Same pattern — keep the queue optional for `createCamera`. Existing test pattern at `tests/cameras/bulk-import.test.ts:23-28` constructs the service with `undefined` queues:
```typescript
service = new CamerasService(
  testPrisma as any,
  testPrisma as any,
  undefined as any,  // streamsService
  undefined as any,  // probeQueue
);
```

**Warning signs:** Test runner log shows `Nest can't resolve dependencies of the CamerasService (?, PrismaService, ...)`.

### Pitfall 6: codec-cell ambiguity during legacy data migration

**What goes wrong:** Existing rows have `codecInfo = { codec: "h264", width: 1920, ... }` (no `status` field). The new UI treats the absent `status` as `undefined` and falls through to the `—` no-data branch, making every existing successfully-probed camera suddenly look un-probed.

**Why it happens:** Change of shape without normalize-on-read.

**How to avoid:** The `normalizeCodecInfo` helper described in Pattern 3 above is MANDATORY. Write the tests for the legacy shapes in Wave 0 so they go green from day 1:
- `normalizeCodecInfo({})` → returns `null` (render `—`)
- `normalizeCodecInfo({ error, probedAt })` → returns `{ status: 'failed', error, probedAt }`
- `normalizeCodecInfo({ codec, width, height, fps, audioCodec, probedAt })` → returns `{ status: 'success', video: {...}, audio: {...}, probedAt, source: 'ffprobe' }`
- `normalizeCodecInfo(undefined)` / `normalizeCodecInfo(null)` → returns `null`

**Warning signs:** QA smoke test finds Camera page suddenly shows `—` for all cameras that previously showed `H.264 · 1920×1080`.

### Pitfall 7: Retry click storms on failed-probe cell

**What goes wrong:** User frustrated with failed probe clicks the retry icon 10× per second. Each click hits the API; each enqueue creates a new job.

**Why it happens:** Forgetting that `jobId` dedup is only a floor, not a ceiling — the API endpoint can still DoS itself serving 10 rps per user.

**How to avoid:**
- The `jobId = "probe:{cameraId}"` (D-04) ensures BullMQ merges duplicates — no worker floods.
- On the client, UI-SPEC §"Loading States" already says "swap RotateCw for Loader2 during in-flight request" — this visually blocks the button. But the button should ALSO be `disabled` during in-flight to prevent keyboard re-entry.
- **Optional (future):** rate-limit the `/cameras/:id/probe` endpoint at 1 req / 5s per cameraId. UI-SPEC already covers this with the "Probe queued recently. Wait a moment before retrying." warning toast. Not required for baseline — `jobId` dedup is sufficient.

**Warning signs:** Redis `stream-probe:wait` queue has spikes of identical jobs; API request log shows rapid /probe hits from same user/camera.

## Code Examples

### Example 1: Extended zod DTO with 4-protocol allowlist (D-12, D-17)

```typescript
// apps/api/src/cameras/dto/create-camera.dto.ts — REPLACE lines 5-8
const STREAM_URL_ALLOWED_PREFIXES = ['rtsp://', 'rtmps://', 'rtmp://', 'srt://'] as const;
// Note: rtmps:// listed before rtmp:// so `startsWith` match is unambiguous
// (both `startsWith('rtmps://')` and `startsWith('rtmp://')` return true for rtmps URLs —
// the order doesn't affect logic since we use `.some()`, but clarity matters).

export const CreateCameraSchema = z.object({
  name: z.string().min(1).max(100),
  streamUrl: z.string().url().refine(
    (url) => STREAM_URL_ALLOWED_PREFIXES.some((p) => url.startsWith(p)),
    { message: 'Stream URL must be rtsp://, rtmps://, rtmp://, or srt://' },
  ),
  // ... unchanged
});
```

```typescript
// apps/api/src/cameras/dto/bulk-import.dto.ts — ADD .url() per D-17 parity
export const BulkImportCameraSchema = z.object({
  name: z.string().min(1).max(100),
  streamUrl: z.string().url().refine(                       // ← was .string(), now .string().url()
    (url) => STREAM_URL_ALLOWED_PREFIXES.some((p) => url.startsWith(p)),
    { message: 'Stream URL must be rtsp://, rtmps://, rtmp://, or srt://' },
  ),
  // ... unchanged
});
```

### Example 2: Protocol-branch ffprobe (D-13)

```typescript
// apps/api/src/cameras/ffprobe.service.ts — REPLACE line 24

async probeCamera(streamUrl: string): Promise<ProbeResult> {
  const redactedUrl = this.redactUrl(streamUrl);
  this.logger.log(`Probing camera: ${redactedUrl}`);

  // Protocol-branch: -rtsp_transport is RTSP-only. Omit for rtmp/rtmps/srt.
  const transportFlag = streamUrl.startsWith('rtsp://') ? '-rtsp_transport tcp ' : '';
  const cmd = `ffprobe -v quiet -print_format json -show_streams ${transportFlag}"${streamUrl}"`;
  const { stdout } = await execAsync(cmd, { timeout: 15000 });
  // ... unchanged
}
```

### Example 3: Extended StreamProbeProcessor writing new codecInfo shape (D-07)

```typescript
// apps/api/src/streams/processors/stream-probe.processor.ts — REPLACE lines 42-85
async process(job: Job<ProbeJobData>): Promise<void> {
  const { cameraId, streamUrl, source = 'ffprobe' } = job.data;

  // Defensive guard (mirrors stream.processor.ts:47-56)
  if (!cameraId || !streamUrl) {
    this.logger.error(
      `StreamProbeProcessor: refusing job with empty data cameraId=${cameraId ?? '<undefined>'} streamUrl=${streamUrl ? 'set' : 'empty'}`,
    );
    return;
  }

  // Mark pending at enqueue time → UI spinner shows
  await this.prisma.camera.update({
    where: { id: cameraId },
    data: { codecInfo: { status: 'pending', probedAt: new Date().toISOString(), source } },
  });

  try {
    const result = source === 'srs-api'
      ? await this.refreshFromSrs(cameraId, job.data.orgId)
      : await this.ffprobeService.probeCamera(streamUrl);

    await this.prisma.camera.update({
      where: { id: cameraId },
      data: {
        needsTranscode: result.needsTranscode,
        codecInfo: {
          status: 'success',
          video: { codec: result.codec, width: result.width, height: result.height, fps: result.fps },
          audio: { codec: result.audioCodec },
          probedAt: new Date().toISOString(),
          source,
        },
      },
    });
  } catch (err) {
    const rawMessage = (err as Error).message ?? String(err);
    const normalizedError = this.normalizeError(rawMessage); // UI-SPEC error dictionary mapping
    await this.prisma.camera.update({
      where: { id: cameraId },
      data: {
        codecInfo: {
          status: 'failed',
          error: normalizedError,
          probedAt: new Date().toISOString(),
          source,
        },
      },
    });
  }
}

// normalizeError implements the UI-SPEC "Error Reason Copy Dictionary" (10 patterns + fallback)
private normalizeError(raw: string): string {
  const patterns: Array<[RegExp, string]> = [
    [/Connection refused|ECONNREFUSED/i, 'Connection refused'],
    [/Network is unreachable|ENETUNREACH/i, 'Network unreachable'],
    [/401 Unauthorized|authorization required|Authentication failed/i, 'Auth failed — check credentials'],
    [/404 Not Found|Stream not found/i, 'Stream path not found'],
    [/timed out|ETIMEDOUT|Timeout/i, 'Timeout — camera not responding'],
    [/Invalid data found when processing input/i, 'Invalid stream format'],
    [/Unsupported codec|No decoder for codec/i, 'Unsupported codec'],
    [/SSL handshake|TLS error/i, 'TLS handshake failed'],
    [/unable to resolve host|ENOTFOUND|getaddrinfo/i, 'Hostname not resolvable'],
  ];
  for (const [rx, msg] of patterns) {
    if (rx.test(raw)) return msg;
  }
  return raw.slice(0, 80);
}
```

### Example 4: Extended ProbeJobData with source field (D-02)

```typescript
// apps/api/src/streams/processors/stream-probe.processor.ts — REPLACE lines 7-11
export type ProbeSource = 'ffprobe' | 'srs-api';

export interface ProbeJobData {
  cameraId: string;
  streamUrl: string;
  orgId: string;
  source?: ProbeSource;  // default 'ffprobe'
}
```

### Example 5: SRS on-publish → enqueue refresh probe (D-02)

```typescript
// apps/api/src/srs/srs-callback.controller.ts — EXTEND lines 23-31
@Post('on-publish')
async onPublish(@Body() body: any) {
  const { orgId, cameraId } = this.parseStreamKey(body.stream, body.app);
  if (orgId && cameraId) {
    this.logger.log(`Stream published: camera=${cameraId}, org=${orgId}`);
    await this.statusService.transition(cameraId, orgId, 'online');

    // D-02: refresh codecInfo from SRS /api/v1/streams as ground truth.
    // Delay 1s so SRS has a chance to populate its stream registry.
    await this.camerasService.enqueueProbeFromSrs(cameraId, orgId, { delay: 1000 });
  }
  return { code: 0 };
}
```

The `enqueueProbeFromSrs` is a new method on `CamerasService` that wraps the queue `.add`:

```typescript
async enqueueProbeFromSrs(cameraId: string, orgId: string, opts?: { delay?: number }): Promise<void> {
  if (!this.probeQueue) return; // same test-harness guard as bulkImport
  const camera = await this.prisma.camera.findUnique({ where: { id: cameraId }, select: { streamUrl: true } });
  if (!camera) return;
  await this.probeQueue.add(
    'probe-camera',
    { cameraId, streamUrl: camera.streamUrl, orgId, source: 'srs-api' },
    { jobId: `probe:${cameraId}`, delay: opts?.delay ?? 0 },
  );
}
```

### Example 6: Pre-insert server-side dedup (D-10b)

```typescript
// apps/api/src/cameras/cameras.service.ts — EXTEND bulkImport around line 316 (before $transaction)

// D-10b: server-side pre-check against existing cameras in this org
const incomingUrls = dto.cameras.map((c) => c.streamUrl);
const existing = await this.tenancy.camera.findMany({
  where: { orgId, streamUrl: { in: incomingUrls } },
  select: { streamUrl: true },
});
const existingUrls = new Set(existing.map((e: any) => e.streamUrl));

// Also check within-file dedup (D-10a — server-side mirror)
const seen = new Set<string>();
const toInsert: typeof dto.cameras = [];
const skipped: Array<{ row: number; streamUrl: string; reason: 'within-file' | 'against-db' }> = [];
dto.cameras.forEach((cam, idx) => {
  if (existingUrls.has(cam.streamUrl)) {
    skipped.push({ row: idx, streamUrl: cam.streamUrl, reason: 'against-db' });
  } else if (seen.has(cam.streamUrl)) {
    skipped.push({ row: idx, streamUrl: cam.streamUrl, reason: 'within-file' });
  } else {
    seen.add(cam.streamUrl);
    toInsert.push(cam);
  }
});

// Then $transaction over toInsert instead of dto.cameras.
// Return value extended with skipped count for UI toast (UI-SPEC "Post-import toast cascade")
return { imported: cameras.length, skipped: skipped.length, errors: [] };
```

### Example 7: Single-slot helper/error under Stream URL input (D-15, UI-SPEC)

```tsx
// apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx — REPLACE lines 213-223
const ALLOWED_PREFIXES = ['rtsp://', 'rtmps://', 'rtmp://', 'srt://'] as const;
const HELPER_TEXT = 'Supported: rtsp://, rtmps://, rtmp://, srt://';

function validateStreamUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null; // let HTML `required` handle empty
  if (!ALLOWED_PREFIXES.some((p) => trimmed.startsWith(p))) {
    return 'URL must start with rtsp://, rtmps://, rtmp://, or srt://';
  }
  try {
    const u = new URL(trimmed);
    if (!u.hostname) return 'Invalid URL — check host and path';
  } catch {
    return 'Invalid URL — check host and path';
  }
  return null;
}

// Inside component:
const streamUrlError = useMemo(() => validateStreamUrl(streamUrl), [streamUrl]);

// In JSX:
<div className="space-y-2">
  <Label htmlFor="cam-url">Stream URL *</Label>
  <Input
    id="cam-url"
    value={streamUrl}
    onChange={(e) => setStreamUrl(e.target.value)}
    placeholder="rtsp://192.168.1.100:554/stream"
    className={cn('font-mono text-xs', streamUrlError && 'border-destructive focus-visible:ring-destructive/50')}
    aria-invalid={!!streamUrlError}
    aria-describedby={streamUrlError ? 'cam-url-error' : 'cam-url-help'}
    required
  />
  {streamUrlError ? (
    <p id="cam-url-error" role="alert" className="text-xs text-destructive">{streamUrlError}</p>
  ) : (
    <p id="cam-url-help" className="text-xs text-muted-foreground">{HELPER_TEXT}</p>
  )}
</div>

// Extend disabled rule:
<Button
  type="submit"
  disabled={saving || !name.trim() || !streamUrl.trim() || !!streamUrlError || (!isEditMode && !siteId)}
>
```

### Example 8: Extended bulk-import validateRow with duplicate detection (D-16)

```typescript
// apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx — REPLACE validateRow + add batch recompute

interface CameraRow {
  name: string;
  streamUrl: string;
  tags: string;
  description: string;
  latitude: string;
  longitude: string;
  errors: Record<string, string>;
  duplicate?: boolean;                            // NEW (D-16)
  duplicateReason?: 'within-file' | 'against-db'; // NEW
}

const ALLOWED_PREFIXES = ['rtsp://', 'rtmps://', 'rtmp://', 'srt://'];

function validateRow(row: CameraRow): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!row.name.trim()) errors.name = 'Name is required';

  const url = row.streamUrl.trim();
  if (!url) {
    errors.streamUrl = 'Stream URL is required';
  } else if (!ALLOWED_PREFIXES.some((p) => url.startsWith(p))) {
    errors.streamUrl = 'Must be rtsp://, rtmps://, rtmp://, or srt://';
  } else {
    try {
      const u = new URL(url);
      if (!u.hostname) errors.streamUrl = 'Invalid URL — check host and path';
    } catch {
      errors.streamUrl = 'Invalid URL — check host and path';
    }
  }

  if (row.latitude && isNaN(Number(row.latitude))) errors.latitude = 'Must be a number';
  if (row.longitude && isNaN(Number(row.longitude))) errors.longitude = 'Must be a number';
  return errors;
}

// NEW: batch dedup after any row edit — called from handleCellEdit and processRows
function annotateDuplicates(rows: CameraRow[]): CameraRow[] {
  const seen = new Map<string, number>(); // streamUrl → first-seen row index
  return rows.map((row, idx) => {
    const url = row.streamUrl.trim();
    if (!url) return { ...row, duplicate: false };
    const firstIdx = seen.get(url);
    if (firstIdx !== undefined && firstIdx !== idx) {
      return { ...row, duplicate: true, duplicateReason: 'within-file' as const };
    }
    seen.set(url, idx);
    return { ...row, duplicate: false, duplicateReason: undefined };
  });
}

// Counters (replace lines 309-311):
const validCount = rows.filter((r) => Object.keys(r.errors).length === 0 && !r.duplicate).length;
const duplicateCount = rows.filter((r) => Object.keys(r.errors).length === 0 && r.duplicate).length;
const errorCount = rows.filter((r) => Object.keys(r.errors).length > 0).length;
const canImport = (validCount + duplicateCount) > 0 && errorCount === 0 && !!selectedSiteId;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SRS native RTSP ingest | FFmpeg pulls RTSP, pushes RTMP to SRS | SRS v5+ (2022) | Phase 19 extends the same pipeline to accept RTMP/RTMPS/SRT inputs — FFmpeg is the single ingest abstraction. [CITED: SRS issue #2304] |
| Manual queue backoff with setTimeout | BullMQ `attempts` + `backoff: { type: 'exponential' }` | BullMQ 3+ (2020) | Phase 19 reuses; no new backoff logic. |
| zod `.refine` returning boolean | zod `.refine` returning boolean OR throwing `ZodIssue` with custom code | zod 3.22+ | Phase 19 stays on simple boolean refine — our error messages are static strings. |
| Normalize URLs for dedup | Exact string match | N/A — product decision D-09 | Phase 19 scope decision. |
| Prisma `prisma migrate dev` + shadow DB | **This repo: `prisma db push` + hand-SQL migration folders** | Repo-local convention | Planner must NOT suggest `prisma migrate` — conflicts with `package.json` `db:push` script at line 18. |
| Single codecInfo shape `{codec, width, ...}` | Tagged union `{ status: 'pending'|'failed'|'success', ... }` | Phase 19 (this phase) | Legacy rows auto-heal on next probe; reader tolerates both. |

**SRS /api/v1/streams response shape** [VERIFIED: search results 2026-04-22 + existing `camera-health.service.ts:77-79` usage]:

```json
{
  "id": "vid-14w0m16",
  "name": "stream_2",
  "vhost": "vid-583q51c",
  "app": "live",
  "live_ms": 1692788753828,
  "clients": 1,
  "frames": 229557,
  "send_bytes": 7729,
  "recv_bytes": 289217559,
  "kbps": { "recv_30s": 251, "send_30s": 0 },
  "publish": { "active": true, "cid": "042k4m00" },
  "video": { "codec": "H264", "profile": "High", "level": "3.2", "width": 768, "height": 320 },
  "audio": { "codec": "AAC", "sample_rate": 44100, "channel": 2, "profile": "LC" }
}
```

Key mapping for Phase 19's SRS-source probe:
- `stream.video.codec` → `codecInfo.video.codec` (values: `H264`, `H265`, `HEVC`, `AV1` — note SRS uses `H264` not `h264`; normalize to lowercase or match UI-SPEC's display form)
- `stream.video.width` / `.height` → `codecInfo.video.width` / `.height`
- `stream.audio.codec` → `codecInfo.audio.codec`
- `stream.video.profile` / `.level` → `codecInfo.video.profile` / `.level` (new fields from SRS source)

**Deprecated / outdated in this context:**
- **SRS built-in `ingest { engine ... }`** — removed/limited in v5+; requires config reload per camera. Out of scope.
- **SRS built-in `transcode`** — libx264 only, no hardware accel, no API control. Out of scope.
- **Prisma `previewFeatures = ["fullTextSearch"]`** — unrelated but worth flagging: our schema has no preview-feature pragmas, so no unexpected behavior.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `-rtsp_transport tcp` is silently ignored by ffmpeg 7.x for RTMP inputs and emits only a warning (not an error) | Pitfall 1, Pattern 2 | Low — even if it errors, CONTEXT D-13 already mandates branching the flag, so the fix is identical regardless. [ASSUMED: ffmpeg 7 behavior not directly tested in repo; FFmpeg docs confirm `-rtsp_transport` is RTSP-scoped] |
| A2 | SRS `on_publish` callback fires within 1–2s of FFmpeg successfully pushing to SRS, giving enough time for `SrsApiService.getStream` to find the stream in the registry | Example 5 (delay: 1000ms) | Medium — if SRS takes longer, the refresh probe gets an empty result and codecInfo stays pending until the next trigger. Mitigation: the probe processor should retry via BullMQ `attempts: 3` with short backoff, not mark failed on first empty result. |
| A3 | Keep-oldest is the preferred dedup strategy for existing duplicates | Runtime State Inventory, Pitfall 2 | Medium — user or ops may prefer keep-newest (latest config wins). Planner should consult before committing. [ASSUMED — CONTEXT lists this as Claude's Discretion] |
| A4 | Existing production DB has a small number of `(orgId, streamUrl)` duplicates, if any, and a `DELETE USING` dedup query will run in under 1s | Pitfall 2 | Low for dev DB; unknown for prod. Planner should add a pre-deploy `SELECT COUNT(*) FROM (SELECT "orgId", "streamUrl", COUNT(*) FROM "Camera" GROUP BY 1,2 HAVING COUNT(*) > 1) x;` check to the runbook. |
| A5 | `SrsApiService.getStream(streamKey)` helper does not exist yet; planner will add it | Pattern 1 Option B, Example 5 | Low — confirmed via grep; only `getStreams()` (list) is in `srs-api.service.ts:15-19`. Adding a `getStream(streamKey)` that wraps the same `/api/v1/streams` response + filters locally is trivial. |
| A6 | The repo's `prisma db push` flow will pick up new migration folders if they're added to the execution list in `package.json` `db:push` script | Pitfall 2 | Medium — only `rls_apply_all` is referenced explicitly in `package.json:18`. Planner must update the script to also run the new `camera_stream_url_unique/migration.sql` BEFORE `prisma db push`. |
| A7 | The client-side `handleCellEdit` path re-runs duplicate annotation on every edit — not expensive for ≤500 rows | Example 8 | Low — 500 rows × O(1) Map lookup = negligible per keystroke. |

**If this table is empty:** N/A — 7 assumptions flagged. None are show-stoppers; all have mitigations or are Claude's-discretion items per CONTEXT.

## Open Questions (RESOLVED)

1. **Should `status` be exposed in the API response for cameras, or stay internal inside `codecInfo` JSON?**
   - What we know: UI-SPEC consumes `codecInfo.status` directly. CONTEXT lists this as Claude's discretion.
   - What's unclear: whether to flatten `status` to a top-level field on the Camera response for easier client consumption (e.g., `GET /api/cameras` includes `probeStatus: 'pending'`).
   - RESOLVED: **Expose via `codecInfo.status` only** — keeps the API shape stable (adding a top-level field is a breaking change for any existing API consumer). UI just reads `camera.codecInfo?.status`.

2. **For the retry click endpoint: new `POST /cameras/:id/probe` or reuse `POST /cameras/:id/test-connection`?**
   - What we know: `test-connection` runs synchronously (blocks the request on ffprobe execution) per `cameras.controller.ts:282-302`. Retry click (D-06) wants async enqueue.
   - What's unclear: whether the planner prefers a new dedicated endpoint or a query flag on the existing one (`?async=true`).
   - RESOLVED: **New endpoint `POST /cameras/:id/probe`** — returns 202 Accepted immediately after enqueue. Keeps contracts explicit.

3. **Should the SRS-source refresh (D-02) also trigger on `on_unpublish` or transition to `reconnecting`?**
   - What we know: D-02 says "first successful FFmpeg ingest" = `on_publish`. Makes sense: the stream is live and SRS knows the codec.
   - What's unclear: if a codec-change occurs mid-stream (e.g., camera firmware switch), would we want to re-trigger?
   - RESOLVED: **On-publish only for Phase 19.** Mid-stream codec changes are rare and a stream restart (which fires on_publish again) covers the case. Scheduled re-probe is explicitly deferred.

4. **Sample CSV — add an RTMP row for discoverability?**
   - What we know: `bulk-import-dialog.tsx:175-178` sample CSV has 3 RTSP rows. UI-SPEC §Copywriting keeps this unchanged.
   - What's unclear: whether to add one `rtmp://` row to telegraph the new capability.
   - RESOLVED: **Keep unchanged for baseline.** A planner-discretion polish item. RTSP is still the most common real-world case.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 | All | ✓ | 22 LTS (per CLAUDE.md) | — |
| PostgreSQL 16 | Prisma schema migration | ✓ | 16 (per CLAUDE.md + Version Compatibility table) | — |
| Redis 7 | BullMQ queues | ✓ | 7.x (per CLAUDE.md) | — |
| ffmpeg 7.x / ffprobe | Probe processor + stream builder | ✓ (assumed) | 7.x (per CLAUDE.md §13) | If absent: probe jobs fail with "ffprobe: command not found" — already handled by best-effort error capture in `stream-probe.processor.ts:63-85` |
| SRS v6.0-r0 | On-publish callback + `/api/v1/streams` | ✓ | 6.0.184 (per CLAUDE.md) | If SRS unreachable: refresh-from-SRS probe writes `status: failed, error: 'Stream engine unavailable'` — UI handles it. |
| Prisma 6.19.3 | Schema migration + P2002 error class | ✓ | 6.19.3 installed | — |
| BullMQ 5 | `stream-probe` queue (already running) | ✓ | 5.73.2 installed | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None blocking — all listed are assumed-present per CLAUDE.md's tech stack constraints.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (API) | Vitest 2.x (`apps/api/package.json:62`) |
| Framework (web) | Vitest 3.x (`apps/web/package.json` — `@vitest/ui` 3, `vitest` 3) |
| Config file (API) | No dedicated `vitest.config.ts` — uses `pretest` script to setup test DB via `scripts/setup-test-db.sh` |
| Config file (web) | inherited from repo root / vitest defaults |
| Quick run command (API) | `pnpm --filter @sms-platform/api test -- tests/cameras/` |
| Full suite command (API) | `pnpm --filter @sms-platform/api test` |
| Quick run command (web) | `pnpm --filter @sms-platform/web test -- cameras-columns` |
| Full suite command (web) | `pnpm --filter @sms-platform/web test` |
| Phase gate | Full API + web suite green before `/gsd-verify-work` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P19-01 | `createCamera` enqueues probe job with `jobId: probe:{id}` | unit | `pnpm --filter api test -- tests/cameras/camera-crud.test.ts` — new test block | ❌ Wave 0 |
| P19-01 | Probe enqueue is optional — skips silently when queue undefined (test env) | unit | same file | ❌ Wave 0 |
| P19-02 | `srs-callback.controller on-publish` enqueues refresh probe with `source: 'srs-api'` | unit | `pnpm --filter api test -- tests/srs/srs-callback.test.ts` — new | ❌ Wave 0 (new file) |
| P19-02 | `StreamProbeProcessor` with `source: 'srs-api'` calls `SrsApiService.getStream` and writes codecInfo | integration | `pnpm --filter api test -- tests/cameras/stream-probe.test.ts` — new | ❌ Wave 0 |
| P19-03 | Extended `codecInfo` shape: pending on start, success on probe, failed with normalized error | unit | same file | ❌ Wave 0 |
| P19-03 | `normalizeCodecInfo` helper handles legacy shapes (`{}`, `{error}`, `{codec,...}`) | unit | `pnpm --filter web test -- src/lib/codec-info.test.ts` — new | ❌ Wave 0 (new helper) |
| P19-03 | `normalizeError` maps 10 canonical error patterns to short English phrases | unit | `pnpm --filter api test -- tests/cameras/stream-probe.test.ts` | ❌ Wave 0 |
| P19-04 | `<CodecStatusCell>` renders 4 states (pending/failed/success/no-data) | component | `pnpm --filter web test -- cameras/codec-status-cell.test.tsx` — new | ❌ Wave 0 |
| P19-04 | Retry icon click calls onRetry and swaps icon to Loader2 during in-flight | component | same file | ❌ Wave 0 |
| P19-05 | zod refine accepts `rtmp://`, `rtmps://`, `srt://`, `rtsp://`; rejects `http://`, `file://`, empty | unit | `pnpm --filter api test -- tests/cameras/bulk-import.test.ts` (extend) | ✓ (extend) |
| P19-05 | `bulkImport` pre-insert dedup skips rows with matching existing streamUrl in same org | integration | same file — extend | ✓ (extend) |
| P19-05 | `createCamera` throws `DuplicateStreamUrlError` when P2002 fires on streamUrl target | integration | `pnpm --filter api test -- tests/cameras/camera-crud.test.ts` — new block | ❌ Wave 0 (extend existing) |
| P19-05 | `validateRow` flags within-file duplicates with `duplicate: true` and `duplicateReason: 'within-file'` | unit | `pnpm --filter web test -- cameras/bulk-import.test.tsx` — new | ❌ Wave 0 (new file) |
| P19-05 | `validateRow` rejects `http://` and allows `rtmp://`, `rtmps://` | unit | same file | ❌ Wave 0 |
| P19-05 | `validateStreamUrl` (camera-form-dialog helper) returns error for wrong prefix, null for valid | unit | `pnpm --filter web test -- cameras/camera-form-dialog.test.tsx` — extend | ❌ Wave 0 |
| P19-06 | Prisma `@@unique([orgId, streamUrl])` is present in schema | migration sanity | `pnpm --filter api test -- tests/cameras/camera-crud.test.ts` — new: attempt create with same `(orgId, streamUrl)` and expect `P2002` | ❌ Wave 0 |
| P19-06 | Dedup SQL migration keeps oldest row per `(orgId, streamUrl)` tuple | migration script test | `pnpm --filter api test -- tests/migrations/camera-dedup.test.ts` — new | ❌ Wave 0 |
| P19-07 | `buildFfmpegCommand('rtsp://...', ...)` args include `-rtsp_transport tcp` | unit | `pnpm --filter api test -- tests/streams/ffmpeg-command-builder.test.ts` — new file | ❌ Wave 0 |
| P19-07 | `buildFfmpegCommand('rtmp://...', ...)` args do NOT include `-rtsp_transport` | unit | same file | ❌ Wave 0 |
| P19-07 | `buildFfmpegCommand('srt://...', ...)` args do NOT include `-rtsp_transport` | unit | same file | ❌ Wave 0 |
| P19-07 | `ffprobeService.probeCamera('rtmp://...')` executes a command string WITHOUT `-rtsp_transport` | unit | `pnpm --filter api test -- tests/cameras/ffprobe.test.ts` (extend) | ✓ (extend line 140 to assert cmd string) |
| P19-08 | `StreamJobData.inputUrl` field present after rename; no reference to `rtspUrl` remains | unit | `pnpm --filter api test -- tests/streams/stream-processor.test.ts` — new | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter api test -- tests/cameras/` (fast, ~5–15s typically for camera-only tests)
- **Per wave merge:** `pnpm --filter api test && pnpm --filter web test` (full suite)
- **Phase gate:** full suite green + manual smoke test of Add Camera (rtmp://) + Bulk Import (CSV with 3 rows including 1 duplicate)

### Wave 0 Gaps
- [ ] `apps/api/tests/cameras/camera-crud.test.ts` — extend with probe-enqueue + P2002 assertions (file may exist — confirmed `tests/cameras/camera-crud.test.ts` is present)
- [ ] `apps/api/tests/cameras/stream-probe.test.ts` — new, covers ProbeJobData variants + normalizeError + srs-api source
- [ ] `apps/api/tests/srs/srs-callback.test.ts` — new file for on-publish refresh probe (directory may not exist yet)
- [ ] `apps/api/tests/streams/ffmpeg-command-builder.test.ts` — new, covers protocol-branch
- [ ] `apps/api/tests/streams/stream-processor.test.ts` — new, covers inputUrl rename + guard preserved
- [ ] `apps/api/tests/migrations/camera-dedup.test.ts` — new, covers keep-oldest SQL migration (directory may not exist yet)
- [ ] `apps/web/src/app/admin/cameras/components/codec-status-cell.test.tsx` — new
- [ ] `apps/web/src/app/admin/cameras/components/bulk-import.test.tsx` — new, covers validateRow + annotateDuplicates + toast cascade
- [ ] `apps/web/src/app/admin/cameras/components/camera-form-dialog.test.tsx` — new, covers validateStreamUrl + submit disabled
- [ ] `apps/web/src/lib/codec-info.test.ts` — new, covers normalizeCodecInfo legacy shapes

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing `AuthGuard` on all `/api/cameras/*` endpoints (unchanged) |
| V3 Session Management | yes | Existing session-based auth + `ClsService` for org scoping (unchanged) |
| V4 Access Control | yes | RLS policies on Camera table (`tenant_isolation_camera` in `rls_apply_all/migration.sql`) + tenancy Prisma client for writes. Phase 19 changes neither. |
| V5 Input Validation | **yes — PRIMARY** | zod DTO validation at the controller boundary. Phase 19 extends the allowlist. Defense in depth: client-side `validateStreamUrl` + server-side zod refine + Prisma unique constraint. |
| V6 Cryptography | no | No new crypto in Phase 19. Existing credentials-in-URL model is unchanged (deferred idea: separate fields). |
| V7 Error Handling | yes | `DuplicateStreamUrlError` exposes only a generic "exists in your organization" message — no PII leak, no DB internal details. Follows existing `ConflictException` pattern. |
| V8 Data Protection | yes | `FfprobeService.redactUrl` at line 56-67 already redacts `user:pass@` in logs. Phase 19 stream-probe error path must continue to use this helper — verify in tests. |
| V9 Communication | yes | SRS callbacks are internal (not exposed to the internet). Existing pattern unchanged. |
| V10 Malicious Code | no | N/A |
| V11 Business Logic | yes | Duplicate detection is a business-logic validation. Skip-with-warning (D-08) is the explicit UX contract. |
| V12 Files | no | Bulk-import accepts CSV/JSON/Excel; existing file-size cap (5MB) + row cap (500) already in place. No new file-handling logic. |
| V13 API | yes | No new API endpoints per D-18; existing pattern preserved. |
| V14 Config | no | N/A |

### Known Threat Patterns for {NestJS + Prisma + Next.js + FFmpeg}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via user-submitted URL | Information Disclosure | **D-18 rejects pre-save URL test endpoint** precisely to avoid this surface. The probe DOES call `ffprobe` against the URL, but only AFTER the camera is saved — meaning the URL has passed zod validation AND the camera belongs to an org (access-controlled). Not a new SSRF surface. |
| Command injection via streamUrl passed to ffprobe | Tampering / Elevation | `ffprobe.service.ts:24` already wraps URL in double quotes. zod's `.url()` rejects malformed URLs. Phase 19 inherits both. **Caveat:** the double-quote wrapping in a shell-escaped `exec` call is the weak link — verify that `streamUrl` containing `"` is rejected by zod `.url()` (it should be, since double-quote is not valid in URL per WHATWG). [RECOMMEND: add explicit test — `streamUrl: 'rtsp://evil"; rm -rf /; #'` rejected by zod] |
| SQL injection via streamUrl in Prisma query | Tampering | Prisma parameterizes all queries. `findMany({where: {streamUrl: {in: [...]}}})` is safe. Hand-written migration SQL must use parameterized `DELETE USING` (it does in the example above). |
| Duplicate row leak across tenants | Information Disclosure | `@@unique([orgId, streamUrl])` is scoped to `orgId` — two different tenants with the same `streamUrl` is allowed (shared URL is their own concern). RLS policies prevent cross-tenant reads. |
| Enumeration of competitor camera URLs via P2002 | Information Disclosure | `DuplicateStreamUrlError` returns a 409 with generic message; DOES NOT leak which camera ID conflicts. Consistent with `organizations.service.ts:25-27` pattern. |
| Retry storm exhausting probe queue | Denial of Service | BullMQ `jobId` dedup merges duplicates (D-04). Worker concurrency capped at 5 (already set at `stream-probe.processor.ts:30`). Per-IP rate limit at the API endpoint is future-proof (UI-SPEC calls out `Probe queued recently` toast). |
| codecInfo JSON injection (stored XSS) | Tampering | Error strings from ffprobe stderr → `codecInfo.error` are rendered in tooltips via shadcn `TooltipContent` which React-escapes by default. No `dangerouslySetInnerHTML` in UI-SPEC component inventory. Safe. |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp/19-CONTEXT.md` — 18 locked decisions D-01..D-18
- `.planning/phases/19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp/19-UI-SPEC.md` — 4-state codec cell, color map, error copy dictionary
- `.planning/debug/camera-stream-validation-audit.md` — file:line evidence for every gap Phase 19 closes
- `apps/api/src/cameras/cameras.service.ts` — createCamera (L127-152), bulkImport (L304-373), maintenanceMode pattern (L210-300)
- `apps/api/src/cameras/ffprobe.service.ts` — hardcoded `-rtsp_transport` at L24; redactUrl at L56-67
- `apps/api/src/streams/processors/stream-probe.processor.ts` — existing queue worker + current codecInfo shapes (L46-79)
- `apps/api/src/streams/processors/stream.processor.ts` — StreamJobData shape (L11-17), defensive guard (L47-56)
- `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts` — hardcoded `-rtsp_transport` at L20
- `apps/api/src/streams/streams.service.ts` — StreamJobData build (L49-55), jobId pattern (L58,64)
- `apps/api/src/resilience/job-data.helper.ts` — shared StreamJobData builder (L28)
- `apps/api/src/srs/srs-api.service.ts` — existing getStreams method (L15-19); no per-stream method yet
- `apps/api/src/srs/srs-callback.controller.ts` — on-publish integration point (L23-31)
- `apps/api/src/dashboard/dashboard.service.ts` — SRS stream name matching pattern (L73-83)
- `apps/api/src/resilience/camera-health.service.ts` — SRS streams Set-based membership check (L77-79)
- `apps/api/src/organizations/organizations.service.ts` — P2002 translation pattern (L17-29)
- `apps/api/src/prisma/schema.prisma:199-234` — current Camera model, no unique constraint
- `apps/api/package.json:18` — `db:push` script showing hand-SQL migration flow
- `apps/api/src/prisma/migrations/drop_org_settings_dead_fields/migration.sql` — example of this repo's hand-written migration style
- `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx` — validateRow (L152-172), counters (L309-311), handleImport (L313-353)
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` — Stream URL field (L213-223), submit disabled rule (L331)
- `apps/web/src/app/admin/cameras/components/cameras-columns.tsx` — codec cell (L148-172) + maintenance wrench pattern (L99-115)
- `apps/web/components.json` — shadcn base-nova + lucide + neutral preset
- `apps/web/package.json` — zod 4.3.6, lucide-react 1.8.0, sonner 2.0.7, xlsx 0.18.5
- CLAUDE.md §"SRS Deep Dive" — HTTP API endpoints, RTSP removal (§5), FFmpeg ingest pattern (§13)
- `.planning/phases/15-ffmpeg-resilience-camera-maintenance/15-CONTEXT.md` §D-11 — jobId idempotency precedent
- `.planning/phases/14-bug-fixes-datatable-migrations/14-CONTEXT.md` §D-04..D-08 — DataTable column conventions

### Secondary (MEDIUM confidence)

- SRS `/api/v1/streams` response shape with `video: {codec, width, height, profile, level}` + `audio: {codec, sample_rate, channel, profile}` — cross-referenced between web search and existing `dashboard.service.ts:73-83` usage
- [SRS HTTP API v6 docs](https://ossrs.net/lts/en-us/docs/v6/doc/http-api) — verified streams endpoint exists, shape confirmed via web search
- [FFmpeg protocols docs](https://ffmpeg.org/ffmpeg-protocols.html) — `-rtsp_transport` is RTSP-specific; RTMP has `-rtmp_*` options; SRT has `latency`, `mode` options
- [Prisma error reference](https://www.prisma.io/docs/orm/reference/error-reference) — P2002 = unique constraint violation; `meta.target` contains field names

### Tertiary (LOW confidence)

- [Prisma issue #6203](https://github.com/prisma/prisma/issues/6203) — `prisma db push` fails adding unique to duplicates (verified via search; exact error message depends on PostgreSQL version)
- Exact ffmpeg 7.x behavior for `-rtsp_transport tcp` passed to RTMP input (A1 in assumptions log — assumed warning not error, not independently verified in sandbox)

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every library is installed and has a documented call site in the existing codebase
- Architecture: **HIGH** — every file change has a file:line anchor; the patterns are all copies of existing in-repo precedents (organizations P2002, bulkImport enqueue, maintenance-mode flag-first order)
- Pitfalls: **HIGH** — the `prisma db push` migration pitfall, the undefined-cameraId enqueue bug, and the SRS app/name matching are all documented in the codebase (MEMORY.md + existing guards); the SRS on-publish delay (A2) is the only MEDIUM item
- SRS response shape: **MEDIUM** — verified via external search + partial internal usage evidence; not load-tested by me in this session
- Migration strategy: **MEDIUM** — keep-oldest is a reasonable default but planner should consult the user before committing

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (30 days — stable stack, no fast-moving pieces except Prisma minor updates which don't affect this phase)
