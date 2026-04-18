---
phase: 14
slug: bug-fixes-datatable-migrations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `apps/web/vitest.config.ts`, `apps/api/vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | FIX-01 | T-14-01 | RLS context set for system org INSERT | integration | Backend test: POST /api/organizations/:orgId/users | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | FIX-02 | — | N/A | unit | `npx vitest run apps/web/src/__tests__/api-keys` | ❌ W0 | ⬜ pending |
| 14-01-03 | 01 | 1 | FIX-03 | T-14-02 | FK cascade on ApiKeyUsage verified | integration | Backend test: DELETE /api/api-keys/:id | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 2 | UI-01 | T-14-03 | Self-removal check preserved | unit | `npx vitest run apps/web/src/__tests__/team-page` | ✅ | ⬜ pending |
| 14-02-02 | 02 | 2 | UI-02 | — | N/A | unit | `npx vitest run apps/web/src/__tests__/org-page` | ❌ W0 | ⬜ pending |
| 14-02-03 | 02 | 2 | UI-03 | — | MetricBar preserved in cells | unit | `npx vitest run apps/web/src/__tests__/cluster-page` | ❌ W0 | ⬜ pending |
| 14-02-04 | 02 | 2 | UI-04 | — | N/A | unit | `npx vitest run apps/web/src/__tests__/platform-audit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Backend integration test stubs for FIX-01 (system org user creation)
- [ ] Backend integration test stubs for FIX-03 (API key hard delete)
- [ ] Frontend test stubs for DataTable migration pages (UI-02, UI-03, UI-04)
