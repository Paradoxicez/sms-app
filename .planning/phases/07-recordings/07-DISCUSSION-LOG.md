# Phase 7: Recordings - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 07-recordings
**Areas discussed:** Recording trigger, Storage & archival, Playback & browsing, Retention & quotas

---

## Recording Trigger

### Trigger Mode

| Option | Description | Selected |
|--------|-------------|----------|
| Manual only | Button Start/Stop on camera detail — simple, controlled | |
| Manual + Schedule | Button + scheduled recording windows (e.g., 08:00-18:00) via cron | ✓ |
| Always-on per camera | Auto-record when stream online — high storage usage | |

**User's choice:** Manual + Schedule
**Notes:** None

### Recording Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| on_hls callback archive | SRS callback → backend reads segment → uploads to MinIO. No config reload needed | ✓ |
| SRS DVR config | SRS writes files via DVR config — limited dynamic control (removed in v4+) | |
| Separate FFmpeg process | Dedicated FFmpeg for recording — full control but double resource usage | |

**User's choice:** on_hls callback archive
**Notes:** User requested trade-off comparison before deciding. Comparison table presented with pros/cons/complexity for all three options. User chose callback approach after seeing that SRS DVR dynamic control was removed in v4+ and that callback reuses existing infrastructure.

---

## Storage & Archival

### Bucket Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Per-org bucket | One bucket per org (org-{id}/), easy quota calculation | ✓ |
| Single bucket + prefix | One bucket, prefix path — simpler but quota harder | |
| Per-camera bucket | One bucket per camera — too many buckets | |

**User's choice:** Per-org bucket
**Notes:** None

### Archive Format

| Option | Description | Selected |
|--------|-------------|----------|
| HLS segments directly | Store fMP4 .m4s files, generate m3u8 dynamically — no transcoding needed | ✓ |
| Merge to MP4 | Combine segments into MP4 chunks — needs CPU, adds delay | |

**User's choice:** HLS segments directly
**Notes:** None

---

## Playback & Browsing

### Browse UI

| Option | Description | Selected |
|--------|-------------|----------|
| Timeline bar + calendar | Calendar date picker → 24h timeline with colored segments → click to play | ✓ |
| List view + date filter | Recording list sorted by time with date filter | |
| Thumbnail grid | Preview thumbnails every 15s in grid — visual but complex | |

**User's choice:** Timeline bar + calendar
**Notes:** NVR/CCTV-style interface

### Playback Method

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic HLS manifest | Backend generates m3u8 from archived segments for selected time range | ✓ |
| Pre-signed MinIO URLs | Direct segment access via pre-signed URLs — auth more complex | |

**User's choice:** Dynamic HLS manifest
**Notes:** None

---

## Retention & Quotas

### Retention Level

| Option | Description | Selected |
|--------|-------------|----------|
| Per-camera + org default | Camera-level override, org-level fallback — flexible | ✓ |
| Org-level only | Single retention setting per org — simple but inflexible | |
| Full hierarchy | Camera > Site > Project > Org — too complex for v1 | |

**User's choice:** Per-camera + org default
**Notes:** None

### Over Quota Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Block new + alert | Alert at 80%/90%, block new recordings at 100%, preserve existing | ✓ |
| Auto-delete oldest | Delete oldest recordings to make space — risk of data loss | |
| Soft limit + warn only | Alert only, allow overage — no enforcement | |

**User's choice:** Block new + alert
**Notes:** None

### Cleanup Schedule

| Option | Description | Selected |
|--------|-------------|----------|
| BullMQ cron hourly | Repeatable job every hour — same pattern as Phase 6 health checks | ✓ |
| MinIO lifecycle rules | S3 lifecycle policy — no per-camera granularity, DB not synced | |

**User's choice:** BullMQ cron hourly
**Notes:** None

---

## Claude's Discretion

- Prisma schema design for recording tables
- MinIO client library choice
- Timeline bar component implementation
- m3u8 manifest generation details
- Segment metadata tracking
- Storage calculation/caching
- Error handling for failed uploads

## Deferred Ideas

- Camera detail page redesign (broader UI concern, existing 5-tab structure sufficient for recordings tab)
