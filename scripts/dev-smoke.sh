#!/usr/bin/env bash
# scripts/dev-smoke.sh — Phase 24 dev-workflow regression check.
#
# Purpose:
#   Boot `pnpm dev` in the background, wait for the api (port 3003) and web
#   (port 3002) dev servers to come up, probe each port for HTTP liveness,
#   then cleanly kill the background processes. Exits 0 on success.
#
# Why a smoke script:
#   Phase 24 restructures the deploy surface (deploy/ skeleton, Dockerfile
#   rename, root .dockerignore, CLAUDE.md guardrail). None of those changes
#   should affect `pnpm dev`. This script proves it mechanically.
#
# Health-probe nuance:
#   The api's /api/admin/health route is guarded by SuperAdminGuard, so an
#   unauthenticated curl will return 401 or 404. That's fine — we want to
#   prove the PORT is listening, not that the body is 200. We accept any
#   HTTP status code in 2xx/3xx/4xx as "port is alive" and only fail on
#   curl exit-codes that mean "connection refused" or "timed out".
#
# Run manually before merging Phase 24 (D-15 / D-22 step 2). NOT wired into
# CI in Phase 24 (D-14); CI integration is deferred to v1.4 / Phase 30.

set -euo pipefail

# ---- Configuration --------------------------------------------------------

API_PORT="${API_PORT:-3003}"      # apps/api/.env line 8: PORT=3003
WEB_PORT="${WEB_PORT:-3000}"      # apps/web/package.json: "dev": "next dev --turbopack --port 3000"
BOOT_WAIT_SEC="${BOOT_WAIT_SEC:-15}"  # tsx-watch + Next.js dev cold boot
KILL_GRACE_SEC=3                  # how long to wait after SIGTERM before SIGKILL
LOG_FILE="$(mktemp -t dev-smoke.XXXXXX.log)"

# ---- Helpers --------------------------------------------------------------

log() { printf '[dev-smoke] %s\n' "$*"; }

cleanup() {
  local rc=$?
  log "cleaning up (exit code so far: $rc)"
  if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" 2>/dev/null; then
    log "sending SIGTERM to pnpm dev pid=$DEV_PID and its process group"
    # Kill the whole process group so child pnpm dev:api / pnpm dev:web /
    # tsx / next-dev processes are reaped together. `pnpm dev` runs
    # `pnpm dev:api & pnpm dev:web & wait`, so the group has 3+ members.
    kill -TERM -- "-$DEV_PID" 2>/dev/null || kill -TERM "$DEV_PID" 2>/dev/null || true
    sleep "$KILL_GRACE_SEC"
    if kill -0 "$DEV_PID" 2>/dev/null; then
      log "process still alive after SIGTERM; sending SIGKILL"
      kill -KILL -- "-$DEV_PID" 2>/dev/null || kill -KILL "$DEV_PID" 2>/dev/null || true
    fi
  fi
  # Best-effort: any orphaned process bound to our ports gets killed too.
  for port in "$API_PORT" "$WEB_PORT"; do
    if command -v lsof >/dev/null 2>&1; then
      pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
      if [ -n "$pids" ]; then
        log "killing orphaned listeners on port $port: $pids"
        echo "$pids" | xargs -r kill -KILL 2>/dev/null || true
      fi
    fi
  done
  if [ -f "$LOG_FILE" ]; then
    if [ "$rc" -ne 0 ]; then
      log "----- pnpm dev log (last 80 lines) -----"
      tail -n 80 "$LOG_FILE" || true
      log "----------------------------------------"
    fi
    rm -f "$LOG_FILE"
  fi
  exit "$rc"
}

trap cleanup EXIT INT TERM HUP

probe_port() {
  local label="$1"; shift
  local url="$1"; shift
  # -sS silent except errors, -o discard body, -w "%{http_code}" prints status,
  # --max-time 5 cap connection wait. Returns 000 on connect-refused/timeout.
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || echo "000")
  log "$label probe: $url -> HTTP $code"
  case "$code" in
    000|5*) return 1 ;;  # connect refused / server error = fail
    *)      return 0 ;;  # any 2xx/3xx/4xx = port alive
  esac
}

# ---- Main -----------------------------------------------------------------

log "starting pnpm dev in background (boot wait=${BOOT_WAIT_SEC}s, log=$LOG_FILE)"

# `setsid` puts pnpm dev in its own process group so we can SIGTERM the
# whole group in cleanup. Falls back to plain bg if setsid is missing
# (e.g. macOS without coreutils — uses bash's own job control instead).
if command -v setsid >/dev/null 2>&1; then
  setsid pnpm dev >"$LOG_FILE" 2>&1 &
else
  # macOS path: use a subshell with `set -m` to enable job control so the
  # subshell becomes the process-group leader; we kill via the subshell pid.
  ( set -m; exec pnpm dev ) >"$LOG_FILE" 2>&1 &
fi
DEV_PID=$!
log "pnpm dev pid=$DEV_PID; sleeping ${BOOT_WAIT_SEC}s for cold boot"

sleep "$BOOT_WAIT_SEC"

# Confirm the bg process is still alive (didn't crash during boot).
if ! kill -0 "$DEV_PID" 2>/dev/null; then
  log "FAIL: pnpm dev pid=$DEV_PID is not running after ${BOOT_WAIT_SEC}s"
  exit 1
fi

api_ok=0
web_ok=0
probe_port "api" "http://localhost:${API_PORT}/api/health" && api_ok=1 || true
probe_port "web" "http://localhost:${WEB_PORT}/" && web_ok=1 || true

if [ "$api_ok" -eq 1 ] && [ "$web_ok" -eq 1 ]; then
  log "PASS: api (port $API_PORT) and web (port $WEB_PORT) are both responsive"
  exit 0
fi

log "FAIL: api_ok=$api_ok web_ok=$web_ok"
exit 1
