# Phase 24: Deploy Folder Structure + Dev Workflow Guardrails - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 24-deploy-folder-structure-dev-workflow-guardrails
**Mode:** discuss (interactive)
**Areas discussed:** deploy/ skeleton, .dockerignore scope, Dev smoke-test verification, CLAUDE.md guardrail update

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| deploy/ skeleton | placeholder subfolders/ไฟล์ที่สร้างใน Phase 24 เพื่อ lock layout | ✓ |
| .dockerignore scope | minimal (roadmap criterion) vs comprehensive (Pitfall 8) | ✓ |
| Dev smoke-test verification | manual checklist / shell script / CI extension | ✓ |
| CLAUDE.md guardrail update | document `deploy/` vs `apps/` convention now or later | ✓ |

**User's choice:** All four — multiSelect

---

## deploy/ skeleton

| Option | Description | Selected |
|--------|-------------|----------|
| scripts/ + stub README | scripts/.gitkeep + stub README.md (no docs/ subfolder — *.md files land at deploy/ root per spec) | ✓ |
| scripts/ + docs/ + stub README | scripts/.gitkeep + docs/.gitkeep + README.md (matches ROADMAP "e.g. scripts/, docs/" literal) | |
| scripts/ + .gitkeep only | bare minimum — Phase 29 fills in everything | |

**User's choice:** scripts/ + stub README (Recommended)
**Notes:** All future *.md files (DOMAIN-SETUP, BACKUP-RESTORE, TROUBLESHOOTING, README) land at `deploy/` root per Phase 27 + Phase 29 specs. `docs/` subfolder would be unused.

---

## .dockerignore scope

| Option | Description | Selected |
|--------|-------------|----------|
| Comprehensive | Full Pitfall 8 list + project-specific (.claude, docker-data, bulk-import-EXAMPLE) — BLOCKER class protection | ✓ |
| Minimal | Roadmap success criterion #3 only (.env*, node_modules, .planning/, *.log, build artifacts) | |
| Comprehensive + whitelist .env.example | Same as Comprehensive but with explicit `!.env.example` negation | |

**User's choice:** Comprehensive (Recommended) — note: this option already includes `!.env.example` whitelist
**Notes:** `.dockerignore` is a one-time setup; missing patterns risk leaks (Pitfall 8 BLOCKER for GA). Per-app `.dockerignore` from Phase 25 will inherit + extend via BuildKit closest-context rule.

---

## Dev smoke-test verification

### Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Manual checklist in PLAN.md | Reviewer runs `pnpm dev`, checks ports, reports back | |
| Shell script + manual run | `scripts/dev-smoke.sh` automates port + curl checks; run manually | ✓ |
| CI workflow extension | Extend Phase 23 `.github/workflows/test.yml` with dev-smoke job | |

**User's choice:** Shell script + manual run

### Location

| Option | Description | Selected |
|--------|-------------|----------|
| scripts/dev-smoke.sh | New root `scripts/` folder for monorepo-level dev tooling | ✓ |
| deploy/scripts/dev-smoke.sh | Co-locate with deploy scripts, but breaks "deploy/ = prod only" convention | |
| package.json script | Inline `smoke` script in root package.json, no .sh file | |

**User's choice:** scripts/dev-smoke.sh (Recommended)
**Notes:** Pitfall 18 explicitly says `deploy/` is prod-only. Root `scripts/` is the right place for monorepo-level dev tooling.

### Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Port liveness + curl health | `pnpm dev` background, sleep 15s, curl :3003/api/health + :3002, kill pid | ✓ |
| Port liveness only | Just check ports 3001+3002 are listening, no curl | |
| Full: pnpm install + build + dev + curl | Heavier (~3-5 min) but catches build regressions | |

**User's choice:** Port liveness + curl health (Recommended)
**Notes:** ~30s runtime fits dev-machine workflow. `/api/health` already exists per Phase 23 CLAUDE.md.

---

## CLAUDE.md guardrail update

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 24: short section + Dockerfile note | Add `## Deploy Folder Convention` (5 bullets) lock convention before Phase 25-30 | ✓ |
| Phase 25: defer until prod Dockerfile lands | Skip CLAUDE.md in Phase 24; Phase 25 documents alongside prod Dockerfile | |
| ไม่แตะ CLAUDE.md เลย | ROADMAP + CONTEXT.md sufficient for future planners | |

**User's choice:** Phase 24: เพิ่มสั้น + Dockerfile note (Recommended)
**Notes:** Subagents (Phase 25-30 planners/executors) won't always read .planning/. CLAUDE.md is loaded into every context, so guardrails there have stronger reach.

---

## Wrap-up

| Option | Description | Selected |
|--------|-------------|----------|
| พร้อมเขียน CONTEXT | Write CONTEXT.md, proceed to plan-phase | ✓ |
| Explore more gray areas | More clarification needed | |

**User's choice:** พร้อมเขียน CONTEXT

---

## Claude's Discretion

- Stub `deploy/README.md` exact wording (1-2 paragraph)
- Order of comment groups in `.dockerignore`
- Exact placement of `## Deploy Folder Convention` section in CLAUDE.md
- Smoke script wait duration (15s starting point — extend if slow machines need it)
- Per-commit granularity for the ~5 logical changes (rename, deploy/, .dockerignore, scripts/dev-smoke.sh, CLAUDE.md update)

## Deferred Ideas

- Per-app `apps/*/.dockerignore` → Phase 25
- Wire smoke script into CI → Phase 30 or v1.4 backlog
- Cleanup stale `EXPOSE 3001` in Dockerfile.dev → defer (file is unused)
- Add `/health` endpoint to web → defer to Phase 27 (Caddy routing) or Phase 30
- `deploy/README.md` 5-step quickstart content → Phase 29 (DEPLOY-23)
- `.gitleaks.toml` / pre-commit secret scan → v1.4 security hardening
