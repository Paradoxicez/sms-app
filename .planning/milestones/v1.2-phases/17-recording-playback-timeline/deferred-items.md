# Phase 17 — Deferred / Out-of-Scope Items

Items discovered during plan execution that are NOT caused by Phase 17 changes
and therefore deferred to a separate ticket.

## 17-00 (test scaffolds)

### 1. Worktree-level: missing .env / DATABASE_URL for apps/api tests

- **Discovered during:** Plan 17-00 verification (`pnpm vitest run tests/recordings/`)
- **Symptom:** All 9 existing `apps/api/tests/recordings/*.test.ts` files fail at
  `tests/setup.ts:19` with `PrismaClientInitializationError: Environment variable
  not found: DATABASE_URL.` The new `get-recording.test.ts` (this plan's file)
  passes cleanly because it uses fully-mocked dependencies and does not require
  the global Prisma `$connect`.
- **Root cause:** This worktree (`.claude/worktrees/agent-a516675c`) does not have
  the `apps/api/.env` symlink that the main repo has
  (`apps/api/.env -> ../../.env`). It was not created by this plan.
- **Why deferred:** Out-of-scope per execution scope-boundary rule — pre-existing
  worktree environment issue, not introduced by 17-00 changes. Fixing it would
  require either copying `.env` from main repo or creating a worktree-local
  `.env`, both of which are infrastructure decisions outside Phase 17's plan.
- **Suggested fix:** Add a worktree bootstrap step to GSD orchestrator that
  symlinks or copies `.env` for new worktrees, or ensure the `pnpm install`
  postinstall step handles env wiring.
