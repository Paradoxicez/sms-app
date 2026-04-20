---
phase: quick-260420-nmu
plan: 01
subsystem: api/status
tags: [rls, multi-tenancy, background-worker, bullmq, hotfix]
requires:
  - apps/api/src/prisma/system-prisma.service.ts
  - apps/api/src/prisma/prisma.module.ts
provides:
  - "StatusService.transition() callable from background workers (no CLS ORG_ID required)"
affects:
  - apps/api/src/streams/processors/stream.processor.ts (caller — no code change, but now succeeds)
  - apps/api/src/resilience/boot-recovery.service.ts (re-enqueue path now reaches `online`)
tech-stack:
  added: []
  patterns:
    - "SystemPrismaService (RLS bypass) + explicit `{ id, orgId }` scoping for defense-in-depth"
key-files:
  created: []
  modified:
    - apps/api/src/status/status.service.ts
decisions:
  - "Mirror commit 8ea20f7 (boot-recovery.service.ts) pattern: SystemPrismaService + explicit orgId in `where`. Same precedent already used for REC-01 `getRecording`."
  - "Keep `update({ where: { id: cameraId } })` unchanged — Prisma `update` requires a unique where; cross-org rejection is enforced by the preceding `findFirst({ where: { id, orgId } })` returning null."
  - "Preserve the existing `Camera ${cameraId} not found` error message so StreamProcessor's error-handling path is unchanged."
metrics:
  duration: ~5min (Task 1 edit + tsc) + human-verify gate
  completed: 2026-04-20
requirements:
  - QUICK-RLS-FIX-01
---

# Quick 260420-nmu: Fix StatusService RLS regression — use SystemPrismaService

## Objective (1-line)

Patch the Phase 15 RLS regression in `StatusService` missed by commit 8ea20f7 — background workers (StreamProcessor, boot-recovery) call `transition()` outside an HTTP request, so the CLS-bound `ORG_ID` was never set, the tenancy extension skipped `set_config`, RLS returned 0 rows, and the service threw `Camera ${id} not found` causing BullMQ retry exhaustion (cam1 stuck at 9 failed attempts).

## Task 1 Diff

`apps/api/src/status/status.service.ts` — 3 functional lines changed (plus import swap):

```diff
-import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
-import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
+import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
+import { SystemPrismaService } from '../prisma/system-prisma.service';

   constructor(
-    @Inject(TENANCY_CLIENT) private readonly prisma: any,
+    private readonly prisma: SystemPrismaService,
     private readonly statusGateway: StatusGateway,
     ...
   ) {}

   async transition(cameraId: string, orgId: string, newStatus: string): Promise<void> {
-    const camera = await this.prisma.camera.findUnique({ where: { id: cameraId } });
+    const camera = await this.prisma.camera.findFirst({ where: { id: cameraId, orgId } });
     if (!camera) {
       throw new Error(`Camera ${cameraId} not found`);
     }
```

Everything else (validTransitions table, no-op short-circuit, statusGateway broadcast, maintenance gate, debounced notify queue, viewer count maps, `update({ where: { id: cameraId } })` call) is byte-for-byte unchanged.

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/status/status.service.ts` | Swap `TENANCY_CLIENT` (RLS-scoped, request-bound) for `SystemPrismaService` (RLS-bypass) + explicit `{ id, orgId }` scoping in the camera read |

No module wiring changes — `PrismaModule` is `@Global()` and already exports `SystemPrismaService`.

## Commits

- `49adac6` — `fix(quick-260420-nmu-01): use SystemPrismaService in StatusService for background-worker safety`

## Verification (Task 2 — human-verify gate, approved)

End-to-end runtime verification on cam1 (`ba416508-09fa-4e5f-9278-cca508e3c5c3`) after the fix landed on main:

**Setup steps executed by orchestrator:**
1. Cleared cam1's stuck BullMQ job (`atm=11`, `processedOn=1776679488674`) via `redis-cli DEL` + `ZREM bull:stream-ffmpeg:delayed`.
2. Set `Camera.status = 'connecting'` so boot-recovery would re-enqueue it.
3. Triggered API restart (touch + revert `apps/api/src/status/status.service.ts` → nest watch reloaded).
4. Waited 10s for boot-recovery jitter.

**Results — all PASS:**

| Check | Expected | Observed |
|-------|----------|----------|
| `Camera.status` | `online` | `online` (transitioned `connecting` → `online` via the fixed `transition()`) |
| `Camera.lastOnlineAt` | within last minute | `2026-04-20 10:09:26.201` (was NULL — never online before fix) |
| FFmpeg spawn | RTSP→RTMP process running for cam1 | PID `78199`: `/opt/homebrew/bin/ffmpeg -rtsp_transport tcp -i rtsp://root:***@hfd09b7jy9k.sn.mynetname.net:20091/axis-media/media.amp?resolution=1280x720 -acodec copy -vcodec copy -f flv … rtmp://localhost:1935/live/81099e7e-376f-4f78-9a0e-ce3addb8dd50/ba416508-09fa-4e5f-9278-cca508e3c5c3` |
| SRS receiving stream | `publish.active: true`, non-zero recv bytes | `recv_bytes: 5077423`, `publish.active: true`, stream name matches `cameraId` |
| API logs | NO `Camera … not found` after restart | Confirmed clean — no false-negative errors |
| BullMQ job state | active processing (lock present) | Job key now has `:lock` suffix (active, not failed) |

**Stream is intentionally still running** — left as-is for further UAT of phase 17 live-preview / recording flow per orchestrator instruction. Do not stop.

## Threat Model Closure

**T-RLS-01 (Tampering / Information Disclosure on `StatusService` Camera read/update)** — **mitigated**.

This file is now consistent with the rest of the codebase's commit `8ea20f7` pattern (`boot-recovery.service.ts`) and the REC-01 `getRecording` fix:

- **RLS-bypass connection** via `SystemPrismaService` (DB superuser, `rolbypassrls=true`) — required because background workers have no CLS `ORG_ID` context.
- **Defense-in-depth tenant scoping** via `findFirst({ where: { id: cameraId, orgId } })` — a foreign `orgId` returns `null` and the existing `not found` throw fires before any update runs, so cross-org transitions remain impossible.

**T-RLS-STATUS-01** (cross-org `transition()` call) — mitigated by the same `{ id, orgId }` `findFirst`.
**T-RLS-STATUS-02** (BullMQ retry exhaustion via false-negative `not found`) — mitigated; cam1 succeeded on the first post-patch attempt (verification evidence above).

The verifier confirmed via the cam1 `connecting → online` transition that the background worker successfully transitioned camera status without any CLS `ORG_ID` context, proving the SystemPrismaService bypass works end-to-end.

## Deviations from Plan

None — plan executed exactly as written. Task 1 applied the 3-line change; Task 2 (human-verify checkpoint) was approved on the first verification pass with all PASS criteria met.

## Self-Check: PASSED

- File `apps/api/src/status/status.service.ts` exists and matches plan: `SystemPrismaService` imported (line 4), constructor injects `private readonly prisma: SystemPrismaService` (line 23), `transition()` uses `findFirst({ where: { id: cameraId, orgId } })` (line 32). No `TENANCY_CLIENT` references remain.
- Commit `49adac6` recorded as the Task 1 commit hash.
- Runtime verification evidence captured directly from orchestrator (cam1 `online` + `lastOnlineAt` fresh + FFmpeg PID 78199 + SRS `recv_bytes: 5077423`).
