---
phase: 21-hot-reload-stream-profile-changes-to-running-cameras
plan: 05
subsystem: streams+web
wave: 3

tags: [phase-21, hot-reload, d-10, d-06, delete-protection, toast, ux, conflict-exception]

requires:
  - phase: 21-01
    provides: "Wave 0 scaffolds — stream-profile-delete-protection.test.ts (6 it.todo) + profile-form-dialog-toast.test.tsx (7 it.todo)"
  - phase: 21-02
    provides: "PATCH /api/stream-profiles response includes additive `affectedCameras: number`"
  - phase: 21-03
    provides: "PATCH /api/cameras response includes additive `restartTriggered: boolean`"
  - phase: 21-04
    provides: "StreamProcessor restart-branch contract complete (job.name === 'restart')"
provides:
  - "StreamProfileService.delete pre-check throwing ConflictException(409) with usedBy[] when cameras still reference the profile"
  - "ProfileFormDialog (admin + tenant — shared component) toast variants on PATCH success: info-level when affectedCameras > 0, success-level otherwise"
  - "CameraFormDialog edit-mode toast.info on PATCH success when restartTriggered=true"
  - "tenant-stream-profiles-page 409 catch + inline camera-list render in delete confirmation AlertDialog"
  - "Wave 0 transitions: 6 (backend) + 7 (frontend) = 13 todos → 13 passing, 0 failing, 0 todo"
affects: [21-06]

tech-stack:
  added: []
  patterns:
    - "Service-layer pre-check guard (Option B) — keep schema unchanged, throw ConflictException(409) inside service before destructive mutation"
    - "Severity-by-payload toast pattern — single mutation surfaces info or success based on a server-emitted side-effect counter (affectedCameras)"
    - "Inline 409 disclosure in AlertDialog — extract usedBy[] from ApiError.body, render list adjacent to (not inside) AlertDialogDescription so the <p>-rooted primitive does not get nested block-level children"

key-files:
  created: []
  modified:
    - "apps/api/src/streams/stream-profile.service.ts (+22 / -2) — add ConflictException import + delete() pre-check"
    - "apps/api/tests/streams/stream-profile-delete-protection.test.ts (+103 / -7) — flipped 6 it.todo → it() with full ConflictException + RLS-shape harness"
    - "apps/web/src/app/admin/stream-profiles/components/profile-form-dialog.tsx (+15 / -5) — capture PATCH response, branch toast.info / toast.success on affectedCameras"
    - "apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx (+16 / -3) — import sonner toast, capture restartTriggered, fire toast.info when true"
    - "apps/web/src/components/pages/tenant-stream-profiles-page.tsx (+42 / -14) — import ApiError, deleteUsedBy state, 409 catch, inline camera list render, hide Delete action when in 409-state"
    - "apps/web/src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx (+158 / -8) — flipped 7 it.todo → it() with sonner+apiFetch mocks"

decisions:
  - "Adopted Option B (service-layer pre-check) per RESEARCH §4 — avoids the 4-step Prisma schema/regenerate workflow. Schema-level `onDelete: SetNull` preserved as defense-in-depth for the T-21-RACE-DELETE-PATCH window between findMany and delete."
  - "Severity ladder for D-06 toast: success → info on `affectedCameras > 0`. Did NOT use warning severity; the operation itself succeeded — info correctly signals 'side effect happened, here's the count' without alarm tone."
  - "AlertDialogDescription does NOT support asChild (the underlying Radix primitive renders <p>; nesting <div>/<ul> children would yield invalid HTML). Restructured Plan 05 markup to render the inline camera <ul> as a sibling node between Description and Footer rather than wrapping it inside Description with asChild."

patterns-established:
  - "ApiError.body shape relied on by frontend: ApiError(status: number, body: unknown) carries the parsed JSON 409 payload, including the `usedBy: Array<{ cameraId, name }>` field. Future plans that need to render server-supplied conflict data inline can follow this pattern: catch (err instanceof ApiError && err.status === N) → check body shape → setState → render."
  - "Inline-disclosure dialog state pattern: `[delete{Resource}, set{Resource}] + [delete{Resource}UsedBy, set{Resource}UsedBy]` — the second piece of state captures the conflict payload; null = no conflict, populated = render conflict view."

requirements-completed: []  # Phase 21 has no REQUIREMENTS.md IDs — gap-closure phase

# Metrics
duration: ~13min
completed: 2026-04-25
---

# Phase 21 Plan 05: D-10 delete protection + D-06 toast surface Summary

**Closed the user-facing surface for Phase 21: PATCH responses now reach the user as informative toasts ("Profile updated · 3 camera(s) restarting with new settings", "Stream restarting with new profile"), and the destructive DELETE flow on `stream-profiles` now refuses to silently null-set referencing cameras — instead returning HTTP 409 with `usedBy: [{ cameraId, name }]` rendered inline in the confirmation AlertDialog as "Reassign before deleting · {N} camera(s) still using this profile:".**

## Performance

- **Duration:** ~13 min (including ~13s `pnpm install` worktree bootstrap + Rule 3 build-fix iteration)
- **Started:** 2026-04-25T09:51:32Z
- **Completed:** 2026-04-25T10:04:41Z
- **Tasks:** 2 (each TDD: 1 RED + 1 GREEN = 4 commits total)
- **Files created:** 0
- **Files modified:** 6 (2 backend + 4 frontend)
- **Net lines added:** ~356 (impl ~95 / tests ~261)

## Task Commits

| # | Task | Phase | Commit | Description |
|---|------|-------|--------|-------------|
| 1a | 21-05-T1 RED | test | `6f94e21` | Flip 6 D-10 delete-protection it.todo → real assertions |
| 1b | 21-05-T1 GREEN | feat | `7f1be4b` | StreamProfileService.delete pre-check + ConflictException(409) |
| 2a | 21-05-T2 RED | test | `cffb9dd` | Flip 7 D-06 ProfileFormDialog toast it.todo → real assertions |
| 2b | 21-05-T2 GREEN | feat | `57d4914` | Toast variants (profile + camera) + tenant 409 inline camera list |

## Backend D-10 — StreamProfileService.delete contract

**Final implementation (apps/api/src/streams/stream-profile.service.ts):**

```typescript
async delete(id: string) {
  // Phase 21 D-10: pre-delete check (Option B per 21-RESEARCH.md §4 — service-
  // layer guard, no schema change). The tenancy client scopes findMany to the
  // requester's org via RLS, so cross-org camera names never leak (T-21-02).
  // Schema-level `onDelete: SetNull` is preserved as defense-in-depth for the
  // T-21-RACE-DELETE-PATCH window between findMany and delete.
  const usedBy = await this.prisma.camera.findMany({
    where: { streamProfileId: id },
    select: { id: true, name: true },
  });

  if (usedBy.length > 0) {
    throw new ConflictException({
      message:
        'Stream profile is in use by one or more cameras. Reassign before deleting.',
      usedBy: usedBy.map((c) => ({ cameraId: c.id, name: c.name })),
    });
  }

  return this.prisma.streamProfile.delete({ where: { id } });
}
```

**Response body shape on 409 (NestJS-translated):**

```json
{
  "statusCode": 409,
  "message": "Stream profile is in use by one or more cameras. Reassign before deleting.",
  "usedBy": [
    { "cameraId": "cam-A", "name": "Front Door" },
    { "cameraId": "cam-B", "name": "Back Lot" }
  ],
  "error": "Conflict"
}
```

**Controller untouched:** the existing DELETE handler at `stream-profile.controller.ts:81-84` returns `this.profileService.delete(id)`. NestJS's exception filter chain catches `ConflictException` and emits the JSON body verbatim — no controller-layer adjustment needed.

## Frontend D-06 — Toast variants

### ProfileFormDialog (admin + tenant — single shared component)

**Behavior:** PATCH success → read `response.affectedCameras` (default 0) → branch:
- `n > 0` → `toast.info('Profile updated · {n} camera(s) restarting with new settings')`
- `n === 0` → `toast.success('Profile updated')` (existing behavior preserved)

CREATE-mode flow unchanged — keeps `toast.success('Profile created')`.

### CameraFormDialog (edit branch only)

**Behavior:** PATCH success → read `response.restartTriggered` → if true, fire `toast.info('Stream restarting with new profile')`. Falsy values (false/undefined) skip the toast — server only sets it true when streamProfileId actually changed AND fingerprints differ AND the camera is restart-eligible (Plan 03 contract).

CREATE flows (push and pull) unchanged.

## Frontend D-10 — tenant-stream-profiles-page 409 inline disclosure

**State additions:**

```typescript
const [deleteUsedBy, setDeleteUsedBy] = useState<
  Array<{ cameraId: string; name: string }> | null
>(null);
```

**handleDelete catch arm:**

```typescript
} catch (err) {
  if (err instanceof ApiError && err.status === 409) {
    const body = err.body as { usedBy?: Array<{ cameraId: string; name: string }> } | null;
    if (body && Array.isArray(body.usedBy) && body.usedBy.length > 0) {
      setDeleteUsedBy(body.usedBy);
      return;  // Keep dialog open, render list inline
    }
  }
  toast.error('Failed to delete profile');
}
```

**AlertDialog rendering:**

- Description text branches: `Reassign before deleting · N camera(s) still using this profile:` when `deleteUsedBy` is set, otherwise the plain "Are you sure…?" copy.
- A sibling `<ul className="list-disc pl-5 …">` renders the `usedBy` camera names below the Description (NOT nested inside Description — see Decision #3 above).
- The Delete action button is hidden once `deleteUsedBy` is set; the user can only Cancel (and reassign cameras manually before retrying).
- onOpenChange resets BOTH `deleteProfile` and `deleteUsedBy` so reopening shows the regular "Are you sure?" view.

**Description copy fix:** The previous static description claimed "Cameras using this profile will fall back to the default passthrough profile." This is now misleading because we BLOCK deletion when cameras reference the profile. Replaced with: "Deletion is blocked while any camera still references this profile."

## Wave 0 test transitions

| File | Wave 0 todos | After Plan 05 | Status |
|------|--------------|---------------|--------|
| `apps/api/tests/streams/stream-profile-delete-protection.test.ts` | 6 todo | 6 passing, 0 failing, 0 todo | green |
| `apps/web/src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx` | 7 todo | 7 passing, 0 failing, 0 todo | green |
| **Plan 05 totals** | **13 todo** | **13 passing, 0 failing** | green |

**Adjacent regression check (Plan 02-04 backend suites):**

```
$ npx vitest --run \
    tests/streams/stream-profile-delete-protection.test.ts \
    tests/streams/profile-fingerprint.test.ts \
    tests/streams/stream-profile-restart.test.ts \
    tests/streams/profile-restart-audit.test.ts \
    tests/streams/profile-restart-dedup.test.ts \
    tests/streams/profile-restart-failure-fallthrough.test.ts \
    tests/streams/ffmpeg-graceful-restart.test.ts \
    tests/streams/stream-processor.test.ts \
    tests/cameras/camera-profile-reassign.test.ts \
    tests/resilience/camera-health-restart-collision.test.ts \
    tests/resilience/camera-health.test.ts

  exit=0  (all green; full pre-Plan-05 suites + new file)
```

**Adjacent web-suite regression:**

```
$ pnpm exec vitest --run \
    src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx \
    src/app/admin/cameras/components/__tests__/camera-form-dialog-push.spec.tsx \
    src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx

  PASS (26) FAIL (0)
```

**Build verification:**

- `pnpm --filter @sms-platform/web build` → ✓ Compiled successfully (Next.js 15.5.15)
- `pnpm --filter @sms-platform/api build` → ✓ 161 files swc compiled

## Threat-mitigation evidence

### T-21-02 (Information Disclosure — 409 usedBy[] cross-org leak)

```bash
$ /usr/bin/grep -c "TENANCY_CLIENT" apps/api/src/streams/stream-profile.service.ts
2
```

`StreamProfileService.delete` calls `this.prisma.camera.findMany`. The constructor injects `TENANCY_CLIENT` (line 13: `@Inject(TENANCY_CLIENT) private readonly prisma: any`), so RLS scopes the lookup to the requesting org's cameras. The `select: { id: true, name: true }` clause restricts the returned rows to ONLY cameraId + name — no orgId, no streamUrl, no profile metadata leaks. The fifth test case (`usedBy query is scoped to the requester's org…`) pins the contract by asserting the `where` clause does NOT add an explicit `orgId` filter (so RLS via TENANCY_CLIENT is the sole isolation mechanism, and any future refactor that bypasses tenancy would fail this test).

### T-21-RACE-DELETE-PATCH (TOCTOU — DELETE racing with concurrent PATCH attaching a camera) — accepted

A camera could be attached to a profile between the `findMany` check and the `streamProfile.delete`. Result: deletion succeeds and the new attaching camera's `streamProfileId` is silently set to NULL via the existing `onDelete: SetNull` behavior. This is the SAME failure mode as before this plan (no schema change). Plan 05 reduces the window but does not eliminate it. Defense-in-depth via Option A (schema Restrict) was rejected to avoid the 4-step Prisma workflow per RESEARCH §4. **Explicit acceptance recorded.**

## Acceptance Criteria — verification

| Criterion | Expected | Actual | Status |
|-----------|----------|--------|--------|
| ConflictException in stream-profile.service.ts | ≥ 2 | 2 (import + throw) | ✓ |
| usedBy in stream-profile.service.ts | ≥ 2 | 3 (findMany result + map + throw) | ✓ |
| 'Reassign before deleting' in stream-profile.service.ts | = 1 | 1 | ✓ |
| onDelete: SetNull in schema.prisma (no change) | = 1 (baseline) | 1 (unchanged) | ✓ |
| affectedCameras in profile-form-dialog.tsx | ≥ 1 | 3 (response capture + branch + comment) | ✓ |
| toast.info in profile-form-dialog.tsx | ≥ 1 | 1 | ✓ |
| restartTriggered in camera-form-dialog.tsx | ≥ 1 | 4 (capture + branch + comment) | ✓ |
| 'Stream restarting with new profile' in camera-form-dialog.tsx | = 1 | 1 | ✓ |
| deleteUsedBy in tenant-stream-profiles-page.tsx | ≥ 4 | 6 (state + setter ×2 + ternary ×2 + map render) | ✓ |
| 'Reassign before deleting' in tenant-stream-profiles-page.tsx | = 1 | 1 | ✓ |
| status === 409 in tenant-stream-profiles-page.tsx | ≥ 1 | 1 | ✓ |
| Delete-protection vitest 0 fail / 0 todo | yes | 6 pass / 0 fail / 0 todo | ✓ |
| Toast vitest 0 fail / 0 todo | yes | 7 pass / 0 fail / 0 todo | ✓ |
| pnpm web build succeeds | yes | yes (Next.js 15) | ✓ |
| pnpm api build succeeds | yes | yes (SWC 161 files) | ✓ |

## Decisions Made

- **Option B over Option A** — service-layer pre-check throwing ConflictException, NOT a schema-level Restrict. Avoids the Prisma db push + generate + rebuild + restart workflow. Schema `onDelete: SetNull` preserved as defense-in-depth for the TOCTOU race window.
- **info severity for D-06 toast (not warning)** — the operation succeeded; a side effect happened. Info correctly signals "FYI, here's what's going on" without alarming the user.
- **Sibling `<ul>` instead of asChild** — AlertDialogDescription's underlying Radix primitive renders `<p>`. Nesting block-level children inside a `<p>` produces invalid HTML and was rejected by the Next.js type-check. Render the rich content as a sibling node between Description and Footer instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Bootstrapped worktree node_modules + .env.test**

- **Found during:** Pre-task setup
- **Issue:** Worktree `agent-ad465d17` lacked `node_modules/` and `apps/api/.env.test`; vitest would fail with "Failed to load url @prisma/client".
- **Fix:** Copied `apps/api/.env.test` from parent (gitignored), then `pnpm install --frozen-lockfile --prefer-offline` (~13s with pnpm cache + postinstall `prisma generate`).
- **Files modified:** None tracked in git.

**2. [Rule 3 — Blocking] AlertDialogDescription does not accept asChild**

- **Found during:** Task 21-05-T2 GREEN, `pnpm --filter @sms-platform/web build`
- **Issue:** Plan's prescribed `<AlertDialogDescription asChild>` with nested `<div>/<ul>` was rejected by Next.js type-check: `Property 'asChild' does not exist on type 'IntrinsicAttributes & Omit<DialogDescriptionProps, "ref"> & RefAttributes<HTMLParagraphElement>'`. The underlying Radix primitive renders `<p>`, and nesting block-level elements inside a `<p>` is invalid HTML anyway.
- **Fix:** Restructured the AlertDialog body — kept Description as plain text (with the conditional summary line), then rendered the rich `<ul>` of camera names as a sibling node between Description and Footer. Functionally equivalent (same content order, same hide-Delete-when-409 behavior), HTML now valid.
- **Files modified:** `apps/web/src/components/pages/tenant-stream-profiles-page.tsx`
- **Committed in:** `57d4914` (alongside the GREEN implementation — single commit keeps the structural fix tied to its motivation).

**3. [Rule 1 — Bug fix during testing] toast.success existing behavior pre-impl**

- **Found during:** Task 21-05-T2 RED execution — observed 4/7 tests already passing before implementation
- **Issue:** The "affectedCameras=0 → toast.success" test passed against the unmodified code because the existing `toast.success('Profile updated')` happened to match. This is NOT a bug — it's the test correctly pinning that "with affectedCameras=0, behavior stays unchanged." Filed as a deviation note to avoid future confusion: `RED state with N tests passing pre-impl means those tests assert PRESERVATION of existing behavior (which was the design intent).`
- **Fix:** None — RED state was correct. The 3 failing tests (info-branch cases) drove the implementation.
- **Files modified:** None.

---

**Total deviations:** 3 (1 setup-blocker, 1 type-error fix, 1 documentation-only). No scope creep, no architectural changes, no schema changes (Option B preserved).

## Deferred Issues

- The repo-wide `tsc --noEmit` reports the same 5 pre-existing TypeScript errors flagged in Plans 02-04 (avatar.controller.ts, cameras.controller.ts:58 PlaybackService null guard, cluster.gateway.ts, recordings/minio.service.ts, status.gateway.ts). None introduced by Plan 05. Out of scope per `<scope_boundary>` rule. Both `pnpm --filter @sms-platform/web build` and `pnpm --filter @sms-platform/api build` succeed cleanly.

## Next Plan Readiness

- **Plan 06 (regression suite + manual UAT)** is the final plan in Phase 21. With 21-05 closed:
  - All Wave 0 todos (61 backend + 7 frontend = 68 total) have been transitioned to passing assertions.
  - All decision contracts D-01 through D-11 have at least one regression test pinning them.
  - Manual UAT script can exercise: edit profile (toast info / success), reassign camera profile (toast info), delete unused profile (200), attempt delete with cameras attached (409 dialog with camera list), reassign cameras then retry delete (200).
- The B-1 collision guard from Plan 04 + the Plan 05 D-10 protection together close both the runtime jobId-collision gap AND the destructive-delete-without-confirmation gap that motivated Phase 21.

## Self-Check: PASSED

Verified all modified files exist on disk and all 4 task commits are present in git history:

- `apps/api/src/streams/stream-profile.service.ts` — MODIFIED (delete() now throws ConflictException)
- `apps/api/tests/streams/stream-profile-delete-protection.test.ts` — MODIFIED (6 passing, 0 todo)
- `apps/web/src/app/admin/stream-profiles/components/profile-form-dialog.tsx` — MODIFIED (toast.info branch wired)
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` — MODIFIED (sonner imported, restartTriggered handled)
- `apps/web/src/components/pages/tenant-stream-profiles-page.tsx` — MODIFIED (ApiError import + deleteUsedBy state + 409 catch + inline list)
- `apps/web/src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx` — MODIFIED (7 passing, 0 todo)

Commits: `6f94e21` (RED-1), `7f1be4b` (GREEN-1), `cffb9dd` (RED-2), `57d4914` (GREEN-2) — all FOUND in `git log`.

Verification:
- `pnpm exec vitest --run tests/streams/stream-profile-delete-protection.test.ts` → 6/6 passing, 0 failing, 0 todo, success: true.
- `pnpm exec vitest --run src/app/admin/stream-profiles/components/__tests__/profile-form-dialog-toast.test.tsx` → 7/7 passing.
- `npx vitest --run` over Plan 02-04 + Plan 05 backend suites → exit 0 (all green).
- `pnpm exec vitest --run` over camera-form-dialog suites → 26/26 passing.
- `pnpm --filter @sms-platform/web build` → Compiled successfully.
- `pnpm --filter @sms-platform/api build` → 161 files swc compiled.

---
*Phase: 21-hot-reload-stream-profile-changes-to-running-cameras*
*Plan: 05*
*Wave: 3*
*Completed: 2026-04-25*
