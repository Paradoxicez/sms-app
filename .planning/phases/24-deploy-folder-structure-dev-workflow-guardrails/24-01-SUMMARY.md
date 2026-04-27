---
phase: 24-deploy-folder-structure-dev-workflow-guardrails
plan: 01
subsystem: infra
tags: [deploy, folder-structure, placeholder, scaffolding]

# Dependency graph
requires:
  - phase: 23-tech-debt-cleanup-pre-deploy
    provides: clean v1.2 baseline (DEBT-01..05 resolved) on which v1.3 deploy work builds
provides:
  - deploy/ skeleton (README stub + scripts/.gitkeep) reserving the directory for production-only artifacts
  - Convention-lock pointer to CLAUDE.md §"Deploy Folder Convention" embedded in README
  - Phase 25-30 hand-off map (each phase's target file paths documented in the stub)
affects: [25-multi-stage-dockerfiles, 26-compose-and-env, 27-caddy-tls-reverse-proxy, 28-ci-cd-ghcr, 29-operator-scripts, 30-clean-vm-smoke-test]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Skeleton-first folder convention: lock layout + cross-link to CLAUDE.md before downstream phases populate"
    - ".gitkeep placeholder for empty git-tracked directory (Phase 29 will replace with real scripts)"

key-files:
  created:
    - deploy/README.md
    - deploy/scripts/.gitkeep
  modified: []

key-decisions:
  - "Stub README uses verbatim Plan text — no expansion / no quickstart content (Phase 29 owns the real 5-step quickstart that overwrites this README)"
  - "No package.json under deploy/ — prevents pnpm-workspace globs from picking it up as a workspace member (D-19)"
  - ".gitkeep convention chosen over README-as-placeholder for deploy/scripts/ to keep the placeholder zero-bytes (matches Phase 29 hand-off where real scripts replace it)"

patterns-established:
  - "Convention-lock cross-link: deploy/README.md points at CLAUDE.md §'Deploy Folder Convention' so future subagents can't misplace dev tooling under deploy/ (T-24-02 mitigation)"
  - "Skeleton phase pattern: ship structural scaffolding + convention BEFORE any of the downstream content phases run, so each downstream phase has a fixed target path"

requirements-completed: []  # Phase 24 owns no REQ-IDs (preventive structural work — DEPLOY-* land in Phases 25-30)

# Metrics
duration: 1 min
completed: 2026-04-27
---

# Phase 24 Plan 01: Deploy Folder Skeleton Summary

**Two-file placeholder skeleton (`deploy/README.md` stub + `deploy/scripts/.gitkeep`) reserving the production-only directory and locking the convention before Phases 25-30 populate it.**

## Performance

- **Duration:** 1 min (82s)
- **Started:** 2026-04-27T13:53:27Z
- **Completed:** 2026-04-27T13:54:49Z
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 0

## Accomplishments

- `deploy/` directory now exists at repo root, git-tracked via two placeholder files only.
- README stub explicitly maps each Phase 25-30 deliverable to its target file path, with Phase 29 hand-off marker (`overwrites this README`).
- Convention-lock pointer in README cross-links to `CLAUDE.md §"Deploy Folder Convention"` — primary mitigation for T-24-02 (subagent dropping dev tooling into deploy/).
- `deploy/scripts/.gitkeep` reserves the directory for Phase 29 operator scripts (bootstrap, update, backup, restore, init-secrets).
- Zero impact on dev workflow: no `package.json` under `deploy/`, no edits to `pnpm-workspace.yaml`, `docker-compose.yml`, root `package.json`, or any source file.

## Task Commits

Each task was committed atomically (parallel executor mode, `--no-verify`):

1. **Task 1: Create deploy/README.md stub** — `557473d` (feat)
2. **Task 2: Create deploy/scripts/.gitkeep** — `8569fba` (feat)

_Plan metadata commit will be created by the orchestrator after all wave-1 worktree agents complete._

## Files Created/Modified

- `deploy/README.md` (15 lines) — Production-only directory stub; cross-links to ROADMAP, REQUIREMENTS, and CLAUDE.md convention section; explicit Phase 29 overwrite marker
- `deploy/scripts/.gitkeep` (0 bytes) — Empty placeholder making `deploy/scripts/` git-trackable; Phase 29 (DEPLOY-18..21) will populate with operator scripts

## Verification Results

```text
$ git ls-files deploy/
deploy/README.md
deploy/scripts/.gitkeep

$ git diff --name-only 3059cac..HEAD
deploy/README.md
deploy/scripts/.gitkeep

$ test -f deploy/package.json
(exits 1 — confirmed no workspace pollution)

$ wc -c deploy/scripts/.gitkeep
0 deploy/scripts/.gitkeep

$ wc -l deploy/README.md
15 deploy/README.md
```

All 13 acceptance criteria across both tasks plus all 5 plan-level success criteria pass.

## Decisions Made

- **Verbatim stub content:** Used the EXACT 13-line markdown block from the plan with zero paraphrasing. The plan emphasized this hard rule because Phase 29 (DEPLOY-23) will overwrite the file with the real 5-step quickstart — adding content now would just be deleted later.
- **`.gitkeep` over README placeholder for deploy/scripts/:** Plan specified zero-byte file. Chose `.gitkeep` (not a stub script) so Phase 29 can drop in 5 real scripts without competing with placeholder content.
- **No workspace pollution guardrail honored:** Did NOT create `package.json` under `deploy/` (D-19). This was the most acute pitfall the skeleton phase exists to prevent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan acceptance criterion `ls deploy/scripts/ | wc -l = 1` is incorrect on Unix systems**

- **Found during:** Task 2 (verification step)
- **Issue:** The plan's `<acceptance_criteria>` and `<verify><automated>` blocks both check `ls deploy/scripts/ | wc -l` and expect output `1`. On macOS/Linux, plain `ls` hides dotfiles by default, so a directory containing only `.gitkeep` reports `0`, not `1`. The criterion as written is impossible to satisfy literally.
- **Fix:** Verified the SPIRIT of the criterion ("only `.gitkeep`, no other files") using three equivalent checks that DO work:
  1. `ls -A deploy/scripts/` returns exactly `.gitkeep` (one file, including dotfiles)
  2. `git ls-files deploy/scripts/` returns exactly `deploy/scripts/.gitkeep` (canonical and the most reliable check; this IS the 4th acceptance criterion in the plan and passes)
  3. `find deploy/scripts/ -type f` returns exactly one path
- **Files modified:** None (no source change — verification approach corrected)
- **Verification:** All three substitute checks pass; the file IS the only entry in `deploy/scripts/` as the plan intends.
- **Committed in:** N/A (verification-only deviation)

---

**Total deviations:** 1 auto-fixed (1 planner-bug — incorrect literal verify command)
**Impact on plan:** Zero impact on output. The plan's intent ("only `.gitkeep` exists, no other files") is satisfied; only the literal shell incantation in the verify block was wrong. Worth flagging to the planner for future skeleton plans.

## Issues Encountered

None — both tasks shipped with correct content on first attempt; the only friction was the incorrect `ls` verification check noted above as a deviation.

## User Setup Required

None — no external service configuration required. This plan is pure repo scaffolding.

## Threat Flags

None — both files are static placeholder content with no network surface, no auth paths, no schema changes, and no new trust boundaries. The threat model already covered both T-24-02 (mitigated via convention-lock cross-link in README) and T-24-03 (mitigated via `! test -f deploy/package.json` acceptance criterion).

## Self-Check: PASSED

- ✅ `deploy/README.md` exists on disk (`test -f` exit 0; 15 lines)
- ✅ `deploy/scripts/.gitkeep` exists on disk (`test -f` exit 0; 0 bytes)
- ✅ Commit `557473d` exists on this branch (`git log` confirms)
- ✅ Commit `8569fba` exists on this branch (`git log` confirms)
- ✅ `git ls-files deploy/` returns exactly the two expected paths
- ✅ No `deploy/package.json` exists (workspace not polluted)
- ✅ No edits to `pnpm-workspace.yaml`, `docker-compose.yml`, root `package.json`, or any source file (verified via `git diff --name-only 3059cac..HEAD`)

## Next Phase Readiness

- ✅ `deploy/` skeleton ready for Phase 25 (apps/Dockerfiles — those land under `apps/`, not here, but reference deploy convention via README cross-link)
- ✅ `deploy/` skeleton ready for Phase 26 (`deploy/docker-compose.yml`, `deploy/.env.production.example` — target paths already documented in stub)
- ✅ `deploy/` skeleton ready for Phase 27 (`deploy/Caddyfile`, `deploy/DOMAIN-SETUP.md`)
- ✅ `deploy/scripts/` ready for Phase 29 to drop bootstrap/update/backup/restore/init-secrets
- ⚠️ The CLAUDE.md §"Deploy Folder Convention" section that this README points at is created by Plan 24-05 (Wave 2). The cross-link is forward-pointing and resolves once Plan 05 merges. This is intentional per the plan's design (skeleton + convention land together in Phase 24, in different waves).

---
*Phase: 24-deploy-folder-structure-dev-workflow-guardrails*
*Plan: 01*
*Completed: 2026-04-27*
