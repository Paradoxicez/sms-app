# Deferred Items — Phase 20

Out-of-scope discoveries encountered during plan execution. Each item is
pre-existing (not introduced by this phase) and tracked for a future phase
or quick task.


## Phase 20 Plan 01 — TypeScript baseline

Five pre-existing `pnpm tsc --noEmit` errors in apps/api (confirmed at the
Plan 01 base commit b45a7d7):

| File | Line | Code | Summary |
|------|------|------|---------|
| src/account/avatar/avatar.controller.ts | 55:19 | TS2694 | `Namespace 'global.Express' has no exported member 'Multer'` — @types/multer ambient types not registered |
| src/cameras/cameras.controller.ts | 57:5 | TS2322 | `playbackRef: PlaybackService | null` assigned to `PlaybackService` — lazy-resolve pattern, needs non-null return or `!` assertion |
| src/cluster/cluster.gateway.ts | 15:22 | TS2564 | `server` no initializer — add `!` or initialize in constructor |
| src/recordings/minio.service.ts | 9:11 | TS2564 | `client` no initializer — same |
| src/status/status.gateway.ts | 16:22 | TS2564 | `server` no initializer — same |

Plan 01 did NOT modify these files in ways that changed the error set
(verified with `git stash && tsc --noEmit && git stash pop`). Tracked here
so downstream plans and the verifier know these predate the phase.
