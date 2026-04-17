---
phase: 9
slug: layout-login
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x + @testing-library/react |
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
| 09-01-01 | 01 | 1 | FOUND-03 | — | N/A | unit | `cd apps/web && npx vitest run src/__tests__/app-sidebar.test.tsx -x` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | FOUND-03 | T-09-03 | Role-based nav filtering preserved | unit | `cd apps/web && npx vitest run src/__tests__/tenant-nav.test.tsx -x` | ✅ (needs update) | ⬜ pending |
| 09-01-03 | 01 | 1 | FOUND-03 | — | N/A | unit | `cd apps/web && npx vitest run src/__tests__/platform-nav.test.tsx -x` | ✅ (needs update) | ⬜ pending |
| 09-02-01 | 02 | 2 | FOUND-04 | T-09-01 | Session token regenerated on sign-in | unit | `cd apps/web && npx vitest run src/__tests__/sign-in.test.tsx -x` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 2 | FOUND-04 | T-09-02 | Session expiry matches config (30d remembered, session-only otherwise) | unit | `cd apps/web && npx vitest run src/__tests__/sign-in.test.tsx -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/app-sidebar.test.tsx` — stubs for FOUND-03 sidebar collapse, toggle, nav rendering
- [ ] `src/__tests__/sign-in.test.tsx` — stubs for FOUND-04 split-screen login, remember me checkbox
- [ ] Update `src/__tests__/platform-nav.test.tsx` — change imports from PlatformNav to new nav config
- [ ] Update `src/__tests__/tenant-nav.test.tsx` — change imports from TenantNav to new nav config
- [ ] Update `src/__tests__/admin-layout.test.tsx` — layout now uses SidebarProvider
- [ ] Update `src/__tests__/app-layout.test.tsx` — layout now uses SidebarProvider

*Existing infrastructure covers framework install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sidebar collapse animation smooth 200ms | FOUND-03 | CSS animation quality is visual | Toggle sidebar, verify no jank or flicker |
| Leaflet map resizes after sidebar collapse | FOUND-03 | Requires live map tile rendering | Open map page, collapse sidebar, verify no white strips |
| Recharts charts resize after sidebar collapse | FOUND-03 | Requires chart rendering in DOM | Open dashboard, collapse sidebar, verify charts fill container |
| Login branding panel visual quality | FOUND-04 | Visual design assessment | Open login page on desktop, verify split-screen layout |
| Mobile sidebar Sheet overlay | FOUND-03 | Requires mobile viewport testing | Resize to mobile, tap hamburger, verify overlay sidebar |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
