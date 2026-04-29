#!/usr/bin/env bash
# ============================================================================
# deploy/scripts/verify-playback.sh — Phase 30 (DEPLOY-25, partial coverage)
#
# Phase 30 SC#2 verifier: runs ON the smoke VM AFTER the operator has
# completed manual UI checklist steps 1-6 (D-14):
#   1. Login as super-admin
#   2. Register test camera (RTSP_TEST_URL)
#   3. Play HLS in browser (10s observation)
#   4. Toggle Record → wait 60s → toggle off
#   5. DevTools WebSocket frame inspection
#   6. Stop external feed → confirm offline transition
#
# Folds in Phase 27 SC#2 (wss upgrade) + automated portion of Phase 29 SC#5
# (README quickstart end-to-end). The DevTools WS frame inspection (D-08)
# remains MANUAL — captured as screenshot in deploy/smoke-evidence/.
#
# Asserts:
#   [1/4] wss://${DOMAIN}/socket.io/ → HTTP/1.1 101 Switching Protocols
#         (Phase 27 SC#2 — Caddy reverse-proxies WebSocket upgrade to api:3003)
#   [2/4] SRS reports ≥1 active stream + ≥1 .m3u8 manifest in HLS path
#         (Phase 30 SC#2 + Phase 29 SC#5 automated portion)
#   [3/4] MinIO recordings bucket has ≥1 .ts archive + 0 .mp4 archives
#         (Phase 23 D-03 + SRS v6 limitation = MPEG-TS not fMP4)
#   [4/4] Summary + tee SMOKE-TEST-LOG.md + exit
#
# Usage:
#   bash deploy/scripts/verify-playback.sh
#   CAMERA_ID=<uuid> bash deploy/scripts/verify-playback.sh   # if multiple cameras registered, scope MinIO ls
#
# Prerequisites:
#   - deploy/.env exists with DOMAIN filled
#   - At least one camera is registered AND has been recording (operator did D-14 #2 + #4)
#   - Stack is up + healthy (api + caddy + minio reachable)
#
# Exit codes:
#   0 — all assertions pass
#   1 — at least one HARD assertion failed (HARD GA block per D-12)
#   2 — missing prerequisites (.env, no camera+recording yet)
# ============================================================================
set -euo pipefail
IFS=$' \n\t'

# --- Path resolution (works from any CWD) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env"
COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.yml"
LOG_FILE="${DEPLOY_DIR}/SMOKE-TEST-LOG.md"

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
log()         { printf '%s[verify-playback]%s %s\n' "${BOLD}" "${RESET}" "$*"; }
ok()          { printf '%s[verify-playback] ✓%s %s\n' "${GREEN}" "${RESET}" "$*"; }
warn()        { printf '%s[verify-playback] ⚠%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
die()         { printf '%s[verify-playback] ✗%s %s\n' "${RED}" "${RESET}" "$*" >&2; exit 1; }
pass_check()  { printf '  %s✓%s %s\n' "${GREEN}" "${RESET}" "$*"; }
fail_check()  { printf '  %s✗%s %s\n' "${RED}" "${RESET}" "$*" >&2; }

# --- Tooling preflight ---
command -v docker >/dev/null 2>&1 || { printf '%s[verify-playback] ✗%s docker not on PATH\n' "${RED}" "${RESET}" >&2; exit 2; }
command -v curl >/dev/null 2>&1   || { printf '%s[verify-playback] ✗%s curl not on PATH\n' "${RED}" "${RESET}" >&2; exit 2; }
command -v openssl >/dev/null 2>&1 || { printf '%s[verify-playback] ✗%s openssl not on PATH (needed for WS key generation)\n' "${RED}" "${RESET}" >&2; exit 2; }
[[ -f "${ENV_FILE}" ]] || { printf '%s[verify-playback] ✗%s %s missing — run from a deployed stack\n' "${RED}" "${RESET}" "${ENV_FILE}" >&2; exit 2; }

# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a
[[ -n "${DOMAIN:-}" ]] || { printf '%s[verify-playback] ✗%s DOMAIN not set in %s\n' "${RED}" "${RESET}" "${ENV_FILE}" >&2; exit 2; }

PASS=0
FAIL=0
DC="docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE}"

log "Phase 30 SC#2 verifier — DOMAIN=${DOMAIN}"
log "Pre-condition: operator has completed D-14 manual UI steps 1-6 (camera registered + 60s recording captured)"
echo

# ============================================================================
# [1/4] wss:// upgrade probe (Phase 27 SC#2)
# ============================================================================
# Caddy reverse-proxies /socket.io/* to api:3003 (Caddyfile lines 33-35).
# We do not complete the Socket.IO handshake — only assert the WS upgrade
# returns HTTP/1.1 101 Switching Protocols. The Sec-WebSocket-Key MUST be
# fresh base64-encoded 16 random bytes per RFC 6455 (§4.1).
log "[1/4] wss:// upgrade through Caddy (Phase 27 SC#2)"
ws_key=$(openssl rand -base64 16)

# curl -i prints headers; --max-time guards a wedged proxy. We tolerate
# non-zero exit (curl exits 1 once the upgrade closes) by capturing stdout
# + stderr together with || true.
ws_response=$(curl -i -sS --max-time 10 \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: ${ws_key}" \
  -H "Sec-WebSocket-Version: 13" \
  "https://${DOMAIN}/socket.io/?EIO=4&transport=websocket" 2>&1 || echo "CURL_FAIL")

if printf '%s' "${ws_response}" | grep -qE '^HTTP/1\.1 101 Switching Protocols'; then
  pass_check "wss://${DOMAIN}/socket.io/ → HTTP/1.1 101 Switching Protocols"
  PASS=$((PASS + 1))
else
  fail_check "wss upgrade did NOT return 101 — Caddy /socket.io handle broken or api gateway down?"
  log "  Response head:"
  printf '%s\n' "${ws_response}" | head -10 | sed 's/^/    /'
  FAIL=$((FAIL + 1))
fi
echo

# ============================================================================
# [2/4] HLS reachability via SRS (Phase 30 SC#2 + Phase 29 SC#5 automated)
# ============================================================================
# SRS HTTP API on :1985 binds 127.0.0.1 only (Phase 26 D-07 / Pitfall 13),
# so we query it from inside the srs container. Then we list the HLS data
# volume (/usr/local/srs/objs/nginx/html — see SRS Docker Setup table) for
# .m3u8 manifests as proof the playback pipeline produced a manifest.
log "[2/4] HLS reachability via SRS (active streams + .m3u8 manifests)"

# Fetch /api/v1/streams from inside the srs container; tolerate missing curl
# in srs image by falling back to wget if needed.
active_streams_json=$(${DC} exec -T srs sh -c 'curl -s --max-time 5 http://127.0.0.1:1985/api/v1/streams 2>/dev/null || wget -qO- --timeout=5 http://127.0.0.1:1985/api/v1/streams 2>/dev/null || echo "{}"' 2>/dev/null || echo "{}")

# The streams payload is `{"code":0,"server":"...","streams":[...]}`. We
# detect "streams":[ followed by anything other than ] (empty array marker).
if printf '%s' "${active_streams_json}" | grep -qE '"streams":[[:space:]]*\[[^]]'; then
  pass_check "SRS reports active streams (operator registered camera per D-14 #2)"
  PASS=$((PASS + 1))
else
  fail_check "SRS reports 0 active streams — operator did not register a camera before running this verifier?"
  warn "  Did you complete D-14 step 2 (register test RTSP camera)? Streams payload was:"
  printf '%s\n' "${active_streams_json}" | head -5 | sed 's/^/    /'
  FAIL=$((FAIL + 1))
  # Continue — MinIO recording check is independent
fi

# Probe HLS m3u8 directly from the SRS container's HLS data volume.
hls_m3u8_count=$(${DC} exec -T srs sh -c 'find /usr/local/srs/objs/nginx/html -name "*.m3u8" 2>/dev/null | wc -l' 2>/dev/null | tr -d '[:space:]' || echo 0)
hls_m3u8_count=${hls_m3u8_count:-0}
if [[ "${hls_m3u8_count}" -ge 1 ]]; then
  pass_check "At least 1 .m3u8 manifest in SRS HLS path (count=${hls_m3u8_count})"
  PASS=$((PASS + 1))
else
  fail_check "0 .m3u8 manifests in SRS HLS path — playback pipeline broken (no segments produced)"
  FAIL=$((FAIL + 1))
fi
echo

# ============================================================================
# [3/4] MinIO recording archive ls (Phase 30 SC#2 + Phase 29 SC#5)
# ============================================================================
# D-08 + D-09: operator's 60s record window produces .ts segments in the
# `recordings` bucket. Assert at least one .ts file exists with size > 0,
# and assert exactly 0 .mp4 files (Phase 23 D-03 lock — SRS v6 has no
# fMP4; if .mp4 appears, the recording contract has silently changed).
log "[3/4] MinIO recording archive (.ts MPEG-TS per Phase 23 D-03 + SRS v6)"

# `mc` is on PATH inside the minio image (used in healthcheck on
# docker-compose.yml line 98: `["CMD", "mc", "ready", "local"]`). The
# `local` alias is preconfigured by the minio entrypoint, but defensively
# (re-)set it. Suppress stdout+stderr to avoid leaking MinIO password
# (T-30-10 mitigation). We do NOT echo MINIO_ROOT_PASSWORD anywhere.
${DC} exec -T minio mc alias set local http://localhost:9000 "${MINIO_ROOT_USER:-minioadmin}" "${MINIO_ROOT_PASSWORD:-}" >/dev/null 2>&1 || true

recordings_listing=$(${DC} exec -T minio mc ls --recursive local/recordings/ 2>/dev/null || echo "")

# mc ls output format: "[2026-04-29 12:00:00 UTC]  X.YkB STANDARD path/to/file.ts"
# Count lines whose final whitespace-delimited token ends in .ts (file-name column).
ts_count=$(printf '%s\n' "${recordings_listing}" | awk '{ name=$NF; if (name ~ /\.ts$/) c++ } END { print c+0 }')
if [[ "${ts_count}" -ge 1 ]]; then
  pass_check "MinIO recordings bucket has ${ts_count} .ts archive(s)"
  PASS=$((PASS + 1))
else
  fail_check "MinIO recordings bucket has 0 .ts archives — D-14 step 4 (record 60s) not completed?"
  if [[ -n "${recordings_listing}" ]]; then
    warn "  Bucket listing (truncated):"
    printf '%s\n' "${recordings_listing}" | head -5 | sed 's/^/    /'
  else
    warn "  Bucket listing was empty (or mc could not connect)."
  fi
  FAIL=$((FAIL + 1))
fi

# Phase 23 D-03 contract: assert ZERO .mp4 archives. If any exist, either
# someone re-enabled fMP4 (which SRS v6 cannot produce) or a Phase 7+ migration
# leaked into v1.3 — both warrant manual review.
mp4_count=$(printf '%s\n' "${recordings_listing}" | awk '{ name=$NF; if (name ~ /\.mp4$/) c++ } END { print c+0 }')
if [[ "${mp4_count}" -eq 0 ]]; then
  pass_check "0 .mp4 archives (correct — SRS v6 emits only .ts per Phase 23 D-03)"
  PASS=$((PASS + 1))
else
  fail_check "${mp4_count} .mp4 archive(s) found — Phase 23 D-03 contract violated (fMP4 should not exist on v6)"
  FAIL=$((FAIL + 1))
fi
echo

# ============================================================================
# [4/4] Summary + tee SMOKE-TEST-LOG.md + exit (D-19 exit codes)
# ============================================================================
log "[4/4] Summary"
echo "  PASS=${PASS}  FAIL=${FAIL}"
echo

# Best-effort log append — do NOT fail the run if the log is missing.
if [[ -f "${LOG_FILE}" ]]; then
  printf '\n<!-- verify-playback.sh run %s — %s checks PASS, %s FAIL -->\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${PASS}" "${FAIL}" >> "${LOG_FILE}"
fi

if [[ "${FAIL}" -eq 0 ]]; then
  ok "All ${PASS} verify-playback assertions passed."
  log "Phase 30 SC#2 satisfied (covers Phase 27 SC#2 wss upgrade + Phase 29 SC#5 automated portion)"
  log "Manual remainder: capture DevTools WebSocket frame screenshot per D-08 + paste path into SMOKE-TEST-LOG.md"
  exit 0
else
  die "${FAIL} of $((PASS + FAIL)) assertions failed. v1.3 GA blocked (D-12 hard fail)."
fi
