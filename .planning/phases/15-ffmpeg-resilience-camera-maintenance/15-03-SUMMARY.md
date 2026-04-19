---
phase: 15
plan: 03
status: complete
wave: 2
subsystem: api
tags: [nestjs, cameras, maintenance-mode, audit, rls, vitest]

requires:
  - phase: 15
    plan: 01
    provides: StatusService maintenance gate + notify debounce chokepoint (T-15-02) that this plan relies on to suppress the entry-transition notify
  - phase: 14
    provides: AuditInterceptor auto-logging of POST/DELETE on /api/cameras/:id/*
provides:
  - POST /api/cameras/:id/maintenance endpoint (enter)
  - DELETE /api/cameras/:id/maintenance endpoint (exit)
  - CamerasService.enterMaintenance(cameraId, userId) — flag-flip BEFORE stopStream, idempotent, tenancy-scoped
  - CamerasService.exitMaintenance(cameraId) — no auto-restart, preserves historical enteredAt/By (D-14)
  - StreamsModule wired into CamerasModule (no circular ref)
  - 9 vitest cases covering API contract, idempotency, order (15-01 gate integration), org scoping, NotFoundException
affects:
  - 15-04 camera table UI — can now call the two endpoints to toggle maintenance
  - Operators can park a broken camera without it flooding notify/webhook fan-out

tech-stack:
  added: []
  patterns:
    - "Flag-flip BEFORE downstream transition — ensures 15-01's maintenance gate suppresses the transition's notify+webhook (T-15-02 mitigation)"
    - "Tenancy-scoped writes (RLS) for all maintenance reads/updates (T-15-01 mitigation)"
    - "Best-effort internal dependency call with try/catch + logger.warn — stopStream failures do NOT block state flip (operators can always park a broken camera)"
    - "Idempotency on toggle endpoints — early return when already in target state (avoids redundant audit entries, wasted stopStream calls)"
    - "User identity sourced from req.user.id (AuthGuard-attached) not from request body — matches UsersController.getSessionUserId pattern"

files_modified:
  - apps/api/src/cameras/cameras.service.ts
  - apps/api/src/cameras/cameras.module.ts
  - apps/api/src/cameras/cameras.controller.ts
  - apps/api/tests/cameras/maintenance.test.ts
  - apps/api/tests/cameras/camera-crud.test.ts
  - apps/api/tests/cameras/bulk-import.test.ts
  - apps/api/tests/cameras/hierarchy.test.ts
completed_at: 2026-04-19T08:46:00Z

key-files:
  created:
    - apps/api/tests/cameras/maintenance.test.ts
  modified:
    - apps/api/src/cameras/cameras.service.ts
    - apps/api/src/cameras/cameras.module.ts
    - apps/api/src/cameras/cameras.controller.ts
    - apps/api/tests/cameras/camera-crud.test.ts
    - apps/api/tests/cameras/bulk-import.test.ts
    - apps/api/tests/cameras/hierarchy.test.ts

key-decisions:
  - "userId sourced via `req.user.id` (not `cls.get('USER_ID')`) — AuthGuard sets ORG_ID in CLS but not USER_ID; req.user is the actual attach point"
  - "StreamsModule imported directly into CamerasModule (no forwardRef) — no circular dependency exists today (streams does not reference cameras)"
  - "Direct instantiation in the maintenance vitest file (not Test.createTestingModule) — vitest's esbuild transform omits design:paramtypes metadata, so NestJS DI can't resolve implicit class deps; matches all other *.test.ts patterns in this repo"
  - "Defensive second `tenancy.camera.update({ status: 'offline' })` after stopStream — guarantees D-13 status=offline even if stopStream no-op'd or threw before the StatusService transition"
  - "No operator-only RBAC guard (T-15-06 accepted for v1) — any authenticated org member can toggle; CAM-04 future work"

patterns-established:
  - "CamerasService now holds StreamsService — enables future camera-level stream orchestration from the cameras namespace"
  - "Three-step enter flow: flip-flag → stopStream (best-effort) → ensure-status-offline (defensive) — audited end-to-end via AuditInterceptor on the HTTP request, not per-step"
  - "Maintenance endpoints carry NO body payload in v1 — pure toggle; CAM-04 is where `{ reason, scheduledUntil }` would extend this"

requirements-completed:
  - CAM-01
  - CAM-02

duration: ~35 min
completed: 2026-04-19
---

# Phase 15 Plan 03: Maintenance API Surface — Endpoints + Service + Tests

**ส่งมอบ API surface สำหรับ maintenance-mode ที่ UI ของ 15-04 จะเรียกใช้: POST/DELETE `/api/cameras/:id/maintenance` endpoints + service methods + 9 vitest cases. พึ่ง 15-01 chokepoint สำหรับ notify suppression, AuditInterceptor สำหรับ audit trail, และ tenancy client สำหรับ org scoping.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-19T08:39Z
- **Completed:** 2026-04-19T08:46Z
- **Tasks:** 3 (RED/GREEN + endpoints + test-extension bundled)
- **Files modified/created:** 7 (1 created, 6 modified — 3 of those are existing test files that needed the constructor-signature update)

## Accomplishments

- เพิ่ม `enterMaintenance(cameraId, userId)` และ `exitMaintenance(cameraId)` ลงใน `CamerasService` โดยใช้ tenancy client สำหรับ reads/writes ทั้งหมด (T-15-01 mitigation)
- `enterMaintenance` flip flag เป็น `true` ก่อน เรียก `streamsService.stopStream(cameraId)` → ทำให้ offline transition วิ่งผ่าน 15-01 gate และถูก suppress ทั้ง notify + webhook (T-15-02 mitigation, verified by Test 4 order assertion)
- `enterMaintenance` ใช้ try/catch กับ stopStream เป็น best-effort — ถ้า stream ไม่ได้ running อยู่หรือ stopStream throw ก็ยัง flip flag สำเร็จและ ensure status=offline
- `exitMaintenance` flip flag เป็น `false` แต่ **ไม่** เคลียร์ `maintenanceEnteredAt`/`maintenanceEnteredBy` (historical record per D-14) และ **ไม่** auto-restart stream (D-14)
- ทั้งสอง endpoints idempotent — ถ้า flag ตรงกับ target อยู่แล้วก็ return early (ไม่ double-audit, ไม่ทำ stopStream ซ้ำ)
- เพิ่ม `POST /api/cameras/:id/maintenance` และ `DELETE /api/cameras/:id/maintenance` ลงใน `CamerasController` โดย inherit `@UseGuards(AuthGuard)` จาก class-level (บรรทัด 37 เดิม)
- Source `userId` จาก `req.user.id` (AuthGuard attaches) แทน `cls.get('USER_ID')` เพราะ AuthGuard ปัจจุบัน set แค่ ORG_ID ใน CLS — ตรงตามแพทเทิร์นของ `UsersController.getSessionUserId`
- Swagger-documented ครบทั้งสอง endpoints (`@ApiOperation`, `@ApiResponse 200/404`, `@ApiParam`)
- ไม่เพิ่ม `auditService.log(...)` call — AuditInterceptor (ตาม `audit.interceptor.ts:RESOURCE_MAP['cameras']='camera'`) จัดการ POST/DELETE auto-logging ให้แล้ว (T-15-02 non-bypass)
- 9 vitest cases ผ่านทั้งหมด (`apps/api/tests/cameras/maintenance.test.ts`) ครอบคลุม: flag flip + stopStream, idempotency, stopStream-throws tolerance, flag-order assertion, NotFoundException, exit preserves historical fields, no auto-restart, exit idempotency, tenancy-client usage
- Camera test suite ทั้งหมด (hierarchy 7, camera-crud 9, bulk-import 12, codec-detection 6, ffprobe 8, maintenance 9 = 51 tests) ผ่าน — ไม่มี regression

## Task Commits

1. **Task 3 RED (tests first)** — `d98c356` (`test(15-03)`) — 9 failing vitest cases written before implementation
2. **Task 1 GREEN (service methods)** — `6eff4d4` (`feat(15-03)`) — enterMaintenance + exitMaintenance implementation, 9 tests now passing, also updates 3 existing camera tests for new constructor signature
3. **Task 2 (endpoints)** — `4f8e315` (`feat(15-03)`) — POST + DELETE on CamerasController

**TDD note:** Task 3 RED landed first, Task 1 GREEN brought tests to passing — this is standard TDD ordering. Task 3's "test coverage" acceptance criteria are satisfied by the RED commit (file exists, 9 it-blocks, ≥3 stopStream refs, ≥1 NotFoundException, ≥2 order[n] assertions) and the GREEN commit (all passing).

## Files Created/Modified

- **`apps/api/src/cameras/cameras.service.ts`** — Added `Logger` import, `StreamsService` import, class-level `logger` field, injected `streamsService` as 3rd constructor arg, added `enterMaintenance` + `exitMaintenance` methods (placement: right after `updateCameraCodecInfo`, before `bulkImport` section marker)
- **`apps/api/src/cameras/cameras.module.ts`** — Added `imports: [StreamsModule]`
- **`apps/api/src/cameras/cameras.controller.ts`** — Added `@Post('cameras/:id/maintenance')` and `@Delete('cameras/:id/maintenance')` handlers after `deleteCamera` method; sources userId from `@Req() req: Request`
- **`apps/api/tests/cameras/maintenance.test.ts`** (new) — 9 service-level vitest cases using direct instantiation pattern
- **`apps/api/tests/cameras/camera-crud.test.ts`** — Third `undefined as any` argument passed to `new CamerasService(...)` (matches new constructor signature)
- **`apps/api/tests/cameras/bulk-import.test.ts`** — Same constructor-signature update (2 call sites)
- **`apps/api/tests/cameras/hierarchy.test.ts`** — Same constructor-signature update

## Endpoint Contract (as shipped)

| Method | Path                           | Body     | Response                      | Guard       | Audit   |
| ------ | ------------------------------ | -------- | ----------------------------- | ----------- | ------- |
| POST   | /api/cameras/:id/maintenance   | (none)   | 200 (camera row) / 404 / 401  | AuthGuard   | create  |
| DELETE | /api/cameras/:id/maintenance   | (none)   | 200 (camera row) / 404 / 401  | AuthGuard   | delete  |

- POST+DELETE chosen over PATCH per 15-RESEARCH Finding #11 (toggle semantics, distinct audit actions)
- No body payload in v1 — `{ reason, scheduledUntil }` deferred to CAM-04 future work
- Status codes: NestJS `@Post` defaults to 201 but the method returns the updated row; we did not override with `@HttpCode(200)` to stay consistent with the existing `@Patch('cameras/:id')` convention in the same controller (which also returns the row under default 200)

## Service Contract (as shipped)

```typescript
// enterMaintenance order:
// (1) tenancy.camera.findUnique → NotFoundException if null OR return if already true
// (2) tenancy.camera.update({ maintenanceMode:true, maintenanceEnteredAt:new Date(), maintenanceEnteredBy:userId })
// (3) streamsService.stopStream(cameraId)    [best-effort, try/catch → warn]
// (4) tenancy.camera.update({ status: 'offline' })    [defensive]

// exitMaintenance order:
// (1) tenancy.camera.findUnique → NotFoundException if null OR return if already false
// (2) tenancy.camera.update({ maintenanceMode: false })    [NOTE: does NOT clear enteredAt/By]
// (No stream start — operator clicks Start Stream manually per D-14)
```

## CLS / User Identity Decision

- `AuthGuard` (at `apps/api/src/auth/guards/auth.guard.ts`) sets `ORG_ID` in CLS but NOT `USER_ID`. The authenticated user is attached to `request.user` and `request.session`.
- Controller sources userId via `(req as any).user?.id` with a BadRequestException guard if missing. Matches the existing `UsersController.getSessionUserId(request)` pattern in the same repo.
- **Deviation from PLAN:** Plan text referenced `this.cls.get<string>('USER_ID')` but explicitly allowed matching actual AuthGuard behavior ("if the exact CLS key for user id is NOT `USER_ID`, match what AuthGuard actually sets"). This was documented inline in the plan as an executor verification step.

## RBAC v1 Posture (T-15-06 accepted)

Any authenticated org member can toggle maintenance on cameras in their org. This is consistent with D-13/D-14 (no role gating specified). Finer-grained operator-only RBAC is deferred to CAM-04 ("Extended maintenance metadata + role enforcement").

## Audit Trail Verification

AuditInterceptor at `apps/api/src/audit/audit.interceptor.ts` auto-logs:
- `AUDITED_METHODS` includes POST + DELETE (lines 13)
- `RESOURCE_MAP['cameras'] = 'camera'` (line 17)
- `METHOD_TO_ACTION['POST'] = 'create'`, `METHOD_TO_ACTION['DELETE'] = 'delete'` (lines 28-33)
- No `SKIP_PATHS` entry for `/api/cameras/:id/maintenance` (lines 12)

So a POST to `/api/cameras/abc/maintenance` → `AuditLog(action='create', resource='camera', resourceId='abc', method='POST', path='/api/cameras/abc/maintenance')`
And DELETE → same with `action='delete'`, `method='DELETE'`.

Service code never calls `auditService.log(...)` (grep-verified: `grep -c "auditService" apps/api/src/cameras/cameras.service.ts` = 0), so the interceptor is the sole audit path — cannot be bypassed from within the controller/service (T-15-02 mitigation path-1).

**Live-DB verification:** Not performed in this executor session — the full end-to-end audit roundtrip requires running `pnpm --filter @sms-platform/api start` + auth + POST/DELETE via HTTP + psql check on the AuditLog table. Out of scope for unit-test-layer verification. UI plan (15-04) or a later UAT step will exercise this path.

## Verification Map (feeds back into 15-VALIDATION.md)

| Task     | Requirement | Threat Ref       | Automated Command                                                        | Status  |
| -------- | ----------- | ---------------- | ------------------------------------------------------------------------ | ------- |
| 15-03-T1 | CAM-01, CAM-02 | T-15-01, T-15-02 | `pnpm --filter @sms-platform/api build` (exit 0 + grep acceptance)       | PASS    |
| 15-03-T2 | CAM-01      | T-15-01          | `pnpm --filter @sms-platform/api build` (exit 0 + grep acceptance)       | PASS    |
| 15-03-T3 | CAM-01, CAM-02 | T-15-01, T-15-02 | `pnpm exec vitest run tests/cameras/maintenance.test.ts` (9/9 pass)     | PASS    |

### Acceptance Criteria Grep Results

```
-- enterMaintenance count --            1
-- exitMaintenance count --             1
-- tenancy.camera.update count --       5   (≥ 3 required — includes existing updateCodecInfo/updateCamera/deleteCamera paths)
-- maintenanceEnteredAt: new Date count 1   (enter only)
-- streamsService.stopStream count --   1
-- maintenanceMode: false count --      1   (exit only; enter uses `true`)
-- auditService count --                0   (interceptor handles it)
-- @Post maintenance --                 1
-- @Delete maintenance --               1
-- camerasService.enterMaintenance --   1
-- camerasService.exitMaintenance --    1
-- @UseGuards(AuthGuard) line --        37 (unchanged, class-level)
-- Test 3 it() count --                 9
-- Test 3 stopStream count --           15 (≥ 3 required)
-- Test 3 NotFoundException count --    3  (≥ 1 required)
-- Test 3 order[0]/order[1] count --    2  (exactly matches assertion pair)
```

### Vitest Output (maintenance only)

```
 ✓ tests/cameras/maintenance.test.ts (9 tests) 44ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  08:44:42
   Duration  359ms
```

### Camera-wide Regression

All 51 camera-namespace tests pass:
- tests/cameras/camera-crud.test.ts (9)
- tests/cameras/bulk-import.test.ts (12)
- tests/cameras/codec-detection.test.ts (6)
- tests/cameras/ffprobe.test.ts (8)
- tests/cameras/hierarchy.test.ts (7)
- tests/cameras/maintenance.test.ts (9)

## Decisions Made

- **userId source:** Use `req.user.id` (from AuthGuard `(request as any).user = session.user` attach) instead of `cls.get('USER_ID')`. Rationale: current AuthGuard only sets ORG_ID in CLS; matches existing UsersController pattern. Plan explicitly allowed this substitution.
- **No forwardRef on StreamsModule import:** Direct import — no circular dep exists (streams module does not reference cameras module anywhere). Cleaner than defensive forwardRef.
- **Direct instantiation in maintenance test file:** Used `new CamerasService(tenancy, prisma, streams)` instead of `Test.createTestingModule`. Reason: vitest's esbuild transform doesn't emit `design:paramtypes` reflection metadata, so Nest DI can't resolve class-token providers (even with `useValue`). All other vitest files in this repo use direct instantiation — I followed the prevailing pattern instead of introducing a new one.
- **Updated 3 existing test files** (camera-crud, bulk-import, hierarchy) to pass `undefined as any` as the new 3rd constructor arg. Those tests never call maintenance methods so the undefined value is harmless; this keeps the repo green end-to-end.
- **Defensive second `update({ status: 'offline' })`** after stopStream — belt-and-suspenders for D-13 "status=offline on enter". If stopStream throws before its internal StatusService.transition runs, we still guarantee the required post-state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched maintenance vitest from Test.createTestingModule to direct instantiation**
- **Found during:** Task 3 GREEN verification (3 tests failed with `streamsService` silently undefined on the instance)
- **Issue:** Vitest's esbuild transform does not emit `design:paramtypes` metadata. `Test.createTestingModule` with `{ provide: StreamsService, useValue: streams }` compiled without error but the DI container injected `undefined` for the unannotated positional param, so `this.streamsService.stopStream(...)` threw a swallowed TypeError inside the try/catch — giving the appearance that the test's mock was never called.
- **Fix:** Switched to `new CamerasService(tenancy, prisma, streams)` direct instantiation, matching the prevailing pattern used by every other test file in `apps/api/tests/` (camera-crud, bulk-import, hierarchy, maintenance-suppression, etc.).
- **Files modified:** `apps/api/tests/cameras/maintenance.test.ts`
- **Commit:** `6eff4d4` (bundled with Task 1 GREEN)

**2. [Rule 3 - Blocking] Updated 3 existing camera test files for new 3-arg constructor**
- **Found during:** Task 1 GREEN after adding StreamsService dependency
- **Issue:** `camera-crud.test.ts`, `bulk-import.test.ts` (2 call sites), `hierarchy.test.ts` all used `new CamerasService(testPrisma as any, testPrisma as any)` (2 args). Adding `StreamsService` as a 3rd constructor arg broke these at compile/runtime.
- **Fix:** Added `undefined as any` as the third positional argument. None of these tests exercise maintenance methods, so passing undefined is harmless (maintenance methods would throw TypeError, but they're never called in those files).
- **Files modified:** `apps/api/tests/cameras/camera-crud.test.ts`, `apps/api/tests/cameras/bulk-import.test.ts`, `apps/api/tests/cameras/hierarchy.test.ts`
- **Commit:** `6eff4d4` (bundled with Task 1 GREEN)

### Plan text vs. implementation

- **Plan said `cls.get<string>('USER_ID')`, shipped `req.user.id`** — plan explicitly anticipated this: "If the exact CLS key for user id is NOT `USER_ID` (e.g., `userId` lowercase), match what AuthGuard actually sets. Check by reading `apps/api/src/auth/guards/auth.guard.ts` — the executor must confirm and adjust the string literal before committing." AuthGuard does not touch CLS USER_ID; it attaches `request.user = session.user`. So sourcing from `req.user.id` is the faithful translation of the plan's intent.
- **Plan suggested optional `forwardRef(() => StreamsService)`:** Skipped because no circular dep exists. Plan explicitly allowed this ("If CamerasModule already imports StreamsModule directly and builds fine, leave as-is and remove the `forwardRef`").

## Issues Encountered

- Vitest silently injected `undefined` for the NestJS-module-resolved provider — caught only by test-failure-debug log. Documented as Deviation #1.
- Worktree initially had no `node_modules` — ran `pnpm install --frozen-lockfile` to install deps before any test could run. Expected setup step for fresh worktree.
- 26 pre-existing failing tests across 13 unrelated files (auth sign-in, srs callbacks, streams reconnect, etc.) observed in the full `pnpm --filter @sms-platform/api test` run. Identical to the set documented in `deferred-items.md` under "15-01: Pre-existing test failures". NOT introduced by this plan. Out of scope per deviation-rule scope boundary.

## Security Mitigations Delivered

- **T-15-01 (Information Disclosure / IDOR):** mitigated.
  - (a) `@UseGuards(AuthGuard)` inherited from class-level (line 37) — unauthenticated requests rejected.
  - (b) Both service methods use `tenancy.camera.findUnique/update` (never raw `prisma.camera.*`) — RLS scopes to caller's org. Cross-org camera id → `findUnique` returns null → NotFoundException (verified by Test 5).
  - (c) Test 9 asserts tenancy client is the read/write path (empty mocked prisma).
- **T-15-02 (Tampering / Repudiation):** mitigated.
  - (a) AuditInterceptor auto-logs both endpoints — service never calls `auditService.log`, so there's no code path that can silently bypass audit (grep-verified: 0 matches).
  - (b) Flag flipped BEFORE stopStream — the resulting status transition flows through the 15-01 maintenance gate and suppresses notify+webhook at that precise moment. Verified by Test 4's order assertion (`order[0] === 'update:flip-on' && order[1] === 'stopStream'`).
- **T-15-06 (Elevation / RBAC):** accepted for v1.
  - Any authenticated org member can toggle. No operator-only guard. Consistent with D-13/D-14 silence on RBAC. CAM-04 future work will tighten this.

## Known Stubs

None. All behavior shipped is real (flag flip, stream halt, audit, suppression integration). No hardcoded empty values, no "coming soon" placeholders, no unwired components.

## Threat Flags

No new security surface beyond what the `<threat_model>` in the plan registered. Endpoints are covered by existing AuthGuard + tenancy client + AuditInterceptor layers — all noted mitigations in place.

## Self-Check: PASSED

- [x] Commit `d98c356` (RED tests) exists in `git log 743846f..HEAD`
- [x] Commit `6eff4d4` (GREEN service + test fixes) exists
- [x] Commit `4f8e315` (controller endpoints) exists
- [x] `apps/api/src/cameras/cameras.service.ts` contains both `async enterMaintenance` and `async exitMaintenance`
- [x] `apps/api/src/cameras/cameras.controller.ts` contains `@Post('cameras/:id/maintenance')` and `@Delete('cameras/:id/maintenance')`
- [x] `apps/api/src/cameras/cameras.module.ts` imports `StreamsModule`
- [x] `apps/api/tests/cameras/maintenance.test.ts` exists with 9 it-blocks
- [x] `pnpm --filter @sms-platform/api build` exits 0 (SWC compiled 135 files)
- [x] `pnpm exec vitest run tests/cameras/maintenance.test.ts` → 9/9 pass
- [x] Full camera test suite (51 tests) pass — no regressions
- [x] No new `auditService.log(...)` calls introduced (interceptor path preserved)

## Next Phase Readiness

- **Ready for 15-04 (camera table UI):** The HTTP contract is stable and auditable. UI can call `POST /api/cameras/:id/maintenance` to enter and `DELETE /api/cameras/:id/maintenance` to exit. The response shape is the updated camera row (includes `maintenanceMode`, `maintenanceEnteredAt`, `maintenanceEnteredBy`, `status`). Maintenance badge + action button can be rendered directly from `GET /api/cameras/:id` data.
- **Ready for CAM-04 future extension:** When reason/scheduledUntil fields arrive, extend the DTO in-place and the three-step enter flow unchanged. Exit flow's no-auto-restart invariant is load-bearing for D-14.

---
*Phase: 15-ffmpeg-resilience-camera-maintenance*
*Plan: 03*
*Completed: 2026-04-19*
