---
phase: 13
slug: hierarchy-map
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/web && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/web && npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | HIER-01 | — | N/A | unit | `cd apps/web && npx vitest run` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | HIER-02 | — | N/A | unit | `cd apps/web && npx vitest run` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 2 | MAP-01 | — | N/A | unit | `cd apps/web && npx vitest run` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 2 | MAP-02 | — | N/A | unit | `cd apps/web && npx vitest run` | ❌ W0 | ⬜ pending |
| 13-02-03 | 02 | 2 | MAP-03 | — | N/A | unit | `cd apps/web && npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tree viewer displays hierarchy with correct icons and counts | HIER-01 | Visual layout verification | Open Projects page, verify tree shows Project > Site > Camera with correct icons |
| Split panel resizing works smoothly | HIER-01 | Interaction/visual | Drag the divider between tree and table, verify min/max constraints |
| Tree selection updates DataTable content | HIER-02 | Integration behavior | Click project node, verify sites table appears; click site, verify cameras table |
| Map tree filter zooms to selected cameras | MAP-01 | Map interaction | Select a site in map tree, verify map zooms to show only that site's cameras |
| Drag-drop marker placement mode | MAP-02 | Map interaction | Click "Set Location", verify crosshair cursor, click to place, confirm/cancel |
| Map popup shows preview and status | MAP-03 | Visual/streaming | Click marker, verify popup shows HLS preview, status badge, viewer count |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
