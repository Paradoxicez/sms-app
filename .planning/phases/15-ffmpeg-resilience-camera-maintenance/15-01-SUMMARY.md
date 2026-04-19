---
phase: 15
plan: 01
status: complete
wave: 1
subsystem: api
tags: [nestjs, bullmq, prisma, redis, vitest, maintenance-mode, debounce]

requires:
  - phase: 14
    provides: StatusService baseline + StatusGateway broadcast + WebhooksService.emitEvent + NotificationsService.createForCameraEvent
provides:
  - Camera schema columns for maintenance mode (maintenanceMode, maintenanceEnteredAt, maintenanceEnteredBy) + @@index([maintenanceMode])
  - camera-notify BullMQ queue + NotifyDispatchProcessor worker with dispatch-time re-check (maintenance + status drift)
  - StatusService.transition maintenance gate (D-15) that suppresses outbound notify/webhook while keeping DB update + StatusGateway broadcast live
  - StatusService.transition BullMQ-backed 30s debounce-by-replacement (jobId=camera:{cameraId}:notify)
  - Vitest coverage for debounce semantics (4 tests) + maintenance suppression at both service and processor layers (6 tests)
affects:
  - 15-02 ffmpeg resilience producers (camera-health, boot-recovery) — will call StatusService.transition and rely on the gate
  - 15-03 maintenance API (POST /cameras/:id/maintenance toggle) — flips maintenanceMode, gate in this plan does the suppression
  - 15-04 camera table UI — reads maintenanceMode to render the maintenance badge/state

tech-stack:
  added:
    - "@nestjs/bullmq camera-notify queue registration + NotifyDispatchProcessor (WorkerHost)"
  patterns:
    - "Debounce-by-replacement via deterministic BullMQ jobId (`camera:{id}:notify`) + getJob/remove/add with delay=30s"
    - "Dispatch-time re-validation in worker (re-reads Prisma camera to catch in-window maintenance toggles and status drift — Pitfall 3 mitigation)"
    - "Maintenance gate living inside the single status chokepoint (StatusService.transition) — all outbound notify/webhook routed through one guard (T-15-02 mitigation)"
    - "Broadcast + DB update run unconditionally; only outbound notify/webhook is gated (D-04 + D-15)"

files_modified:
  - apps/api/src/prisma/schema.prisma
  - apps/api/src/status/status.module.ts
  - apps/api/src/status/status.service.ts
  - apps/api/src/status/processors/notify-dispatch.processor.ts
  - apps/api/tests/status/debounce.test.ts
  - apps/api/tests/status/maintenance-suppression.test.ts
completed_at: 2026-04-19T01:35:08Z

key-files:
  created:
    - apps/api/src/status/processors/notify-dispatch.processor.ts
    - apps/api/tests/status/debounce.test.ts
    - apps/api/tests/status/maintenance-suppression.test.ts
  modified:
    - apps/api/src/prisma/schema.prisma
    - apps/api/src/status/status.service.ts
    - apps/api/src/status/status.module.ts

key-decisions:
  - "ใช้ prisma db push --skip-generate (ไม่ใช่ migrate dev) — project uses raw-SQL RLS migrations only, not Prisma-managed migration folders"
  - "ไม่ทำ foreign-key relation บน maintenanceEnteredBy — follow AuditLog.userId precedent (bare String?) per D-12 + Finding #8"
  - "Debounce-by-replacement แทน throttle: getJob(jobId) + remove + add ใหม่ทำให้เหตุการณ์ล่าสุดเท่านั้นที่ส่งออก (D-04)"
  - "Broadcast + DB update ยังคงทำงานระหว่าง maintenance — UI/state ต้อง live เสมอ; gate จำกัดแค่ notify+webhook (D-04 + D-15)"
  - "Processor re-reads maintenanceMode + status ที่ dispatch time — กันกรณี toggle เปลี่ยนค่าในช่วง 30s window (Pitfall 3)"

patterns-established:
  - "StatusModule ลงทะเบียน camera-notify queue + NotifyDispatchProcessor; Module ยังคง @Global ให้ผู้ใช้เดิมไม่ต้องแก้"
  - "Processor inject PrismaService (raw, non-tenant) แทน TENANCY_CLIENT — worker ไม่มี request context (Finding #5 / Pitfall 5)"
  - "NotificationsService inject ผ่าน forwardRef เพื่อกัน circular DI (ตามแพทเทิร์นที่มีอยู่แล้วใน status.service.ts)"

requirements-completed:
  - RESIL-03
  - CAM-02

duration: ~30 min (previous executor) + ~5 min (continuation verify + summary)
completed: 2026-04-19
---

# Phase 15 Plan 01: FFmpeg Resilience Foundation — Maintenance Gate + BullMQ Debounce Summary

**เพิ่ม maintenance columns ลงใน Camera schema พร้อม wire `camera-notify` BullMQ queue + `NotifyDispatchProcessor` และ refactor `StatusService.transition` ให้เป็น single chokepoint ที่ทั้ง gate maintenance และ debounce outbound notify/webhook 30 วินาทีแบบ replacement.**

## Performance

- **Duration:** ~30 min (main executor) + ~5 min (continuation verify + summary)
- **Started:** 2026-04-19 (main executor session, pre-timeout)
- **Completed:** 2026-04-19T01:35:08Z
- **Tasks:** 5 (ทั้งหมดเสร็จ)
- **Files modified/created:** 6

## Accomplishments

- เพิ่ม `maintenanceMode` (NOT NULL DEFAULT false), `maintenanceEnteredAt` (nullable timestamp), `maintenanceEnteredBy` (nullable text) + `@@index([maintenanceMode])` ใน Camera model; `prisma db push` applied; client regenerated
- สร้าง `camera-notify` BullMQ queue + `NotifyDispatchProcessor` (WorkerHost) ที่ re-read Prisma ที่ dispatch time กัน maintenance toggle และ status drift ระหว่าง 30s window
- Refactor `StatusService.transition` ให้: DB update + broadcast ทำเสมอ, maintenance gate สลัด notify/webhook, enqueue งาน delayed 30s พร้อม deterministic jobId `camera:{cameraId}:notify` (debounce-by-replacement)
- ลบการเรียก `emitEvent` / `createForCameraEvent` แบบ inline ออกจาก `StatusService.transition` — ย้ายไปที่ processor ทั้งหมด (T-15-02 chokepoint)
- Vitest ครอบคลุม: debounce.test.ts (4 tests) + maintenance-suppression.test.ts (6 tests) — รวม 10 tests ผ่านทั้งหมด

## Task Commits

1. **Task 1: Extend Camera Prisma model with maintenance columns + index** — `031672f` (feat)
2. **Task 2: Push Prisma schema to DB + regenerate client** — non-commit side-effect (verified re-run: `The database is already in sync with the Prisma schema.`; client regenerated OK)
3. **Task 3: Wire camera-notify queue + NotifyDispatchProcessor in StatusModule** — `3d4c44e` (feat)
4. **Task 4: StatusService maintenance gate + BullMQ debounce** — `f04d90a` (feat)
5. **Task 5: Vitest coverage — debounce + maintenance suppression** — `11b7ec6` (test)

_Plan metadata commit created at end of this continuation session._

## Files Created/Modified

- `apps/api/src/prisma/schema.prisma` — Camera model extended with 3 maintenance columns + `@@index([maintenanceMode])` (diff = +4 field lines + 1 index line, no deletions, no field reordering)
- `apps/api/src/status/status.service.ts` — Refactored `transition()` to be gate + debounce chokepoint; added `@InjectQueue('camera-notify')`; removed inline webhook + notification calls
- `apps/api/src/status/status.module.ts` — Registered `BullModule.registerQueue({ name: 'camera-notify' })`, added `NotifyDispatchProcessor` to providers, imported `PrismaModule`
- `apps/api/src/status/processors/notify-dispatch.processor.ts` — New BullMQ WorkerHost: re-reads camera, guards on deletion / maintenanceMode / status drift, delegates to WebhooksService + NotificationsService with per-call catch-and-log
- `apps/api/tests/status/debounce.test.ts` — 4 it-blocks: first-transition enqueue shape, replacement on second transition, non-notifiable status skip, no-op guard
- `apps/api/tests/status/maintenance-suppression.test.ts` — 6 it-blocks: service-level gate on (true/false), processor-level suppress on maintenance-at-dispatch / status-drift / camera-deleted, happy path emits camera.{status} + creates notification

## Schema Diff Applied

```diff
@@ -219,6 +219,10 @@ model Camera {
   retentionDays    Int?     // null = use org default (per D-10)
   isRecording      Boolean  @default(false)
 
+  maintenanceMode       Boolean   @default(false)
+  maintenanceEnteredAt  DateTime?
+  maintenanceEnteredBy  String?
+
   policy            Policy?
   playbackSessions  PlaybackSession[]
   recordings        Recording[]
@@ -226,6 +230,7 @@ model Camera {
   @@index([orgId])
   @@index([siteId])
   @@index([status])
+  @@index([maintenanceMode])
 }
```

**DB verification (continuation run):**
```
     column_name      |          data_type          | is_nullable | column_default
----------------------+-----------------------------+-------------+----------------
 maintenanceEnteredAt | timestamp without time zone | YES         |
 maintenanceEnteredBy | text                        | YES         |
 maintenanceMode      | boolean                     | NO          | false
```

## Queue + Dispatch Contract

- **Queue name:** `camera-notify`
- **jobId convention:** `` `camera:${cameraId}:notify` `` — deterministic per camera → debounce-by-replacement
- **Job options:** `{ delay: 30_000, removeOnComplete: true, removeOnFail: 10 }`
- **Job payload (`NotifyDispatchJobData`):** `{ orgId, cameraId, cameraName, newStatus, previousStatus }`
- **Processor guards (in order):** camera deleted → debug + return; `camera.maintenanceMode === true` → debug + return (Pitfall 3 / T-15-02); `camera.status !== newStatus` → debug + return (stale dispatch); otherwise `webhooksService.emitEvent(orgId, 'camera.' + newStatus, …)` + `notificationsService.createForCameraEvent(orgId, cameraId, newStatus, cameraName)`
- **Migration strategy confirmed:** `prisma db push` (ไม่ใช่ `migrate dev`) — project migrations/ folder มีแค่ raw-SQL RLS policies

## Key Links (as claimed in PLAN frontmatter)

- `apps/api/src/status/status.service.ts:77` → ``const jobId = `camera:${cameraId}:notify`;`` ✓
- `apps/api/src/status/processors/notify-dispatch.processor.ts:52` → ``.emitEvent(orgId, `camera.${newStatus}`, { … })`` ✓
- `apps/api/src/status/processors/notify-dispatch.processor.ts:65` → ``.createForCameraEvent(orgId, cameraId, newStatus, cameraName)`` ✓

## Decisions Made

- ใช้ `prisma db push` ไม่ใช่ `migrate dev` — ตรงตาม project pattern (migrations/ เก็บเฉพาะ raw-SQL RLS policies, package.json ไม่มี `migrate` script)
- ไม่สร้าง FK relation บน `maintenanceEnteredBy` — follow AuditLog.userId pattern (bare `String?`) ต่อ D-12 + Finding #8
- StatusService.transition เก็บ `webhooksService` + `notificationsService` ไว้ใน constructor แม้จะไม่ถูกเรียกแบบ inline แล้ว — เผื่อ public methods อื่นในอนาคต (ไม่กระทบ DI) + ยังคง forwardRef ตามแพทเทิร์นเดิม
- Processor ใช้ PrismaService แบบ raw ไม่ใช่ TENANCY_CLIENT — worker ไม่มี request context; RLS enforcement ไม่จำเป็นสำหรับ read-only lookup ที่ใช้ idรับเข้ามา

## Deviations from Plan

None — plan executed exactly as written. ไม่มี auto-fix ที่ต้องบันทึก

**Continuation note:** Executor ก่อนหน้าถูก stream-timeout หลังจากลงทั้ง 4 task commits แล้ว แต่ก่อนสร้าง SUMMARY. Continuation agent (session นี้) รัน prisma validate + db push + generate + vitest + tsc verify ซ้ำเพื่อ confirm state แล้วเขียน SUMMARY. ไม่มีการแก้ไข source code ใน continuation session.

## Issues Encountered

- Worktree `agent-a1a36683` ไม่มี `.env` และ `apps/api/.env` symlinks ตอนถูกสร้าง (parent repo มี `apps/api/.env -> ../../.env`). Continuation agent สร้าง symlinks ให้ใหม่เพื่อให้ Prisma หา `DATABASE_URL` เจอ. ไม่กระทบ source code.
- `pnpm --filter` เปลี่ยน cwd ไป `apps/api` ทำให้ `--schema=apps/api/src/prisma/schema.prisma` หาไฟล์ไม่เจอ; แก้ด้วย `--schema=src/prisma/schema.prisma` (สัมพัทธ์จาก apps/api). เป็น known pnpm/prisma quirk — ไม่ใช่ bug.

## Verification

### Automated

| Task | Requirement | Threat Ref | Automated Command | Status |
|------|-------------|-----------|-------------------|--------|
| 15-01-T1 | Schema | — | `prisma validate --schema=src/prisma/schema.prisma` | ✅ PASS (`The schema at src/prisma/schema.prisma is valid`) |
| 15-01-T2 | Schema push | — | `prisma db push --skip-generate && prisma generate` | ✅ PASS (`The database is already in sync with the Prisma schema.` + `Generated Prisma Client (v6.19.3)`) |
| 15-01-T3 | RESIL-03 | T-15-02 | file presence + grep (`@Processor('camera-notify')`, `extends WorkerHost`, `if (camera.maintenanceMode)`) | ✅ PASS (verified by tests below) |
| 15-01-T4 | RESIL-03 / CAM-02 | T-15-02 | file presence + grep (`if (camera.maintenanceMode)`, `` `camera:${cameraId}:notify` ``, `delay: 30_000`, `@InjectQueue('camera-notify')`) | ✅ PASS (verified by tests below) |
| 15-01-T5 | RESIL-03 / CAM-02 | T-15-02 | `pnpm --filter @sms-platform/api exec vitest run tests/status/debounce.test.ts tests/status/maintenance-suppression.test.ts` | ✅ **10/10 PASS** (debounce 4, maintenance-suppression 6) |

### Vitest results

```
Test Files  2 passed (2)
     Tests  10 passed (10)
  Duration  2.05s
```

### DB column verification (live PostgreSQL)

3 columns present with correct types/nullability/default (see table above).

### tsc --noEmit

4 pre-existing errors (all UNRELATED to plan 15-01):
- `src/cameras/cameras.controller.ts:54` — PlaybackService | null vs PlaybackService (Phase 13 optional DI)
- `src/cluster/cluster.gateway.ts:15` — `@WebSocketServer() server` strict property init (pre-existing gateway pattern)
- `src/recordings/minio.service.ts:9` — `client` strict property init (pre-existing MinIO lazy init)
- `src/status/status.gateway.ts:15` — `@WebSocketServer() server` strict property init (pre-existing; same pattern as cluster.gateway.ts)

ไม่มี error ที่ reference ไฟล์ที่ 15-01 แก้ไข (`status.service.ts`, `status.module.ts`, `notify-dispatch.processor.ts`, `schema.prisma`, test files) — confirmed via filtered grep. Logged to deferred-items as out-of-scope Phase 15 cleanup.

## Security Mitigations Delivered

- **T-15-02 (Tampering/Repudiation):** mitigated. `StatusService.transition` เป็น single chokepoint; inline webhook/notification calls ถูกลบทิ้ง; ทุก `camera.*` dispatch วิ่งผ่าน queue → processor; processor re-reads maintenanceMode ก่อน emit. Broadcast + DB update ยังทำงานโดยไม่กระทบกับ gate (audit path ไม่ถูกกระทบ — will be wired fully in 15-03).
- **Pitfall 3 (in-window toggle):** mitigated. Processor re-fetch camera จาก Prisma ที่ dispatch time; ถ้า `maintenanceMode` กลายเป็น true ระหว่าง 30s window → suppress (test case "suppresses on maintenance at dispatch time" — ผ่าน).

## Self-Check: PASSED

- [x] Task 1 commit `031672f` exists (`git log --all --grep="15-01"` shows all 4)
- [x] Task 3 commit `3d4c44e` exists
- [x] Task 4 commit `f04d90a` exists
- [x] Task 5 commit `11b7ec6` exists
- [x] `apps/api/src/prisma/schema.prisma` — 3 maintenance fields + index grepped ok
- [x] `apps/api/src/status/status.service.ts` — maintenance gate + jobId + delay 30_000 grepped ok
- [x] `apps/api/src/status/status.module.ts` — camera-notify queue registered + NotifyDispatchProcessor provider
- [x] `apps/api/src/status/processors/notify-dispatch.processor.ts` — @Processor('camera-notify') + WorkerHost + maintenanceMode guard + status-drift guard
- [x] `apps/api/tests/status/debounce.test.ts` — 4 tests pass
- [x] `apps/api/tests/status/maintenance-suppression.test.ts` — 6 tests pass
- [x] DB has 3 maintenance columns with correct types (live psql check)
- [x] No new tsc errors referencing plan 15-01 files

## Next Phase Readiness

- **Ready for 15-02 (FFmpeg resilience producers):** camera-health tick + boot-recovery workflows can now safely call `StatusService.transition()` — the gate + debounce are in place, so reconnect storms won't flood notify/webhook and maintenance cameras won't alert on flap.
- **Ready for 15-03 (maintenance API):** API layer can flip `camera.maintenanceMode = true/false` and the gate here handles suppression immediately. 15-03 owns the endpoint + audit log write for the toggle itself.
- **Ready for 15-04 (camera table UI):** UI can read `maintenanceMode` from Prisma Client (type exposed); rendering the badge is trivial.

---
*Phase: 15-ffmpeg-resilience-camera-maintenance*
*Plan: 01*
*Completed: 2026-04-19*
