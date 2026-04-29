#!/usr/bin/env bash
# ============================================================================
# deploy/scripts/verify-nmap.sh — Phase 30 (DEPLOY-26)
#
# External port-lockdown verifier. Runs from operator's LOCAL machine (laptop),
# NOT from the VM. TCP-scans the 10 ports we care about + UDP-scans 2 WebRTC/SRT
# ports against ${VM_IP}, asserts open/closed contract per ROADMAP §Phase 30 SC#3.
#
# Allowed open: TCP 22/80/443/1935/8080 + UDP 8000/10080
# Must be closed externally: TCP 5432/6379/9000/9001/1985 (internal-only services)
#
# Usage:
#   VM_IP=203.0.113.42 bash deploy/scripts/verify-nmap.sh
#
# Prerequisites:
#   - nmap installed locally (macOS: brew install nmap; Linux: apt install nmap)
#   - VM_IP env var set to the smoke VM's public IPv4 address
#   - VM bootstrap.sh has completed (Caddy listening on :443, SRS on :1935/:8080)
#
# Exit codes:
#   0 — all assertions pass (allowed ports OPEN, blocked ports CLOSED/FILTERED)
#   1 — at least one port has the wrong state (HARD GA block per D-12)
#   2 — missing nmap, missing VM_IP env, or invalid VM_IP format
# ============================================================================

set -euo pipefail
IFS=$' \n\t'

# --- Path resolution (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Color helpers (TTY-aware, D-29 inherited from bootstrap.sh) ---
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
log()         { printf '%s[verify-nmap]%s %s\n' "${BOLD}" "${RESET}" "$*"; }
ok()          { printf '%s[verify-nmap] ✓%s %s\n' "${GREEN}" "${RESET}" "$*"; }
warn()        { printf '%s[verify-nmap] ⚠%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
die()         { printf '%s[verify-nmap] ✗%s %s\n' "${RED}" "${RESET}" "$*" >&2; exit 1; }
pass_check()  { printf '  %s✓ PASS%s  %s\n' "${GREEN}" "${RESET}" "$*"; }
fail_check()  { printf '  %s✗ FAIL%s  %s\n' "${RED}" "${RESET}" "$*"; }

# --- Pre-flight (exit 2 on missing tooling/env) ---
if ! command -v nmap >/dev/null 2>&1; then
  printf '%s[verify-nmap] ✗%s nmap not on PATH. Install: macOS=brew install nmap; Linux=apt install nmap\n' "${RED}" "${RESET}" >&2
  exit 2
fi
if [[ -z "${VM_IP:-}" ]]; then
  printf '%s[verify-nmap] ✗%s VM_IP env var not set. Usage: VM_IP=<vm-public-ip> bash %s\n' "${RED}" "${RESET}" "$0" >&2
  exit 2
fi
# IPv4 dotted-quad validation (avoids passing garbage to nmap)
if ! [[ "${VM_IP}" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
  printf '%s[verify-nmap] ✗%s VM_IP must be IPv4 dotted-quad (got: %s)\n' "${RED}" "${RESET}" "${VM_IP}" >&2
  exit 2
fi

# --- Print scan plan + warnings (T-30-02 + T-30-06 documented) ---
log "External port lockdown verification"
log "  Target: ${VM_IP}"
log "  Scan plan:"
log "    TCP allowed-open: 22,80,443,1935,8080"
log "    TCP must-be-closed: 5432,6379,9000,9001,1985"
log "    UDP allowed-open: 8000,10080"
warn "Cloud-provider IDS (Hetzner/DO) may flag this scan. Whitelist your source IP if rate-limited."
warn "UDP scan can take up to 60s — --reason flag enabled to distinguish open|filtered (T-30-06)."
echo

# --- Temp files for nmap output capture (trap-cleaned on exit) ---
TCP_OUT=$(mktemp)
UDP_OUT=$(mktemp)
trap 'rm -f "${TCP_OUT}" "${UDP_OUT}"' EXIT

# --- TCP scan (single nmap invocation, all 10 ports) ---
log "[1/3] TCP scan (10 ports)..."
# -Pn: skip ping (cloud VMs often ICMP-block)
# --reason: print why nmap classifies each port (T-30-06 mitigation)
# NO --open: we MUST verify closed-required ports show closed/filtered state
nmap -Pn -p 22,80,443,1935,8080,5432,6379,9000,9001,1985 --reason "${VM_IP}" > "${TCP_OUT}" 2>&1 \
  || warn "nmap TCP scan returned non-zero (continuing — output captured)"
echo

# --- TCP assertion logic ---
PASS=0
FAIL=0
assert_tcp() {
  local port="$1" expected="$2"   # expected = "open" | "closed"
  local line
  line=$(grep -E "^${port}/tcp[[:space:]]+" "${TCP_OUT}" || true)
  if [[ -z "${line}" ]]; then
    fail_check "TCP ${port} — no state line in nmap output (target unreachable?)"
    FAIL=$((FAIL+1))
    return
  fi
  case "${expected}" in
    open)
      if grep -qE "^${port}/tcp[[:space:]]+open" <<<"${line}"; then
        pass_check "TCP ${port} OPEN (expected)"
        PASS=$((PASS+1))
      else
        fail_check "TCP ${port} expected OPEN, actual: ${line}"
        FAIL=$((FAIL+1))
      fi
      ;;
    closed)
      # nmap reports "closed" or "filtered" for unreachable; both acceptable for blocked ports
      if grep -qE "^${port}/tcp[[:space:]]+(closed|filtered)" <<<"${line}"; then
        pass_check "TCP ${port} CLOSED/FILTERED (expected — internal-only service)"
        PASS=$((PASS+1))
      else
        fail_check "TCP ${port} expected CLOSED, actual: ${line}  ← LEAKED INTERNAL SERVICE"
        FAIL=$((FAIL+1))
      fi
      ;;
  esac
}

# Allowed-open TCP (5)
assert_tcp 22   open
assert_tcp 80   open
assert_tcp 443  open
assert_tcp 1935 open
assert_tcp 8080 open
# Must-be-closed TCP (5) — internal services that MUST NOT leak externally
assert_tcp 5432 closed   # postgres (internal network only)
assert_tcp 6379 closed   # redis (internal network only)
assert_tcp 9000 closed   # MinIO S3 API (internal + Caddy-proxied for /avatars + /snapshots)
assert_tcp 9001 closed   # MinIO console (internal only)
assert_tcp 1985 closed   # SRS HTTP API (127.0.0.1 loopback only per Phase 26 D-07)
echo

# --- UDP scan (2 ports — slower, ~30-60s) ---
log "[2/3] UDP scan (2 ports — slower, ~30-60s)..."
# Phase 27 D-12: HTTP/3 (QUIC) is disabled (servers.protocols=h1 h2) —
# port 443 over UDP is intentionally NOT scanned here.
# UDP scope is exactly: 8000 (WebRTC ICE) + 10080 (SRT).
nmap -Pn -sU -p 8000,10080 --reason "${VM_IP}" > "${UDP_OUT}" 2>&1 \
  || warn "nmap UDP scan returned non-zero (continuing — output captured)"
echo

# --- UDP assertion (T-30-06 ambiguity handling per D-15) ---
assert_udp_open() {
  local port="$1"
  local line
  line=$(grep -E "^${port}/udp[[:space:]]+" "${UDP_OUT}" || true)
  if [[ -z "${line}" ]]; then
    fail_check "UDP ${port} — no state line in nmap output"
    FAIL=$((FAIL+1))
    return
  fi
  if grep -qE "^${port}/udp[[:space:]]+open[[:space:]]" <<<"${line}"; then
    pass_check "UDP ${port} OPEN (expected)"
    PASS=$((PASS+1))
  elif grep -qE "^${port}/udp[[:space:]]+open\|filtered" <<<"${line}"; then
    warn "UDP ${port} reports open|filtered (ambiguous — confirm manually with a UDP probe). Counting as PASS per D-15."
    pass_check "UDP ${port} open|filtered — accepted with manual-confirm caveat"
    PASS=$((PASS+1))
  else
    fail_check "UDP ${port} expected OPEN, actual: ${line}"
    FAIL=$((FAIL+1))
  fi
}
assert_udp_open 8000   # WebRTC ICE
assert_udp_open 10080  # SRT
echo

# --- Summary + exit code ---
log "[3/3] Summary"
echo "  TCP allowed-open verified: 22, 80, 443, 1935, 8080"
echo "  TCP must-be-closed verified: 5432, 6379, 9000, 9001, 1985"
echo "  UDP allowed-open verified: 8000, 10080"
echo
echo "  PASS=${PASS}  FAIL=${FAIL}"
echo
# Print temp paths BEFORE exit so operator can paste output if needed.
# trap deletes these on exit; advise operator to copy now.
log "  TCP output: ${TCP_OUT}"
log "  UDP output: ${UDP_OUT}"
log "  (Both files are deleted on script exit. Copy them now if you need to preserve evidence.)"
echo

if [[ "${FAIL}" -eq 0 ]]; then
  ok "All ${PASS} port-lockdown assertions passed. DEPLOY-26 satisfied."
  log "Append to deploy/SMOKE-TEST-LOG.md SC#3 row: PASS — see nmap output above"
  exit 0
else
  die "${FAIL} of $((PASS+FAIL)) assertions failed. v1.3 GA blocked (D-12 hard fail)."
  # die() exits 1
fi
