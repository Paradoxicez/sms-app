# Phase 03 — Playback & Security: Security Audit

**Audited:** 2026-04-10
**ASVS Level:** 1
**Auditor:** GSD Security Auditor (automated)

## Threat Verification Summary

**Threats Closed:** 14/14
**Threats Open:** 0/14
**Status:** SECURED

## Threat Register Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-03-01 | Spoofing | mitigate | CLOSED | `apps/api/src/playback/playback.controller.ts:40-41` — `@UseGuards(AuthGuard)` on `createSession`; org context from CLS via `getOrgId()` |
| T-03-02 | Tampering | mitigate | CLOSED | `apps/api/src/playback/playback.service.ts:83-92` — `jwt.sign()` with HS256; `playback.service.ts:115` — `jwt.verify()` validates signature. Library: `jsonwebtoken` (functionally equivalent to planned `jose`) |
| T-03-03 | Information Disclosure | accept | CLOSED | `apps/api/src/playback/playback.service.ts:168-188` — `getSession()` returns only `id, hlsUrl, expiresAt, cameraId`. No sensitive policy data exposed. Session IDs are UUIDs. |
| T-03-04 | Elevation of Privilege | mitigate | CLOSED | `apps/api/src/policies/policies.controller.ts:19` — `@UseGuards(AuthGuard)` on entire controller; `policies.service.ts:94-99` — `findAll` scoped by orgId; `policies.service.ts:120-122` — system default policy deletion blocked |
| T-03-05 | Denial of Service | mitigate | CLOSED | `apps/api/src/playback/playback.service.ts:59-63` — viewer concurrency check at session creation; `apps/api/src/app.module.ts:44-54` — ThrottlerModule with 3 tiers as APP_GUARD |
| T-03-06 | Spoofing | mitigate | CLOSED | `apps/api/src/srs/srs-callback.controller.ts:48-63` — token extracted from SRS param, verified via `playbackService.verifyToken(token, cameraId, orgId)` which checks `cam` and `org` claims |
| T-03-07 | Tampering | mitigate | CLOSED | `apps/api/src/srs/srs-callback.controller.ts:52-63` — token required as query param; on_play rejects with `{ code: 403 }` if missing or invalid |
| T-03-08 | Information Disclosure | mitigate | CLOSED | `apps/api/src/playback/playback.controller.ts:63-97` — key endpoint returns 403 without valid JWT; `playback.controller.ts:133-136` — m3u8 proxy rewrites `#EXT-X-KEY` URI to include token |
| T-03-09 | Denial of Service | mitigate | CLOSED | `apps/api/src/app.module.ts:44-54` — `ThrottlerModule.forRoot` with 3 tiers: global 100/min, tenant 60/min, apikey 30/min; `ThrottlerGuard` as `APP_GUARD` |
| T-03-10 | Spoofing | mitigate | CLOSED | `apps/api/src/srs/srs-callback.controller.ts:65-69` — `matchDomain()` called with pageUrl from SRS callback; `playback.service.ts:197-226` — wildcard support and `allowNoReferer` handling |
| T-03-11 | Elevation of Privilege | mitigate | CLOSED | `apps/api/src/srs/srs-callback.controller.ts:72-76` — viewer limit enforced at on_play (authoritative); also checked at session creation (`playback.service.ts:59-63`) |
| T-03-12 | Spoofing | mitigate | CLOSED | `apps/api/src/policies/policies.controller.ts:19` — `@UseGuards(AuthGuard)` on entire PoliciesController; backend validates session for all CRUD operations |
| T-03-13 | Information Disclosure | accept | CLOSED | `apps/api/src/playback/playback.service.ts:168-188` — returns only `id, hlsUrl, expiresAt, cameraId`. Session ID is UUID (unguessable). Acceptance rationale sound. |
| T-03-14 | Tampering | accept | CLOSED | Embed code snippets are static templates with placeholders. No server-side injection vector. Token management is developer responsibility. Acceptance rationale sound. |

## Accepted Risks Log

| Threat ID | Risk Description | Justification | Review Date |
|-----------|------------------|---------------|-------------|
| T-03-03 | Public GET /playback/sessions/:id endpoint exposes session info | Returns minimal data (id, hlsUrl, expiresAt, cameraId); session IDs are UUIDs making enumeration infeasible | 2026-04-10 |
| T-03-13 | Embed page session lookup without authentication | Same as T-03-03; public by design for embed use case | 2026-04-10 |
| T-03-14 | Embed code snippets could be tampered with client-side | Snippets are developer-facing templates; actual security enforcement happens server-side via JWT and SRS callbacks | 2026-04-10 |

## Unregistered Flags

None. No threat flags reported in SUMMARY.md files.

## Notes

- JWT library changed from `jose` (ESM) to `jsonwebtoken` (CJS) during implementation. Both provide HS256 signing and verification. Mitigation is functionally equivalent.
- ThrottlerModule uses in-memory storage (not Redis) per implementation decision. Sufficient for single-server deployment constraint.
- SRS callbacks excluded from rate limiting via `@SkipThrottle()` decorator — correct for internal service-to-service calls.
