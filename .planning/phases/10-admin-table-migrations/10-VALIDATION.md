---
phase: 10
slug: admin-table-migrations
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler (`tsc --noEmit`) |
| **Config file** | `apps/web/tsconfig.json`, `apps/api/tsconfig.json` |
| **Quick run command (web)** | `cd apps/web && npx tsc --noEmit 2>&1 \| head -30` |
| **Quick run command (api)** | `cd apps/api && npx tsc --noEmit 2>&1 \| head -30` |
| **Full suite command** | `cd apps/web && npx tsc --noEmit && cd ../api && npx tsc --noEmit` |
| **Estimated runtime** | ~15 seconds per app |

**Rationale:** This phase is a UI migration (old table components to DataTable). All plans use `tsc --noEmit` as the automated verification — it catches broken imports, missing props, type mismatches, and deleted-file references. Unit test stubs are not required because the migration does not introduce new business logic; it rewires existing data flows through the DataTable component API.

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && npx tsc --noEmit` (or `cd apps/api && npx tsc --noEmit` for backend tasks)
- **After every plan wave:** Run both `cd apps/web && npx tsc --noEmit && cd ../api && npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Both compilers must exit 0
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Automated Command | Status |
|---------|------|------|-------------|-------------------|--------|
| 10-01-T1 | 01 | 1 | ADMIN-03 | `cd apps/api && npx tsc --noEmit 2>&1 \| head -30` | pending |
| 10-01-T2 | 01 | 1 | ADMIN-03 | `cd apps/web && npx tsc --noEmit 2>&1 \| head -30` | pending |
| 10-02-T1 | 02 | 1 | ADMIN-01 | `cd apps/web && npx tsc --noEmit 2>&1 \| head -30` | pending |
| 10-02-T2 | 02 | 1 | ADMIN-02 | `cd apps/web && npx tsc --noEmit 2>&1 \| head -30` | pending |
| 10-03-T1 | 03 | 1 | ADMIN-04 | `cd apps/web && npx tsc --noEmit 2>&1 \| head -30` | pending |
| 10-03-T2 | 03 | 1 | HIER-03 | `cd apps/web && npx tsc --noEmit 2>&1 \| head -30` | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

No Wave 0 test stubs required. All tasks use `tsc --noEmit` as automated verification, which validates type correctness, import integrity, and deleted-file cleanup without requiring dedicated test files.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual consistency across all 5 tables | Success Criteria 4 | Visual comparison needed | Open each table page, verify same filter bar position, same pagination controls, same action menu behavior |
| Stream profiles layout change (cards to table) | HIER-03 | Visual layout verification | Navigate to stream profiles, confirm table layout replaces card grid |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands (`tsc --noEmit`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 resolved (no test stubs needed — tsc-based verification)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
