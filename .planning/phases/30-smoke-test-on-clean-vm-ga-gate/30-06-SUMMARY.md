---
phase: 30
plan: 06
subsystem: deploy / smoke-test
tags: [phase-30, deploy-25, deploy-26, smoke-test, ga-gate, wrapper, verification-template]
requires:
  - 30-01 (deploy/SMOKE-TEST-LOG.md template — wrapper appends Run sections)
  - 30-02 (verify-nmap.sh — wrapper prints command, does NOT invoke)
  - 30-03 (verify-deploy.sh — wrapper invokes [1/4])
  - 30-04 (verify-playback.sh — wrapper invokes [2/4] after manual gate)
  - 30-05 (verify-backup.sh — wrapper invokes [3/4])
provides:
  - one-command smoke run (`bash deploy/scripts/smoke-test.sh`)
  - max(child_codes) aggregation per D-19
  - GSD-side verification template (30-VERIFICATION.md) for verifier role
  - T-30-05 evidence-folder redaction (gitignore patch)
affects:
  - .gitignore (additions-only, prior entries preserved)
  - deploy/SMOKE-TEST-LOG.md (no schema change — wrapper APPENDS '## Run started <UTC>' sections)
tech-stack:
  added: []
  patterns:
    - run_step helper function (extracts if/else rc capture so set -e stays clean at wrapper level)
    - max-RC aggregation (record_rc only ever increases MAX_RC, never decreases)
    - sequential bash invocation (NOT background — strict serial ordering enforced)
    - manual gate via `read -r _` (bare; no -p flag for macOS bash 3.x compat)
    - tput-aware colored log helpers (matches verify-phase-27.sh precedent)
key-files:
  created:
    - deploy/scripts/smoke-test.sh (228 LOC, mode 0755)
    - .planning/phases/30-smoke-test-on-clean-vm-ga-gate/30-VERIFICATION.md (verifier-fill template)
  modified:
    - .gitignore (+6 lines: deploy/smoke-evidence/ block)
decisions:
  - "Extract if/else rc capture into run_step() function — `local rc=$?` outside a function is a syntax error in bash 3.x (macOS); wrapping in run_step keeps set -e semantics clean and rc capture portable across bash 3.2 / 4.x / 5.x"
  - "verify-nmap.sh is REMINDER-ONLY (not invoked) — runs on operator's laptop, not the VM; aggregated MAX_RC therefore covers only verify-deploy + verify-playback + verify-backup. Operator manually folds laptop exit code into SMOKE-TEST-LOG SC#3 row"
  - "Manual gate uses bare `read -r _` (no -p flag) — `read -p` is non-portable on macOS bash 3.x; the prompt is printed via log() lines preceding the read"
  - "SMOKE-TEST-LOG appends a new '## Run started <UTC>' section per invocation (>> not >) — operator may run wrapper multiple times during a smoke pass; never overwrites prior runs"
  - "ipify.org IP detection is BEST-EFFORT (5s timeout) — falls back to '<vm-public-ip>' literal placeholder for the laptop nmap reminder if outbound HTTP is blocked"
  - "Pre-flight loop verifies all 4 verify-*.sh exist + executable BEFORE step 1 — fails fast instead of wasting operator time mid-run on a missing verifier"
  - "30-VERIFICATION.md ships as a TEMPLATE (no frontmatter) — the verifier role fills it during /gsd-execute-phase verification step; it is NOT a planning doc with state"
metrics:
  duration: 18m
  completed_date: 2026-04-29
  tasks: 2
  files_created: 2
  files_modified: 1
  total_lines_added: 305 # 228 (smoke-test.sh) + 71 (VERIFICATION.md) + 6 (.gitignore)
  commits:
    - hash: 99fd15a
      task: 1
      type: feat
      files: [deploy/scripts/smoke-test.sh]
    - hash: ec63efa
      task: 2
      type: docs
      files: [.planning/phases/30-smoke-test-on-clean-vm-ga-gate/30-VERIFICATION.md, .gitignore]
  commit_strategy: "--no-verify (Wave 3 sole-agent permission per orchestrator brief; no pre-commit hook gates required for doc-shaped + bash-only changes)"
---

# Phase 30 Plan 06: Smoke-Test Wrapper + Verification Template Summary

One-liner: deploy/scripts/smoke-test.sh sequentially drives verify-deploy → manual D-14 gate → verify-playback → verify-backup with max(child-rc) aggregation, plus 30-VERIFICATION.md template for the GSD verifier role and a .gitignore patch closing T-30-05.

## What shipped

**Artifact 1: `deploy/scripts/smoke-test.sh`** (228 LOC, mode 0755, syntax-valid)

Sequential 4-step wrapper. Each step is invoked through a `run_step` helper that captures the child's exit code without breaking the wrapper's `set -e` discipline:

| # | Step | Action |
|---|------|--------|
| 1/4 | verify-deploy.sh | Bootstrap + HTTPS + LE cert + create-admin + update.sh recycle (Phase 27 SC#1/#3/#4 + Phase 29 SC#1/#2/#3) |
| GATE | Manual D-14 1-6 | Operator login + camera register + HLS playback + record toggle + DevTools WS frame screenshot + offline transition |
| 2/4 | verify-playback.sh | wss 101 upgrade + HLS m3u8 + MinIO .ts archive (Phase 27 SC#2 + Phase 29 SC#5 automated portion) |
| 3/4 | verify-backup.sh | backup → restore byte-equivalent round-trip + cert-preserve assertion (Phase 29 SC#4) |
| 4/4 | verify-nmap.sh | REMINDER ONLY — wrapper PRINTS the laptop command (not invoked here) |

Aggregation per D-19: `record_rc` only ever increases `MAX_RC`. After the run, the wrapper writes a `## Run summary` table to `SMOKE-TEST-LOG.md` and `case`-dispatches:
- `0` → `ok "GA APPROVED"`, exit 0
- `1` → `die "RE-SMOKE REQUIRED"`, exit 1
- `2` → `warn "GA APPROVED WITH DRIFT"`, exit 2

Three env toggles for debug:
- `SKIP_BACKUP=1` — skip the destructive round-trip during iteration
- `SKIP_INTERACTIVE=1` — bypass the manual gate (CI / unattended; verify-playback will likely fail without operator data — useful only for `bash -n` smoke)

Pre-flight (fail-fast BEFORE step 1):
- `docker` on PATH
- `deploy/.env` exists (operator ran `init-secrets.sh`)
- `deploy/SMOKE-TEST-LOG.md` exists (Plan 01 landed)
- All 4 `verify-*.sh` exist + executable

Run-metadata header appended per invocation (operator may iterate):
```markdown
---
## Run started <UTC>

| Field | Value |
|-------|-------|
| Run UTC start | … |
| VM hostname | … |
| OS | … |
| Docker | … |
| Compose plugin | … |
| Domain | $DOMAIN |
| ACME_CA | $ACME_CA (default LE prod) |
| IMAGE_TAG | $IMAGE_TAG |
| Evidence dir | deploy/smoke-evidence/<UTC-stamp> |
```

**Artifact 2: `.planning/phases/30-smoke-test-on-clean-vm-ga-gate/30-VERIFICATION.md`** (71 LOC, mode 0644)

GSD-side verification template the verifier role fills when `/gsd-execute-phase` runs verification. Six H2 sections:

1. `## Inputs` — declares the 3 evidence sources (SMOKE-TEST-LOG, smoke-evidence/, wrapper exit code)
2. `## ROADMAP Success Criteria mapping` — 4 rows (SC#1 deploy + SC#2 playback + SC#3 nmap + SC#4 drift)
3. `## Requirements satisfied` — DEPLOY-25 + DEPLOY-26
4. `## Deferred UAT closures (D-13 mapping inheritance)` — 9 rows (4 Phase 27 + 5 Phase 29)
5. `## Drift backlog` — table mirror for any SMOKE-TEST-LOG drift entries (also creates `.planning/todos/v1.3.1-drift-from-phase-30.md` if non-empty)
6. `## GA verdict` — 3 verdicts: GA APPROVED / RE-SMOKE REQUIRED / GA APPROVED WITH DRIFT

No frontmatter — it is a verifier-fill template, not a planning doc with state.

**Artifact 3: `.gitignore` patch** (+6 lines)

Adds `deploy/smoke-evidence/` block (T-30-05 mitigation). Operator screenshots + DevTools captures + raw browser logs may contain WS auth tokens, partial RTSP URLs with userinfo, or admin session cookies — never commit them. Only `SMOKE-TEST-LOG.md` itself ships as the public smoke-run record.

The patch was applied via `Edit` (not `Write`) — pre-existing entries (`node_modules/`, `.env`, `dist/`, prisma generated, `.claude/`, bulk-import EXAMPLE files) are preserved verbatim.

## Verification

All <verify> automated assertions from PLAN.md PASS:

| Assertion | Result |
|-----------|--------|
| `test -x deploy/scripts/smoke-test.sh` | PASS |
| `bash -n deploy/scripts/smoke-test.sh` | PASS (syntax) |
| `grep -qE '^set -euo pipefail$'` | PASS |
| `verify-deploy.sh` ref present | PASS |
| `verify-playback.sh` ref present | PASS |
| `verify-backup.sh` ref present | PASS |
| `verify-nmap.sh` ref present | PASS |
| `MAX_RC` aggregator declared | PASS |
| `EVIDENCE_DIR` declared + initialized | PASS |
| `D-14` referenced in manual gate | PASS |
| `read -r` (no -p flag, macOS compat) | PASS |
| `git ls-files --stage` mode 100755 | PASS |
| 30-VERIFICATION.md exists | PASS |
| H1 `# Phase 30 — Verification` | PASS |
| `## ROADMAP Success Criteria mapping` H2 | PASS |
| DEPLOY-25 + DEPLOY-26 referenced | PASS |
| `GA verdict` section present | PASS |
| `.gitignore` contains `deploy/smoke-evidence/` | PASS |
| All 6 expected H2 sections in 30-VERIFICATION.md | PASS (Inputs / ROADMAP SC / Requirements / Deferred UAT / Drift / GA verdict) |
| 4 SC rows in mapping table | PASS |
| 9 UAT rows in deferred table | PASS (4 Phase 27 + 5 Phase 29) |
| Pre-existing .gitignore entries preserved | PASS (visual diff: bulk-import block immediately precedes new block) |

## Deviations from Plan

None — plan executed exactly as written. The plan's CRITICAL constraints section explicitly flagged the `local rc=$?` syntax-error trap (declaring `local` outside a function body is a bash error); I avoided it by extracting the if/else rc-capture into the `run_step()` helper function as the plan suggested.

## Authentication gates

None — no live deploy, no GHCR pull, no LE cert issuance. All work was static-only (script authoring + template + gitignore patch). The smoke run itself (which DOES need DOMAIN, ADMIN_EMAIL, ACME credentials, RTSP test URL) happens later when the operator invokes the wrapper on a clean VM.

## Threat surface scan

No new threat surface introduced by this plan. The wrapper's only network call is the best-effort `curl https://api.ipify.org` (5s timeout) used to populate the laptop's nmap reminder — outbound HTTPS to a well-known IP-echo service, falls back to `<vm-public-ip>` placeholder if blocked. No inbound surface, no new auth path, no new schema.

T-30-05 (information disclosure via committed evidence) is MITIGATED by the `.gitignore` patch (Task 2 Artifact 3).

T-30-14 (false aggregated exit code) is MITIGATED by the `record_rc` monotonic-increment guard + the `run_step` if/else discipline that wraps every child invocation.

## Known stubs

None. The wrapper is fully wired:
- All 4 verify-*.sh references resolve to existing executable scripts (Wave 1+2 outputs)
- `MAX_RC` aggregation is real (not a placeholder)
- SMOKE-TEST-LOG append target exists (Plan 01)
- 30-VERIFICATION.md placeholders (`_<verifier role>_`, `_PASS/FAIL_`, `_<UTC date>_`) are intentionally template-shaped — the verifier role fills them during `/gsd-execute-phase` verification, NOT now

## Self-Check: PASSED

**Files exist:**
- FOUND: deploy/scripts/smoke-test.sh
- FOUND: .planning/phases/30-smoke-test-on-clean-vm-ga-gate/30-VERIFICATION.md
- FOUND: .gitignore (modified — pre-existing file, deploy/smoke-evidence/ line appended)

**Commits exist:**
- FOUND: 99fd15a (Task 1 — feat(30-06): add smoke-test.sh sequential wrapper)
- FOUND: ec63efa (Task 2 — docs(30-06): add 30-VERIFICATION.md template + gitignore smoke-evidence)

**Mode bits correct:**
- deploy/scripts/smoke-test.sh: git stage mode 100755 (verified via `git ls-files --stage`)
- .planning/phases/30-smoke-test-on-clean-vm-ga-gate/30-VERIFICATION.md: 100644 (default — verifier-fill template, not executable)

**Pattern integrity:**
- smoke-test.sh references all 3 invoked verifiers (deploy, playback, backup) via `bash "${SCRIPT_DIR}/<name>"` calls
- smoke-test.sh references verify-nmap.sh as REMINDER ONLY (not invoked) — `grep -c verify-nmap` returns 4 (header + pre-flight loop + step header + reminder body)
- smoke-test.sh appends to LOG_FILE (verified `>> "${LOG_FILE}"` appears 2x — run header + run summary; never `> "${LOG_FILE}"`)
- Pre-existing .gitignore entries preserved (visually verified: `node_modules/` through `bulk-import-*-EXAMPLE.xlsx` all intact, new block strictly appended)
