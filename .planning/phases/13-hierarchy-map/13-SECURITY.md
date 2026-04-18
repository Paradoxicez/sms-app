---
phase: 13
slug: hierarchy-map
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-18
---

# Phase 13 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client → API (tree data) | Tree data fetched via apiFetch with session cookie; queries scoped by org_id via RLS | Project/Site/Camera hierarchy (org-scoped) |
| Tree node ID → API query | Selected node ID drives API endpoint path parameter (e.g., /api/projects/{id}/sites) | UUID path params from trusted API responses |
| Client → PATCH /api/cameras/:id | Camera location update with lat/lng from map click or drag | Lat/lng coordinates (validated range) |
| Client → API camera queries | Filter queries scoped by org_id via RLS | Camera list (org-scoped) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-13-01 | Information Disclosure | useHierarchyData | accept | RLS + org_id scoping prevents cross-org data leakage. All queries via `this.tenancy` with RLS. | closed |
| T-13-02 | Tampering | Tree node ID in API calls | accept | Node IDs are UUIDs from trusted API responses, passed as URL path params. Backend validates ownership via RLS. | closed |
| T-13-03 | Spoofing | Session auth | accept | Existing AuthGuard and session-based auth protects all API calls. No changes to auth layer. | closed |
| T-13-04 | Tampering | PATCH camera location | mitigate | Client-side: lat clamped to [-90, 90], lng to [-180, 180] in placement-mode.tsx (lines 42-43). Backend: Zod schema validates lat/lng as numbers. | closed |
| T-13-05 | Information Disclosure | Tree data on map page | accept | Same RLS + org_id scoping as Plan 01. useHierarchyData only fetches data for authenticated org. | closed |
| T-13-06 | Denial of Service | Rapid tree filter clicks | accept | Client-side filtering of already-fetched cameras array. No additional API calls per filter change. FitBounds debounced by React effect dependencies. | closed |
| T-13-07 | Spoofing | ViewStreamSheet camera data | accept | Camera data comes from local cameras array fetched from authenticated API. No user-controlled injection point. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-13-01 | T-13-01 | RLS provides org-level isolation; no new attack surface | gsd-security-auditor | 2026-04-18 |
| AR-13-02 | T-13-02 | UUIDs from trusted source, backend validates ownership | gsd-security-auditor | 2026-04-18 |
| AR-13-03 | T-13-03 | No auth layer changes in this phase | gsd-security-auditor | 2026-04-18 |
| AR-13-05 | T-13-05 | Same isolation as T-13-01 | gsd-security-auditor | 2026-04-18 |
| AR-13-06 | T-13-06 | Client-side only, no server impact | gsd-security-auditor | 2026-04-18 |
| AR-13-07 | T-13-07 | No user-controlled injection point | gsd-security-auditor | 2026-04-18 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-18 | 7 | 7 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-18
