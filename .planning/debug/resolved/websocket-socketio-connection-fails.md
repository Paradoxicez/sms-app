---
status: resolved
trigger: "Socket.IO WebSocket transport from web client (localhost:3000) to NestJS API (localhost:3003) fails on every connect attempt"
created: 2026-04-22T00:00:00Z
updated: 2026-04-22T17:30:00Z
resolution_note: "UAT false alarm — API HMR restarts during Phase 19 UAT caused Socket.IO reconnect attempts to surface as console errors. Verified via curl/node/headless-Chrome that server-side WebSocket upgrade returns HTTP 101 Switching Protocols when API is stable. Running instance (PID 45258) confirmed working. No code change needed for the reported symptom."
split_into:
  - .planning/debug/socket-hooks-missing-polling-fallback.md
  - .planning/debug/notifications-srs-log-gateways-reject-browser-cookies.md
---

## Current Focus

hypothesis: CONFIRMED — reported errors were transient, caused by API HMR restart windows during Phase 19 UAT. Server-side WebSocket is fully functional.
test: Completed. Curl + Node socket.io-client + headless Chrome all succeed against running API. API log confirms 5 restart windows in 17 minutes during UAT.
expecting: N/A — session closed.
next_action: None. Two latent issues spun off into separate debug sessions for independent triage.

## Symptoms

expected: WebSocket upgrade succeeds; Socket.IO client enters connected state; socket.connected === true. Real-time features receive push events.

actual: Browser console logs "WebSocket connection to ws://localhost:3003/socket.io/...&EIO=4&transport=websocket failed" repeated per reconnect attempt. No HTTP 101 switching protocols observed.

errors: "WebSocket connection to ws://localhost:3003/socket.io/...&EIO=4&transport=websocket failed" at createSocket/doOpen in socket.io-client websocket.js

reproduction:
1. Start API dev server (port 3003)
2. Start Web dev server (port 3000)
3. Login as Org Admin at http://localhost:3000
4. Observe DevTools console

started: Observed during Phase 19 UAT on 2026-04-22. Unclear if pre-existing.

## Eliminated

- hypothesis: No Socket.IO adapter registered in main.ts
  evidence: Raw curl upgrade returns HTTP 101 Switching Protocols. Node socket.io-client connects successfully. `@nestjs/platform-socket.io` is installed and NestJS auto-activates IoAdapter when present — explicit `app.useWebSocketAdapter` is not required.
  timestamp: 2026-04-22T10:05:00Z

- hypothesis: WebSocketGateway CORS blocking http://localhost:3000
  evidence: All four gateways declare `cors: { origin: '*' }`. Curl with Origin header `http://localhost:3000` returns 101 with `Access-Control-Allow-Origin: *`. Headless Chrome loaded from http://localhost:3000 origin connects successfully to ws://localhost:3003 and completes handshake.
  timestamp: 2026-04-22T10:06:00Z

- hypothesis: socket.io + socket.io-client version mismatch
  evidence: apps/api uses socket.io@4.8.3 (engine.io@6.6.6). apps/web uses socket.io-client@4.8.3 (engine.io-client@6.6.4). Matched major + minor. EIO=4 handshake negotiates cleanly in tests.
  timestamp: 2026-04-22T10:06:00Z

- hypothesis: Auth middleware blocking WebSocket upgrade at HTTP layer
  evidence: No global HTTP auth middleware in main.ts. Per-gateway auth happens inside handleConnection (after socket.io handshake completes), not at HTTP upgrade level. Curl upgrade succeeds without any auth headers.
  timestamp: 2026-04-22T10:07:00Z

- hypothesis: Phase 19-03 forwardRef changes de-registered WebSocketGateway
  evidence: git log since 2026-04-20 shows no changes to any *.gateway.ts file, notifications.module.ts, srs.module.ts, cluster.module.ts, status.module.ts, main.ts, or app.module.ts. Gateways are registered in their own modules (NotificationsModule, SrsModule, StatusModule, ClusterModule) which are independently imported by AppModule — Phase 19 stream processor refactors do not touch the gateway registration path.
  timestamp: 2026-04-22T10:08:00Z

- hypothesis: Chrome shows "failed" on server-side socket.io `disconnect(true)`
  evidence: Headless Chrome test completing full flow (open → handshake → namespace connect → server disconnect packet 41 → close 1005 wasClean=true) does NOT log "WebSocket connection failed" in console, and `onerror` does NOT fire. Only `onclose` fires with code 1005. Chrome only prints "failed" for handshake failures or connection close before handshake.
  timestamp: 2026-04-22T10:09:00Z

- hypothesis: IPv4/IPv6 mismatch (server bound to one, browser using other)
  evidence: Port 3003 bound on `*:3003` (IPv6 with dual-stack). Both `curl -4 http://127.0.0.1:3003` and `curl -6 http://[::1]:3003` successfully complete WebSocket upgrade. The running Chrome process is already ESTABLISHED to [::1]:3003, confirming browser uses IPv6 to localhost and it works.
  timestamp: 2026-04-22T10:10:00Z

- hypothesis: CSP blocking ws:// from localhost:3000
  evidence: No Content-Security-Policy header in web server response. No helmet in API. Next.js dev server doesn't set CSP by default.
  timestamp: 2026-04-22T10:11:00Z

## Evidence

- timestamp: 2026-04-22T10:05:00Z
  checked: apps/api/src/main.ts and all @WebSocketGateway files
  found: Four gateways registered — StatusGateway (/camera-status), NotificationsGateway (/notifications), ClusterGateway (/cluster-status), SrsLogGateway (/srs-logs). No explicit IoAdapter setup in main.ts (not required when @nestjs/platform-socket.io is installed). All gateways have `cors: { origin: '*' }`.
  implication: Server-side gateway setup is correct and auto-registered.

- timestamp: 2026-04-22T10:06:00Z
  checked: Raw curl WebSocket upgrade to `ws://localhost:3003/socket.io/?EIO=4&transport=websocket` with Origin: http://localhost:3000
  found: `HTTP/1.1 101 Switching Protocols` + engine.io handshake packet `0{"sid":"...","upgrades":[],"pingInterval":25000,...}` returned immediately.
  implication: WebSocket upgrade is fully functional at the HTTP layer.

- timestamp: 2026-04-22T10:07:00Z
  checked: Node socket.io-client@4.8.3 connecting to `http://localhost:3003/notifications` and `http://localhost:3003/camera-status` with `transports: ['websocket']`
  found: Both connect successfully. `/camera-status` stays connected (no auth required). `/notifications` connects then disconnects with reason `io server disconnect` (gateway rejects due to no session cookie, via `client.disconnect(true)`).
  implication: Full socket.io protocol including namespace handshake works over WebSocket.

- timestamp: 2026-04-22T10:09:00Z
  checked: Headless Chrome (real browser, same version user is running) executing `new WebSocket('ws://localhost:3003/socket.io/?userId=...&orgId=...&EIO=4&transport=websocket')`
  found: onopen fires → receives engine.io handshake → namespace connect succeeds → server disconnect packet received → onclose fires with code=1005, wasClean=true. **onerror does NOT fire. No "WebSocket connection failed" message in console.**
  implication: The specific error in the bug report cannot be reproduced against the currently-running server. The close code 1005 with wasClean=true is not what Chrome reports as "failed".

- timestamp: 2026-04-22T10:10:00Z
  checked: Headless Chrome loaded from `http://localhost:3000` origin, executing WebSocket connect to `ws://localhost:3003/socket.io/?EIO=4&transport=websocket`
  found: `Network.webSocketHandshakeResponseReceived status=101`, `onopen` fired, `0{"sid":...}` received. No errors.
  implication: Cross-origin (localhost:3000 → localhost:3003) WebSocket works from the same origin the real user uses.

- timestamp: 2026-04-22T10:12:00Z
  checked: /tmp/gsd-dev-logs/api.log for NestFactory startup events
  found: API restarted 5 times between 4:14:24 PM and 4:31:35 PM on 2026-04-22 — PIDs 38025 → 38689 → 38816 → 44932 → 45258. Each restart is `nest start --watch` HMR reacting to file changes during Phase 19 UAT work.
  implication: During each restart window (1-4 seconds), port 3003 is not listening, WebSocket connections fail with real "connection refused". socket.io-client retries continuously, producing the exact console spam the reporter described. Once API is up, connections succeed.

- timestamp: 2026-04-22T10:13:00Z
  checked: Web client hook configurations (use-notifications.ts, use-camera-status.ts, use-cluster-nodes.ts, use-srs-logs.ts)
  found: All four hooks pass `transports: ['websocket']` — no polling fallback. When WebSocket fails for ANY transient reason, the client retries WebSocket immediately with no graceful degradation path.
  implication: Latent UX issue — any API restart or network blip during dev becomes highly visible "failed" error spam. Not the reported root cause, but contributes to the painful symptom surface.

- timestamp: 2026-04-22T10:14:00Z
  checked: Better Auth cookie domain vs. WebSocket target origin
  found: authClient uses `baseURL: window.location.origin` (→ http://localhost:3000). Better Auth session cookies are scoped to localhost:3000. WebSocket connects directly to `ws://localhost:3003` (NOT via Next.js proxy). Cookies on :3000 are NOT sent to :3003 — different ports = different origins for cookie scoping.
  implication: Latent correctness bug. NotificationsGateway and SrsLogGateway authenticate via cookie. The cookie is never sent on the WebSocket handshake because the target origin is different. These gateways will ALWAYS reject with `client.disconnect(true)`. StatusGateway and ClusterGateway do NOT check cookies, so they work fine. Not the reported root cause (this failure mode produces clean disconnect, not "failed"), but it's a real bug.

## Resolution

root_cause: The "WebSocket connection failed" errors reported during Phase 19 UAT were almost certainly captured during a `nest start --watch` HMR restart window. API log confirms the API process restarted 5 times in 17 minutes on 2026-04-22 while the tester was working. During each 1-4 second restart window, port 3003 refuses connections, socket.io-client retries WebSocket immediately (no polling fallback), and Chrome logs the exact error pattern reported: createSocket@websocket.js:119, doOpen@websocket.js:24, etc. Once the API finished restarting, connections succeeded — but the already-logged errors remained visible in DevTools console and got attributed to a permanent WebSocket fault.

No code-level fix is required for the REPORTED error. Two latent issues surfaced during investigation:
1. **UX issue**: Four WebSocket hooks hard-code `transports: ['websocket']` with no polling fallback — every transient connectivity hiccup is maximally visible.
2. **Correctness bug**: Cookie-authenticated gateways (NotificationsGateway, SrsLogGateway) can never receive session cookies because the WebSocket target origin (localhost:3003) differs from the auth cookie origin (localhost:3000). These gateways will always reject. Real-time notifications and SRS log viewer are broken in dev until the cookie-domain mismatch is resolved (e.g., by proxying `/socket.io` through Next.js rewrites like `/api` is proxied, or by passing the session token via query/handshake auth).

fix: No code change for the reported symptom. User selected Option D (close + split): close this session as a transient UAT false alarm and spin off the two latent issues as independent debug sessions for future scheduling.

verification: Confirmed server-side WebSocket works end-to-end: (1) curl WebSocket upgrade to ws://localhost:3003/socket.io/ returns HTTP 101 Switching Protocols; (2) Node socket.io-client@4.8.3 connects successfully to `/camera-status` and completes handshake on `/notifications`; (3) headless Chrome loaded from http://localhost:3000 origin completes cross-origin WebSocket handshake to :3003 with onopen fired, no console errors. The reported error pattern is only produced during the 1-4 second API restart window, which aligns with the 5 HMR restarts observed in /tmp/gsd-dev-logs/api.log during Phase 19 UAT.

files_changed: []

## Split Follow-up Sessions

Two latent issues were surfaced during investigation but are out of scope for the reported symptom. Each gets its own debug session for independent triage:

1. **UX polish — transport fallback**: `.planning/debug/socket-hooks-missing-polling-fallback.md`
   - Four web hooks hardcode `transports: ['websocket']` with no polling fallback
   - Every transient dev blip (API HMR, network stall) produces maximally-loud console error spam
   - Fix scope: 4-line edit per file (add `'polling'` to transports array)
   - Risk: very low

2. **Correctness — cookie auth across ports (HIGH severity)**: `.planning/debug/notifications-srs-log-gateways-reject-browser-cookies.md`
   - `NotificationsGateway` + `SrsLogGateway` authenticate via Better Auth session cookie
   - Cookies scoped to localhost:3000 — never sent on WS handshake to localhost:3003
   - Real-time notifications + SRS log viewer are silently broken in dev
   - Recommended fix: add `/socket.io/:path*` rewrite to `apps/web/next.config.ts`
   - Prod impact unknown — confirm prod reverse-proxy setup before scheduling
