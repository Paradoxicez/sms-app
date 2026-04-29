---
phase: 30
plan: 04
subsystem: deploy/smoke
tags: [smoke-test, verify-playback, websocket, hls, minio, recording, ga-gate, DEPLOY-25]
requirements: [DEPLOY-25]
wave: 2
depends_on: [30-01]

dependency_graph:
  requires:
    - "deploy/.env (DOMAIN, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD)"
    - "deploy/docker-compose.yml — minio + srs services healthy"
    - "deploy/Caddyfile — /socket.io/* handle reverse-proxying api:3003 (Phase 27)"
    - "deploy/SMOKE-TEST-LOG.md — Wave 1 template (105 lines, populated row-by-row by verifiers)"
    - "operator pre-condition: D-14 manual UI checklist steps 1-6 complete (camera registered + 60s recording captured)"
  provides:
    - "deploy/scripts/verify-playback.sh — Phase 30 SC#2 automated verifier (mode 0755, 227 LOC)"
    - "Coverage of Phase 27 SC#2 (wss:// 101 upgrade through Caddy)"
    - "Coverage of Phase 29 SC#5 automated portion (HLS + MinIO recording archive presence)"
  affects:
    - "deploy/SMOKE-TEST-LOG.md — best-effort HTML-comment append on each run (PASS/FAIL counts + UTC timestamp)"

tech_stack:
  added: []
  patterns:
    - "verify-phase-27.sh structural pattern (set -euo pipefail, tput-aware color, [N/M] step numbering, PASS/FAIL counters)"
    - "RFC-6455 WebSocket handshake probe via curl + openssl rand -base64 16 Sec-WebSocket-Key"
    - "docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} verbose form (Phase 29 D-29 inheritance)"
    - "MinIO mc ls listing parsed with awk (final-token .ts/.mp4 extension match — robust to mc's variable-width size column)"
    - "SRS HTTP API queried from inside container (port 1985 binds 127.0.0.1 only per Phase 26 D-07)"

key_files:
  created:
    - "deploy/scripts/verify-playback.sh (227 LOC, mode 0755)"
  modified: []

decisions:
  - "Probe wss upgrade via curl + manual Sec-WebSocket-Key (no Socket.IO client library) — only the 101 line is needed; full handshake completion is out of scope for a smoke verifier"
  - "Query SRS /api/v1/streams from inside the srs container (NOT host:1985) — Phase 26 Pitfall 13 binds 1985 to 127.0.0.1 only; external probe would always 'fail closed' and mask real state"
  - "Parse MinIO mc ls with awk's final-token match (`name=$NF; if (name ~ /\\.ts$/)`) instead of grep — mc's size column is variable-width (kB/MB/GB) and grep -c on '.ts$' would false-positive on filenames containing literal '.ts' substrings mid-path"
  - "Suppress mc alias set stdout+stderr (T-30-10 mitigation) — mc's 'configured local' line could include the username; we never want MINIO_ROOT_PASSWORD anywhere near the verifier output"
  - "Continue past failed assertions within steps (do NOT exit on first fail) — operator gets a complete picture in one run instead of one-fail-per-iteration loop"
  - "Best-effort SMOKE-TEST-LOG.md append (`if [[ -f ${LOG_FILE} ]]`) — verifier still exits 0/1/2 cleanly even if log was deleted between bootstrap and verifier run"

metrics:
  duration_minutes: 12
  completed_date: "2026-04-29"
  tasks: 1
  files: 1
  commits: 1
---

# Phase 30 Plan 04: verify-playback.sh — wss + HLS + MinIO Recording Verifier Summary

**One-liner:** Phase 30 SC#2 verifier — asserts the wss:// upgrade through Caddy returns HTTP/1.1 101, ≥1 .m3u8 manifest exists in SRS HLS path, and ≥1 .ts (and 0 .mp4) recording archive exists in MinIO.

## What was built

`deploy/scripts/verify-playback.sh` (227 LOC, mode 0755) — runs ON the smoke VM AFTER the operator completes D-14 manual UI steps 1-6 (login → register camera → play HLS → toggle Record 60s → DevTools WS frame → stop external feed). The script bundles three independent assertions and returns a single roll-up exit code.

### 4-step assertion list

| Step | Assertion | Source SC | Implementation |
|------|-----------|-----------|----------------|
| [1/4] | wss://${DOMAIN}/socket.io/ → HTTP/1.1 101 Switching Protocols | Phase 27 SC#2 | curl with 4 RFC-6455 headers (Connection: Upgrade, Upgrade: websocket, Sec-WebSocket-Key from `openssl rand -base64 16`, Sec-WebSocket-Version: 13) — only the 101 status line is parsed |
| [2/4] | SRS /api/v1/streams reports ≥1 active stream + ≥1 .m3u8 manifest in HLS data path | Phase 30 SC#2 + Phase 29 SC#5 | `docker compose exec -T srs` curls 127.0.0.1:1985 (port-bound to localhost) + `find /usr/local/srs/objs/nginx/html -name "*.m3u8"` |
| [3/4] | MinIO recordings bucket has ≥1 .ts archive AND exactly 0 .mp4 archives | Phase 30 SC#2 + Phase 29 SC#5 + Phase 23 D-03 contract | `mc ls --recursive local/recordings/` parsed with awk on final whitespace token — counts .ts and .mp4 separately |
| [4/4] | Summary + best-effort tee SMOKE-TEST-LOG.md + exit 0/1/2 per D-19 | — | Appends `<!-- verify-playback.sh run <UTC-ts> — N PASS, M FAIL -->` on every run; exits 0 if FAIL=0, exits 1 via `die()` otherwise |

### wss handshake probe pattern

```bash
ws_key=$(openssl rand -base64 16)
ws_response=$(curl -i -sS --max-time 10 \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: ${ws_key}" \
  -H "Sec-WebSocket-Version: 13" \
  "https://${DOMAIN}/socket.io/?EIO=4&transport=websocket" 2>&1 || echo "CURL_FAIL")

printf '%s' "${ws_response}" | grep -qE '^HTTP/1\.1 101 Switching Protocols'
```

curl exits non-zero once the upgraded stream closes — the `|| echo "CURL_FAIL"` guard captures stdout regardless. We do NOT complete the Socket.IO handshake (no Sec-WebSocket-Accept verification) because Caddy returning 101 already proves the upgrade traversed the reverse-proxy chain (Phase 27 SC#2 contract). The Socket.IO client-side validation is observed in DevTools per D-08 (operator screenshot evidence).

### Operator pre-condition (D-14)

The verifier ASSUMES the operator has already completed manual UI steps 1-6 before invocation:

1. Login as super-admin (ADMIN_EMAIL/ADMIN_PASSWORD from `.env`)
2. **Register test camera (RTSP URL from D-07)** — required for [2/4] active-streams assertion
3. Play HLS in browser (10s observation)
4. **Toggle Record → wait 60s → toggle off** — required for [3/4] .ts archive assertion
5. DevTools WebSocket frame inspection (manual screenshot, NOT in scope of automated verifier)
6. Stop external feed → confirm offline transition

If the operator skips step 2 or 4, the verifier will report a SPECIFIC failure ("Did you complete D-14 step 2?" / "D-14 step 4 not completed?") and exit 1 — not a generic timeout.

### Security mitigations (threat register T-30-03 + T-30-10 + T-30-11)

- **T-30-03 (RTSP credential leak):** Script never reads `RTSP_TEST_URL` directly — that URL is only used by the operator at the manual step. The verifier asserts the OUTPUT (.ts archive in MinIO), not the input URL. Acceptance criteria bans hardcoded `rtsp://` with credentials (`! grep -qE 'rtsp://[^$]'` returns 0).
- **T-30-10 (MinIO password disclosure):** `mc alias set ... >/dev/null 2>&1` suppresses both stdout and stderr — mc would otherwise echo a "configured" line that could include the username. MINIO_ROOT_PASSWORD is interpolated into the alias-set call but never echoed.
- **T-30-11 (false-pass on empty bucket):** Explicit count assertion `ts_count >= 1`. Empty listing → fail_check + warn with truncated bucket dump. The .mp4 absence is a separate assertion so an empty bucket cannot mask the fMP4 contract violation.

## Tasks executed

1. **Task 1: Author deploy/scripts/verify-playback.sh** (commit `90d6b23`)
   - 227 LOC, mode 0755 (verified `git ls-files --stage` returns `100755`)
   - 4-step modular assertion structure
   - 16/16 acceptance-criteria greps PASS:
     - `set -euo pipefail` ✓
     - `[1/4]` `[2/4]` `[3/4]` `[4/4]` step labels ✓
     - `Upgrade: websocket` ✓
     - `Sec-WebSocket-Key` ✓
     - `openssl rand -base64 16` ✓
     - `HTTP/1.1 101` regex ✓
     - `mc ls.*local/recordings` ✓
     - `.ts` and `.mp4` extension assertions ✓
     - `! grep -qE 'rtsp://[^$]'` (no hardcoded creds) ✓
     - `set -a; source` env-load pattern ✓
     - exit 0/1/2 reachable ✓
     - Best-effort log append ✓
   - `bash -n deploy/scripts/verify-playback.sh` exits 0

## Deviations from Plan

None — plan executed exactly as written.

The plan template's regex `\\\\.ts\\\\\\$` (anchored end-of-line on .ts) was implemented as awk's `name ~ /\.ts$/` instead of `grep -E '\.ts$'`. **Rationale:** `mc ls` output trailing whitespace is unpredictable across mc versions, and awk's final-token (`$NF`) match is robust to that variance. Both forms satisfy the acceptance criterion (`grep -qE '\\\\.ts'` returns 0) — the `.ts` literal is present in two awk regex strings.

## Auth gates

None encountered — verifier is a static script artifact; no live deployment was probed during execution. Live execution is operator territory in Phase 30 smoke runs.

## Known Stubs

None — script is a complete deliverable. Lab-only checkpoints (#3 cert obtained, #4 308 redirect, #5 WSS 101 with full payload, #6 persist-restart) explicitly belong to operator-driven smoke runs (Phase 30 D-12), not the static verifier itself.

## Self-Check

```bash
$ test -x deploy/scripts/verify-playback.sh && echo FOUND
FOUND

$ git log --oneline -1 -- deploy/scripts/verify-playback.sh
90d6b23 feat(30-04): author deploy/scripts/verify-playback.sh — wss + HLS + MinIO recordings (DEPLOY-25)

$ git ls-files --stage deploy/scripts/verify-playback.sh | awk '{print $1}'
100755

$ bash -n deploy/scripts/verify-playback.sh; echo $?
0

$ wc -l deploy/scripts/verify-playback.sh
     227 deploy/scripts/verify-playback.sh
```

**Self-Check: PASSED** — file exists at correct path, executable bit set in git (100755), syntax valid (`bash -n` exits 0), commit `90d6b23` reachable in `git log`, all 16 acceptance-criteria greps PASS. Min-lines threshold satisfied (227 ≥ 130 from frontmatter).
