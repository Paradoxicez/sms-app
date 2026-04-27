---
phase: 24
plan: 03
subsystem: deploy
tags: [dockerignore, security, pitfall-8, ga-blocker]
requires:
  - .gitignore (template reference for some patterns)
  - .planning/research/PITFALLS.md §Pitfall 8 (baseline 10-pattern list)
  - .planning/phases/24-deploy-folder-structure-dev-workflow-guardrails/24-CONTEXT.md (D-07/D-08/D-09)
provides:
  - Root .dockerignore closing Pitfall 8 (BLOCKER for GA — secrets/state in image layers)
  - Project-wide baseline for any root-level docker build
  - Foundation for Phase 25 per-app .dockerignore files (apps/api, apps/web)
affects:
  - All future docker build invocations from repo root will exclude listed patterns
tech-stack:
  added: []
  patterns: [docker-buildkit-ordered-rules, negation-after-exclusion]
key-files:
  created:
    - .dockerignore (69 lines, 1578 bytes)
  modified: []
decisions:
  - Comprehensive list (D-07) over the minimal 10-pattern Pitfall 8 baseline — "fix-once-or-rot" file; missing patterns silently leak secrets later
  - Group patterns by category with `=== Group Name ===` comment headers (D-08) for readability and audit
  - Do NOT exclude Dockerfile* or *.md (D-09) — not security risks and may be referenced by future build steps
  - Negation `!.env.example` placed AFTER `.env.*` exclusion — Docker BuildKit applies rules in order; reversing would silently re-leak the real .env
  - Defer per-app .dockerignore files (apps/api, apps/web) to Phase 25 — that phase owns multi-stage Dockerfile design
metrics:
  duration: ~1.5m
  completed: 2026-04-27
  tasks: 1
  files: 1
  commits: 1
---

# Phase 24 Plan 03: Root .dockerignore Summary

One-liner: Created comprehensive root-level `.dockerignore` (69 lines, 12 grouped categories) closing Pitfall 8 — `.env*` + planning state + agent state + monorepo build artifacts can no longer leak into docker image layers via `COPY . .`.

## What Shipped

A single new file at the repo root: `.dockerignore`.

The file declares **12 grouped exclusion categories** with `=== Category Name ===` comment headers per D-08:

| Group | Patterns | Why |
|-------|----------|-----|
| Secrets (HIGHEST PRIORITY — BLOCKER for GA) | `.env`, `.env.*`, `!.env.example` | Pitfall 8: `.env` in image layer is detectable via `docker history` and visible to anyone who pulls the image. T-24-01 mitigation. |
| Version control | `.git`, `.gitignore`, `.gitattributes` | Even if `.env` is gitignored today, any past accidental commit lives in `.git/objects/`. Excluding `.git` is the only way to prevent leaking history. T-24-08 mitigation. |
| Dependencies | `node_modules`, `**/node_modules` | Build context speed + image bloat; monorepo glob covers `apps/*/node_modules`. |
| Build artifacts | `dist`, `**/dist`, `.next`, `**/.next`, `out`, `**/out`, `*.tsbuildinfo`, `**/*.tsbuildinfo` | Stale builds shouldn't enter image; runtime build is the source of truth. |
| Test / coverage | `coverage`, `**/coverage` | Test artifacts have no place in production images. |
| Planning / GSD state | `.planning`, `apps/*/.planning` | T-24-07 mitigation: planning docs may include unredacted credentials, internal architecture, customer names. |
| Local bind-mounted data | `docker-data` | Dev compose HLS bind mount, snapshots — local-only. |
| IDE / editor | `.vscode`, `.idea`, `*.swp`, `*.swo` | Editor state. |
| OS metadata | `.DS_Store`, `Thumbs.db` | OS junk. |
| Claude / agent state | `.claude` | T-24-10 mitigation: agent worktrees, scratch — leaked context. |
| Logs | `*.log`, `**/*.log` | Local logs sometimes contain creds; monorepo glob covers nested. |
| Local bulk-import examples | `bulk-import-*-EXAMPLE.csv`, `bulk-import-*-EXAMPLE.xlsx` | T-24-09 mitigation: may contain real customer URLs / creds. Mirrors `.gitignore`. |

The negation `!.env.example` is the **only** negation line in the file and appears at line 18, immediately AFTER the `.env.*` exclusion at line 17 — this ordering is enforced by an awk acceptance criterion and prevents the most dangerous failure mode (silent re-leak of the real `.env` if the negation line were placed first).

Per D-09, `Dockerfile*` and `*.md` are NOT excluded — they may be referenced by Phase 25 multi-stage Dockerfiles or by `COPY README.md` patterns.

Per D-19/D-20, no other files were touched: `.gitignore`, `docker-compose.yml`, `package.json`, `pnpm-workspace.yaml`, and all source code remain untouched. Phase 25 owns `apps/api/.dockerignore` and `apps/web/.dockerignore`.

## Acceptance Criteria — Evidence

```
=== File existence ===
PASS: .dockerignore exists at repo root
=== Line count ===
69 lines (criterion: ≥ 50)
=== Per-app dockerignores must NOT exist ===
PASS: apps/api/.dockerignore not pre-created
PASS: apps/web/.dockerignore not pre-created

=== Secrets group (line numbers) ===
16:.env
17:.env.*
18:!.env.example
=== Negation ordering (awk) ===
exclusion line: 17, negation line: 18 → PASS: 17 < 18

=== Version control ===
.git (line 21), .gitignore (line 22), .gitattributes (line 23) all present

=== Dependencies ===
26:node_modules
27:**/node_modules

=== Build artifacts ===
30:dist  31:**/dist  32:.next  33:**/.next
34:out   35:**/out   36:*.tsbuildinfo  37:**/*.tsbuildinfo

=== Test / coverage ===
40:coverage  41:**/coverage

=== Planning / GSD state ===
44:.planning  45:apps/*/.planning

=== Local bind-mounted data ===
48:docker-data

=== IDE / editor ===
51:.vscode  52:.idea  53:*.swp  54:*.swo

=== OS metadata ===
.DS_Store, Thumbs.db both present

=== Claude / agent state ===
61:.claude

=== Logs ===
64:*.log  65:**/*.log

=== Bulk-import examples ===
bulk-import-*-EXAMPLE.csv, bulk-import-*-EXAMPLE.xlsx both present

=== NOT excluded (D-09) ===
PASS: Dockerfile* not excluded
PASS: *.md not excluded

=== Comment groups (D-08) ===
12 group headers found (criterion: 12)

=== Verification block ===
exactly 1 negation line (criterion: 1) → PASS
single .dockerignore in repo (find . -name '.dockerignore' excluding node_modules+.git → 1) → PASS

=== Final automated verify line ===
ALL VERIFY CHECKS PASS
```

## Threat Mitigations Closed

| Threat ID | Category | Status |
|-----------|----------|--------|
| T-24-01 | `.env*` info disclosure (HIGH — BLOCKER for GA) | mitigated by `.env` + `.env.*` exclusion + `!.env.example` ordered negation |
| T-24-07 | `.planning/` info disclosure (MEDIUM) | mitigated by `.planning` + `apps/*/.planning` exclusions |
| T-24-08 | `.git/` info disclosure (MEDIUM — past commits) | mitigated by `.git` exclusion |
| T-24-09 | `bulk-import-*-EXAMPLE` info disclosure (LOW-MEDIUM) | mitigated by explicit `.csv` + `.xlsx` patterns |
| T-24-10 | `.claude/` agent state info disclosure (LOW) | mitigated by `.claude` exclusion |
| T-24-11 | Future operator inverts negation order (LOW) | mitigated by acceptance criterion using awk to assert line ordering; PLAN 05 D-22 manual checklist re-runs the awk check |

T-24-11 is a tampering threat handled defensively — the awk check in this plan's acceptance criteria is the operator-facing safeguard for future edits.

## Deviations from Plan

None — plan executed exactly as written. The `.dockerignore` body matches the `<action>` block byte-for-byte (modulo one trailing newline per Write tool convention; unaffected pattern semantics).

## Authentication Gates

None.

## Known Stubs

None. The output is a static configuration file; no UI surface, no data flow.

## Threat Flags

None. This plan adds an exclusion list to a future build context; it does not introduce new network endpoints, auth paths, file access patterns, or schema changes.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `c719a05` | feat(24-03): add root .dockerignore closing Pitfall 8 (BLOCKER for GA) |

## Files

- `.dockerignore` — created (69 lines, 1578 bytes)

## Self-Check: PASSED

- File `.dockerignore` exists at repo root (verified via `test -f`).
- Commit `c719a05` exists in HEAD's history (verified via `git rev-parse --short HEAD`).
- Single `.dockerignore` in repo (verified via find — count = 1).
- Negation ordering correct (verified via awk: line 17 `.env.*` < line 18 `!.env.example`).
- All 18 acceptance-criterion grep checks pass.
- D-09 negative checks pass (no `Dockerfile*` or `*.md` exclusion).
- D-08 readability: 12 group headers present.
