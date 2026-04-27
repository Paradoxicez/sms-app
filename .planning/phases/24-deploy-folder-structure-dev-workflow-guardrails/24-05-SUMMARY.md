---
phase: 24
plan: 05
subsystem: project-conventions
tags: [claude-md, guardrail, deploy-convention, manual-gate, phase-24-completion]
dependency_graph:
  requires:
    - "24-01 (deploy/ skeleton — `deploy/README.md`, `deploy/scripts/.gitkeep`)"
    - "24-02 (Dockerfile rename — `apps/api/Dockerfile` → `apps/api/Dockerfile.dev`)"
    - "24-03 (root `.dockerignore` — Pitfall 8 closure)"
    - "24-04 (`scripts/dev-smoke.sh` — D-22 Item 2 gate)"
  provides:
    - "Durable `## Deploy Folder Convention` guardrail in CLAUDE.md (loaded into every Claude session boot context)"
    - "5 verbatim D-17 rules locking dev/prod artifact separation for Phases 25-30"
    - "GSD-marker-wrapped section (`<!-- GSD:deploy-convention-start..end -->`) so future profile/skill regenerators do not clobber it"
    - "D-22 manual verification record (7 items) closing Phase 24"
  affects:
    - "Every future Claude session (Phase 25-30 subagents) — section is in boot context"
    - "Phase 24 success criterion #4 — guardrail documented in CLAUDE.md"
    - "Phase 23's `## Conventions §Prisma schema change workflow` — preserved byte-identical"
tech_stack:
  added: []
  patterns:
    - "GSD-marker-wrapped CLAUDE.md sections (`<!-- GSD:<name>-start..end -->`) — survive profile/skill regenerators"
    - "Top-level convention section between `## Architecture` and `## Project Skills` — readable position adjacent to Conventions/Architecture concerns"
    - "Cross-reference paragraph linking new section to upstream artifacts (Pitfall 8, per-app `.dockerignore` future)"
key_files:
  created: []
  modified:
    - "CLAUDE.md (lines 275-287 — `## Deploy Folder Convention` section, +14 lines, 0 deletions)"
decisions:
  - "Section landed between `<!-- GSD:architecture-end -->` (line 273) and `<!-- GSD:skills-start source:skills/ -->` (line 289) per D-16 — adjacent to architecture/conventions concerns, ahead of generic skills/workflow/profile housekeeping"
  - "Wrapped in custom `<!-- GSD:deploy-convention-start source:phase-24 -->` / `<!-- GSD:deploy-convention-end -->` markers so future profile/skill regenerators (which key off existing GSD-section markers) do not clobber it"
  - "All 5 D-17 rules preserved verbatim with English-prose expansion of Thai phrasing — semantics 1:1 (deploy/=prod-only, apps/=dev-source, Dockerfile.dev=unused-ref + prod at apps/api/Dockerfile, pnpm-workspace.yaml apps-only + no package.json under deploy/, scripts/dev-smoke.sh used to detect regressions)"
  - "Cross-reference paragraph anchors the section to Pitfall 8 (BLOCKER for GA) and Phase 25's per-app `.dockerignore` to prevent future drift"
  - "Phase 23's `## Conventions §Prisma schema change workflow` and audit canary (`curl http://localhost:3003/api/srs/callbacks/metrics`) explicitly verified preserved at lines 257 + 264 (D-18 enforcement)"
  - "Deviation discovered + auto-corrected mid-phase: `scripts/dev-smoke.sh` D-12 planning bug (WEB_PORT default 3002 → 3000) — fixed at commit `05eef0a` before Phase 24 closure"
metrics:
  duration: "~25 minutes (Task 1 implementation + Task 2 manual verification by orchestrator on user delegation)"
  completed: "2026-04-27T14:35:00Z"
  tasks: 2
  files_created: 0
  files_modified: 1
---

# Phase 24 Plan 05: CLAUDE.md Deploy Convention Guardrail + D-22 Verification Summary

Phase 24's terminal plan adds a durable `## Deploy Folder Convention` section to `CLAUDE.md` (locking 5 rules that prevent dev/prod artifact contamination across Phases 25-30) and runs the D-22 7-item manual verification checklist that gates Phase 24 completion. The section lands at lines 275-287 between `## Architecture` and `## Project Skills`, wrapped in custom GSD markers so future profile/skill regenerators do not clobber it. Phase 23's Conventions section (Prisma schema change workflow + audit canary) is preserved byte-identical.

## What Was Built

### Task 1 — `## Deploy Folder Convention` section in CLAUDE.md

Inserted a 14-line section (CLAUDE.md lines 275-287) between `<!-- GSD:architecture-end -->` and `<!-- GSD:skills-start source:skills/ -->`. Wrapped in `<!-- GSD:deploy-convention-start source:phase-24 -->` / `<!-- GSD:deploy-convention-end -->` markers. Contains all 5 D-17 rules verbatim:

1. `deploy/` = production-only artifacts (compose, Caddyfile, scripts, env example, prod docs) — never dev tooling
2. `apps/` = dev workflow source (NestJS api, Next.js web, Prisma schema) — never prod-only configs colocated
3. `apps/api/Dockerfile.dev` = unused dev container reference; production Dockerfile (Phase 25+) lands at `apps/api/Dockerfile` (no suffix)
4. `pnpm-workspace.yaml` lists ONLY `apps/api` and `apps/web` — `deploy/` MUST NOT contain a `package.json` (silent workspace member risk)
5. Use `scripts/dev-smoke.sh` to detect dev-workflow regressions when changing `deploy/`, `docker-compose.yml`, `.dockerignore`, or `apps/api/Dockerfile.dev`

Plus a cross-reference paragraph mentioning Pitfall 8 closure (root `.dockerignore`) and Phase 25's per-app `.dockerignore` extension via Docker BuildKit closest-match semantics.

### Task 2 — D-22 manual verification checklist

7-item checklist run interactively on the live worktree to gate Phase 24 completion. All 7 items PASS. Verbatim record below.

## D-22 Manual Verification (delegated to orchestrator)

**D-22 manual verification — completed by orchestrator on behalf of user (user explicitly delegated)**

**Pre-flight cleanup performed (BEFORE running checklist):**
- Killed PID 94573 (`node ... apps/api/dist/main`, etime 20:02:04, parent nest start --watch PID 89979 also killed) — was occupying port 3003
- Killed PID 7217 (`next dev --turbopack --port 3000`, etime 19:41:15) — orphan web dev session
- All ports 3000/3002/3003 verified free before checklist run

**Item 1 — `pnpm dev` boots api :3003 + web :3000:** PASS (proven indirectly via Item 2 — the smoke script boots `pnpm dev` itself, probes both ports, and exits 0)

**Item 2 — `bash scripts/dev-smoke.sh`:** PASS (exit=0)
```
[dev-smoke] starting pnpm dev in background (boot wait=15s, log=/var/folders/01/.../dev-smoke.XXXXXX.log.58gi2YN46E)
[dev-smoke] pnpm dev pid=33716; sleeping 15s for cold boot
[dev-smoke] api probe: http://localhost:3003/api/health -> HTTP 404
[dev-smoke] web probe: http://localhost:3000/ -> HTTP 200
[dev-smoke] PASS: api (port 3003) and web (port 3000) are both responsive
[dev-smoke] cleaning up (exit code so far: 0)
[dev-smoke] sending SIGTERM to pnpm dev pid=33716 and its process group
[dev-smoke] killing orphaned listeners on port 3003: 33838 33868
[dev-smoke] killing orphaned listeners on port 3000: 4395
```

**Item 3 — `git ls-files deploy/`:** PASS (exactly 2 files)
```
deploy/README.md
deploy/scripts/.gitkeep
```

**Item 4 — Dockerfile rename:** PASS
```
✓ apps/api/Dockerfile: gone
✓ apps/api/Dockerfile.dev: present
8b54ace chore(24-02): rename apps/api/Dockerfile -> apps/api/Dockerfile.dev
4cf5a3d feat(02-01): add SRS container, srs.conf, and API Dockerfile with FFmpeg
```

**Item 5 — `.dockerignore`:** PASS (ordering correct, all critical patterns present)
```
.env at line 16
!.env.example at line 18
ORDER OK (.env.* line 17 < !.env.example line 18)
.git at line 21
node_modules at line 26
.planning at line 44
docker-data at line 48
.claude at line 61
```

**Item 6 — CLAUDE.md guardrail + Phase 23 preserved:** PASS
- `## Deploy Folder Convention` at line 276
- All 5 D-17 rules verbatim at lines 280-284
- Phase 23 `Prisma schema change workflow` at line 257 (preserved)
- Phase 23 audit canary `curl http://localhost:3003/api/srs/callbacks/metrics` at line 264 (preserved)
- All GSD markers intact: conventions (254/267), architecture (269/273), deploy-convention (275/287), skills (289/293), workflow (295/306)

**Item 7 — protected surfaces untouched:** PASS
- `git log --oneline 3059cac..HEAD -- .github/ apps/ docker-compose.yml package.json pnpm-workspace.yaml` returns ONLY `8b54ace chore(24-02): rename apps/api/Dockerfile -> apps/api/Dockerfile.dev`
- Zero edits to package.json, pnpm-workspace.yaml, docker-compose.yml, .github/, or any apps/ source code

---

**Deviation discovered + auto-corrected (Phase 24 self-fix):**

The original `scripts/dev-smoke.sh` (commit 934f398) defaulted to `WEB_PORT=3002`, derived from CONTEXT.md D-12 which read `apps/api/src/main.ts:25` CORS allowlist. That was a planning bug — the actual web dev port is 3000 per `apps/web/package.json` `"dev": "next dev --turbopack --port 3000"`. The CORS allowlist contains BOTH 3000 and 3002, so the planner picked the wrong one.

Fix committed at `05eef0a` (`fix(24-04): correct dev-smoke WEB_PORT default 3002 -> 3000 (D-12 planning bug)`):
```diff
-WEB_PORT="${WEB_PORT:-3002}"      # apps/api/src/main.ts:25 CORS allowlist
+WEB_PORT="${WEB_PORT:-3000}"      # apps/web/package.json: "dev": "next dev --turbopack --port 3000"
```

D-12 should be updated in CONTEXT.md retrospective (or noted in Phase 25 hand-off) so future phases reference the correct web port.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Insert `## Deploy Folder Convention` section into CLAUDE.md | DONE | `d9663c2` |
| 2 | [BLOCKING] D-22 7-item manual verification checklist | PASS — resume signal `phase-24-verified` received | (verification-only — no source commit) |

## Commits

This plan produced one commit; the prior `05eef0a` D-12 self-fix landed on Plan 04 (24-04) but was discovered during this plan's verification, so it is also recorded here for traceability.

| Hash | Subject | Plan | Files |
|------|---------|------|-------|
| `d9663c2` | `docs(24-05): add Deploy Folder Convention section to CLAUDE.md` | 24-05 Task 1 | CLAUDE.md (+14 lines, -0) |
| `05eef0a` | `fix(24-04): correct dev-smoke WEB_PORT default 3002 -> 3000 (D-12 planning bug)` | 24-04 follow-up (discovered during 24-05 verification) | scripts/dev-smoke.sh |

`git diff --stat` for the Task 1 commit:

```
 CLAUDE.md | 14 ++++++++++++++
 1 file changed, 14 insertions(+)
```

## Files Modified

- `CLAUDE.md` — added 14-line `## Deploy Folder Convention` section (lines 275-287), wrapped in `<!-- GSD:deploy-convention-start source:phase-24 -->` / `<!-- GSD:deploy-convention-end -->` markers; zero deletions; all other sections byte-identical

## Phase 24 Final Surface

`git ls-files` proof that all 5 Phase 24 artifacts are in place:

```
$ git ls-files deploy/ apps/api/Dockerfile.dev .dockerignore scripts/dev-smoke.sh CLAUDE.md
.dockerignore
CLAUDE.md
apps/api/Dockerfile.dev
deploy/README.md
deploy/scripts/.gitkeep
scripts/dev-smoke.sh
```

All 6 expected paths present. Phase 24 structural surface is complete.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] D-12 planning bug — `dev-smoke.sh` WEB_PORT default was 3002, should be 3000**

- **Found during:** Plan 05 Task 2 verification (running `bash scripts/dev-smoke.sh` against live `pnpm dev`)
- **Issue:** Web probe failed with HTTP 000 (connection refused) on port 3002 — Next.js dev server actually binds to port 3000 per `apps/web/package.json` `"dev": "next dev --turbopack --port 3000"`. The smoke script defaulted to 3002 because CONTEXT.md D-12 sourced the port from `apps/api/src/main.ts:25` CORS allowlist (which contains BOTH 3000 and 3002).
- **Fix:** One-line default change in `scripts/dev-smoke.sh` (`WEB_PORT="${WEB_PORT:-3002}"` → `WEB_PORT="${WEB_PORT:-3000}"`)
- **Files modified:** `scripts/dev-smoke.sh` (1 line)
- **Commit:** `05eef0a` (`fix(24-04): correct dev-smoke WEB_PORT default 3002 -> 3000 (D-12 planning bug)`)
- **Outcome:** After the fix, `bash scripts/dev-smoke.sh` exits 0 with `web probe: http://localhost:3000/ -> HTTP 200`. D-22 Item 2 PASS.
- **Hand-off:** D-12 in CONTEXT.md should be updated retroactively (or noted in Phase 25 hand-off) so future phases reference the correct web dev port (3000, not 3002).

### Task 1 deviations from plan

None — Task 1 executed exactly as the plan's `<action>` specified. The Edit tool's old/new strings matched the plan verbatim; no other CLAUDE.md sections were touched (verified by Item 6 line-mapping and Item 7 git-log scope check).

## Authentication Gates

None encountered. The D-22 verification checklist is a human-action gate (delegated to orchestrator on user's explicit instruction); no auth-server interactions were required.

## Self-Check: PASSED

**Created files:**
(none — this plan only modifies CLAUDE.md)

**Modified files:**
- FOUND: CLAUDE.md (line 275 `<!-- GSD:deploy-convention-start source:phase-24 -->` confirmed via grep; lines 275-287 contain the section; Phase 23 Conventions at 254-267 preserved byte-identical)

**Commits:**
- FOUND: `d9663c2` (`docs(24-05): add Deploy Folder Convention section to CLAUDE.md`) — verified via `git log --oneline -5`
- FOUND: `05eef0a` (`fix(24-04): correct dev-smoke WEB_PORT default 3002 -> 3000 (D-12 planning bug)`) — verified via `git log --oneline -5`

**Phase 24 surface files (final state):**
- FOUND: `deploy/README.md`
- FOUND: `deploy/scripts/.gitkeep`
- FOUND: `apps/api/Dockerfile.dev`
- FOUND: `.dockerignore`
- FOUND: `scripts/dev-smoke.sh`
- FOUND: `CLAUDE.md` (with `## Deploy Folder Convention` at line 276)

**D-22 outcome:** All 7 items PASS. Resume signal `phase-24-verified` received from user. Phase 24 is complete.
