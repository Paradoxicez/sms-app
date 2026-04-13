# Phase 06 Security Audit -- SRS Cluster & Scaling

**Audited:** 2026-04-13
**Re-verified:** 2026-04-13
**ASVS Level:** 1
**Auditor:** GSD Security Auditor

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-06-01 | Spoofing | mitigate | CLOSED | `@UseGuards(AuthGuard, SuperAdminGuard)` at class level (`cluster.controller.ts:37`). `SuperAdminGuard` checks `session.user.role !== 'admin'` and throws `UnauthorizedException` (`super-admin.guard.ts:31`). |
| T-06-02 | Tampering | mitigate | CLOSED | `ClusterService.create()` calls `this.testConnection(dto.apiUrl, 'EDGE', dto.hlsUrl)` before `prisma.srsNode.create()` (`cluster.service.ts:62`). Node status set to OFFLINE if connection fails (`cluster.service.ts:71`). |
| T-06-03 | Information Disclosure | mitigate | CLOSED | Resolved by T-06-01 fix. SuperAdminGuard covers all endpoints including `GET /nodes/:id/config` (`cluster.controller.ts:99`). Config content verified to not contain secrets. |
| T-06-04 | Elevation of Privilege | mitigate | CLOSED | `ClusterService.remove()` at `cluster.service.ts:90` checks `node.role === 'ORIGIN'` and throws `BadRequestException('Cannot delete origin node')`. |
| T-06-05 | Spoofing (SSRF) | accept | CLOSED | Accepted risk. Admin-only endpoint context. URL format validation via Zod reduces attack surface. |
| T-06-06 | Tampering | accept | CLOSED | Accepted risk. Health endpoints on internal Docker network. nginx stub_status restricted to internal IPs (`nginx-edge.conf.ts:21-24`). |
| T-06-07 | Denial of Service | mitigate | CLOSED | `PlaybackService.createSession()` at `playback.service.ts:98-101` calls `getLeastLoadedEdge()` and falls back to origin URL (`http://srs:8080`) when no online edges available. |
| T-06-08 | Information Disclosure | mitigate | CLOSED | `nginx-edge.conf.ts:21-24`: stub_status restricted with `allow 172.16.0.0/12`, `allow 10.0.0.0/8`, `allow 127.0.0.0/8`, `deny all`. |
| T-06-09 | Repudiation | accept | CLOSED | Accepted risk. Health check results logged via NestJS Logger (`cluster-health.service.ts:88`, `cluster-health.service.ts:127-129`). |
| T-06-10 | Information Disclosure | accept | CLOSED | Accepted risk. Socket.IO `/cluster-status` broadcasts operational data (CPU, memory, bandwidth, viewers), not PII. Admin-only page context. |
| T-06-11 | Spoofing | mitigate | CLOSED | `apiFetch` in `apps/web/src/lib/api.ts:9-10` uses `credentials: 'include'`. `use-cluster-nodes.ts:67` calls cluster API via `apiFetch`. Session cookies sent with all requests. |

## Accepted Risks Log

| Threat ID | Category | Risk Description | Rationale |
|-----------|----------|-----------------|-----------|
| T-06-05 | Spoofing (SSRF) | Admin-provided node URLs could target internal services | Admin is trusted. URL format validation limits to valid URLs. Cluster endpoints are super-admin-only (T-06-01 closed). |
| T-06-06 | Tampering | Health metrics could be manipulated by compromised Docker container | Health endpoints on internal Docker network only. nginx stub_status restricted to RFC1918 ranges. |
| T-06-09 | Repudiation | No persistent audit trail for health check state changes | Health monitoring is internal operational data. Logger provides runtime tracing. No compliance requirement for audit trail. |
| T-06-10 | Information Disclosure | Socket.IO broadcasts cluster health to connected clients | Data is operational metrics (CPU, memory, bandwidth), not PII. Page is admin-only in UI. Note: Socket.IO namespace lacks server-side auth check -- relies on UI-level access control. |

## Unregistered Flags

None. No `## Threat Flags` section found in any SUMMARY.md file.

## Audit Trail

| Date | Action | Details |
|------|--------|---------|
| 2026-04-13 | Initial audit | 8/11 closed, 3 open (T-06-01, T-06-02, T-06-03) |
| 2026-04-13 | Re-verification | T-06-01 closed (SuperAdminGuard added), T-06-02 closed (testConnection called before create), T-06-03 closed (resolved by T-06-01 fix). All 11/11 now closed. |

## Summary

- **Threats Closed:** 11/11
- **Threats Open:** 0/11
- **Accepted Risks:** 4 (T-06-05, T-06-06, T-06-09, T-06-10)
