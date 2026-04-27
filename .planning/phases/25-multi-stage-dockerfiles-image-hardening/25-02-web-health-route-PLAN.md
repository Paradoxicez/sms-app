---
phase: 25-multi-stage-dockerfiles-image-hardening
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/health/route.ts
autonomous: true
requirements:
  - DEPLOY-02
must_haves:
  truths:
    - "GET http://localhost:3000/api/health returns HTTP 200 with body {ok:true} when the web container is running standalone (no api container present)"
    - "The handler does NOT proxy to the api — it answers in-process from Next.js"
  artifacts:
    - path: apps/web/src/app/api/health/route.ts
      provides: "Next.js App Router GET handler returning {ok:true}"
      contains: "export async function GET"
  key_links:
    - from: apps/web/Dockerfile (Plan 05)
      to: "/api/health"
      via: "HEALTHCHECK CMD curl -fsS http://localhost:3000/api/health"
      pattern: "/api/health"
---

<objective>
Add a Next.js App Router route handler at `apps/web/src/app/api/health/route.ts` that returns `{ ok: true }` for `GET /api/health`. Per D-02, this CANNOT be a `next.config.ts` rewrite to the api — Dockerfile `HEALTHCHECK` runs inside the web container, where `localhost:3000/api/health` resolves to the Next.js process, not through the browser-side rewrite chain. The handler must answer in-process so a standalone `docker run` of the web image (with no api sibling) is healthy.

Purpose: Plan 05 (web Dockerfile) declares `HEALTHCHECK CMD curl -fsS http://localhost:3000/api/health`. The web image must be self-contained-healthy.
Output: 1 new file, ~10 LOC.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md
@apps/web/next.config.ts
@apps/web/package.json

<interfaces>
<!-- Next.js 15 App Router route handler shape -->
<!-- Reference docs: https://nextjs.org/docs/app/building-your-application/routing/route-handlers -->
<!-- This is the FIRST app/api/* route in apps/web/ — verified via `ls apps/web/src/app/api/` returns "no app/api dir yet" -->

Expected file path: apps/web/src/app/api/health/route.ts
Expected route shape:
```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true });
}
```

Important behaviour notes:
- Next.js maps `app/api/health/route.ts` (file path) to URL `/api/health` (route path).
- The existing `next.config.ts` rewrite `'/api/:path*' → ${API_URL}/api/:path*` (line 14-17) only fires when there is NO matching local route handler — local handlers take precedence. So adding this file does NOT break browser-side `/api/*` calls to the api: requests to `/api/health` will now answer locally (intentional, for healthcheck) but `/api/cameras`, `/api/policies`, etc. continue to proxy to api unchanged.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Next.js App Router health route handler</name>
  <files>apps/web/src/app/api/health/route.ts</files>
  <read_first>
    - apps/web/next.config.ts (confirm existing `rewrites` so we understand the precedence rule — local handlers win over rewrites; our new route shadows the proxy for `/api/health` only)
    - apps/web/src/app/layout.tsx (sanity-check we are inside an App Router project — file existence at apps/web/src/app/layout.tsx confirms it)
  </read_first>
  <action>
    Create directory chain `apps/web/src/app/api/health/` (verified absent — `apps/web/src/app/api/` does not exist yet). Then create file `apps/web/src/app/api/health/route.ts` with EXACTLY this content (10 lines including blank lines and comments):

    ```typescript
    import { NextResponse } from 'next/server';

    /**
     * Public liveness probe for the web container.
     *
     * - Used by apps/web/Dockerfile HEALTHCHECK: `curl -fsS http://localhost:3000/api/health`.
     * - Answers in-process — does NOT proxy to api. The Dockerfile HEALTHCHECK runs
     *   inside the web container; `localhost:3000` is the Next.js server, not the
     *   browser-side rewrite target. A standalone `docker run` of the web image
     *   must be healthy without any api sibling.
     * - Local route handlers take precedence over next.config.ts rewrites, so
     *   `/api/health` answers here while `/api/cameras` / `/api/policies` / etc.
     *   continue to proxy to ${API_URL} per the existing rewrite rule.
     */
    export async function GET() {
      return NextResponse.json({ ok: true });
    }
    ```

    Do NOT export `POST`, `PUT`, `DELETE`, or any other method — only `GET`.
    Do NOT add `export const runtime = '...'` or `export const dynamic = '...'` — defaults are fine for a synchronous response.
    Do NOT touch `apps/web/next.config.ts` — that is Plan 03's job.
  </action>
  <verify>
    <automated>test -f apps/web/src/app/api/health/route.ts && grep -q "export async function GET" apps/web/src/app/api/health/route.ts && grep -q "NextResponse.json({ ok: true })" apps/web/src/app/api/health/route.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `apps/web/src/app/api/health/route.ts` exists.
    - File contains exact string `export async function GET()`.
    - File contains exact string `NextResponse.json({ ok: true })`.
    - File contains exact string `from 'next/server'`.
    - File does NOT export `POST`, `PUT`, `DELETE`, or `PATCH` (verifiable via `grep -E "export async function (POST|PUT|DELETE|PATCH)" apps/web/src/app/api/health/route.ts` returning empty).
  </acceptance_criteria>
  <done>Route handler file exists with the exact GET implementation and no extra HTTP methods.</done>
</task>

<task type="auto">
  <name>Task 2: Smoke-test the route via pnpm dev:web</name>
  <files>(no file changes — runtime verification only)</files>
  <read_first>
    - apps/web/package.json (confirm `"dev": "next dev --turbopack --port 3000"` — port for the curl probe)
  </read_first>
  <action>
    Boot the web app locally and prove the new endpoint works:

    1. From repo root: `pnpm --filter @sms-platform/web dev` in a background terminal. Wait ~15s for Next.js + Turbopack cold-boot.
    2. Probe: `curl -fsS http://localhost:3000/api/health` — expected output: `{"ok":true}` (HTTP 200).
    3. Verify the rewrite is NOT shadowed for unrelated paths: `curl -sS -o /dev/null -w '%{http_code}' http://localhost:3000/api/cameras` — expected: a non-2xx code (likely 401/404 because api is not running, or a proxy connection error 502/504). The KEY assertion: it should NOT be 200 with `{"ok":true}` (which would mean our handler is matching too greedily).
    4. Stop the dev process (Ctrl+C).

    Note: We are testing the route handler exists and responds in dev. Container-level testing happens in Plan 05 / Plan 06.
  </action>
  <verify>
    <automated>pnpm --filter @sms-platform/web dev > /tmp/web-25-02.log 2>&1 & WEB_PID=$!; sleep 15; CODE=$(curl -sS -o /tmp/health-25-02.json -w '%{http_code}' http://localhost:3000/api/health); BODY=$(cat /tmp/health-25-02.json); kill -TERM "$WEB_PID" 2>/dev/null; sleep 2; kill -KILL "$WEB_PID" 2>/dev/null; test "$CODE" = "200" && echo "$BODY" | grep -q '"ok":true'</automated>
  </verify>
  <acceptance_criteria>
    - `curl -fsS http://localhost:3000/api/health` returns HTTP 200 with body `{"ok":true}`.
    - `curl -sS http://localhost:3000/api/cameras` does NOT return `{"ok":true}` (proves the handler is path-scoped to `/api/health` only and does not over-shadow the rewrite).
  </acceptance_criteria>
  <done>The route handler answers in-process for `/api/health` and does not interfere with other `/api/*` rewrites.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Container → in-container HTTP probe | Web Dockerfile HEALTHCHECK runs `curl localhost:3000/api/health` as `app` user; no network ingress, no auth |
| External (post-Caddy) → /api/health | Phase 27 Caddy proxies `/api/*` to api:3003, NOT to web — so external clients never hit this route handler. Verified in Caddyfile spec (Plan 04 of Phase 27) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-04 | Information Disclosure | Web health response | mitigate | Response is `{ok:true}` only — matches the api endpoint shape and leaks nothing about the runtime. |
| T-25-05 | Tampering | Route shadowing rewrites | mitigate | Handler scoped to exact path `/api/health` (Next.js file-path → route-path 1:1). All other `/api/*` paths still hit the rewrite to `${API_URL}`. Verified by Task 2 negative-control probe of `/api/cameras`. |
</threat_model>

<verification>
1. `test -f apps/web/src/app/api/health/route.ts`.
2. `grep -q "NextResponse.json({ ok: true })" apps/web/src/app/api/health/route.ts`.
3. `curl -fsS http://localhost:3000/api/health` against `pnpm dev:web` returns `{"ok":true}`.
4. `/api/cameras` does NOT return `{"ok":true}` (rewrite still active for non-health paths).
</verification>

<success_criteria>
- Web image (Plan 05) HEALTHCHECK command will succeed against a standalone `docker run`.
- No regression to existing browser-side `/api/*` proxy behaviour.
</success_criteria>

<output>
After completion, create `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-02-SUMMARY.md`
</output>
