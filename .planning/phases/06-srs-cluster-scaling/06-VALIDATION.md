---
phase: 6
slug: srs-cluster-scaling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `cd apps/api && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/api && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/api && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/api && npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | CLUSTER-01 | — | Node CRUD validates URL format | unit | `cd apps/api && npx vitest run src/cluster` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | CLUSTER-02 | — | Config generation per node role | unit | `cd apps/api && npx vitest run src/cluster` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | CLUSTER-03 | — | Least-loaded routing selects healthy node | unit | `cd apps/api && npx vitest run src/cluster` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | CLUSTER-04 | — | Failover excludes offline nodes | unit | `cd apps/api && npx vitest run src/cluster` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 2 | CLUSTER-05 | — | Health check marks node offline after 3 misses | unit | `cd apps/api && npx vitest run src/cluster` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/src/cluster/__tests__/cluster.service.spec.ts` — stubs for CLUSTER-01, CLUSTER-02
- [ ] `apps/api/src/cluster/__tests__/load-balancer.service.spec.ts` — stubs for CLUSTER-03, CLUSTER-04
- [ ] `apps/api/src/cluster/__tests__/health-check.service.spec.ts` — stubs for CLUSTER-05

*Existing vitest infrastructure covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Edge node nginx container starts and caches HLS | CLUSTER-02 | Requires Docker + SRS running | Start edge container, verify nginx serves cached HLS segments |
| Viewer failover on edge down | CLUSTER-04 | Requires stopping container mid-stream | Play stream via edge, stop edge container, verify hls.js retries get new session URL |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
