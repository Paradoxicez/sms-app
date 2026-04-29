---
status: partial
phase: 30-smoke-test-on-clean-vm-ga-gate
source: [30-VERIFICATION.md]
started: 2026-04-29T00:00:00Z
updated: 2026-04-29T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. End-to-end smoke run on a clean cloud VM
expected: Run `bash deploy/scripts/smoke-test.sh` end-to-end on a freshly-provisioned Linux VM (Ubuntu 22.04 LTS, 4 GB RAM, Docker pre-installed) with a real DNS-pointed domain. Wrapper exits 0 (or 2 with documented drift); SMOKE-TEST-LOG.md SC#1-#4 rows all PASS; manual UI checklist 1-7 ticked with screenshot evidence; longest /api/health outage during update.sh recycle ≤ 5s; backup/restore round-trip pre==post for 5 tables + 3 MinIO buckets + cert preserved.
result: [pending]

### 2. External port-scan from operator's laptop
expected: Run `VM_IP=<vm-public-ip> bash deploy/scripts/verify-nmap.sh` from the operator's LAPTOP (not the VM). Exit 0; PASS=12, FAIL=0; TCP 22/80/443/1935/8080 OPEN; TCP 5432/6379/9000/9001/1985 CLOSED/FILTERED; UDP 8000+10080 OPEN (or open|filtered with manual confirm). Required for DEPLOY-26 closure.
result: [pending]

### 3. Manual UI checklist (D-14 steps 1-7)
expected: super-admin login → register RTSP camera → 10s HLS playback → 60s record → DevTools WebSocket frame screenshot → external feed cutoff → README.md Quickstart follow-along. All 7 steps complete; ws-frame.png saved under deploy/smoke-evidence/<UTC-stamp>/; any docs-vs-reality drift noted in SMOKE-TEST-LOG.md Drift section.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
