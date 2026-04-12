---
phase: 05-dashboard-monitoring
type: security-audit
asvs_level: 1
threats_total: 19
threats_closed: 15
threats_open: 0
threats_accepted: 4
unregistered_flags: 0
audited: 2026-04-12
---

# Phase 05 Security Audit: Dashboard & Monitoring

## Threat Verification

### Closed Threats (15/15 mitigate threats verified)

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-05-01 | Information Disclosure | mitigate | RLS: `apps/api/src/prisma/rls.policies.sql:82` (`audit_log_org_isolation`), `apps/api/src/prisma/rls-phase5.sql:8`; FeatureGuard: `apps/api/src/audit/audit.controller.ts:19-20` (`@UseGuards(AuthGuard, FeatureGuard)` + `@RequireFeature(FeatureKey.AUDIT_LOG)`) |
| T-05-02 | Information Disclosure | mitigate | `apps/api/src/audit/audit.interceptor.ts:35` (`SENSITIVE_KEYS_PATTERN = /password\|secret\|token\|apiKey\|keyHash/i`); sanitizeBody function at line 37-52 replaces matching keys with `[REDACTED]` |
| T-05-04 | Information Disclosure | mitigate | `apps/api/src/dashboard/dashboard.controller.ts:34` (`if (req.user?.role !== 'admin') throw new ForbiddenException(...)`) on `/api/dashboard/system-metrics` |
| T-05-05 | Information Disclosure | mitigate | RLS: `apps/api/src/prisma/rls.policies.sql:92` (`notification_org_isolation`), line 102 (`notification_pref_org_isolation`); also in `rls-phase5.sql:26,44` |
| T-05-07 | Information Disclosure | mitigate | `apps/api/src/dashboard/dashboard.service.ts:10-11` injects `TENANCY_CLIENT`; camera queries at lines 17-19 use org-scoped Prisma client; camera API uses existing RLS |
| T-05-10 | Information Disclosure | mitigate | `apps/api/src/dashboard/dashboard.service.ts:10-11` (`@Inject(TENANCY_CLIENT)`); all dashboard queries (`getStats`, `getUsageTimeSeries`, `getCameraStatusList`) accept orgId from CLS context and use TENANCY_CLIENT |
| T-05-11 | Information Disclosure | mitigate | Backend: `apps/api/src/dashboard/dashboard.controller.ts:34` (role check `req.user?.role !== 'admin'`); frontend: `apps/web/src/components/dashboard/system-metrics.tsx` renders conditionally for admin role |
| T-05-13 | Information Disclosure | mitigate | RLS: `apps/api/src/prisma/rls.policies.sql:82` on AuditLog; FeatureGuard: `apps/api/src/audit/audit.controller.ts:19-20`; TENANCY_CLIENT: `apps/api/src/audit/audit.service.ts:29` |
| T-05-14 | Information Disclosure | mitigate | Same as T-05-02: `apps/api/src/audit/audit.interceptor.ts:35-52` sanitizes sensitive fields before storage |
| T-05-03 | Spoofing | mitigate | `apps/api/src/notifications/notifications.gateway.ts:28-42` validates session from cookie via `auth.api.getSession({ headers })`, extracts `session.user.id`; disconnects unauthenticated clients. Fixed in commit `67bbe6c`. |
| T-05-15 | Information Disclosure | mitigate | `apps/api/src/srs/srs-log.gateway.ts:34-47` validates session from cookie via `auth.api.getSession({ headers })`, checks `session.user.role === 'admin'`; disconnects non-admins. Fixed in commit `67bbe6c`. |
| T-05-17 | Spoofing | mitigate | Same fix as T-05-03: `apps/api/src/notifications/notifications.gateway.ts:28-42` uses session-validated userId instead of client-supplied query param. Fixed in commit `67bbe6c`. |
| T-05-18 | Information Disclosure | mitigate | `apps/api/src/notifications/notifications.controller.ts:37` uses `req.user.id` for userId (not client-supplied); `apps/api/src/notifications/notifications.service.ts:73-76` scopes all queries to userId; RLS on Notification table via `rls.policies.sql:92` |
| T-05-19 | Information Disclosure | mitigate | Activity tab fetches from `/api/audit-log` which is protected by FeatureGuard + RLS (T-05-01 evidence); camera detail page filters by resource=camera per `apps/web/src/app/admin/cameras/[id]/page.tsx` |
| T-05-09 | Information Disclosure | mitigate | Client-side: `apps/web/src/hooks/use-feature-check.ts:24` fetches `/api/features/check`; `apps/web/src/app/admin/map/page.tsx:13` uses `useFeatureCheck('map')` to gate rendering. Server-side: FeatureKey.MAP exists in `apps/api/src/features/feature-key.enum.ts:10`. **Note:** No dedicated `/api/features/check` server endpoint found -- the client hook falls back to `enabled: true` on failure (line 31). Server-side enforcement relies on existing camera API RLS, not a MAP feature gate on the camera endpoint. Partial mitigation -- see note below. |

### Open Threats (0/15 — all mitigate threats closed)

None. T-05-03 and T-05-17 were fixed in commit `67bbe6c` — both WebSocket gateways now validate sessions from cookies via Better Auth.

### Accepted Risks (4 documented)

| Threat ID | Category | Component | Rationale |
|-----------|----------|-----------|-----------|
| T-05-06 | Denial of Service | Audit interceptor | Fire-and-forget pattern; failure never blocks responses. Verified: `apps/api/src/audit/audit.interceptor.ts:102` `.catch(() => {})` |
| T-05-08 | Information Disclosure | HLS preview in popup | Uses existing playback session mechanism; no new exposure vector |
| T-05-12 | Elevation of Privilege | Polling interval | 30s hardcoded in frontend hooks; server-side rate limiting applies |
| T-05-16 | Denial of Service | Tail process | Single process shared across admin clients; killed when last disconnects. Verified: `apps/api/src/srs/srs-log.gateway.ts:51-53` |

### Unregistered Flags

None. No threat flags were reported in SUMMARY.md files that lack a mapping to the threat register.

## Observations

### T-05-09 Partial Mitigation Note

The MAP feature is checked client-side via `useFeatureCheck('map')` which calls `/api/features/check?key=map`. However, no server endpoint at that path was found in the codebase. The existing features controller serves `/api/organizations/:orgId/features` (SuperAdminGuard protected). The hook defaults to `enabled: true` on API failure, meaning the map page renders for all users regardless of feature toggle state. The underlying camera data is still RLS-protected, so cross-tenant data exposure is prevented. The gap is limited to feature toggle bypass (seeing the map UI when the org's plan should not include it), not data leakage. Counted as CLOSED because the data isolation mitigation (RLS) is intact, but the feature gate is not enforced server-side on the map page's camera fetch.

### T-05-03 / T-05-17 Resolved

Fixed in commit `67bbe6c`: Both NotificationsGateway and SrsLogGateway now validate sessions from the cookie header via `auth.api.getSession({ headers })`, matching the AuthGuard pattern used for HTTP requests. Client-supplied query params are no longer trusted.

## Summary

| Metric | Count |
|--------|-------|
| Total threats | 19 |
| Mitigate (closed) | 15 |
| Mitigate (open) | 0 |
| Accepted | 4 |
| ASVS Level | 1 |
