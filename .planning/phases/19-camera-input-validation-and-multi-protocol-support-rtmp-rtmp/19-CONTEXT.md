# Phase 19: Camera input validation and multi-protocol support (RTMP/RTMPS) - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Make `Camera.streamUrl` trustworthy end-to-end — validate format at input, detect codec/resolution reliably, support multiple ingest protocols (RTSP, SRT, RTMP, RTMPS), and prevent duplicates at both Add Camera and Bulk Import paths. Scope stays inside the camera-ingest pipeline (DTOs, service, ffprobe, ffmpeg builder, stream-probe processor, admin/cameras UI).

**Explicitly NOT in scope:**
- SRS direct RTMP ingest / zero-transcode path via on_publish callback
- HLS delivery changes, playback, recordings
- Camera credentials rotation or credentials-as-separate-field refactor
- Continuous / scheduled re-probe beyond the two chosen triggers

</domain>

<decisions>
## Implementation Decisions

### Probe Strategy (codec/resolution population)
- **D-01:** Probe runs asynchronously on a BullMQ `stream-probe` queue. `createCamera` (single) enqueues a probe job immediately after commit, same pattern as existing `bulkImport`. Save is never blocked by ffprobe; form returns as soon as the row is written.
- **D-02:** Probe also refreshes on stream start — the first successful FFmpeg ingest reads SRS `/api/v1/streams/{id}` and writes the authoritative `codecInfo` (this is ground truth, since FFmpeg is already running and has negotiated the stream).
- **D-03:** No sync inline probe, no hybrid reachability pre-check, no scheduled re-probe. Two triggers total: on create, and on stream start.
- **D-04:** BullMQ `jobId = "probe:{cameraId}"` for idempotency — mirrors the `camera:{cameraId}` dedup pattern from Phase 15 D-11. Duplicate enqueues are merged automatically.

### Probe UI States (codec/resolution column + detail)
- **D-05:** Codec column renders three visual states, not a single `—`:
  - **Pending:** spinner icon + tooltip "Probing…"
  - **Failed:** amber warning icon + tooltip showing the error reason (e.g., "Connection refused", "401 Unauthorized", "Timeout")
  - **No data:** `—` (camera never reached a successful probe AND is not currently probing)
  - **Success:** `H.264 · 1920×1080` (text, per existing cameras-columns.tsx:148-172 pattern)
- **D-06:** When state is `failed`, a small retry icon renders inline in the cell. Clicking re-enqueues the probe job (same `jobId`, BullMQ drops if one is already queued). No separate button in the detail sheet — inline is enough.
- **D-07:** The `codecInfo` JSON schema extends to carry status: `{ status: "pending" | "failed" | "success", video: {...}, audio: {...}, error: "...", probedAt: ISO }`. This replaces today's ad-hoc shape (empty `{}` or `{ error }` blob).

### Duplicate Detection (bulk import + single add)
- **D-08:** Duplicate policy: **skip-with-warning**, not hard-reject. In bulk import, rows whose URL exists (within-file or against-DB for the same org) are marked with a distinct "Duplicate" icon (not the ✓/✗ pair used for format validity). The Import button stays enabled. On confirm, duplicates are silently skipped; the result toast lists how many were imported vs skipped.
- **D-09:** URL comparison is **exact string match**, not normalized. `rtsp://u:p@host/s1` ≠ `rtsp://u:p@host:554/s1`. Reason: predictable, matches the DB unique constraint, avoids normalization edge cases that hide real duplicates.
- **D-10:** Duplicate detection happens at **three layers**: (a) client-side within-file dedup in `bulk-import-dialog.tsx` `validateRow`, (b) server-side pre-insert query in `cameras.service.ts` `bulkImport`, (c) Prisma `@@unique([orgId, streamUrl])` as the DB safety net that catches races.
- **D-11:** P2002 (Prisma unique violation) is caught and translated to `DuplicateStreamUrlError` at the service layer so API responses stay user-friendly.

### Protocol Support (RTMP/RTMPS)
- **D-12:** Extend zod refine in `create-camera.dto.ts`, `update-camera.dto.ts`, `bulk-import.dto.ts` to accept `rtsp://|srt://|rtmp://|rtmps://`. No direct-ingest path via SRS callbacks — RTMP flows through FFmpeg just like RTSP (future phase can add zero-transcode).
- **D-13:** Protocol-branch the `-rtsp_transport tcp` flag in both `ffprobe.service.ts` and `ffmpeg-command.builder.ts`. Only add the flag when URL starts with `rtsp://`. For RTMP/SRT, omit it.
- **D-14:** Rename the internal job payload field `rtspUrl` → `inputUrl` (in `StreamJobData` and its callers in `stream.processor.ts`, `streams.service.ts`) so the naming stops lying about protocol. The DB column `Camera.streamUrl` is already protocol-neutral and stays untouched.

### Frontend Validation (Add Camera + Bulk Import)
- **D-15:** Add Camera dialog (`camera-form-dialog.tsx`) adds live prefix validation that mirrors the backend zod refine — same allowed protocols (`rtsp|srt|rtmp|rtmps`). Submit button stays disabled with an inline error when the URL fails the prefix check.
- **D-16:** Bulk import (`bulk-import-dialog.tsx`) `validateRow` is extended: same prefix check as D-15, plus a non-empty host segment, plus within-file duplicate detection (D-10a). The existing "N valid" counter becomes "N valid, M duplicate" when duplicates exist.
- **D-17:** Bulk import server DTO (`bulk-import.dto.ts`) is brought to parity with `create-camera.dto.ts` — add `.url()` to the streamUrl field. This closes the existing gap where bulk import accepted URLs the single-create endpoint would reject.

### Test URL Endpoint
- **D-18:** No pre-save Test URL endpoint. Async probe (D-01) + failed-state UI (D-05) + retry (D-06) cover the "was my URL valid?" UX without adding a new endpoint, SSRF surface, or rate limit. Existing `POST /cameras/:id/test-connection` stays as-is for post-save re-testing.

### Claude's Discretion
- Exact copy for error tooltips in the failed-probe state (English, concise — match existing tone)
- Migration strategy for existing duplicate rows before `@@unique([orgId, streamUrl])` applies: planner decides between (a) dedup query keeping oldest/newest, (b) soft-delete, (c) fail migration with operator runbook. No right answer without seeing production data first.
- Whether to expose the probe `status` field to API clients or keep it internal (probably expose — cleaner contract for the UI)
- Exact regex for the host segment in bulk-import client validation (D-16) — use `new URL()` parsing where possible rather than regex, since the WHATWG URL parser handles edge cases better

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit + prior investigation
- `.planning/debug/camera-stream-validation-audit.md` — 5-question audit that motivated this phase. Full evidence (file:line) for every gap this phase closes. Read first.

### SRS + FFmpeg protocol behavior
- `CLAUDE.md` §"SRS Deep Dive" — RTMP native support (port 1935), FFmpeg ingest pattern for RTSP-to-RTMP push, ffprobe flags by protocol. Source of truth for what SRS does / doesn't do.

### Prior phase decisions that carry forward
- `.planning/phases/15-ffmpeg-resilience-camera-maintenance/15-CONTEXT.md` §D-11 — BullMQ `jobId = "camera:{cameraId}"` dedup pattern. Phase 19 reuses this exact idempotency approach for the probe queue (`probe:{cameraId}`).
- `.planning/phases/14-bug-fixes-datatable-migrations/14-CONTEXT.md` §D-04..D-08 — DataTable column conventions. The new 3-state codec column follows these rules (tooltip placement, icon sizing, column alignment).
- `.planning/phases/15-ffmpeg-resilience-camera-maintenance/15-CONTEXT.md` §D-16 — Camera table status-column pattern with stacked icons. Probe status renders inline in the codec column, not as an additional status icon — keeps the status column focused on operational state (online/recording/maintenance).

### Project context
- `.planning/PROJECT.md` — Core value statement (developers embed HLS from any protocol) and the security model (session-based playback + domain allowlist + API key) that this phase preserves unchanged.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`StreamProbeProcessor`** (`apps/api/src/streams/processors/stream-probe.processor.ts`) — already exists from quick task 260421-f0c. Currently used by bulk import only; Phase 19 extends it to also be triggered by `createCamera` (single) and on stream start.
- **`FfprobeService`** (`apps/api/src/cameras/ffprobe.service.ts`) — shell out to `ffprobe` with JSON output. Currently hardcodes `-rtsp_transport tcp`; Phase 19 makes this protocol-aware.
- **`FfmpegCommandBuilder`** (`apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts`) — builder pattern for `.inputOptions([...])`. Same `-rtsp_transport tcp` hardcode; same protocol-branch fix.
- **`CameraStatusDot`** + column factory (Phase 14/15 pattern) — Phase 19 adds a new column cell renderer with spinner / amber / retry states but reuses the icon library (`lucide-react`) and tooltip component (`shadcn/ui`).
- **BullMQ queue module** — already registered in `apps/api/src/streams/streams.module.ts`. Probe queue already exists (from 260421-f0c); this phase only adds enqueue call sites.
- **Prisma `Camera` model** (`apps/api/src/prisma/schema.prisma:199-234`) — has `codecInfo Json?` column already. No schema change needed for the 3-state status (embeds in the existing JSON). Only schema change: adding `@@unique([orgId, streamUrl])`.

### Established Patterns
- **BullMQ `jobId` idempotency** — Phase 15 D-11 set the precedent. Every new queue uses `{queueName}:{cameraId}` as the jobId so duplicate enqueues merge.
- **DTO validation via zod refine** — all three camera DTOs (`create`, `update`, `bulk-import`) use the same `.refine(url => /^(rtsp|srt):\/\//i.test(url))` pattern. Phase 19 updates the allowlist in one place per DTO.
- **Service-layer error translation** — existing services catch Prisma errors (e.g., `P2025` for not-found) and throw domain-specific errors. Phase 19 adds `P2002 → DuplicateStreamUrlError` translation.
- **Column cells as small React components** — `cameras-columns.tsx` defines each cell inline; Phase 19 factors out `CodecStatusCell` when the logic grows past ~20 lines.

### Integration Points
- **Stream start hook** — `StreamProcessor` (`apps/api/src/streams/processors/stream.processor.ts`) is where the "refresh on stream start" trigger (D-02) fires. When FFmpeg transitions to a running state, enqueue a probe job with `probe:{cameraId}` jobId.
- **Bulk import dialog** — `bulk-import-dialog.tsx:152-172` `validateRow` is the single place that decides a row's status icon. D-08 (skip-with-warning) and D-10a (within-file dedup) land here.
- **Cameras controller** — no new endpoints needed (D-18). Existing POST /cameras, POST /cameras/bulk-import, and GET /cameras absorb the new behavior via DTO + service changes.
- **Prisma migration** — one migration adds `@@unique([orgId, streamUrl])`. Claude's discretion (above) handles the existing-duplicate-data question during planning.

</code_context>

<specifics>
## Specific Ideas

- The debug audit found `codecInfo` today is stored as either `{}` (never probed) or `{ error: "..." }` (probe failed) or a populated object (success). These three cases are visually indistinguishable in the current UI (all render as `—`). The D-05..D-07 decisions exist specifically to collapse that ambiguity.
- User feedback from the audit conversation: "ไม่ต้องมี Test URL ก็ได้ เพราะ url แค่ต้องการเช็คว่าซ้ำกับที่ add ไปแล้วหรือเปล่า" → drove D-18. The duplicate check is the primary user intent; probe feedback is a nice side-effect that the async pipeline already delivers.
- CSV import status column today shows only ✓/✗ (valid/invalid format). Adding a third icon for "Duplicate" (e.g., overlapping-circles icon) keeps the pattern visual-first, consistent with the existing minimal UI preference.
- RTMP scope confirmed end-to-end in this discussion as "unblock via FFmpeg path, not direct ingest" — explicitly rejects the zero-transcode future optimization for this phase.

</specifics>

<deferred>
## Deferred Ideas

- **SRS direct RTMP ingest (zero-transcode path)** — use SRS `on_publish` callback to let cameras push directly to port 1935, skip FFmpeg entirely when codec = H.264 + AAC. Significant performance win but requires architecture discussion (auth, stream key generation, health monitoring). Needs its own phase with `/gsd-discuss-phase` up front.
- **Camera credentials as separate fields** — today `Camera.streamUrl` embeds `user:pass` in the URL. Separating them enables credential rotation and URL reuse across test/prod. Out of scope — Phase 19 keeps the single URL column.
- **Scheduled re-probe** — daily/weekly re-probe to catch codec changes after firmware updates. Rejected as overkill for Phase 19 since on-stream-start (D-02) already refreshes whenever the stream restarts.
- **URL normalization** (strip trailing slash, default port expansion) — considered for D-09 and rejected as adding edge cases without clear user benefit. Revisit only if real duplicate misses surface in production.
- **CSV "Overwrite existing" import mode** — update matching cameras instead of skipping. Powerful but risky (silently mutates data). Deferred until there's a real workflow that needs it.

</deferred>

---

*Phase: 19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp*
*Context gathered: 2026-04-22*
