# Phase 19: Camera input validation and multi-protocol support - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp
**Areas discussed:** Probe strategy on create, Probe UI states, Duplicate policy (bulk import), Test URL endpoint scope

---

## Probe strategy on create

### Q1: ตอนกด Save ใน Add Camera dialog, probe codec/resolution ทำแบบไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| Async background | Save ทันที, enqueue stream-probe job. UI โชว์ codec=pending. | ✓ |
| Sync inline (block save 2-5s) | ffprobe รันใน save transaction, immediate feedback but slow form | |
| Hybrid (fast reachability + async codec) | Sync TCP connect 2s then async ffprobe | |
| No probe on create | Manual Test URL button only | |

**User's choice:** Async background
**Notes:** Reuses existing BullMQ queue pattern from bulk import + Phase 15 D-11 jobId dedup

### Q2: Trigger อื่นๆ ที่ควร probe ซ้ำ? (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| On stream start | Refresh codecInfo from SRS /api/v1/streams/{id} when FFmpeg starts | ✓ |
| Manual retry button | User-initiated re-probe in detail sheet | |
| Scheduled re-probe | Daily automatic re-probe | |

**User's choice:** On stream start only
**Notes:** Manual retry covered by inline retry icon in table (see Area 2)

---

## Probe UI states

### Q1: ใน Camera table / detail, codec/resolution ควรโชว์ยังไง เมื่อยังไม่มีข้อมูล?

| Option | Description | Selected |
|--------|-------------|----------|
| 3-state with icons | Pending spinner / Failed amber + tooltip / — no-data | ✓ |
| Text label inline | "Probing..." / "Probe failed" as text in cell | |
| Keep simple — | Single dash for all states, minimal | |

**User's choice:** 3-state with icons
**Notes:** Keeps column narrow, status visually distinct

### Q2: เมื่อ probe ล้มเหลว user ควรทำได้อะไร?

| Option | Description | Selected |
|--------|-------------|----------|
| Retry button in detail sheet | Separate Re-probe button when opening camera detail | |
| Retry button inline in table | Retry icon directly in codec cell | ✓ |
| Auto-retry on failure | BullMQ exponential backoff, no manual trigger | |

**User's choice:** Retry button inline in table
**Notes:** User chose non-recommended option — prefers action available directly in the table over opening detail sheet

---

## Duplicate policy (bulk import)

### Q1: เจอ URL ซ้ำ (ภายใน CSV หรือเทียบกับ DB) ใน bulk import — ทำยังไง?

| Option | Description | Selected |
|--------|-------------|----------|
| Skip duplicates with warning | Mark row as Duplicate, import the non-dup rows, summary toast | ✓ |
| Hard reject (block import) | Disable Import button until all duplicates removed | |
| Overwrite existing | Update matching camera with CSV data | |

**User's choice:** Skip-with-warning
**Notes:** Forgiving UX, matches bulk workflow where partial-success is expected

### Q2: Duplicate detection เทียบ URL แบบไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| Exact match | Compare strings as-is, no normalization | ✓ |
| Normalized match | Strip trailing slash, lowercase host, resolve default ports | |
| Host+port only (ignore path) | Treats each IP as one camera — breaks multi-stream cameras | |

**User's choice:** Exact match
**Notes:** Predictable; pairs with Prisma @@unique constraint which is also exact

### Q3: ระดับ Prisma unique constraint?

| Option | Description | Selected |
|--------|-------------|----------|
| @@unique([orgId, streamUrl]) only | DB constraint, translate P2002 in service | |
| Application-level only | Check in service, no DB constraint | |
| Both (app check + DB constraint) | Explicit error in app + safety net in DB | ✓ |

**User's choice:** Both (app check + DB constraint)
**Notes:** App layer provides clean error UX, DB layer catches races and bypass paths

---

## Test URL endpoint scope

### Q1: Pre-save Test URL — ให้ทดสอบ URL ก่อน save camera?

**Question asked but initially rejected** — user asked for clarification on what Test URL meant. Claude explained the flow (new `POST /cameras/test-url` endpoint, accepts URL string, runs ffprobe, returns codec/resolution). User responded: "ไม่ต้องมี test url ก็ได้ เพราะ url แค่ต้องการเช็คว่าซ้ำกับที่ add ไปแล้วหรือเปล่า"

**Resolved to:** No Test URL endpoint. Duplicate check (Area 3) + async probe (Area 1) + failed-state UI (Area 2) cover the user's actual intent.

**SSRF discussion skipped** — not needed without a user-facing URL-probe endpoint.

---

## Claude's Discretion

- Frontend format validation depth (mirror backend zod prefix check as live validation)
- Rename `rtspUrl` → `inputUrl` in StreamJobData + callers
- Migration strategy for existing duplicate rows before @@unique applies
- Protocol-branch flags in ffprobe + ffmpeg builder
- Error tooltip copy for failed-probe state (English, concise)

## Deferred Ideas

- SRS direct RTMP ingest (zero-transcode path via on_publish)
- Camera credentials as separate fields (rotation support)
- Scheduled re-probe (daily/weekly)
- URL normalization for duplicate detection
- CSV "Overwrite existing" import mode
