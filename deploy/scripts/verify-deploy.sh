#!/usr/bin/env bash
# ============================================================================
# deploy/scripts/verify-deploy.sh — Phase 30 (DEPLOY-25, partial coverage)
#
# Phase 30 SC#1 verifier: runs ON the smoke VM and asserts the cold-deploy
# contract end-to-end. Folds in ALL deferred UAT for SC#1 owner per CONTEXT.md
# D-13 mapping table:
#   - Phase 27 SC#1 (LE cert + 308 redirect)
#   - Phase 27 SC#3 (cert persist across down/up)
#   - Phase 27 SC#4 (verify-phase-27.sh re-run on healthy host)
#   - Phase 29 SC#1 (cold deploy <10-min wall-clock)
#   - Phase 29 SC#2 (bin/sms create-admin runtime + --force rotation)
#   - Phase 29 SC#3 (update.sh atomic recycle without dropping in-flight requests)
#
# Usage:
#   bash deploy/scripts/verify-deploy.sh                         # run all checks
#   SKIP_BOOTSTRAP=1 bash deploy/scripts/verify-deploy.sh        # skip cold-deploy step (stack already up)
#   SKIP_UPDATE=1 bash deploy/scripts/verify-deploy.sh           # skip update.sh atomic recycle test
#
# Prerequisites:
#   - deploy/.env exists with DOMAIN, ADMIN_EMAIL, ADMIN_PASSWORD, GHCR_ORG, IMAGE_TAG filled
#   - DNS A-record for ${DOMAIN} → this VM's public IP
#   - Port 80 + 443 reachable from Internet (ACME HTTP-01)
#
# Exit codes:
#   0 — all assertions pass
#   1 — at least one HARD assertion failed (HARD GA block per D-12)
#   2 — missing prerequisites (.env, docker daemon, required env vars)
# ============================================================================
set -euo pipefail
IFS=$'\n\t'

# --- Path resolution (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
LOG_FILE="${DEPLOY_DIR}/SMOKE-TEST-LOG.md"     # tee target — appended-to (D-11 evidence sink)

# --- TTY-aware color helpers (copied from bootstrap.sh D-29) ---
if [[ -t 1 ]] && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  GREEN=$'\033[32m'
  RED=$'\033[31m'
  YELLOW=$'\033[33m'
  BOLD=$'\033[1m'
  RESET=$'\033[0m'
else
  GREEN=''
  RED=''
  YELLOW=''
  BOLD=''
  RESET=''
fi
log()  { printf '%s[verify-deploy]%s %s\n' "${BOLD}" "${RESET}" "$*"; }
ok()   { printf '%s[verify-deploy] ✓%s %s\n' "${GREEN}" "${RESET}" "$*"; }
warn() { printf '%s[verify-deploy] ⚠%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
die()  { printf '%s[verify-deploy] ✗%s %s\n' "${RED}" "${RESET}" "$*" >&2; exit 1; }

pass_check() { printf '%s[verify-deploy]   PASS%s %s\n' "${GREEN}" "${RESET}" "$*"; }
fail_check() { printf '%s[verify-deploy]   FAIL%s %s\n' "${RED}" "${RESET}" "$*" >&2; }

# --- Pre-flight (exit 2 on any missing prerequisite) ---
command -v docker >/dev/null 2>&1 || { printf '[verify-deploy] ✗ docker not on PATH\n' >&2; exit 2; }
docker info >/dev/null 2>&1 || { printf '[verify-deploy] ✗ Docker daemon not running\n' >&2; exit 2; }
docker compose version >/dev/null 2>&1 || { printf '[verify-deploy] ✗ docker compose v2 not available\n' >&2; exit 2; }
command -v curl >/dev/null 2>&1 || { printf '[verify-deploy] ✗ curl not on PATH\n' >&2; exit 2; }
[[ -f "${ENV_FILE}" ]] || { printf '[verify-deploy] ✗ %s missing — run bootstrap.sh first or copy .env.production.example\n' "${ENV_FILE}" >&2; exit 2; }

# Source the env file so subsequent steps can read DOMAIN, ADMIN_EMAIL, etc.
# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a
[[ -n "${DOMAIN:-}" ]]         || { printf '[verify-deploy] ✗ DOMAIN not set in %s\n' "${ENV_FILE}" >&2; exit 2; }
[[ -n "${ADMIN_EMAIL:-}" ]]    || { printf '[verify-deploy] ✗ ADMIN_EMAIL not set in %s\n' "${ENV_FILE}" >&2; exit 2; }
[[ -n "${ADMIN_PASSWORD:-}" ]] || { printf '[verify-deploy] ✗ ADMIN_PASSWORD not set in %s\n' "${ENV_FILE}" >&2; exit 2; }
[[ -n "${GHCR_ORG:-}" ]]       || { printf '[verify-deploy] ✗ GHCR_ORG not set in %s\n' "${ENV_FILE}" >&2; exit 2; }

# --- Counters + DC alias ---
PASS=0
FAIL=0
DC="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"

# ============================================================================
# Step [1/7] — cold deploy timing assertion (Phase 29 SC#1, ROADMAP SC#1)
# ============================================================================
step_cold_deploy_timing() {
  if [[ -n "${SKIP_BOOTSTRAP:-}" ]]; then
    log "[1/7] SKIP_BOOTSTRAP=1 — skipping cold-deploy timing (stack assumed running)"
    echo
    return 0
  fi

  log "[1/7] Cold deploy timing (Phase 29 SC#1, ROADMAP SC#1)"
  log "  Tearing down existing stack to force cold deploy (preserves volumes)..."
  # `down` without -v: keeps volumes (caddy_data, postgres_data, etc.) — critical
  # for the cert persistence test in step [3/7]. T-30-04 mitigation.
  ${DC} down 2>/dev/null || true

  local bootstrap_log
  bootstrap_log=$(mktemp)
  log "  Running bootstrap.sh (output → ${bootstrap_log})..."
  local boot_start
  boot_start=$(date +%s)
  if bash "${SCRIPT_DIR}/bootstrap.sh" 2>&1 | tee "${bootstrap_log}"; then
    :
  else
    fail_check "bootstrap.sh exited non-zero — see ${bootstrap_log}"
    FAIL=$((FAIL+1))
  fi
  local boot_end
  boot_end=$(date +%s)
  local wall_clock=$((boot_end - boot_start))

  # Parse the ELAPSED line from bootstrap.sh stdout.
  # bootstrap.sh line 185 emits: "[bootstrap] Bootstrap time: ${ELAPSED}s"
  # The bracketed prefix [bootstrap] precedes the literal "Bootstrap time: <N>s".
  local elapsed
  elapsed=$(grep -oE 'Bootstrap time: +[0-9]+s' "${bootstrap_log}" | grep -oE '[0-9]+' | tail -1 || echo 0)

  if [[ "${elapsed}" -eq 0 ]]; then
    fail_check "bootstrap.sh did not emit a 'Bootstrap time:' line — Phase 29 D-12 violated"
    FAIL=$((FAIL+1))
  elif [[ "${elapsed}" -le 600 ]]; then
    pass_check "bootstrap.sh ELAPSED=${elapsed}s ≤ 600s (Phase 29 SC#1 + ROADMAP SC#1 PASS)"
    PASS=$((PASS+1))
  else
    fail_check "bootstrap.sh ELAPSED=${elapsed}s > 600s — HARD GA BLOCK"
    FAIL=$((FAIL+1))
  fi
  log "  Wall-clock duration (script-measured): ${wall_clock}s"
  rm -f "${bootstrap_log}"
  echo
}

# ============================================================================
# Step [2/7] — HTTPS reachability + 308 redirect (Phase 27 SC#1)
# ============================================================================
step_https_reachable() {
  log "[2/7] HTTPS reachability + HTTP→HTTPS redirect (Phase 27 SC#1)"
  if curl -fsS -o /dev/null --max-time 10 "https://${DOMAIN}/api/health"; then
    pass_check "https://${DOMAIN}/api/health → 200"
    PASS=$((PASS+1))
  else
    fail_check "https://${DOMAIN}/api/health unreachable — Caddy/LE issue?"
    FAIL=$((FAIL+1))
  fi

  # 308 redirect is Caddy's default for HTTP→HTTPS; some configurations emit 301.
  local redirect_status
  redirect_status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://${DOMAIN}/" || echo 000)
  if [[ "${redirect_status}" == "308" || "${redirect_status}" == "301" ]]; then
    pass_check "http://${DOMAIN}/ → ${redirect_status} (HTTPS redirect)"
    PASS=$((PASS+1))
  else
    fail_check "http://${DOMAIN}/ expected 308/301, got ${redirect_status}"
    FAIL=$((FAIL+1))
  fi
  echo
}

# ============================================================================
# Step [3/7] — cert persistence across docker compose down/up (Phase 27 SC#3)
# ============================================================================
step_cert_persistence() {
  log "[3/7] Cert persistence across docker compose down/up (Phase 27 SC#3)"
  log "  ${DC} down (preserves caddy_data volume)..."
  # CRITICAL: NO -v flag here. -v would wipe caddy_data and force ACME re-issue,
  # creating a false-pass on the persistence assertion. T-30-04 mitigation.
  ${DC} down 2>/dev/null || warn "down returned non-zero (continuing)"
  log "  ${DC} up -d (second cold boot — should reuse existing cert)..."
  ${DC} up -d
  log "  Waiting 30s for caddy to log ACME state..."
  sleep 30

  # Count `certificate obtained` lines emitted SINCE this restart.
  # Use --since=2m to scope to the post-restart window (down + sleep + headroom).
  local cert_obtained_count
  cert_obtained_count=$(${DC} logs --since=2m caddy 2>&1 | grep -cE 'certificate obtained' || true)
  if [[ "${cert_obtained_count}" -eq 0 ]]; then
    pass_check "No 'certificate obtained' in caddy logs since 2nd boot — cert reused (Phase 27 SC#3 PASS)"
    PASS=$((PASS+1))
  else
    fail_check "${cert_obtained_count} 'certificate obtained' lines on 2nd boot — cert NOT persisted, ACME re-issued"
    FAIL=$((FAIL+1))
  fi

  # Wait HTTPS is back up before continuing (subsequent steps need it)
  local i
  for i in $(seq 1 24); do
    if curl -fsS -o /dev/null --max-time 5 "https://${DOMAIN}/api/health" 2>/dev/null; then
      break
    fi
    sleep 5
  done
  echo
}

# ============================================================================
# Step [4/7] — re-run verify-phase-27.sh on healthy host (Phase 27 SC#4)
# ============================================================================
step_verify_phase_27() {
  log "[4/7] Re-run verify-phase-27.sh on healthy host (Phase 27 SC#4)"
  if bash "${SCRIPT_DIR}/verify-phase-27.sh"; then
    pass_check "verify-phase-27.sh exit 0"
    PASS=$((PASS+1))
  else
    fail_check "verify-phase-27.sh exit non-zero — Phase 27 static checks regressed"
    FAIL=$((FAIL+1))
  fi
  echo
}

# ============================================================================
# Main execution
# ============================================================================
step_cold_deploy_timing
step_https_reachable
step_cert_persistence
step_verify_phase_27

# Steps [5/7], [6/7], [7/7] layered on by Task 2 of Plan 30-03.
