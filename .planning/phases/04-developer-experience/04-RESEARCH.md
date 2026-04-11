# Phase 4: Developer Experience - Research

**Researched:** 2026-04-12
**Domain:** API key management, Swagger/OpenAPI documentation, webhook delivery, batch endpoints
**Confidence:** HIGH

## Summary

Phase 4 adds developer-facing features to the SMS Platform: scoped API keys with usage tracking, interactive Swagger API docs, webhook subscriptions for camera events, in-app documentation guides, and batch playback session creation. The existing codebase has strong foundations -- BullMQ is already configured for job queuing, @nestjs/swagger v11 is in package.json but not yet bootstrapped, FeatureKey enum already defines API_KEYS and WEBHOOKS toggles, and the ThrottlerModule already has an `apikey` rate limit profile.

The primary technical challenges are: (1) building an ApiKeyGuard that parallels the existing AuthGuard but authenticates via hashed API keys from X-API-Key header, (2) hooking into StatusService.transition() to emit webhook events through BullMQ, and (3) setting up Swagger in main.ts with proper decorators on existing controllers. All new backend models (ApiKey, ApiKeyUsage, WebhookSubscription, WebhookDelivery) need org_id for RLS, following the established Prisma tenancy pattern.

**Primary recommendation:** Build in this order: (1) Prisma schema + API key CRUD, (2) ApiKeyGuard + Swagger bootstrap, (3) Webhook system with BullMQ, (4) Batch playback endpoint, (5) Portal pages + documentation content.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Authentication via `X-API-Key` header -- dedicated header separate from session auth, no collision with Better Auth Bearer tokens
- **D-02:** API keys scoped to Project or Site level -- matches existing hierarchy (Organization > Project > Site > Camera). Key scoped to project accesses all cameras in that project; key scoped to site accesses only cameras in that site
- **D-03:** Usage tracking as daily aggregates -- requests/day and bandwidth/day stored as summary records per API key. Lightweight storage, sufficient for usage dashboard and billing prep
- **D-04:** API key format: prefixed string (e.g., `sk_live_xxx`) -- key shown once at creation, stored as hash in DB. Standard revoke/regenerate flow
- **D-05:** Hybrid approach -- Custom Next.js portal pages at `/admin/developer/*` for API keys, webhooks, usage + Swagger UI embed/link for interactive API reference
- **D-06:** Swagger UI at `/api/docs` served by NestJS @nestjs/swagger (v11, already in deps) -- public access, no login required. Developers can evaluate the API before signing up
- **D-07:** curl examples pre-filled with real data -- user's actual API key + real camera IDs populated in examples (like Stripe dashboard). Copy-paste and run immediately
- **D-08:** Embed snippet templates in Quick Start section -- 3-step guide: (1) Create API key, (2) Create playback session, (3) Embed with iframe/hls.js/React snippet. Fulfills Phase 3 deferred embed templates
- **D-09:** Camera events only for v1 -- 4 event types: `camera.online`, `camera.offline`, `camera.degraded`, `camera.reconnecting`. Matches DEV-04 requirement exactly
- **D-10:** Exponential backoff retry with 5 attempts -- intervals ~1m, 5m, 30m, 2h, 12h. Uses existing BullMQ infrastructure for job queuing and retry logic
- **D-11:** HMAC-SHA256 signature on every delivery -- secret per webhook subscription, signature in `X-Webhook-Signature` header. Developer verifies with shared secret
- **D-12:** Recent deliveries log visible in portal -- shows payload, response status, timestamp, retry attempts per delivery. Developer can debug failed webhooks
- **D-13:** Documentation as in-app Next.js pages at `/admin/developer/docs/*` -- content lives in the app, no separate docs site to host/maintain
- **D-14:** Five documentation guides: API Workflow, Policies, Stream Profiles, Webhooks, Streaming Basics
- **D-15:** New endpoint `POST /api/playback/sessions/batch` -- accepts array of camera IDs, returns array of session objects (cameraId, sessionId, hlsUrl, expiresAt). Extends existing PlaybackService

### Claude's Discretion
- API key hashing algorithm (bcrypt, SHA-256, etc.)
- Exact Prisma schema design for ApiKey, ApiKeyUsage, WebhookSubscription, WebhookDelivery tables
- Swagger decorator strategy on existing controllers
- Portal page layout and component design
- Documentation content writing and formatting
- BullMQ queue configuration for webhook delivery
- Daily aggregation job scheduling (cron timing)
- Batch session creation limit (max cameras per batch)

### Deferred Ideas (OUT OF SCOPE)
- Redesign camera detail page
- Stream/playback/policy webhook events (camera events only for v1)
- Per-request usage logs (daily aggregates sufficient)
- SDK generation from OpenAPI spec
- API versioning strategy
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEV-01 | API Keys scoped to project or site with usage tracking (requests/day, bandwidth) | ApiKey model with scope field (PROJECT/SITE), ApiKeyUsage daily aggregate model, ApiKeyGuard for authentication, middleware for usage counting |
| DEV-02 | Developer Portal with interactive API reference (curl examples + live responses) | @nestjs/swagger v11 bootstrapped at `/api/docs`, custom portal pages at `/admin/developer/*` with pre-filled curl examples |
| DEV-03 | In-app documentation (API workflow guide, policies guide, stream profiles guide) | Next.js pages at `/admin/developer/docs/*`, five guides per D-14 |
| DEV-04 | Webhook subscriptions for camera events (online/offline/degraded/reconnecting) with HMAC signatures | WebhookSubscription + WebhookDelivery models, BullMQ `webhook-delivery` queue, HMAC-SHA256 signing via Node.js crypto, hook into StatusService.transition() |
| DEV-05 | Batch playback session creation for multiple cameras in one API call | `POST /api/playback/sessions/batch` endpoint extending existing PlaybackService.createSession() |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| @nestjs/swagger | ^11.0.0 (latest: 11.2.7) | Swagger/OpenAPI docs at `/api/docs` | In package.json, not yet bootstrapped [VERIFIED: package.json + npm registry] |
| bullmq | ^5.73.2 (latest: 5.73.4) | Webhook delivery queue + usage aggregation cron | Already configured in app.module.ts [VERIFIED: package.json + npm registry] |
| jsonwebtoken | ^9.0.3 | Playback JWT signing (existing), no new use | Already used in PlaybackService [VERIFIED: codebase] |
| zod | ^3.25.76 | Request validation for API key/webhook DTOs | Already used throughout controllers [VERIFIED: codebase] |
| ioredis | ^5.10.1 | Redis client for BullMQ backend | Already configured [VERIFIED: package.json] |
| Node.js crypto | built-in | HMAC-SHA256 signing, API key hashing, secure random generation | No install needed [VERIFIED: Node.js standard library] |

### No New Dependencies Required

All functionality for Phase 4 can be implemented with existing dependencies. Key points:

- **API key hashing:** Use Node.js built-in `crypto.createHash('sha256')` -- SHA-256 is appropriate for API keys because we only need one-way hashing with fast lookup (not password-slow bcrypt). Stripe, GitHub, and AWS all use SHA-256 for API key hashing. [ASSUMED -- standard industry practice]
- **HMAC signatures:** Use `crypto.createHmac('sha256', secret)` for webhook payload signing [VERIFIED: Node.js crypto docs]
- **API key generation:** Use `crypto.randomBytes(32).toString('hex')` prefixed with `sk_live_` [ASSUMED -- standard pattern]
- **Swagger UI:** @nestjs/swagger bundles Swagger UI, no separate install needed [VERIFIED: @nestjs/swagger docs]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SHA-256 for API key hash | bcrypt | bcrypt is password-focused (intentionally slow); SHA-256 is fast lookup for high-entropy random keys. SHA-256 is correct here. |
| BullMQ for webhook delivery | @nestjs/schedule + manual retry | BullMQ already set up, has built-in exponential backoff, job persistence, and retry tracking. No reason to build custom. |
| In-app docs pages | Docusaurus/separate docs site | D-13 explicitly locks in-app Next.js pages. No external docs site. |

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/
  api-keys/
    api-keys.module.ts
    api-keys.controller.ts
    api-keys.service.ts
    api-key.guard.ts          # CanActivate guard for X-API-Key auth
    dto/
      create-api-key.dto.ts
      api-key-response.dto.ts
  webhooks/
    webhooks.module.ts
    webhooks.controller.ts
    webhooks.service.ts
    webhook-delivery.processor.ts  # BullMQ @Processor
    dto/
      create-webhook.dto.ts
      webhook-event.dto.ts
  playback/
    playback.controller.ts    # Add batch endpoint here
    playback.service.ts       # Add createBatchSessions()

apps/web/src/app/admin/developer/
    page.tsx                  # Developer portal overview / Quick Start
    api-keys/
      page.tsx                # API key management
    webhooks/
      page.tsx                # Webhook subscription management
    docs/
      page.tsx                # Docs index
      api-workflow/page.tsx
      policies/page.tsx
      stream-profiles/page.tsx
      webhooks/page.tsx
      streaming-basics/page.tsx
```

### Pattern 1: ApiKeyGuard (Parallel to AuthGuard)
**What:** Custom NestJS guard that authenticates requests via X-API-Key header, hashes the key, looks up in DB, sets org context via CLS.
**When to use:** All developer API endpoints that accept API key authentication.
**Example:**
```typescript
// Source: Existing AuthGuard pattern in codebase + NestJS docs
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly cls: ClsService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    // Hash the provided key and look up
    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    const keyRecord = await this.apiKeysService.findByHash(keyHash);

    if (!keyRecord || keyRecord.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Set org context (same as AuthGuard)
    this.cls.set('ORG_ID', keyRecord.orgId);

    // Attach key record for scope checking downstream
    (request as any).apiKey = keyRecord;

    return true;
  }
}
```

### Pattern 2: Webhook Event Emission via StatusService Hook
**What:** When StatusService.transition() changes camera status, emit a webhook event to BullMQ queue.
**When to use:** Camera status changes that map to webhook event types.
**Example:**
```typescript
// In StatusService.transition() -- after successful status update:
// Emit webhook event for subscribed endpoints
const eventType = `camera.${newStatus}`; // camera.online, camera.offline, etc.
if (['online', 'offline', 'degraded', 'reconnecting'].includes(newStatus)) {
  this.webhooksService.emitEvent(orgId, eventType, {
    cameraId,
    status: newStatus,
    previousStatus: currentStatus,
    timestamp: new Date().toISOString(),
  });
}
```

### Pattern 3: BullMQ Webhook Delivery with Exponential Backoff
**What:** Queue-based webhook delivery with 5 retry attempts and exponential backoff.
**When to use:** All webhook deliveries.
**Example:**
```typescript
// Source: BullMQ docs (https://docs.bullmq.io/guide/retrying-failing-jobs)
// Adding a webhook delivery job:
await this.webhookQueue.add('deliver', {
  subscriptionId,
  eventType,
  payload,
}, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 60000, // 1 minute base -> ~1m, 2m, 4m, 8m, 16m
    // Note: D-10 wants ~1m, 5m, 30m, 2h, 12h -- use custom backoff
  },
  removeOnComplete: { age: 86400 }, // keep 24h
  removeOnFail: { age: 604800 },    // keep 7 days
});
```

For the custom intervals specified in D-10 (~1m, 5m, 30m, 2h, 12h), use a custom backoff strategy:
```typescript
// Register custom backoff in BullModule config
const WEBHOOK_DELAYS = [60000, 300000, 1800000, 7200000, 43200000];
// In processor: throw error to trigger retry, BullMQ applies backoff
```

### Pattern 4: Swagger Bootstrap in main.ts
**What:** Add SwaggerModule setup to existing main.ts bootstrap function.
**When to use:** One-time setup.
**Example:**
```typescript
// Source: @nestjs/swagger official docs
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// In bootstrap(), after app.enableCors():
const swaggerConfig = new DocumentBuilder()
  .setTitle('SMS Platform API')
  .setDescription('Surveillance Management System - Developer API')
  .setVersion('1.0')
  .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, swaggerConfig);
SwaggerModule.setup('api/docs', app, document);
```

### Pattern 5: Daily Usage Aggregation via BullMQ Repeatable Job
**What:** Scheduled job that aggregates API key usage counters from Redis into PostgreSQL daily.
**When to use:** Usage tracking per D-03.
**Example:**
```typescript
// Per-request counting in middleware (fast path -- Redis INCR):
// INCR apikey:usage:{keyId}:{date}:requests
// INCRBY apikey:usage:{keyId}:{date}:bandwidth {responseBytes}

// Daily aggregation job (runs at 00:05 UTC):
await this.usageQueue.add('aggregate-daily', {}, {
  repeat: { pattern: '5 0 * * *' },
});
// Processor: scan Redis keys, write ApiKeyUsage records, delete processed keys
```

### Anti-Patterns to Avoid
- **Storing API keys in plaintext:** Always hash with SHA-256 before storage. The raw key is shown once at creation and never retrievable again.
- **Synchronous webhook delivery:** Never deliver webhooks in the request path. Always queue via BullMQ.
- **Polling for webhook status:** Use BullMQ's built-in event listeners and job state tracking, not custom polling.
- **Separate auth middleware for API keys:** Use NestJS guard pattern (CanActivate) to stay consistent with existing AuthGuard.
- **Building custom retry logic:** BullMQ handles retries natively -- do not implement manual retry loops.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API key generation | Custom random string logic | `crypto.randomBytes(32).toString('hex')` | Cryptographically secure, standard library |
| Webhook retry with backoff | setTimeout chains or cron | BullMQ with backoff config | Already set up, handles failures, persistence, monitoring |
| HMAC signatures | Custom signing logic | `crypto.createHmac('sha256', secret)` | Standard library, timing-safe comparison via `timingSafeEqual` |
| Swagger UI | Custom API docs page | @nestjs/swagger SwaggerModule | Already in deps, auto-generates from decorators |
| Usage counting (hot path) | PostgreSQL per-request INSERT | Redis INCR + daily aggregation | Redis handles high-throughput counting; PG for durable aggregates |
| API key prefix parsing | Regex on full key | Simple `key.startsWith('sk_live_')` check | Prefix is cosmetic identifier only, hash is for auth |

**Key insight:** This phase is entirely implementable with existing dependencies. The complexity is in integration (hooking into StatusService, adding guards to existing controllers, Swagger decorators on existing endpoints) rather than new technology.

## Common Pitfalls

### Pitfall 1: Forgetting Raw Body for HMAC Verification
**What goes wrong:** Developers verifying webhooks compute HMAC on re-serialized JSON, which may differ from the original byte sequence.
**Why it happens:** JSON.stringify() may reorder keys or change whitespace compared to the sent payload.
**How to avoid:** Document clearly that developers must use the raw request body for HMAC verification. Use `JSON.stringify(payload)` consistently on the sending side and instruct developers to verify against the raw body.
**Warning signs:** Webhook verification failures reported by developers even though the secret is correct.

### Pitfall 2: API Key Hash Lookup Performance
**What goes wrong:** Slow API key validation on every request if hash column is not indexed.
**Why it happens:** SHA-256 hash is a 64-character hex string; without an index, it scans full table.
**How to avoid:** Add `@@index([keyHash])` on the ApiKey model. Also add `@@index([orgId])` for scoped queries.
**Warning signs:** Increasing latency on API-key-authenticated requests as key count grows.

### Pitfall 3: FeatureGuard orgId Source for API Key Requests
**What goes wrong:** FeatureGuard reads `request.params.orgId` but API key requests set orgId via CLS, not URL params.
**Why it happens:** FeatureGuard was written for session-based auth where orgId comes from session's activeOrganizationId set in CLS.
**How to avoid:** Update FeatureGuard to also read orgId from CLS (via ClsService) when not found in params. The existing FeatureGuard reads `request.params?.orgId` which won't work with API key auth.
**Warning signs:** Feature-gated API key endpoints always return 403 "Organization context required".

### Pitfall 4: Webhook Delivery Timeout
**What goes wrong:** Webhook delivery hangs waiting for slow receiver, blocking the BullMQ worker.
**Why it happens:** No timeout on the HTTP POST to the webhook URL.
**How to avoid:** Set a 10-second timeout on webhook delivery HTTP calls. Use AbortController with fetch() or axios timeout config.
**Warning signs:** Webhook delivery queue backs up, delays increase for all subscriptions.

### Pitfall 5: Batch Session Endpoint Without Limit
**What goes wrong:** A single batch request creates sessions for thousands of cameras, overloading the database.
**Why it happens:** No validation on array size in the batch endpoint.
**How to avoid:** Set a reasonable max (e.g., 50 cameras per batch call). Validate with Zod `.max(50)` on the array.
**Warning signs:** Timeout errors on batch session creation, database connection pool exhaustion.

### Pitfall 6: Swagger Decorators Missing on Existing Controllers
**What goes wrong:** Swagger UI shows endpoints but with no request/response types, making it useless for developers.
**Why it happens:** Existing controllers don't have @ApiOperation, @ApiResponse, @ApiParam decorators.
**How to avoid:** Add decorators to ALL existing controllers (cameras, streams, playback, policies), not just new ones. This is the bulk of the Swagger work.
**Warning signs:** Swagger UI shows generic "object" types instead of actual DTOs.

## Code Examples

### API Key Creation
```typescript
// Source: Node.js crypto docs + industry patterns
import { createHash, randomBytes } from 'crypto';

function generateApiKey(): { rawKey: string; keyHash: string; prefix: string } {
  const raw = randomBytes(32).toString('hex');
  const prefix = 'sk_live_';
  const rawKey = `${prefix}${raw}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  return { rawKey, keyHash, prefix };
}
```

### HMAC Webhook Signing
```typescript
// Source: Node.js crypto + GitHub/Stripe webhook patterns
import { createHmac, timingSafeEqual } from 'crypto';

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = signPayload(payload, secret);
  return timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex'),
  );
}
```

### Swagger Decorator Example on Existing Controller
```typescript
// Source: @nestjs/swagger docs
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Cameras')
@Controller('api/cameras')
export class CamerasController {
  @Post()
  @ApiOperation({ summary: 'Register a new camera' })
  @ApiResponse({ status: 201, description: 'Camera created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiBearerAuth()
  async create(@Body() dto: CreateCameraDto) { ... }
}
```

### Prisma Schema for New Models
```prisma
// Source: Codebase conventions (org_id pattern, @@index)
model ApiKey {
  id          String    @id @default(uuid())
  orgId       String
  name        String
  keyHash     String    @unique
  prefix      String    // "sk_live_" -- for display (last 4 chars)
  lastFour    String    // Last 4 chars of raw key for identification
  scope       String    // "PROJECT" or "SITE"
  scopeId     String    // projectId or siteId
  revokedAt   DateTime?
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  usageRecords ApiKeyUsage[]

  @@index([orgId])
  @@index([keyHash])
  @@index([scopeId])
}

model ApiKeyUsage {
  id          String   @id @default(uuid())
  apiKeyId    String
  apiKey      ApiKey   @relation(fields: [apiKeyId], references: [id], onDelete: Cascade)
  date        DateTime @db.Date
  requests    Int      @default(0)
  bandwidth   BigInt   @default(0) // bytes
  createdAt   DateTime @default(now())

  @@unique([apiKeyId, date])
  @@index([apiKeyId])
  @@index([date])
}

model WebhookSubscription {
  id          String    @id @default(uuid())
  orgId       String
  url         String
  secret      String    // HMAC secret (stored encrypted or hashed)
  events      String[]  @default([]) // ["camera.online", "camera.offline", ...]
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  deliveries  WebhookDelivery[]

  @@index([orgId])
  @@index([isActive])
}

model WebhookDelivery {
  id               String   @id @default(uuid())
  subscriptionId   String
  subscription     WebhookSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  eventType        String
  payload          Json
  responseStatus   Int?
  responseBody     String?
  attempts         Int      @default(0)
  lastAttemptAt    DateTime?
  completedAt      DateTime?
  failedAt         DateTime?
  createdAt        DateTime @default(now())

  @@index([subscriptionId])
  @@index([eventType])
  @@index([createdAt])
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Passport.js + passport-headerapikey | Custom NestJS guard (CanActivate) | NestJS 10+ | Simpler, no extra dependency, follows existing AuthGuard pattern |
| Separate Swagger server | @nestjs/swagger in-process | Always | Single deployment, auto-discovers routes |
| Manual webhook retry loops | BullMQ built-in backoff | BullMQ 4+ | Reliable, persistent, configurable |
| Per-request usage logging to DB | Redis INCR + daily aggregation | Common pattern | Handles high throughput without DB bottleneck |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SHA-256 is appropriate for API key hashing (not bcrypt) | Standard Stack | LOW -- SHA-256 is industry standard for high-entropy random keys. bcrypt would work but adds unnecessary latency on every API call. |
| A2 | 50 cameras per batch is a reasonable limit | Pitfalls | LOW -- can be adjusted. Too low = annoying, too high = DB strain. |
| A3 | Webhook secret should be stored as plaintext (not hashed) | Code Examples | MEDIUM -- the server needs the raw secret to compute HMAC on outgoing payloads. Cannot hash it. Should be encrypted at rest if possible. |
| A4 | Redis INCR for usage counting is sufficient for single-server deployment | Architecture Patterns | LOW -- confirmed by project constraint of single-server Docker Compose deployment. |

## Open Questions

1. **Webhook secret storage**
   - What we know: Server must have raw secret to sign outgoing payloads. Cannot use one-way hash.
   - What's unclear: Whether to encrypt at rest (adds complexity) or store plaintext (simpler, acceptable for v1).
   - Recommendation: Store plaintext for v1. The secret is generated server-side and shown once to developer. Encryption at rest can be added later.

2. **FeatureGuard orgId resolution for API key auth**
   - What we know: Current FeatureGuard reads from `request.params?.orgId`. ApiKeyGuard sets orgId via CLS.
   - What's unclear: Whether FeatureGuard should be modified to also check CLS, or if a new ApiKeyFeatureGuard is needed.
   - Recommendation: Modify FeatureGuard to fall back to CLS when params.orgId is not present. Single guard, consistent behavior.

3. **Swagger decorator coverage scope**
   - What we know: D-06 wants Swagger at `/api/docs`. Existing controllers have no decorators.
   - What's unclear: How much effort to invest in decorating ALL existing endpoints vs. only new developer-facing ones.
   - Recommendation: Decorate all existing controllers (cameras, streams, playback, policies, settings) to provide a complete API reference. This is the main value of D-02.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/api && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEV-01 | API key CRUD + scoping + usage tracking | unit + integration | `cd apps/api && npx vitest run tests/api-keys/api-keys.test.ts -x` | No -- Wave 0 |
| DEV-01 | ApiKeyGuard authenticates via X-API-Key header | unit | `cd apps/api && npx vitest run tests/api-keys/api-key-guard.test.ts -x` | No -- Wave 0 |
| DEV-02 | Swagger UI accessible at /api/docs | smoke | `curl -s http://localhost:3003/api/docs | grep -q swagger` | No -- Wave 0 |
| DEV-03 | In-app documentation pages render | manual-only | Manual browser verification | N/A |
| DEV-04 | Webhook subscription CRUD + delivery | integration | `cd apps/api && npx vitest run tests/webhooks/webhooks.test.ts -x` | No -- Wave 0 |
| DEV-04 | HMAC signature generation + verification | unit | `cd apps/api && npx vitest run tests/webhooks/hmac.test.ts -x` | No -- Wave 0 |
| DEV-05 | Batch session creation | integration | `cd apps/api && npx vitest run tests/playback/batch-sessions.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** Quick run on changed test files
- **Per wave merge:** Full suite `cd apps/api && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/api/tests/api-keys/api-keys.test.ts` -- covers DEV-01
- [ ] `apps/api/tests/api-keys/api-key-guard.test.ts` -- covers DEV-01
- [ ] `apps/api/tests/webhooks/webhooks.test.ts` -- covers DEV-04
- [ ] `apps/api/tests/webhooks/hmac.test.ts` -- covers DEV-04
- [ ] `apps/api/tests/playback/batch-sessions.test.ts` -- covers DEV-05

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | ApiKeyGuard with SHA-256 hashed key lookup, timing-safe comparison |
| V3 Session Management | no | API keys are stateless; session auth handled by existing AuthGuard |
| V4 Access Control | yes | API key scoping (project/site), FeatureGuard for API_KEYS/WEBHOOKS toggles |
| V5 Input Validation | yes | Zod schemas for all DTOs (create key, create webhook, batch sessions) |
| V6 Cryptography | yes | HMAC-SHA256 for webhook signing, SHA-256 for key hashing, crypto.randomBytes for key generation |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leakage in logs | Information Disclosure | Never log raw API keys; log only prefix + last4. Mask in error responses. |
| Webhook URL SSRF | Tampering | Validate webhook URLs (HTTPS only, no private IPs). Block localhost, 10.x, 192.168.x, 169.254.x. |
| Timing attack on key lookup | Information Disclosure | SHA-256 hash comparison is inherently constant-time at DB level (index lookup). |
| Webhook replay attack | Spoofing | Include timestamp in signature payload; developers should reject payloads older than 5 minutes. |
| Batch endpoint abuse | Denial of Service | Limit batch size (50), existing ThrottlerModule `apikey` profile (30/min) applies. |

## Sources

### Primary (HIGH confidence)
- Codebase files: `apps/api/src/auth/guards/auth.guard.ts`, `apps/api/src/playback/playback.service.ts`, `apps/api/src/status/status.service.ts`, `apps/api/src/srs/srs-callback.controller.ts`, `apps/api/src/features/features.guard.ts`, `apps/api/src/app.module.ts`, `apps/api/src/prisma/schema.prisma`
- npm registry: @nestjs/swagger 11.2.7, bullmq 5.73.4 [VERIFIED: npm view]
- [BullMQ Retrying Failing Jobs docs](https://docs.bullmq.io/guide/retrying-failing-jobs) -- exponential backoff configuration
- [NestJS Guards docs](https://docs.nestjs.com/guards) -- CanActivate pattern
- Node.js crypto module -- HMAC, hash, randomBytes APIs

### Secondary (MEDIUM confidence)
- [Hookdeck HMAC verification guide](https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification) -- webhook signing best practices
- [NestJS multi-tenant API key pattern](https://u11d.com/blog/secure-nestjs-multi-tenant-api-key-authentication/) -- X-API-Key guard pattern
- [GitHub webhook verification docs](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) -- HMAC-SHA256 industry pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in package.json, versions verified against npm registry
- Architecture: HIGH -- follows established codebase patterns (guard, module, BullMQ), verified against existing code
- Pitfalls: HIGH -- based on codebase-specific analysis (FeatureGuard orgId issue, existing ThrottlerModule config)

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable -- no fast-moving dependencies)
