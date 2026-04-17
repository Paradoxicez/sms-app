---
phase: 8
slug: foundation-components
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-17
---

# Phase 8 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client-only | DataTable is a pure client component — all data passed as props from parent server components | Row data, column definitions (developer-authored) |
| client-only | DatePicker/DateRangePicker are pure client components — date values are local state | Date values passed to existing API calls |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-08-01 | Tampering | DataTable column definitions | accept | Column defs are developer-authored code, not user input. No runtime injection risk. | closed |
| T-08-02 | Information Disclosure | DataTable row data | accept | Access control enforced at API layer (NestJS auth guards), not component layer. | closed |
| T-08-03 | Denial of Service | DataTable with large datasets | mitigate | Server-side pagination via `manualPagination: true` for large datasets. Client-side pagination capped at page sizes 10/25/50. | closed |
| T-08-04 | Tampering | Date filter values | accept | Date filtering is client-side state. API already validates date parameters server-side. | closed |
| T-08-05 | Information Disclosure | Calendar popover | accept | Calendar shows month/year navigation only. No sensitive data exposed. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-08-01 | Column definitions are static developer code, not dynamic user input | Claude (plan-phase) | 2026-04-17 |
| AR-02 | T-08-02 | Row-level access control is an API concern, not a component concern | Claude (plan-phase) | 2026-04-17 |
| AR-03 | T-08-04 | Date parameters validated server-side in existing API handlers | Claude (plan-phase) | 2026-04-17 |
| AR-04 | T-08-05 | Calendar UI contains no sensitive data | Claude (plan-phase) | 2026-04-17 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-17 | 5 | 5 | 0 | gsd-secure-phase |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
