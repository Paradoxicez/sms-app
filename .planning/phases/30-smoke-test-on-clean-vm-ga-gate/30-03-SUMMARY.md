---
phase: 30-smoke-test-on-clean-vm-ga-gate
plan: 03
subsystem: infra
tags: [bash, docker-compose, caddy, lets-encrypt, prisma, nestjs, smoke-test, ga-gate]

# Dependency graph
requires:
  - phase: 27-caddy-reverse-proxy-auto-tls
    provides: deploy/Caddyfile, caddy_data volume semantics, deploy/scripts/verify-phase-27.sh, ACME staging-CA toggle
  - phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli
    provides: deploy/scripts/bootstrap.sh (Bootstrap time format), deploy/scripts/update.sh (atomic recycle), bin/sms create-admin (--force semantics)
  - phase: 30-smoke-test-on-clean-vm-ga-gate
    provides: deploy/SMOKE-TEST-LOG.md (Wave 1 evidence sink template — verify-deploy.sh appends a comment row on completion)
provides:
  - "deploy/scripts/verify-deploy.sh — Phase 30 SC#1 verifier (the heaviest of the 4 verifiers)"
  - "Folded coverage of 6 deferred UAT items: Phase 27 SC#1/#3/#4 + Phase 29 SC#1/#2/#3"
  - "Atomic /api/health probe + outage-window analysis pattern (≤5s grace)"
  - "Direct psql user.id identity check pattern for create-admin --force assertion"
affects:
  - 30-05 (smoke-test.sh wrapper composes verify-deploy.sh + verify-playback.sh + verify-nmap.sh + verify-backup.sh)
  - 30-06 (HUMAN-UAT runbook references verify-deploy.sh as the SC#1 owner)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Step-as-function pattern: each [N/7] step encapsulated in step_<name>() function so `local` keyword is valid + bash -n stays clean as the script grows"
    - "Backgrounded curl probe + post-hoc outage-window analysis for atomic-recycle assertion (extensible to backup.sh in Plan 30-05)"
    - "Best-effort SMOKE-TEST-LOG.md append guarded by `[[ -f ${LOG_FILE} ]]` — verifier never fails because of missing log"
    - "T-30-04 mitigation enforced via grep-guard: `${DC} down` (no -v flag) preserves caddy_data for the cert-persist assertion"

key-files:
  created:
    - "deploy/scripts/verify-deploy.sh — 377 lines, mode 0755, bash -n clean, 7 step functions + main"
  modified: []

key-decisions:
  - "Step-as-function structure (rather than inline if-blocks per the plan template) — required because `local` is invalid at script top-level; this also keeps bash -n clean throughout development and isolates each SC owner's logic for future debugging"
  - "Probe loop runs in backgrounded subshell with explicit wait — guarantees no orphan curl process leaks past the verifier exit"
  - "update.sh test reuses CURRENT IMAGE_TAG (no fake upgrade tag needed) — exercises the recycle codepath without forcing the smoke run to maintain two published image tags"
  - "Direct psql query for user.id identity check — cleaner than diffing API responses; ADMIN_EMAIL psql interpolation accepted per T-30-09 (trusted operator-supplied input)"
  - "ACME log scrub uses --since=2m (not 1m as drafted) — accommodates the 30s sleep + down/up latency window so the count is not falsely inflated by lingering pre-restart messages"

patterns-established:
  - "Verifier exit codes: 0=PASS, 1=HARD FAIL (D-12 GA block), 2=missing prerequisite — consistent across Plan 30-02 (verify-nmap.sh) and 30-03 (verify-deploy.sh)"
  - "TTY-aware color helpers + log/ok/warn/die functions copied verbatim from bootstrap.sh D-29 — keeps log prefix style consistent across all deploy/scripts/*.sh"
  - "PASS/FAIL counter pattern with pass_check/fail_check helpers — same shape as verify-phase-27.sh check() function but with separate counters for explicit summary"
  - "Best-effort evidence-sink append: `[[ -f ${LOG_FILE} ]]` guard means verifier survives a missing template; future verifiers should follow this pattern"

requirements-completed: [DEPLOY-25]

# Metrics
duration: 3min
completed: 2026-04-29
---

# Phase 30 Plan 03: verify-deploy.sh Authorship Summary

**Authored deploy/scripts/verify-deploy.sh — the heaviest Phase 30 verifier — covering bootstrap.sh cold-deploy timing (≤600s), HTTPS reachability + 308 redirect, ACME cert persistence across down/up, verify-phase-27.sh re-run, bin/sms create-admin idempotency + --force user.id preservation, and update.sh atomic recycle (≤5s /api/health outage). 377 LOC bash, mode 0755, bash -n clean, folds 6 deferred UAT items into one runnable script.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-29T04:04:00Z
- **Completed:** 2026-04-29T04:07:10Z
- **Tasks:** 2
- **Files modified:** 1 (created `deploy/scripts/verify-deploy.sh`)

## Accomplishments

- Authored deploy/scripts/verify-deploy.sh end-to-end across 7 steps, structured as 7 named functions + main composer
- All 7 step labels [1/7]..[7/7] present and grep-verified
- Pre-flight rejects 8 distinct missing prerequisites with exit 2 + actionable error messages (docker, compose v2, curl, .env, DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD, GHCR_ORG)
- T-30-04 mitigation enforced: `${DC} down` (no -v flag) — verified by `! grep -qE '\${DC} down -v'` acceptance test
- Backgrounded curl probe loop (180s, 1s interval) + post-hoc longest-contiguous-non-200-window analysis for atomic-recycle assertion (Phase 29 SC#3)
- Direct psql identity check for create-admin --force (Phase 29 D-09 user.id-preservation contract)
- Best-effort SMOKE-TEST-LOG.md append (HTML comment row) on completion — guarded by `[[ -f ${LOG_FILE} ]]` so verifier survives missing log
- bash -n exit 0; chmod 0755 applied; git update-index --chmod=+x set (git ls-files --stage returns 100755)

## Task Commits

Each task was committed atomically (--no-verify per parallel executor protocol):

1. **Task 1: Author steps [1-4]/7 — preflight, cold-deploy timing, HTTPS, cert persistence** — `50b5430` (feat)
2. **Task 2: Layer steps [5-7]/7 — create-admin, update.sh recycle, summary** — `8019e48` (feat)

## Files Created/Modified

- **Created:** `deploy/scripts/verify-deploy.sh` (377 lines, mode 0755) — Phase 30 SC#1 verifier
  - Pre-flight: 8 prerequisite checks → exit 2
  - `step_cold_deploy_timing()`: tears down (preserves volumes), runs bootstrap.sh, parses `Bootstrap time: <N>s`, asserts N≤600
  - `step_https_reachable()`: curl https://${DOMAIN}/api/health 200 + http://${DOMAIN}/ 308/301
  - `step_cert_persistence()`: down/up cycle, sleep 30s, asserts 0 'certificate obtained' in caddy logs --since=2m
  - `step_verify_phase_27()`: bash deploy/scripts/verify-phase-27.sh, exit-code propagation
  - `step_create_admin_idempotent()`: re-run create-admin → asserts 'already exists' string; --force → asserts user.id unchanged via psql
  - `step_update_atomic_recycle()`: bg probe loop, run update.sh, analyze longest non-200 window ≤5s
  - `step_summary_and_exit()`: PASS/FAIL summary, append `<!-- verify-deploy.sh run ... -->` to SMOKE-TEST-LOG.md, exit 0/1

## Decisions Made

1. **Step-as-function structure**: The plan template embeds `local` keyword inside top-level if-blocks, which is invalid bash (`local` only works inside functions). Rather than rewrite each step to drop `local` (sacrificing scoping discipline for ~150 lines of conditional state), encapsulated each step in its own `step_<name>()` function. Side effect: bash -n stays clean throughout development, and each SC owner's logic is now isolatable for future per-SC debugging.

2. **ACME log scrub window: --since=2m (not 1m)**: The plan drafted `--since=1m`, but the down/up cycle (~5-10s) + sleep 30s easily exhausts a 1-minute window before the grep runs. Bumped to 2m so the post-restart caddy log capture is reliably non-empty. No effect on the assertion (still grep-counting `certificate obtained` lines).

3. **update.sh test reuses CURRENT IMAGE_TAG**: The plan's CRITICAL constraint section explicitly endorses this — exercising the recycle codepath without requiring two published image tags is the only practical option for a single-VM smoke run. Documented in the script comment block at step [6/7].

4. **Direct psql for user.id check (T-30-09 accept)**: The plan's threat model explicitly accepts ADMIN_EMAIL psql interpolation as trusted operator-supplied input. Implementation honors this — single-quote interpolation, no escaping. Comment in step [5/7] cites T-30-09 disposition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `local` keyword inside top-level conditional blocks → invalid bash**
- **Found during:** Task 1 (initial draft of step [1/7])
- **Issue:** Plan template embeds `local elapsed`, `local boot_start`, `local probe_pid`, etc. inside top-level `if`/`for` blocks. `local` is only valid inside functions; bash -n would have thrown `local: can only be used in a function` during execution.
- **Fix:** Wrapped each [N/7] step body in a dedicated `step_<name>()` function, called sequentially in a `# Main execution` block at script bottom. All `local` declarations now reside inside functions, syntactically valid.
- **Files modified:** deploy/scripts/verify-deploy.sh
- **Verification:** `bash -n deploy/scripts/verify-deploy.sh` exits 0 on both Task 1 partial commit and Task 2 final commit
- **Committed in:** 50b5430 (Task 1) + 8019e48 (Task 2)

**2. [Rule 1 - Bug] Plan's bootstrap-log grep regex `\[bootstrap\] Bootstrap time: [0-9]+s` would not match actual output**
- **Found during:** Task 1 (cross-checking against deploy/scripts/bootstrap.sh:185)
- **Issue:** bootstrap.sh emits `printf '%s[bootstrap]%s %s\n'` where the `[bootstrap]` is wrapped in `${BOLD}`/`${RESET}` ANSI escape codes when stdout is a TTY. The literal `\[bootstrap\]` regex would only match in non-TTY runs. Also: the actual emitted text is `Bootstrap time: <N>s`, not `Bootstrap completed in <N>s` as the plan's frontmatter assumed.
- **Fix:** Use `grep -oE 'Bootstrap time: +[0-9]+s'` (no bracket prefix dependency, anchors only on the literal label that survives both ANSI-stripped pipe-through-tee output and the actual emitted format from bootstrap.sh:185).
- **Files modified:** deploy/scripts/verify-deploy.sh
- **Verification:** Regex hand-traced against bootstrap.sh log output (would-be `[bootstrap] Bootstrap time: 234s`); plan's must_have explicitly cites `Bootstrap time: <N>s` in line 16 frontmatter.
- **Committed in:** 50b5430 (Task 1)

**3. [Rule 2 - Missing critical] update.sh return code captured under `set -e` would propagate before assertion**
- **Found during:** Task 2 (drafting step [6/7])
- **Issue:** With `set -euo pipefail` at the script top, a non-zero exit from `bash update.sh` would terminate the verifier BEFORE we could record FAIL=$((FAIL+1)). The plan's draft `bash update.sh ... ; update_rc=$?` pattern would never reach the post-rc check.
- **Fix:** Wrapped the update.sh invocation in `set +e` ... `set -e` so exit code is captured, then asserted, then the verifier continues to the outage-window analysis even if update.sh itself failed.
- **Files modified:** deploy/scripts/verify-deploy.sh (step [6/7])
- **Verification:** Hand-traced exit-code semantics; without `set +e` the post-rc fail_check would never fire.
- **Committed in:** 8019e48 (Task 2)

---

**Total deviations:** 3 auto-fixed (1 bug fix for invalid `local` placement, 1 bug fix for incorrect grep regex, 1 missing-critical hardening of error-flow under set -e)
**Impact on plan:** All 3 fixes essential for the script to actually run as designed. None expanded scope. The step-as-function refactor is a structural improvement (visible in the SUMMARY's patterns-established section as a reusable convention for future verifiers).

## Issues Encountered

- **Worktree base reset required**: Initial worktree HEAD (`e8ed9e2`) was based on a pre-Wave-1 commit and missed the Wave 1 outputs (deploy/SMOKE-TEST-LOG.md template, deploy/scripts/verify-nmap.sh). Per the orchestrator's `worktree_branch_check` instructions, ran `git fetch --all && git reset --hard 368860e` to bring the branch onto the correct base before any writes. Confirmed deploy/SMOKE-TEST-LOG.md is the 105-line Wave 1 template (not the pre-template stub) before proceeding.

## Next Phase Readiness

**Ready for Wave 3 (Plans 30-04, 30-05, 30-06):**
- Plan 30-04 (verify-playback.sh): can use the same step-as-function pattern + pass_check/fail_check helpers established here
- Plan 30-05 (smoke-test.sh wrapper): can directly invoke `bash deploy/scripts/verify-deploy.sh` and check exit code; the wrapper does not need to know the internal step structure
- Plan 30-06 (HUMAN-UAT runbook): the deferred UAT cross-reference table in deploy/SMOKE-TEST-LOG.md (rows for Phase 27 SC#1/#3/#4 + Phase 29 SC#1/#2/#3) maps cleanly to verify-deploy.sh as their SC owner per D-13

**Open dependency on Wave 4 (live smoke run):**
- This script is statically valid (bash -n + 21 grep guards PASS) but has NEVER been executed against a live smoke VM. First runtime exercise will surface any missed Postgres column-name assumptions, missing `bin/sms` shim, or compose service-name drift (e.g., `postgres` vs `db`). All such surface mismatches are expected — re-smoke iteration is the contract.

**No blockers for parallel siblings (30-04):** The siblings touch separate files (verify-playback.sh) and do not depend on verify-deploy.sh structure.

## Self-Check: PASSED

- File `deploy/scripts/verify-deploy.sh` exists ✓
- File mode is 0755 ✓
- Git stage mode is 100755 ✓
- bash -n exits 0 ✓
- All 21 acceptance grep guards from Tasks 1+2 PASS ✓
- Commit 50b5430 (Task 1) found in git log ✓
- Commit 8019e48 (Task 2) found in git log ✓

---
*Phase: 30-smoke-test-on-clean-vm-ga-gate*
*Plan: 03 — verify-deploy.sh authorship*
*Completed: 2026-04-29*
