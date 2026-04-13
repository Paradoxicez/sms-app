# Phase 7: Recordings - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Record camera streams via HLS segment archival to MinIO/S3, browse recorded footage with time-range selection and playback, manage retention policies per camera with org defaults, and enforce storage quotas per organization. Live streaming, playback security (JWT tokens), and camera management are handled in earlier phases.

</domain>

<decisions>
## Implementation Decisions

### Recording Trigger
- **D-01:** Manual + Schedule — operators can start/stop recording via button on camera detail page, and configure scheduled recording windows (e.g., 08:00-18:00)
- **D-02:** on_hls callback archive mechanism — SRS creates HLS segments → on_hls callback fires to backend → backend checks recording flag in DB → if enabled, reads segment file from shared volume and uploads to MinIO. No separate FFmpeg process or srs.conf reload needed
- **D-03:** Schedule implementation via BullMQ repeatable jobs — cron jobs toggle recording flag per camera at configured start/stop times

### Storage & Archival
- **D-04:** Per-org bucket structure in MinIO — one bucket per organization (e.g., `org-{id}`), path: `{cameraId}/{YYYY-MM-DD}/{HH-MM-SS}_{seq_no}.m4s`
- **D-05:** Store HLS fMP4 segments directly (.m4s files) — no transcoding or merging to MP4. Backend generates m3u8 manifests dynamically for playback
- **D-06:** Docker Compose must add MinIO service with shared volume for SRS HLS output accessible by API container

### Playback & Browsing
- **D-07:** Timeline bar + calendar UI — user selects date from calendar → horizontal 24-hour timeline bar shows colored segments where recordings exist → click/drag to select time range → plays in embedded hls.js player
- **D-08:** Dynamic HLS manifest — backend queries DB for archived segments in the requested time range, generates m3u8 playlist pointing to MinIO segments via pre-signed URLs or backend proxy, served to hls.js player
- **D-09:** Recording playback page lives within camera detail (new "Recordings" tab alongside existing tabs)

### Retention & Quotas
- **D-10:** Per-camera retention with org default — each camera can override retention period (e.g., 7 days, 30 days). If not set, falls back to org-level default retention setting
- **D-11:** Storage quota enforcement — alert at 80% and 90% of `maxStorageGb` (from Package model). At 100%, block new recordings but preserve existing ones. Uses existing NotificationsModule for alerts
- **D-12:** BullMQ cron cleanup job runs every hour — scans for segments past retention period, deletes from MinIO and removes DB records. Follows same repeatable job pattern as Phase 6 health checks

### Claude's Discretion
- Prisma schema design for Recording, RecordingSegment, RecordingSchedule tables
- MinIO client library choice and configuration
- Exact timeline bar component implementation
- m3u8 manifest generation logic details
- Segment metadata tracking in DB (duration, size, sequence number)
- Storage usage calculation and caching strategy
- Error handling for failed uploads and partial recordings

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Recording Requirements
- `.planning/REQUIREMENTS.md` §Recordings — REC-01 through REC-05 requirements

### SRS Integration (Recording-relevant)
- `CLAUDE.md` §SRS HTTP Callbacks — on_hls callback data fields (duration, file, url, m3u8, seq_no) and on_dvr callback
- `CLAUDE.md` §Recording (DVR) — SRS DVR session vs segment modes, dvr_duration config
- `CLAUDE.md` §HLS Configuration — fMP4 segments, fragment size, cleanup settings
- `CLAUDE.md` §Docker Setup — Volume mount paths (/usr/local/srs/objs/nginx/html for HLS segments)

### Existing Infrastructure
- `apps/api/src/srs/srs-callback.controller.ts` — on_hls and on_dvr handlers (currently log-only, ready for recording logic)
- `apps/api/src/features/feature-key.enum.ts` — RECORDINGS feature toggle already defined
- `apps/api/src/prisma/schema.prisma` §Package — maxStorageGb field for quota enforcement
- `docker-compose.yml` — Current services (needs MinIO addition + shared volume)

### Prior Phase Patterns
- `.planning/phases/02-stream-engine-camera-management/02-CONTEXT.md` — FFmpeg/BullMQ patterns, SRS callback integration, D-12 (on_hls/on_dvr registered)
- `.planning/phases/05-dashboard-monitoring/05-CONTEXT.md` — NotificationsModule for alerts
- `.planning/phases/06-srs-cluster-scaling/06-CONTEXT.md` — BullMQ repeatable health check job pattern (reuse for retention cleanup)

### Tech Stack
- `CLAUDE.md` §Recommended Web App Stack — BullMQ for job queues, hls.js for playback

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SrsCallbackController.onHls()` — Handler registered and receiving callbacks, currently log-only. Add recording logic here
- `SrsCallbackController.onDvr()` — DVR callback handler available if needed
- `FeatureKey.RECORDINGS` — Feature toggle enum value ready for guard checks
- `Package.maxStorageGb` — Storage limit field in Prisma schema, queryable per org
- `NotificationsModule` — Ready for storage alert notifications (Phase 5)
- `StatusGateway` (Socket.IO) — WebSocket broadcast pattern for real-time recording status updates
- BullMQ infrastructure — Queue setup, repeatable jobs, worker patterns established in Phase 2 and 6

### Established Patterns
- BullMQ repeatable jobs for periodic tasks (health checks in Phase 6 — same pattern for retention cleanup)
- Socket.IO namespaces for real-time updates (/camera-status, /cluster-status — add /recording-status)
- Feature toggle guard pattern via `@UseGuards(FeatureGuard)` with `@RequireFeature(FeatureKey.RECORDINGS)`
- SRS callback authentication (return `{ code: 0 }` to allow)
- Shared volume mounts in Docker Compose for cross-container file access

### Integration Points
- Camera detail page — add "Recordings" tab (existing tab structure from Phase 5 redesign)
- SRS HLS output directory — mount as shared volume between SRS and API containers
- Org settings — add default retention period to existing org settings model
- Package limits — integrate storage quota check with existing package enforcement logic

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

### Reviewed Todos (not folded)
- **Redesign camera detail page** — UI redesign concern is broader than recordings; camera detail page already has 5-tab structure from Phase 5. Recording tab fits within existing structure without full redesign. Defer to backlog.

</deferred>

---

*Phase: 07-recordings*
*Context gathered: 2026-04-13*
