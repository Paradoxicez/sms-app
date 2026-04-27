---
phase: 24-deploy-folder-structure-dev-workflow-guardrails
plan: 02
subsystem: infra
tags: [docker, dockerfile, git-mv, deploy-scaffolding]

requires:
  - phase: 02-srs-foundation
    provides: original apps/api/Dockerfile (dev container with FFmpeg + curl + npm ci + nest start:dev)
provides:
  - apps/api/Dockerfile.dev (renamed dev Dockerfile, byte-identical to pre-rename apps/api/Dockerfile)
  - Cleared apps/api/Dockerfile path so Phase 25 can land production multi-stage Dockerfile at the canonical, unsuffixed location
affects:
  - Phase 25 (Production Multi-stage Dockerfile)
  - Phase 26 (Compose Reorg) — references prod image, not Dockerfile
  - Phase 27 (Caddy/TLS)
  - Phase 28 (CI/CD GHCR push)
  - Phase 30 (Clean VM smoke test)

tech-stack:
  added: []
  patterns:
    - "Dockerfile.dev = unused dev container reference; apps/api/Dockerfile (no suffix) is reserved for production multi-stage from Phase 25 onward"
    - "Use `git mv` for any future structural rename so similarity-100% rename is recorded and `git log --follow` keeps original history"

key-files:
  created:
    - apps/api/Dockerfile.dev (renamed from apps/api/Dockerfile, byte-identical, 23 lines via wc)
  modified: []

key-decisions:
  - "Used `git mv` (not `mv` + `git rm` + `git add`) so the rename is recorded as similarity 100% (R100). This preserves `git log --follow apps/api/Dockerfile.dev` history all the way back to commit 4cf5a3d (Phase 02-01 where SRS + API Dockerfile were first added)."
  - "Did NOT edit Dockerfile.dev content during the rename — stale `EXPOSE 3001` line preserved per D-06. Cleanup of stale config (actual dev port is 3003 per .env) is explicitly out-of-scope for Phase 24."
  - "Did NOT create a placeholder apps/api/Dockerfile at the old path — Phase 25 owns that file."
  - "Did NOT touch docker-compose.yml — preserves D-05/D-20 (root dev compose has zero `build:` directives; api+web run on host via pnpm dev)."

patterns-established:
  - "Dockerfile naming convention: `Dockerfile` = production (Phase 25+), `Dockerfile.dev` = dev reference (kept but unused by dev compose). Phase 25 will land prod at the unsuffixed path."
  - "Atomic structural rename pattern: pre-hash → git mv → post-hash → assert equal. Embedded byte-identity proof in the rename command makes regression-of-content impossible to miss."

requirements-completed: []  # Phase 24 has NO REQ-IDs — preventive structural work per v1.3 roadmap

duration: <1min
completed: 2026-04-27
---

# Phase 24 Plan 02: Rename apps/api/Dockerfile → apps/api/Dockerfile.dev Summary

**git mv apps/api/Dockerfile → apps/api/Dockerfile.dev — byte-identical (hash 2184cc68fa118f05f7d90cdd465c704ad030b995), R100 rename, history preserved, zero content edits, zero impact on dev workflow.**

## Performance

- **Duration:** ~1 min (actual git mv + verification: 43 sec)
- **Started:** 2026-04-27T13:53:56Z
- **Completed:** 2026-04-27T13:54:39Z
- **Tasks:** 1
- **Files modified:** 1 (rename only — zero content diff)

## Accomplishments

- Renamed `apps/api/Dockerfile` → `apps/api/Dockerfile.dev` via `git mv` with byte-identity proof (PRE_HASH == POST_HASH).
- Cleared the canonical `apps/api/Dockerfile` path so Phase 25 can land the production multi-stage Dockerfile there without filename collision or ambiguity.
- Preserved all 23 lines (24 with trailing newline) including the stale `EXPOSE 3001` directive — explicitly out-of-scope per D-06; Phase 25 may refactor.
- Confirmed git rename detection records the change as similarity 100% (`R100\tapps/api/Dockerfile\tapps/api/Dockerfile.dev`).
- Verified `git log --follow apps/api/Dockerfile.dev` traces back to the original commit (4cf5a3d, Phase 02-01).
- Left `docker-compose.yml` byte-for-byte unchanged (per D-05/D-20).

## Task Commits

1. **Task 1: git mv apps/api/Dockerfile → apps/api/Dockerfile.dev** — `8b54ace` (chore)

## Files Created/Modified

- `apps/api/Dockerfile.dev` — Renamed dev Dockerfile (byte-identical to pre-rename `apps/api/Dockerfile`); 23 lines via wc, single-stage `node:22-slim` + FFmpeg + curl + `npm ci` + Prisma generate + `npm run start:dev`. Stale `EXPOSE 3001` preserved per D-06.
- `apps/api/Dockerfile` — Removed (rename only; tracked by Git as `R100`).

## Decisions Made

- **`git mv` over `mv` + `git rm` + `git add`** — Only `git mv` produces an atomic stage with similarity-100% rename detection; the alternative would split into delete + add and lose `git log --follow` continuity (D-04 requirement).
- **Zero content edits** — D-06 mandates byte-identity. The `EXPOSE 3001` line is stale (actual dev port is 3003 per `.env`), but cleanup is explicitly Phase 25's call, not Phase 24's.
- **No placeholder at old path** — Phase 25 owns `apps/api/Dockerfile`. Leaving it absent is the signal.

## Deviations from Plan

None — plan executed exactly as written. Single task, single rename, byte-identical content, atomic commit.

## Verification Output

### Pre-rename / post-rename hash check (embedded in rename command)
```
PRE_HASH=2184cc68fa118f05f7d90cdd465c704ad030b995
POST_HASH=2184cc68fa118f05f7d90cdd465c704ad030b995
Rename complete: apps/api/Dockerfile -> apps/api/Dockerfile.dev (hash 2184cc68fa118f05f7d90cdd465c704ad030b995)
```

### git status (pre-commit)
```
On branch worktree-agent-afe8bac8c4aa493d5
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
	renamed:    apps/api/Dockerfile -> apps/api/Dockerfile.dev
```

### git diff --cached --diff-filter=R --name-status
```
R100	apps/api/Dockerfile	apps/api/Dockerfile.dev
```

### git diff --cached --stat
```
apps/api/{Dockerfile => Dockerfile.dev} | 0
1 file changed, 0 insertions(+), 0 deletions(-)
```

### Acceptance criteria checks (all pass)
- `! test -e apps/api/Dockerfile` → OK (old path gone)
- `test -f apps/api/Dockerfile.dev` → OK (new path present)
- `git ls-files apps/api/Dockerfile` → empty (file no longer tracked at old path)
- `git ls-files apps/api/Dockerfile.dev` → `apps/api/Dockerfile.dev` (tracked at new path)
- `wc -l apps/api/Dockerfile.dev` → 23 (matches pre-rename file)
- `grep -F 'FROM node:22-slim' apps/api/Dockerfile.dev` → exit 0
- `grep -F 'EXPOSE 3001' apps/api/Dockerfile.dev` → exit 0 (stale preserved per D-06)
- `grep -F 'CMD ["npm", "run", "start:dev"]' apps/api/Dockerfile.dev` → exit 0
- `grep -nE '^\s*build:' docker-compose.yml` → no matches (root dev compose still has zero `build:` references)
- PRE_HASH == POST_HASH → byte-identical content

### git log --follow continuity proof
```
8b54ace chore(24-02): rename apps/api/Dockerfile -> apps/api/Dockerfile.dev
4cf5a3d feat(02-01): add SRS container, srs.conf, and API Dockerfile with FFmpeg
```
Original Phase 02-01 commit (4cf5a3d) remains reachable through the rename.

## Threat Mitigation Status

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-24-04 (Tampering — Phase 25 subagent overwrites Dockerfile.dev) | mitigate | Deferred to Plan 05 (Wave 2) — CLAUDE.md "## Deploy Folder Convention" rule will lock the convention. This plan only performs the rename; the convention guardrail is not in this plan's scope. |
| T-24-05 (Info disclosure — Dockerfile contents) | accept | No action needed (no secrets in dev Dockerfile). |
| T-24-06 (Repudiation — git history loss on rename) | mitigate | DONE — `git mv` recorded as `R100` (similarity 100%); `git log --follow apps/api/Dockerfile.dev` traces back to 4cf5a3d. |

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `apps/api/Dockerfile` path is now free for Phase 25's production multi-stage Dockerfile.
- `apps/api/Dockerfile.dev` exists as a documented dev reference; no compose service builds from it (root `docker-compose.yml` has zero `build:` directives — api+web run on host via `pnpm dev`).
- Plan 05 (Wave 2) will add the CLAUDE.md "## Deploy Folder Convention" guardrail to lock this naming for future Phase 25+ subagents (T-24-04 mitigation).
- Dev workflow (`pnpm dev`) verification deferred to Plan 04 smoke script and Plan 05 D-22 checklist (per `<verification>` block in the PLAN).

## Self-Check: PASSED

- FOUND: apps/api/Dockerfile.dev (file exists)
- MISSING (expected): apps/api/Dockerfile (rename target — old path correctly removed)
- FOUND: commit 8b54ace (chore(24-02): rename apps/api/Dockerfile -> apps/api/Dockerfile.dev)
- FOUND: byte-identity proof (PRE_HASH == POST_HASH == 2184cc68fa118f05f7d90cdd465c704ad030b995)
- FOUND: R100 rename in `git diff --cached --diff-filter=R --name-status`
- FOUND: `git log --follow` reaches original Phase 02-01 commit 4cf5a3d

---
*Phase: 24-deploy-folder-structure-dev-workflow-guardrails*
*Plan: 02*
*Completed: 2026-04-27*
