#!/usr/bin/env bash
# ============================================================================
# deploy/scripts/verify-phase-27.sh — Phase 27 (DEPLOY-24)
#
# Static validator for the Phase 27 deploy artifacts. Bundles D-24 checkpoints
# #1 (compose config) + #2 (Caddyfile validate) + file-content grep guards.
# Does NOT run the lab-only checkpoints (#3 cert obtained, #4 308 redirect,
# #5 WSS 101 upgrade, #6 persist-restart) — those require public DNS + port
# 80 reachability and live in deploy/DOMAIN-SETUP.md as operator workflow.
#
# Usage:
#   bash deploy/scripts/verify-phase-27.sh
#
# Exit codes:
#   0  = all static checks pass
#   1  = at least one check failed (output names which)
#   2  = required tooling missing (docker, etc.)
# ============================================================================
set -euo pipefail

# Resolve repo-root-relative paths so the script works from any CWD.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
CADDYFILE="${DEPLOY_DIR}/Caddyfile"
ENV_EXAMPLE="${DEPLOY_DIR}/.env.production.example"
DOMAIN_SETUP="${DEPLOY_DIR}/DOMAIN-SETUP.md"

PASS=0
FAIL=0

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

check() {
    local name="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        green "  PASS  ${name}"
        PASS=$((PASS + 1))
    else
        red   "  FAIL  ${name}"
        FAIL=$((FAIL + 1))
    fi
}

# --- Tooling preflight ---
command -v docker >/dev/null 2>&1 || { red "ERROR: docker not on PATH"; exit 2; }

echo "Phase 27 static verification — running from ${DEPLOY_DIR}"
echo

# --- D-24 #1: compose config syntax + env interpolation ---
echo "[1/4] docker compose config --quiet"
check "compose validates against .env.production.example" \
    docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_EXAMPLE}" config --quiet
echo

# --- D-24 #2: Caddyfile syntax via dockerized caddy validate ---
echo "[2/4] caddy validate (via caddy:2.11 docker image)"
check "Caddyfile parses cleanly" \
    docker run --rm \
        -v "${CADDYFILE}:/etc/caddy/Caddyfile:ro" \
        caddy:2.11 \
        caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
echo

# --- Structural grep guards (cross-plan integrity) ---
echo "[3/4] Caddyfile structural greps (plan 27-01)"
# NOTE: `acme_ca` lives inside the global options { ... } block and is
# tab-indented per Caddyfile convention — the leading-anchor form `^acme_ca`
# from the plan template would never match a structurally-correct Caddyfile.
# Plan 27-01 SUMMARY documented this drift; we relax the anchor here to allow
# leading whitespace, matching the precedent set by `^[[:space:]]*admin off`
# and `^[[:space:]]*protocols h1 h2` later in this same script.
check "Caddyfile has acme_ca with prod default"           grep -qE '^[[:space:]]*acme_ca \{\$ACME_CA:https://acme-v02\.api\.letsencrypt\.org/directory\}' "${CADDYFILE}"
check "Caddyfile has admin off"                            grep -qE '^[[:space:]]*admin off' "${CADDYFILE}"
check "Caddyfile has protocols h1 h2"                      grep -qE '^[[:space:]]*protocols h1 h2' "${CADDYFILE}"
check "Caddyfile has @api defensive matcher (D-27)"        grep -qE '@api path /api /api/\*' "${CADDYFILE}"
check "Caddyfile has /socket.io/* handle"                  grep -qE 'handle /socket\.io/\*' "${CADDYFILE}"
check "Caddyfile has /avatars/* handle"                    grep -qE 'handle /avatars/\*' "${CADDYFILE}"
check "Caddyfile has /snapshots/* handle"                  grep -qE 'handle /snapshots/\*' "${CADDYFILE}"
check "Caddyfile has reverse_proxy minio:9000 (x2)"        bash -c "[ \"\$(grep -cE 'reverse_proxy minio:9000' '${CADDYFILE}')\" = '2' ]"
check "Caddyfile has reverse_proxy api:3003 (x2)"          bash -c "[ \"\$(grep -cE 'reverse_proxy api:3003' '${CADDYFILE}')\" = '2' ]"
check "Caddyfile has reverse_proxy web:3000 (catch-all)"   grep -qE 'reverse_proxy web:3000' "${CADDYFILE}"
check "Caddyfile has NO route directive (anti-pattern)"    bash -c "! grep -qE '^[[:space:]]+route' '${CADDYFILE}'"
check "Caddyfile has NO header_up (anti-pattern)"          bash -c "! grep -q 'header_up' '${CADDYFILE}'"
echo

echo "[4/4] Compose + env-example structural greps (plans 27-02 + 27-04)"
check "compose declares caddy service"                     grep -qE '^  caddy:$' "${COMPOSE_FILE}"
check "compose pins caddy:2.11 image"                      grep -qE '^[[:space:]]+image: caddy:2\.11$' "${COMPOSE_FILE}"
check "compose mounts ./Caddyfile:ro"                      grep -qE '\./Caddyfile:/etc/caddy/Caddyfile:ro' "${COMPOSE_FILE}"
check "compose declares caddy_config volume"               grep -qE '^  caddy_config:$' "${COMPOSE_FILE}"
check "compose preserves caddy_data volume"                grep -qE '^  caddy_data:$' "${COMPOSE_FILE}"
check "compose api service exports MINIO_PUBLIC_URL"       grep -qE 'MINIO_PUBLIC_URL: \$\{MINIO_PUBLIC_URL:-\}' "${COMPOSE_FILE}"
check "compose has NO 443:443/udp (HTTP/3 disabled)"       bash -c "! grep -q '443:443/udp' '${COMPOSE_FILE}'"
check ".env.production.example has ACME_EMAIL"             grep -qE '^ACME_EMAIL=$' "${ENV_EXAMPLE}"
check ".env.production.example has ACME_CA"                grep -qE '^ACME_CA=$' "${ENV_EXAMPLE}"
check ".env.production.example has MINIO_PUBLIC_URL"       grep -qE '^MINIO_PUBLIC_URL=$' "${ENV_EXAMPLE}"
check "DOMAIN-SETUP.md exists at deploy/ root"             test -f "${DOMAIN_SETUP}"
check "DOMAIN-SETUP.md has 5+ H2 sections"                 bash -c "[ \"\$(grep -c '^## ' '${DOMAIN_SETUP}')\" -ge 5 ]"
check "DOMAIN-SETUP.md mentions Cloudflare orange-cloud (D-28)" bash -c "grep -qi 'orange.\\?cloud' '${DOMAIN_SETUP}'"
echo

echo "------------------------------------------------------------"
if [ "${FAIL}" -eq 0 ]; then
    green "All ${PASS} static checks passed."
    yellow "Lab-only D-24 checkpoints (#3 cert obtained / #4 308 redirect / #5 WSS 101 / #6 persist-restart) require public DNS — see deploy/DOMAIN-SETUP.md."
    exit 0
else
    red "${FAIL} of $((PASS + FAIL)) checks failed."
    exit 1
fi
