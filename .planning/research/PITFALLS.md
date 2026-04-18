# Pitfalls Research

**Domain:** Adding FFmpeg resilience, recording timeline playback, user self-service, camera maintenance mode, DataTable migration, and plan/usage viewer to existing CCTV SaaS platform
**Researched:** 2026-04-18
**Confidence:** HIGH (based on direct codebase analysis of existing implementation)

## Critical Pitfalls

### Pitfall 1: FFmpeg Reconnect Storm After SRS Restart

**What goes wrong:**
When SRS restarts (update, crash, OOM), ALL FFmpeg processes lose their RTMP output simultaneously. With current BullMQ config (`attempts: 20, backoff: exponential from 1s`), every camera job fails and retries at the same time. 50 cameras = 50 FFmpeg processes spawning within 1-2 seconds, all hitting SRS before it finishes startup. SRS either crashes again from the inrush or rejects connections, causing cascading retry storms that burn through all 20 attempts.

**Why it happens:**
The current `StreamProcessor` in `apps/api/src/streams/processors/stream.processor.ts` has no awareness of SRS health. It blindly spawns FFmpeg on retry, which tries to push RTMP to a port that may not be listening yet. The exponential backoff starts at 1s which is too aggressive for infrastructure-level failures. All cameras share the same backoff base, so retries are synchronized.

**How to avoid:**
1. Add a health gate before FFmpeg spawn: poll SRS `/api/v1/versions` (or TCP check port 1935) before attempting reconnection. If SRS is down, use a separate "infrastructure wait" loop with longer intervals (10s), not the per-camera retry budget.
2. Add jitter to backoff: `delay * (0.5 + Math.random())` so cameras do not all retry at the same millisecond.
3. Separate "SRS down" failures from "camera unreachable" failures. SRS down should pause ALL jobs, not retry them individually.
4. Consider a global circuit breaker: if >3 cameras fail within 10s, assume SRS is down and pause the BullMQ queue.

**Warning signs:**
- CPU spikes when SRS restarts
- All cameras show "reconnecting" simultaneously then go "offline" after exhausting retries
- BullMQ `failed` job count spikes suddenly
- SRS crashes repeatedly after restart (thundering herd)

**Phase to address:**
FFmpeg Resilience phase -- must be early because everything else depends on stable streams.

---

### Pitfall 2: Recording State Desync When FFmpeg Dies Mid-Recording

**What goes wrong:**
Camera has `isRecording: true` and an active `Recording` row with `status: 'recording'`. FFmpeg crashes or SRS restarts. The stream reconnects (via BullMQ retry), but nobody restarts recording. The camera shows "recording" in the UI but no new segments are being archived. Worse: the `on_hls` callback fires for the new stream session but `getActiveRecording()` returns the old recording row, so segments from the new SRS publish session get appended to the old recording with a time gap and potentially different fMP4 init segments, corrupting playback.

**Why it happens:**
The current architecture treats recording as completely separate from streaming. `startRecording()` in `RecordingsService` and the FFmpeg lifecycle in `StreamProcessor` are not coupled. When FFmpeg reconnects via BullMQ retry, there is no hook to check "was this camera recording before the crash?" and handle the recording boundary. The `on_unpublish` callback in `SrsCallbackController` explicitly comments "Reconnect is handled by BullMQ -- do not transition status here" but has no recording cleanup logic.

**How to avoid:**
1. On successful reconnection (after `on_publish` callback fires), check `camera.isRecording`. If true, close the old recording (`status: 'complete'`, set `stoppedAt`) and create a new recording. This ensures each recording has a consistent init segment.
2. Never append segments from a new SRS publish session to an old recording -- the fMP4 init segment will differ because SRS generates a new one per publish.
3. Add a `publishSessionId` (from SRS `on_publish` `client_id`) to the recording to detect session boundaries.
4. In `on_unpublish`, if camera `isRecording`, mark a "recording interrupted" flag so the reconnect handler knows to restart it.

**Warning signs:**
- Recordings with time gaps in their segment timestamps
- hls.js playback errors (codec switching error) on recordings that span a reconnection
- `totalDuration` on recording row keeps growing but playback artifacts appear at the boundary

**Phase to address:**
FFmpeg Resilience phase -- recording continuity is part of resilience, not a separate concern.

---

### Pitfall 3: Timeline UI Loading Entire Segment List Into Memory

**What goes wrong:**
A camera recording 24/7 with 2-second HLS segments generates 43,200 segment records per day. The timeline playback page queries all segments for a day to render the timeline bar. The current `getSegmentsForDate()` in `ManifestService` fetches ALL segment timestamps for a day to compute which hours have data -- this query will become catastrophically slow. Similarly, `generateManifest()` fetches all segments for a recording without pagination, generating a manifest with potentially 43,000+ entries that hls.js must parse and buffer.

**Why it happens:**
The current implementation in `apps/api/src/recordings/manifest.service.ts` was built for browse-and-download, not timeline scrubbing. `getSegmentsForDate()` returns individual segment timestamps and processes them in JavaScript. `generateManifest()` builds a single m3u8 with every segment in the recording.

**How to avoid:**
1. Use a SQL aggregate query for timeline data: `GROUP BY date_trunc('hour', timestamp)` or `date_trunc('minute', timestamp)` returns max 24 or 1440 rows regardless of segment count.
2. For the timeline bar at minute-level granularity, consider a pre-computed availability bitmap: a JSON column or separate table tracking which minutes have coverage, updated on segment archival.
3. Implement sub-manifest generation: clicking a point on the timeline requests a manifest for only that 1-hour (or 30-minute) window, not the entire recording.
4. Add a composite index on `RecordingSegment(cameraId, orgId, timestamp)` if not already present (current schema only indexes `recordingId`).

**Warning signs:**
- Timeline page takes >3s to load for a full day of recording
- Database CPU spikes when multiple users open the recordings page
- API timeout errors when generating manifests for long recordings
- hls.js takes 5+ seconds to parse a manifest with 10,000+ entries

**Phase to address:**
Recording Timeline phase -- must design the data access pattern before building the UI.

---

### Pitfall 4: Maintenance Mode Not Blocking Stream Auto-Reconnect

**What goes wrong:**
Admin puts camera in "maintenance" mode. The current status state machine in `StatusService` has valid transitions: `offline -> connecting -> online -> reconnecting/degraded -> offline`. "Maintenance" does not exist. If the developer adds maintenance as a status but does not update `StreamProcessor` and BullMQ logic, the camera keeps trying to reconnect. If maintenance is implemented as just a UI label without stopping the FFmpeg process, it wastes server resources.

**Why it happens:**
Maintenance mode touches multiple layers: the status state machine in `StatusService`, the `StreamProcessor` retry logic, the `SrsCallbackController` callbacks, the recording service, and the UI. Developers often implement it in the UI layer only (a toggle that sets a database flag) without integrating it into the stream lifecycle.

**How to avoid:**
1. Add `maintenance` to `StatusService.validTransitions`. Allow transitions from any state to `maintenance` and from `maintenance` only to `offline` or `connecting`.
2. When entering maintenance: call `StreamsService.stopStream()` which kills FFmpeg and removes the BullMQ job, then set status to `maintenance`.
3. In `StreamProcessor.process()`, check camera status at the START before spawning FFmpeg. If `maintenance`, complete the job without error (so it does not retry).
4. In `SrsCallbackController.onPublish()`, check for maintenance status -- if a stream publishes for a maintenance camera, log a warning.
5. When exiting maintenance: do NOT auto-start streaming. Require explicit "Start Stream" action. This prevents surprise resource usage.
6. If camera was recording when maintenance was entered, close the active recording cleanly.

**Warning signs:**
- Camera in maintenance still shows as "online" or "reconnecting" after toggling
- FFmpeg processes running for cameras marked as maintenance
- BullMQ jobs retrying for maintenance cameras
- Recording continues after entering maintenance mode

**Phase to address:**
Camera Maintenance Mode phase -- but the status state machine change should be designed alongside FFmpeg Resilience to avoid two migrations.

---

### Pitfall 5: Better Auth Self-Service Endpoints Bypassing Org Context and Audit Log

**What goes wrong:**
Better Auth provides built-in endpoints for updating user profile (name, email, password) via its client SDK. But these operate at the user identity level, outside the multi-tenant org context. If the developer uses Better Auth's client `authClient.updateUser()` directly, the change: (a) bypasses the NestJS middleware that injects `orgId`, (b) does not create an audit log entry, (c) may not invalidate other sessions on password change, and (d) could allow email changes without re-verification.

**Why it happens:**
Better Auth's user management is identity-scoped, not org-scoped. The existing NestJS architecture uses `TENANCY_CLIENT` with org context for all operations. Better Auth's client routes go through its own handler (configured in `auth.config.ts`), which is separate from the NestJS controller pipeline.

**How to avoid:**
1. Build self-service endpoints as NestJS controllers that wrap Better Auth calls, not as direct Better Auth client routes. This ensures the request flows through the existing auth guard, org context middleware, and audit logging.
2. For email changes: require current password confirmation and decide whether re-verification is needed. Consider uniqueness validation across the platform.
3. For password changes: require current password. Invalidate all other sessions for the user after password change.
4. For avatar upload: use the existing MinIO infrastructure with a dedicated `avatars` bucket, not a separate upload mechanism.
5. Log all self-service changes to the audit log with org context.

**Warning signs:**
- Self-service changes not appearing in audit log
- Email change succeeds without entering current password
- Other sessions remain active after password change
- Avatar upload uses a different storage path than recordings

**Phase to address:**
User Self-Service phase.

---

### Pitfall 6: fMP4 Manifest Using Wrong HLS Version

**What goes wrong:**
The current `ManifestService.buildManifest()` generates manifests with `#EXT-X-VERSION:3`. The project uses fMP4 HLS segments (`hls_use_fmp4: on` in SRS config). fMP4 requires `#EXT-X-MAP` for init segments, which is only defined in HLS version 7+. Using version 3 with fMP4 causes some players (especially Safari and older hls.js versions) to reject the manifest or fail to load the init segment.

**Why it happens:**
The manifest builder was written to match MPEG-TS HLS conventions (version 3 is sufficient for TS segments). When the project switched to fMP4 segments, the manifest version was not updated.

**How to avoid:**
1. Change `#EXT-X-VERSION:3` to `#EXT-X-VERSION:7` in `ManifestService.buildManifest()`.
2. Ensure `#EXT-X-MAP:URI=` is present in every manifest that references fMP4 segments (already done, but verify version alignment).
3. Test playback in Safari, Chrome, and Firefox. Safari is the strictest about HLS spec compliance.

**Warning signs:**
- Recording playback works in Chrome but fails in Safari
- hls.js console warns about version mismatch
- Init segment not loaded, playback shows black screen with audio

**Phase to address:**
Recording Timeline phase -- fix before building the timeline UI to avoid debugging playback issues on top of UI bugs.

---

### Pitfall 7: DataTable Migration for Super Admin Pages Using Wrong Prisma Client

**What goes wrong:**
4 pages need DataTable migration: Team, Organizations, Cluster Nodes, Platform Audit. The developer copies the DataTable pattern from a tenant page (e.g., Users page) which uses `TENANCY_CLIENT` with RLS. Super admin pages (Organizations, Cluster Nodes, Platform Audit) are platform-scoped and should use `PrismaService` (raw, no RLS). Using `TENANCY_CLIENT` for super admin pages either: (a) shows empty results because there is no org context, or (b) leaks data if the wrong org context is injected.

**Why it happens:**
The v1.1 DataTable migrations were all tenant-scoped pages. Copy-pasting without adapting the data layer causes scope mismatches. The Team page is an edge case -- it is tenant-scoped (org members) so it correctly uses `TENANCY_CLIENT`, but it is listed alongside platform-scoped pages.

**How to avoid:**
1. For super admin pages (Organizations, Cluster Nodes, Platform Audit): verify API endpoints use `PrismaService` (raw), not `TENANCY_CLIENT`.
2. For Team page: uses `TENANCY_CLIENT` correctly since it shows org members.
3. Add server-side pagination for Platform Audit -- this table will have millions of rows. Do NOT fetch all rows client-side.
4. Test: login as super admin, verify Organizations shows ALL orgs. Login as tenant admin, verify no access to platform-scoped pages.

**Warning signs:**
- Super admin sees empty tables after migration
- API returns 403 or empty array for platform-scoped endpoints
- Platform Audit page takes >5s to load or causes browser tab to freeze

**Phase to address:**
DataTable Migration phase (low risk but requires attention to scope).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Compute usage aggregates on every page load | No schema change needed | O(n) query on segments table per load; degrades with scale | Never for storage metrics (aggregate BigInt); acceptable for camera count (small table) |
| Append segments to existing recording across FFmpeg reconnections | No recording boundary logic needed | Corrupted fMP4 playback (init segment mismatch), time gaps in timeline | Never -- always close and create new recording on reconnection |
| Client-side filtering for super admin DataTables | Reuse existing DataTable component unchanged | Memory issues with 10K+ audit rows, browser tab crash | Only if total row count is guaranteed <500 permanently |
| Skip email verification on self-service email change | Ship faster, simpler UX | Account takeover risk if attacker has session access | Never in production |
| In-memory viewer count (`StatusService.viewerCounts` Map) | No Redis dependency for viewer counts | Lost on API restart, inaccurate across multiple API instances | Acceptable for single-instance deployment (current Docker Compose constraint) |
| Hardcoded `#EXT-X-VERSION:3` in manifest builder | No immediate visible issue (Chrome is lenient) | Safari playback failures, spec non-compliance | Never for fMP4 content |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SRS restart + FFmpeg reconnect | Retrying FFmpeg without checking SRS health; thundering herd | Health-gate: check SRS `/api/v1/versions` or TCP port 1935 before spawning FFmpeg; add jitter |
| SRS `on_publish` + recording continuity | Assuming same recording spans multiple SRS publish sessions | Close old recording on `on_unpublish` if `isRecording`, create new on next `on_publish` with fresh init segment |
| Better Auth + NestJS audit trail | Calling Better Auth client directly for profile updates, bypassing NestJS middleware | Wrap Better Auth calls in NestJS controllers to preserve org context and audit logging pipeline |
| BullMQ + maintenance mode | Job retries continue even when camera is in maintenance | Check camera status at START of `StreamProcessor.process()` before spawning FFmpeg; skip if `maintenance` |
| MinIO + avatar uploads | Creating a new bucket per user or mixing avatars with recordings | Use a single `avatars` bucket with `{userId}.{ext}` object keys; keep separate from per-org recording buckets |
| hls.js + fMP4 manifest | Using `#EXT-X-VERSION:3` with fMP4 segments and `#EXT-X-MAP` | Use `#EXT-X-VERSION:7`; test in Safari which is strictest on HLS spec compliance |
| Timeline + large segment queries | Fetching all segment rows to compute timeline availability | Use SQL `date_trunc` aggregate for timeline data; generate sub-manifests for playback windows |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full segment scan for timeline | Timeline page >3s load, high DB CPU | Aggregate query with `date_trunc('minute', timestamp)`, composite index on `(cameraId, orgId, timestamp)` | >10,000 segments per camera (~1 day continuous at 2s segments) |
| All cameras reconnecting simultaneously | CPU spike to 100%, API unresponsive, SRS crash | Jittered backoff, SRS health gate, circuit breaker on queue | >20 cameras on a single server |
| Generating full-day manifest | API timeout, hls.js freezes loading 43K segments | Limit manifest to 1-hour windows; timeline UI requests sub-manifests | >1 hour of continuous recording |
| Audit log DataTable without server-side pagination | Browser tab crashes, API OOM | Server-side cursor pagination, `manualPagination` in TanStack Table | >5,000 audit entries (~1-2 weeks active usage) |
| Usage aggregate queries on page load | Plan viewer takes >2s, database contention | Pre-computed usage snapshot updated on write operations | >100,000 recording segments across org |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Email change without password re-confirmation | Session hijacking: attacker with stolen session changes email, locks out real user | Require current password before email change; invalidate other sessions after |
| Avatar upload without size/type validation | DoS via large file upload; stored XSS via SVG | Limit to 2MB, allow only PNG/JPG/WebP, strip EXIF metadata |
| Maintenance mode not revoking active playback sessions | Viewers continue watching camera that should be offline for service | On maintenance entry, revoke active playback tokens for that camera |
| Plan viewer exposing cross-org usage data | Information leak if API endpoint does not enforce org scope | Ensure usage endpoints use `TENANCY_CLIENT` with RLS, not `PrismaService` raw |
| Password change not invalidating other sessions | Old sessions remain valid after password change; compromised session persists | Call Better Auth session invalidation for all sessions except current after password change |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Timeline with no visual indication of recording gaps | User sees continuous bar, tries to play a gap, gets buffering/black screen | Show gaps as gray/hatched sections in the timeline; auto-skip to next available segment on click |
| Recording playback starting from beginning every time | User wants to jump to 14:30, has to scrub through hours of footage | Timeline click-to-seek: clicking a point generates a sub-manifest starting from that timestamp |
| Maintenance mode toggle with no confirmation dialog | Accidental toggle stops recording and streaming immediately | Confirmation dialog: "This will stop live stream and recording for Camera X. N active viewers will be disconnected." |
| Self-service password change with no strength indicator | User sets weak password, gets rejected by server validation after submit | Client-side password strength meter matching `minPasswordLength: 8` rule; show requirements upfront |
| Plan/usage viewer with raw numbers only | User sees "47 GB / 100 GB" but cannot gauge impact | Show estimated days remaining based on current recording rate; highlight cameras consuming most storage |
| Camera status showing only 2 states in list | User cannot distinguish live/recording/maintenance at a glance | Three-icon status column: streaming indicator (green/gray), recording indicator (red dot), maintenance indicator (wrench) |

## "Looks Done But Isn't" Checklist

- [ ] **FFmpeg Resilience:** Often missing SRS health check before reconnect -- verify reconnect waits for SRS to be healthy, not just retries blindly
- [ ] **FFmpeg Resilience:** Often missing jitter in backoff -- verify that 50 cameras do not all retry at the exact same second after SRS restart
- [ ] **FFmpeg Resilience:** Often missing recording boundary handling -- verify old recording closes and new one starts on reconnection when `isRecording` is true
- [ ] **Recording Timeline:** Often missing gap visualization -- verify time periods with no segments show visually distinct from recorded periods
- [ ] **Recording Timeline:** Often missing sub-manifest generation -- verify clicking a 1-hour mark generates manifest for just that hour, not entire day
- [ ] **Recording Timeline:** Often missing fMP4 version fix -- verify `ManifestService` outputs `#EXT-X-VERSION:7` not `3`
- [ ] **Maintenance Mode:** Often missing recording cleanup -- verify entering maintenance stops recording AND closes active recording row cleanly
- [ ] **Maintenance Mode:** Often missing playback session revocation -- verify active viewers are disconnected when camera enters maintenance
- [ ] **Maintenance Mode:** Often missing BullMQ job cleanup -- verify no FFmpeg retry jobs remain in queue for maintenance cameras
- [ ] **User Self-Service:** Often missing audit log entries -- verify name/email/password changes appear in org audit log
- [ ] **User Self-Service:** Often missing session invalidation on password change -- verify all other sessions are terminated
- [ ] **DataTable Migration:** Often missing super admin scope handling -- verify super admin pages show ALL data, not tenant-filtered empty results
- [ ] **Plan Viewer:** Often missing incremental updates -- verify storage usage reflects latest segment archival within reasonable delay

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Reconnect storm crashes SRS | LOW | Restart SRS, add health gate to StreamProcessor, redeploy. No data loss. |
| Recording segments from mixed publish sessions | MEDIUM | Write migration script to split recordings at timestamp gaps >30s; re-archive init segments per sub-recording from MinIO. |
| Timeline query too slow at scale | MEDIUM | Add composite index with `CREATE INDEX CONCURRENTLY` (no downtime), then add summary/aggregate query. |
| Maintenance mode not stopping reconnects | LOW | Add status check to StreamProcessor, redeploy. Manually kill orphaned FFmpeg processes via `pkill`. |
| Self-service changes not in audit log | LOW | Add audit middleware to self-service endpoints. Backfill not possible but future changes logged. |
| DataTable showing wrong scope (data leak) | HIGH | Immediate hotfix to add org context guard or switch to correct Prisma client. Audit access logs to assess exposure. |
| fMP4 manifest version wrong | LOW | One-line fix in ManifestService. Existing recordings do not need re-processing. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Reconnect storm after SRS restart | FFmpeg Resilience | Simulate SRS restart with 10+ cameras; verify staggered reconnect, no SRS crash |
| Recording desync on reconnect | FFmpeg Resilience | Kill FFmpeg mid-recording; verify old recording closes with `stoppedAt`, new one starts after reconnect |
| fMP4 manifest version mismatch | Recording Timeline (early fix) | Play back a recording in Safari; verify no codec errors, init segment loads correctly |
| Timeline loading full segment list | Recording Timeline | Load timeline for 24h continuous recording; verify <1s API response, aggregate query in logs |
| Maintenance not blocking reconnect | Camera Maintenance Mode | Put camera in maintenance while online; verify FFmpeg killed, BullMQ job removed, no retry |
| Maintenance not closing recording | Camera Maintenance Mode | Enter maintenance while recording; verify recording row gets `status: complete` and `stoppedAt` |
| Self-service bypassing org context | User Self-Service | Change name/email via self-service; verify audit log entry appears with correct orgId |
| Password change not invalidating sessions | User Self-Service | Change password in browser A; verify browser B session is terminated |
| DataTable scope mismatch | DataTable Migration | Login as super admin; verify Organizations shows all orgs. Login as tenant; verify 403 on platform endpoints |
| Plan viewer stale data | Plan/Usage Viewer | Archive a segment; verify usage counter updates on next page load without manual cache bust |

## Sources

- Codebase analysis: `apps/api/src/streams/processors/stream.processor.ts` -- BullMQ config: 20 attempts, exponential backoff from 1s, no jitter, no SRS health check (HIGH confidence)
- Codebase analysis: `apps/api/src/streams/ffmpeg/ffmpeg.service.ts` -- in-memory process Map, intentional stop tracking via Set, no reconnect awareness (HIGH confidence)
- Codebase analysis: `apps/api/src/streams/streams.service.ts` -- stopStream kills FFmpeg then removes job, no maintenance awareness (HIGH confidence)
- Codebase analysis: `apps/api/src/status/status.service.ts` -- state machine: offline/connecting/online/reconnecting/degraded, no maintenance state (HIGH confidence)
- Codebase analysis: `apps/api/src/srs/srs-callback.controller.ts` -- on_unpublish explicitly skips status transition, no recording cleanup (HIGH confidence)
- Codebase analysis: `apps/api/src/recordings/manifest.service.ts` -- `#EXT-X-VERSION:3` used with fMP4, `getSegmentsForDate()` fetches all rows (HIGH confidence)
- Codebase analysis: `apps/api/src/recordings/recordings.service.ts` -- recording not coupled to stream lifecycle, segment archival has no session boundary check (HIGH confidence)
- Codebase analysis: `apps/api/src/auth/auth.config.ts` -- Better Auth with organization plugin, no self-service profile endpoints exposed (HIGH confidence)
- Codebase analysis: `apps/api/src/prisma/schema.prisma` -- Camera model has no maintenance field, Recording model has no publishSessionId (HIGH confidence)
- HLS specification: fMP4 with EXT-X-MAP requires version 7+ (HIGH confidence)
- BullMQ documentation: exponential backoff without jitter causes synchronized retries (HIGH confidence)

---
*Pitfalls research for: SMS Platform v1.2 -- Self-Service, Resilience & UI Polish*
*Researched: 2026-04-18*
