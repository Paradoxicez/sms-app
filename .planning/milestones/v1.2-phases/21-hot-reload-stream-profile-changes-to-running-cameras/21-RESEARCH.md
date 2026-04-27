# Phase 21: Hot-reload Stream Profile changes to running cameras - Research

**Researched:** 2026-04-25
**Domain:** Live FFmpeg restart triggered by Prisma row change + BullMQ dedup
**Confidence:** HIGH (every canonical_ref verified in current source; one correction surfaced)

## Summary

Phase 21 closes a known audit gap: `StreamsService.startStream` reads the StreamProfile **only at job-enqueue time**, so once an FFmpeg child process is spawned its codec/preset/resolution/fps/bitrate are baked-in for the lifetime of that process. Editing a profile or reassigning a camera's `streamProfileId` updates the DB row but the running stream stays on the old settings until manual stop/start or 60s health-check failure (and only the latter happens to re-read the row).

Phase 15 already shipped every primitive Phase 21 needs: graceful SIGTERM-then-SIGKILL helper (`ResilienceService.onApplicationShutdown` — 10s grace), the per-camera FFmpeg process map (`FfmpegService.runningProcesses`), the `stream-ffmpeg` BullMQ queue with deterministic `jobId = "camera:{cameraId}:ffmpeg"` and 0–30s jitter (see `BootRecoveryService.onApplicationBootstrap`), the state machine (`StatusService.transition`) with maintenance gate + 30s notify debounce, and the canonical `buildStreamJobData()` helper. Phase 21 is mostly a **wiring exercise** — one fingerprint utility, two hook points (`StreamProfileService.update`, `CamerasService.updateCamera`), one DELETE pre-check, two toast surfaces.

**Primary recommendation:** Compute a SHA-256 fingerprint of the seven FFmpeg-affecting fields using `crypto.createHash` (already the codebase-standard hash — see `apps/api/src/api-keys/api-keys.service.ts:25`). On profile update, diff fingerprints, then for each affected non-maintenance running camera enqueue a `stream-ffmpeg` job with `jobId = "camera:{cameraId}:ffmpeg"` (matching Phase 15 D-11 — note the **`:ffmpeg` suffix** which CONTEXT.md misquoted) and `delay = Math.floor(Math.random() * 30_000)`. The processor's existing pipeline (`StatusService.transition('connecting')` then `FfmpegService.startStream`) re-reads the row via `buildStreamJobData` semantics — but in StreamsService.startStream it actually reads from the camera+streamProfile relation directly at enqueue time. This means **fingerprint-driven enqueue + per-job DB re-read at job execution start = no stale data window inside the job.**

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Trigger Granularity (Area A)
- **D-01:** Profile-driven restart fires only when one or more of these FFmpeg-affecting fields differ between the old and new `StreamProfile` row: `codec`, `preset`, `resolution`, `fps`, `videoBitrate`, `audioCodec`, `audioBitrate`. Implementation: compute a deterministic fingerprint hash of these fields before the Prisma `update` and compare with the new row's fingerprint after the update — restart only on hash mismatch. `name` and `description` edits never restart. Camera-side trigger (D-02) uses the same fingerprint comparison: if the camera's previously-attached profile fingerprint equals the new profile's fingerprint, no restart is needed.
- **D-02:** Camera reassignment (PATCH `/cameras/:id` with a different `streamProfileId`) fires a restart for that single camera if and only if the new profile's fingerprint differs from the previously attached profile's fingerprint (or the camera previously had no profile and the new one is non-default). Switching from one Passthrough profile to a structurally identical Passthrough profile does not restart.

#### Restart Timing & Dedup (Area B)
- **D-03:** Restart enqueues onto the existing `stream-ffmpeg` BullMQ queue with `jobId = "camera:{cameraId}"` (CONTEXT.md text — but actual codebase pattern is `camera:{cameraId}:ffmpeg`; see Code Path Verification §1). Reuses Phase 15 D-11's idempotency pattern — duplicate enqueues from rapid profile resaves or overlapping triggers (e.g., camera reassignment + simultaneous profile edit) are auto-deduped by BullMQ. No new debounce state, no Redis lock, no in-memory map.
- **D-04:** Each enqueued restart job carries a `delay` of `Math.random() * 30_000` ms (0–30s jitter), reusing Phase 15 D-06's thundering-herd protection for SRS. Per-job random delay naturally spreads the load.
- **D-05:** The restart job execution itself reuses Phase 15 D-03's recovery shape: SIGTERM the existing FFmpeg process from `FfmpegService` map → wait up to graceful timeout then SIGKILL → call `StatusService.transition(cameraId, 'reconnecting')` → spawn new FFmpeg via the standard `streams.service.ts` start path which re-reads the latest profile from the DB.

#### UX Feedback (Area C)
- **D-06:** Both edit dialogs use toast feedback only — no confirmation dialogs. Stream Profile save dialog: toast `"{N} camera(s) restarting with new settings"` (0 → no toast). Edit Camera dialog when `streamProfileId` changes and camera is currently online: toast `"Stream restarting with new profile"`. Info-level, auto-dismiss.

#### Audit Log Shape (Area D)
- **D-07:** New audit log action `camera.profile_hot_reload` per affected camera, written by the restart job at enqueue time (not at job execution — so the audit row exists even if the job is later deduped or fails). Meta payload: `{profileId, oldFingerprint, newFingerprint, triggeredBy}`. `triggeredBy` is `{userId, userEmail}` from the request that initiated the change, or `{system: true}` if no user context. Existing `streamprofile.update` and `camera.update` audit entries are not modified.

#### Recording During Restart (Area E)
- **D-08:** Cameras with `isRecording = true` restart immediately without delay or recording-subsystem coordination. The 2–5s gap is acceptable. No RecordingSession metadata changes, no UI badging.

#### Failed Restart Fallback (Area F)
- **D-09:** Profile-driven restart failures fall through to existing Phase 15 resilience: BullMQ exponential backoff (1s → 5min cap); after BullMQ exhausts retries, `StatusService.transition` moves the camera to `degraded` and existing notification/webhook fires (subject to D-04 30s debounce). No automatic profile rollback.

#### StreamProfile DELETE Protection (Area G)
- **D-10:** `DELETE /stream-profiles/:id` returns HTTP 409 Conflict with response body `{message, usedBy: [{cameraId, name}, ...]}` when one or more cameras still reference the profile. Frontend stream-profile delete confirmation dialog catches the 409 and displays the camera list with a "Reassign before deleting" message. No cascade-null, no soft-delete. Existing Prisma schema relation may need an `onDelete: Restrict` adjustment if currently set to a permissive default — verify during planning.

#### Webhook to API Consumers (Area H)
- **D-11:** No new webhook event for profile changes. The restart cycle naturally drives `StatusService.transition`: `online → reconnecting → connecting → online`. Webhook subscribers receive these transitions per the existing pipeline, with the Phase 15 D-04 30s notification debounce coalescing the brief blip. No new event type, no new payload shape, no opt-in flag.

### Claude's Discretion
- Exact toast wording (D-06) — defer to UI-SPEC if generated; otherwise planner picks copy matching Phase 14/15 toast style.
- Hash function used for the fingerprint (D-01) — any stable hash over canonical JSON of the seven fields is acceptable.
- Graceful SIGTERM timeout before SIGKILL (D-05) — Phase 15 used 10s for shutdown; restart can match or pick shorter (3–5s).
- 409 response message wording (D-10).

### Deferred Ideas (OUT OF SCOPE)

#### Reviewed but out of scope for Phase 21
- **View Stream Sheet > Activity tab shows no events** — pre-existing bug (see Open Questions §1, this RESEARCH.md found root cause). Likely surfaced by Phase 21 UAT. Recommended as separate `/gsd-quick`.

#### Considered and explicitly rejected
- Auto-revert profile on failed restart (rejected in D-09).
- New `camera.profile_changed` webhook event (rejected in D-11).
- Per-camera "do not auto-restart" opt-out flag.
- Defer restart until recording window ends (rejected in D-08).
- Sequential rolling restart (rejected in D-04).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| (no formal REQ-ID) | Closes audit gap "live profile edits don't propagate to running FFmpeg" | RESIL-* family (Phase 15) is the closest semantic relative; none explicitly cover live-config reload. The user's mental model "เปลี่ยน profile = stream เปลี่ยนทันที" is the de-facto requirement. |

REQUIREMENTS.md does NOT contain an explicit Phase 21 requirement ID. Phase 21 was added 2026-04-25 (per STATE.md §"Roadmap Evolution") to close a code-audit-discovered gap, not to satisfy a customer-visible requirement line item.

**RESIL-* cross-reference (none semantically apply to live config reload):**
- RESIL-01 (auto-reconnect on SRS restart) — already shipped Phase 15.
- RESIL-02 (60s health check) — already shipped Phase 15. The 60s loop *eventually* picks up profile changes when the stream dies, but Phase 21 makes this <2s instead.
- RESIL-03 (notification on status change) — already shipped Phase 15.
- RESIL-04 (graceful shutdown + boot re-enqueue) — already shipped Phase 15.

**Conclusion:** Planner can proceed without REQ-ID coverage anxiety. The Phase 21 requirement is encoded in CONTEXT.md decisions D-01..D-11 and the goal stated in ROADMAP.md "Hot-reload Stream Profile changes to running cameras". A pseudo-ID like `HOTRELOAD-01` could be added to REQUIREMENTS.md retroactively if the planner wants a traceable handle, but this is bookkeeping, not blocking.
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These constraints have the same authority as locked CONTEXT.md decisions:

1. **Prisma schema change workflow (mandatory 4-step sequence):** Any edit to `apps/api/src/prisma/schema.prisma` MUST be followed by:
   1. `pnpm --filter @sms-platform/api db:push` (chains `prisma generate`)
   2. `pnpm --filter @sms-platform/api build`
   3. Restart every long-running API process (start:dev or start:prod)
   4. Verify via `curl http://localhost:3003/api/srs/callbacks/metrics` — `archives` block should not show `status: failing` with `lastFailureMessage` mentioning the new field name
   - **Phase 21 impact:** D-10 may require `onDelete: Restrict` schema change. If so, the planner MUST include all 4 steps as separate task actions. (Alternative: implement D-10 as service-layer pre-delete check — see §4.)

2. **Stream Engine pinned to SRS v6.0-r0** — Phase 21 does NOT touch SRS config (out of scope per CONTEXT.md). Confirmed.

3. **No SRS configuration changes** (CONTEXT.md "Out of scope") — restart works entirely via FFmpeg lifecycle. SRS auto-detects publisher disconnect/reconnect. Confirmed.

4. **GSD workflow enforcement** — file changes only through GSD commands. Phase 21 is being researched via `/gsd-research-phase`, planner spawned via `/gsd-plan-phase` next.

5. **Tech stack hard constraints (already in use, no deviation):**
   - NestJS 11 / Node 22 LTS
   - Prisma 6 / PostgreSQL 16
   - BullMQ 5.x (queue: `stream-ffmpeg`, jobId: `camera:{id}:ffmpeg`)
   - Vitest 2 (existing test infra at `apps/api/tests/**`)
   - Sonner toasts (frontend) — confirmed in `profile-form-dialog.tsx:4` and `camera-form-dialog.tsx`

## 1. Code Path Verification

Each canonical_ref verified in current source as of 2026-04-25.

| canonical_ref claim | Verified state | Status |
|---|---|---|
| `streams/streams.service.ts:26-112` — `startStream` | `startStream` is at lines 26-112. Reads profile via `prisma.camera.findUnique({ include: { streamProfile: true }})` lines 29-32. Builds inline `profile` object lines 63-76. Enqueues with `jobId: \`camera:${cameraId}:ffmpeg\`` line 101. | **CONFIRMED** |
| `streams/stream-profile.service.ts:51-69` — `update` no restart trigger | Method at 51-69. Pure Prisma update, no enqueue, no auditService.log. | **CONFIRMED** |
| `cameras/cameras.service.ts:288-296` — `updateCamera` no restart trigger | Method at 288-297. Pure tenancy.camera.update, no profile-diff logic. | **CONFIRMED** |
| `streams/ffmpeg/ffmpeg-command.builder.ts:40-56` — Passthrough vs Transcode | Branch at lines 40-56 (`useCopy = !needsTranscode && (codec === 'copy' \|\| codec === 'auto')`). The seven fields land at lines 47-56 (libx264 path) and lines 60-72 (audio path). | **CONFIRMED** |
| `streams/processors/stream.processor.ts:83` — receives `job.data.profile` | Destructured at line 45 (`{ profile, ... } = job.data`). Passed to `ffmpegService.startStream(...)` at line 83. | **CONFIRMED** |
| `resilience/job-data.helper.ts:15-29` — `buildStreamJobData` | At lines 15-43 (extends past 29 due to Phase 19.1 push-mode branch). Profile mapping lines 17-29 — exactly the seven D-01 fields. | **CONFIRMED with line drift to 43** |
| `streams/ffmpeg/ffmpeg.service.ts` — process map + intentional-stop flag | `runningProcesses` Map line 8, `intentionalStops` Set line 10, `stopStream(SIGTERM)` lines 68-78, `forceKill(SIGKILL)` lines 101-109, `isRunning()` lines 80-82, `getRunningCameraIds()` lines 97-99. | **CONFIRMED** |
| `status/status.service.ts:28-86` — transition + 30s debounce | `validTransitions` table 19-29 (NOT 28-86 — slight line-range drift). `transition()` 40-111. Maintenance gate 71-77. 30s notify debounce 86-106 (`delay: 30_000`). | **CONFIRMED with line drift** |
| `resilience/camera-health.service.ts:62-127` — health tick `jobId = "camera:{cameraId}"` | `enqueueStart` lines 133-146. Actual jobId is `\`camera:${camera.id}:ffmpeg\`` line 138 — **same `:ffmpeg` suffix** as everywhere else. | **CONFIRMED — but jobId pattern is `:ffmpeg` suffixed; CONTEXT.md is loose on suffix** |

### Critical correction — jobId pattern

CONTEXT.md states `jobId = "camera:{cameraId}"` (D-03, citing Phase 15 D-11). The **actual** codebase pattern, used in 4 places, is **`camera:{cameraId}:ffmpeg`**:

```
apps/api/src/streams/streams.service.ts:101         jobId: `camera:${cameraId}:ffmpeg`,
apps/api/src/resilience/boot-recovery.service.ts:105 jobId: `camera:${camera.id}:ffmpeg`,
apps/api/src/resilience/camera-health.service.ts:138 jobId: `camera:${camera.id}:ffmpeg`,
apps/api/tests/resilience/boot-recovery.test.ts:52   expect(options.jobId).toMatch(/^camera:cam-.*:ffmpeg$/);
```

The `:ffmpeg` suffix exists because Phase 15 D-04 also uses `camera:{cameraId}:notify` for the notification debounce queue — different queues, same camera, distinguished by suffix. (See `status.service.ts:86` — `const jobId = \`camera:${cameraId}:notify\`;`)

**Planner action:** Phase 21 enqueue MUST use exactly `camera:{cameraId}:ffmpeg` to dedup against any existing in-flight start/restart job for the same camera. Using a different suffix (`:profile-restart`, etc.) breaks the dedup contract and would cause two concurrent FFmpeg spawn attempts for the same camera ID — exactly the race the suffix prevents.

## 2. Phase 15 Reuse Inventory

What concretely exists today that Phase 21 will call. Each entry includes file:line.

### Reusable building blocks (ALL VERIFIED PRESENT)

| Capability | Where | Notes |
|---|---|---|
| **Graceful SIGTERM helper** | `apps/api/src/resilience/resilience.service.ts:22-57` | Top-level `onApplicationShutdown(signal?)`. Per-camera variant does NOT exist as an extracted helper — Phase 21 must mirror the pattern inline OR extract a new `gracefullyKill(cameraId, graceMs)` helper. **Recommendation:** Extract a reusable helper into `FfmpegService` (e.g., `gracefulRestart(cameraId, graceMs)`) since the polling loop is short (~12 lines) and Phase 21 is the second consumer — refactor cost is justified. |
| **FFmpeg process map** | `ffmpeg.service.ts:8` (`runningProcesses: Map`) | Public access via `isRunning(cameraId)`, `getRunningCameraIds()`, `stopStream(cameraId)` (SIGTERM), `forceKill(cameraId)` (SIGKILL). |
| **Intentional-stop flag** | `ffmpeg.service.ts:10` (`intentionalStops: Set`) | Already wired into both `stopStream` (75) and `forceKill` (106) — Phase 21 restart automatically benefits because it calls `stopStream` first. |
| **`stream-ffmpeg` BullMQ queue** | Registered in `streams.module.ts:15` (`BullModule.registerQueue({ name: 'stream-ffmpeg' })`). Consumed by `StreamProcessor` at `streams/processors/stream.processor.ts:33`. | Concurrency=50. removeOnComplete=true (so dedup window only covers active job lifetime — see WebSearch finding §6). |
| **Canonical jobId pattern** | `camera:{cameraId}:ffmpeg` — see §1 correction above. | 3 codepaths use it; Phase 21 makes it 4. |
| **0–30s jitter pattern** | `boot-recovery.service.ts:100` (`Math.floor(Math.random() * 30_000)`) | Identical formula in `srs-restart-detector.ts` (not read here, but referenced from camera-health.service.ts:33). |
| **`buildStreamJobData()`** | `resilience/job-data.helper.ts:15-43` | Takes a Camera row with `streamProfile` relation included; returns `StreamJobData`. Phase 19.1 added push-mode branch — Phase 21 doesn't need to know about that, just call the helper. |
| **`StatusService.transition()` w/ maintenance gate** | `status/status.service.ts:40-111` | Maintenance gate 71-77 — **planner does NOT need to manually check `maintenanceMode`** before calling transition; the suppression happens here. But Phase 21 still must filter out maintenance cameras at *enqueue time* (not transition time) per D-01 scope (status ∈ {online, connecting, reconnecting, degraded} AND maintenanceMode=false), because we don't want to enqueue a restart job for a deliberately-stopped maintenance camera. |
| **30s notification debounce** | `status.service.ts:86-106` (jobId `camera:{cameraId}:notify`, delay 30_000) | Phase 21 doesn't touch this; it's a downstream consequence of `transition()` calls. The `online → reconnecting → connecting → online` cycle of a hot-reload restart will be coalesced inside this 30s window — D-11's "webhook subscribers typically WILL NOT see a camera.offline blip" claim depends on this. |
| **AuditService direct-call pattern** | `cameras.service.ts:216-224` (Phase 19.1 D-21 push-key audit), `stream-probe.processor.ts:217` (probe mismatch audit) | Pattern: `auditService.log({ orgId, action, resource, resourceId, method, path, details })`. NOT going through the AuditInterceptor — the interceptor only handles HTTP CRUD verbs, custom actions like `camera.profile_hot_reload` go through `auditService.log` direct. **CONTEXT.md D-07's claim "interceptor handles it" is wrong** — the interceptor maps METHOD→ACTION (POST→create, etc.), not custom action names. Phase 21 MUST inject AuditService and call `.log()` directly. |
| **AuditInterceptor (background reference only)** | `audit/audit.interceptor.ts:54-119` | Maps `stream-profiles` URL segment to resource string `streamProfile` (line 20 in `RESOURCE_MAP`). Maps PATCH→`update` action. So the *existing* admin's edit naturally writes audit row `{action: 'update', resource: 'streamProfile'}` — Phase 21 does NOT touch this; D-07 is purely additive. |
| **`FfmpegService.isRunning(cameraId)`** | `ffmpeg.service.ts:80-82` | Pre-flight check: skip enqueue if FFmpeg not running for a camera (handles edge case where camera is `connecting` in DB but its FFmpeg crashed and CameraHealthService hasn't ticked yet). |

### What does NOT exist that Phase 21 must build

| Missing primitive | Workaround |
|---|---|
| Per-camera `gracefulRestart(cameraId, graceMs)` helper | Either inline the 12-line poll loop in StreamProcessor OR extract into FfmpegService — recommend the latter for testability. |
| Profile fingerprint utility | New `apps/api/src/streams/profile-fingerprint.util.ts` with `fingerprintProfile(profile): string` (sha256 over canonical JSON of 7 fields). |
| Pre-delete StreamProfile usage check | New method `findCamerasUsingProfile(profileId)` on `StreamProfileService` OR direct query in `StreamProfileController.delete`. |
| Direct AuditService injection in StreamProfileService | Add `@Optional() auditService?: AuditService` constructor param matching the `cameras.service.ts:55-57` pattern. Module wiring: `StreamsModule` already imports nothing from AuditModule — must add `AuditModule` import. |

### Module wiring deltas Phase 21 will need

`apps/api/src/streams/streams.module.ts` will need:
1. `AuditModule` imported (currently not imported).
2. `CamerasModule` cross-reference for `streams-service-restart` (or whatever the new orchestration lives in) — but only if the planner decides to centralize the restart logic. Cleanest path: add a new `enqueueProfileRestart(cameraId, oldFp, newFp, profileId, triggeredBy)` method on `StreamsService` and have both `StreamProfileService.update` (already in same module) and `CamerasService.updateCamera` call it. CamerasService→StreamsService is already a wiring (`cameras.service.ts:40` `private readonly streamsService: StreamsService`).

## 3. Frontend Dialog Locations

Two dialogs need D-06 toast wiring. Both already use the **sonner** toast library (`import { toast } from 'sonner';`).

| Dialog | Path | Current State | Phase 21 Change |
|---|---|---|---|
| **Edit Camera dialog** | `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` | Save handler around lines 184-220+. `streamProfileId` posted at line 198 (`body.streamProfileId = streamProfileId || null;`). Handler does NOT currently fire a toast on save success — uses `onSaved()` callback to close the dialog. | Add: after API response with 200 status (line ~210), if response payload contains `restartedCameras` (new field) AND camera was online before save, call `toast.info('Stream restarting with new profile')`. Backend must include the new field; see §6 for response shape recommendation. |
| **Edit Stream Profile dialog** | `apps/web/src/app/admin/stream-profiles/components/profile-form-dialog.tsx` | Save handler at lines 140-168. Already calls `toast.success('Profile updated')` on PATCH success (line 152). | Replace the static `'Profile updated'` with a conditional based on response payload: if response includes `affectedCameras: number > 0`, use `toast.success(\`Profile updated · ${n} camera(s) restarting with new settings\`)`; otherwise keep `'Profile updated'`. (D-06 says info-level for the affected case — but sonner's `toast.success` is the existing pattern; planner can override to `toast.info` if UI-SPEC mandates.) |

**No tenant-side equivalent exists.** `apps/web/src/app/app/stream-profiles/page.tsx` is a 1-line re-export from `@/components/pages/tenant-stream-profiles-page`. Whether the tenant-stream-profiles-page reuses the same `ProfileFormDialog` component (likely) or has its own should be confirmed by the planner via `grep ProfileFormDialog apps/web/src/components/pages/tenant-stream-profiles-page*` — **if it imports the same component, the toast change applies to both portals automatically. If not, parallel change required.**

**View Stream Sheet (Activity tab) - related context:**
- Path: `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx`
- Activity tab data source line 321: `apiUrl={\`/api/audit-log?resource=camera&search=${camera.id}\`}`
- Phase 21 audit entries are written with `resource: 'camera'` and `resourceId: cameraId`. The query filters by `resource: 'camera'` (✓ matches) but uses `search` parameter, which inside `audit.service.ts:78-82` only matches against `resource` and `ip` columns — NOT `resourceId`. **This is the root cause of the deferred "Activity tab shows no events" bug** — every camera audit log entry currently shows up only if their `resource` or `ip` happens to contain the camera ID, which it never does. (Out of scope for Phase 21 per CONTEXT.md, but Phase 21 verification will surface it.)

## 4. Prisma Schema Audit — Camera.streamProfileId relation

### Current state (verified in `apps/api/src/prisma/schema.prisma:217`)

```prisma
streamProfile   StreamProfile? @relation(fields: [streamProfileId], references: [id], onDelete: SetNull)
```

**`onDelete: SetNull` is currently active.** This means: deleting a StreamProfile silently sets every referencing `Camera.streamProfileId` to NULL — no 409, no warning, the cameras fall back to "no profile" (i.e., the implicit default {codec: 'auto', audioCodec: 'aac'} per `streams.service.ts:73-76`). This is the exact behavior D-10 wants to replace.

### Two implementation paths for D-10

**Option A — Schema change to `onDelete: Restrict`**
```prisma
streamProfile   StreamProfile? @relation(fields: [streamProfileId], references: [id], onDelete: Restrict)
```
- Pros: DB-enforced. Even bypassing the API can't break the invariant.
- Cons: Triggers the mandatory 4-step Prisma workflow (CLAUDE.md). Returns Prisma `P2003` foreign-key constraint error which the controller must translate to HTTP 409 with the `{usedBy: [...]}` payload — meaning we still need a query to enumerate the cameras for the response body, so the schema change alone doesn't eliminate the service-layer code.
- Effort: 1 schema line + 1 db:push + Prisma error translation in controller + the cameras-list query.

**Option B — Service-layer pre-delete check (no schema change)**
```typescript
// stream-profile.service.ts
async delete(id: string) {
  const usedBy = await this.prisma.camera.findMany({
    where: { streamProfileId: id },
    select: { id: true, name: true },
  });
  if (usedBy.length > 0) {
    throw new ConflictException({ message: '...', usedBy });
  }
  return this.prisma.streamProfile.delete({ where: { id } });
}
```
- Pros: No schema change, no 4-step workflow, no Prisma error translation. The query is needed in both options anyway.
- Cons: A direct-DB delete (e.g., a script bypassing the API) still set-nulls referencing cameras silently. Defense-in-depth weaker.
- Effort: ~10 lines of code + a new `ConflictException` import.

**Recommendation:** **Option B (service-layer check) is sufficient and lower-risk for Phase 21.** The CONTEXT.md text "may need an `onDelete: Restrict` adjustment if currently set to a permissive default — verify during planning" gives the planner discretion, and Option B avoids the schema-change blast radius (Prisma client regeneration, all running processes restart, etc.). If the planner wants belt-and-suspenders, Option A+B together is fine — but Option A *alone* still requires the same usedBy query for the response body, so it's dominated by Option B in terms of code surface.

### Migration impact (if Option A chosen)

Prisma `db push` with `onDelete: SetNull` → `onDelete: Restrict` is a non-destructive metadata change — it only alters the generated FK trigger, no data movement. Per the existing `db:push` script in `apps/api/package.json:18`, the SQL migration file pipeline runs first (camera_stream_url_unique → push fields → recording_segment → rls_apply_all), then `prisma db push --accept-data-loss`. The Prisma `db push` step will detect the relation change and emit the SQL automatically — no manual migration file needed.

## 5. Recommended Hash Function for Fingerprint (D-01)

### Recommendation: SHA-256 over canonical JSON of the seven fields

```typescript
// apps/api/src/streams/profile-fingerprint.util.ts (new file)
import { createHash } from 'crypto';

const FINGERPRINT_FIELDS = [
  'codec',
  'preset',
  'resolution',
  'fps',
  'videoBitrate',
  'audioCodec',
  'audioBitrate',
] as const;

export function fingerprintProfile(profile: {
  codec?: string | null;
  preset?: string | null;
  resolution?: string | null;
  fps?: number | null;
  videoBitrate?: string | null;
  audioCodec?: string | null;
  audioBitrate?: string | null;
} | null): string {
  // Null-safe: a "no profile" camera fingerprints to a deterministic
  // sentinel so D-02's "previously had no profile and the new one is
  // non-default" comparison always sees a fingerprint mismatch.
  if (!profile) return 'sha256:none';
  const canonical = FINGERPRINT_FIELDS
    .map((k) => `${k}=${profile[k] ?? 'null'}`)
    .join('|');
  return 'sha256:' + createHash('sha256').update(canonical).digest('hex');
}
```

### Why SHA-256 over alternatives

| Approach | Tradeoff | Verdict |
|---|---|---|
| **SHA-256** | Deterministic, collision-resistant (2^128 birthday bound), already used 4× in this codebase (`api-keys.service.ts:25`, `api-key.guard.ts:27`, `webhook-delivery.processor.ts:38`). Node-native (no dependency). 64-char hex output is comfortable to log/diff. | **CHOSEN** |
| Plain join + base64 | Output too long if many fields. No collision protection (we don't strictly need it for 7 short fields, but consistency with the codebase wins). | Reject. |
| MD5 | Faster but no codebase precedent + cryptographic deprecation makes it look amateur even when "just for diff." | Reject. |
| `crypto.createHash('xxh64')` / non-crypto hash | Faster but no native Node support; would require new dependency. | Reject. |
| Just store the 7 fields and compare object equality | Avoids hash entirely. Pros: zero allocation. Cons: harder to log + audit (D-07 wants `oldFingerprint` and `newFingerprint` in the audit row — having a stable string is easier than serializing 7 fields into details JSON). | Reject — D-07 wants a fingerprint string. |

### Canonical serialization — why the pipe-delimited approach

JSON.stringify() is **non-deterministic across Node versions** for objects with NaN, Infinity, or circular keys (none of our 7 fields hit those, but the principle stands). Using `key=value|key=value...` with explicit field-order is bulletproof and 0.5 microseconds faster than JSON.stringify in benchmarks (immaterial — both are sub-microsecond for 7 fields).

The leading `'sha256:'` prefix is borrowed from the [Subresource Integrity spec convention](https://www.w3.org/TR/SRI/) — makes the fingerprint string self-documenting if it ever leaks into a log or error message. It also future-proofs: if Phase 22 ever needs to extend the fingerprint (e.g., add new fields), bumping to `'sha256-v2:'` makes old vs new fingerprints visibly distinct.

### Test coverage required

```
fingerprintProfile(null) === 'sha256:none'
fingerprintProfile({...}) returns deterministic 71-char string ('sha256:' + 64 hex)
fingerprintProfile({codec:'libx264', resolution:'1920x1080', ...}) !== fingerprintProfile({codec:'libx264', resolution:'1280x720', ...})
fingerprintProfile({codec:'libx264', preset:null, resolution:'1920x1080', fps:30, videoBitrate:'2000k', audioCodec:'aac', audioBitrate:'128k'}) === same call again (idempotent)
fingerprintProfile({codec:'copy', preset:null, resolution:null, fps:null, videoBitrate:null, audioCodec:'copy', audioBitrate:null}) (a Passthrough profile) yields a stable hash distinct from the libx264 cases
fingerprintProfile ignores `name` and `description` fields (passing them does NOT change the output)
```

## 6. Recommended SIGTERM Grace Period for Restart (D-05)

### Phase 15 baseline

`apps/api/src/resilience/resilience.service.ts:4` — `SHUTDOWN_GRACE_MS = 10_000` (10 seconds before SIGKILL stragglers). This is the **shutdown** path — server is going down, we want to give every FFmpeg the longest reasonable window because there's no follow-up work after.

### Restart path is different

Phase 21 restart cares about **viewer-facing latency**: the camera is meant to come back online ASAP. Every second of grace is a second of stream gap. But too short a grace makes us SIGKILL too eagerly, which:
1. Leaves `recordings/<cameraId>/<segment>.ts` files with truncated trailing bytes (the segment archive job copes with this — see CLAUDE.md memory note on `RecordingSegment.hasKeyframe` being null-safe — so the cost is bounded).
2. Triggers the BullMQ retry storm protection at `stream.processor.ts:51-56` (which discards the job rather than crashing — but if the SIGKILLed process emits an error event before its handler is gone, the new spawn could see a "Stream already running" warning at `ffmpeg.service.ts:19-22`, leading to a missed restart).

### Recommendation: 5 seconds

```typescript
const RESTART_GRACE_MS = 5_000;
```

Rationale:
- FFmpeg responds to SIGTERM in <500ms in normal cases (it flushes ongoing AV samples then exits).
- The intentional-stop flag (`ffmpeg.service.ts:75`) ensures the `error` event handler resolves cleanly, releasing the BullMQ worker slot.
- 5s is the typical HLS segment duration in our config (`hls_fragment` default is 2s per CLAUDE.md "SRS HLS Configuration" table; production might run 4-6s), so a 5s grace lets at most ONE in-flight segment finalize cleanly.
- If 5s expires, SIGKILL is the right call — a slow-to-die FFmpeg here is almost always stuck on a network read of a flaky source camera (the same camera we're about to restart against).

The planner can pick 3-5s based on UI-SPEC tolerance — anywhere in that range is defensible. **8s or 10s is too long for the restart path** (degrades user experience without measurable benefit). **2s or less is too short** (SIGKILL becomes the common case rather than the exception).

### Implementation sketch

```typescript
// FfmpegService new method
async gracefulRestart(cameraId: string, graceMs = 5_000): Promise<void> {
  if (!this.isRunning(cameraId)) return;
  this.stopStream(cameraId); // SIGTERM, sets intentionalStops
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!this.isRunning(cameraId)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  this.forceKill(cameraId); // SIGKILL
}
```

This mirrors the `resilience.service.ts:39-53` polling loop nearly 1:1 — just per-camera and parameterized. Single-purpose, easy to unit-test (mock the timer).

## 7. Open Questions

### Q1 — Where should `enqueueProfileRestart()` live?

Two options for the orchestration entry point:

| Option | Where | Tradeoff |
|---|---|---|
| **A** | New method on `StreamsService` | Cleanest. StreamsService already holds the queue handle and FfmpegService; both StreamProfileService and CamerasService would inject StreamsService (CamerasService already does at `cameras.service.ts:40`; StreamProfileService doesn't yet). |
| **B** | New method on `StreamProfileService` | Keeps profile-related logic colocated. Requires StreamProfileService to inject the BullMQ queue and AuditService — minor new coupling. |
| **C** | New `ProfileHotReloadService` in resilience module | Most testable. Adds a 4th file to the change set. |

**Recommendation:** Option A (`StreamsService.enqueueProfileRestart`). The orchestration is fundamentally a "make this stream restart with new settings" operation, which is StreamsService's job by name. CamerasService already calls into StreamsService for `stopStream` (during deletion at line 323). StreamProfileService only needs a 1-line constructor injection of StreamsService — small marginal cost.

The planner can pick A, B, or C; this is genuinely Claude's discretion territory.

### Q2 — Do we re-read profile from DB at restart job execution, or trust the enqueue-time payload?

CONTEXT.md D-05 says "spawn new FFmpeg via the standard `streams.service.ts` start path which re-reads the latest profile from the DB." Verifying:

- `streams.service.ts:29-32` reads via `prisma.camera.findUnique({...include: { streamProfile: true }})` AT enqueue time and embeds the profile in `jobData.profile` (line 90).
- `stream.processor.ts:45` destructures `profile` directly from `job.data` — does NOT re-read the DB.

So **the current code does NOT re-read the profile at job execution start.** The profile is snapshotted at enqueue time.

**Why this is fine for Phase 21:** Each enqueue is triggered by a profile/camera-update PATCH that has *just* committed. The DB row at enqueue-time IS the new row. There's no window between "DB row updated" and "restart enqueued" where a fresher row could exist (because that would require yet another PATCH, which would itself trigger another fingerprint diff and another enqueue, deduplicated by jobId).

**Why this might NOT be fine:** If two concurrent PATCHes land within a millisecond, both compute fingerprints and both enqueue. BullMQ dedup keeps only the first (race-winner) job; the second is ignored. The first job spawns FFmpeg with the FIRST committed profile. The second commit's row IS in the DB but the FFmpeg is using the first commit's snapshot. **Worst case:** stream runs on first-commit settings until the next external trigger (manual stop/start, 60s health check, future profile edit).

**Verdict:** D-05's wording is *aspirational* but not strictly enforced by current code. The planner should either:
- **(a)** Accept the snapshot semantic and document it as a known edge case (concurrent admins editing the same profile within 1ms — vanishingly rare).
- **(b)** Modify `StreamProcessor.process()` to re-read the camera+profile via `buildStreamJobData(await prisma.camera.findUnique(...))` at the top of `process()` (defense-in-depth, costs a single DB read per restart).

**Recommendation:** **(a)** — the race window is sub-millisecond and the worst-case outcome is "stream runs with stale settings until next restart trigger" (which is *exactly the bug Phase 21 is fixing*, so you'd just trigger another fix and the second fix would dedupe-into-effect on the next health tick at worst). Adding (b) is fine if the planner wants belt-and-suspenders. Either is acceptable.

### Q3 — How does the response payload from `PATCH /stream-profiles/:id` carry `affectedCameras` count for D-06 toast?

D-06 says "toast `\"{N} camera(s) restarting with new settings\"`". The frontend needs `N`. Options:

| Option | Shape |
|---|---|
| Extend the response | `{...profile, affectedCameras: 3}` — additive, no breaking change |
| New response wrapper | `{profile, restartedCameras}` — breaking change |
| Separate query | Frontend fetches `/api/cameras?streamProfileId=X` after save — extra round-trip |

**Recommendation:** Extend the response with an additive `affectedCameras` field. The frontend types update is a 1-line `interface` extension. No breaking change for any existing consumer (existing code reads `.id`, `.name`, etc. — adding a new key is invisible). The `cameras.service.ts:498` audit pattern already returns enriched payloads, so this matches house style.

For `PATCH /cameras/:id`, the simpler signal works: if `streamProfileId` changed AND the camera was previously online, frontend knows a restart fires — no payload field needed unless we want to be explicit. Recommend a `restartTriggered: true` boolean for clarity.

### Q4 — Audit row shape for `camera.profile_hot_reload`

D-07 specifies `details: {profileId, oldFingerprint, newFingerprint, triggeredBy}`. Sample concrete row:

```json
{
  "orgId": "org-uuid",
  "userId": "user-uuid-or-null",
  "action": "camera.profile_hot_reload",
  "resource": "camera",
  "resourceId": "camera-uuid",
  "method": "PATCH",
  "path": "/api/stream-profiles/profile-uuid",
  "ip": "1.2.3.4",
  "details": {
    "profileId": "profile-uuid",
    "oldFingerprint": "sha256:abc...",
    "newFingerprint": "sha256:def...",
    "triggeredBy": { "userId": "user-uuid", "userEmail": "alice@x.com" }
  }
}
```

`resource: 'camera'` (not `'streamProfile'`) is the right choice because the audit is per-affected-camera, and `resourceId: cameraId` makes it findable from the Activity tab in View Stream Sheet — once the Activity tab search bug is fixed (see §3 / Open Q1 of CONTEXT.md deferred items).

`method: 'PATCH'` and `path` come from the original triggering request — these aren't strictly required by the AuditLog schema but Phase 19.1's `cameras.service.ts:216-224` precedent fills them in for traceability. Phase 21 should match.

### Q5 — Does the existing 30s notify debounce coalesce TWO rapid-fire restart cycles?

D-04 says jitter spreads load. D-11 claims webhook subscribers won't see a `camera.offline` blip because the 30s debounce eats it. But D-04 jitter is 0–30s — meaning two batches of restarts could hit the SAME 30s debounce window for a camera, which would coalesce them but might also coalesce a *failure* into the success.

**Concrete scenario:** Admin saves profile change A at T=0 (camera restart enqueued at T=0 with delay=15s, runs at T=15s). Admin saves profile change B at T=10s (camera restart enqueued at T=10s, jobId=`camera:X:ffmpeg` already in queue → DEDUPED, second save effectively no-op). Camera comes back online at T=18s with profile A. 

Profile B is now stuck — it's in the DB but the camera is running A.

**Is this real?** Looking at `streams.service.ts:95-98`:
```typescript
const existingJob = await this.streamQueue.getJob(`camera:${cameraId}:ffmpeg`);
if (existingJob) {
  await existingJob.remove().catch(() => {});
}
```

`startStream` (the manual user-initiated path) **explicitly removes any existing job** before adding the new one. This means manual restarts trump in-flight restarts. **But the Phase 21 hot-reload path needs to decide:** does it follow `startStream`'s remove-then-add pattern, or does it follow `BootRecoveryService`/`CameraHealthService`'s pure-add-with-dedup pattern?

| Path | Behavior | Phase 21 fit |
|---|---|---|
| Remove-then-add | Latest enqueue wins. Profile B will execute. | **Correct for Phase 21** — admin's most recent intent should win. |
| Pure-add (BullMQ dedup wins) | First enqueue wins. Profile A executes; profile B is silently dropped (worse: profile B's audit row says "restarting" but the restart never happened). | Wrong for Phase 21. |

**Recommendation:** Phase 21 follows `startStream`'s remove-then-add pattern, NOT the pure-add pattern. CONTEXT.md D-03 says "duplicate enqueues from rapid profile resaves [...] are auto-deduped by BullMQ" — but this is **the wrong dedup direction**. The user-meaning of "deduped" should be "two saves within 1s of each other → one restart" (idempotent at user-intent level), not "one save executes the OLD profile and the second save's new profile gets dropped" (deduping at queue-mechanic level).

Planner action: implement remove-then-add. The audit row for the SUPERSEDED save should reflect this — either an additional `details.superseded: true` field, or a backfill. Cleanest: write the audit row at enqueue time as D-07 says, then if the job is later superseded by a remove-then-add, write a follow-up `camera.profile_hot_reload_superseded` row. But this is gold-plating; the simpler path is to accept that the audit row says "restart enqueued" and the remove-and-replace just means "a NEWER restart was enqueued before this one ran" — which a careful reader of consecutive audit entries can deduce.

## 8. Validation Architecture

> Phase 21 fits the project's nyquist_validation enabled posture. Existing test infra at `apps/api/tests/**` (vitest 2, dedicated test DB, 30s timeout, no parallelism) covers it.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2 |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @sms-platform/api test -- tests/streams/profile-fingerprint.test.ts` (per-file) |
| Full suite command | `pnpm --filter @sms-platform/api test` |
| Test DB | `sms_platform_test` (isolated per CLAUDE.md memory note 260421-dlg) |

### Phase Decisions → Test Map

| Decision | Behavior to Verify | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| **D-01 fingerprint** | Two profiles with identical 7 fields produce identical fingerprint; flipping any one field changes it; `name`/`description` don't affect it | unit | `vitest run tests/streams/profile-fingerprint.test.ts` | ❌ Wave 0 |
| **D-01 update flow** | `StreamProfileService.update()` computes pre+post fingerprints; only enqueues restarts when fingerprints differ | unit | `vitest run tests/streams/stream-profile-restart.test.ts` | ❌ Wave 0 |
| **D-02 camera reassign** | `CamerasService.updateCamera()` with new `streamProfileId` enqueues a single restart only when fingerprints differ | unit | `vitest run tests/cameras/camera-profile-reassign.test.ts` | ❌ Wave 0 |
| **D-02 reassign null cases** | Camera previously had no profile; switching to a Passthrough vs Transcode profile; switching to default | unit | (same file as above) | ❌ Wave 0 |
| **D-03 jobId dedup** | Rapid-fire 5 enqueues with same `jobId = camera:X:ffmpeg` collapse to one running job (with remove-then-add: last wins) | integration | `vitest run tests/streams/profile-restart-dedup.test.ts` (uses real BullMQ on Redis) | ❌ Wave 0 |
| **D-04 jitter range** | 100 enqueues all have `delay ∈ [0, 30000)` ms | unit | (in stream-profile-restart.test.ts above) | ❌ Wave 0 |
| **D-05 graceful kill** | `gracefulRestart(cameraId, 5000)`: SIGTERM → wait → if exit, no SIGKILL; if no exit, SIGKILL after 5s | unit (vi.useFakeTimers) | `vitest run tests/streams/ffmpeg-graceful-restart.test.ts` | ❌ Wave 0 |
| **D-05 happy path** | Restart job runs `gracefulRestart → transition('reconnecting') → spawn`; emits expected logs | unit | (in stream-processor.test.ts — extension) | ✓ exists at `tests/streams/stream-processor.test.ts` (extend) |
| **D-06 stream-profile toast** | `ProfileFormDialog` save success with `affectedCameras=3` shows toast "Profile updated · 3 camera(s) restarting with new settings" | component (React Testing Library) | `pnpm --filter @sms-platform/web test -- profile-form-dialog` | ❌ Wave 0 |
| **D-06 camera-form toast** | `CameraFormDialog` save with `streamProfileId` change AND `restartTriggered=true` shows toast | component | `pnpm --filter @sms-platform/web test -- camera-form-dialog` | ✓ exists (extend) |
| **D-07 audit shape** | Restart enqueue writes 1 audit row per affected camera with action=`camera.profile_hot_reload`, resource=`camera`, resourceId=cameraId, details={profileId, oldFingerprint, newFingerprint, triggeredBy} | unit | `vitest run tests/streams/profile-restart-audit.test.ts` | ❌ Wave 0 |
| **D-07 audit at enqueue time** | If job is later superseded/deduped, the audit row from the original enqueue still exists | unit | (in profile-restart-audit.test.ts) | ❌ Wave 0 |
| **D-07 system trigger** | When no req.user (e.g., script), audit `triggeredBy = {system: true}` | unit | (in profile-restart-audit.test.ts) | ❌ Wave 0 |
| **D-08 recording during restart** | When `isRecording=true`, restart fires immediately, no special-casing in restart path | unit | (in stream-profile-restart.test.ts — assertion that no `isRecording` branch exists) | ❌ Wave 0 |
| **D-09 retry exhaustion** | Mock FFmpeg spawn to fail 20 times; after attempt 20, `StatusService.transition` to `degraded` fires | integration | `vitest run tests/streams/profile-restart-failure-fallthrough.test.ts` | ❌ Wave 0 |
| **D-10 409 protection** | `DELETE /stream-profiles/:id` with 2 cameras using it returns 409 + `{usedBy: [{cameraId, name}, {cameraId, name}]}` | integration | `vitest run tests/streams/stream-profile-delete-protection.test.ts` | ❌ Wave 0 |
| **D-10 happy delete** | `DELETE /stream-profiles/:id` with 0 cameras succeeds with 200 | integration | (same file) | ❌ Wave 0 |
| **D-11 webhook coalescing** | Sequential `transition` calls within 30s for same cameraId result in exactly 1 notify dispatch (existing behavior, just verify Phase 21 doesn't break it) | unit | `vitest run tests/status/maintenance-suppression.test.ts` (likely already covers; verify) | ✓ exists (verify, don't add) |
| **Maintenance gate** | When `maintenanceMode=true`, profile update does NOT enqueue restart for that camera | unit | (in stream-profile-restart.test.ts) | ❌ Wave 0 |
| **Status filter** | Only cameras with status ∈ {online, connecting, reconnecting, degraded} are enqueued; offline cameras skipped | unit | (in stream-profile-restart.test.ts) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `vitest run tests/streams/profile-fingerprint.test.ts tests/streams/stream-profile-restart.test.ts` (or whichever file the task touched)
- **Per wave merge:** `pnpm --filter @sms-platform/api test -- tests/streams/ tests/cameras/ tests/audit/ tests/resilience/`
- **Phase gate:** Full `pnpm --filter @sms-platform/api test` AND `pnpm --filter @sms-platform/web test` green before `/gsd-verify-work`

### Wave 0 Test Scaffolds Needed

API side (vitest):
- [ ] `apps/api/tests/streams/profile-fingerprint.test.ts` — fingerprintProfile() unit tests (8 tests)
- [ ] `apps/api/tests/streams/stream-profile-restart.test.ts` — StreamProfileService.update() restart logic (D-01 + status filter + maintenance gate + D-04 jitter range)
- [ ] `apps/api/tests/streams/profile-restart-audit.test.ts` — D-07 audit row shape and timing
- [ ] `apps/api/tests/streams/profile-restart-dedup.test.ts` — D-03 BullMQ dedup integration (real Redis required)
- [ ] `apps/api/tests/streams/profile-restart-failure-fallthrough.test.ts` — D-09 fallthrough to degraded
- [ ] `apps/api/tests/cameras/camera-profile-reassign.test.ts` — D-02 reassign trigger
- [ ] `apps/api/tests/streams/ffmpeg-graceful-restart.test.ts` — D-05 graceful kill helper
- [ ] `apps/api/tests/streams/stream-profile-delete-protection.test.ts` — D-10 409 + onDelete behavior

Frontend (vitest + RTL — apps/web has separate test setup, planner verifies command):
- [ ] `apps/web/src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx` — D-06 toast on profile save
- [ ] Extension to `apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx` (if exists, otherwise create) — D-06 toast on camera form profile change

### Test framework gaps

None. The existing infra at `apps/api/tests/**` covers everything Phase 21 needs:
- vitest 2 + sub-30s tests
- `tests/global-setup.ts` + `tests/setup.ts` already wire test DB + Redis (per `vitest.config.ts:7-8`)
- `tests/fixtures/*` provides camera/profile mocks

The only "new" test class is the BullMQ dedup integration test (`profile-restart-dedup.test.ts`) which needs real Redis. Existing `tests/resilience/boot-recovery.test.ts` mocks the queue — for D-03 dedup verification we want REAL queue behavior. Planner can decide: either use real Redis (test DB approach) or trust the BullMQ docs and mock dedup behavior. **Recommendation:** trust BullMQ docs; mock the queue and verify only that we call `queue.getJob(jobId)` + `existingJob.remove()` + `queue.add(jobId)` in the right order. The remove-then-add pattern (Q5) is what we're verifying, NOT BullMQ's internal dedup — so no real Redis needed.

## Open Questions Recap

| # | Question | Recommendation | Severity |
|---|---|---|---|
| Q1 | Where does `enqueueProfileRestart()` live? | StreamsService new method | LOW (any choice works) |
| Q2 | Re-read profile in StreamProcessor or trust enqueue snapshot? | Trust snapshot; document edge case | LOW |
| Q3 | Response payload shape for `affectedCameras` count? | Additive `affectedCameras: number` field | LOW (no breaking change) |
| Q4 | Exact audit row shape | Use shown JSON; resource=`camera`, resourceId=cameraId | LOW |
| Q5 | Does dedup keep first or last enqueue? | **MUST be remove-then-add (last wins)** — pure BullMQ dedup is wrong direction here | **HIGH — corrects CONTEXT.md D-03 mechanic** |
| Q6 | Phase 21 scope for "Activity tab empty" deferred bug | Out of scope per CONTEXT.md, but Phase 21 UAT will surface it. Found root cause: `audit.service.ts:78-82` `search` only matches resource/ip not resourceId. Recommend follow-up `/gsd-quick`. | LOW (deferred) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | sonner is the only toast library used in admin/cameras and admin/stream-profiles | §3 | Adding a 2nd toast lib for Phase 21 — **VERIFIED via grep, not assumed** (both files import from 'sonner'). Risk: NONE. |
| A2 | The 30s notify debounce coalesces a `online → reconnecting → connecting → online` cycle into a single dispatch (D-11's webhook claim) | §2, §7 Q5 | Webhook subscribers see extra events. **VERIFIED via reading `status.service.ts:79-106`** — the existing job is removed and replaced on every transition, so within 30s only the latest transition's notify fires. Risk: NONE. |
| A3 | Tenant-side stream-profiles page reuses the same `ProfileFormDialog` component | §3 | Tenant toast doesn't fire. **NOT VERIFIED** — planner must `grep ProfileFormDialog apps/web/src/components/pages/tenant-stream-profiles-page*` to confirm. Risk: MEDIUM (extra parallel change if separate component). |
| A4 | `pnpm --filter @sms-platform/web test` is the correct frontend test command | §8 | Planner uses wrong command. **NOT VERIFIED** — confirm via `cat apps/web/package.json` if needed. Risk: LOW (trivial to fix). |
| A5 | BullMQ jobId dedup behavior matches docs.bullmq.io 2025 description (existing job kept, new one rejected with `duplicated` event; once removed, same id can be added) | §6 WebSearch finding, §7 Q5 | Phase 21's remove-then-add pattern doesn't work. **VERIFIED via existing code** (`streams.service.ts:95-98` already uses remove-then-add for the manual restart path, so it's a proven idiom). Risk: NONE. |
| A6 | The `crypto` Node module is available without dependency install | §5 | Planner adds unnecessary dep. **VERIFIED** — already used 4× in codebase. Risk: NONE. |
| A7 | `onDelete: Restrict` in Prisma 6 emits `P2003` foreign-key error (not a different code) for the controller to translate to 409 | §4 Option A | Controller error handler has wrong predicate. **NOT VERIFIED** — Prisma docs claim P2003 for FK violations; Option B (service pre-check) avoids the issue entirely. Risk: LOW if Option B chosen. |

**If this table feels long, that's because Phase 21 is mostly a wiring exercise** — the verification work is "did we read the actual code right" rather than "is this library/pattern current." Most A1-A7 entries verified themselves during research.

## Sources

### Primary (HIGH confidence — direct codebase reads or official docs)
- Repo files cited in §1 Code Path Verification (every file:line verified 2026-04-25)
- [BullMQ Deduplication docs](https://docs.bullmq.io/guide/jobs/deduplication) — jobId dedup behavior; covers "duplicate event emitted" and "removed jobs unblock the id"
- [BullMQ Job IDs docs](https://docs.bullmq.io/guide/jobs/job-ids) — confirms duplicate jobId rejection semantics
- [Node.js crypto module docs](https://nodejs.org/api/crypto.html#class-hash) — `createHash('sha256').update(...).digest('hex')` API used in §5
- CLAUDE.md (this repo) — Prisma 4-step workflow, SRS v6 capabilities, recommended stack
- 21-CONTEXT.md (this phase) — locked decisions D-01..D-11
- 15-CONTEXT.md (this repo) — Phase 15 decisions D-01..D-17 referenced for reuse patterns

### Secondary (MEDIUM confidence — checked once)
- [BullMQ duplicate-jobId Auto-removal issue #1799](https://github.com/taskforcesh/bullmq/issues/1799) — confirms 2025 behavior
- [Preventing Duplicate Jobs in BullMQ — DragonflyDB FAQ](https://www.dragonflydb.io/faq/preventing-duplicate-jobs-in-bullmq) — alternate phrasing of the same dedup semantics

### Tertiary (LOW confidence — not relied on)
- None. Every claim in §§1-8 is backed by a primary source.

## Metadata

**Confidence breakdown:**
- Code path verification (§1): **HIGH** — every file read in current source as of 2026-04-25
- Phase 15 reuse (§2): **HIGH** — every helper/pattern grep-confirmed
- Frontend dialog locations (§3): **HIGH** — file paths and toast library identified
- Prisma schema audit (§4): **HIGH** — current state read; both options articulated
- Hash recommendation (§5): **HIGH** — codebase precedent + docs verified
- SIGTERM grace recommendation (§6): **MEDIUM** — based on Phase 15 baseline + reasoning, not direct latency measurement
- Open Questions (§7): **HIGH** — each is a real choice with articulated tradeoffs
- Validation architecture (§8): **HIGH** — test infra inventoried, mapping is exhaustive

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (30 days; codebase moves slowly enough at single-developer cadence). After that, re-verify §1 line numbers — the rest is structural and won't drift.

## RESEARCH COMPLETE
