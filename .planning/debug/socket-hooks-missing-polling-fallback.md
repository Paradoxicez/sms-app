---
status: draft
severity: low
category: UX polish
trigger: "Four socket hooks hardcode `transports: ['websocket']` without polling fallback — dev console spams on every transient blip"
created: 2026-04-22T17:30:00Z
updated: 2026-04-22T17:30:00Z
spun_off_from: .planning/debug/resolved/websocket-socketio-connection-fails.md
---

## Current Focus

hypothesis: Adding `'polling'` as secondary transport will let Socket.IO gracefully downgrade during transient blips (API HMR restarts, network stalls), keeping console clean while still preferring websocket when available.
test: (not yet run) After fix, trigger an API restart via file save while DevTools is open — verify no "WebSocket connection failed" spam (at most one warn during upgrade attempt).
expecting: Polling fallback absorbs reconnect attempts silently; upgrade to websocket completes once API is up again.
next_action: Start investigation via `/gsd-debug socket-hooks-missing-polling-fallback`

## Symptoms

expected: During API dev server restarts (nest --watch triggered by file saves), Socket.IO client should quietly attempt reconnection without filling DevTools console with `WebSocket connection to ws://... failed` errors. The web app's real-time features should resume automatically once the API is back up.

actual: Every API restart (5 observed in one 17-minute UAT window) produces at least one "WebSocket connection failed" console error per active socket hook. With 4 hooks active on the cameras admin page (notifications, camera status, cluster nodes, SRS logs — when applicable), each restart produces up to 4+ errors. This creates noise that:
- Masks real errors during UAT
- Confuses testers who interpret HMR-transient noise as bugs (exactly what happened in the parent session)
- Degrades the dev experience for everyone

reproduction:
1. Start API + Web dev servers
2. Login to `/admin/cameras` as Org Admin (active sockets: notifications, camera-status)
3. Open DevTools Console
4. Edit any file in `apps/api/src/` to trigger nest --watch rebuild
5. Observe repeated `WebSocket connection to ws://localhost:3003/socket.io/... failed` errors during the rebuild window

timeline: Pattern has existed since socket hooks were introduced — only surfaced clearly during Phase 19 UAT on 2026-04-22 because file activity was concentrated and testers had DevTools open.

## Affected Files

- `apps/web/src/hooks/use-notifications.ts` — hardcodes `transports: ['websocket']`
- `apps/web/src/hooks/use-camera-status.ts` — same
- `apps/web/src/hooks/use-cluster-nodes.ts` — same
- `apps/web/src/hooks/use-srs-logs.ts` — same

## Root Cause

All four hooks construct the Socket.IO client with `transports: ['websocket']` only, disabling Socket.IO's default polling fallback. When websocket fails for ANY reason (API down, network glitch, upgrade refused), the client has nothing to fall back to and logs the failure loudly.

## Fix Strategy

**Recommended:** Change `transports: ['websocket']` → `transports: ['websocket', 'polling']` in all 4 hooks.

- `'websocket'` stays first → Socket.IO prefers websocket when available (no performance regression)
- `'polling'` second → transient blips get absorbed silently via HTTP long-polling fallback
- Once websocket becomes available again, client auto-upgrades
- This is the Socket.IO default (these hooks override it) — matches documented best practice

**Risk:** very low. Polling is a well-trodden path in Socket.IO; the library has handled the websocket-vs-polling dance since v0.7.

**Rejected alternatives:**
- Add exponential backoff with silent-log threshold — more complex, doesn't solve the actual transport issue
- Wrap `io()` in a custom error handler that suppresses "failed" logs — masks real failures too

## Acceptance Criteria

- [ ] `grep -rE "transports:\s*\[\s*'websocket'\s*\]" apps/web/src/hooks/` returns 0 matches (after fix)
- [ ] `grep -rE "'websocket',\s*'polling'" apps/web/src/hooks/` returns at least 4 matches
- [ ] Manual: trigger API restart with DevTools open → no "WebSocket connection failed" spam (at most 1-2 low-severity warnings during transport negotiation)
- [ ] Manual: real-time features still work (notifications, camera status updates) — polling fallback is transparent

## Related

- Parent investigation: `.planning/debug/resolved/websocket-socketio-connection-fails.md`
- Sister session: `.planning/debug/notifications-srs-log-gateways-reject-browser-cookies.md` (separate correctness bug, unrelated to transport fallback)
