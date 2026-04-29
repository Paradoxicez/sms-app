---
phase: 30-smoke-test-on-clean-vm-ga-gate
plan: 02
subsystem: infra
tags: [nmap, port-lockdown, security, smoke-test, deploy, bash, verification]

# Dependency graph
requires:
  - phase: 26-production-compose-migrate-init-networking-volumes
    provides: port topology — SRS 1985 binds 127.0.0.1 only, postgres/redis/minio internal-network only, public exposure list (1935/8080/8000udp/10080udp)
  - phase: 27-caddy-reverse-proxy-auto-tls
    provides: Caddy listens on 80/443/tcp; HTTP/3 disabled (servers.protocols=h1 h2) so no 443/udp surface
  - phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli
    provides: bash conventions (D-29) — set -euo pipefail, IFS, tput-aware color, [tag] log prefix
provides:
  - deploy/scripts/verify-nmap.sh (DEPLOY-26 evidence collector)
  - External port-lockdown verifier for v1.3 GA (Phase 30 SC#3 hard gate)
  - Pattern for nmap-based external network surface assertion (TCP + UDP)
affects: [30-01-smoke-test-log, 30-04-smoke-orchestrator, 30-06-phase-verification]

# Tech tracking
tech-stack:
  added: [nmap (operator local prerequisite — macOS brew, Linux apt)]
  patterns:
    - "Operator-laptop-side verifier (NOT VM-side) — proves external exposure from outside the trust boundary"
    - "TCP scan with explicit closed/filtered acceptance — both states are valid for blocked ports"
    - "UDP scan with --reason flag for open|filtered ambiguity disambiguation (T-30-06 mitigation)"
    - "VM_IP env var with IPv4 dotted-quad regex pre-flight (no hardcoding, no garbage to nmap)"
    - "Trap-cleaned mktemp temp files with paths printed BEFORE exit (operator paste evidence window)"

key-files:
  created:
    - deploy/scripts/verify-nmap.sh
  modified: []

key-decisions:
  - "TCP --reason flag (not just --open) so closed-required ports MUST appear in output for assertion (D-15 + T-30-06)"
  - "UDP open|filtered counted as PASS-with-warning per D-15 (operator manual confirm caveat) — blocking on this would over-block GA"
  - "Excluded 443/udp from UDP scan per Phase 27 D-12 (HTTP/3 disabled, no QUIC binding)"
  - "Excluded 8000/tcp from TCP scan — 8000 is UDP-only (WebRTC ICE); scanning it would test for misconfiguration not contracted state"
  - "VM_IP IPv4 dotted-quad regex validation (refuse hostnames, IPv6, garbage) — keeps nmap target predictable"

patterns-established:
  - "Phase 30 verifier anatomy: shebang + set -euo pipefail + IFS + path resolution + TTY-aware color + pre-flight (exit 2) + scan + assert helpers + summary + exit 0/1 — inherits from verify-phase-27.sh + bootstrap.sh"
  - "Per-port assertion with state-line grep (^<port>/<proto>\\s+) — robust to nmap output format drift across versions"
  - "Temp file path advisory printed BEFORE exit with explicit 'copy now' note — trap rm -f preserves evidence collection window"

requirements-completed: [DEPLOY-26]

# Metrics
duration: ~12min
completed: 2026-04-29
---

# Phase 30 Plan 02: External Port-Lockdown Verifier Summary

**Operator-laptop-side nmap verifier asserting v1.3 port lockdown contract — 5 allowed-open TCP + 5 must-be-closed TCP + 2 allowed-open UDP — closes DEPLOY-26 and gates Phase 30 SC#3.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-29T03:48:00Z (approx)
- **Completed:** 2026-04-29T04:00:00Z (approx)
- **Tasks:** 1 / 1
- **Files modified:** 1 (created)

## Accomplishments

- Authored `deploy/scripts/verify-nmap.sh` (200 LOC, mode 0755, executable bit landed in git index as `100755`)
- Encoded the v1.3 port lockdown contract as 12 individual nmap-output assertions (5 TCP open + 5 TCP closed + 2 UDP open)
- Pre-flight gates reject missing nmap, missing `VM_IP`, or non-IPv4 input — all exit 2 (D-19)
- Hard fail (exit 1, "v1.3 GA blocked") on any wrong-state port per D-12
- `--reason` flag enabled on both TCP + UDP scans per T-30-06 mitigation; UDP `open|filtered` counted as PASS-with-warning per D-15 to avoid over-blocking GA on legitimate ambiguity
- Excluded `443/udp` from UDP scan (Phase 27 D-12: HTTP/3 disabled, `servers { protocols h1 h2 }` — no QUIC binding to assert)
- TTY-aware color helpers + `[verify-nmap]` log prefix (Phase 29 D-29 bash convention inherited from `bootstrap.sh`)

## Task Commits

1. **Task 1: Author deploy/scripts/verify-nmap.sh + chmod 0755** — `5cd8666` (feat)

## Port Assertion List

### TCP Allowed-Open (5)
| Port | Service | Why Open |
|------|---------|----------|
| 22 | SSH | Operator access (cloud provider exposes by default) |
| 80 | HTTP | Caddy ACME HTTP-01 challenge + 308 redirect to 443 |
| 443 | HTTPS | Caddy primary tenant surface (Phase 27) |
| 1935 | RTMP | SRS camera ingest (cameras + encoders push) |
| 8080 | HLS | SRS HLS delivery (Phase 27 will reverse-proxy in future) |

### TCP Must-Be-Closed (5)
| Port | Service | Reason Closed Externally |
|------|---------|--------------------------|
| 5432 | PostgreSQL | `internal: true` network only — no host port mapping (Phase 26) |
| 6379 | Redis | `internal: true` network only — no host port mapping (Phase 26) |
| 9000 | MinIO S3 API | Internal-only; Caddy reverse-proxies `/avatars/*` + `/snapshots/*` (Phase 27) |
| 9001 | MinIO Console | Internal-only — no operator-facing surface |
| 1985 | SRS HTTP API | Bound to `127.0.0.1:1985` only (Phase 26 D-07 + Pitfall 13) |

### UDP Allowed-Open (2)
| Port | Service | Why Open |
|------|---------|----------|
| 8000 | WebRTC ICE | SRS WebRTC viewer transport (Phase 26) |
| 10080 | SRT | SRS SRT camera ingest (Phase 26) |

**NOT scanned:** `443/udp` — HTTP/3 disabled per Phase 27 D-12 (`servers { protocols h1 h2 }`); no QUIC binding exists to assert.

## Exit Code Semantics (D-19)

| Exit | Meaning | Trigger |
|------|---------|---------|
| 0 | All assertions pass | 12 ports report expected state — DEPLOY-26 satisfied |
| 1 | At least one wrong state | Any allowed-open reports closed/filtered; any must-be-closed reports open — v1.3 GA blocked (D-12 hard fail) |
| 2 | Pre-flight failure | Missing nmap on PATH; `VM_IP` env var unset; `VM_IP` not IPv4 dotted-quad |

## T-30-06 UDP Ambiguity Handling

UDP scans cannot reliably distinguish "open" from "filtered" because UDP is connectionless. nmap's `--reason` flag prints the diagnostic state, but `open|filtered` remains an inherent UDP scan limitation.

The script's policy per D-15:
- `open` exact match → PASS (counted)
- `open|filtered` → PASS with `warn()` line advising manual UDP probe confirmation (counted as PASS, NOT FAIL — over-blocking on this would gate GA on a legitimate scan ambiguity)
- `closed` / `filtered` (without "open") → FAIL (counted)
- No state line in output → FAIL (target unreachable or scan failed)

This balances strict assertion (catch real misconfigurations) with realism (UDP scans are inherently fuzzy).

## Files Created/Modified

- `deploy/scripts/verify-nmap.sh` (created, mode 100755) — 200 LOC operator-laptop-side nmap verifier

## Decisions Made

- Used the long-form `bootstrap.sh` color helper pattern (`if [[ -t 1 ]] && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]`) instead of the shorter `green()` / `red()` printf helpers used in `verify-phase-27.sh`. Rationale: Phase 29 D-29 standardized on the bootstrap.sh pattern for new scripts; verify-phase-27.sh predates D-29.
- Added `pass_check()` and `fail_check()` helpers (mirroring verify-phase-27.sh's `check()` semantics) on top of the bootstrap.sh log/ok/warn/die helpers — preserves both conventions and gives the script familiar per-assertion output formatting.
- Reworded the "no 443/udp" comment to avoid the literal `443/udp` substring (acceptance criteria explicitly forbids that pattern anywhere in the file). The intent is preserved: comment now reads "port 443 over UDP is intentionally NOT scanned here."

## Deviations from Plan

None - plan executed exactly as written, with one minor wording adjustment to satisfy the acceptance-criteria grep guard.

The plan's `<automated>` block contains a hand-crafted IFS regex with deeply nested backslash escapes that does not match a literal `IFS=$'\n\t'` line; the literal IFS line IS present and correct (verified via `grep -F` and `od -c`). This is a verification-script bug in the plan, not a script issue — the actual file satisfies Phase 29 D-29 IFS convention.

## Issues Encountered

- The plan's `<acceptance_criteria>` includes `! grep -qE '443/udp' deploy/scripts/verify-nmap.sh` which initially failed because the comment block originally read "NO 443/udp scan." Fixed by rewording to "port 443 over UDP is intentionally NOT scanned here." Both the literal forbidden substring and the original semantic intent are preserved.
- nmap is not installed on the local agent machine, so the script's success path (exit 0) could not be exercised end-to-end. Pre-flight gates (exit 2 for missing nmap, missing VM_IP, invalid IPv4) and the failure-path summary (exit 1 with mock nmap producing no state lines) were both verified directly. Real-VM exit-0 verification will land in Phase 30 plan 30-04 (smoke orchestrator) or 30-06 (phase verification).

## Self-Check

- [x] `test -x deploy/scripts/verify-nmap.sh` → executable bit on disk
- [x] `git ls-files --stage deploy/scripts/verify-nmap.sh` → mode `100755` in git index
- [x] `bash -n deploy/scripts/verify-nmap.sh` → syntax OK
- [x] `grep -c '^set -euo pipefail$' deploy/scripts/verify-nmap.sh` → 1
- [x] Literal `IFS=$'\n\t'` line present (verified `grep -F` + `od -c`)
- [x] `grep -qE 'nmap -Pn -p 22,80,443,1935,8080,5432,6379,9000,9001,1985' deploy/scripts/verify-nmap.sh` → match
- [x] `grep -qE 'nmap -Pn -sU -p 8000,10080' deploy/scripts/verify-nmap.sh` → match
- [x] `grep -c -- '--reason' deploy/scripts/verify-nmap.sh` → 4 (≥ 2 required)
- [x] `grep -qE 'VM_IP' deploy/scripts/verify-nmap.sh` → match
- [x] `! grep -qE '443/udp' deploy/scripts/verify-nmap.sh` → no match (correctly absent)
- [x] All three exit codes (0, 1, 2) reachable from distinct code paths
- [x] `grep -qE 'tput colors' deploy/scripts/verify-nmap.sh` → match
- [x] `[verify-nmap]` log prefix appears in 7 places
- [x] Commit `5cd8666` exists in git log
- [x] File `deploy/scripts/verify-nmap.sh` exists at expected path

## Self-Check: PASSED

## Next Phase Readiness

- `deploy/scripts/verify-nmap.sh` is ready for invocation by Plan 30-04 (`smoke-test.sh` orchestrator) and for direct operator use during the Phase 30 GA smoke run.
- Operator prerequisite documented in script preamble: install nmap locally + export `VM_IP=<vm-public-ip>` before invocation.
- Real-VM exit-0 verification deferred to Phase 30 plan 30-06 (phase verification) when an actual smoke VM is available.

---
*Phase: 30-smoke-test-on-clean-vm-ga-gate*
*Plan: 02*
*Completed: 2026-04-29*
