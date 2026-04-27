---
phase: 25-multi-stage-dockerfiles-image-hardening
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/health/health.controller.ts
  - apps/api/src/health/health.module.ts
  - apps/api/src/app.module.ts
autonomous: true
requirements:
  - DEPLOY-01
must_haves:
  truths:
    - "Unauthenticated GET /api/health returns 200 with body {ok:true} via curl"
    - "The endpoint is bypassed by the audit interceptor (no audit row created)"
    - "The endpoint is registered in AppModule and reachable under the global /api prefix"
  artifacts:
    - path: apps/api/src/health/health.controller.ts
      provides: "Public, unguarded HealthController exposing GET /api/health → {ok:true}"
      contains: "@Controller('api/health')"
    - path: apps/api/src/health/health.module.ts
      provides: "HealthModule exporting HealthController"
      contains: "controllers: [HealthController]"
    - path: apps/api/src/app.module.ts
      provides: "Registers HealthModule alongside existing modules"
      contains: "HealthModule"
  key_links:
    - from: apps/api/src/app.module.ts
      to: apps/api/src/health/health.module.ts
      via: "import + AppModule.imports[]"
      pattern: "HealthModule"
    - from: apps/api/src/audit/audit.interceptor.ts
      to: "/api/health"
      via: "SKIP_PATHS pre-existing entry — no edit required"
      pattern: "/api/health"
---

<objective>
Create a public, unguarded liveness endpoint `GET /api/health` returning `{ ok: true }` so Phase 25 Dockerfile `HEALTHCHECK` (and Phase 27 Caddy / Phase 30 nmap) have a stable in-container probe target. Per D-01 / D-03, this is a separate `HealthController` + `HealthModule` — NOT a route added to `AdminController` (which is `SuperAdminGuard`-guarded and thus unusable for `docker run` HEALTHCHECK).

Purpose: Wave 2 (Plan 04 api Dockerfile) and Plan 05 (web Dockerfile) declare `HEALTHCHECK CMD curl -fsS http://localhost:3003/api/health`. That curl runs as the in-container `app` user with no auth — the route MUST be unguarded. The audit interceptor's `SKIP_PATHS` already lists `/api/health` (audit.interceptor.ts:12), so registering this controller under that path requires zero audit changes.
Output: New `health/` directory under `apps/api/src/` with a 1-controller / 1-module pair, wired into `AppModule.imports`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md

@apps/api/src/admin/admin.controller.ts
@apps/api/src/admin/admin.module.ts
@apps/api/src/audit/audit.interceptor.ts
@apps/api/src/app.module.ts
@apps/api/src/main.ts

<interfaces>
<!-- Pattern source: AdminController + AdminModule (apps/api/src/admin/admin.{controller,module}.ts) -->
<!-- Replicate the @Controller / @Get('health') / Swagger decorator shape, but DROP @UseGuards(SuperAdminGuard) -->

From apps/api/src/admin/admin.controller.ts (template — DO NOT modify this file):
```typescript
@ApiExcludeController()
@ApiTags('Admin')
@Controller('api/admin')
@UseGuards(SuperAdminGuard)        // ← REMOVE this for HealthController
export class AdminController {
  @Get('health')
  @ApiOperation({ summary: 'Admin health check (super admin only)' })
  @ApiResponse({ status: 200, description: 'Admin health status' })
  health() {
    return { status: 'ok', role: 'super-admin' };
  }
}
```

NestJS global prefix:
- `apps/api/src/main.ts` does NOT call `app.setGlobalPrefix('api')` — controllers carry the `api/` prefix in their own `@Controller('api/...')` strings (verified via `apps/api/src/admin/admin.controller.ts:11` `@Controller('api/admin')`). HealthController MUST therefore use `@Controller('api/health')` to land at `/api/health`.

Audit interceptor SKIP_PATHS:
- `apps/api/src/audit/audit.interceptor.ts:12` already contains `'/api/health'`. No edit needed — the new controller's path matches the slot.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create HealthController + HealthModule under apps/api/src/health/</name>
  <files>apps/api/src/health/health.controller.ts, apps/api/src/health/health.module.ts</files>
  <read_first>
    - apps/api/src/admin/admin.controller.ts (replicate decorator shape, DROP SuperAdminGuard, change response to {ok:true})
    - apps/api/src/admin/admin.module.ts (replicate single-controller module shape — drop providers/imports, just controllers:[])
    - apps/api/src/audit/audit.interceptor.ts (verify line 12 SKIP_PATHS contains '/api/health' — confirms our path choice)
  </read_first>
  <action>
    Create directory `apps/api/src/health/` (it does not exist — verified in 25-CONTEXT.md "Code Insights").

    File 1 — `apps/api/src/health/health.controller.ts` (~25 lines):
    ```typescript
    import { Controller, Get } from '@nestjs/common';
    import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

    /**
     * HealthController exposes a public, unguarded liveness probe at GET /api/health.
     *
     * - Used by Dockerfile HEALTHCHECK (api + web images both probe an /api/health route).
     * - Used by Phase 27 Caddy upstream health probe and Phase 30 smoke test.
     * - Intentionally separate from AdminController (which is SuperAdminGuard-guarded) —
     *   `docker run --rm <image> curl localhost:3003/api/health` MUST succeed without auth.
     * - Audit interceptor SKIP_PATHS already lists '/api/health' (apps/api/src/audit/audit.interceptor.ts:12),
     *   so this endpoint emits zero audit rows.
     * - Liveness only: NO DB ping, NO Redis ping. A transient Postgres restart should NOT
     *   mark this container unhealthy and have Caddy strip traffic (per D-03).
     */
    @ApiTags('Health')
    @Controller('api/health')
    export class HealthController {
      @Get()
      @ApiOperation({ summary: 'Liveness probe (public, unguarded)' })
      @ApiResponse({ status: 200, description: 'Service is alive', schema: { example: { ok: true } } })
      health() {
        return { ok: true };
      }
    }
    ```

    File 2 — `apps/api/src/health/health.module.ts` (~10 lines):
    ```typescript
    import { Module } from '@nestjs/common';
    import { HealthController } from './health.controller';

    /**
     * HealthModule registers the public liveness endpoint.
     * No providers, no imports — pure controller declaration.
     */
    @Module({
      controllers: [HealthController],
    })
    export class HealthModule {}
    ```

    Do NOT add `@UseGuards(...)`, do NOT add `@ApiExcludeController()` — Swagger inclusion is intentional per 25-CONTEXT.md "Specifics" ("Phase 28 Caddy/operator monitoring tools (Prometheus exporter ใน v1.4) จะอ้าง endpoint นี้").
  </action>
  <verify>
    <automated>test -f apps/api/src/health/health.controller.ts && test -f apps/api/src/health/health.module.ts && grep -q "@Controller('api/health')" apps/api/src/health/health.controller.ts && grep -q "{ ok: true }" apps/api/src/health/health.controller.ts && ! grep -q "UseGuards" apps/api/src/health/health.controller.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/api/src/health/health.controller.ts` exists.
    - File contains exact string `@Controller('api/health')`.
    - File contains exact string `{ ok: true }` (the response body).
    - File does NOT import or reference `SuperAdminGuard` or `UseGuards`.
    - File `apps/api/src/health/health.module.ts` exists and contains `controllers: [HealthController]`.
    - `grep -rn "import.*HealthController.*from" apps/api/src/health/health.module.ts` returns one match.
  </acceptance_criteria>
  <done>HealthController + HealthModule files exist with correct decorator + response shape and zero guard references.</done>
</task>

<task type="auto">
  <name>Task 2: Register HealthModule in AppModule</name>
  <files>apps/api/src/app.module.ts</files>
  <read_first>
    - apps/api/src/app.module.ts (current import list — see existing pattern of `import { AdminModule } from './admin/admin.module';` line 10 + entry in `imports:` array line 43)
  </read_first>
  <action>
    Edit `apps/api/src/app.module.ts`:

    1. Add import statement immediately after the existing `import { AdminModule } from './admin/admin.module';` line (currently line 10):
       ```typescript
       import { HealthModule } from './health/health.module';
       ```

    2. Add `HealthModule,` to the `imports: [...]` array. Insert it directly after `AdminModule,` (currently line 43) for grouping clarity. Concretely the snippet becomes:
       ```typescript
       AdminModule,
       HealthModule,
       UsersModule,
       ```

    Do NOT reorder existing entries. Do NOT touch `ConfigModule.forRoot`, `ClsModule.forRoot`, `BullModule.forRoot`, `ThrottlerModule.forRoot`, or the `providers:` array.

    After edit, run `pnpm --filter @sms-platform/api build` from repo root to confirm SWC compiles the new module without TypeScript errors.
  </action>
  <verify>
    <automated>grep -q "import { HealthModule } from './health/health.module';" apps/api/src/app.module.ts && grep -q "HealthModule," apps/api/src/app.module.ts && pnpm --filter @sms-platform/api build > /dev/null 2>&1</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/src/app.module.ts` contains exact line `import { HealthModule } from './health/health.module';`.
    - The string `HealthModule,` appears inside the `imports: [...]` array (verifiable via `grep -A 30 "imports: \[" apps/api/src/app.module.ts | grep "HealthModule,"`).
    - `pnpm --filter @sms-platform/api build` exits 0 (proves the module compiles and there's no duplicate-token / circular-import error).
    - No edits to `providers:` array, ThrottlerModule config, or any other existing module entry.
  </acceptance_criteria>
  <done>HealthModule is imported and registered in AppModule.imports; api builds cleanly.</done>
</task>

<task type="auto">
  <name>Task 3: Smoke-test the endpoint locally via pnpm dev</name>
  <files>(no file changes — runtime verification only)</files>
  <read_first>
    - apps/api/.env (verify api dev port is 3003 — used in dev-smoke.sh:28)
    - scripts/dev-smoke.sh (existing Phase 24 dev regression test — must still pass)
  </read_first>
  <action>
    Boot the api locally and prove the new endpoint works:

    1. From repo root: `pnpm --filter @sms-platform/api start:dev` in a background terminal (or use existing `pnpm dev` if web is also wanted). Wait ~10s for tsx-watch + Nest to boot.
    2. Probe: `curl -fsS http://localhost:3003/api/health` — expected output: `{"ok":true}` (HTTP 200, no auth header).
    3. Probe negative control: `curl -sS -o /dev/null -w '%{http_code}' http://localhost:3003/api/admin/health` — expected: `401` or `403` (proves AdminController is still guarded and we did not accidentally rewire).
    4. Stop the dev process (Ctrl+C).
    5. Run `bash scripts/dev-smoke.sh` from repo root — must exit 0 (proves we did not regress dev workflow). Note: dev-smoke.sh probes `:3003/api/health` and accepts 2xx/3xx/4xx as "port alive"; with the new endpoint in place it will now actually return 200.
  </action>
  <verify>
    <automated>pnpm --filter @sms-platform/api start:dev > /tmp/api-25-01.log 2>&1 & API_PID=$!; sleep 10; CODE=$(curl -sS -o /tmp/health-25-01.json -w '%{http_code}' http://localhost:3003/api/health); BODY=$(cat /tmp/health-25-01.json); kill -TERM "$API_PID" 2>/dev/null; sleep 2; kill -KILL "$API_PID" 2>/dev/null; test "$CODE" = "200" && echo "$BODY" | grep -q '"ok":true'</automated>
  </verify>
  <acceptance_criteria>
    - `curl -fsS http://localhost:3003/api/health` returns HTTP 200 (proven by `curl -fsS` not failing) with body `{"ok":true}` (case-sensitive, no extra fields).
    - `curl -sS -o /dev/null -w '%{http_code}' http://localhost:3003/api/admin/health` returns 401 or 403 (proves we did not break the existing guarded admin route).
    - `bash scripts/dev-smoke.sh` exits 0.
  </acceptance_criteria>
  <done>The endpoint is reachable on a running dev api, returns the exact `{ok:true}` body, and dev-smoke regression passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Container → in-container HTTP probe | Dockerfile HEALTHCHECK runs `curl localhost:3003/api/health` as `app` user; no network ingress, no auth |
| External (post-Caddy) → /api/health | Phase 27 Caddy may proxy this externally; response leaks only `{ok:true}` (no version, no DB state) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-01 | Information Disclosure | HealthController response body | mitigate | Response is `{ok:true}` only — no version, no commit SHA, no DB/Redis status (per D-03 minimal liveness). Prevents fingerprinting. |
| T-25-02 | Denial of Service | Public unguarded endpoint | accept | Endpoint is the cheapest possible (synchronous return of literal). NestJS `ThrottlerModule` global guard (apps/api/src/app.module.ts:62) still applies at `100 req/min` per IP in production — provides baseline rate limit. |
| T-25-03 | Spoofing | Audit log gap | accept | `/api/health` is in audit.interceptor.ts:12 SKIP_PATHS — intentional, prevents audit table bloat from healthcheck traffic (1 hit/30s/container). |
</threat_model>

<verification>
1. `test -f apps/api/src/health/health.controller.ts && test -f apps/api/src/health/health.module.ts`
2. `grep -q "HealthModule" apps/api/src/app.module.ts`
3. `pnpm --filter @sms-platform/api build` exits 0.
4. `curl -fsS http://localhost:3003/api/health` returns `{"ok":true}` against a running dev api.
5. `bash scripts/dev-smoke.sh` exits 0 (no dev regression).
</verification>

<success_criteria>
- `GET /api/health` returns 200 + `{"ok":true}` to unauthenticated callers.
- `GET /api/admin/health` still requires super-admin (regression check).
- AppModule compiles and dev workflow unaffected.
- Phase 25 Dockerfile (Plan 04) can rely on `/api/health` as a stable HEALTHCHECK target.
</success_criteria>

<output>
After completion, create `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-01-SUMMARY.md`
</output>
