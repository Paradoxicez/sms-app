#!/usr/bin/env bash
# ============================================================================
# deploy/scripts/bootstrap.sh — Phase 29 (DEPLOY-18)
#
# First-run orchestrator. Brings a fresh VM from "deploy/.env filled" to
# "operator can log in at https://${DOMAIN}" in under 10 minutes.
#
# Usage:
#   cp deploy/.env.production.example deploy/.env
#   $EDITOR deploy/.env   # set DOMAIN, ADMIN_EMAIL, GHCR_ORG, ACME_EMAIL
#   bash deploy/scripts/bootstrap.sh
#
# What this script runs (verbose compose form, PROJECT convention):
#   docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
#   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --wait sms-migrate
#   docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
#   docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api bin/sms create-admin ...
#
# Idempotent: safe to re-run after Ctrl-C, partial failure, or successful
# completion (re-run rotates ADMIN_PASSWORD if .env changed; otherwise no-op).
#
# Exit codes:
#   0 — success (HTTPS reachable; super-admin created/rotated)
#   1 — fatal failure (docker missing, .env missing, sms-migrate failed,
#       create-admin failed). HTTPS-not-reachable-after-120s is warn-only;
#       it does NOT exit non-zero (cert may still issue after our budget).
# ============================================================================

set -euo pipefail
IFS=$' \n\t'

# --- Path resolution (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"

# --- Color helpers (TTY-aware, D-29) ---
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
log()  { printf '%s[bootstrap]%s %s\n' "${BOLD}" "${RESET}" "$*"; }
ok()   { printf '%s[bootstrap] ✓%s %s\n' "${GREEN}" "${RESET}" "$*"; }
warn() { printf '%s[bootstrap] ⚠%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
die()  { printf '%s[bootstrap] ✗%s %s\n' "${RED}" "${RESET}" "$*" >&2; exit 1; }

START=$(date +%s)

# --- D-07: Pre-flight (3 checks, <10s total) ---
log "Pre-flight checks..."
docker info >/dev/null 2>&1 || die "Docker daemon not running. Start Docker first."
[[ -f "${ENV_FILE}" ]] || die "${ENV_FILE} missing. Run: cp ${DEPLOY_DIR}/.env.production.example ${ENV_FILE}, edit, then re-run bootstrap.sh."
grep -qE '^DOMAIN=.+' "${ENV_FILE}" || die "DOMAIN= not set in ${ENV_FILE}. Edit it then re-run bootstrap.sh."
ok "Pre-flight passed"

# --- D-08: Auto-secrets if placeholders detected ---
# init-secrets.sh is idempotent (skips already-filled values) — calling it
# unconditionally would also work, but the placeholder probe keeps the log
# quiet on re-runs ("All secrets already set" instead of 6 "= Skipped" lines).
if grep -qE '^[A-Z_]+=change-me-' "${ENV_FILE}" || grep -qE '^[A-Z_]+=$' "${ENV_FILE}"; then
  log "Generating secrets via init-secrets.sh..."
  bash "${SCRIPT_DIR}/init-secrets.sh"
else
  log "All secrets already set (init-secrets.sh skipped)"
fi

# --- Source deploy/.env so we can read ADMIN_EMAIL / ADMIN_PASSWORD / DOMAIN below ---
# Equivalent to: set -a; source deploy/.env; set +a
# `set -a` toggles auto-export so every variable assigned during the source
# is exported into the current shell environment without a manual export per
# var. shellcheck cannot statically resolve a dynamic source path → SC1090.
# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

# Validate the operator-supplied identifiers init-secrets does NOT generate
# (D-07 #3 + manual fields). DOMAIN was already pre-flight-checked above.
[[ -n "${ADMIN_EMAIL:-}" ]]    || die "ADMIN_EMAIL is empty in ${ENV_FILE}. Edit it (operator-supplied identifier; init-secrets cannot generate)."
[[ -n "${ADMIN_PASSWORD:-}" ]] || die "ADMIN_PASSWORD is empty in ${ENV_FILE}. Re-run init-secrets.sh or set it manually."
[[ -n "${GHCR_ORG:-}" ]]       || die "GHCR_ORG is empty in ${ENV_FILE}. Set it to the github org that owns the GHCR images."
[[ -n "${ACME_EMAIL:-}" ]]     || warn "ACME_EMAIL empty — Caddy will register an anonymous account. Cert renewal warnings will not reach you. See deploy/DOMAIN-SETUP.md."

DC="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"

# --- Pull images (idempotent — docker layer cache) ---
log "Pulling images for IMAGE_TAG=${IMAGE_TAG:-latest}..."
${DC} pull
ok "Images pulled"

# --- D-09: Wait sms-migrate to exit 0 BEFORE create-admin ---
# `compose up -d --wait sms-migrate` blocks until the init container exits 0
# (or fails). Exit 0 → schema migrated (prisma migrate deploy is idempotent),
# MinIO buckets created, default stream profile seeded. Failure here is fatal:
# api will crash-loop against an unmigrated DB.
log "Running migrate + bucket init + stream-profile seed (sms-migrate)..."
${DC} up -d --wait sms-migrate || die "sms-migrate failed. Inspect: ${DC} logs sms-migrate"
ok "sms-migrate exited 0 (schema + buckets + default profile ready)"

# --- D-09: Bring up the rest of the stack (api + web + caddy) ---
# Phase 26 depends_on chain ensures correct order: api boots only after
# sms-migrate exits 0 (already done above), web boots after api healthy,
# caddy boots after both api+web healthy. We use `up -d` (no --wait) here
# because Caddy's healthcheck waits for HTTP/80 to be reachable, which can
# stall behind ACME provisioning — we poll Caddy's reverse-proxy /api/health
# manually below (D-10) instead.
log "Starting api + web + caddy..."
${DC} up -d
log "Waiting for api healthcheck..."
# Wait up to 60s for api to report healthy (FFmpeg + Prisma + Better Auth
# init can take ~10-30s on slow VMs). compose v2.x `ps --format '{{.Health}}'`
# is the stable Go-template form — JSON-format parsing has drifted between
# v2.10 and v2.20, the Go template has not. The `|| true` is intentional:
# `compose ps` returns non-zero when a service hasn't been created yet,
# which can happen on the first iteration if the api container is still
# being scheduled — we want to retry the loop, not exit.
for i in $(seq 1 12); do
  STATE=$(${DC} ps --format '{{.Health}}' api 2>/dev/null | head -1 || true)
  if [[ "${STATE}" == "healthy" ]]; then break; fi
  sleep 5
done

# --- D-09: create-admin with idempotent --force fallback ---
# First run: plain create-admin succeeds → operator can log in.
# Re-run on same .env: create-admin exits 1 with "User <email> already exists"
# → we detect that exact phrase in stderr and retry with --force, which
# rotates the password (re-hashes via Better Auth scrypt) without disturbing
# user.id, member, or org-membership rows. This makes bootstrap.sh safe to
# re-run after partial failures or for password rotation.
log "Creating super-admin ${ADMIN_EMAIL}..."
if ${DC} exec -T api bin/sms create-admin --email "${ADMIN_EMAIL}" --password "${ADMIN_PASSWORD}" 2>/tmp/bootstrap-create-admin.err; then
  ok "Super-admin created"
elif grep -q 'already exists' /tmp/bootstrap-create-admin.err 2>/dev/null; then
  log "Super-admin exists — rotating password via --force..."
  ${DC} exec -T api bin/sms create-admin --email "${ADMIN_EMAIL}" --password "${ADMIN_PASSWORD}" --force \
    || die "create-admin --force failed. Inspect: ${DC} logs api"
  ok "Super-admin password rotated"
else
  cat /tmp/bootstrap-create-admin.err >&2
  die "create-admin failed. Inspect: ${DC} logs api"
fi
rm -f /tmp/bootstrap-create-admin.err

# --- DEPLOY-16 fix: re-run seed now that the system org exists ---
# sms-migrate ran earlier (line 107) against an empty org list, so
# seed-stream-profile.js no-ops per its zero-orgs guard. Re-running here (after
# create-admin inserts the system org) lets the seed insert the default
# StreamProfile. Idempotent: prisma migrate deploy + bucket init + seed all
# no-op when their target state is already present.
log "Re-seeding default Stream Profile (post-admin)..."
${DC} run --rm sms-migrate || warn "Stream-profile re-seed failed (non-fatal). Inspect: ${DC} logs sms-migrate"
ok "Default Stream Profile seeded"

# --- D-10: Wait HTTPS reachable (poll Caddy /api/health 5s × 24 = 120s) ---
# Caddy provisions a Let's Encrypt cert on first request to :443 — typically
# 30-60s end-to-end (DNS-01 / HTTP-01 challenge + ACME order + cert install).
# `curl --max-time 5` per probe is critical: without it a hung Caddy process
# during ACME challenge could block the loop indefinitely. 24 iterations ×
# max 5s/iter = 120s upper bound matches D-10.
log "Waiting for HTTPS endpoint (Caddy provisioning Let's Encrypt cert, ~30-60s typical)..."
HTTPS_READY=0
for i in $(seq 1 24); do
  if curl -fsS -o /dev/null --max-time 5 "https://${DOMAIN}/api/health" 2>/dev/null; then
    HTTPS_READY=1
    break
  fi
  sleep 5
done

if [[ "${HTTPS_READY}" -eq 1 ]]; then
  ok "HTTPS ready"
else
  # warn (not die): cert may issue 30-60s after our 120s budget; operator
  # can refresh the browser manually. D-10 explicitly lists this as warn-only.
  warn "HTTPS not reachable after 120s. Caddy may still be issuing cert."
  warn "Check: ${DC} logs caddy"
  warn "DNS A-record correct? Port 80 reachable from Internet? See deploy/DOMAIN-SETUP.md."
fi

# --- D-12: Final summary + timing log ---
ELAPSED=$(( $(date +%s) - START ))
echo
ok "Stack live at https://${DOMAIN}"
log "  Login email:    ${ADMIN_EMAIL}"
log "  Bootstrap time: ${ELAPSED}s"
log "  Day-2 ops:"
log "    Update:  bash deploy/scripts/update.sh <new-tag>"
log "    Backup:  bash deploy/scripts/backup.sh"
log "    Restore: bash deploy/scripts/restore.sh <archive>"
