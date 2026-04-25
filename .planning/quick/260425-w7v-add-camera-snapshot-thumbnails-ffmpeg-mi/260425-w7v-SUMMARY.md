---
quick_id: 260425-w7v
description: Add camera snapshot thumbnails (FFmpeg + MinIO snapshots bucket) for card view
date: 2026-04-25
status: completed
tasks: 3
plan: 260425-w7v-PLAN.md
---

# Quick Task 260425-w7v — Summary

## What was built

Card-view cameras page now displays a per-camera snapshot thumbnail when a JPEG exists in MinIO; otherwise the existing `<Video>` placeholder icon is shown. Live HoverPreviewPlayer is unchanged and overlays the snapshot on hover.

Snapshots are a regenerable cache (one JPEG per camera, overwritten on refresh). Two refresh triggers wired:
1. Backend lifecycle: SRS `on_publish` → camera transitions to online → fire-and-forget snapshot refresh.
2. Frontend: cameras-list page mount → fire-and-forget bulk-refresh call (debounced 5s on the server).

No Prisma schema migration was required — the existing `Camera.thumbnail String?` field is reused to persist the snapshot URL.

## Commits

| # | Commit | Scope |
|---|--------|-------|
| 1 | `86f7295` | `feat(quick-260425-w7v-01): add MinIO snapshots bucket + SnapshotService` |
| 2 | `93e4a81` | `feat(quick-260425-w7v-02): snapshot controller endpoints + on_publish hook` |
| 3 | `f32c746` | `feat(quick-260425-w7v-03): camera-card thumbnail + page-mount bulk refresh` |

## Files changed

**Created:**
- `apps/api/src/cameras/snapshot.service.ts` (195 lines) — FFmpeg one-frame grab via `child_process.spawn`, in-flight dedup `Set<string>`, bulk concurrency=3, bulk-debounce 5s, fire-and-forget upstream wrappers

**Modified:**
- `apps/api/src/recordings/minio.service.ts` — added `ensureSnapshotsBucket / uploadSnapshot / removeSnapshot / getSnapshotUrl` mirroring the avatars block; `Cache-Control: public, max-age=60` (overwriteable, not immutable)
- `apps/api/src/cameras/cameras.module.ts` — register `SnapshotService` provider
- `apps/api/src/cameras/cameras.controller.ts` — `POST /cameras/snapshot/refresh-all` (returns 202) and `POST /cameras/:id/snapshot/refresh` (sync)
- `apps/api/src/srs/srs-callback.controller.ts` — `on_publish` hook calls `refreshOneFireAndForget` after status transition (added to both push and live branches)
- `apps/web/src/app/admin/cameras/components/camera-card.tsx` — 3-way conditional render: HoverPreviewPlayer (on hover) / `<img>` (when thumbnail exists) / `<Video>` placeholder (fallback)
- `apps/web/src/app/admin/cameras/components/cameras-columns.tsx` — minor typing for thumbnail column (legacy table)
- `apps/web/src/components/pages/tenant-cameras-page.tsx` — page-mount fire-and-forget bulk-refresh useEffect

## Key technical decisions

1. **FFmpeg source = SRS internal HLS** (`http://localhost:8080/live/{orgId}/{cameraId}.m3u8`) — same upstream the existing preview proxy uses (cameras.controller.ts:509). Works for ALL ingest modes (push/pull, transcode/passthrough) without touching RTSP/RTMP source URLs.
2. **Bucket pattern mirrors avatars** byte-for-byte except `Cache-Control: public, max-age=60` (snapshots are overwriteable, avatars are immutable).
3. **Lifecycle hook fire-and-forget** — `refreshOneFireAndForget` swallows internally so call sites don't need try/catch. `SnapshotService` is `?:` injected in `SrsCallbackController` to preserve positional unit-test constructors.
4. **Concurrency control** — In-process `Set<string>` per-camera dedup blocks bulk-refresh + on_publish from spawning two FFmpegs for one camera. Bulk fan-out concurrency=3 to bound FFmpeg load on a single Docker host. Bulk endpoint debounced 5s for page-reload spam.
5. **Snapshot hook added to BOTH push and live branches** in `srs-callback.controller.ts` (plan only specified one) — auto-fix to ensure all online transitions trigger refresh, not just live.

## Verification

- `pnpm --filter @sms-platform/api build` → exit 0
- `pnpm --filter @sms-platform/web build` → exit 0
- API tests: 703 passed / 117 todo / 0 failed (94 files)
- Web tests: 505 passed / 1 skipped / 0 failed (58 files)
- Prisma schema diff: empty (no migration required)

## Manual UAT (recommended next steps)

1. Restart API container so the `snapshots` bucket is created at `onModuleInit`.
2. Push a stream from a test camera. Confirm card thumbnail populates with a snapshot within ~5s of going online.
3. Stop the stream → card still shows the last snapshot (no revert to placeholder).
4. Hover the card → live preview still loads and plays as before.
5. Refresh the cameras page → snapshots refresh in background (verify by checking object mtime in MinIO console at `snapshots/<cameraId>.jpg`).
6. A camera that was never online → still shows the `<Video>` placeholder icon.
