# Phase 04 Developer Experience -- Security Verification

**Audited:** 2026-04-12
**ASVS Level:** 1
**Threats Closed:** 18/18
**Status:** SECURED

## Threat Verification

| Threat ID | Category | Disposition | Evidence |
|-----------|----------|-------------|----------|
| T-04-01 | Spoofing | mitigate | `apps/api/src/api-keys/api-key.guard.ts:27` -- `createHash('sha256').update(apiKey).digest('hex')` hash lookup; no raw key logging |
| T-04-02 | Information Disclosure | mitigate | `apps/api/src/api-keys/api-keys.service.ts:70` -- rawKey returned only on creation; `findAll` (line 83) uses select excluding keyHash; lastFour for display |
| T-04-03 | Elevation of Privilege | mitigate | `apps/api/src/features/features.guard.ts:42` -- `request.params?.orgId \|\| this.cls.get('ORG_ID')` CLS fallback for API key auth |
| T-04-04 | Denial of Service | accept | Accepted risk: Redis INCR O(1) fire-and-forget; middleware failure does not block requests (`api-key-usage.middleware.ts:36` `.catch(() => {})`) |
| T-04-05 | Spoofing | mitigate | `apps/api/src/api-keys/auth-or-apikey.guard.ts:24` -- checks X-API-Key first; delegates to ApiKeyGuard (sets CLS ORG_ID at `api-key.guard.ts:35`); falls back to AuthGuard |
| T-04-06 | Information Disclosure | accept | Accepted risk: Swagger UI public per design decision D-06; no secrets in spec; `main.ts:30` -- `SwaggerModule.setup('api/docs', ...)` |
| T-04-07 | Denial of Service | mitigate | `apps/api/src/playback/dto/batch-sessions.dto.ts:4` -- `z.array(z.string().uuid()).min(1).max(50)` enforces batch limit |
| T-04-08 | Tampering | mitigate | `apps/api/src/playback/dto/batch-sessions.dto.ts:4` -- UUID validation; `playback.controller.ts:65-66` -- safeParse; per-camera ownership check via `getOrgId()` |
| T-04-09 | Elevation of Privilege | mitigate | `apps/api/src/api-keys/auth-or-apikey.guard.ts` -- API key sets CLS ORG_ID; `playback.controller.ts:31-36` -- getOrgId() reads CLS; Prisma tenancy extension filters by org |
| T-04-10 | Tampering | mitigate | `apps/api/src/webhooks/webhook-url.validator.ts:20` -- HTTPS enforcement; lines 26-28 blocked hostnames; `isPrivateIp()` blocks 10.x, 172.16-31.x, 192.168.x, 169.254.x |
| T-04-11 | Spoofing | mitigate | `apps/api/src/webhooks/webhook-delivery.processor.ts:29-31` -- `createHmac('sha256', secret)` with `X-Webhook-Signature: t={ts},v1={sig}` header |
| T-04-12 | Repudiation | mitigate | `apps/api/src/webhooks/webhook-delivery.processor.ts:27-28` -- timestamp in signature payload `${timestamp}.${bodyStr}` |
| T-04-13 | Denial of Service | mitigate | `apps/api/src/webhooks/webhook-delivery.processor.ts:34` -- 10s AbortController timeout; BullMQ 5-attempt retry with custom backoff (line 8) |
| T-04-14 | Information Disclosure | accept | Accepted risk: Webhook secret stored plaintext (required for HMAC signing); shown once on creation (`webhooks.service.ts:31`); not retrievable via `findAll` select (line 37-47) |
| T-04-15 | Information Disclosure | mitigate | `apps/api/src/api-keys/api-keys.service.ts:83-98` -- findAll select excludes keyHash; only prefix+lastFour returned; rawKey only on creation (line 70) |
| T-04-16 | Information Disclosure | mitigate | `apps/api/src/webhooks/webhooks.service.ts:34-47` -- findAll select excludes secret; secret returned only on creation (line 31) |
| T-04-17 | Information Disclosure | mitigate | Quick Start guide shows only `prefix...lastFour` display pattern (not full key); camera IDs are non-sensitive |
| T-04-18 | Information Disclosure | accept | Accepted risk: Documentation is informational content only; served in-app behind session auth; no secrets in content |

## Accepted Risks Log

| Threat ID | Risk | Justification | Owner |
|-----------|------|---------------|-------|
| T-04-04 | DoS via usage middleware | Redis INCR is O(1); fire-and-forget pattern ensures middleware failure never blocks requests | Platform team |
| T-04-06 | Swagger UI public access | Intentional per design decision D-06; API docs contain no secrets; authentication required for actual API calls | Platform team |
| T-04-14 | Webhook secret plaintext storage | Required for server-side HMAC signing; shown once on creation, not retrievable thereafter; scoped per-subscription | Platform team |
| T-04-18 | Documentation content disclosure | Informational guides only; no secrets or sensitive data; pages behind session authentication | Platform team |

## Unregistered Flags

None -- no `## Threat Flags` sections found in any SUMMARY.md files for Phase 04.
