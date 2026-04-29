---
status: partial
phase: 30-smoke-test-on-clean-vm-ga-gate
source: [30-VERIFICATION.md]
started: 2026-04-29T00:00:00Z
updated: 2026-04-29T13:00:00Z
---

## Current Test

[testing paused — UI checklist steps 4 (record) + 6 (offline detection) not exercised; tracked as partial]

## Tests

### 1. End-to-end smoke run on a clean cloud VM
expected: Run `bash deploy/scripts/smoke-test.sh` end-to-end on a freshly-provisioned Linux VM (Ubuntu 22.04 LTS, 4 GB RAM, Docker pre-installed) with a real DNS-pointed domain. Wrapper exits 0 (or 2 with documented drift); SMOKE-TEST-LOG.md SC#1-#4 rows all PASS; manual UI checklist 1-7 ticked with screenshot evidence; longest /api/health outage during update.sh recycle ≤ 5s; backup/restore round-trip pre==post for 5 tables + 3 MinIO buckets + cert preserved.
result: issue
reported: |
  Smoke ran end-to-end with significant drift: 18 wiring bugs surfaced + fixed inline.
  bootstrap.sh ELAPSED=161s after fixes (well under 600s budget). HLS playback verified
  end-to-end via curl (.ts segment 454 KB video/MP2T) + browser embed page. update.sh
  + backup-restore not exercised this run (no patch tag built; no real tenant data).
  All 18 fixes shipped on main (commits 6f7b323..d74b9a4); SMOKE-TEST-LOG.md Drift
  section enumerates each one with phase-owner attribution.
severity: minor

### 2. External port-scan from operator's laptop
expected: Run `VM_IP=<vm-public-ip> bash deploy/scripts/verify-nmap.sh` from the operator's LAPTOP (not the VM). Exit 0; PASS=12, FAIL=0; TCP 22/80/443/1935/8080 OPEN; TCP 5432/6379/9000/9001/1985 CLOSED/FILTERED; UDP 8000+10080 OPEN (or open|filtered with manual confirm). Required for DEPLOY-26 closure.
result: issue
reported: |
  TCP 10/10 perfect — security-critical assertions all pass: 22/80/443/1935/8080 OPEN
  externally; 5432/6379/9000/9001/1985 CLOSED/FILTERED. UDP scan needed sudo for raw
  sockets — sudo follow-up showed UDP 8000 + 10080 CLOSED (port-unreach ICMP) despite
  compose port mapping. SRS WebRTC/SRT listeners likely not bound or cloud firewall
  filtering UDP. RTMP push works fine; WebRTC + SRT not used by current tenant. Drift
  #19 in deploy/SMOKE-TEST-LOG.md — defer SRS UDP investigation to v1.3.x before any
  WebRTC enablement.
severity: minor

### 3. Manual UI checklist (D-14 steps 1-7)
expected: super-admin login → register RTSP camera → 10s HLS playback → 60s record → DevTools WebSocket frame screenshot → external feed cutoff → README.md Quickstart follow-along. All 7 steps complete; ws-frame.png saved under deploy/smoke-evidence/<UTC-stamp>/; any docs-vs-reality drift noted in SMOKE-TEST-LOG.md Drift section.
result: issue
reported: |
  Steps 1, 2, 3, 5, 7 done. Step 4 (Toggle Record 60s) and Step 6 (stop external RTSP
  feed → confirm offline detection within 30s) not exercised — both require operator
  follow-up. Steps 1-3 + 5 + 7 evidence captured in deploy/SMOKE-TEST-LOG.md Manual UI
  Checklist section. Drift entries #1-#20 capture every docs-vs-reality mismatch.
severity: minor

## Summary

total: 3
passed: 0
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Phase 30 smoke wrapper exits 0/2 with documented drift; all SC PASS"
  status: failed
  reason: "Smoke succeeded with drift — 18 wiring fixes shipped inline + 2 deferred items (UDP listeners, README DNS warning); update.sh and backup-restore round-trip not exercised this run"
  severity: minor
  test: 1
  root_cause: "Phase 24-29 verifiers were static-contract only; first real-VM execution surfaced env-var name mismatches + missing prisma engines + Caddy route gaps + ACME default fallback bug + Throttler pool too tight"
  artifacts:
    - path: "deploy/SMOKE-TEST-LOG.md"
      issue: "Drift entries #1-#20 with per-phase attribution"
  missing:
    - "v1.3.x: enable SRS WebRTC/SRT UDP listeners + investigate cloud-provider UDP firewall (drift #19)"
    - "v1.3.x: add DNS-propagation warning to deploy/README.md Quickstart (drift #20)"
    - "v1.3.x: exercise update.sh atomic recycle once first patch tag is cut"
    - "v1.3.x: exercise backup.sh + restore.sh round-trip once tenant data exists"
    - "v1.4: replace Phase 24-29 static verifiers with live-runtime smoke gates so wiring bugs surface in CI not in smoke"
  debug_session: "deploy/SMOKE-TEST-LOG.md (no separate debug doc — fixes shipped on main directly)"

- truth: "verify-nmap.sh PASS=12 FAIL=0; UDP 8000+10080 reachable externally"
  status: failed
  reason: "TCP 10/10 perfect; UDP 8000 (WebRTC) + UDP 10080 (SRT) closed (port-unreach) despite compose port mapping"
  severity: minor
  test: 2
  root_cause: "SRS process not binding UDP listeners on the mapped ports (or cloud-provider firewall filtering UDP at network level — needs follow-up investigation)"
  artifacts:
    - path: "deploy/docker-compose.yml"
      issue: "Lines 121-122 map 8000:8000/udp + 10080:10080/udp but external scan returns port-unreach ICMP"
  missing:
    - "Inspect SRS srs.conf rtc/srt sections — confirm listener block is present and bound to 0.0.0.0"
    - "Check cloud-provider (Hetzner) firewall UDP rules — they may filter UDP by default"
  debug_session: "deferred to v1.3.x"

- truth: "Manual UI checklist all 7 steps complete with evidence"
  status: failed
  reason: "Steps 4 (Toggle Record) and 6 (offline detection demo) not exercised this session"
  severity: minor
  test: 3
  root_cause: "Operator paused after primary playback chain verified; record + offline-detection deferred to next session"
  artifacts: []
  missing:
    - "Toggle Record on a LIVE camera, wait 60s, toggle off, confirm row appears in /admin/recordings + .ts archive in MinIO recordings bucket"
    - "Stop external RTSP feed (or detach push encoder) and confirm UI status pill flips live → offline within 30s per Phase 15 resilience design"
  debug_session: ""
