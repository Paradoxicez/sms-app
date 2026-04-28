---
phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli
plan: 03
subsystem: deploy/operator-tooling
tags: [deploy, operator, update, image-tag, atomic-upgrade, ghcr, image-pull]
requirements: [DEPLOY-19]

dependency-graph:
  requires:
    - "deploy/docker-compose.yml (Phase 26 — sms-migrate service + depends_on chain)"
    - "deploy/.env.production.example (Phase 26 D-25 — IMAGE_TAG= line)"
    - "deploy/Caddyfile (Phase 27 — exposes https://${DOMAIN}/api/health)"
    - "deploy/scripts/init-secrets.sh (Phase 26 — chmod 600 + sed-inplace pattern reference)"
    - "ghcr.io/${GHCR_ORG}/sms-{api,web}:<tag> (Phase 28 build-images.yml output)"
  provides:
    - "deploy/scripts/update.sh — single-positional-arg upgrade script with atomic pre-flight migrate guard"
    - "Operator workflow: bash deploy/scripts/update.sh v1.3.1 → atomic switch or rollback"
  affects:
    - "deploy/.env (in-place sed of IMAGE_TAG= line on green migrate)"
    - "deploy/.env.backup-<UTC-ts> (new backup file per upgrade, mode 600)"
    - "Running stack (compose up -d recycle via Phase 26 depends_on chain)"

tech-stack:
  added: []
  patterns:
    - "Atomic pre-flight migrate guard (D-15): IMAGE_TAG=${TAG} compose run --rm sms-migrate runs against new image with .env unchanged; only on green light is .env rewritten"
    - "Portable sed -i.tmp + rm -f *.tmp (D-14): works on BSD sed (macOS dev) and GNU sed (Ubuntu prod) without OS detection"
    - "TTY-aware color output (D-29): tput colors ≥8 → bold/red/green/yellow; else plain (CI safety)"
    - "Health probe via reverse-proxy ground truth (D-16): https://${DOMAIN}/api/health (Caddy → api), not http://localhost"
    - "Recycle order via depends_on chain inheritance (Phase 26 D-21): compose up -d alone triggers postgres → redis → minio → sms-migrate completed → api → web → caddy"

key-files:
  created:
    - "deploy/scripts/update.sh"
  modified: []

decisions:
  - "D-13 inheritance: Semver regex ^v[0-9]+\\.[0-9]+\\.[0-9]+(-[a-z0-9]+(\\.[a-z0-9]+)*)?$|^latest$ — accepts v1.3.1, v1.3.2-rc1, v1.3.1-rc.1.2, latest; rejects v1.3 (2-part), sha-14f638d, 1.3.1 (no v-prefix), v1.3.1-RC1 (uppercase). Lowercase-only because Phase 28 D-04 docker/metadata-action emits lowercase."
  - "D-14 inheritance: .env backup uses UTC timestamp .env.backup-<YYYYMMDDTHHMMSSZ>, chmod 600 immediately after cp (T-29-12 mitigation — without this, default umask 022 leaks DB_PASSWORD/ADMIN_PASSWORD to host users at 644)."
  - "D-15 inheritance: Pre-flight migrate runs FIRST against new image with env-prefix override (.env unchanged). awk ordering guard in acceptance criteria proves migrate line < sed line in source — atomic guarantee that broken migration cannot mutate .env."
  - "D-16 inheritance: curl probes https://${DOMAIN}/api/health (Caddy reverse-proxy → api), not http://localhost:3003 — ground-truth user-facing surface. 5s × 24 iterations = 120s budget aligned with Caddy + api healthcheck start_period sums."
  - "Compose recycle uses bare up -d (no --force-recreate, no --no-deps). --force-recreate would re-pull volumes risk; --no-deps would skip the depends_on chain. Default up -d notices image diff and recycles only affected services, leaving volumes intact."
  - "Pre-flight extends plan skeleton: added docker daemon ping, compose v2 presence, IMAGE_TAG= line presence in .env (sed-rewrite cannot no-op silently). These satisfy Rule 2 (auto-add missing critical functionality) — without them the script would fail-late inside compose pull or sed-target-missing."

metrics:
  duration_minutes: 12
  tasks_completed: 1
  files_created: 1
  files_modified: 0
  total_lines: 128
  effective_lines: 81
  commits: 1
  completed_date: "2026-04-28"
---

# Phase 29 Plan 03: deploy/scripts/update.sh — Atomic Image-Tag Upgrade Summary

Single-positional-argument upgrade script (`bash deploy/scripts/update.sh v1.3.1`) implementing the Phase 29 D-13..D-16 atomic upgrade contract: pre-flight migrate test against the new image runs BEFORE `.env` is mutated, so a broken migration cannot leave the operator with `IMAGE_TAG=v1.3.1, services running v1.3.0, migrate broken` — instead `.env` stays untouched and the stack keeps running the old tag.

## What Was Built

**`deploy/scripts/update.sh`** — 128 total lines, 81 effective (non-comment, non-blank), mode 100755 in git index. Structure outline:

| Section | Lines (approx) | Purpose |
|---------|----------------|---------|
| Shebang + header banner | 1-22 | Usage + manual rollback recipe + exit-code legend |
| `set -euo pipefail` + IFS | 24-25 | D-29 safety header |
| SCRIPT_DIR / DEPLOY_DIR / ENV_FILE / COMPOSE_FILE resolution | 27-30 | Works from any cwd |
| TTY-aware color helpers (log/ok/warn/die) | 33-50 | D-29 |
| D-13 positional arg + semver regex validation | 53-60 | exit 2 on missing/invalid |
| Pre-flight (file presence + docker daemon + compose v2 + IMAGE_TAG= line + DOMAIN sourced) | 63-78 | Rule 2 hardening over plan skeleton |
| Step 1: `IMAGE_TAG=${TAG} ${DC} pull` | 84-86 | Idempotent docker layer cache |
| Step 2: D-15 pre-flight migrate via `${DC} run --rm sms-migrate` | 89-95 | Atomic guard — exits 1 + .env untouched on failure |
| Step 3: D-14 backup + sed -i.tmp IMAGE_TAG rewrite | 98-104 | TS=$(date -u …); cp; chmod 600; sed; rm -f *.tmp |
| Step 4: `${DC} up -d` (depends_on chain drives recycle) | 107-111 | postgres → redis → minio → sms-migrate → api → web → caddy |
| Step 5: D-16 curl https://${DOMAIN}/api/health 5s × 24 loop | 114-122 | exit 0 on 200; print rollback hint with exact backup path |
| Failure tail: warn + rollback hint + log inspection commands | 124-128 | exit 1 |

## Verification Results

### `git ls-files --stage`

```
100755 1c6371d6c2d09bf88a8a974c5cfe096b73fc1194 0	deploy/scripts/update.sh
```

Mode `100755` confirmed in git index (executable bit preserved across COPY operations in future Dockerfile rebuilds, though update.sh itself runs on the host, not in a container).

### awk Ordering Check (D-15 atomic guarantee)

```
awk '/run --rm sms-migrate/{m=NR}/sed -i\.tmp.*IMAGE_TAG=/{s=NR}END{...}' deploy/scripts/update.sh
→ migrate_line=93  sed_line=102  m<s = 1
```

Migrate line (93) precedes sed line (102) by 9 lines in the source. The script CANNOT mutate `.env` before migrate exits 0.

### `docker compose config --quiet` Smoke Test

```
docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet
→ exit=0
```

Compose syntax + env interpolation valid against the Phase 26 example env file.

### Static Acceptance Criteria (17/17 PASS)

All grep guards from the plan pass:

| # | Check | Result |
|---|-------|--------|
| 1 | `bash -n deploy/scripts/update.sh` exit 0 | PASS |
| 2 | Working-tree executable | PASS |
| 3 | git index mode 100755 | PASS |
| 4 | `^set -euo pipefail` | PASS |
| 5 | `TAG="${1:-}"` positional arg pattern | PASS |
| 6 | Semver+prerelease+latest regex literal | PASS |
| 7 | awk migrate-before-sed ordering | PASS |
| 8 | cp ENV_FILE …backup-…TS pattern (single line) | PASS |
| 9 | `TS=$(date -u …)` UTC timestamp | PASS |
| 10 | `chmod 600 …BACKUP` | PASS |
| 11 | `sed -i.tmp "s\|^IMAGE_TAG=.*\|IMAGE_TAG=${TAG}\|"` D-14 verbatim | PASS |
| 12 | `rm -f …\.tmp` after sed | PASS |
| 13 | `curl …https://${DOMAIN}…api/health` Caddy probe | PASS |
| 14 | `seq 1 24` health-loop iterations | PASS |
| 15 | `${DC} up -d` present, no `--force-recreate`, no `--no-deps` | PASS |
| 16 | `exit 2` on missing/invalid arg | PASS |
| 17 | Effective length ≥80 lines (got 81) | PASS |

### Regex Self-Test (10/10)

| Input | Expected | Actual |
|-------|----------|--------|
| `v1.3.1` | accept | accept |
| `v1.3.2-rc1` | accept | accept |
| `v1.3.0-beta.1` | accept | accept |
| `latest` | accept | accept |
| `v1.3.1-rc.1.2` | accept | accept |
| `v1.3` | reject | reject |
| `sha-14f638d` | reject | reject |
| `1.3.1` (no `v` prefix) | reject | reject |
| `v1.3.1-RC1` (uppercase prerelease) | reject | reject |
| `` (empty) | reject | reject |

Confirms D-13 spec literal: lowercase semver with optional dotted lowercase prerelease, plus the `latest` escape hatch. Phase 28 D-04 emits exactly this format.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical pre-flight] Added docker daemon + compose v2 + IMAGE_TAG= line assertions**

- **Found during:** Task 1 — building the script from the plan skeleton.
- **Issue:** Plan skeleton checked file presence only (`[[ -f ENV_FILE ]]`, `[[ -f COMPOSE_FILE ]]`). If `docker info` fails, `IMAGE_TAG=${TAG} ${DC} pull` would fail mid-stream with a confusing daemon-connection error after the user thinks the script is "running". If the `.env` file lacks an `IMAGE_TAG=` line entirely (operator hand-edited it), `sed -i.tmp` would silently no-op and the recycle would re-pull the OLD tag — defeating the whole purpose of the script.
- **Fix:** Added 3 explicit pre-flight assertions after the existing file-presence checks: `command -v docker`, `docker compose version`, `docker info`, and `grep -qE '^IMAGE_TAG='`. Each fails fast with a specific error message before any state-mutating operation.
- **Files modified:** `deploy/scripts/update.sh` (lines 67-72)
- **Commit:** `d0ebd86`
- **Why Rule 2:** These are correctness requirements, not features. Without them the script silently produces wrong outcomes (wrong tag deployed) or confusing errors (mid-pull daemon disconnect). Rule 2 mitigates threat T-29-14 (DoS via malformed-but-regex-passing input causing compose hang) by failing earlier in the chain.

**2. [Rule 2 — Track OLD_TAG for rollback hint] Capture sourced IMAGE_TAG before mutation**

- **Found during:** Task 1 — writing the failure-tail rollback message.
- **Issue:** Plan skeleton's rollback hint says `bash ${SCRIPT_DIR}/update.sh <old-tag>` — operator has to remember/look up what their old tag was. If they ran `update.sh latest` and don't have the previous semver memorized, recovery is harder.
- **Fix:** Source `${ENV_FILE}` before sed (already required for `${DOMAIN}`), capture `OLD_TAG="${IMAGE_TAG:-unknown}"`, and substitute `${OLD_TAG}` into the success-path AND failure-path rollback hint. Operator now sees the literal old tag they should rollback to.
- **Files modified:** `deploy/scripts/update.sh` (lines 80-81, 121, 126)
- **Commit:** `d0ebd86`
- **Why Rule 2:** Improves operator recovery UX without changing semantics. Phase 29 entire goal is "operator typed one command and the stack is live OR rolled back" — a rollback hint that requires further research is degraded UX.

### Authentication Gates Encountered

None. Static-only verification; no live docker/compose runs that would require GHCR pull authentication.

### Threat Model Status

All 5 threats from the plan's `<threat_model>` are addressed by the implementation as designed:

| Threat | Mitigation in Source |
|--------|----------------------|
| T-29-12 (backup leaks secrets via default umask 644) | `chmod 600 "${BACKUP}"` immediately after cp at line 101 |
| T-29-13 (compromised GHCR image accepted on pull) | Accepted (deferred to v1.4 DEPLOY-27 Cosign keyless); operator can manually verify via `gh attestation verify` per TROUBLESHOOTING.md (Plan 29-06) |
| T-29-14 (malformed tag causes compose pull hang) | Regex limits TAG shape; new docker-info pre-flight detects daemon issue before pull |
| T-29-15 (manual .env edit before update.sh bypasses guard) | Accepted — script is not adversarial about its own .env file |
| T-29-16 (backup filename leaks upgrade history) | Accepted — filename pattern is intentional for rollback discoverability; chmod 600 limits content access |

No new threat surface introduced (no network endpoints, no new schema, no new auth paths).

## Known Stubs

None. Script is fully wired — no placeholder data flowing to UI, no "coming soon" text, no mock values.

## Commit History

| Hash | Message |
|------|---------|
| `d0ebd86` | feat(29-03): add deploy/scripts/update.sh atomic image-tag upgrade (DEPLOY-19) |

## Self-Check: PASSED

**Files claimed created:**
- `deploy/scripts/update.sh` — FOUND (128 lines, mode 100755 in index, exec bit set on disk)

**Commits claimed:**
- `d0ebd86` — FOUND in `git log`

**Acceptance criteria:**
- 17/17 static greps PASS
- `docker compose config --quiet`: exit 0
- Regex self-test: 10/10
- awk ordering check: migrate_line=93 < sed_line=102

**Live verification deferred to Phase 30:** A real upgrade against a deployed VM is part of DEPLOY-25 smoke flow per the plan's `<verification>` section.
