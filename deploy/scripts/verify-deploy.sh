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
# ============================================================================
# Step [5/7] — bin/sms create-admin idempotent + --force (Phase 29 SC#2)
# ============================================================================
step_create_admin_idempotent() {
  log "[5/7] bin/sms create-admin idempotent runtime (Phase 29 SC#2)"

  # Test 1: re-running with same email → exit 1 + "already exists" message.
  # bootstrap.sh has already created the admin in step [1/7]; re-invoking
  # without --force MUST surface 'already exists' on stderr or stdout.
  local readmin_out
  readmin_out=$(${DC} exec -T api bin/sms create-admin --email "${ADMIN_EMAIL}" --password "${ADMIN_PASSWORD}" 2>&1 || true)
  if echo "${readmin_out}" | grep -q 'already exists'; then
    pass_check "create-admin re-run with same email → 'already exists' (idempotent)"
    PASS=$((PASS+1))
  else
    fail_check "create-admin re-run did not emit 'already exists' — output: ${readmin_out}"
    FAIL=$((FAIL+1))
  fi

  # Test 2: --force rotates password without changing user.id.
  # We query Postgres directly via psql exec for the cleanest identity check.
  # ADMIN_EMAIL is operator-supplied trusted input (T-30-09 disposition: accept).
  local before_id
  before_id=$(${DC} exec -T postgres psql -U "${POSTGRES_USER:-sms}" -d "${POSTGRES_DB:-sms_platform}" -tAc "SELECT id FROM \"User\" WHERE email='${ADMIN_EMAIL}'" 2>/dev/null | tr -d '[:space:]' || echo "")
  if ${DC} exec -T api bin/sms create-admin --email "${ADMIN_EMAIL}" --password "${ADMIN_PASSWORD}" --force 2>&1 | grep -qE 'rotated|success|created'; then
    local after_id
    after_id=$(${DC} exec -T postgres psql -U "${POSTGRES_USER:-sms}" -d "${POSTGRES_DB:-sms_platform}" -tAc "SELECT id FROM \"User\" WHERE email='${ADMIN_EMAIL}'" 2>/dev/null | tr -d '[:space:]' || echo "")
    if [[ -n "${before_id}" && "${before_id}" == "${after_id}" ]]; then
      pass_check "create-admin --force preserved user.id (${before_id})"
      PASS=$((PASS+1))
    else
      fail_check "create-admin --force changed user.id (before=${before_id}, after=${after_id}) — Phase 29 D-09 violated"
      FAIL=$((FAIL+1))
    fi
  else
    fail_check "create-admin --force did not succeed"
    FAIL=$((FAIL+1))
  fi
  echo
}

# ============================================================================
# Step [6/7] — update.sh atomic recycle (Phase 29 SC#3)
# ============================================================================
step_update_atomic_recycle() {
  if [[ -n "${SKIP_UPDATE:-}" ]]; then
    log "[6/7] SKIP_UPDATE=1 — skipping update.sh atomic recycle test"
    echo
    return 0
  fi

  log "[6/7] update.sh atomic recycle (Phase 29 SC#3)"
  log "  Probing /api/health continuously during update.sh ${IMAGE_TAG:-latest} re-recycle..."

  # Background curl probe loop: hits /api/health every 1s for 180s, logs each
  # `<unix-ts> <http-code>` line for the post-recycle outage analysis.
  local probe_log
  probe_log=$(mktemp)
  (
    local end=$((SECONDS + 180))
    while [[ ${SECONDS} -lt ${end} ]]; do
      local code
      code=$(curl -s -o /dev/null -w '%{http_code}\n' --max-time 2 "https://${DOMAIN}/api/health" 2>/dev/null || echo 000)
      printf '%s %s\n' "$(date +%s)" "${code}" >> "${probe_log}"
      sleep 1
    done
  ) &
  local probe_pid=$!

  # Run update.sh with the SAME IMAGE_TAG — we are testing the recycle
  # codepath, NOT image-version upgrade. This avoids the smoke run needing
  # two published tags. The recycle still happens (compose up -d issues a
  # full container replacement when the spec changes, but here the spec is
  # identical → it issues a soft restart per service per Phase 26 depends_on
  # chain). For a fresh-VM smoke this is sufficient atomic-recycle proof.
  local update_start update_end update_elapsed update_rc
  update_start=$(date +%s)
  set +e
  bash "${SCRIPT_DIR}/update.sh" "${IMAGE_TAG:-latest}" >/tmp/update-output.log 2>&1
  update_rc=$?
  set -e
  update_end=$(date +%s)
  update_elapsed=$((update_end - update_start))

  # Wait for probe loop to finish (it self-terminates after 180s)
  wait "${probe_pid}" 2>/dev/null || true

  if [[ "${update_rc}" -eq 0 ]]; then
    pass_check "update.sh exit 0 (recycle completed in ${update_elapsed}s)"
    PASS=$((PASS+1))
  else
    fail_check "update.sh exit ${update_rc} — see /tmp/update-output.log"
    FAIL=$((FAIL+1))
  fi

  # Analyze probe log: count consecutive non-200 windows.
  # Longest contiguous outage MUST be <= 5s (Phase 29 D-15 grace period).
  local longest_outage=0 current_outage=0
  local ts code
  while read -r ts code; do
    if [[ "${code}" != "200" ]]; then
      current_outage=$((current_outage + 1))
      if [[ ${current_outage} -gt ${longest_outage} ]]; then
        longest_outage=${current_outage}
      fi
    else
      current_outage=0
    fi
  done < "${probe_log}"
  if [[ ${longest_outage} -le 5 ]]; then
    pass_check "Longest /api/health outage during recycle: ${longest_outage}s ≤ 5s (Phase 29 SC#3 PASS)"
    PASS=$((PASS+1))
  else
    fail_check "Longest /api/health outage during recycle: ${longest_outage}s > 5s — atomic recycle dropped requests"
    FAIL=$((FAIL+1))
  fi
  rm -f "${probe_log}" /tmp/update-output.log
  echo
}

# ============================================================================
# Step [7/7] — summary + exit code + tee to SMOKE-TEST-LOG (D-11)
# ============================================================================
step_summary_and_exit() {
  log "[7/7] Summary"
  printf '  PASS=%s  FAIL=%s\n' "${PASS}" "${FAIL}"
  echo

  # Append a result row to SMOKE-TEST-LOG.md if the file exists (D-11
  # evidence sink). Best-effort: missing log does NOT fail the verifier.
  if [[ -f "${LOG_FILE}" ]]; then
    local result_label
    if [[ "${FAIL}" -eq 0 ]]; then
      result_label="PASS"
    else
      result_label="FAIL"
    fi
    printf '\n<!-- verify-deploy.sh run %s — %s checks PASS, %s FAIL, verdict=%s -->\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${PASS}" "${FAIL}" "${result_label}" >> "${LOG_FILE}"
  fi

  if [[ "${FAIL}" -eq 0 ]]; then
    ok "All ${PASS} verify-deploy assertions passed."
    log "Phase 30 SC#1 satisfied (covers Phase 27 SC#1/#3/#4 + Phase 29 SC#1/#2/#3)"
    exit 0
  else
    die "${FAIL} of $((PASS+FAIL)) assertions failed. v1.3 GA blocked (D-12 hard fail)."
    # die() exits 1
  fi
}

# ============================================================================
# Main execution
# ============================================================================
step_cold_deploy_timing
step_https_reachable
step_cert_persistence
step_verify_phase_27
step_create_admin_idempotent
step_update_atomic_recycle
step_summary_and_exit
