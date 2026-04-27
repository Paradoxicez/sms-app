# Phase 14 Security Audit

**Phase:** 14 -- Bug Fixes & DataTable Migrations
**ASVS Level:** 1
**Audited:** 2026-04-18
**Threats Closed:** 7/7
**Status:** SECURED

## Threat Verification

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-14-01 | Elevation of Privilege | UsersService.createUser | mitigate | CLOSED | `apps/api/src/users/users.service.ts:63-73` -- `$transaction` with `set_config('app.current_org_id', orgId, TRUE)` before `member.create()` |
| T-14-02 | Information Disclosure | ApiKeysService.delete | mitigate | CLOSED | `apps/api/src/api-keys/api-keys.service.ts:115` -- `tenancy.apiKey.findFirst({ where: { id, orgId } })` verifies org ownership before delete; cascade removes usage |
| T-14-03 (plan 01) | Denial of Service | API key table copy | mitigate | CLOSED | `apps/web/src/components/api-keys/api-keys-data-table.tsx` -- grep for "Copy key" returns 0 matches; only Delete action remains |
| T-14-03 (plan 02) | Denial of Service | TeamDataTable | mitigate | CLOSED | `apps/web/src/components/team/team-columns.tsx:70-71` -- `const isSelf = row.original.userId === currentUserId; if (isSelf) return null` prevents self-removal |
| T-14-04 | Information Disclosure | OrgDataTable | accept | CLOSED | Organization list rendered only on `/admin/organizations` route, guarded by super admin page-level access control |
| T-14-05 | Information Disclosure | AuditLogDataTable (org filter) | accept | CLOSED | Platform audit at `/admin/audit-log` uses `apiUrl="/api/admin/audit-log"` which requires SuperAdminGuard; org names are non-sensitive for super admin users |
| T-14-06 | Denial of Service | ClusterDataTable (remove node) | mitigate | CLOSED | `apps/web/src/app/admin/cluster/page.tsx:108-112` -- `RemoveNodeDialog` confirmation dialog shown before node removal (delegated from ClusterDataTable via `onRemoveNode` callback) |

## Accepted Risks Log

| Threat ID | Category | Rationale | Accepted By |
|-----------|----------|-----------|-------------|
| T-14-04 | Information Disclosure | Organization list is only accessible to super admin users via page-level route guard. No sensitive data (credentials, keys) is exposed in table columns. Risk is negligible at ASVS Level 1. | Security Audit (automated) |
| T-14-05 | Information Disclosure | Platform audit log with org filter is restricted to super admin users via SuperAdminGuard on the API endpoint. Organization names visible in the filter are non-sensitive operational data for platform operators. | Security Audit (automated) |

## Unregistered Flags

None. No `## Threat Flags` section found in any SUMMARY.md files for this phase.

## Notes

- T-14-06 mitigation was simplified during implementation: ClusterDataTable delegates `onRemoveNode` to the parent page, which uses the existing `RemoveNodeDialog` component rather than embedding a duplicate AlertDialog. The confirmation step is functionally equivalent.
- T-14-03 (plan 01) was verified by confirming the complete absence of a "Copy key" action in the API keys data table. The raw key is only available in the create dialog immediately after key generation.
