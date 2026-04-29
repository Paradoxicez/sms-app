# Phase 30 — Verification (v1.3 GA gate)

**Phase:** 30 (Smoke Test on Clean VM)
**Verifier:** _<verifier role / human reviewer>_
**Verified:** _<UTC date>_
**Status:** _PENDING / VERIFIED / FAILED_

## Inputs

The phase verifier consumes these:
1. `deploy/SMOKE-TEST-LOG.md` — operator-filled smoke run record
2. `deploy/smoke-evidence/<UTC>/` — operator-captured screenshots (gitignored; verifier reviews locally before scrub)
3. `deploy/scripts/smoke-test.sh` aggregated exit code — recorded in SMOKE-TEST-LOG "Run summary" section

## ROADMAP Success Criteria mapping

| ROADMAP SC | Verifier | Pass condition | Evidence in SMOKE-TEST-LOG | Result |
|-----------|----------|----------------|---------------------------|--------|
| SC#1 cold deploy <10 min wall-clock | verify-deploy.sh | exit 0 + ELAPSED<=600s | "Success Criteria results" SC#1 row | _PASS/FAIL_ |
| SC#2 E2E playback/record/WS | verify-playback.sh + manual D-14 | exit 0 + manual screenshot present | SC#2 row + ws-frame screenshot path | _PASS/FAIL_ |
| SC#3 nmap port lockdown | verify-nmap.sh (laptop) | exit 0 from operator's laptop | SC#3 row + nmap stdout pasted | _PASS/FAIL_ |
| SC#4 drift log captured | smoke-test.sh wrapper | log file populated; drift section accurate | "Drift" section row count | _PASS/DRIFT_ |

## Requirements satisfied

| ID | Description | Verifier | Result |
|----|-------------|----------|--------|
| DEPLOY-25 | Smoke test on clean Linux VM (full E2E) | verify-deploy + verify-playback + verify-backup | _PASS/FAIL_ |
| DEPLOY-26 | nmap port lockdown verified externally | verify-nmap.sh | _PASS/FAIL_ |

## Deferred UAT closures (D-13 mapping inheritance)

| UAT | Owner SC | Verifier | Result |
|-----|----------|----------|--------|
| Phase 27 SC#1 (LE cert + 308) | SC#1 | verify-deploy | _PASS/FAIL_ |
| Phase 27 SC#2 (wss upgrade) | SC#2 | verify-playback | _PASS/FAIL_ |
| Phase 27 SC#3 (cert persist) | SC#1 | verify-deploy | _PASS/FAIL_ |
| Phase 27 SC#4 (verify-phase-27 re-run) | SC#1 | verify-deploy | _PASS/FAIL_ |
| Phase 29 SC#1 (cold deploy timing) | SC#1 | verify-deploy | _PASS/FAIL_ |
| Phase 29 SC#2 (create-admin idempotent + --force) | SC#1 | verify-deploy | _PASS/FAIL_ |
| Phase 29 SC#3 (update.sh atomic recycle) | SC#1 | verify-deploy | _PASS/FAIL_ |
| Phase 29 SC#4 (backup/restore byte-equiv) | SC#4 | verify-backup | _PASS/FAIL_ |
| Phase 29 SC#5 (README quickstart) | SC#1 | smoke-test wrapper + manual | _PASS/FAIL/DRIFT_ |

## Drift backlog

If `deploy/SMOKE-TEST-LOG.md` Drift section has entries, mirror them into `.planning/todos/v1.3.1-drift-from-phase-30.md` (one entry per drift row). If no drift, leave this section empty.

| # | Docs ref | Actual | Action |
|---|----------|--------|--------|
| 1 | _<from SMOKE-TEST-LOG drift bullet>_ | _<actual behavior>_ | _<queued v1.3.1 / fixed inline / no-op>_ |

## GA verdict

> Phase 30 is the v1.3 GA gate. Verdict here determines milestone close.

**Verdict:** _GA APPROVED / RE-SMOKE REQUIRED / GA APPROVED WITH DRIFT_

**Justification:** _1-3 sentences citing the SC table above + smoke-test.sh aggregated exit code._

**Action on RE-SMOKE REQUIRED:** Fix the failed assertion → re-run `bash deploy/scripts/smoke-test.sh` → re-fill this file with new evidence. Do NOT mark phase complete until smoke exit 0.

---

*Verification template authored Phase 30 Plan 06.*
