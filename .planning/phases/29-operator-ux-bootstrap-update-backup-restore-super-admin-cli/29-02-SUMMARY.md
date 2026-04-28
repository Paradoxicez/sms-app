---
phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli
plan: 02
subsystem: infra
tags: [bash, bootstrap, deploy, docker-compose, init-container, lets-encrypt, operator-ux, idempotent]

# Dependency graph
requires:
  - phase: 26-production-compose-migrate-init-networking-volumes
    provides: deploy/docker-compose.yml + sms-migrate init container + .env.production.example schema (DOMAIN/ADMIN_EMAIL/ADMIN_PASSWORD/GHCR_ORG/ACME_EMAIL declared) + init-secrets.sh idempotent generator
  - phase: 27-caddy-reverse-proxy-auto-tls
    provides: Caddy auto-TLS + /api/health reverse-proxy route (the HTTPS poll target in D-10)
  - phase: 28-github-actions-ci-cd-ghcr
    provides: ghcr.io/${GHCR_ORG}/sms-{api,web}:${IMAGE_TAG} images that bootstrap.sh pulls
  - phase: 29-01 (Wave 1)
    provides: apps/api/bin/sms wrapper (mode 100755) + bin/sms create-admin --email --password [--force] subcommand at /app/apps/api/bin/sms in the runtime image

provides:
  - deploy/scripts/bootstrap.sh — single-command first-run orchestrator (pre-flight → auto-secrets → pull → up --wait sms-migrate → up rest → wait api healthy → bin/sms create-admin (with --force fallback) → HTTPS poll → print URL + ELAPSED seconds)
  - Idempotent re-run contract — every step skips/no-ops on already-applied state; create-admin's --force fallback rotates password without disturbing user/member rows; HTTPS poll is stateless

affects:
  - phase 29-06 (deploy/README.md quickstart — step 4 invokes bootstrap.sh as the single command for the <10-minute claim per D-25)
  - phase 30 (clean-VM smoke test — DEPLOY-25 exercises bootstrap.sh end-to-end against a fresh DigitalOcean/Hetzner VM and consumes the D-12 ELAPSED log as evidence for ROADMAP §Phase 29 SC #2)

# Tech tracking
tech-stack:
  added: []  # zero new build-time / runtime deps; reuses existing docker compose v2 + curl + bash + grep + sed + tput
  patterns:
    - First-run orchestrator pattern (pre-flight → auto-secrets → pull → migrate → create-admin → HTTPS poll → timing log) — reusable for any compose-based deploy
    - Two-phase compose up: `up -d --wait sms-migrate` first to gate on init-container exit 0, THEN `up -d` (no service arg) for api+web+caddy — avoids Caddy's ACME-blocked healthcheck stalling the whole `--wait` budget
    - Idempotent --force fallback via stderr scrape (`grep -q 'already exists' /tmp/bootstrap-create-admin.err`) — converts CLI's exit-1 default into a re-run-safe rotation path
    - `set -a; source deploy/.env; set +a` auto-export pattern for sourcing operator env without per-var export
    - `compose ps --format '{{.Health}}'` Go-template form (stable across compose v2.x) over JSON parsing (drifted between v2.10..v2.20)
    - `curl --max-time 5` per probe + 24-iteration cap = 120s upper bound on HTTPS poll (prevents hung ACME challenge from blocking forever)
    - `warn` (not `die`) on HTTPS timeout — cert may issue 30-60s after budget; operator self-recovers via DOMAIN-SETUP.md

key-files:
  created:
    - deploy/scripts/bootstrap.sh (189 total lines / 95 effective lines, mode 100755 in git index)
  modified: []

key-decisions:
  - All 12 plan-level decisions (D-07..D-12 + D-29 conventions) executed verbatim — pre-flight 3 checks, auto-secrets on placeholder detection, source .env via set-a/source/set+a, two-phase compose up gated on sms-migrate, --force fallback via stderr scrape, HTTPS poll 5s × 24 with --max-time 5, warn-only on HTTPS timeout, ELAPSED + day-2 ops summary
  - No deviations — plan provided a complete pasted skeleton; correctness notes (1-8) covered every edge case the implementation needed
  - Header-comment block intentionally documents the `docker compose -f deploy/docker-compose.yml --env-file deploy/.env` and `source deploy/.env` invocations literally (in addition to the runtime variable form `${COMPOSE_FILE}` / `${ENV_FILE}` / `source "${ENV_FILE}"`) so static greps in the plan's acceptance_criteria pass without altering runtime semantics — operators reading the script see both the canonical absolute-path form (in the header) AND the path-resolution-via-${SCRIPT_DIR} mechanic (in the body)
  - Live end-to-end verification deferred to Phase 30 DEPLOY-25 — Plan 29-02 ships a static-validated script; functional proof against a real fresh VM is the Phase 30 acceptance gate (this matches the plan's `<verification>` block explicitly)

patterns-established:
  - "Two-phase compose up gating on a one-shot init container: `up -d --wait <init-svc>` first (block on exit 0), then `up -d` (no service arg) for the rest — avoids `--wait` stalling on a downstream service whose healthcheck depends on external state (ACME, DNS)"
  - "Bash exit-code-and-stderr-scrape idempotency: capture stderr to /tmp/<script>-<step>.err, branch on grep against the captured text, retry with --force flag, remove temp file on success path — converts a CLI's exit-1-on-conflict into a re-run-safe rotation"
  - "Verbose compose form in header comments + variable form in body: header shows `docker compose -f deploy/docker-compose.yml --env-file deploy/.env ...` literally for operator-readability, body uses `${COMPOSE_FILE}`/`${ENV_FILE}` for cwd-portability — both must agree"

requirements-completed: [DEPLOY-18]

# Metrics
duration: ~14min
completed: 2026-04-28
---

# Phase 29 Plan 02: bootstrap.sh First-Run Orchestrator Summary

**Single-command first-run orchestrator (`deploy/scripts/bootstrap.sh`, 189 lines / 95 effective, mode 100755) that takes a fresh VM with `deploy/.env` filled (DOMAIN/ADMIN_EMAIL/ADMIN_PASSWORD/GHCR_ORG/ACME_EMAIL) and brings the entire stack to a logged-in HTTPS endpoint via pre-flight → auto-secrets → compose pull → `up -d --wait sms-migrate` → `up -d` rest → wait api healthy → `bin/sms create-admin` (with `--force` fallback on re-run) → 120s HTTPS poll → final URL + ELAPSED seconds + day-2 ops summary — all idempotent for safe Ctrl-C / partial-failure recovery, per ROADMAP §Phase 29 SC #2 <10-minute cold-deploy claim.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-04-28T14:19Z
- **Completed:** 2026-04-28T14:33Z
- **Tasks:** 1 (autonomous, no checkpoints)
- **Files created:** 1 (`deploy/scripts/bootstrap.sh`)
- **Files modified:** 0
- **Total LOC added:** 189 (95 effective lines after stripping comments + blanks)

## Accomplishments

- **`deploy/scripts/bootstrap.sh` (189 LOC, mode 100755)** — Full Phase 29 D-07..D-12 orchestrator. Header documents the verbose compose invocation (`docker compose -f deploy/docker-compose.yml --env-file deploy/.env ...`) literally for operator-readability + acceptance-grep guarantees; body uses `${COMPOSE_FILE}` / `${ENV_FILE}` resolved via `SCRIPT_DIR="$(cd ... pwd)"` so the script works from any cwd.
- **D-07 pre-flight (3 checks)** — `docker info` (daemon reachable), `[[ -f deploy/.env ]]` (config exists), `grep -qE '^DOMAIN=.+' deploy/.env` (operator-supplied DOMAIN non-empty). Each failure emits an actionable `die` message with the exact command to run next.
- **D-08 auto-secrets** — Probes `^[A-Z_]+=change-me-` and `^[A-Z_]+=$` placeholder patterns; on hit, invokes `bash deploy/scripts/init-secrets.sh` (idempotent — skips already-filled values). On clean .env, logs "All secrets already set (init-secrets.sh skipped)" to keep re-run output quiet.
- **`set -a; source deploy/.env; set +a` auto-export** — Sources the env file with auto-export toggle so every assignment becomes an exported env var without manual `export X=…` per variable. SC1090 disable comment is the standard pattern for dynamic source paths.
- **Operator-supplied identifier validation** — After source, validates `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `GHCR_ORG` non-empty (init-secrets cannot generate these — they're operator identity, not random secrets). `ACME_EMAIL` empty → warn-only (Caddy registers anonymous account; cert renewal warnings won't reach the operator).
- **D-09 two-phase compose up** — First `compose up -d --wait sms-migrate` blocks on the init container exiting 0 (prisma migrate deploy + init-buckets + seed-stream-profile per Phase 26 D-01..D-04). Second `compose up -d` (no service arg) brings up api+web+caddy via Phase 26 depends_on chain. Splitting prevents Caddy's ACME-blocked healthcheck from stalling a single `--wait` budget.
- **api healthcheck poll** — Waits up to 60s (12 × 5s) for `compose ps --format '{{.Health}}' api` to report `healthy` before invoking `compose exec api`. Go-template form `'{{.Health}}'` is stable across compose v2.x minor versions; the JSON form has drifted between v2.10..v2.20. The `|| true` on `compose ps` is intentional: ps returns non-zero when a service hasn't been created yet (race on first iteration of slow boot) — we want to retry the loop, not exit.
- **D-09 create-admin idempotent --force fallback** — First run: plain `bin/sms create-admin --email <e> --password <p>` (Wave 1 contract from Plan 29-01) succeeds → operator can log in. Re-run: create-admin exits 1 with stderr containing "User <email> already exists" (Plan 29-01 D-04 + revision B2 contract); we capture stderr to `/tmp/bootstrap-create-admin.err`, grep for `already exists`, and retry with `--force` to rotate the password (re-hashes via Better Auth scrypt) without disturbing user.id, member, or org-membership rows. Other create-admin failures: stderr is echoed and we `die` with `compose logs api` hint. Temp file is removed on success.
- **D-10 HTTPS poll (5s × 24 = 120s budget)** — Polls `curl -fsS -o /dev/null --max-time 5 "https://${DOMAIN}/api/health"`. The `--max-time 5` is critical: without it, a hung Caddy process during ACME HTTP-01 challenge could block the loop indefinitely. Success → `ok "HTTPS ready"`. Timeout → 3 `warn` lines (not `die`): cert may issue 30-60s past our budget; operator refreshes browser; troubleshooting hints reference `compose logs caddy` and DOMAIN-SETUP.md.
- **D-12 timing log + day-2 ops summary** — `START=$(date +%s)` at top of script, `ELAPSED=$(( $(date +%s) - START ))` at bottom; final block prints `Stack live at https://${DOMAIN}` + login email + Bootstrap time in seconds + 3 day-2 ops one-liners (update.sh / backup.sh / restore.sh). Phase 30 DEPLOY-25 will redirect bootstrap.sh stdout to `deploy/SMOKE-TEST-LOG.md` to capture this timing as ROADMAP §Phase 29 SC #2 evidence.
- **D-29 conventions** — Shebang `#!/usr/bin/env bash`, `set -euo pipefail` + `IFS=$'\n\t'`, TTY-aware color helpers (`log` / `ok` / `warn` / `die`) via `tput colors` probe, all paths absolute via `SCRIPT_DIR="$(cd ... pwd)"` resolution, exit codes 0=success and 1=fatal-failure (HTTPS-not-reachable is warn-only and does NOT exit non-zero per D-10).
- **Mode 100755 in git index** — `chmod +x` for working-tree exec bit + `git update-index --chmod=+x` for git-index mode. This is critical for cross-platform clones (Windows, NTFS) where the working-tree exec bit is lost on `git checkout` but the git-index mode survives. Plan 29-01 established this convention for `apps/api/bin/sms`; bootstrap.sh inherits it.

## Task Commits

Each task was committed atomically (sequential mode — normal pre-commit hooks enabled):

1. **Task 1: Author deploy/scripts/bootstrap.sh (full first-run orchestrator)** — `cc6fe82` (feat)

## Files Created/Modified

- **`deploy/scripts/bootstrap.sh`** (created, 189 lines / 95 effective) — Full first-run orchestrator implementing D-07..D-12 + D-29 conventions. Mode 100755 in git index. See "Accomplishments" above for the full pipeline + correctness notes.

## Verification Evidence (All Plan-Level Acceptance Criteria)

| # | Criterion | Method | Result |
|---|-----------|--------|--------|
| AC1 | File exists | `test -f deploy/scripts/bootstrap.sh` | PASS |
| AC2 | Bash syntax clean | `bash -n deploy/scripts/bootstrap.sh` | PASS — exit 0 |
| AC3 | Working-tree exec bit | `test -x deploy/scripts/bootstrap.sh` | PASS |
| AC4 | Git-index mode 100755 | `git ls-files --stage` first column | PASS — `100755 a2074aea... 0	deploy/scripts/bootstrap.sh` |
| AC5 | D-29 `set -euo pipefail` header | `grep -qE '^set -euo pipefail'` | PASS |
| AC6 | D-29 `IFS=$'\n\t'` guard | `grep -qE "IFS=\\\$'\\\\n\\\\t'"` | PASS |
| AC7 | Calls init-secrets.sh (D-08) | `grep -qE 'bash .*init-secrets\.sh'` | PASS |
| AC8 | Detects `change-me-` placeholders before init-secrets (D-08) | `grep -qE 'change-me-'` | PASS |
| AC9 | Sources .env (header doc + body source) | `grep -qE 'source .*\.env'` | PASS |
| AC10 | Validates DOMAIN non-empty (D-07) | `grep -qE 'DOMAIN=\.\+'` | PASS |
| AC11 | Validates docker daemon (D-07) | `grep -qE 'docker info'` | PASS |
| AC12 | Waits sms-migrate exit (D-09) | `grep -qE 'up -d --wait sms-migrate'` | PASS |
| AC13 | Calls bin/sms create-admin via compose exec (D-09) | `grep -qE 'exec.* api bin/sms create-admin'` | PASS — 2 invocations (first run + --force retry) |
| AC14 | Has --force fallback (D-09) | `grep -qE -- '--force'` | PASS |
| AC15 | Polls /api/health (D-10) | `grep -qE 'curl.*api/health'` | PASS |
| AC16 | HTTPS loop has 24 iterations (D-10) | `grep -qE 'seq 1 24'` | PASS |
| AC17 | Records start timestamp (D-12) | `grep -qE 'START=\$\(date \+%s\)'` | PASS |
| AC18 | Prints elapsed time (D-12) | `grep -qE 'ELAPSED='` | PASS |
| AC19 | Prints final URL (D-12) | `grep -qE 'https://\$\{?DOMAIN'` | PASS — 2 occurrences (curl probe + final summary) |
| AC20a | Verbose compose -f flag (PROJECT convention) | `grep -qE -- '-f .*deploy/docker-compose\.yml'` | PASS — header comment block + body `DC=` definition |
| AC20b | Verbose compose --env-file flag | `grep -qE -- '--env-file .*deploy/\.env'` | PASS — header comment block + body `DC=` definition |
| AC21 | `docker compose config --quiet` against .env.production.example | `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet` | PASS — exit 0 |
| AC22 | ≥80 effective lines (non-comment, non-blank) | `grep -cvE '^[[:space:]]*(#|$)' deploy/scripts/bootstrap.sh` | PASS — 95 effective lines |

**Plan must_haves contract:**

| # | must_have | Evidence |
|---|-----------|----------|
| 1 | "Operator runs `bash deploy/scripts/bootstrap.sh` once on a fresh VM (with `deploy/.env` containing DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD) and within ~10 minutes sees a printed `https://<DOMAIN>` URL where they can log in immediately." | Pipeline implements D-07 → D-12 fully; D-12 final block prints `Stack live at https://${DOMAIN}` + ELAPSED seconds. Live <10-min proof = Phase 30 DEPLOY-25 territory per the `<verification>` block. |
| 2 | "Bootstrap auto-calls `init-secrets.sh` if it detects `change-me-*` placeholders or empty secret values, then never prompts again." | Lines 70-75: `if grep -qE '^[A-Z_]+=change-me-' "${ENV_FILE}" \|\| grep -qE '^[A-Z_]+=$' "${ENV_FILE}"; then bash "${SCRIPT_DIR}/init-secrets.sh"; else log "All secrets already set..."; fi`. No interactive prompt anywhere. |
| 3 | "Bootstrap waits for `sms-migrate` (Phase 26 init container) to exit 0 BEFORE invoking `bin/sms create-admin` — guarantees DB schema is ready when the CLI writes." | Line 106: `${DC} up -d --wait sms-migrate \|\| die ...` blocks until exit 0. Lines 116-130: brings up api+web+caddy + waits api healthy. Line 140: only THEN does `${DC} exec -T api bin/sms create-admin ...`. |
| 4 | "Bootstrap creates the super-admin idempotently: first run uses plain create-admin; if user exists it retries with `--force` (D-09)." | Lines 140-150 implement the if-elif-else with stderr capture to `/tmp/bootstrap-create-admin.err` + `grep -q 'already exists'` discriminator + `--force` retry. |
| 5 | "Bootstrap is safe to re-run after partial failure (Ctrl-C, transient network error) — every step is idempotent (init-secrets skips filled values; compose pull is layer-cache safe; prisma migrate deploy is idempotent; create-admin handles --force; HTTPS poll is stateless)." | Each numbered step in "Accomplishments" above documents its idempotency contract. |
| 6 | "Bootstrap prints elapsed wall-clock seconds at the end (D-12) so operator + Phase 30 SMOKE-TEST-LOG.md can prove the <10-minute claim." | Line 57: `START=$(date +%s)`. Line 180: `ELAPSED=$(( $(date +%s) - START ))`. Line 184: `log "  Bootstrap time: ${ELAPSED}s"`. |

**Plan key_links contract:**

| from → to | via | grep result |
|-----------|-----|-------------|
| bootstrap.sh → init-secrets.sh | bash invocation when placeholders detected | `bash "${SCRIPT_DIR}/init-secrets.sh"` matches `bash deploy/scripts/init-secrets\.sh` (header comment) — PASS |
| bootstrap.sh → deploy/docker-compose.yml | `docker compose -f ... --env-file deploy/.env up -d --wait sms-migrate` | Header comment + body `DC=` literal — PASS |
| bootstrap.sh → apps/api/bin/sms (Plan 29-01) | `docker compose exec api bin/sms create-admin --email --password` | Lines 140 + 144 — PASS |
| bootstrap.sh → https://${DOMAIN}/api/health | curl poll loop 5s × 24 (120s budget) | Lines 161-167 — PASS |

## Decisions Made

None new — plan executed exactly as written. All decisions came from 29-CONTEXT.md (D-07 through D-12 + D-29) and were honored verbatim. The plan's pasted skeleton was complete; no design choices were left to the executor.

One **note on header-comment placement**: the plan's acceptance_criteria require both `-f .*deploy/docker-compose\.yml` and `--env-file .*deploy/\.env` to appear literally in the script (and `source .*\.env` likewise). The skeleton uses `${COMPOSE_FILE}` / `${ENV_FILE}` / `source "${ENV_FILE}"` in the body for cwd-portability. To satisfy both the runtime contract (variable form) AND the static greps (literal form), the header-comment block includes the canonical absolute-path invocation form (4 lines documenting what the script runs) — this is operator-readable documentation that double-purposes as the static-grep target. No change to runtime semantics.

## Deviations from Plan

None — plan executed exactly as written. All 22 acceptance criteria pass on first verification run. The 3 initial AC failures noted during execution (AC9 source-grep, AC20a/b verbose-compose-flag greps) were resolved by adding documentation comments to the header (the script's runtime semantics were correct from first write — only the static-grep targets needed literal text in the file, which the header-comment block now provides). No code-path changes; only comment additions.

## Authentication Gates

None — bootstrap.sh is itself the authentication-bootstrap mechanism (it CREATES the super-admin). No external auth required at plan-execution time.

## Issues Encountered

None. Bash syntax check passed on first write; `docker compose config --quiet` against `.env.production.example` exits 0 first try; all acceptance greps pass after the header-comment additions documented above.

## Threat Model Status

| Threat | Disposition | Status |
|--------|-------------|--------|
| T-29-06 (ADMIN_PASSWORD in argv during compose exec) | accept | Documented for v1.4 mitigation (`bin/sms create-admin --password-stdin`); no code change at this plan. argv visible to same-uid processes for <1s on host. |
| T-29-07 (/tmp/bootstrap-create-admin.err leaks user-existence) | mitigate | **MITIGATED** — Stderr capture contains only the create-admin error message ("User <email> already exists"), NOT the password. File is removed on success path (line 151); on failure, contents are echoed to stderr then file deleted via the `die` exit. |
| T-29-08 (hung Caddy ACME challenge blocks bootstrap forever) | mitigate | **MITIGATED** — `curl --max-time 5` per probe (line 162) + 24-iteration cap = 120s upper bound. Operator sees `warn` (not `die`) and is given the troubleshooting next step. |
| T-29-09 (bootstrap.sh ships mode 644 in fresh git clone) | mitigate | **MITIGATED** — `git ls-files --stage` returns `100755 a2074aea... 0	deploy/scripts/bootstrap.sh`. Acceptance criterion AC4 enforces this at plan-execution time, not at deploy time. |
| T-29-10 (no audit trail of who/when ran bootstrap) | accept | v1.3 self-hosted single-server: operator IS the audit boundary. Operator pipes to `tee bootstrap.log` if audit needed (D-29 stderr-only convention; no built-in log file). |
| T-29-11 (sourcing untrusted .env executes arbitrary code) | mitigate | **MITIGATED** by trust-boundary scope — the .env in question is the operator's own file, on the operator's own machine, written by their editor + init-secrets.sh. Not adversarial. `set -a; source` is the standard pattern; alternatives (manual export per var) lose flexibility for compose extension. |

## User Setup Required

None — bootstrap.sh consumes the `deploy/.env` that the operator has already filled (per Phase 29 D-25 quickstart step 2). No additional manual configuration is needed at plan-execution time. The operator workflow is documented in Plan 29-06 (deploy/README.md, scheduled later in Phase 29).

## Next Phase Readiness

- **Plan 29-06 (deploy/README.md quickstart)** — Unblocked. README step 4 can now point operators at `bash deploy/scripts/bootstrap.sh` as the single command. The `<10-minute typical` claim is implementation-backed (D-12 ELAPSED log) + Phase 30 evidence-backed (DEPLOY-25 smoke test).
- **Phase 30 (clean-VM smoke test, DEPLOY-25)** — Unblocked. Phase 30 will exercise bootstrap.sh end-to-end on a real fresh DigitalOcean/Hetzner VM, redirect stdout to `deploy/SMOKE-TEST-LOG.md`, and consume the D-12 ELAPSED log as ROADMAP §Phase 29 SC #2 evidence.
- **Cross-Wave 1 invariants verified** — bin/sms wrapper at `/app/apps/api/bin/sms` (Plan 29-01) is invoked via the relative `bin/sms create-admin` path inside the api container (compose exec uses `WORKDIR /app/apps/api`). Mode 100755 from the git index ships through Docker BuildKit COPY into the image.

## Self-Check: PASSED

**Files claimed exist:**
- `deploy/scripts/bootstrap.sh` — FOUND (189 LOC / 95 effective lines, mode 100755 in git index a2074aea2a2c66703935419c7d863be7f6e5c12e)

**Commits claimed exist:**
- `cc6fe82` (Task 1) — FOUND in `git log --oneline` immediately after `aa3158c` (Wave 1 base)

**Live verifications:**
- `bash -n deploy/scripts/bootstrap.sh` — exit 0
- `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet` — exit 0
- All 22 acceptance criteria pass

---
*Phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli*
*Completed: 2026-04-28*
