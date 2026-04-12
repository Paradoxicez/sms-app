---
phase: 5
slug: dashboard-monitoring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/api && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/api && npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | DASH-01 | — | N/A | unit | `cd apps/api && npx vitest run tests/dashboard/dashboard.test.ts -t "stats" --reporter=verbose` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | DASH-02 | T-05-02 | Validate orgId from session, not client | unit | `cd apps/api && npx vitest run tests/status/status-gateway.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | DASH-03 | T-05-05 | RLS on camera table enforced via tenancy client | unit | `cd apps/api && npx vitest run tests/dashboard/map.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | DASH-04 | — | Super admin role check on system metrics endpoint | unit | `cd apps/api && npx vitest run tests/dashboard/system-metrics.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 2 | DASH-05 | T-05-01, T-05-04 | RLS on audit_log; sanitize secrets from request body | unit | `cd apps/api && npx vitest run tests/audit/audit-interceptor.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 2 | DASH-06 | T-05-02 | Validate userId from session on notification delivery | unit | `cd apps/api && npx vitest run tests/notifications/notifications.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |
| 05-03-03 | 03 | 2 | DASH-07 | T-05-03 | Super admin role check on SRS log gateway | unit | `cd apps/api && npx vitest run tests/srs/srs-log-gateway.test.ts --reporter=verbose` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/tests/dashboard/dashboard.test.ts` — stubs for DASH-01
- [ ] `apps/api/tests/dashboard/map.test.ts` — stubs for DASH-03
- [ ] `apps/api/tests/dashboard/system-metrics.test.ts` — stubs for DASH-04
- [ ] `apps/api/tests/audit/audit-interceptor.test.ts` — stubs for DASH-05
- [ ] `apps/api/tests/notifications/notifications.test.ts` — stubs for DASH-06
- [ ] `apps/api/tests/srs/srs-log-gateway.test.ts` — stubs for DASH-07

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Map view renders camera markers on map | DASH-03 | Leaflet rendering requires browser DOM | Open map page, verify markers appear at camera lat/lng coordinates |
| HLS mini preview in map popup | DASH-03 | Video playback requires browser + live stream | Click camera marker, verify HLS player loads in popup |
| Dashboard charts render with real-time data | DASH-01 | Chart rendering is visual | Open dashboard, verify charts update when toggling time ranges |
| Notification bell shows unread count badge | DASH-06 | UI visual behavior | Trigger camera event, verify bell badge appears and notification shows in dropdown |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
