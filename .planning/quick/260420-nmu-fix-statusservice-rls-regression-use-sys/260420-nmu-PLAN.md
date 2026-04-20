---
phase: quick-260420-nmu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/status/status.service.ts
autonomous: false
requirements:
  - QUICK-RLS-FIX-01
user_setup: []

must_haves:
  truths:
    - "StatusService.transition() succeeds when invoked from a background worker (no CLS ORG_ID context)."
    - "StreamProcessor's call `await this.statusService.transition(cameraId, orgId, 'connecting')` no longer throws `Camera ${id} not found` for a valid camera."
    - "StatusService still scopes by `orgId` when reading/updating the Camera row (defense-in-depth: a foreign orgId cannot transition another org's camera)."
    - "API request paths that already worked (e.g., manual stop) continue to work with no behavioural change."
    - "cam1 (ba416508-09fa-4e5f-9278-cca508e3c5c3) goes through the full transition `offline -> connecting -> online` after re-enqueue, FFmpeg spawns, SRS receives the stream, and `Camera.lastOnlineAt` updates."
  artifacts:
    - path: "apps/api/src/status/status.service.ts"
      provides: "StatusService now injects SystemPrismaService (RLS-bypass) and reads/updates Camera scoped by `{ id, orgId }`."
      contains: "SystemPrismaService"
  key_links:
    - from: "apps/api/src/status/status.service.ts"
      to: "apps/api/src/prisma/system-prisma.service.ts"
      via: "constructor injection (`private readonly prisma: SystemPrismaService`)"
      pattern: "SystemPrismaService"
    - from: "apps/api/src/status/status.service.ts"
      to: "Camera RLS bypass"
      via: "findFirst({ where: { id: cameraId, orgId } }) + update({ where: { id: cameraId } })"
      pattern: "findFirst\\(\\{\\s*where:\\s*\\{\\s*id:\\s*cameraId,\\s*orgId\\s*\\}"
    - from: "apps/api/src/streams/processors/stream.processor.ts:46"
      to: "StatusService.transition"
      via: "background worker call (no HTTP CLS context)"
      pattern: "this\\.statusService\\.transition"
---

<objective>
Fix the Phase 15 RLS regression in `StatusService` that was missed by commit 8ea20f7. Background workers (StreamProcessor, etc.) call `StatusService.transition()` outside an HTTP request, so the CLS-bound `ORG_ID` is not set, the `TENANCY_CLIENT` extension skips `set_config`, and the `tenant_isolation_camera` RLS policy returns 0 rows. `findUnique` then returns `null`, the service throws `Camera ${id} not found`, and BullMQ retries until exhausted (cam1 currently has 9 failed attempts).

Mirror the pattern already applied in `boot-recovery.service.ts` (commit 8ea20f7): inject `SystemPrismaService` (RLS-bypass) and add `orgId` to the `where` clause for defense-in-depth. This matches the T-17-V4 / REC-01 `getRecording` fix pattern.

Purpose: Restore background-worker stream lifecycle (cam1 currently dead in the water).
Output: A patched `StatusService` that works from both background workers and HTTP request paths, plus end-to-end verification on cam1.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@apps/api/src/status/status.service.ts
@apps/api/src/prisma/system-prisma.service.ts
@apps/api/src/resilience/boot-recovery.service.ts
@apps/api/src/status/status.module.ts
@apps/api/src/streams/processors/stream.processor.ts
@apps/api/src/prisma/prisma.module.ts

<interfaces>
<!-- Key contracts the executor needs. Extracted from codebase. -->

From apps/api/src/prisma/system-prisma.service.ts:
```typescript
@Injectable()
export class SystemPrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  // PrismaClient connected as DB superuser (rolbypassrls=true).
  // Use for background jobs / system bootstrap that must read across tenants.
}
```

From apps/api/src/prisma/prisma.module.ts:
```typescript
@Global()
@Module({
  providers: [PrismaService, SystemPrismaService],
  exports: [PrismaService, SystemPrismaService],
})
export class PrismaModule {}
```
NOTE: `PrismaModule` is already imported by `StatusModule` — no module wiring change needed.

From apps/api/src/resilience/boot-recovery.service.ts (reference pattern, commit 8ea20f7):
```typescript
constructor(
  private readonly prisma: SystemPrismaService,
  ...
) {}
// Direct usage: this.prisma.camera.findMany({ where: { ... } })
```

From apps/api/src/streams/processors/stream.processor.ts (the failing caller):
```typescript
async process(job: Job<StreamJobData>): Promise<void> {
  const { cameraId, orgId, ... } = job.data;
  ...
  await this.statusService.transition(cameraId, orgId, 'connecting');  // line 46
  ...
}
```

Current StatusService signature (unchanged by this fix):
```typescript
async transition(cameraId: string, orgId: string, newStatus: string): Promise<void>
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Replace TENANCY_CLIENT with SystemPrismaService and scope reads/updates by orgId</name>
  <files>apps/api/src/status/status.service.ts</files>
  <behavior>
    - StatusService constructor injects `private readonly prisma: SystemPrismaService` instead of `@Inject(TENANCY_CLIENT) private readonly prisma: any`.
    - The `TENANCY_CLIENT` import is removed; `SystemPrismaService` is imported from `'../prisma/system-prisma.service'`.
    - The camera lookup in `transition()` becomes `this.prisma.camera.findFirst({ where: { id: cameraId, orgId } })` (was `findUnique({ where: { id: cameraId } })`).
    - The camera update in `transition()` stays `this.prisma.camera.update({ where: { id: cameraId }, data: {...} })` — `update` requires a unique where, and `id` is unique. The org check is enforced by the preceding `findFirst({ where: { id, orgId } })`; if it returns null we throw before the update runs (defense-in-depth: a foreign orgId cannot reach the update).
    - When the camera does not exist (or does not belong to `orgId`), the existing error message `Camera ${cameraId} not found` is preserved (preserves caller error-handling in StreamProcessor).
    - All other behaviour (validTransitions table, no-op short-circuit, statusGateway broadcast, maintenance gate, debounced notify queue, viewer count maps) is unchanged.
  </behavior>
  <action>
    Edit `apps/api/src/status/status.service.ts`:

    1. Remove the import: `import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';`
    2. Add the import: `import { SystemPrismaService } from '../prisma/system-prisma.service';`
    3. KEEP `Inject` in the `@nestjs/common` import — it is still required by `@Inject(forwardRef(() => NotificationsService))`.
    4. Change the constructor parameter
       FROM: `@Inject(TENANCY_CLIENT) private readonly prisma: any,`
       TO:   `private readonly prisma: SystemPrismaService,`
       (Keep parameter order identical so DI resolution and any downstream snapshots don't shift.)
    5. In `transition()`, change:
       FROM: `const camera = await this.prisma.camera.findUnique({ where: { id: cameraId } });`
       TO:   `const camera = await this.prisma.camera.findFirst({ where: { id: cameraId, orgId } });`
    6. Leave the existing `if (!camera) throw new Error(\`Camera ${cameraId} not found\`);` line as-is — it now also covers the "wrong org" case, which is the desired defense-in-depth behaviour (per T-17-V4 / REC-01 pattern).
    7. Leave the `update({ where: { id: cameraId }, data: {...} })` call untouched — Prisma's `update` requires a unique where; the org check is enforced by step 5/6.

    Do NOT touch `status.module.ts` — `PrismaModule` is already imported there and `SystemPrismaService` is already a global provider/export.

    Why SystemPrismaService (not PrismaService): both background and HTTP paths share this service. Background paths have no CLS ORG_ID, so the tenancy extension would silently filter to zero rows. SystemPrismaService bypasses RLS via a direct PrismaClient connection, and we re-add tenant scoping explicitly in the `where` clause — same pattern as `boot-recovery.service.ts` and the REC-01 `getRecording` fix.
  </action>
  <verify>
    <automated>cd apps/api && pnpm exec tsc --noEmit</automated>
  </verify>
  <done>
    - `apps/api/src/status/status.service.ts` no longer references `TENANCY_CLIENT`.
    - `apps/api/src/status/status.service.ts` imports and constructor-injects `SystemPrismaService`.
    - `transition()` uses `findFirst({ where: { id: cameraId, orgId } })` for the camera read.
    - `pnpm exec tsc --noEmit` (in `apps/api`) passes with zero new errors.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: End-to-end verification on cam1</name>
  <files>apps/api/src/status/status.service.ts (no edits — runtime verification only)</files>
  <what-built>
    StatusService now uses SystemPrismaService (RLS-bypass) with explicit `{ id, orgId }` scoping, mirroring boot-recovery.service.ts. Background workers can now successfully transition camera status without throwing `Camera ${id} not found`.
  </what-built>
  <action>
    Pause for the human to perform the end-to-end verification described in `<how-to-verify>`. No code changes in this task — this is the human-verification gate that confirms cam1 actually recovers in the running system.
  </action>
  <how-to-verify>
    Start the API with the patched code, then verify cam1 (`ba416508-09fa-4e5f-9278-cca508e3c5c3`) recovers end-to-end.

    Preconditions:
    - API container rebuilt with the patch and restarted.
    - Redis and SRS reachable from the API container.
    - cam1 exists in DB and its source RTSP feed is reachable.

    Steps:

    1. Restart the API to load the patched StatusService:
       ```
       docker compose restart api
       ```

    2. Clear cam1's exhausted BullMQ job so the boot-recovery enqueue (or manual enqueue) is not blocked by the dedup jobId:
       ```
       docker compose exec redis redis-cli DEL "bull:stream-ffmpeg:camera:ba416508-09fa-4e5f-9278-cca508e3c5c3:ffmpeg"
       ```
       (If you also see entries in the failed/wait/active sets, clear those — e.g. `redis-cli ZREM bull:stream-ffmpeg:failed <jobId>` — but typically the DEL above plus the BullMQ jobId dedup is enough.)

    3. Re-enqueue the start job. Easiest path: hit the manual start endpoint (or the equivalent UI button) for cam1 in the org-admin portal. If you prefer to verify boot-recovery instead, just `docker compose restart api` again — boot-recovery will re-enqueue any camera whose status is in `[online, connecting, reconnecting, degraded]` with `maintenanceMode=false`.

    4. Tail API logs for cam1's transitions:
       ```
       docker compose logs -f api | grep ba416508
       ```
       Expected log sequence (no `Camera ... not found` errors):
       - `Processing stream job for camera ba416508-09fa-4e5f-9278-cca508e3c5c3 (attempt 1)`
       - `Camera ba416508-...: offline -> connecting`
       - FFmpeg spawn log line(s) from FfmpegService.
       - Eventually `Camera ba416508-...: connecting -> online (notify scheduled T+30s, jobId=...)`.

    5. Confirm SRS is receiving the stream:
       ```
       curl -s http://localhost:1985/api/v1/streams | jq '.streams[] | select(.name | contains("ba416508"))'
       ```
       Expect one entry with non-zero `kbps.recv_30s` and a `publisher.alive: true`.

    6. Confirm `Camera.lastOnlineAt` was updated:
       ```
       docker compose exec api node -e "
         const { PrismaClient } = require('@prisma/client');
         const p = new PrismaClient();
         p.camera.findUnique({ where: { id: 'ba416508-09fa-4e5f-9278-cca508e3c5c3' } })
           .then(c => { console.log({ status: c.status, lastOnlineAt: c.lastOnlineAt }); return p.\$disconnect(); });
       "
       ```
       Expect `status: 'online'` and `lastOnlineAt` within the last minute.

    7. Stop the stream (cleanup):
       - Use the org-admin UI's stop button for cam1, OR
       - Manually enqueue a stop job through whatever path you used in step 3.
       Confirm logs show `Camera ba416508-...: online -> offline` and SRS no longer reports the stream.

    Any "FAIL" criteria (treat as a regression — do NOT mark approved):
    - Any `Camera ba416508-... not found` in API logs after the patch is loaded.
    - Status stuck at `connecting` for > 60s with no FFmpeg spawn.
    - SRS shows no incoming stream and FFmpeg has not been launched.
    - `lastOnlineAt` not updated despite status reaching `online`.

    Sanity check on a different org (defense-in-depth): if you have a second org with another camera, briefly verify status transitions still work for it too. Skip if only one org exists locally.
  </how-to-verify>
  <verify>
    <automated>MISSING — this is a human-verify checkpoint; runtime evidence is captured by the human via the `<how-to-verify>` steps (API logs, SRS API, DB lastOnlineAt).</automated>
  </verify>
  <done>
    - cam1 logs show `offline -> connecting -> online` with no `Camera ... not found` errors.
    - SRS `/api/v1/streams` lists cam1 with `publisher.alive: true` and non-zero recv kbps.
    - `Camera.lastOnlineAt` for cam1 is within the last minute of the verification.
    - Cleanup stop succeeds (cam1 transitions back to `offline`, SRS drops the stream).
    - Human types `approved` in the resume signal.
  </done>
  <resume-signal>Type "approved" once cam1 reaches `online`, FFmpeg is running, SRS shows the stream, and `lastOnlineAt` is fresh; then stop the stream. If any FAIL criterion above hits, describe what you saw and we will iterate.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Background worker → DB | BullMQ workers run outside the HTTP request lifecycle, so the CLS-bound `ORG_ID` is not set; they must not silently bypass tenant scoping. |
| HTTP request → StatusService | Authenticated org-scoped requests can call `transition()` for cameras in their own org only. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-RLS-01 (existing, Phase 15) | Tampering / Information Disclosure | `StatusService` Camera read/update | mitigate | Inject `SystemPrismaService` (RLS-bypass for background workers) AND scope all reads to `{ id, orgId }` (defense-in-depth) so a foreign orgId cannot transition another org's camera even though the connection bypasses RLS. Mirrors the `boot-recovery.service.ts` and REC-01 `getRecording` patterns. |
| T-RLS-STATUS-01 | Elevation of Privilege | `StatusService.transition()` called with mismatched `orgId` | mitigate | `findFirst({ where: { id: cameraId, orgId } })` returns null when orgId does not own the camera, causing the existing `Camera ${cameraId} not found` throw before any update runs. Update path is therefore unreachable for cross-org calls. |
| T-RLS-STATUS-02 | Denial of Service | BullMQ retry exhaustion when `transition()` always throws | mitigate (this fix) | Removing the false-negative `not found` error allows the FFmpeg job to proceed; cam1 (and any other affected camera) will succeed on the next attempt instead of consuming retry budget. |
</threat_model>

<verification>
- `pnpm exec tsc --noEmit` (run from `apps/api`) passes with no new errors.
- `apps/api/src/status/status.service.ts` no longer imports `TENANCY_CLIENT`.
- `apps/api/src/status/status.service.ts` imports `SystemPrismaService` from `../prisma/system-prisma.service`.
- The Camera read in `transition()` is `findFirst({ where: { id: cameraId, orgId } })`.
- End-to-end (Task 2): cam1 transitions `offline -> connecting -> online`, FFmpeg spawns, SRS reports the stream, `lastOnlineAt` is updated.
- No `Camera ${id} not found` errors appear in API logs for cam1 after the patch is loaded.
</verification>

<success_criteria>
- StatusService no longer depends on the request-scoped tenancy CLS context for Camera lookups, removing the background-worker false-negative path.
- Cross-org calls to `transition()` are still rejected (defense-in-depth via `{ id, orgId }` scoping).
- cam1's BullMQ stream-ffmpeg job succeeds on the first post-patch attempt.
- All existing API request paths that already invoke `transition()` (e.g., manual stop) continue to work without behavioural change — same `transition(cameraId, orgId, newStatus)` signature, same error message, same broadcast/notify/maintenance flow.
</success_criteria>

<output>
After completion, create `.planning/quick/260420-nmu-fix-statusservice-rls-regression-use-sys/260420-nmu-SUMMARY.md` summarising:
- The exact diff applied to `status.service.ts`.
- The verification log excerpts (cam1 transition lines, SRS stream entry, lastOnlineAt value).
- Confirmation that the threat register's T-RLS-01 closure for this file is complete (matching the rest of the codebase's commit 8ea20f7 pattern).
</output>
