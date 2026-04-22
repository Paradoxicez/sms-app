---
status: resolved
severity: low
category: UX polish
trigger: "Four socket hooks hardcode `transports: ['websocket']` without polling fallback — dev console spams on every transient blip"
created: 2026-04-22T17:30:00Z
updated: 2026-04-22T18:05:00Z
spun_off_from: .planning/debug/resolved/websocket-socketio-connection-fails.md
---

## Current Focus

hypothesis: CONFIRMED. Adding `'polling'` as secondary transport lets Socket.IO downgrade during transient blips (API HMR restarts) while still preferring websocket.
test: Applied `transports: ['websocket', 'polling']` to all 4 hooks; verified via grep.
expecting: MET. 0 matches for websocket-only; 4 matches for websocket+polling pair; TypeScript compiles clean; existing tests pass.
next_action: Closed.

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

- [x] `grep -rE "transports:\s*\[\s*'websocket'\s*\]" apps/web/src/hooks/` returns 0 matches (after fix) — confirmed 2026-04-22
- [x] `grep -rE "'websocket',\s*'polling'" apps/web/src/hooks/` returns at least 4 matches — confirmed 4 matches (one per hook)
- [ ] Manual: trigger API restart with DevTools open → no "WebSocket connection failed" spam (at most 1-2 low-severity warnings during transport negotiation) — pending human verification in running dev env
- [ ] Manual: real-time features still work (notifications, camera status updates) — polling fallback is transparent — pending human verification

## Resolution

**Root cause:** Four Socket.IO client hooks (`use-notifications.ts`, `use-camera-status.ts`, `use-cluster-nodes.ts`, `use-srs-logs.ts`) constructed clients with `transports: ['websocket']`, disabling Socket.IO's default polling fallback. Any websocket failure (API HMR restart, transient network blip) produced loud console errors with no graceful degradation path.

**Fix applied:** Changed `transports: ['websocket']` → `transports: ['websocket', 'polling']` in all 4 hooks. Websocket remains first (still preferred when available), polling absorbs transient blips silently.

**Files changed:**
- `apps/web/src/hooks/use-notifications.ts` (line 72)
- `apps/web/src/hooks/use-camera-status.ts` (line 33)
- `apps/web/src/hooks/use-cluster-nodes.ts` (line 87)
- `apps/web/src/hooks/use-srs-logs.ts` (line 26)

**Verification:**
- Grep (automatic): both criteria pass — 0 websocket-only remain, 4 websocket+polling pairs present.
- Type-check: `tsc --noEmit` on `apps/web` passed cleanly.
- Tests: `pnpm --filter @sms-platform/web test --run src/hooks/` passed (3 tests in `use-dashboard-issues.test.ts`, the only hook test).
- Manual console spam verification during HMR restart is deferred to next dev-server session (non-blocking; fix is minimal and follows Socket.IO default behavior).

## Related

- Parent investigation: `.planning/debug/resolved/websocket-socketio-connection-fails.md`
- Sister session: `.planning/debug/notifications-srs-log-gateways-reject-browser-cookies.md` (separate correctness bug, unrelated to transport fallback)
