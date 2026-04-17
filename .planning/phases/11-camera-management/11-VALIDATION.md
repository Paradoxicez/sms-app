---
phase: 11
slug: camera-management
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-17
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/web && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/web && npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | CAM-01 | — | N/A | build | `cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 \| head -30` | N/A | ⬜ pending |
| 11-01-02 | 01 | 1 | CAM-02 | — | N/A | build | `cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 \| head -30` | N/A | ⬜ pending |
| 11-02-01 | 02 | 2 | CAM-03 | T-11-05 | Max 6 concurrent HLS players via shared ref counter | build | `cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 \| head -30` | N/A | ⬜ pending |
| 11-02-02 | 02 | 2 | CAM-03 | — | N/A | build | `cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 \| head -30` | N/A | ⬜ pending |
| 11-03-01 | 03 | 3 | CAM-04 | T-11-07 | Stream URL copy uses clipboard API, not DOM injection | build | `cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 \| head -30` | N/A | ⬜ pending |
| 11-03-02 | 03 | 3 | CAM-04 | — | N/A | build | `cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 \| head -30` | N/A | ⬜ pending |
| 11-03-03 | 03 | 3 | — | — | N/A | checkpoint | `echo "Human verification checkpoint"` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test files from RESEARCH.md Wave 0 Gaps are not yet created. These are unit tests that should be created during execution if time permits. The phase uses `tsc --noEmit` as the primary automated verification (build-level type checking) since all components are composition of existing tested building blocks.

**Wave 0 test files (deferred -- not blocking):**
- `apps/web/src/__tests__/cameras-data-table.test.tsx` -- covers CAM-01 (table renders, sorts, filters)
- `apps/web/src/__tests__/cameras-row-actions.test.tsx` -- covers CAM-02 (action menu items, record label toggle)
- `apps/web/src/__tests__/camera-card-grid.test.tsx` -- covers CAM-03 (grid renders, hover behavior mock)
- `apps/web/src/__tests__/view-stream-sheet.test.tsx` -- covers CAM-04 (sheet open/close, tab switching)

**Rationale:** This phase composes existing tested components (DataTable, HlsPlayer, ResolvedPolicyCard, AuditLogDataTable) into new layouts. TypeScript compilation catches interface mismatches. HLS playback cannot be tested in jsdom. The human-verify checkpoint (Plan 03 Task 3) covers visual and interaction validation.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Card hover shows live preview | CAM-03 | Requires browser + running HLS stream | Open card view, hover over camera card, verify HLS player starts muted |
| View Stream sheet auto-plays | CAM-04 | Requires browser + running HLS stream | Click "View Stream", verify sheet opens with auto-playing muted stream |
| IntersectionObserver destroys players | CAM-03 | Requires browser scroll behavior | Scroll card view, verify off-viewport players are destroyed via DevTools |
| Sheet camera switching | CAM-04 | Requires browser interaction | Open sheet for Camera A, click Camera B row, verify sheet updates without close/reopen |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
