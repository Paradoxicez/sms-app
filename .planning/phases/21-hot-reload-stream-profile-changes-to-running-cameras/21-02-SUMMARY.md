---
phase: 21-hot-reload-stream-profile-changes-to-running-cameras
plan: 02
subsystem: streams
wave: 1

tags: [phase-21, hot-reload, fingerprint, restart, audit, d-01, d-03, d-04, d-07, profile-side-trigger]

requires:
  - phase: 21-01
    provides: "Wave 0 scaffolds — profile-fingerprint.test.ts, stream-profile-restart.test.ts, profile-restart-audit.test.ts (all it.todo)"
provides:
  - "fingerprintProfile() pure helper — canonical fingerprint over the 7 FFmpeg-affecting fields"
  - "StreamsService.enqueueProfileRestart() — single chokepoint for both profile-side and camera-side hot-reload triggers"
  - "StreamProfileService.update() with fingerprint diff + restart fan-out + affectedCameras count"
  - "PATCH /api/stream-profiles/:id response includes additive `affectedCameras: number` field"
  - "Wave 0 test transitions: 12 + 9 + 7 = 28 todos → 12 + 9 + 7 = 28 passing (0 failing, 0 todo)"
affects: [21-03, 21-04, 21-05]

tech-stack:
  added:
    - "Node.js crypto.createHash('sha256') for deterministic profile fingerprinting"
  patterns:
    - "Audit-then-enqueue ordering: AuditService.log writes the audit row BEFORE queue.add to preserve audit trail across remove-then-add supersession"
    - "BullMQ job-name dispatch with shared jobId: 'start' and 'restart' jobs share `camera:{id}:ffmpeg` jobId so only one is in-flight per camera; StreamProcessor (Plan 04) will branch on job.name"
    - "@Optional() service injection at the LAST constructor param so existing unit-test harnesses (no audit/streams service) continue to construct"
    - "Positional triggeredBy parameter on service methods — NOT CLS — single source of truth from req.user"

key-files:
  created:
    - "apps/api/src/streams/profile-fingerprint.util.ts (41 lines) — fingerprintProfile() + FINGERPRINT_FIELDS const tuple + FingerprintInput type"
  modified:
    - "apps/api/src/streams/streams.service.ts (148 → 269 lines) — added enqueueProfileRestart() + AuditService import + @Optional() audit constructor param"
    - "apps/api/src/streams/stream-profile.service.ts (112 → 149 lines) — wired fingerprint diff + restart fan-out + triggeredBy parameter + affectedCameras return field"
    - "apps/api/src/streams/stream-profile.controller.ts (82 → 95 lines) — added @Req() Request param + req.user → triggeredBy mapping"
    - "apps/api/src/streams/streams.module.ts (44 → 48 lines) — imported AuditModule (declarative, since it's @Global)"
    - "apps/api/tests/streams/profile-fingerprint.test.ts (16 → 110 lines) — flipped 12 it.todo → it() with real assertions"
    - "apps/api/tests/streams/stream-profile-restart.test.ts (13 → 268 lines) — flipped 9 it.todo → it() with full restart-fan-out harness"
    - "apps/api/tests/streams/profile-restart-audit.test.ts (11 → 212 lines) — flipped 7 it.todo → it() with audit-row-shape + ordering harness"

decisions:
  - "Used @Optional() AuditService at the LAST StreamsService constructor param (mirrors systemPrisma pattern) so existing test harnesses construct without breaking"
  - "Threaded triggeredBy as a POSITIONAL service-method parameter (not CLS) per plan revision iter 1 — single, final source from req.user; defaults to { system: true } for script callpaths"
  - "Audit row is written BEFORE queue.add inside the per-camera loop, NOT batched at end — preserves D-07 contract that the audit row exists even if a subsequent profile save supersedes the in-flight job"

patterns-established:
  - "Phase 21 hot-reload contract: audit-then-enqueue inside enqueueProfileRestart — Plan 03 (camera-side trigger) calls the same chokepoint, so audit-then-enqueue ordering is enforced for both paths"
  - "Wave 1 TDD execution: RED commit (test file flip) → GREEN commit (source impl) per task; 4 commits total for 2 tasks (test + impl per task)"

requirements-completed: []  # Phase 21 has no REQUIREMENTS.md IDs — gap-closure phase, decisions tracked via D-01..D-11

# Metrics
duration: ~13min
completed: 2026-04-25
---

# Phase 21 Plan 02: Profile-side hot-reload trigger (D-01 fingerprint + D-07 audit + restart fan-out) Summary

**Built the D-01 fingerprint helper, the StreamsService.enqueueProfileRestart chokepoint (per-camera audit-then-enqueue with 0-30s jitter and corrected jobId), and wired StreamProfileService.update so any FFmpeg-affecting field change fans out a 'restart' BullMQ job for every running, non-maintenance camera using that profile. PATCH /api/stream-profiles/:id now returns an additive `affectedCameras: number` field — Plan 05 surfaces it as a toast.**

## Performance

- **Duration:** ~13 min (including pnpm install bootstrap)
- **Tasks:** 2 (each TDD: 1 RED commit + 1 GREEN commit = 4 commits total)
- **Files created:** 1 (`profile-fingerprint.util.ts`)
- **Files modified:** 7 (4 source + 3 test)
- **Net lines added:** ~620 (impl ~280 / tests ~470)

## Task Commits

| # | Task | Phase | Commit | Description |
|---|------|-------|--------|-------------|
| 1a | 21-02-T1 RED | test | `aa23fab` | Flip 12 fingerprint it.todo → real assertions |
| 1b | 21-02-T1 GREEN | feat | `c02e267` | Implement fingerprintProfile() pure helper |
| 2a | 21-02-T2 RED | test | `50e383a` | Flip 16 restart + audit it.todo → real assertions |
| 2b | 21-02-T2 GREEN | feat | `3a7c162` | Wire enqueueProfileRestart + StreamProfileService.update + controller req.user |

## StreamsService.enqueueProfileRestart — final signature

```typescript
async enqueueProfileRestart(args: {
  profileId: string;
  oldFingerprint: string;
  newFingerprint: string;
  triggeredBy: { userId: string; userEmail: string } | { system: true };
  originPath: string;
  originMethod: string;
}): Promise<{ affectedCameras: number }>
```

Behavior:
1. `prisma.camera.findMany({ where: { streamProfileId, status IN [...4...], maintenanceMode: false } })` via TENANCY_CLIENT (T-21-01 RLS scoping)
2. For each camera **in order**:
   - `auditService.log({ action: 'camera.profile_hot_reload', resource: 'camera', resourceId: camId, method, path, details: { profileId, oldFingerprint, newFingerprint, triggeredBy } })` — D-07 enqueue-time audit
   - `streamQueue.getJob('camera:{id}:ffmpeg').remove()` — D-03 remove-then-add (latest wins)
   - `prisma.streamProfile.findUnique({ id: profileId })` — fetch fresh profile snapshot
   - `streamQueue.add('restart', { cameraId, orgId, inputUrl, profile, needsTranscode }, { jobId: 'camera:{id}:ffmpeg', delay: Math.floor(Math.random() * 30_000), attempts: 20, backoff: { exponential, 1000 }, removeOnComplete: true })`
3. Return `{ affectedCameras: cameras.length }`

## StreamProfileService.update — flow diagram

```
PATCH /api/stream-profiles/:id { codec: 'copy' }
        │
        ▼
controller: build triggeredBy from req.user → { userId, userEmail } | { system: true }
        │
        ▼
service.update(id, dto, triggeredBy)
   ├─ pre = prisma.streamProfile.findUnique({ id })          # read pre-image
   │   └─ if !pre → throw NotFoundException
   ├─ if dto.isDefault → unset other defaults (orgId-scoped)
   ├─ updated = prisma.streamProfile.update({ id, data: dto })  # commit new row
   ├─ oldFp = fingerprintProfile(pre)
   ├─ newFp = fingerprintProfile(updated)
   ├─ if oldFp === newFp → return { ...updated, affectedCameras: 0 }   # short-circuit (name/desc only)
   └─ else → streamsService.enqueueProfileRestart({ profileId, oldFp, newFp, triggeredBy, originPath, originMethod })
              └─ returns { affectedCameras: N }
        │
        ▼
return { ...updated, affectedCameras: N }     # additive field, frontend Plan 05 surfaces as toast
```

## Wave 0 test transitions

| File | Wave 0 todos | After Plan 02 | Status |
|------|--------------|---------------|--------|
| `tests/streams/profile-fingerprint.test.ts` | 12 todo | 12 passing, 0 failing, 0 todo | ✅ green |
| `tests/streams/stream-profile-restart.test.ts` | 9 todo | 9 passing, 0 failing, 0 todo | ✅ green |
| `tests/streams/profile-restart-audit.test.ts` | 7 todo | 7 passing, 0 failing, 0 todo | ✅ green |
| **Plan 02 totals** | **28 todo** | **28 passing, 0 failing** | ✅ |

**Adjacent regression check (no behavioral drift):**

```
$ pnpm exec vitest --run \
    tests/streams/profile-fingerprint.test.ts \
    tests/streams/stream-profile-restart.test.ts \
    tests/streams/profile-restart-audit.test.ts \
    tests/streams/stream-processor.test.ts \
    tests/streams/streams-service-push.test.ts \
    tests/streams/stream-lifecycle.test.ts

 Test Files  6 passed (6)
      Tests  38 passed (38)
```

## Threat-mitigation evidence

### T-21-01 (Elevation — cross-org restart fan-out)

```bash
$ /usr/bin/grep -nE 'this\.prisma\.camera\.findMany' apps/api/src/streams/streams.service.ts
145:    const cameras = await this.prisma.camera.findMany({
```

`this.prisma` is bound to `TENANCY_CLIENT` (constructor line 14). RLS scopes `cameras.findMany` to the requesting org — a malicious PATCH cannot fan out to cameras in another org because the tenancy-bound query returns zero rows for off-org cameras.

### T-21-03 (DoS — rapid PATCH abuse)

`streamQueue.getJob → remove → add` per camera ensures rapid resaves coalesce to ONE in-flight job per camera. The added cost per save is N audit rows where N = affected cameras, bounded by admin-action frequency. No new HTTP-layer rate limit added (existing AuthGuard + admin-only action is the threat boundary).

### T-21-04 (Information Disclosure — audit volume)

Each profile save writes N audit rows. `oldFingerprint` and `newFingerprint` are SHA-256 hashes (no credentials), `profileId` is a UUID, `triggeredBy.userEmail` is the actor's email (already in audit log payload for other actions). Existing audit retention policy applies.

### T-21-05 (Information Disclosure — fingerprint exposure)

```bash
$ /usr/bin/grep -c 'fingerprint' apps/api/src/streams/stream-profile.controller.ts
0
```

The controller never names `fingerprint`. The PATCH response includes only `affectedCameras: number` — fingerprints stay server-side in the audit `details` field.

## Acceptance Criteria — verification

| Criterion | Expected | Actual | Status |
|-----------|----------|--------|--------|
| `fingerprintProfile` exported from util | yes | yes | ✅ |
| `createHash('sha256')` in util | =1 | 1 | ✅ |
| `'sha256:none'` sentinel in util | ≥1 | 2 (1 code + 1 doc) | ✅ |
| Fingerprint format `${k}=${profile[k] ?? 'null'}` | present | present | ✅ |
| `enqueueProfileRestart` in streams.service | ≥1 | 2 (def + JSDoc) | ✅ |
| `fingerprintProfile` in stream-profile.service | ≥2 | 3 | ✅ |
| `'restart'` job-name literal | ≥1 | 1 | ✅ |
| `camera:${cam.id}:ffmpeg` jobId pattern | ≥1 | 1 | ✅ |
| `camera.profile_hot_reload` action string | =1 runtime | 1 runtime + 1 JSDoc | ✅ |
| `Math.floor(Math.random() * 30_000)` jitter | =1 | 1 | ✅ |
| `AuditModule` in streams.module | ≥1 | 3 (import + array + comment) | ✅ |
| Tests `0 failing, 0 todo` for plan 02 files | yes | yes (28/28) | ✅ |
| Audit-before-queue.add ordering | strict | strict (callOrder array assertion) | ✅ |
| `maintenanceMode: true` skipped | yes | yes (test confirms) | ✅ |
| `status: 'offline'` skipped | yes | yes (test confirms) | ✅ |
| PATCH response includes `affectedCameras` | yes | yes (return value assertion) | ✅ |

## Decisions Made

- **@Optional() AuditService at LAST constructor position** — prevents existing test harnesses (e.g., `streams-service-push.test.ts`) from breaking when constructing StreamsService manually. Pattern matches `@Optional() private readonly systemPrisma`.
- **triggeredBy as POSITIONAL service param** — plan revision iter 1 dropped the CLS-first design in favor of `req.user → controller → service` thread. Single source, no fallback hunt.
- **Audit-then-queue.add inside the per-camera loop** — keeps D-07 ordering tight per camera; if camera N's audit succeeds but its queue.add throws, cameras 1..N-1 already have their audit rows written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Bootstrapped worktree node_modules + .env.test**

- **Found during:** Pre-task setup
- **Issue:** Worktree at `.claude/worktrees/agent-ab2cd06e/` had no `node_modules/` and no `apps/api/.env.test`, so `pnpm exec vitest` would fail with "Failed to load url @prisma/client".
- **Fix:** Copied `apps/api/.env.test` from the parent worktree (gitignored, so not committed), then ran `pnpm install --frozen-lockfile --prefer-offline` which used the pnpm store cache and triggered `prisma generate` via the apps/api postinstall hook. ~13s total.
- **Files modified:** None tracked in git.
- **Verification:** All 38 tests across the streams suite pass.

---

**Total deviations:** 1 auto-fixed (1 blocking). No scope creep.

## Deferred Issues

The repo-wide `tsc --noEmit` reports 5 pre-existing TypeScript errors in unrelated files (`avatar.controller.ts`, `cameras.controller.ts`, `cluster.gateway.ts`, `recordings/minio.service.ts`, `status.gateway.ts`). These are NOT introduced by Plan 21-02 — `tsc --noEmit` filtered to my edited files returns zero errors. Out of scope per `<scope_boundary>` rule. Logged here for tracking but not addressed.

```
$ tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(streams\.service|stream-profile|profile-fingerprint|streams\.module)" | wc -l
0
```

## Next Plan Readiness

- **Plan 03 (D-02 camera-side trigger)** can now reuse `StreamsService.enqueueProfileRestart` directly — the chokepoint contract is in place and unit-tested.
- **Plan 04 (D-05 graceful restart in StreamProcessor)** will branch on `job.name === 'restart'` to call `gracefulRestart()` instead of `startStream()`. The 'restart' job-name literal is now present in queue.add calls.
- **Plan 04 (B-1 collision guard in CameraHealthService.enqueueStart)** must guard against demoting an in-flight 'restart' job to 'start' carrying stale camera-health data. The shared `camera:{id}:ffmpeg` jobId is the discriminator key.
- **Plan 05 (D-06 toast)** has the additive `affectedCameras: number` field on the PATCH response ready to consume.

## Self-Check: PASSED

Verified all created/modified files exist on disk and all 4 task commits are present in git history:

- `apps/api/src/streams/profile-fingerprint.util.ts` — FOUND (41 lines)
- `apps/api/src/streams/streams.service.ts` — MODIFIED (269 lines)
- `apps/api/src/streams/stream-profile.service.ts` — MODIFIED (149 lines)
- `apps/api/src/streams/stream-profile.controller.ts` — MODIFIED (95 lines)
- `apps/api/src/streams/streams.module.ts` — MODIFIED (48 lines)
- `apps/api/tests/streams/profile-fingerprint.test.ts` — MODIFIED (110 lines, 12 passing)
- `apps/api/tests/streams/stream-profile-restart.test.ts` — MODIFIED (268 lines, 9 passing)
- `apps/api/tests/streams/profile-restart-audit.test.ts` — MODIFIED (212 lines, 7 passing)

Commits: `aa23fab`, `c02e267`, `50e383a`, `3a7c162` — all FOUND in `git log`.

Verification: `pnpm exec vitest --run` over plan-02 files plus adjacent streams suites → 38/38 passing, 0 failing, 0 todo.

---
*Phase: 21-hot-reload-stream-profile-changes-to-running-cameras*
*Plan: 02*
*Wave: 1*
*Completed: 2026-04-25*
