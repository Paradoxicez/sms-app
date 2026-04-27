# Phase 16 — Deferred Items

Items discovered during Phase 16-01 execution that were NOT part of this plan's scope.

## Resolution status (as of 2026-04-19 gap closure)

All items listed below were resolved in the Phase 16 gap-closure sweep.
The latest full-suite run reports **0 failures / 433 passing / 111 todo**.

### Pre-existing test failures — RESOLVED (commit `c198ec2`)

| File | Status | Fix |
|------|--------|-----|
| tests/admin/super-admin.test.ts | passed | `vi.mock('esm-loader')` swap + `initAuth()` in `beforeAll` |
| tests/auth/sign-in.test.ts | passed | same esm-loader mock |
| tests/cluster/cluster.service.test.ts | passed | stubbed `globalThis.fetch` so testConnection succeeds → CONNECTING |
| tests/cluster/load-balancer.test.ts | passed | asserted URL shape instead of pinned `srs:8080` host |
| tests/packages/package-limits.test.ts | passed | aligned assertion with admin-view findAll (returns all, isActive flag) |
| tests/recordings/manifest.test.ts | passed | source emits `#EXT-X-VERSION:7` (required for fMP4 `EXT-X-MAP`) |
| tests/recordings/schedule.test.ts | passed | source handles midnight-crossing windows via split range |
| tests/srs/callbacks.test.ts | passed | `parseStreamKey` only strips `-{seq}` when a segment extension was present |
| tests/srs/config-generator.test.ts | passed | `hls_use_fmp4 on` added; callbacks resolve via env |
| tests/srs/on-play-verification.test.ts | passed | fixed together with parseStreamKey |
| tests/streams/ffmpeg-command.test.ts | passed | test calls `simulateEnd` — `stopStream` defers removal |
| tests/streams/reconnect.test.ts | passed | test matches rtmp path shape rather than pinned `srs:1935` host |

### Phase-16 side findings — RESOLVED

- **Audit log duplicate entries** — not a real bug. The two rows turned out to be separate user-create events `~87ms` apart (demo.admin + demo.viewer), both correctly attributed to Demo Tenant org.
- **Audit log Actor column = "System"** — resolved in commit `e2cc96c`. `AuditService.findAll` now hand-hydrates `user: { name, email }` onto each row because `AuditLog` has no FK relation to `User`.
