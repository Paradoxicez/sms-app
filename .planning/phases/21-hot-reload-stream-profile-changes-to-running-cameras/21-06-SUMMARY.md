---
plan: 21-06
phase: 21-hot-reload-stream-profile-changes-to-running-cameras
status: complete
verdict: surface_complete_runtime_deferred
completed: 2026-04-25
---

# 21-06 SUMMARY — Final Verification Gate

## Outcome

Phase 21 surface area is verified end-to-end. Runtime FFmpeg restart cycle is **deferred to Phase 21.1** because UAT uncovered an active-job collision defect that unit tests did not catch.

## Tasks Completed

| Task | Description | Outcome |
|------|-------------|---------|
| 21-06-T1 | Run full apps/api + apps/web suites + web build, flip per-task map to ✅, append "Final Test Run" section | ✓ all suites green: 684/684 backend, 485/485 frontend, web build 15.6s exit 0 |
| 21-06-T1 (auto-fix) | Retrofit `profile-builder.test.ts` mock with `camera.findMany` default (Plan 05 D-10 added a pre-delete check that broke the existing mock; Rule 1 regression caught during sweep) | commit `6103bd0` |
| 21-06-T2 | Manual UAT (operator-led) | Mixed CLI + UI verification — 7 tests PASS, 1 DEFECT, 5 deferred (see VALIDATION.md "Manual UAT" section for the full table) |

## Manual UAT Findings

See `21-VALIDATION.md` § "Manual UAT — 2026-04-25" for the verified-PASS table, the DEFECT writeup, and the skipped/deferred list.

### Verified PASS (7)
1. **Test 7.1** — T-21-01 auth gate (401 on unauthenticated PATCH)
2. **D-10 backend** — DELETE returns 409 + `usedBy: [{cameraId, name}]`
3. **D-01 surface** — PATCH returns 200 + `affectedCameras` count
4. **D-07 audit at enqueue** — 11 PATCHes → 11 audit rows, all with correct old/new fingerprints
5. **Test 1** — D-01 profile-edit toast (info-variant, count interpolation)
6. **Test 2** — D-02 camera-reassign toast (info-variant)
7. **Test 4** — D-10 delete AlertDialog (camera list rendered, Delete button hidden)

### DEFECT — Active-Job Collision

When a camera's BullMQ job is in **active+locked** state (worker holds `:lock` while FFmpeg is alive — this is the common state after boot recovery), `enqueueProfileRestart`'s remove-then-add pattern silently no-ops:

```ts
// apps/api/src/streams/streams.service.ts:206-210
const existingJob = await this.streamQueue.getJob(jobId);
if (existingJob) {
  await existingJob.remove().catch(() => {});  // throws on locked active job; caught silently
}
await this.streamQueue.add('restart', ..., { jobId, ... });  // BullMQ dedupes by jobId → returns existing
```

**Effect:** the audit row is correctly written (D-07 was designed for this — intent is preserved), the PATCH response carries `affectedCameras: N`, the UI toast fires — but the actual FFmpeg process keeps running with the original profile. The new profile only takes effect when FFmpeg dies for some other reason and the worker naturally re-enqueues.

**Reproducer recorded in this session** (BKR06 + SD640): 11 PATCHes → 11 audit rows, FFmpeg PID 14013 unchanged, active job still `name: "start"` with `videoBitrate: "2000k"` while `SD640.videoBitrate = "2500k"` in the DB.

**Why unit tests didn't catch it:** `profile-restart-dedup.test.ts` mocks the queue. Mocked `existingJob.remove()` resolves successfully, so the test exercises the queued-state replacement path but never the active+locked path.

**Severity:** medium. Phase name is "hot-reload" but practical behavior is "eventually-reload" for the common case. No data loss; audit trail intact.

### Suggested Phase 21.1 approaches (not pre-decided)

| Approach | Pros | Cons |
|----------|------|------|
| Redis pub/sub signal to active worker | No queue churn; surgical restart | New IPC primitive in `StreamProcessor`; needs subscriber lifecycle management |
| Use `job.update()` + force `kill -SIGTERM` external to BullMQ | Reuses existing process-management code from `gracefulRestart` | Worker doesn't pick up updated `data.profile` automatically; needs explicit re-read in process loop |
| Split jobIds: `:ffmpeg:start` vs `:ffmpeg:restart` | Clean separation, no collision | Breaks B-1 collision guard architecture from Plan 04; would need to redesign that mitigation |
| Cooperative shutdown flag in Redis | Simple to implement | Polling cost in worker; race conditions on flag clearing |

Phase 21.1 should run a fresh `/gsd-discuss-phase 21.1` so an approach gets locked before planning.

## Plan-Level Verification Snapshot (T1)

| Suite | Result |
|-------|--------|
| `pnpm --filter @sms-platform/api test` | 101 files / 684 pass / 0 fail / 117 todo (all pre-Phase-21, unrelated) |
| `pnpm --filter @sms-platform/web test` | 57 files / 485 pass / 0 fail / 0 todo |
| `pnpm --filter @sms-platform/web build` | exit 0, 15.6s, 0 errors, 2 pre-existing warnings |
| Phase 21 contribution | 9 backend + 1 frontend test files / 61 + 7 = 68 assertions / 0 todo / 0 fail |

## Threat-Mitigation Verification (from PLAN frontmatter)

| Threat | Mitigation | Verified by |
|--------|------------|-------------|
| T-21-01 | Auth required on PATCH `/api/stream-profiles/:id` | curl 401 in UAT 7.1 |
| T-21-02 | RLS on stream-profile delete | `stream-profile-delete-protection.test.ts` case 5 (cross-org) |
| T-21-03 | BullMQ dedup prevents flood from rapid PATCHes | `profile-restart-dedup.test.ts` (queued-state path); active-job path is the DEFECT above |
| T-21-04 | Audit log integrity | UAT D-07 — 11/11 audit rows |
| T-21-05 | No client-side fingerprint exposure | `grep "fingerprint" apps/web/src` returns 0 hits in 21-02 SUMMARY; controllers strip it from PATCH response |
| T-21-06 | DoS via restart loop | `gracefulRestart` 5s cap + `attempts: 20` `backoff: exponential` in `streams.service.ts` |
| T-21-07 | Race on `runningProcesses` map | B-1 collision guard in `camera-health.service.ts` (Plan 04) |

## Key Files

| File | Purpose | Plan |
|------|---------|------|
| `apps/api/src/streams/profile-fingerprint.util.ts` | D-01 hash | 21-02 |
| `apps/api/src/streams/streams.service.ts` `enqueueProfileRestart` | D-01/D-02/D-03/D-04/D-07 orchestration | 21-02, 21-03 |
| `apps/api/src/streams/stream-profile.service.ts` | D-10 delete protection | 21-05 |
| `apps/api/src/streams/ffmpeg/ffmpeg.service.ts` `gracefulRestart` | D-05 SIGTERM → 5s → SIGKILL | 21-04 |
| `apps/api/src/streams/processors/stream.processor.ts` | `'restart'` job-name branch | 21-04 |
| `apps/api/src/resilience/camera-health.service.ts` | B-1 collision guard | 21-04 |
| `apps/web/src/app/admin/stream-profiles/components/profile-form-dialog.tsx` | D-06 profile-side toast | 21-05 |
| `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` | D-06 camera-side toast | 21-05 |
| `apps/web/src/components/pages/tenant-stream-profiles-page.tsx` | D-10 AlertDialog | 21-05 |

## Self-Check

- [x] All Plan-21-06 tasks executed
- [x] Each task committed individually (`6103bd0`, plus VALIDATION.md + this SUMMARY)
- [x] Manual UAT outcomes recorded in VALIDATION.md
- [x] DEFECT documented with reproducer, root cause, and Phase 21.1 fix candidates
- [x] Threat mitigations verified or explicitly tied to follow-up

## Verdict

`surface_complete_runtime_deferred` — Phase 21 ships with surface area fully verified. Runtime restart cycle for in-flight FFmpeg processes is captured in Phase 21.1 (gap-closure).
