# Phase 10 Security Audit: Admin Table Migrations

**Phase:** 10 -- Admin Table Migrations
**ASVS Level:** 1
**Audited:** 2026-04-17
**Threats Closed:** 8/8

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-10-01 | Tampering | mitigate | CLOSED | `apps/api/src/audit/dto/audit-query.dto.ts:10-11` -- `page: z.coerce.number().min(1)`, `pageSize: z.coerce.number().min(1).max(100)`, `search: z.string().max(200)` at line 9 |
| T-10-02 | Information Disclosure | accept | CLOSED | `apps/web/src/components/audit/audit-log-data-table.tsx` -- self-fetching via `apiUrl` prop, all data filtered server-side by RLS (tenant) or SuperAdminGuard (admin). No direct data access in frontend. |
| T-10-03 | Denial of Service | mitigate | CLOSED | `apps/api/src/audit/dto/audit-query.dto.ts:11` -- `pageSize` max 100; line 9 -- `search` max 200 chars. Both enforced by zod schema validation. |
| T-10-04 | Information Disclosure | mitigate | CLOSED | `apps/web/src/components/api-keys/api-keys-columns.tsx:51-53` -- key rendered as `{prefix}...{lastFour}` only. `apps/web/src/components/api-keys/api-keys-data-table.tsx:85` -- copy action copies masked value `${key.prefix}...${key.lastFour}`. Full key never in DOM. |
| T-10-05 | Spoofing | accept | CLOSED | `apps/web/src/app/admin/users/components/users-data-table.tsx:62-63` -- deactivate calls `apiFetch` DELETE to backend API. Backend enforces AuthGuard + SuperAdminGuard. No new auth surface. |
| T-10-06 | Tampering | accept | CLOSED | `apps/web/src/components/pages/tenant-developer-webhooks-page.tsx:56` -- toggle calls `apiFetch` PATCH to `/api/webhooks/{id}`. Existing AuthGuard on backend. No new auth surface. |
| T-10-07 | Information Disclosure | accept | CLOSED | `apps/web/src/components/webhooks/webhooks-columns.tsx:50-56` -- URL rendered with `max-w-[200px] truncate` CSS class. Full URL in title tooltip only. User's own configured webhook URL. |
| T-10-08 | Elevation of Privilege | accept | CLOSED | `apps/web/src/components/stream-profiles/stream-profiles-data-table.tsx:15` -- duplicate delegates to parent `onDuplicate` callback. Per SUMMARY, handler uses `POST /api/stream-profiles` with existing auth + RLS org scoping. |

## Accepted Risks Log

| Threat ID | Category | Risk Description | Justification |
|-----------|----------|------------------|---------------|
| T-10-02 | Information Disclosure | Audit log data visible to authenticated users | Data already filtered by orgId via RLS (tenant) or SuperAdminGuard (admin). No new exposure surface added by table migration. |
| T-10-05 | Spoofing | Deactivate action in users table | Frontend action triggers API call to existing endpoint with AuthGuard + SuperAdminGuard. No new auth surface. |
| T-10-06 | Tampering | Webhook toggle action | Existing AuthGuard on PATCH endpoint. Frontend is display layer only. |
| T-10-07 | Information Disclosure | Webhook URL displayed in table | URL is user's own configured webhook endpoint. Truncated display. No sensitive data beyond what user configured. |
| T-10-08 | Elevation of Privilege | Stream profile duplicate action | Uses same POST endpoint with existing auth. RLS ensures org-scoped operations. |

## Unregistered Flags

None. No `## Threat Flags` sections found in any SUMMARY.md files for this phase.
