---
phase: 18
slug: dashboard-map-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (frontend) + jest 30.x (backend NestJS) |
| **Config file** | `apps/web/vitest.config.ts`, `apps/api/jest.config.ts` |
| **Quick run command** | `pnpm --filter web test -- --run <file>` / `pnpm --filter api test -- <file>` |
| **Full suite command** | `pnpm test` (root — runs all workspaces) |
| **Estimated runtime** | ~60-120 seconds for full suite |

---

## Sampling Rate

- **After every task commit:** Run targeted `{quick run command}` for modified test file
- **After every plan wave:** Run full workspace suite for affected side (`pnpm --filter web test` or `pnpm --filter api test`)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

> Populated during planning. Planner fills this table using RESEARCH.md §Validation Architecture.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-XX-XX | XX | N | UI-05/UI-06 | — | — | unit/integration/e2e | TBD | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Populated from RESEARCH.md §Validation Architecture. Expected stubs (non-exhaustive, planner finalizes):

- [ ] `apps/api/src/dashboard/dashboard.service.spec.ts` — stat aggregations (Cameras Online/Offline/Recording/InMaintenance)
- [ ] `apps/api/src/admin/admin-dashboard.service.spec.ts` — getActiveStreamsCount, getRecordingsActive, getClusterNodes, getPlatformIssues, getStorageForecast, getRecentAuditHighlights, getOrgHealthOverview
- [ ] `apps/web/src/components/dashboard/issues-panel.test.tsx` — composition + sort order + empty state
- [ ] `apps/web/src/components/map/camera-marker.test.tsx` — teardrop SVG render, status-to-color mapping, XSS guard (escapeHtml on name)
- [ ] `apps/web/src/components/map/camera-popup.test.tsx` — preview memoization stable, badges render, action wiring
- [ ] `apps/web/src/components/map/cluster-icon.test.ts` — worst-child-status propagation

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Marker pulse animation (reconnecting) | UI-06 | CSS animation timing — visual only | Open `/app/map`, disconnect a camera, confirm amber pulse |
| REC dot blink on preview overlay | UI-06 | CSS animation | Open popup on recording camera, confirm red blink |
| Cluster bubble color matches worst child | UI-06 | Visual + zoom interaction | Zoom out on `/app/map` with mixed-status cameras, confirm red cluster if any offline child |
| Teardrop pin anchor precision | UI-06 | Pixel anchor on map | Place camera at known coord, confirm pin tip = coord |
| PreviewVideo no flicker/runaway | UI-06 (regression from Phase 13) | Runtime behavior under Socket.IO events | Open popup, watch for 60s with viewer-count events, confirm no remount |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
