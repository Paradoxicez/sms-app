---
phase: 8
slug: foundation-components
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + @testing-library/react |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/web && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/web && npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 0 | FOUND-01 | — | N/A | unit | `cd apps/web && npx vitest run src/__tests__/data-table.test.tsx -x` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | FOUND-01 | — | N/A | unit | `cd apps/web && npx vitest run src/__tests__/data-table.test.tsx -x` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 0 | FOUND-02 | — | N/A | unit | `cd apps/web && npx vitest run src/__tests__/date-picker.test.tsx -x` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 1 | FOUND-02 | — | N/A | unit | `cd apps/web && npx vitest run src/__tests__/date-picker.test.tsx -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/src/__tests__/data-table.test.tsx` — stubs for FOUND-01 (render, sorting, pagination, row selection, faceted filter)
- [ ] `apps/web/src/__tests__/date-picker.test.tsx` — stubs for FOUND-02 (DatePicker popover/select, DateRangePicker range select)

*Existing infrastructure covers test framework setup (Vitest + @testing-library/react already configured).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Popover positioning visually correct | FOUND-02 | CSS positioning + viewport edge cases not reliably testable in jsdom | Open DatePicker near page edge, verify popover doesn't clip |
| Pagination numbered buttons render correctly at edge cases | FOUND-01 | Visual layout with "..." truncation at >7 pages | Navigate to table with 100+ rows, verify pagination shows "1 2 3 ... 10" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
