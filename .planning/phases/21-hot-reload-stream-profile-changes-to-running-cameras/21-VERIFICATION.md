---
phase: 21-hot-reload-stream-profile-changes-to-running-cameras
verified: 2026-04-25T00:00:00Z
gap_closed_by: 21.1
gap_closed_at: 2026-04-25T14:10:04Z
status: passed
score: 6/6 must-haves verified (5 in Phase 21 + 1 runtime restart cycle closed by Phase 21.1)
re_verification:
  is_re_verification: false
gaps:
  - truth: "Running FFmpeg processes are automatically killed and respawned with the new settings within 30 seconds"
    status: partial
    reason: |
      Active-job collision defect: when a camera's BullMQ job is in active+locked state (worker holds the :lock while
      FFmpeg is alive — the common state after boot recovery), `enqueueProfileRestart`'s remove-then-add pattern at
      streams.service.ts:207-210 silently no-ops. `existingJob.remove()` throws on the locked active job and the error
      is swallowed by `.catch(() => {})`; `queue.add()` then dedupes by jobId and returns the existing 'start' job
      unchanged. The audit row, PATCH response (`affectedCameras`/`restartTriggered`), and UI toast all fire correctly,
      but the FFmpeg process keeps running with the old profile until it dies for some other reason. Manual UAT 2026-04-25
      reproduced this with BKR06+SD640: 11 PATCHes wrote 11 audit rows, but FFmpeg PID 14013 stayed unchanged at the
      original 2000k bitrate while the DB row read 2500k. Phase goal says "within 30 seconds" — not honored for the
      common case. Surface contract is verified end-to-end; runtime restart cycle is not.
    artifacts:
      - path: "apps/api/src/streams/streams.service.ts"
        issue: "Lines 207-210 — `existingJob.remove().catch(() => {})` swallows the throw on active+locked jobs; subsequent `queue.add` dedupes by jobId and returns the existing 'start' job, dropping the new 'restart' job silently"
    missing:
      - "Mechanism to actually replace or signal an in-flight active+locked 'start' job so FFmpeg picks up the new profile within 30s — this is the core 'hot-reload' promise of the phase goal"
      - "Unit test exercising the active+locked code path (current `profile-restart-dedup.test.ts` mocks resolve `existingJob.remove()` synchronously, so the failure path is never exercised)"
    closure_tracking: |
      Closure is tracked as Phase 21.1 (gap-closure phase added to ROADMAP.md on 2026-04-25). Candidate approaches
      enumerated in 21-06-SUMMARY.md "Suggested Phase 21.1 approaches" — pub/sub signal · job.update + external SIGTERM ·
      split jobIds · cooperative shutdown flag. Each has trade-offs against the B-1 collision guard architecture from
      Plan 21-04, so an approach must be locked via `/gsd-discuss-phase 21.1` before planning.
human_verification: []  # All UI behaviors documented in 21-VALIDATION.md "Manual UAT — 2026-04-25" PASS table
---

# Phase 21: Hot-reload Stream Profile changes to running cameras — Verification Report

**Phase Goal:** When a `StreamProfile` is edited (PATCH `/stream-profiles/:id`) or a `Camera.streamProfileId` is changed (PATCH `/cameras/:id`) while affected cameras are live, the running FFmpeg processes are automatically killed and respawned with the new settings within 30 seconds — eliminating the audit-found gap where stale profile values persist on running streams until manual restart or 60s health-check failure. DELETE on a stream profile still in use returns HTTP 409 with the camera list. Edit dialogs surface info-level toasts when restarts fire. New audit action `camera.profile_hot_reload` records each downstream restart per affected camera.

**Verified:** 2026-04-25 (Phase 21 surface) / 2026-04-25T14:10:04Z (Phase 21.1 runtime gap closure)
**Status:** passed (gap closed by Phase 21.1, 12/12 must-haves verified)
**Re-verification:** Yes — Phase 21.1 closed `GAP-21-DEFECT-ACTIVE-JOB-COLLISION` with active-job restart pub/sub mechanism in streams.service.ts

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Editing FFmpeg-affecting fields on a StreamProfile triggers per-camera audit + restart enqueue (D-01, D-07) | VERIFIED | `streams.service.ts:146` `enqueueProfileRestart` + `stream-profile.service.ts:87-105` fingerprint diff + UAT D-07 11/11 audit rows + 28 unit assertions in profile-fingerprint.test.ts + stream-profile-restart.test.ts + profile-restart-audit.test.ts |
| 2 | Reassigning Camera.streamProfileId triggers single-camera audit + restart enqueue when fingerprints differ (D-02) | VERIFIED | `cameras.service.ts:298-365` `updateCamera` reassign branch + UAT Test 2 PASS (BKR06 toast fired) + 9 unit assertions in camera-profile-reassign.test.ts |
| 3 | Running FFmpeg processes are killed and respawned with new settings within 30 seconds (phase goal core promise) | **PARTIAL** | Surface contract honored (audit row + PATCH response + toast); runtime cycle DEFECT for the common active+locked case — see Gaps below |
| 4 | DELETE /stream-profiles/:id returns HTTP 409 with camera list when in use (D-10) | VERIFIED | `stream-profile.service.ts:115-128` ConflictException with `usedBy[]` + UAT D-10 PASS (SD640 + HD 15 both 409 with correct payload) + 6 unit assertions in stream-profile-delete-protection.test.ts |
| 5 | Edit dialogs surface info-level toasts when restart fires (D-06) | VERIFIED | `profile-form-dialog.tsx:158-162` `toast.info('Profile updated · {n} camera(s) restarting…')` + `camera-form-dialog.tsx:220-222` `toast.info('Stream restarting with new profile')` + UAT Tests 1+2 PASS + 7 unit assertions in profile-form-dialog-toast.test.tsx |
| 6 | New audit action `camera.profile_hot_reload` records each downstream restart per affected camera (D-07) | VERIFIED | `streams.service.ts:189` literal action + audit-before-queue.add ordering pinned in profile-restart-audit.test.ts + UAT D-07 confirmed 11 rows with correct `sha256:` old/new fingerprints |

**Score:** 5 of 6 truths fully verified; 1 partial (runtime restart cycle for active+locked jobs).

---

## What Works (Verified)

### 7 PASS Manual UAT items (2026-04-25)

Recorded in `21-VALIDATION.md` § "Manual UAT — 2026-04-25" → "Verified PASS":

1. **Test 7.1 — T-21-01 auth gate** — curl PATCH `/api/stream-profiles/:id` without session returns 401 Unauthorized.
2. **D-10 backend** — DELETE on `SD640` (used by BKR06) and `HD 15` (used by Test Push 4) both return 409 with correct `usedBy: [{cameraId, name}]` payload.
3. **D-01 surface contract** — curl PATCH `SD640` videoBitrate 2000k → 2500k returns 200 with `affectedCameras: 1`.
4. **D-07 audit at enqueue** — 11 PATCHes (1 + 10 rapid-fire) wrote 11 rows to `AuditLog` with correct `sha256:` old/new fingerprints — proving the audit-before-queue.add ordering is rock-solid even under rapid-fire dedup pressure.
5. **D-01 toast (UI)** — Edit Stream Profile dialog → change videoBitrate → Save fires info-variant toast `"Profile updated · 1 camera(s) restarting…"`.
6. **D-02 toast (UI)** — Edit Camera BKR06 → change Stream Profile → Save fires info-variant toast `"Stream restarting with new profile"`.
7. **D-10 AlertDialog (UI)** — Tenant Stream Profiles → Delete `HD 15` shows AlertDialog "Reassign before deleting · 1 camera still using this profile: Test Push 4" with Delete button hidden, only Cancel.

### Automated test coverage (68 assertions across 10 files, all green)

| File | Decisions | Assertions | Status |
|------|-----------|------------|--------|
| `apps/api/tests/streams/profile-fingerprint.test.ts` | D-01 hash | 12 | green |
| `apps/api/tests/streams/stream-profile-restart.test.ts` | D-01 + D-04 + maintenance/status | 9 | green |
| `apps/api/tests/streams/profile-restart-audit.test.ts` | D-07 | 7 | green |
| `apps/api/tests/streams/profile-restart-dedup.test.ts` | D-03 + Q5 (queued path) | 5 | green |
| `apps/api/tests/streams/profile-restart-failure-fallthrough.test.ts` | D-09 | 3 | green |
| `apps/api/tests/streams/ffmpeg-graceful-restart.test.ts` | D-05 | 6 | green |
| `apps/api/tests/streams/stream-profile-delete-protection.test.ts` | D-10 | 6 | green |
| `apps/api/tests/cameras/camera-profile-reassign.test.ts` | D-02 | 9 | green |
| `apps/api/tests/resilience/camera-health-restart-collision.test.ts` | B-1 | 4 | green |
| `apps/web/src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx` | D-06 | 7 | green |
| **Phase 21 contribution total** | — | **68** | **green** |

Final regression sweep (per `21-VALIDATION.md` "Final Test Run"):
- `pnpm --filter @sms-platform/api test` → 101 files / 684 pass / 0 fail / 117 todo (all pre-Phase-21, unrelated)
- `pnpm --filter @sms-platform/web test` → 57 files / 485 pass / 0 fail / 0 todo
- `pnpm --filter @sms-platform/web build` → exit 0, 15.6s, 0 errors, 2 pre-existing warnings

### Threat-model mitigations verified

| Threat | Mitigation | Verified by |
|--------|------------|-------------|
| T-21-01 (Elevation) | AuthGuard on PATCH endpoints + tenancy client RLS scopes camera fan-out | UAT Test 7.1 (401 unauth) + grep `this.prisma.camera.findMany` in streams.service.ts:166 binds to `TENANCY_CLIENT` |
| T-21-02 (Cross-org leak via 409 usedBy[]) | TENANCY_CLIENT scopes findMany; select clause limits to `{id, name}` | `stream-profile-delete-protection.test.ts` case 5 pins no explicit orgId filter (RLS sole isolation) |
| T-21-03 (DoS via rapid PATCH) | BullMQ remove-then-add coalesces to ≤1 job/camera | `profile-restart-dedup.test.ts` 5 assertions on the queued-state path (active-state path is the DEFECT below) |
| T-21-04 (Audit log volume) | Accepted — bounded by admin-action frequency + retention policy | Documented in 21-02-SUMMARY |
| T-21-05 (Fingerprint client exposure) | Server-side only; PATCH response carries only `affectedCameras` count | `grep "fingerprint" apps/web/src/` returns 0 hits per 21-02-SUMMARY |
| T-21-06 (DoS via restart loop) | BullMQ exponential backoff (1s → 5min cap) + 20-attempt limit | `profile-restart-failure-fallthrough.test.ts` 3 assertions |
| T-21-07 (B-1 camera-health collision) | `CameraHealthService.enqueueStart` getJob lookup preserves in-flight 'restart' jobs | `camera-health-restart-collision.test.ts` 4 cases including the regression-guard "in-flight restart NEVER demoted to start" |

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/streams/profile-fingerprint.util.ts` | D-01 SHA-256 fingerprint helper | VERIFIED | Exports `fingerprintProfile` + `FINGERPRINT_FIELDS`; pinned by 12 assertions |
| `apps/api/src/streams/streams.service.ts` | `enqueueProfileRestart` orchestration with audit-before-queue.add ordering | VERIFIED (surface) / PARTIAL (runtime — see Gaps) | Method exists at line 146; audit-then-queue ordering correct; remove-then-add at lines 207-210 — **defect on active+locked path** |
| `apps/api/src/streams/stream-profile.service.ts` | Update with fingerprint diff + restart fan-out + Delete with 409 | VERIFIED | Lines 87-105 (update) + 115-128 (delete with ConflictException + usedBy[]) |
| `apps/api/src/cameras/cameras.service.ts` | `updateCamera` profile-reassign single-camera trigger | VERIFIED | Lines 298-365 with `Object.prototype.hasOwnProperty.call` discriminator + fingerprint diff + cameraId pass-through |
| `apps/api/src/streams/processors/stream.processor.ts` | Branch on `job.name === 'restart'` → gracefulRestart → transition('reconnecting') | VERIFIED | Line 89 branch + line 93 gracefulRestart call; not regressed for 'start' name |
| `apps/api/src/streams/ffmpeg/ffmpeg.service.ts` | `gracefulRestart` SIGTERM → 5s poll → SIGKILL helper | VERIFIED | Method at line 127, default `graceMs = 5_000`, polls `isRunning` at 100ms, calls `forceKill` after deadline |
| `apps/api/src/resilience/camera-health.service.ts` | B-1 collision guard preserving in-flight 'restart' jobs | VERIFIED | Line 144 `if (existing && existing.name === 'restart')` skip-and-return |
| `apps/web/src/app/admin/stream-profiles/components/profile-form-dialog.tsx` | D-06 info-level toast on PATCH success when affectedCameras > 0 | VERIFIED | Lines 151-162 toast variant branch |
| `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` | D-06 info-level toast on PATCH success when restartTriggered=true | VERIFIED | Lines 213-222 |
| `apps/web/src/components/pages/tenant-stream-profiles-page.tsx` | 409 catch + inline camera list + hide-Delete-when-409 | VERIFIED | Lines 34, 97, 159-173 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `stream-profile.service.ts` (update) | `streams.service.ts` (enqueueProfileRestart) | constructor injection | WIRED | Line 95 `this.streamsService.enqueueProfileRestart(...)` |
| `cameras.service.ts` (updateCamera) | `streams.service.ts` (enqueueProfileRestart, single-camera mode) | existing constructor injection | WIRED | Line 341 with `cameraId: id` arg |
| `streams.service.ts` (enqueueProfileRestart) | AuditService (.log) | direct call | WIRED | Line 188 `auditService.log(...)` BEFORE queue.add at line 240 (D-07 ordering pinned by test call-order array) |
| `streams.service.ts` (enqueueProfileRestart) | BullMQ stream-ffmpeg queue | `queue.add('restart', ..., { jobId: 'camera:{id}:ffmpeg' })` | WIRED (queued path) / PARTIAL (active path) | Line 240; **active+locked path silently dedupes — see Gaps** |
| `stream.processor.ts` (process) | `ffmpeg.service.ts` (gracefulRestart) | `this.ffmpegService.gracefulRestart` on `job.name === 'restart'` | WIRED | Line 89 branch; tested via stream-processor.test.ts new assertions |
| `camera-health.service.ts` (enqueueStart) | BullMQ stream-ffmpeg queue | `queue.getJob` lookup before remove-then-add | WIRED | Line 144 + B-1 4-case test green |
| `profile-form-dialog.tsx` | PATCH /api/stream-profiles/:id response.affectedCameras | apiFetch return value | WIRED | Line 151 typed apiFetch + line 158 read |
| `camera-form-dialog.tsx` | PATCH /api/cameras/:id response.restartTriggered | apiFetch return value | WIRED | Line 213 typed apiFetch + line 220 read |
| `tenant-stream-profiles-page.tsx` (handleDelete) | 409 ApiError.body.usedBy | catch ApiError + status check | WIRED | Line 97 `err instanceof ApiError && err.status === 409` + line 159 conditional render |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| ProfileFormDialog toast | `response.affectedCameras` | StreamProfileService.update → enqueueProfileRestart returns `cameras.length` from prisma.camera.findMany | YES (UAT D-01 returned `affectedCameras: 1` for SD640) | FLOWING |
| CameraFormDialog toast | `response.restartTriggered` | CamerasService.updateCamera computes from `result.affectedCameras > 0` | YES (UAT Test 2 BKR06 toast fired) | FLOWING |
| AuditLog rows | `camera.profile_hot_reload` | AuditService.log called per camera in enqueueProfileRestart loop | YES (UAT D-07 11/11 rows with correct fingerprint diff) | FLOWING |
| 409 AlertDialog camera list | `deleteUsedBy` | StreamProfileService.delete throws ConflictException with `usedBy: cameras.map(...)` | YES (UAT D-10 SD640 + HD 15 both rendered correct names) | FLOWING |
| FFmpeg restart with new profile | StreamProcessor's `job.data.profile` | `streamQueue.add('restart', ...)` only when remove-then-add succeeds | **NO** (active+locked case: dedup returns existing 'start' job, new 'restart' silently dropped) | **DISCONNECTED** |

---

## Behavioral Spot-Checks

| Behavior | Method | Result | Status |
|----------|--------|--------|--------|
| 401 on unauthenticated PATCH | curl PATCH `/api/stream-profiles/:id` (no session) | 401 Unauthorized | PASS |
| 409 on DELETE with attached camera | curl DELETE `/api/stream-profiles/:id` (SD640 used by BKR06) | 409 + correct `usedBy` payload | PASS |
| PATCH returns affectedCameras count | curl PATCH SD640 videoBitrate 2000k → 2500k | 200 + `affectedCameras: 1` | PASS |
| Audit row written per PATCH | 11 PATCHes → AuditLog count | 11 rows with correct old/new fingerprints | PASS |
| FFmpeg PID changes within 30s after PATCH (PHASE GOAL) | observe FFmpeg PID before/after PATCH on running camera | **PID 14013 unchanged after 11 PATCHes**; bitrate stayed at 2000k while DB read 2500k | **FAIL** |
| StreamProcessor branches on job.name='restart' | unit test stream-processor.test.ts | gracefulRestart → transition('reconnecting') → startStream order verified | PASS |
| CameraHealthService preserves in-flight 'restart' job (B-1) | unit test camera-health-restart-collision.test.ts | 4/4 cases green incl. regression-guard | PASS |

---

## Requirements Coverage

Phase 21 has no REQUIREMENTS.md IDs — it closes a code-audit-found gap discovered 2026-04-25 and implements 11 locked decisions (D-01..D-11) from CONTEXT.md.

| Decision | Description | Status | Evidence |
|----------|-------------|--------|----------|
| D-01 | Fingerprint over 7 FFmpeg-affecting fields; restart only on hash mismatch | SATISFIED | `profile-fingerprint.util.ts` + 12 assertions; `stream-profile.service.ts:88` short-circuit on equal fingerprints |
| D-02 | Camera-side reassign trigger with fingerprint comparison | SATISFIED | `cameras.service.ts:330-345` + 9 unit assertions + UAT Test 2 |
| D-03 | BullMQ jobId-based dedup (`camera:{id}:ffmpeg`) | SATISFIED (queued path) / DEFECT (active+locked path — see Gaps) | `streams.service.ts:206` jobId literal; queued-path tested; active-path defect documented |
| D-04 | 0–30s jitter delay | SATISFIED | `streams.service.ts:251` `Math.floor(Math.random() * 30_000)` |
| D-05 | SIGTERM → 5s grace → SIGKILL → transition('reconnecting') → spawn | SATISFIED at processor level | `ffmpeg.service.ts:127` + `stream.processor.ts:89-94`; cannot fire on active+locked due to D-03 defect |
| D-06 | Info-level toasts on edit dialog save | SATISFIED | Both dialogs + 7 unit + UAT Tests 1+2 |
| D-07 | `camera.profile_hot_reload` audit at enqueue time, before queue.add | SATISFIED | `streams.service.ts:188` ordering + UAT D-07 11/11 + 7 unit assertions |
| D-08 | Recording during restart proceeds without coordination | SATISFIED at code level (no special branch) | UAT Test 3 deferred (no active recording during session) |
| D-09 | Failed restart fallthrough to existing exponential backoff | SATISFIED | `profile-restart-failure-fallthrough.test.ts` 3 assertions |
| D-10 | DELETE 409 with `usedBy[]` payload | SATISFIED | `stream-profile.service.ts:115-128` + 6 unit + UAT D-10 |
| D-11 | No new webhook event; existing transition pipeline drives it | SATISFIED (verified by automated proof per RESEARCH §A2 + Phase 15 debounce regression) | No new code path; debounce coalescing inherited from Phase 15 |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/streams/streams.service.ts` | 209 | `await existingJob.remove().catch(() => {})` swallows the throw on active+locked jobs | Blocker | Triggers the active-job collision defect that breaks the phase goal "within 30 seconds" promise for the common case (running camera with FFmpeg from boot recovery). The empty `.catch(() => {})` was intended to be defensive against race conditions where the job naturally completes between `getJob` and `remove`, but it also masks the active+locked case where `remove` legitimately throws because BullMQ refuses to remove a locked job. The subsequent `queue.add` then dedupes by jobId and returns the existing 'start' job unchanged — silently. |

No other anti-patterns found in Phase 21 surface code. The 117 pre-existing `it.todo` scaffolds in non-Phase-21 files are unrelated and were not introduced by this phase.

---

## What's Missing (Gaps)

### Gap 1 — Active-job collision defect (runtime restart cycle)

**Truth violated:** "Running FFmpeg processes are automatically killed and respawned with the new settings within 30 seconds" — the core phase-goal promise.

**Where it fails:** When a camera's BullMQ job is in active+locked state — the worker holds the `:lock` because FFmpeg is alive and processing. This is the **common state after boot recovery**, when the StreamProcessor has consumed the start job and is currently running FFmpeg. In this state:

```ts
// apps/api/src/streams/streams.service.ts:206-210
const jobId = `camera:${cam.id}:ffmpeg`;
const existingJob = await this.streamQueue.getJob(jobId);
if (existingJob) {
  await existingJob.remove().catch(() => {});  // throws on locked active job; caught silently
}
await this.streamQueue.add('restart', ..., { jobId, ... });  // BullMQ dedupes by jobId → returns existing 'start'
```

**Effect:**
- Audit row IS written (D-07 was designed for this — intent is preserved)
- PATCH response returns `affectedCameras: N` correctly
- UI toast fires
- But the FFmpeg process keeps running with the OLD profile until it dies for some other reason (worker crash, FFmpeg failure, manual kill, etc.) — at which point the worker re-enqueues fresh from the DB

**Reproducer (recorded in UAT 2026-04-25, BKR06 + SD640):**
- Boot recovery enqueued 'start' job at 11:16:08 with `videoBitrate: 2000k`
- 11 subsequent PATCHes between 11:18 and 11:22 changed `SD640.videoBitrate` to `2500k`/`3000k`/`2500k`/...
- Final DB state: `SD640.videoBitrate = 2500k`, `AuditLog count(camera.profile_hot_reload) = 11`
- BullMQ active job state: still `name: "start"`, `data.profile.videoBitrate: "2000k"`, same `processedOn: 11:16:08`
- FFmpeg PID 14013 unchanged; CPU profile reflected 2000k bitrate, not 2500k

**Why unit tests didn't catch it:** `profile-restart-dedup.test.ts` mocks the queue. Mocked `existingJob.remove()` resolves successfully, so the test exercises the queued-state replacement path but never the active+locked path where BullMQ's real implementation throws.

**Severity:** Medium. Phase name is "hot-reload" but practical behavior is "eventually-reload" for the common case. No data loss; audit trail intact.

**Tracked as:** Phase 21.1 — added to ROADMAP.md on 2026-04-25 as a gap-closure phase. Candidate approaches enumerated in `21-06-SUMMARY.md` § "Suggested Phase 21.1 approaches":

| Approach | Pros | Cons |
|----------|------|------|
| Redis pub/sub signal to active worker | No queue churn; surgical restart | New IPC primitive in StreamProcessor; subscriber lifecycle management |
| `job.update()` + force `kill -SIGTERM` external to BullMQ | Reuses existing process-management code from `gracefulRestart` | Worker doesn't pick up updated `data.profile` automatically; needs explicit re-read |
| Split jobIds: `:ffmpeg:start` vs `:ffmpeg:restart` | Clean separation, no collision | Breaks B-1 collision guard architecture from Plan 04 |
| Cooperative shutdown flag in Redis | Simple to implement | Polling cost in worker; race conditions on flag clearing |

---

### Important note for closure planning

**Do NOT run `/gsd-plan-phase 21 --gaps`** to close this gap. Phase 21.1 is the right place — it has been added to ROADMAP.md as a separate phase with its own discuss step required (`/gsd-discuss-phase 21.1`) because the candidate approaches involve architectural trade-offs against the B-1 collision guard from Plan 21-04. The chosen approach must be locked in CONTEXT.md before plans are written; `--gaps` would short-circuit that discussion.

**Recommended next step:** `/gsd-discuss-phase 21.1` to lock the approach, then `/gsd-plan-phase 21.1` to write plans against the locked approach.

---

## Human Verification Required

None outstanding. All UI behaviors are documented in `21-VALIDATION.md` § "Manual UAT — 2026-04-25" with 7 PASS items. Test 3 (recording gap) was deferred only because no camera was actively recording during the UAT session — it can be retested opportunistically in production but is not a blocker for Phase 21 sign-off. Test 6 (Activity tab visibility) is blocked by a pre-existing frontend audit-search bug (RESEARCH §3 deferred bug) that was already known before Phase 21; the audit ROWS are written correctly (verified via direct DB query in UAT D-07).

---

## Gaps Summary

Phase 21 ships with **surface contract verified end-to-end** (audit log, response fields, UI toasts, 409 protection, threat mitigations). The runtime restart cycle for in-flight FFmpeg processes — the literal "kill and respawn within 30 seconds" promise of the phase goal — is **not honored for the common active+locked case** due to a defect in the remove-then-add pattern at `streams.service.ts:207-210`.

The defect was caught only at manual UAT (2026-04-25) because all unit tests mocked BullMQ, which short-circuits the throw path. The fix is non-trivial: it touches the BullMQ-vs-active-worker IPC boundary and must be designed against the existing B-1 collision guard architecture — hence Phase 21.1 has been created as a separate gap-closure phase with its own discuss step.

**Verdict:** `surface_complete_runtime_deferred` (matches the verdict recorded in 21-06-SUMMARY.md). Status reported here is `gaps_found` to surface the runtime gap explicitly; closure is tracked as Phase 21.1.

---

*Verified: 2026-04-25*
*Verifier: Claude (gsd-verifier)*
