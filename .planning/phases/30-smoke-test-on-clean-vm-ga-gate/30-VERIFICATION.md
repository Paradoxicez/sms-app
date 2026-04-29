---
phase: 30-smoke-test-on-clean-vm-ga-gate
verified: 2026-04-29T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
human_verification:
  - test: "Run `bash deploy/scripts/smoke-test.sh` end-to-end on a freshly-provisioned clean Linux VM (Ubuntu 22.04 LTS, 4 GB RAM, Docker pre-installed) with a real DNS-pointed domain"
    expected: "Wrapper exits 0 (or 2 with documented drift); SMOKE-TEST-LOG.md SC#1-#4 rows all PASS; manual UI checklist 1-7 ticked with screenshot evidence; longest /api/health outage during update.sh recycle ≤ 5s; backup/restore round-trip pre==post for 5 tables + 3 MinIO buckets + cert preserved"
    why_human: "Requires external infrastructure that does not exist in CI: clean cloud VM, real DNS A-record, ACME-issuable domain, RTSP camera source. Phase 30 ships the TOOLING; the GA-gate smoke run is operator/human work."
  - test: "Run `VM_IP=<vm-public-ip> bash deploy/scripts/verify-nmap.sh` from the operator's LAPTOP (not the VM)"
    expected: "Exit 0; PASS=12, FAIL=0; TCP 22/80/443/1935/8080 OPEN; TCP 5432/6379/9000/9001/1985 CLOSED/FILTERED; UDP 8000+10080 OPEN (or open|filtered with manual confirm)"
    why_human: "Cannot scan a VM that does not yet exist. Must run from a separate machine across the public Internet to validate the firewall+Docker port topology actually hides internal services. DEPLOY-26 closure depends on this."
  - test: "Operator manual UI checklist (D-14 steps 1-7): super-admin login → register RTSP camera → 10s HLS playback → 60s record → DevTools WebSocket frame screenshot → external feed cutoff → README.md Quickstart follow-along"
    expected: "All 7 steps complete; ws-frame.png saved under deploy/smoke-evidence/<UTC-stamp>/; any docs-vs-reality drift noted in SMOKE-TEST-LOG.md Drift section"
    why_human: "Visual UI behavior, real-time WebSocket frame inspection, README usability — all require a human at the screen, not a verifier script."
deferred: []
gaps: []
---

# Phase 30: Smoke Test on Clean VM (v1.3 GA gate) — Verification Report

**Phase Goal:** Produce the v1.3 GA smoke-test artifact set — operator-fillable log template + four VM-side verifier scripts (verify-deploy.sh, verify-playback.sh, verify-backup.sh) + laptop-side port scanner (verify-nmap.sh) + sequential wrapper (smoke-test.sh) + 30-VERIFICATION.md template + .gitignore for evidence folder. Static authorship — the actual smoke run happens later when an operator points the wrapper at a clean VM.

**Verified:** 2026-04-29
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Phase 30 is the **GA-gate ENABLER**, not the GA gate itself. It ships the tooling (6 scripts + 1 markdown template + 1 verification template + 1 gitignore patch) needed to run the actual smoke test on external infrastructure. All 6 deliverable artifacts exist, are executable (or 0644 for the template), pass `bash -n` syntax checks, satisfy every plan-defined acceptance grep, and the wrapper sequences the verifiers correctly. Goal achievement is **complete for the authorship phase**; the operator-driven smoke run remains as human verification.

### Observable Truths (Plan must_haves consolidated)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator-fillable Markdown log template (`deploy/SMOKE-TEST-LOG.md`) with 7 H2 sections, 4 SC rows, 9 deferred-UAT rows, 7 manual checklist items, redaction notice, drift section, timing log | VERIFIED | All 7 H2 anchors present (`Run metadata`, `Success Criteria results`, `Deferred UAT cross-reference`, `Manual UI checklist`, `Drift`, `Timing log`, `GA verdict`); `grep -c '^\| Phase 2[79] SC#' = 9`; `grep -c '^- \[ \] [1-7]\.' = 7`; ADMIN_PASSWORD/RTSP_TEST_URL/VM_IP all in redaction notice; mode 0644 |
| 2 | Laptop-side external port-lockdown verifier (`deploy/scripts/verify-nmap.sh`) — TCP-scans 10 ports + UDP-scans 2 ports against `${VM_IP}`, asserts open/closed contract | VERIFIED | mode 100755; `bash -n` OK; TCP scan grep `nmap -Pn -p 22,80,443,1935,8080,5432,6379,9000,9001,1985` present; UDP scan grep `nmap -Pn -sU -p 8000,10080` present; `--reason` flag count=4 (>=2); pre-flight rejects missing nmap/VM_IP/invalid IPv4 with exit 2; no `443/udp` (HTTP/3 disabled per Phase 27 D-12); UDP `open\|filtered` ambiguity handled with PASS-with-caveat per D-15 |
| 3 | VM-side cold-deploy verifier (`deploy/scripts/verify-deploy.sh`) — bootstrap timing + HTTPS reachability + cert persistence + verify-phase-27.sh re-run + create-admin idempotent + update.sh atomic recycle | VERIFIED | mode 100755; `bash -n` OK; all 7 step labels [1/7]…[7/7] present; parses `Bootstrap time:` line and asserts ≤600s; counts `certificate obtained` post-restart and asserts =0 (T-30-04 mitigated: uses `${DC} down` WITHOUT -v); invokes `bash "${SCRIPT_DIR}/verify-phase-27.sh"` (line 204); tests `create-admin --force` preserves user.id via psql; backgrounded probe loop (`probe_pid`) + `longest_outage ≤ 5s` (D-15 grace); SMOKE-TEST-LOG append guarded by `if [[ -f "${LOG_FILE}" ]]` |
| 4 | VM-side playback verifier (`deploy/scripts/verify-playback.sh`) — wss:// upgrade through Caddy + HLS m3u8 reachability + MinIO `.ts` archive | VERIFIED | mode 100755; `bash -n` OK; all 4 step labels [1/4]…[4/4] present; `Upgrade: websocket` + `Sec-WebSocket-Key` headers + `openssl rand -base64 16` per RFC 6455; asserts `HTTP/1.1 101 Switching Protocols`; `mc ls --recursive local/recordings/` invocation; asserts ≥1 `.ts` AND 0 `.mp4` (Phase 23 D-03 + SRS v6 lock); no hardcoded `rtsp://` credentials (T-30-03 mitigated); MinIO password suppressed via `>/dev/null 2>&1` (T-30-10 mitigated) |
| 5 | VM-side backup/restore round-trip verifier (`deploy/scripts/verify-backup.sh`) — pre/post SELECT count for 5 Prisma tables + sha256-of-sorted-listing for 3 MinIO buckets + cert preservation | VERIFIED | mode 100755; `bash -n` OK; all 6 step labels [1/6]…[6/6] present; `pg_count` helper for User/Organization/Member/Camera/Recording; invokes `bash backup.sh` then `bash restore.sh "${ARCHIVE_PATH}" --yes`; PRE_COUNTS + POST_COUNTS associative arrays; mc_digest helper sha256s sorted bucket listing; PRE_/POST_ AVATARS/RECORDINGS/SNAPSHOTS variables (10 occurrences); tar -tzf archive shape check (postgres.dump + minio/ + caddy_data.tar.gz per Phase 29 D-17); cert preservation via `--since=2m caddy logs grep -c 'certificate obtained' = 0` |
| 6 | Sequential wrapper (`deploy/scripts/smoke-test.sh`) + 30-VERIFICATION.md template + `.gitignore` evidence-folder patch | VERIFIED | smoke-test.sh: mode 100755, `bash -n` OK, 4 step labels [1/4]…[4/4], pre-flight loop checks all 4 verifiers exist + executable, MAX_RC aggregator with `record_rc` helper, `case "${MAX_RC}" in 0)/1)/2)`, `read -r _` manual gate (no -p flag for macOS bash 3.x compat per plan), D-14 reference present, run header appended via `>> "${LOG_FILE}"` with hostname/docker/compose/domain/ACME_CA/IMAGE_TAG/EVIDENCE_DIR fields, verify-nmap reminder is INFORMATIONAL only (no `bash deploy/scripts/verify-nmap.sh` invocation, only printed inside `log` line). 30-VERIFICATION.md template existed with 6 H2 sections + 4 SC + 2 REQ + 9 UAT rows + GA verdict (now overwritten by this report). `.gitignore` line 46: `deploy/smoke-evidence/` present; pre-existing entries (node_modules, .env, dist, .claude, etc.) preserved. |

**Score:** 6/6 truths verified (all six plan-defined deliverables ship correct, complete, and wired)

### Required Artifacts

| # | Artifact | Expected | Status | Details |
|---|----------|----------|--------|---------|
| 1 | `deploy/SMOKE-TEST-LOG.md` | Markdown template, mode 0644, 7 H2 sections, 4 SC + 9 UAT + 7 checklist rows | VERIFIED | All structural greps pass; mode 0644 confirmed via `stat -f '%Lp'`; redaction notice covers ADMIN_PASSWORD + RTSP_TEST_URL + VM_IP + LE cert serials |
| 2 | `deploy/scripts/verify-nmap.sh` | bash, mode 0755, ≥100 LOC | VERIFIED | 200 LOC; mode 100755 (git-staged); bash -n OK; matches Plan 02 anatomy verbatim |
| 3 | `deploy/scripts/verify-deploy.sh` | bash, mode 0755, ≥200 LOC, 7 steps | VERIFIED | 378 LOC; mode 100755; bash -n OK; all 7 named step functions called from main execution block (lines 371-377) |
| 4 | `deploy/scripts/verify-playback.sh` | bash, mode 0755, ≥130 LOC, 4 steps | VERIFIED | 228 LOC; mode 100755; bash -n OK; wss + HLS + .ts + 0-mp4 contract enforced |
| 5 | `deploy/scripts/verify-backup.sh` | bash, mode 0755, ≥200 LOC, 6 steps | VERIFIED | 345 LOC; mode 100755; bash -n OK; 5-table SELECT count + 3-bucket sha256 + cert preservation all asserted |
| 6 | `deploy/scripts/smoke-test.sh` | bash, mode 0755, ≥130 LOC, sequential wrapper | VERIFIED | 229 LOC; mode 100755; bash -n OK; pre-flight verifier-existence loop; max-RC aggregation; manual gate between deploy and playback; nmap reminder INFORMATIONAL only |
| 7 | `.planning/phases/30-smoke-test-on-clean-vm-ga-gate/30-VERIFICATION.md` | Verification template (now actual report) | VERIFIED | Template authored by Plan 06 had 6 H2 sections + 4 SC + 2 REQ + 9 UAT + GA verdict; this verification overwrites template with actual findings per task instructions |
| 8 | `.gitignore` patch for `deploy/smoke-evidence/` | Append line, preserve existing entries | VERIFIED | Line 46: `deploy/smoke-evidence/`; lines 1-45 untouched (node_modules, .env, dist, .claude, etc. all preserved) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| smoke-test.sh | verify-deploy.sh | `run_step "1/4" verify-deploy "${SCRIPT_DIR}/verify-deploy.sh"` (line 133) | WIRED | Direct bash invocation; rc captured into MAX_RC |
| smoke-test.sh | verify-playback.sh | `run_step "2/4" verify-playback "${SCRIPT_DIR}/verify-playback.sh"` (line 161) | WIRED | Direct bash invocation after manual gate |
| smoke-test.sh | verify-backup.sh | `run_step "3/4" verify-backup "${SCRIPT_DIR}/verify-backup.sh"` (line 167) | WIRED | Skippable via `SKIP_BACKUP=1`; rc captured |
| smoke-test.sh | verify-nmap.sh | `log "  bash deploy/scripts/verify-nmap.sh"` (line 180) — REMINDER ONLY | WIRED-AS-DESIGNED | Plan 06 explicitly requires INFORMATIONAL reference; nmap runs from operator's laptop, exit code folded in manually per SMOKE-TEST-LOG SC#3 row |
| verify-deploy.sh | bootstrap.sh | `bash "${SCRIPT_DIR}/bootstrap.sh"` (line 105) | WIRED | Tee'd to mktemp log; ELAPSED parsed via `grep -oE 'Bootstrap time: +[0-9]+s'` |
| verify-deploy.sh | update.sh | `bash "${SCRIPT_DIR}/update.sh" "${IMAGE_TAG:-latest}"` (line 295) | WIRED | Wrapped in `set +e ... set -e` so rc capture works under set -e |
| verify-deploy.sh | verify-phase-27.sh | `bash "${SCRIPT_DIR}/verify-phase-27.sh"` (line 204) | WIRED | Phase 27 SC#4 closure via re-run |
| verify-backup.sh | backup.sh | `bash "${SCRIPT_DIR}/backup.sh" 2>&1 \| tee "${BACKUP_LOG}"` (line 174) | WIRED | Archive path extracted from `Archive:` log line |
| verify-backup.sh | restore.sh | `bash "${SCRIPT_DIR}/restore.sh" "${ARCHIVE_PATH}" --yes` (line 218) | WIRED | --yes flag skips interactive prompt |
| All verifiers | SMOKE-TEST-LOG.md | Best-effort `printf '<!-- ... -->' >> "${LOG_FILE}"` | WIRED | Guarded by `if [[ -f "${LOG_FILE}" ]]`; missing log does NOT fail the verifier |
| smoke-test.sh | SMOKE-TEST-LOG.md | Run header `>> "${LOG_FILE}"` (lines 82-99) | WIRED | New `## Run started <UTC>` section appended each invocation |
| 30-VERIFICATION.md | SMOKE-TEST-LOG.md | Inline path reference (Inputs section) | WIRED-AS-DESIGNED | Template documents the cross-reference; verifier role pulls evidence at smoke-run time |

### Data-Flow Trace (Level 4)

Phase 30 deliverables are **static authorship** (shell scripts and Markdown templates). They do not render dynamic data — they EXECUTE behaviors when invoked by an operator on external infrastructure. Level 4 data-flow trace is therefore N/A for this phase. The "data" produced by these scripts (verifier exit codes, SMOKE-TEST-LOG rows, MinIO digests) is generated at smoke-run time, not at authorship time.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 5 shell scripts pass `bash -n` syntax check | `for f in deploy/scripts/{verify-nmap,verify-deploy,verify-playback,verify-backup,smoke-test}.sh; do bash -n "$f"; done` | All 5 OK | PASS |
| All 5 shell scripts have git-staged mode 100755 | `git ls-files --stage deploy/scripts/{...}.sh` | All 5 = 100755 | PASS |
| SMOKE-TEST-LOG.md mode 0644 | `stat -f '%Lp' deploy/SMOKE-TEST-LOG.md` | 644 | PASS |
| `.gitignore` includes `deploy/smoke-evidence/` | `grep -qE '^deploy/smoke-evidence/$' .gitignore` | Match | PASS |
| smoke-test.sh pre-flight checks all 4 verifiers exist+executable | grep `for v in verify-deploy.sh verify-playback.sh verify-backup.sh verify-nmap.sh` | Match (line 67) | PASS |
| verify-deploy.sh actually invokes verify-phase-27.sh (not just docs) | `grep -nE 'bash.*verify-phase-27\.sh' deploy/scripts/verify-deploy.sh` | Match (line 204) | PASS |
| smoke-test.sh does NOT actually invoke verify-nmap (reminder only) | `grep -E 'bash.*verify-nmap\.sh' deploy/scripts/smoke-test.sh` | Only inside `log "  bash deploy/scripts/verify-nmap.sh"` (printed reminder) | PASS |
| Live execution of verifiers | (cannot run — requires Docker stack + real domain + RTSP source) | N/A | SKIP — routed to human verification |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| DEPLOY-25 | 30-01, 30-03, 30-04, 30-05, 30-06 | Smoke test on clean Linux VM (full E2E ≤10 min from fresh provision: HTTPS + login + camera register + RTSP→HLS + recording + WebSocket) | SATISFIED (tooling) — NEEDS HUMAN (run) | All 5 supporting artifacts (SMOKE-TEST-LOG.md template + verify-deploy.sh + verify-playback.sh + verify-backup.sh + smoke-test.sh wrapper) ship correct and complete. Actual ≤10-min wall-clock + E2E flow proof requires operator smoke run on a clean VM. |
| DEPLOY-26 | 30-02, 30-06 | Port lockdown verified externally via nmap (TCP 22/80/443/1935/8080 + UDP 8000/10080 open; TCP 5432/6379/9000/9001/1985 closed) | SATISFIED (tooling) — NEEDS HUMAN (run) | verify-nmap.sh asserts the exact 10 TCP + 2 UDP contract; pre-flight gates exit 2 for missing nmap/VM_IP/invalid IPv4. Actual external scan against a deployed VM requires laptop-side execution per D-15. |

Both requirements are **traceable** to specific delivered artifacts; neither is ORPHANED. Per the verification task framing, this phase is the GA-gate ENABLER — full satisfaction (PASS in the closure-of-DEPLOY-25/-26 sense) requires the operator-driven smoke run on real infrastructure.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TODO/FIXME/PLACEHOLDER comments in any Phase 30 deliverable | — | Clean |
| (none) | — | No hardcoded credentials, RTSP URLs, or VM IPs | — | Clean (T-30-01/T-30-03/T-30-08 mitigations enforced) |
| (none) | — | No empty implementations (`return null`, `=> {}`) — these are bash scripts with full logic | — | Clean |
| (none) | — | No `${DC} down -v` in verify-deploy.sh (T-30-04 enforcement) | — | Clean — verified via `! grep -qE '\${DC} down -v'` |
| (none) | — | No `443/udp` in verify-nmap.sh (HTTP/3 correctly excluded per Phase 27 D-12) | — | Clean |

The italicized `_<placeholder>_` markers in SMOKE-TEST-LOG.md are intentional operator-fill spots per Plan 01 D-11 — they are NOT stubs; they are the contract for `tee -a` operations from downstream verifiers. Similarly, the placeholder rows in 30-VERIFICATION.md (now overwritten by this report) were the verifier-fill template per Plan 06.

### Human Verification Required

Phase 30 ships the smoke-test TOOLING. The smoke-test RUN remains operator/human work because it requires external infrastructure that does not exist in CI:

#### 1. End-to-end smoke run on a clean VM

**Test:** Provision a fresh DigitalOcean or Hetzner droplet (Ubuntu 22.04 LTS, 4 GB RAM, Docker pre-installed). Sparse-checkout the `deploy/` directory, fill `.env`, set DNS A-record to the droplet's public IP, then run `bash deploy/scripts/smoke-test.sh`.
**Expected:**
- Wrapper prints `[1/4]` through `[4/4]` step labels
- Pauses at the manual gate after `[1/4] verify-deploy.sh` returns 0; operator completes D-14 UI checklist (login, register camera, play HLS, record 60s, capture DevTools WS frame screenshot, stop feed, README follow-along)
- `[2/4] verify-playback.sh` exits 0 (wss 101 + ≥1 HLS m3u8 + ≥1 `.ts` archive + 0 `.mp4`)
- `[3/4] verify-backup.sh` exits 0 (pre==post for 5 tables + 3 MinIO buckets + cert preserved)
- `[4/4]` prints reminder to run verify-nmap from laptop
- Wrapper exits 0 (or 2 with documented drift in SMOKE-TEST-LOG Drift section)
- SMOKE-TEST-LOG.md SC#1, #2, #4 rows all populated PASS
**Why human:** Requires real cloud VM, real DNS, ACME-issuable domain, RTSP camera source. The smoke run is the GA-gate decision point — humans must confirm the deployed UX, not just verifier exit codes.

#### 2. External port-lockdown scan from operator laptop

**Test:** From the operator's laptop (NOT the VM): `export VM_IP=<vm-public-ip>; bash deploy/scripts/verify-nmap.sh`
**Expected:**
- Exit 0; PASS=12, FAIL=0
- TCP 22/80/443/1935/8080 reported OPEN (with `--reason` annotations)
- TCP 5432/6379/9000/9001/1985 reported CLOSED or FILTERED
- UDP 8000+10080 reported open or open|filtered (latter accepted with manual-confirm caveat per D-15)
- nmap stdout pasted into SMOKE-TEST-LOG.md SC#3 row
**Why human:** The verifier must run from a different machine across the public Internet — only that path validates the firewall+Docker port topology actually hides internal services. DEPLOY-26 closure depends on this external observation.

#### 3. Manual UI checklist + DevTools WebSocket frame inspection (D-14 steps 1-7)

**Test:** During the smoke run, complete each of the 7 manual UI steps in SMOKE-TEST-LOG.md. Capture screenshots into `deploy/smoke-evidence/<UTC-stamp>/`. Tick each checkbox + paste the screenshot path inline.
**Expected:** All 7 steps tick; ws-frame.png exists; any docs-vs-reality drift queued in the Drift section + mirrored to `.planning/todos/v1.3.1-drift-from-phase-30.md`
**Why human:** Visual UI behavior, real-time WebSocket frame contents, README usability. Verifier scripts cannot judge "does this look right?" or "does the README's Quickstart actually onboard a new operator without confusion?"

### Gaps Summary

**No gaps in the authorship deliverables.** All 6 plan must-haves verified, all 7+ artifacts exist with correct mode/syntax/content, all key links wired (verify-* scripts invoked from smoke-test.sh + child scripts like bootstrap/update/restore properly chained from verifiers + SMOKE-TEST-LOG best-effort tee guarded), no anti-patterns detected, both requirements (DEPLOY-25, DEPLOY-26) traceable to delivered scripts.

The phase is a **GA-gate ENABLER**: it ships the tooling. Full closure of DEPLOY-25 and DEPLOY-26 requires the operator to run that tooling against a real clean VM with real DNS and a real RTSP source — items routed to **human_verification** above. Per the task framing ("Do not mark gaps for 'smoke run not executed' — that is the operator's job after this phase ships"), this is not a gap; it is the next-step handoff.

---

*Verified: 2026-04-29*
*Verifier: Claude (gsd-verifier)*
*Original template authored Phase 30 Plan 06 — overwritten by this verification report per audit task.*
