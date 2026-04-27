# Phase 21: Hot-reload Stream Profile changes to running cameras - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

When a `StreamProfile` is edited (PATCH `/stream-profiles/:id`) or a `Camera.streamProfileId` is changed (PATCH `/cameras/:id`) while affected cameras are live, the running FFmpeg processes are automatically killed and respawned with the new settings within seconds — eliminating the current behaviour where stale profile values persist on the running stream until manual restart or 60s health-check failure.

**In scope:**
- Detect FFmpeg-affecting field changes on profile updates and camera-profile reassignment.
- Restart only currently-streaming cameras (status ∈ {online, connecting, reconnecting, degraded} AND `maintenanceMode = false`).
- Reuse Phase 15 BullMQ patterns for dedup, jitter, and graceful kill+respawn.
- Audit trail entry for every profile-driven restart.
- Toast feedback in both the Edit Camera dialog and the Edit Stream Profile dialog.
- DELETE protection on stream profiles still assigned to cameras.

**Out of scope:**
- Zero-downtime profile swap (a 2–5s blip on each affected camera is acceptable).
- New webhook event for profile changes (existing transition webhooks suffice).
- Auto-revert on failed restart (operator decides).
- Recording timeline gap mitigation (gap is acceptable, no schema changes).
- SRS configuration changes.

</domain>

<decisions>
## Implementation Decisions

### Trigger Granularity (Area A)
- **D-01:** A profile-driven restart fires only when one or more of these FFmpeg-affecting fields differ between the old and new `StreamProfile` row: `codec`, `preset`, `resolution`, `fps`, `videoBitrate`, `audioCodec`, `audioBitrate`. Implementation: compute a deterministic fingerprint hash of these fields before the Prisma `update` and compare with the new row's fingerprint after the update — restart only on hash mismatch. `name` and `description` edits never restart. Camera-side trigger (D-02) uses the same fingerprint comparison: if the camera's previously-attached profile fingerprint equals the new profile's fingerprint, no restart is needed.
- **D-02:** Camera reassignment (PATCH `/cameras/:id` with a different `streamProfileId`) fires a restart for that single camera if and only if the new profile's fingerprint differs from the previously attached profile's fingerprint (or the camera previously had no profile and the new one is non-default). Switching from one Passthrough profile to a structurally identical Passthrough profile does not restart.

### Restart Timing & Dedup (Area B)
- **D-03:** Restart is implemented by enqueuing a job on the existing `stream-ffmpeg` BullMQ queue with `jobId = "camera:{cameraId}"`. This reuses Phase 15 D-11's idempotency pattern — duplicate enqueues from rapid profile resaves or overlapping triggers (e.g., camera reassignment + simultaneous profile edit) are auto-deduped by BullMQ. No new debounce state, no Redis lock, no in-memory map.
- **D-04:** Each enqueued restart job carries a `delay` of `Math.random() * 30_000` ms (0–30s jitter), reusing Phase 15 D-06's thundering-herd protection for SRS. This applies whether one or fifty cameras are affected — the per-job random delay naturally spreads the load.
- **D-05:** The restart job execution itself reuses Phase 15 D-03's recovery shape: SIGTERM the existing FFmpeg process from `FfmpegService` map → wait up to graceful timeout then SIGKILL → call `StatusService.transition(cameraId, 'reconnecting')` → spawn new FFmpeg via the standard `streams.service.ts` start path which re-reads the latest profile from the DB.

### UX Feedback (Area C)
- **D-06:** Both edit dialogs use toast feedback only — no confirmation dialogs, no friction. Stream Profile save dialog: toast `"{N} camera(s) restarting with new settings"` where N is the count of currently-online cameras using this profile (0 if none affected → no toast). Edit Camera dialog when `streamProfileId` changes and camera is currently online: toast `"Stream restarting with new profile"`. Both toasts are info-level (not warning) and auto-dismiss.

### Audit Log Shape (Area D)
- **D-07:** New audit log action `camera.profile_hot_reload` per affected camera, written by the restart job at enqueue time (not at job execution — so the audit row exists even if the job is later deduped or fails). Meta payload: `{profileId, oldFingerprint, newFingerprint, triggeredBy}`. `triggeredBy` is `{userId, userEmail}` from the request that initiated the change, or `{system: true}` if no user context (defensive — should not happen in practice). The existing `streamprofile.update` and `camera.update` audit entries are not modified — they still record the admin's edit. The new `camera.profile_hot_reload` entries record the downstream effect, one per affected camera.

### Recording During Restart (Area E)
- **D-08:** When a camera with `isRecording = true` is restart-eligible, the restart proceeds immediately without delay or coordination with the recording subsystem. The resulting 2–5s gap in the HLS/recording timeline is acceptable. No RecordingSession metadata changes, no UI badging, no special handling — the standard SRS DVR segment-rotation behavior on FFmpeg disconnect/reconnect produces the gap naturally and the recording timeline UI already renders gaps.

### Failed Restart Fallback (Area F)
- **D-09:** Profile-driven restart failures fall through to existing Phase 15 resilience: BullMQ exponential backoff (1s → 5min cap) handles transient failures; after BullMQ exhausts retries, `StatusService.transition` moves the camera to `degraded` and the existing notification + webhook fires (subject to D-04 30s debounce). No automatic profile rollback. Operators see the degraded status in the camera table and the notification, and can manually revert the profile or fix the camera if needed.

### StreamProfile DELETE Protection (Area G)
- **D-10:** `DELETE /stream-profiles/:id` returns HTTP 409 Conflict with response body `{message, usedBy: [{cameraId, name}, ...]}` when one or more cameras still reference the profile. The frontend stream-profile delete confirmation dialog catches the 409 and displays the camera list with a "Reassign before deleting" message. No cascade-null, no soft-delete. Existing Prisma schema relation may need an `onDelete: Restrict` adjustment if currently set to a permissive default — verify during planning.

### Webhook to API Consumers (Area H)
- **D-11:** No new webhook event for profile changes. The restart cycle naturally drives `StatusService.transition`: `online → reconnecting → connecting → online`. Webhook subscribers receive these transitions per the existing pipeline, with the Phase 15 D-04 30s notification debounce coalescing the brief blip — meaning developers integrated via webhook typically will NOT see a `camera.offline` blip for profile-driven restarts (debounce eats it), which matches the user-visible "stream momentarily reloads" experience. No new event type, no new payload shape, no opt-in flag.

### Claude's Discretion
- Exact toast wording (D-06) — defer to UI-SPEC if one is generated for this phase, otherwise planner picks copy that matches the Phase 14/15 toast style.
- Hash function used for the fingerprint (D-01) — any stable hash over a canonical JSON serialization of the seven FFmpeg-affecting fields is acceptable (sha256, md5, even a deterministic concat). Planner decides.
- Graceful SIGTERM timeout before SIGKILL (D-05) — Phase 15 D-08 used 10s for shutdown; planner can match or pick a shorter restart-flow value (e.g., 3–5s) since restart cares about latency more than shutdown does.
- 409 response message wording (D-10).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 21 audit context (the gap that motivated this phase)
- `apps/api/src/streams/streams.service.ts:26-112` — `startStream` reads profile only at job enqueue (the gap)
- `apps/api/src/streams/stream-profile.service.ts:51-69` — `update` currently has no restart trigger
- `apps/api/src/cameras/cameras.service.ts:288-296` — `updateCamera` currently has no restart trigger when `streamProfileId` changes
- `apps/api/src/streams/ffmpeg/ffmpeg-command.builder.ts:40-56` — Passthrough vs Transcode FFmpeg arg construction (where profile values land)
- `apps/api/src/streams/processors/stream.processor.ts:83` — StreamProcessor receives `job.data.profile`
- `apps/api/src/resilience/job-data.helper.ts:15-29` — `buildStreamJobData` shape (what restart job needs to carry)

### Phase 15 inherited patterns (carried forward)
- `.planning/phases/15-ffmpeg-resilience-camera-maintenance/15-CONTEXT.md` §Health Check Loop D-03 — SIGTERM → transition → enqueue recovery shape
- `.planning/phases/15-ffmpeg-resilience-camera-maintenance/15-CONTEXT.md` §SRS Restart Recovery D-06 — 0–30s jitter pattern
- `.planning/phases/15-ffmpeg-resilience-camera-maintenance/15-CONTEXT.md` §Boot Re-enqueue D-11 — `jobId = "camera:{cameraId}"` BullMQ dedup
- `.planning/phases/15-ffmpeg-resilience-camera-maintenance/15-CONTEXT.md` §Maintenance Mode D-13–D-15 — maintenance gate (skip restarts on maintenanceMode cameras)
- `apps/api/src/streams/ffmpeg/ffmpeg.service.ts` — FFmpeg process map + intentional-stop flag (used by SIGTERM step)
- `apps/api/src/status/status.service.ts:28-86` — state machine + `transition()` + 30s notification debounce (D-04)
- `apps/api/src/resilience/camera-health.service.ts:62-127` — health tick that already uses `jobId = "camera:{cameraId}"` (must not double-fire with profile restart)

### Audit log infrastructure
- `.planning/phases/15-ffmpeg-resilience-camera-maintenance/15-03-PLAN.md` — Maintenance API audit interceptor pattern (model for D-07 audit entry)
- Existing audit module — planner should locate via `grep -r "audit" apps/api/src` and follow the interceptor pattern from Phase 15-03

### Frontend dialogs touched
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx:198` — Camera form (D-06 toast hook on `streamProfileId` change)
- Stream Profile edit dialog — planner should locate (likely `apps/web/src/app/admin/stream-profiles/...`); add D-06 toast on save success

### Project-level
- `.planning/REQUIREMENTS.md` — confirm whether any RESIL-* requirements explicitly cover live config reload; if so, link them
- `.planning/STATE.md` — Phase 21 added 2026-04-25 (closes audit gap)
- `CLAUDE.md` §"Prisma schema change workflow" — D-10 may add `onDelete: Restrict`; if so the four-step regenerate sequence is mandatory

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`stream-ffmpeg` BullMQ queue + `StreamProcessor`** — restart enqueues onto this same queue, no new queue needed. `jobId` pattern is already enforced.
- **`FfmpegService` process map** — exposes per-camera FfmpegCommand handles for SIGTERM. Phase 15 already wired SIGTERM → SIGKILL graceful kill via shutdown hooks; reuse that helper if Phase 15 extracted it, otherwise mirror the pattern.
- **`StatusService.transition`** — handles state machine + maintenance gate + 30s notification debounce. Restart code calls this exactly once per camera (`'reconnecting'`) and lets the existing pipeline drive the rest.
- **`buildStreamJobData()` (resilience/job-data.helper.ts)** — already loads camera + profile + emits the job payload shape the StreamProcessor expects. Restart enqueue just calls this helper.
- **Audit interceptor pattern** — Phase 15-03 already established the audit interceptor used for maintenance toggle. New `camera.profile_hot_reload` action follows the same shape.

### Established Patterns
- **BullMQ jobId-based idempotency** — Phase 15 D-11 made this canonical; Phase 21 must use it (no parallel debounce machinery).
- **Jitter delay for SRS-impacting batches** — Phase 15 D-06 0–30s; Phase 21 reuses identically.
- **State-machine-driven webhooks** — never fire webhooks directly; always go through `StatusService.transition` so the maintenance gate + debounce apply uniformly.
- **Toast on form-save success** — existing camera form and Phase 15-04 maintenance toggle use react-hot-toast / shadcn toast (planner verifies which).

### Integration Points
- **`StreamProfileService.update`** — gains a post-update step that computes the field-diff and enqueues per-camera restart jobs.
- **`CamerasService.updateCamera`** — gains a post-update step that compares old vs new `streamProfileId` (and resolved profile fingerprint) and enqueues a single restart if needed.
- **`StreamProfileService.delete`** — new pre-delete check for `Camera.streamProfileId == :id`; throws 409 if any rows match.
- **Audit interceptor** — emits `camera.profile_hot_reload` per affected camera at enqueue time (not at job execution).
- **`CameraHealthService` (60s tick)** — must continue to function; its `jobId = "camera:{cameraId}"` overlaps with Phase 21's, but BullMQ dedup makes this safe (same jobId = same job).

</code_context>

<specifics>
## Specific Ideas

- The user's confirmed mental model: "เปลี่ยน profile = stream เปลี่ยนทันที" (changing the profile means the stream changes immediately). The implementation must match this expectation closely — the only acceptable deviation is the 2–5s restart blip (D-08).
- Phase 21 was triggered by an explicit code audit (this conversation) that found the gap, not by a user-facing bug ticket. Treat the existing behavior as the bug, not a feature.
- The user accepted "Recommended" defaults on all 8 areas — strong signal that the planner should NOT introduce new alternatives during planning unless a concrete code-level constraint forces it. If the planner finds a constraint, surface it explicitly and ask, do not silently substitute.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed but out of scope for Phase 21

- **View Stream Sheet > Activity tab shows no events** — User reported during Phase 21 discuss-phase that the Activity tab inside the View Stream Sheet appears empty (no event entries shown). Likely a pre-existing bug in the audit-log query/render path, NOT caused by Phase 21. Phase 21 will SURFACE this if real, because the new `camera.profile_hot_reload` action must appear there during UAT — if Activity tab is broken, Phase 21 verification will fail and force the fix at that point. Recommended follow-up: `/gsd-quick` to investigate `apps/web/.../view-stream-sheet/*` activity tab data source independently of Phase 21, or fold into Phase 21's UAT-driven fix loop if the root cause is audit-log filtering by camera scope.

### Considered and explicitly rejected
- Auto-revert profile on failed restart (rejected in D-09 — operator decides).
- New `camera.profile_changed` webhook event (rejected in D-11 — existing transitions cover it).
- Per-camera "do not auto-restart" opt-out flag (not raised; operator can use maintenance mode if they need a window).
- Defer restart until recording window ends (rejected in D-08 — gap is acceptable).
- Sequential rolling restart instead of jittered batch (rejected in D-04 — jitter is sufficient).

</deferred>

---

*Phase: 21-hot-reload-stream-profile-changes-to-running-cameras*
*Context gathered: 2026-04-25*
