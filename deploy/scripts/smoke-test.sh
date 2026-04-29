#!/usr/bin/env bash
# ============================================================================
# deploy/scripts/smoke-test.sh — Phase 30 (DEPLOY-25 + DEPLOY-26)
#
# Sequential wrapper for the v1.3 GA smoke test. Invokes:
#   1. verify-deploy.sh    — pre-flight + bootstrap + HTTPS + cert + create-admin + update.sh
#   2. [MANUAL GATE]       — operator completes UI checklist D-14 steps 1-6
#   3. verify-playback.sh  — wss + HLS + MinIO .ts archive
#   4. verify-backup.sh    — backup → restore round-trip + cert preserve
#   5. [REMINDER]          — operator runs verify-nmap.sh from LAPTOP (separate machine)
#
# Aggregates child exit codes per D-19 (max(child_codes) → wrapper exit code):
#   0 = all pass                                  → GA APPROVED
#   1 = any verifier hard-failed (HARD GA block)  → RE-SMOKE REQUIRED
#   2 = drift only (soft — GA still possible)     → GA APPROVED WITH DRIFT (queue v1.3.1)
#
# Usage:
#   bash deploy/scripts/smoke-test.sh
#   SKIP_BACKUP=1       bash deploy/scripts/smoke-test.sh   # debug runs (skip destructive backup/restore)
#   SKIP_INTERACTIVE=1  bash deploy/scripts/smoke-test.sh   # CI / unattended (skips manual gate; verify-playback will fail without operator data — useful for syntax test only)
#
# Output:
#   - deploy/SMOKE-TEST-LOG.md: a new "## Run started <UTC>" section is APPENDED
#     (operator may invoke this wrapper multiple times; never overwrites).
#   - deploy/smoke-evidence/<UTC-stamp>/: empty dir created, operator drops
#     screenshots + raw logs there. Folder is .gitignore'd (T-30-05).
#
# Notes:
#   - verify-nmap.sh is NOT invoked here (it runs on the operator's LAPTOP, not this VM).
#     The wrapper PRINTS the exact command + reminds the operator to fold the laptop-side
#     exit code into the SMOKE-TEST-LOG SC#3 row manually.
#   - The aggregated MAX_RC therefore covers: verify-deploy + verify-playback + verify-backup.
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

# --- Path resolution -------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env"
LOG_FILE="${DEPLOY_DIR}/SMOKE-TEST-LOG.md"
EVIDENCE_DIR="${DEPLOY_DIR}/smoke-evidence/$(date -u +%Y-%m-%dT%H%MZ)"

# --- Color/log helpers (tput-aware, prefixed) ------------------------------
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  C_RESET="$(tput sgr0)"
  C_GREEN="$(tput setaf 2)"
  C_YELLOW="$(tput setaf 3)"
  C_RED="$(tput setaf 1)"
  C_BOLD="$(tput bold)"
else
  C_RESET=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BOLD=""
fi

log()  { printf '%s[smoke-test]%s %s\n' "${C_BOLD}" "${C_RESET}" "$*"; }
ok()   { printf '%s[smoke-test]%s %sOK%s    %s\n' "${C_BOLD}" "${C_RESET}" "${C_GREEN}" "${C_RESET}" "$*"; }
warn() { printf '%s[smoke-test]%s %sWARN%s  %s\n' "${C_BOLD}" "${C_RESET}" "${C_YELLOW}" "${C_RESET}" "$*"; }
die()  { printf '%s[smoke-test]%s %sDIE%s   %s\n' "${C_BOLD}" "${C_RESET}" "${C_RED}" "${C_RESET}" "$*" >&2; exit 1; }

# --- Pre-flight: tooling + required files + child verifier executables -----
command -v docker >/dev/null 2>&1 || { die "docker not on PATH"; }
[[ -f "${ENV_FILE}" ]] || die "${ENV_FILE} missing — run deploy/scripts/init-secrets.sh first"
[[ -f "${LOG_FILE}" ]] || die "${LOG_FILE} missing — Plan 01 not landed?"

# Verify all 4 child verifiers exist + executable BEFORE starting any step.
# Partial run with a missing verifier wastes operator time.
for v in verify-deploy.sh verify-playback.sh verify-backup.sh verify-nmap.sh; do
  [[ -x "${SCRIPT_DIR}/${v}" ]] || die "${SCRIPT_DIR}/${v} missing or not executable"
done

# Load env (DOMAIN, ADMIN_EMAIL, ACME_CA, IMAGE_TAG, etc.)
# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

# --- Initialize evidence folder + SMOKE-TEST-LOG run header ----------------
log "Phase 30 smoke test wrapper"
log "  Evidence folder: ${EVIDENCE_DIR}"
log "  Log file:        ${LOG_FILE}"
mkdir -p "${EVIDENCE_DIR}"

# Append a new run header to the log (operator may have multiple runs).
{
  echo
  echo "---"
  echo "## Run started $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "| Field | Value |"
  echo "|-------|-------|"
  echo "| Run UTC start | $(date -u +%Y-%m-%dT%H:%M:%SZ) |"
  echo "| VM hostname | $(hostname) |"
  echo "| OS | $(grep -oE 'Ubuntu [0-9.]+' /etc/os-release 2>/dev/null | head -1 || uname -a) |"
  echo "| Docker | $(docker --version) |"
  echo "| Compose plugin | $(docker compose version 2>&1 | head -1) |"
  echo "| Domain | ${DOMAIN:-<unset>} |"
  echo "| ACME_CA | ${ACME_CA:-https://acme-v02.api.letsencrypt.org/directory (production default)} |"
  echo "| IMAGE_TAG | ${IMAGE_TAG:-latest} |"
  echo "| Evidence dir | ${EVIDENCE_DIR} |"
  echo
} >> "${LOG_FILE}"

# --- Child exit-code tracker (max-RC aggregation per D-19) -----------------
# NOTE: bash 3.x (macOS default) does NOT allow `local` outside a function body.
# We extract the failure-handling into a top-level function `run_step` so the
# `if/else` set-e semantics stay clean and rc capture works portably.
MAX_RC=0

record_rc() {
  local rc="$1" verifier="$2"
  if [[ "${rc}" -gt "${MAX_RC}" ]]; then
    MAX_RC="${rc}"
  fi
  log "  ${verifier} → exit ${rc}"
}

# run_step <step-label> <verifier-name> <script-path>
# Invokes the verifier script keeping `set -e` semantics intact at the wrapper level.
run_step() {
  local step="$1" verifier="$2" script="$3"
  local rc=0
  log "[${step}] ${verifier}"
  if bash "${script}"; then
    ok "${verifier} passed"
    record_rc 0 "${verifier}"
  else
    rc=$?
    warn "${verifier} returned ${rc}"
    record_rc "${rc}" "${verifier}"
  fi
  echo
}

# --- Step [1/4] verify-deploy.sh ------------------------------------------
run_step "1/4" verify-deploy "${SCRIPT_DIR}/verify-deploy.sh"

# --- Manual gate — operator completes D-14 steps 1-6 ----------------------
if [[ -z "${SKIP_INTERACTIVE:-}" ]]; then
  log "===================================================================="
  log "MANUAL UI CHECKLIST GATE (D-14 steps 1-6)"
  log "===================================================================="
  log "Before continuing, complete these steps via the deployed app UI:"
  log "  1. Login as ${ADMIN_EMAIL:-<ADMIN_EMAIL unset>} at https://${DOMAIN:-<DOMAIN unset>}"
  log "  2. Register a test camera with your RTSP URL (D-07)"
  log "  3. Click camera card → play HLS in browser (10s observation)"
  log "  4. Toggle Record → wait 60s wall-clock → toggle off"
  log "  5. Open DevTools Network tab → filter socket.io → trigger camera"
  log "     status change → screenshot the camera.status_changed frame"
  log "     into ${EVIDENCE_DIR}/ws-frame.png"
  log "  6. Stop external RTSP feed → confirm UI shows offline within 30s"
  log ""
  log "When ALL 6 steps are complete, press ENTER to continue with"
  log "verify-playback.sh + verify-backup.sh."
  log "  (Ctrl-C to abort if a step failed — re-run smoke-test.sh after fix.)"
  read -r _
  log "Continuing..."
else
  warn "SKIP_INTERACTIVE=1 — manual gate skipped. verify-playback will likely FAIL."
fi
echo

# --- Step [2/4] verify-playback.sh ----------------------------------------
run_step "2/4" verify-playback "${SCRIPT_DIR}/verify-playback.sh"

# --- Step [3/4] verify-backup.sh (skippable for debug) --------------------
if [[ -z "${SKIP_BACKUP:-}" ]]; then
  log "[3/4] verify-backup.sh (DESTRUCTIVE — round-trips volumes)"
  # Use the same run_step helper so MAX_RC aggregation stays consistent.
  run_step "3/4" verify-backup "${SCRIPT_DIR}/verify-backup.sh"
else
  warn "[3/4] SKIP_BACKUP=1 — skipping backup/restore round-trip"
  echo
fi

# --- Step [4/4] verify-nmap.sh — RUN FROM LAPTOP, not this VM -------------
log "[4/4] verify-nmap.sh — RUN FROM YOUR LOCAL MACHINE (LAPTOP, NOT THIS VM)"
log "===================================================================="
LAPTOP_IP_HINT="$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || echo '<vm-public-ip>')"
log "On your laptop:"
log "  export VM_IP=${LAPTOP_IP_HINT}"
log "  cd <repo>"
log "  bash deploy/scripts/verify-nmap.sh"
log "Append the output to ${LOG_FILE} SC#3 row when complete."
log "===================================================================="
warn "verify-nmap exit code is NOT aggregated by this wrapper (it runs on a different machine)."
warn "Operator must paste verify-nmap exit code into the SMOKE-TEST-LOG SC#3 row manually."
echo

# --- Roll-up summary + verdict --------------------------------------------
log "===================================================================="
log "Smoke test wrapper summary"
log "===================================================================="
log "  Aggregated max child exit code: ${MAX_RC}"

{
  echo
  echo "## Run summary"
  echo
  echo "| Verifier | Exit code | SC owners |"
  echo "|----------|-----------|-----------|"
  echo "| verify-deploy.sh | _(see [1/4] above)_ | SC#1 + Phase 27 SC#1/#3/#4 + Phase 29 SC#1/#2/#3 |"
  echo "| verify-playback.sh | _(see [2/4] above)_ | SC#2 + Phase 27 SC#2 + Phase 29 SC#5 |"
  echo "| verify-backup.sh | _(see [3/4] above)_ | SC#4 backup + Phase 29 SC#4 |"
  echo "| verify-nmap.sh | _(operator-supplied from laptop)_ | SC#3 + DEPLOY-26 |"
  echo
  echo "**Wrapper aggregated exit:** ${MAX_RC}"
  echo
  echo "**Verdict guidance (D-12):**"
  echo "  - exit 0 → GA APPROVED"
  echo "  - exit 1 → RE-SMOKE REQUIRED (HARD fail)"
  echo "  - exit 2 → GA APPROVED WITH DRIFT (queue v1.3.1)"
} >> "${LOG_FILE}"

case "${MAX_RC}" in
  0)
    ok "All verifiers passed. GA APPROVED."
    log "Don't forget: run verify-nmap.sh from laptop to close SC#3."
    exit 0
    ;;
  1)
    die "At least one verifier HARD-failed. RE-SMOKE REQUIRED after fix lands."
    ;;
  2)
    warn "Drift detected (soft). GA approvable per D-12 SC#4 mapping. Queue v1.3.1 patch via .planning/todos/v1.3.1-drift-from-phase-30.md"
    exit 2
    ;;
  *)
    die "Unexpected aggregated exit code ${MAX_RC}"
    ;;
esac
