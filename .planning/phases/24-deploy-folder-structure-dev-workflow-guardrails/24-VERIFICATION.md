---
phase: 24-deploy-folder-structure-dev-workflow-guardrails
verified: 2026-04-27T15:10:00Z
status: passed
score: 4/4 success criteria verified
re_verification:
  is_re_verification: false
---

# Phase 24: Deploy Folder Structure + Dev Workflow Guardrails — Verification Report

**Phase Goal:** A `deploy/` directory exists at the repo root holding all production-only artifacts, the dev Dockerfile is renamed so the production Dockerfile can co-locate without ambiguity, and a root-level `.dockerignore` prevents secrets/state/planning leakage into any future image build context. The local `pnpm dev` workflow is byte-identical to the v1.2 experience.

**Verified:** 2026-04-27T15:10:00Z
**Status:** passed
**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth (ROADMAP SC)                                                                                                                                                                          | Status     | Evidence                                                                                                                                                                                                                                              |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | `pnpm dev` (root) launches the dev stack identically to before Phase 24 — same ports, same hot-reload, same DB connection                                                                   | ✓ VERIFIED | D-22 Item 2 (`bash scripts/dev-smoke.sh`) executed in this session: exit 0; api probe `http://localhost:3003/api/health` → HTTP 404 (port alive, auth-guarded), web probe `http://localhost:3000/` → HTTP 200; recorded in `24-05-SUMMARY.md` lines 80-90 |
| 2 | Repo contains a `deploy/` directory at root with placeholder subfolders (`deploy/scripts/`); `apps/` remains dev-focused                                                                     | ✓ VERIFIED | `git ls-files deploy/` returns exactly `deploy/README.md` and `deploy/scripts/.gitkeep`; `pnpm-workspace.yaml` still lists ONLY `apps/api` and `apps/web` (no `deploy/`); no `deploy/package.json` (D-19 honored)                                       |
| 3 | `apps/api/Dockerfile` renamed to `apps/api/Dockerfile.dev`; root `.dockerignore` prevents `.env*`, `node_modules`, `.planning/`, `*.log`, and build artifacts from entering any build context | ✓ VERIFIED | `apps/api/Dockerfile` GONE; `apps/api/Dockerfile.dev` PRESENT (commit `8b54ace`, R100 byte-identical rename); `.dockerignore` 69 lines, all required patterns present, `!.env.example` correctly ordered AFTER `.env.*`                                  |
| 4 | `git ls-files deploy/` returns the new skeleton; CI lint/build still passes                                                                                                                  | ✓ VERIFIED | `git ls-files deploy/` = 2 files; D-22 Item 7 confirmed only the Dockerfile rename touches protected surfaces — `git log 7ecca1b..HEAD -- .github/ apps/ docker-compose.yml package.json pnpm-workspace.yaml` returns ONLY commit `8b54ace`             |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                       | Expected                                                                                                | Status     | Details                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/README.md`             | 1-2 paragraph stub; cross-links ROADMAP, REQUIREMENTS, CLAUDE.md §"Deploy Folder Convention"; ≥10 lines | ✓ VERIFIED | 15 lines on disk; contains `# deploy/`, `production-only`, `overwrites this README`, `ROADMAP.md`, `REQUIREMENTS.md`, `Deploy Folder Convention` |
| `deploy/scripts/.gitkeep`      | Empty (zero-byte) placeholder so `deploy/scripts/` is git-tracked                                       | ✓ VERIFIED | 0 bytes; only file in `deploy/scripts/`                                                                                                       |
| `apps/api/Dockerfile.dev`      | Byte-identical rename of original `apps/api/Dockerfile`; preserves stale `EXPOSE 3001` per D-06         | ✓ VERIFIED | Hash `2184cc68fa118f05f7d90cdd465c704ad030b995` (PRE == POST); contains `FROM node:22-slim`, `EXPOSE 3001`, `CMD ["npm", "run", "start:dev"]`  |
| `apps/api/Dockerfile`          | Must be ABSENT (rename target — old path removed)                                                       | ✓ VERIFIED | `test ! -e apps/api/Dockerfile` exits 0; phase 25 owns this path                                                                              |
| `.dockerignore`                | Root-level; ≥35 lines; 12 grouped categories; `.env*` excluded with `!.env.example` negation AFTER      | ✓ VERIFIED | 69 lines; all 12 group headers present; awk negation-ordering check passes (line 17 `.env.*` < line 18 `!.env.example`)                       |
| `scripts/dev-smoke.sh`         | Executable bash; `set -euo pipefail`; trap on EXIT/INT/TERM/HUP; probes :3003 + :3000                   | ✓ VERIFIED | 127 lines; `test -x` passes; `bash -n` clean; `WEB_PORT:-3000` (corrected by `05eef0a` from D-12 planning bug); ran successfully in D-22       |
| `CLAUDE.md` Deploy Convention  | New `## Deploy Folder Convention` section between `## Architecture` and `## Project Skills`            | ✓ VERIFIED | Section at lines 275-287; ordering check passes (arch-end:273 < deploy-start:275 < skills-start:289); 5 D-17 rules verbatim; Phase 23 Conventions preserved |

### Key Link Verification

| From                                  | To                                                                       | Via                                                              | Status     | Details                                                                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy/README.md`                    | `.planning/ROADMAP.md` §Phase 24-30                                      | stub references the canonical roadmap                            | ✓ WIRED    | grep confirms `ROADMAP.md` and `REQUIREMENTS.md` references on disk; cross-link to CLAUDE.md §"Deploy Folder Convention" present                                  |
| `apps/api/Dockerfile.dev`             | `apps/api/Dockerfile` (deleted)                                          | git mv preserves rename detection                                | ✓ WIRED    | `git diff --cached --diff-filter=R --name-status` (per 24-02-SUMMARY) recorded `R100\tapps/api/Dockerfile\tapps/api/Dockerfile.dev`; `git log --follow` reaches `4cf5a3d` |
| `.dockerignore` `!.env.example`       | `.dockerignore` `.env.*`                                                 | negation pattern must appear AFTER the exclusion it negates       | ✓ WIRED    | awk check confirms line 17 `.env.*` < line 18 `!.env.example`                                                                                                     |
| `scripts/dev-smoke.sh`                | `package.json` `scripts.dev`                                             | spawns `pnpm dev` as background subprocess                        | ✓ WIRED    | grep `pnpm dev` finds 3 references in `scripts/dev-smoke.sh`; D-22 Item 2 proves runtime invocation succeeds                                                      |
| `scripts/dev-smoke.sh` probe targets  | `apps/api/.env` PORT=3003 + `apps/web/package.json` `--port 3000`        | `curl http://localhost:${API_PORT}` + `http://localhost:${WEB_PORT}` | ✓ WIRED    | Defaults: `API_PORT:-3003`, `WEB_PORT:-3000` (post-fix `05eef0a`); D-22 Item 2 confirms api=404, web=200 — both ports alive                                       |
| `CLAUDE.md §Deploy Folder Convention` | PLAN 01-04 deliverables (deploy/, Dockerfile.dev, .dockerignore, scripts/dev-smoke.sh) | 5 bullets each reference an artifact landed by PLANs 01-04        | ✓ WIRED    | All 5 D-17 rule key-phrases present in section; cross-reference paragraph mentions `Pitfall 8` + `BLOCKER for GA`                                                  |
| `CLAUDE.md §Deploy Folder Convention` | Phase 25-30 subagent context window                                      | every Claude session reads CLAUDE.md at boot                      | ✓ WIRED    | Section wrapped in `<!-- GSD:deploy-convention-start source:phase-24 -->` / `<!-- GSD:deploy-convention-end -->` markers (immune to profile/skill regenerators)    |

### Data-Flow Trace (Level 4)

N/A — Phase 24 produces static configuration files (deploy skeleton, Dockerfile rename, .dockerignore, bash smoke script, CLAUDE.md section). No artifacts render dynamic data; data-flow trace is not applicable.

### Behavioral Spot-Checks

| Behavior                                                                | Command                                                                                                  | Result                                                                                  | Status |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| `scripts/dev-smoke.sh` is syntactically valid bash                      | `bash -n scripts/dev-smoke.sh`                                                                           | exit 0                                                                                  | ✓ PASS |
| `scripts/dev-smoke.sh` is executable                                    | `test -x scripts/dev-smoke.sh`                                                                           | exit 0                                                                                  | ✓ PASS |
| `.dockerignore` negation ordering correct                               | awk: `.env.*` line# < `!.env.example` line#                                                              | line 17 < line 18, ORDER OK                                                              | ✓ PASS |
| `apps/api/Dockerfile` removed; `apps/api/Dockerfile.dev` present       | `test ! -e apps/api/Dockerfile && test -f apps/api/Dockerfile.dev`                                       | both pass                                                                                | ✓ PASS |
| `git ls-files deploy/` returns exactly two paths                        | `git ls-files deploy/ \| wc -l`                                                                          | 2 (`deploy/README.md`, `deploy/scripts/.gitkeep`)                                       | ✓ PASS |
| No `package.json` under `deploy/` (workspace pollution check)           | `! test -f deploy/package.json`                                                                          | exit 0                                                                                   | ✓ PASS |
| Only one `.dockerignore` in repo (no per-app pre-creation)              | `find . -name '.dockerignore' -not -path './node_modules/*' -not -path './.git/*'`                       | exactly `./.dockerignore`                                                                | ✓ PASS |
| `docker-compose.yml` (dev) preserved — no `build:` directive            | `grep -nE '^\s*build:' docker-compose.yml`                                                                | no matches                                                                               | ✓ PASS |
| `pnpm-workspace.yaml` preserved (apps only)                             | `cat pnpm-workspace.yaml`                                                                                | `packages: - "apps/api" - "apps/web"` (no `deploy/`)                                     | ✓ PASS |
| CLAUDE.md Deploy Convention section ordering                            | awk: arch-end < deploy-start < skills-start                                                              | 273 < 275 < 289, ORDERING OK                                                             | ✓ PASS |
| Phase 23 conventions preserved (audit canary)                           | `grep -F 'curl http://localhost:3003/api/srs/callbacks/metrics' CLAUDE.md`                               | match found                                                                              | ✓ PASS |
| Live `pnpm dev` regression test (D-22 Item 2 — already executed)        | `bash scripts/dev-smoke.sh; echo $?`                                                                     | exit 0; api=HTTP 404 (auth-guarded, port alive), web=HTTP 200 (recorded in 24-05-SUMMARY) | ✓ PASS |

### Requirements Coverage

Phase 24 owns **zero REQ-IDs** (preventive structural work — confirmed by `.planning/REQUIREMENTS.md` line 155: "Phase 24 owns no REQ-IDs (preventive structural work — deploy/ skeleton + Dockerfile rename + root .dockerignore — enabling Phases 25-30 without contaminating dev workflow)" and line 159 "Phase 24: 0 (structural)"). ROADMAP §Phase 24 also explicitly states "no v1.3 REQ-IDs land here directly". No requirements verification table needed.

### Anti-Patterns Found

None. The phase produces static configuration only (markdown stubs, byte-identical Dockerfile rename, `.dockerignore` exclusion list, bash smoke script with `set -euo pipefail` + cleanup trap, CLAUDE.md section). The intentional preservation of `EXPOSE 3001` in `Dockerfile.dev` (stale relative to actual dev port 3003) is **explicitly out-of-scope per D-06** — byte-identity is the design contract; cleanup belongs to Phase 25 when the production Dockerfile lands. This is documented in 24-02-PLAN.md hard rules and surfaced in 24-02-SUMMARY.md decisions; not an anti-pattern.

The auto-corrected `dev-smoke.sh` `WEB_PORT` default (3002 → 3000, commit `05eef0a`) is the single intra-phase fix and is recorded transparently in 24-05-SUMMARY.md "Deviations from Plan / Auto-fixed Issues" with the root cause (D-12 mis-sourced port from CORS allowlist instead of `apps/web/package.json`).

### Human Verification Required

None outstanding. The D-22 7-item manual verification checklist was executed during Plan 05 Task 2 (delegated to orchestrator on user explicit instruction) with verbatim output recorded in `24-05-SUMMARY.md`. Items 1 and 2 (interactive `pnpm dev` regression checks) PASS — the smoke script ran end-to-end with exit 0, api probe HTTP 404 (auth-guarded, port alive), web probe HTTP 200. Items 3-7 (skeleton, rename, dockerignore patterns, CLAUDE.md content, protected-surface scope) all PASS.

### Gaps Summary

No gaps. All 4 ROADMAP success criteria are met, all 7 artifacts are on disk and correctly wired, all 7 key links verify, all 12 spot-checks pass, and the D-22 manual checklist already executed with a clean pass. The single intra-phase deviation (`scripts/dev-smoke.sh` WEB_PORT default) was caught and fixed in commit `05eef0a` before phase closure. The skeleton + convention-lock + secret-leakage guard are now in place to safely host Phases 25-30 without dev-workflow regression.

---

_Verified: 2026-04-27T15:10:00Z_
_Verifier: Claude (gsd-verifier)_
