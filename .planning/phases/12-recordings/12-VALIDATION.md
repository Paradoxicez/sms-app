---
phase: 12
slug: recordings
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
updated: 2026-04-17
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/api && npx vitest run tests/recordings/ -x` |
| **Full suite command** | `cd apps/api && npx vitest run --reporter=verbose && cd ../web && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && npx vitest run tests/recordings/ -x`
- **After every plan wave:** Run `cd apps/api && npx vitest run --reporter=verbose && cd ../web && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | REC-01 | T-12-01 | Cross-tenant isolation via orgId scoping | integration | `cd apps/api && npx vitest run tests/recordings/cross-camera-list.test.ts -x` | ✅ | ✅ green |
| 12-01-02 | 01 | 1 | REC-02 | — | N/A | integration | `cd apps/api && npx vitest run tests/recordings/cross-camera-list.test.ts -x` | ✅ | ✅ green |
| 12-01-03 | 01 | 1 | REC-03 | T-12-03 | Bulk delete checks org ownership per recording | integration | `cd apps/api && npx vitest run tests/recordings/bulk-delete.test.ts -x` | ✅ | ✅ green |
| 12-01-04 | 01 | 1 | REC-04 | T-12-04 | Presigned URL scoped to org + 4h expiry | integration | `cd apps/api && npx vitest run tests/recordings/download.test.ts -x` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `apps/api/tests/recordings/cross-camera-list.test.ts` — 9 tests (REC-01, REC-02)
- [x] `apps/api/tests/recordings/bulk-delete.test.ts` — 4 tests (REC-03)
- [x] `apps/api/tests/recordings/download.test.ts` — 4 tests (REC-04)

*All 17 tests passing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DataTable filter UI renders correctly | REC-02 | Visual layout verification | Open /app/recordings, apply each filter type, verify chips and results update |
| Bulk delete confirmation dialog | REC-03 | UI interaction flow | Select 3+ recordings, click Delete Selected, verify dialog shows count, confirm delete |
| Download triggers browser save dialog | REC-04 | Browser download behavior | Click download on a recording row, verify file download starts |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-04-17

---

## Validation Audit 2026-04-17

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Tests passing | 17/17 |
