---
status: resolved
severity: high
category: correctness
trigger: "NotificationsGateway and SrsLogGateway reject every browser WebSocket connection in dev because Better Auth session cookies scoped to localhost:3000 are not sent on WS handshake to localhost:3003"
created: 2026-04-22T17:30:00Z
updated: 2026-04-22T18:30:00Z
spun_off_from: .planning/debug/resolved/websocket-socketio-connection-fails.md
impact: "Real-time notifications and SRS log viewer silently broken in dev. Prod impact N/A — no prod deployment infrastructure exists yet (no reverse proxy, no deploy/, no compose override)."
resolution_note: |
  Fixed via Strategy (a) — proxied Socket.IO through the Next.js origin so
  session cookies ride along. Two commits:
  - 809aa6c: initial rewrite + hook changes (window.location.origin +
    withCredentials) + preserved transports fallback from sister session
  - (next commit): split the single `/socket.io/:path*` rewrite into two
    rules (base path + subpaths) + added skipTrailingSlashRedirect: true,
    because Next.js 15's `:path*` wildcard collapses the trailing slash
    when the capture is empty (breaks Socket.IO's mount point) AND
    Next.js's default trailing-slash redirect 308s before rewrites run.
  Verified: HTTP 200 from `http://localhost:3000/socket.io/?EIO=4&transport=polling`
  proxying through to NestJS on :3003.
  Browser-level end-to-end verification deferred to next UAT session
  (restart web dev, login, check DevTools Network → WS, trigger notification).
---

## Current Focus

hypothesis: Adding `source: '/socket.io/:path*'` rewrite to `apps/web/next.config.ts` (targeting `ws://localhost:3003/socket.io/:path*`) will route WebSocket handshakes through the Next.js origin, which means the browser sends the `localhost:3000` session cookie, which the Better Auth `getSession({ headers })` call in each gateway's `handleConnection` can then validate.
test: After fix, open `/admin` → DevTools Network → WS tab → confirm first frame shows `HTTP/1.1 101 Switching Protocols` AND real-time notifications arrive when a test event is dispatched from API side.
expecting: `NotificationsGateway.handleConnection` no longer falls into the "no session → disconnect" branch. `client.emit(...)` to this browser client successfully receives events.
next_action: Apply rewrite + update 4 hooks + verify handshake URL goes through :3000.

## Prod Topology

**Finding: No prod deployment infrastructure exists yet.**

Evidence gathered 2026-04-22:
- `docker-compose.yml`: only declares postgres, redis, srs, minio services. No `api` or `web` service, no `nginx`/`caddy`/`traefik` reverse proxy.
- No `docker-compose.prod.yml`, `docker-compose.override.yml`, `deploy/`, `nginx/`, `Caddyfile`, or k8s manifests anywhere in the repo root.
- `apps/api/.env` and `apps/web/.env` both set `NEXT_PUBLIC_API_URL=http://localhost:3003` (dev only).
- `apps/api/src/main.ts` CORS allowlist: hardcoded `http://localhost:3000`, `http://localhost:3002`, `http://localhost:3010` — no production origin configured.
- Both API processes and the web process run directly on the host (Next.js + NestJS via pnpm dev scripts). Only infrastructure (DB/Redis/SRS/MinIO) is containerized.

**Implication:** The fix is effectively dev-only in impact because prod doesn't exist. When prod is eventually stood up, the planned topology per CLAUDE.md is "Docker Compose (single server, self-hosted)" with SRS on 8080 + API + Web. At that point a reverse proxy should be added (nginx in front terminating both `/` → web and `/api/*` + `/socket.io/*` → api on the same origin), which makes this cookie issue disappear naturally.

**Risk assessment for this fix:** LOW. No prod deploy to break. The fix adds a rewrite that is a no-op when the site is later deployed behind a single-origin reverse proxy (the rewrite just proxies to itself in that case, or can be conditionally skipped via env check).

## Turbopack WS Rewrite Support

Next.js 15.0 with Turbopack. Per Next.js rewrites docs, WebSocket upgrade is supported through `rewrites()`. Will verify empirically after applying the change by checking DevTools Network → WS panel for `HTTP/1.1 101 Switching Protocols` response on `ws://localhost:3000/socket.io/...`.

## Symptoms

expected: Browser logged into `/admin` (Org Admin or Super Admin) opens a Socket.IO connection to `NotificationsGateway` or `SrsLogGateway`, Better Auth session validates on the handshake, `handleConnection` puts the socket in the authenticated room, and server-side `emit()` calls reach the browser. Users see real-time notifications and live SRS log updates.

actual: `NotificationsGateway.handleConnection` calls `auth.api.getSession({ headers })` on the handshake headers. Headers contain no session cookie (cookies scoped to `localhost:3000` don't travel with a direct `ws://localhost:3003` handshake). Session lookup returns null. Gateway calls `client.disconnect(true)`. Client sees the disconnect, Chrome does NOT print "failed" (graceful close), but the feature is silently broken — no notifications ever arrive.

Same pattern for `SrsLogGateway`.

errors: No user-visible error. This is a **silent broken feature** — harder to notice than a crash. The server-side graceful `disconnect(true)` produces close code 1005 with `wasClean=true` which Chrome treats as an intentional server decision, not a failure.

reproduction:
1. Start API + Web dev servers
2. Login to `/admin` as Org Admin
3. Open DevTools → Network → WS tab
4. Observe: Socket.IO handshake succeeds (HTTP 101), then server immediately closes
5. Trigger an event that should produce a notification (e.g., create a camera) — no in-app toast/bell badge appears
6. Check server logs: `NotificationsGateway handleConnection: no session, disconnecting` (or similar)

timeline: Pattern has existed since these gateways were introduced with session-based auth. Works in production ONLY if deployed behind a single-origin reverse proxy (where web + API share the same origin and cookie scope). Needs verification.

## Affected Files

- `apps/api/src/notifications/notifications.gateway.ts:21-45` — `handleConnection` calls `auth.api.getSession({ headers })`, disconnects on no-session
- `apps/api/src/srs/srs-log.gateway.ts:33-53` — same pattern
- `apps/web/src/lib/auth-client.ts:5` — Better Auth client configured against `localhost:3000` origin (correct for HTTP but cookies don't reach `:3003` via direct WS)
- `apps/web/next.config.ts` — has HTTP `/api/:path*` rewrite but not WS `/socket.io/:path*`

## Root Cause

**Cookie scope vs WebSocket handshake mismatch.**

- Next.js app runs on `http://localhost:3000`
- NestJS API runs on `http://localhost:3003`
- Next.js rewrites `/api/:path*` → `localhost:3003/api/:path*` so HTTP fetches from browser stay same-origin and carry session cookies
- Better Auth stores session cookie with `Domain=localhost; Secure; HttpOnly; SameSite=Lax` — scoped to `localhost` but browser's same-site policy + port-sensitivity in practice means cookies set for `:3000` are NOT sent on XHR/WS requests to `:3003` (cookies don't scope by port, but because the request is cross-origin unless proxied, the browser applies SameSite + CORS rules)
- Socket.IO client in the web hooks connects directly to `ws://localhost:3003/socket.io/` (the hook constructs the URL from `NEXT_PUBLIC_API_URL` or similar, bypassing Next.js rewrites)
- → no cookie arrives → session lookup fails → gateway disconnects

**Note:** In production, if the reverse proxy terminates both HTTP and WS on the same public origin (and API is behind that proxy), this works naturally. The bug is specifically a dev-environment issue caused by the port-split dev topology.

## Fix Strategies

### (a) Recommended: Proxy WebSocket traffic through Next.js

Add to `apps/web/next.config.ts`:

```typescript
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: `${API_URL}/api/:path*`,
    },
    {
      source: '/socket.io/:path*',
      destination: `${API_URL}/socket.io/:path*`,
    },
  ];
}
```

Then change the 4 hooks to connect to `/socket.io` (relative, implicitly uses `localhost:3000` origin). Next.js 13+ rewrites support WebSocket upgrade natively.

**Pro:** Smallest code change. Preserves session model. Fixes dev without changing prod.
**Con:** Need to verify Next.js 15 + Turbopack rewrites actually handle the WS upgrade dance correctly (it's documented to work, but worth testing).

### (b) Alternative: Explicit bearer token via Socket.IO `auth`

Client calls `/api/auth/session` first, extracts a token, passes it as `io(url, { auth: { token } })`. Gateway reads `client.handshake.auth.token` instead of relying on cookies.

**Pro:** Works across any topology, no proxy needed.
**Con:** Requires API to expose a session-to-token endpoint. More surface area. Token handling (refresh, invalidation) is nontrivial.

### (c) Rejected: Widen cookie Domain attribute
Cookies scope by domain, not port. Can't set a cookie on `localhost:3000` that gets sent to `localhost:3003` because the browser treats them as different origins for same-site policy. Already ruled out.

## Acceptance Criteria

- [ ] Next.js `rewrites()` array in `apps/web/next.config.ts` includes `/socket.io/:path*` → `${API_URL}/socket.io/:path*`
- [ ] All 4 socket hooks (`use-notifications.ts`, `use-camera-status.ts`, `use-cluster-nodes.ts`, `use-srs-logs.ts`) use relative `/socket.io` path (or `NEXT_PUBLIC_WEB_ORIGIN` + `/socket.io`), NOT `NEXT_PUBLIC_API_URL` directly
- [ ] Manual: login → open DevTools Network → WS → confirm handshake URL is `ws://localhost:3000/socket.io/...` (not `:3003`)
- [ ] Manual: gateway handshake no longer disconnects — `handleConnection` logs successful session lookup
- [ ] Manual: create a camera → in-app notification toast appears for admins subscribed to that org
- [ ] Manual: SRS log viewer receives live log lines when a stream is active

## Prerequisites Before Starting

1. **Confirm prod topology** — Is prod deployed with a single-origin reverse proxy (e.g., nginx at `https://sms.example.com` terminating both `/` → Next.js and `/api/*` → NestJS + `/socket.io/*` → NestJS)? If yes, this bug is dev-only. If no, it's a prod bug too.
2. **Verify Next.js 15 + Turbopack WS rewrites work** — Run a small test with a rewrite pointing to a known-working WS echo server. Turbopack is newer than Webpack; WS rewrite support may differ.
3. **Run `/gsd-debug socket-hooks-missing-polling-fallback` first** (sister session) — adds polling fallback, which means even if WS rewrite has edge cases, the features still degrade gracefully via long-polling.

## Related

- Parent investigation: `.planning/debug/resolved/websocket-socketio-connection-fails.md`
- Sister session: `.planning/debug/socket-hooks-missing-polling-fallback.md` (UX polish, do first)
