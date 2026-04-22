---
status: diagnosed
trigger: "Investigate 5 questions about camera stream handling: codec/resolution display, Add Camera validation, Bulk Import validation, duplicate detection, RTMP support"
created: 2026-04-22T00:00:00Z
updated: 2026-04-22T12:00:00Z
---

## Current Focus

hypothesis: (diagnosed — 5 findings below)
test: read schema, DTOs, service, controller, frontend dialogs, ffprobe, stream processor, srs.conf, tests
expecting: file:line evidence per question
next_action: return ROOT CAUSE FOUND report to caller

## Symptoms

expected:
  1. Codec/resolution shown in UI
  2. Add Camera validates URL format / probes
  3. Bulk CSV rigorously validates URL
  4. Bulk CSV detects duplicates (in-file + against DB)
  5. RTMP URLs work end-to-end

actual:
  1. Codec/resolution often blank (user observation)
  2. Unknown validation level
  3. Unknown what "valid ✓" means
  4. Unknown
  5. Only RTSP tested

errors: none — feature audit
reproduction: code reading only
started: 2026-04-22 (triggered during Phase 18)

## Eliminated

- hypothesis: "UI doesn't have codec/resolution columns at all"
  evidence: apps/web/src/app/admin/cameras/components/cameras-columns.tsx:148-172 defines Codec + Resolution columns reading codecInfo.video / width x height. ViewStreamSheet view-stream-sheet.tsx:107-118 also renders them. So the UI IS wired — the issue is data population, not rendering.
  timestamp: 2026-04-22

## Evidence

- checked: apps/api/src/prisma/schema.prisma:199-234 (Camera model)
  found: No top-level codec/resolution/width/height columns. Only `codecInfo Json?` (line 212) and `needsTranscode Boolean` (line 211). No `@unique` on streamUrl — only `@@index([orgId])`, `@@index([siteId])`, etc. Duplicate streamUrls are allowed at the DB level.

- checked: apps/api/src/cameras/dto/create-camera.dto.ts:5-8, update-camera.dto.ts:5-12, bulk-import.dto.ts:5-8
  found: ALL three zod schemas enforce `url.startsWith('rtsp://') || url.startsWith('srt://')`. `rtmp://` is explicitly REJECTED (400 Bad Request).

- checked: apps/api/src/cameras/cameras.service.ts:127-152 (createCamera) and 304-359 (bulkImport)
  found: createCamera does NO ffprobe — just writes `needsTranscode: false` and leaves codecInfo null. bulkImport enqueues a BullMQ 'stream-probe' job per camera (lines 342-356) — best-effort, silently skipped in tests, and failures only write an error blob into codecInfo.

- checked: apps/api/src/cameras/ffprobe.service.ts:20-54
  found: `probeCamera` runs `ffprobe ... -rtsp_transport tcp "<url>"` UNCONDITIONALLY (line 24). The `-rtsp_transport tcp` flag is RTSP-only; for SRT it is ignored and for RTMP it would produce a warning. Output writes into codecInfo as {codec, width, height, fps, audioCodec, probedAt}. `needsTranscode = codec in ['hevc','h265']` (line 40).

- checked: apps/api/src/streams/processors/stream-probe.processor.ts:1-87
  found: Async worker consumes `stream-probe` queue, writes codecInfo JSON to Camera. Concurrency 5. Probe failures do NOT throw (prevents retry storm) but also mean the field stays blank / has error blob.

- checked: apps/api/src/cameras/cameras.controller.ts:277-303 (testConnection) and :263-273 (bulkImport)
  found: `POST /api/cameras/:id/test-connection` triggers ffprobe on demand and writes codecInfo. This is the ONLY place a single-camera create can get its codec populated — operator must click Test Connection. bulk-import endpoint has no de-dup.

- checked: apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx:141-188
  found: Client-side validation only checks `name.trim()` and `streamUrl.trim()` non-empty (lines 143, 331). NO regex, NO protocol check, NO probe. Backend zod is the sole gatekeeper. No pre-save Test Connection integration.

- checked: apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx:152-172 (validateRow) and :309-311 (validCount/canImport)
  found: Client-side validateRow enforces: name required, URL starts with `rtsp://` or `srt://`, lat/lng numeric. That's what the ✓ / ✗ column reflects. NO within-file duplicate check. NO server-side duplicate check. Submission posts straight to /api/cameras/bulk-import and the backend also does not dedupe.

- checked: apps/web/src/app/admin/cameras/components/cameras-columns.tsx:148-172
  found: Default columns include Codec (codecInfo?.video) and Resolution (`${width}x${height}`). Render `—` when codecInfo is null.

- checked: apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx:107-118
  found: Detail sheet renders Codec + Resolution rows, same data source.

- checked: apps/web/src/app/admin/cameras/components/test-connection-card.tsx:35-48
  found: UI calls POST /api/cameras/:id/test-connection to populate codecInfo post-save (reactive, operator-driven).

- checked: apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts:13-54
  found: `buildFfmpegCommand` unconditionally sets `.inputOptions(['-rtsp_transport', 'tcp'])` (line 20). No protocol branching. An RTMP input URL would produce FFmpeg warnings ("-rtsp_transport set for non-RTSP input"), and more importantly the code never exercises a native RTMP ingest path — it always goes through FFmpeg.

- checked: apps/api/src/streams/processors/stream.processor.ts:44-66
  found: Destructures `rtspUrl` (naming assumes RTSP), passes whatever streamUrl the camera has to `ffmpegService.startStream`. Any non-RTSP input reaches FFmpeg with RTSP-only options.

- checked: apps/api/src/streams/streams.service.ts:49-55
  found: `rtspUrl: camera.streamUrl` — whatever the user stored gets forwarded as if it were RTSP.

- checked: config/srs.conf:1-47
  found: SRS listens on 1935/RTMP, 8080/HTTP, 1985/API. The RTMP listener is for our OWN FFmpeg workers pushing TO SRS (line 60 of stream.processor: `rtmp://${srsHost}:1935/${streamKey}`), not camera ingest. No SRT listener even though DTO accepts `srt://`.

- checked: apps/api/tests/cameras/bulk-import.test.ts (describe list)
  found: Tests cover rtsp://, srt:// (accept), http:// (reject), empty cameras, >500 cameras, maxCameras limit, CSV/JSON parsing. NO rtmp:// test. NO duplicate-detection test.

- checked: grep rtmp:// across apps/api
  found: Only hit is output URL `rtmp://${srsHost}:1935/…` (FFmpeg→SRS). No code path ingests RTMP from a camera.

## Resolution

root_cause: see 5 findings in ROOT CAUSE FOUND report returned to caller.

### 1. Codec/Resolution display
ปัจจุบันมี UI columns + detail rows แล้ว แต่ data source (`Camera.codecInfo` JSON) มักจะว่างเพราะ:
  - Single-camera create ไม่ probe (service.ts:137-151)
  - Bulk-import probe เป็น best-effort async (service.ts:342-356 + stream-probe.processor.ts:63-85) — ถ้า ffprobe ล้มเหลว (camera offline, credentials ผิด) จะเก็บ error แทน codec
  - probeCamera ใช้ `-rtsp_transport tcp` unconditional (ffprobe.service.ts:24) จึง fail สำหรับ SRT โดยเงียบ ๆ
Fix idea: probe inline on single-camera create (fire-and-forget), protocol-branch ffprobe flags, surface "probe pending/failed" state in UI.

### 2. Add Camera format detection
ปัจจุบันมี **backend-only zod check** (`rtsp://` หรือ `srt://`) ผ่าน CreateCameraSchema. Frontend ไม่ validate เลยนอกจาก non-empty. ไม่มี probe ก่อน save.
Fix idea: mirror zod rule ใน frontend (live validation), optional "Test before save" button ที่เรียก /test-connection ใส่ URL ชั่วคราว.

### 3. Bulk Import format check
Client-side: validateRow (bulk-import-dialog.tsx:152-172) เช็ค prefix `rtsp://|srt://` + lat/lng numeric. Server-side: BulkImportSchema เช็คเหมือนกัน. ✓/✗ column = client-side only. ไม่มี deep regex (host/port/path), ไม่มี probe.
Fix idea: เพิ่ม regex สำหรับ host+port+path, optional async probe preview.

### 4. Bulk Import duplicate detection
**ไม่มีเลยทั้งสองฝั่ง**:
  - Client: ไม่ check ซ้ำภายในไฟล์
  - Server (service.ts:318-337): $transaction create ทุก row ไม่มี findMany by streamUrl
  - Schema: streamUrl ไม่มี `@unique` (schema.prisma:205)
Fix idea: (a) client dedupe + flag within-file duplicates เป็น ✗, (b) server pre-check existing cameras by streamUrl (per org), (c) optional `@@unique([orgId, streamUrl])` Prisma constraint.

### 5. RTMP support
**ไม่รองรับ end-to-end**:
  - DTOs ทั้ง 3 reject `rtmp://` (create/update/bulk-import)
  - ffprobe command fix to `-rtsp_transport tcp`
  - FFmpeg command builder ยังคง `-rtsp_transport tcp` unconditional
  - StreamProcessor เรียก field ว่า `rtspUrl` สะท้อน assumption
  - srs.conf มี RTMP listener 1935 แต่ใช้สำหรับ FFmpeg→SRS เท่านั้น ไม่ใช่ camera ingest
  - ไม่มี test case RTMP
แม้ SRS support RTMP native (port 1935 ingest) ตาม CLAUDE.md architecture แต่ pipeline ของ platform เลือกรวมทุก protocol ผ่าน FFmpeg wrapper — ไม่เคย wire direct-ingest path
Fix idea: (a) ขยาย DTO regex ให้ยอม `rtmp://`, (b) protocol-branch ใน ffprobe + ffmpeg builder (RTSP→tcp flag, RTMP/SRT→remove flag), (c) พิจารณา direct RTMP ingest path (skip FFmpeg เมื่อ codec = H.264 และไม่ต้อง transcode) — ต้องการ SRS HTTP callback on_publish flow, (d) rename `rtspUrl` → `inputUrl` เพื่อ clarity.

fix: (diagnose-only — no code changes applied)
verification: (n/a)
files_changed: []
