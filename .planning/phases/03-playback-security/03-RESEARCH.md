# Phase 3: Playback & Security - Research

**Researched:** 2026-04-10
**Domain:** JWT playback sessions, HLS security, policy inheritance, rate limiting
**Confidence:** HIGH

## Summary

Phase 3 transforms the platform from internal-only camera viewing to external developer-facing playback. The core flow is: developer calls `POST /cameras/{id}/sessions`, receives a JWT-signed HLS URL, and embeds it on their website. SRS `on_play` callback validates the JWT + domain allowlist before allowing playback. A policy system with per-field merge inheritance (Camera > Site > Project > System) controls TTL, viewer limits, and domain restrictions.

The implementation builds heavily on existing infrastructure: SRS callback controller already handles on_play/on_stop with viewer counting, the Camera > Site > Project hierarchy exists in Prisma, and Redis is available for rate limiting storage. New components needed: PlaybackSession + Policy Prisma models, JWT signing/verification with `jose`, policy resolution service, `@nestjs/throttler` with Redis storage for rate limiting, HLS key serving endpoint, and embed page in Next.js.

**Primary recommendation:** Use `jose` (v6.2.2) for JWT operations -- it's a modern, zero-dependency, Web Crypto API-based library that works natively in Node.js 22. Use `@nestjs/throttler` (v6.5.0) with `@nestjs/throttler/dist/storages/redis.storage` for three-tier rate limiting. Extend the existing `srs-callback.controller.ts` on_play handler to validate JWT + domain in a single callback.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** SRS on_play callback validation -- JWT token embedded in HLS URL as query param, SRS on_play callback sends token to backend for verification (reuses existing srs-callback.controller.ts handler), return code 0 to allow or non-zero to reject
- **D-02:** POST /cameras/{id}/sessions creates a new session each call -- returns hlsUrl with token embedded, sessionId, and expiresAt. Each call generates a unique token/session
- **D-03:** API response contains only sessionId, hlsUrl, expiresAt -- no embed code in API response
- **D-04:** Session TTL default 2 hours -- configurable per policy, suitable for CCTV live stream use case (PLAY-04)
- **D-05:** Viewer count enforced per camera, not per token -- total active viewers on a camera must not exceed maxViewers in resolved policy. Multiple viewers can share the same token URL
- **D-06:** Viewer counting uses existing SRS on_play/on_stop callbacks that already increment/decrement viewer count in srs-callback.controller.ts
- **D-07:** No active kick on token expiry -- viewers watching when token expires continue watching until they disconnect. Reconnecting after expiry is rejected at on_play
- **D-08:** Developer is responsible for token renewal
- **D-09:** Single Policy table, assignable at Camera, Site, Project, or System level -- policy resolution order: Camera > Site > Project > System defaults (POL-02)
- **D-10:** Merge per-field resolution -- each field resolves independently from the nearest level that has it set
- **D-11:** Value 0 = unlimited (e.g., maxViewers=0 means no viewer limit)
- **D-12:** System Default Policy seeded in DB via migration -- TTL=2h, maxViewers=10, domains=[], allowNoReferer=true
- **D-13:** Domain check at SRS on_play callback -- uses Referer/pageUrl sent by browser to verify against allowlist
- **D-14:** Empty domain allowlist (domains=[]) means allow all domains
- **D-15:** Wildcard subdomain support -- e.g., "*.example.com" matches sub.example.com
- **D-16:** No-Referer behavior configurable per policy -- allowNoReferer field (boolean)
- **D-17:** NestJS Throttler with Redis storage -- three tiers: Global, Per-tenant, Per-API-key
- **D-18:** HLS segment encryption enabled for all cameras -- SRS hls_keys=on with AES-128. Backend serves decryption key only to verified sessions
- **D-19:** Three embed snippet formats: iframe, hls.js, React component -- available on camera detail page
- **D-20:** Embed page at /embed/{session} -- minimal fullscreen video player
- **D-21:** Embed snippets also available in Developer Portal (Phase 4) as templates

### Claude's Discretion
- JWT signing algorithm and secret management approach
- Exact Prisma schema design for PlaybackSession, Policy tables
- Policy resolution service implementation pattern
- Throttler configuration values for each tier
- HLS key serving endpoint implementation
- Embed page design and player library choice
- Error response format for rejected playback attempts

### Deferred Ideas (OUT OF SCOPE)
- Active session kick via background job (cron + SRS DELETE /api/v1/clients/{id})
- 1 token = 1 viewer enforcement
- Embed snippet templates in Developer Portal (Phase 4)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAY-01 | API endpoint `POST /cameras/{id}/sessions` returns time-limited HLS playback URL | New PlaybackModule with controller + service; jose JWT signing; PlaybackSession Prisma model |
| PLAY-02 | JWT-signed playback tokens with camera scope, domain restriction, expiry | jose library for HS256 signing; JWT payload: { sub: sessionId, cam: cameraId, org: orgId, domains: string[], exp } |
| PLAY-03 | Domain allowlist enforcement on HLS playback (wildcard subdomain support) | on_play callback extracts pageUrl/Referer; wildcard matching with regex conversion |
| PLAY-04 | Session TTL configurable per policy (default 2 hours) | Policy model with ttlSeconds field; resolved via per-field merge from Camera > Site > Project > System |
| PLAY-05 | Viewer concurrency limits per camera enforced at session creation | Check StatusService.getViewerCount() against resolved policy maxViewers at session creation |
| PLAY-06 | Embed code generation (iframe + hls.js snippet) | Camera detail page UI with `</>` button; embed page at /embed/{session} in Next.js |
| PLAY-07 | HLS segment encryption via SRS hls_keys with backend key serving | SRS hls_keys=on config; backend endpoint serves .key files only to verified sessions |
| POL-01 | Playback policies with TTL, rate limit, viewer limit, domain allowlist | Single Policy Prisma model with level enum (SYSTEM/PROJECT/SITE/CAMERA) + foreign keys |
| POL-02 | Policy resolution order: Camera > Site > Project > System defaults | PolicyService.resolve(cameraId) -- queries all 4 levels, merges per-field with closest-level-wins |
| POL-03 | Three-tier rate limiting (global, per-tenant, per-API-key) | @nestjs/throttler v6.5.0 with Redis storage; custom ThrottlerGuard for multi-tier |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jose | 6.2.2 | JWT signing/verification | Zero-dependency, Web Crypto API native, TypeScript-first, edge-compatible. No native bindings like jsonwebtoken [VERIFIED: npm registry] |
| @nestjs/throttler | 6.5.0 | Rate limiting | Official NestJS module, supports NestJS 11, has Redis storage adapter built-in [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hls.js | 1.6.15 | HLS player for embed page | Already installed in web app. Use for /embed/{session} page [VERIFIED: npm registry, already in web package.json] |
| ioredis | 5.10.1 | Redis client for throttler storage | Already installed in API. Used by BullMQ and now by Throttler [VERIFIED: already in api package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jose | @nestjs/jwt + jsonwebtoken | @nestjs/jwt wraps jsonwebtoken which has native deps; jose is lighter, faster, and better TypeScript support |
| @nestjs/throttler | Custom Redis-based rate limiter | Throttler integrates with NestJS guards natively; custom would require more code for same functionality |

**Installation:**
```bash
cd apps/api && npm install jose @nestjs/throttler
```

**Version verification:**
- jose: 6.2.2 (latest on npm) [VERIFIED: npm registry 2026-04-10]
- @nestjs/throttler: 6.5.0 (latest, supports NestJS 7-11) [VERIFIED: npm registry 2026-04-10]

## Architecture Patterns

### Recommended New Modules
```
apps/api/src/
├── playback/                  # NEW: Playback session management
│   ├── playback.module.ts
│   ├── playback.controller.ts # POST /cameras/:id/sessions, GET /playback/keys/*
│   ├── playback.service.ts    # Session creation, JWT signing
│   └── dto/
│       └── create-session.dto.ts
├── policies/                  # NEW: Policy CRUD + resolution
│   ├── policies.module.ts
│   ├── policies.controller.ts # CRUD for policies
│   ├── policies.service.ts    # Policy resolution with per-field merge
│   └── dto/
│       ├── create-policy.dto.ts
│       └── update-policy.dto.ts
├── srs/                       # EXTEND: Add JWT + domain verification to on_play
│   ├── srs-callback.controller.ts  # Modify on_play to verify JWT + domain
│   └── ...
├── settings/                  # EXTEND: Ensure hls_keys config is enabled
│   └── settings.service.ts    # generateSrsConfig already has hls_keys block
apps/web/src/
├── app/
│   ├── embed/
│   │   └── [session]/
│   │       └── page.tsx       # NEW: Minimal embed player page
│   ├── (dashboard)/
│   │   └── ...                # EXTEND: Add embed snippet UI to camera detail
```

### Pattern 1: JWT Playback Token with jose
**What:** Sign and verify JWT tokens for playback session authentication
**When to use:** Session creation (sign) and on_play callback (verify)
**Example:**
```typescript
// Source: jose npm documentation [VERIFIED]
import { SignJWT, jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_PLAYBACK_SECRET);

// Sign
const token = await new SignJWT({
  cam: cameraId,
  org: orgId,
  domains: resolvedPolicy.domains,
})
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(sessionId)
  .setIssuedAt()
  .setExpirationTime(`${ttlSeconds}s`)
  .sign(secret);

// Verify
const { payload } = await jwtVerify(token, secret);
// payload.sub = sessionId, payload.cam = cameraId, payload.exp = expiry
```

### Pattern 2: Per-Field Policy Merge Resolution
**What:** Resolve each policy field independently from the nearest hierarchy level
**When to use:** When creating a playback session -- resolve all policy fields for the camera
**Example:**
```typescript
// PolicyService.resolve(cameraId: string): ResolvedPolicy
async resolve(cameraId: string): Promise<ResolvedPolicy> {
  const camera = await this.prisma.camera.findUnique({
    where: { id: cameraId },
    include: { site: { include: { project: true } } },
  });

  // Fetch policies for all applicable levels
  const policies = await this.prisma.policy.findMany({
    where: {
      OR: [
        { level: 'CAMERA', cameraId },
        { level: 'SITE', siteId: camera.siteId },
        { level: 'PROJECT', projectId: camera.site.projectId },
        { level: 'SYSTEM' },
      ],
    },
  });

  // Priority order: CAMERA > SITE > PROJECT > SYSTEM
  const priority = { CAMERA: 0, SITE: 1, PROJECT: 2, SYSTEM: 3 };
  policies.sort((a, b) => priority[a.level] - priority[b.level]);

  // Per-field merge: first non-null value wins
  const fields = ['ttlSeconds', 'maxViewers', 'domains', 'allowNoReferer', 'rateLimit'];
  const resolved: any = {};
  for (const field of fields) {
    for (const policy of policies) {
      if (policy[field] !== null && policy[field] !== undefined) {
        resolved[field] = policy[field];
        break;
      }
    }
  }
  return resolved as ResolvedPolicy;
}
```

### Pattern 3: SRS on_play Callback with JWT + Domain Verification
**What:** Extend existing on_play handler to verify JWT token and domain before allowing playback
**When to use:** Every time a viewer starts playing an HLS stream
**Example:**
```typescript
// Extend srs-callback.controller.ts on_play
@Post('on-play')
async onPlay(@Body() body: any) {
  const { orgId, cameraId } = this.parseStreamKey(body.stream, body.app);
  if (!orgId || !cameraId) return { code: 0 }; // internal streams

  // Extract token from param (SRS sends query params in 'param' field)
  // URL: /live/org/cam.m3u8?token=xxx -> param: "?token=xxx"
  const token = this.extractToken(body.param);
  if (!token) {
    this.logger.warn(`Playback rejected: no token for camera=${cameraId}`);
    return { code: 403 };
  }

  // Verify JWT
  const session = await this.playbackService.verifyToken(token, cameraId, orgId);
  if (!session) {
    return { code: 403 };
  }

  // Verify domain (pageUrl from SRS callback body)
  const pageUrl = body.pageUrl || '';
  if (!this.playbackService.verifyDomain(pageUrl, session.domains, session.allowNoReferer)) {
    return { code: 403 };
  }

  // Check viewer limit
  const currentViewers = this.statusService.getViewerCount(cameraId);
  const maxViewers = session.maxViewers;
  if (maxViewers > 0 && currentViewers >= maxViewers) {
    return { code: 403 };
  }

  // Allow playback + increment viewers
  const count = this.statusService.incrementViewers(cameraId);
  this.statusGateway.broadcastViewerCount(orgId, cameraId, count);
  return { code: 0 };
}
```

### Pattern 4: NestJS Throttler Multi-Tier Configuration
**What:** Three-tier rate limiting with Redis storage
**When to use:** All API endpoints, especially playback session creation
**Example:**
```typescript
// app.module.ts or a dedicated throttler module
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nestjs/throttler/dist/storages/redis.storage';

ThrottlerModule.forRoot({
  throttlers: [
    { name: 'global', ttl: 60000, limit: 100 },       // 100 req/min platform-wide
    { name: 'tenant', ttl: 60000, limit: 60 },         // 60 req/min per org
    { name: 'apikey', ttl: 60000, limit: 30 },         // 30 req/min per API key
  ],
  storage: new ThrottlerStorageRedisService({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6380', 10),
  }),
});
```

### Anti-Patterns to Avoid
- **Checking viewer limit only at session creation, not at on_play:** Multiple viewers can use the same token URL. The limit MUST be checked at on_play callback time (when a viewer actually starts watching), not just at session creation. Session creation should also check as a first gate, but on_play is the authoritative check.
- **Storing JWT secret in code:** Use environment variable `JWT_PLAYBACK_SECRET`. Generate a strong random secret (min 256 bits / 32 bytes).
- **Blocking on_play callback with expensive DB queries:** Policy resolution should be cached in the PlaybackSession record at creation time. on_play only needs to verify JWT + check cached fields.
- **Mixing internal preview auth with external playback auth:** Internal preview (Phase 2) uses session auth + backend proxy. External playback uses JWT tokens. These are completely separate flows.

## Prisma Schema Design (Recommended)

```prisma
// ─────────────────────────────────────────────
// Phase 3: Playback & Security
// ─────────────────────────────────────────────

enum PolicyLevel {
  SYSTEM
  PROJECT
  SITE
  CAMERA
}

model Policy {
  id              String       @id @default(uuid())
  orgId           String?      // null for SYSTEM level
  level           PolicyLevel
  name            String
  description     String?

  // Nullable fields -- null means "inherit from next level"
  ttlSeconds      Int?         // Session TTL in seconds
  maxViewers      Int?         // Max concurrent viewers (0 = unlimited)
  domains         String[]     @default([])  // Domain allowlist (empty = allow all)
  allowNoReferer  Boolean?     // Allow requests without Referer header
  rateLimit       Int?         // Per-API-key requests per minute

  // Level-specific foreign keys (only one should be set based on level)
  cameraId        String?      @unique
  camera          Camera?      @relation(fields: [cameraId], references: [id], onDelete: Cascade)
  siteId          String?      @unique
  site            Site?        @relation(fields: [siteId], references: [id], onDelete: Cascade)
  projectId       String?      @unique
  project         Project?     @relation(fields: [projectId], references: [id], onDelete: Cascade)

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@index([orgId])
  @@index([level])
}

model PlaybackSession {
  id              String       @id @default(uuid())
  orgId           String
  cameraId        String
  camera          Camera       @relation(fields: [cameraId], references: [id], onDelete: Cascade)
  token           String       @unique    // JWT token (for lookup/revocation)
  hlsUrl          String                  // Full HLS URL with token embedded

  // Resolved policy snapshot at creation time (denormalized for fast on_play verification)
  ttlSeconds      Int
  maxViewers      Int
  domains         String[]     @default([])
  allowNoReferer  Boolean      @default(true)

  expiresAt       DateTime
  createdAt       DateTime     @default(now())

  @@index([orgId])
  @@index([cameraId])
  @@index([token])
  @@index([expiresAt])
}
```

**Notes:**
- Policy uses `@unique` on foreign keys so each Camera/Site/Project has at most one policy [ASSUMED]
- PlaybackSession stores resolved policy fields as a snapshot -- this avoids DB queries during on_play callback
- Camera and Site/Project models need `policy Policy?` relation added
- System default policy has `orgId = null` and `level = SYSTEM`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signing/verification | Custom HMAC implementation | `jose` library | Handles algorithm negotiation, claim validation, time-based expiry correctly |
| Rate limiting | Custom Redis INCR/EXPIRE logic | `@nestjs/throttler` with Redis storage | Handles race conditions, sliding windows, standard headers automatically |
| HLS player | Custom video.js/player wrapper | `hls.js` (already installed) | Industry standard, handles fMP4, AES-128 decryption, error recovery |
| Domain wildcard matching | Complex regex builder | Simple utility function with `.endsWith()` | Only need `*.example.com` matching -- 10 lines of code, not a library |

**Key insight:** The complexity in this phase is in the integration (SRS callback flow, policy resolution, JWT lifecycle) -- not in individual components. Each component (JWT, rate limiting, HLS player) has well-established library solutions.

## Common Pitfalls

### Pitfall 1: SRS `param` Field Encoding
**What goes wrong:** SRS sends query parameters in the `param` field of callback body, but the format varies. It may include the leading `?` or not.
**Why it happens:** SRS documentation shows `param: "?token=xxx"` with leading `?`, but some versions strip it.
**How to avoid:** Parse `body.param` with `new URLSearchParams(param.replace(/^\?/, ''))` to handle both cases.
**Warning signs:** Token extraction returns undefined despite being in the URL.

### Pitfall 2: Viewer Count Race Condition
**What goes wrong:** In-memory viewer counts (Map in StatusService) reset on server restart, causing count drift.
**Why it happens:** Current implementation uses `Map<string, number>` in memory -- not persisted.
**How to avoid:** For Phase 3, this is acceptable since SRS will send new on_play/on_stop events. Long-term, consider Redis-backed counts. Document this as a known limitation.
**Warning signs:** Viewer counts suddenly drop to 0 after API restart.

### Pitfall 3: HLS Key Serving Must Verify Session
**What goes wrong:** HLS encryption keys served without authentication, making encryption useless.
**Why it happens:** SRS writes key URLs in m3u8 playlist, browsers fetch them automatically. If the key endpoint is open, anyone can decrypt segments.
**How to avoid:** The key serving endpoint must extract and verify the JWT token. The HLS URL already has the token as a query param, and hls.js sends credentials/headers based on m3u8 content. Rewrite key URLs in the m3u8 to include the token.
**Warning signs:** HLS playback works without valid token.

### Pitfall 4: SRS `pageUrl` May Be Empty
**What goes wrong:** Domain allowlist check fails for legitimate viewers because SRS doesn't always send `pageUrl`.
**Why it happens:** `pageUrl` is only sent when the player (e.g., hls.js) provides it. VLC, curl, or players without browser context don't send it. Some browser privacy extensions strip Referer.
**How to avoid:** This is exactly why D-16 exists (`allowNoReferer` field). When `pageUrl` is empty, check the `allowNoReferer` flag from the resolved policy.
**Warning signs:** Viewers from legitimate embedded pages get rejected.

### Pitfall 5: Policy `domains` Array Empty vs. Null Semantics
**What goes wrong:** Empty array `[]` and `null` have different meanings but code treats them the same.
**Why it happens:** Per D-14, `domains=[]` means "allow all domains". But in the per-field merge, `null` means "inherit from parent level". These are different.
**How to avoid:** In the Policy Prisma model, use `String[] @default([])` for domains. In policy resolution, only skip a field if it's `null`/`undefined`, not if it's an empty array. Empty array is a valid value meaning "allow all".
**Warning signs:** Camera-level empty domains doesn't override site-level restrictive domains.

### Pitfall 6: @nestjs/throttler Redis Storage Import Path
**What goes wrong:** Import from wrong path causes module not found error.
**Why it happens:** The Redis storage adapter location changed between throttler versions.
**How to avoid:** For @nestjs/throttler v6.x, check the actual export path. The storage class may need to be imported from a specific subpath. [ASSUMED -- verify during implementation]
**Warning signs:** Module resolution error at startup.

## Code Examples

### HLS URL Format
```
# External playback URL format:
https://{platform-domain}/live/{orgId}/{cameraId}.m3u8?token={jwt}

# SRS internal URL that gets proxied/served:
http://srs:8080/live/{orgId}/{cameraId}.m3u8
```

### Domain Wildcard Matching Utility
```typescript
// Source: custom implementation based on D-15 requirements
function matchDomain(pageUrl: string, allowedDomains: string[], allowNoReferer: boolean): boolean {
  if (!pageUrl || pageUrl === '') {
    return allowNoReferer;
  }
  if (allowedDomains.length === 0) {
    return true; // D-14: empty = allow all
  }

  let hostname: string;
  try {
    hostname = new URL(pageUrl).hostname;
  } catch {
    return allowNoReferer; // Malformed URL treated as no referer
  }

  return allowedDomains.some((pattern) => {
    if (pattern === '*') return true;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // ".example.com"
      return hostname === pattern.slice(2) || hostname.endsWith(suffix);
    }
    return hostname === pattern;
  });
}
```

### Embed Page (Next.js)
```typescript
// apps/web/src/app/embed/[session]/page.tsx
// Minimal player using hls.js -- already installed in web app
'use client';
import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

export default function EmbedPage({ params }: { params: { session: string } }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Fetch session info to get hlsUrl
    // Initialize hls.js with the URL
    // Handle errors gracefully
  }, [params.session]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <video ref={videoRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jsonwebtoken (native deps) | jose (Web Crypto, zero deps) | ~2022 | No native compilation needed, faster, better TS types |
| Custom rate limiting middleware | @nestjs/throttler with Redis | NestJS 10+ | Built-in guard integration, standard headers |
| HLS with MPEG-TS segments | HLS with fMP4 segments | SRS v6 | Better codec support (H.265, AV1), already configured in Phase 2 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Policy uses @unique on foreign keys (one policy per Camera/Site/Project) | Prisma Schema Design | Would allow multiple policies per entity, breaking resolution logic. Low risk -- unique constraint is the right approach |
| A2 | @nestjs/throttler v6.5.0 Redis storage import path is `@nestjs/throttler/dist/storages/redis.storage` | Pattern 4 | Import may differ; verify actual export during implementation. Low impact -- easy to fix |
| A3 | SRS on_play callback sends `param` field containing URL query string with token | Pattern 3 / Pitfall 1 | If param field works differently, token extraction breaks. Medium risk -- must test with actual SRS |
| A4 | JWT_PLAYBACK_SECRET as env var is sufficient for HS256 signing | Architecture | If rotation is needed, would need key management. Low risk for v1 |
| A5 | hls.js automatically includes query params when fetching .key files referenced in m3u8 | Pitfall 3 | If not, key serving endpoint won't receive token and can't verify. Medium risk -- may need m3u8 rewriting |

## Open Questions

1. **HLS Key URL Token Propagation**
   - What we know: SRS writes `hls_key_url` in m3u8 as configured in srs.conf. The key URL pattern is `/keys/[app]/[stream]-[seq].key`.
   - What's unclear: When hls.js fetches the key file, does it append the same query params from the m3u8 URL? Or do we need to rewrite the key URLs in the m3u8 to include the token?
   - Recommendation: The playback proxy should rewrite key URLs in the m3u8 playlist to include the token, similar to how Phase 2's preview proxy rewrites segment URLs. This guarantees token propagation.

2. **Embed Page Session Resolution**
   - What we know: Embed page URL is `/embed/{session}`, needs to resolve to an HLS URL.
   - What's unclear: Should the embed page fetch session details from the API, or should the hlsUrl be encoded in the URL itself?
   - Recommendation: Embed page fetches session info from a public API endpoint `GET /api/playback/sessions/{id}` that returns the hlsUrl. This keeps URLs clean and allows session validation.

3. **External HLS URL Routing**
   - What we know: SRS serves HLS at `http://srs:8080/live/...` internally. External viewers need a public URL.
   - What's unclear: Should the backend proxy all HLS traffic (like Phase 2 preview), or should SRS be directly exposed?
   - Recommendation: For Phase 3, backend proxies HLS traffic for external playback (similar to internal preview pattern). This enables JWT verification at the proxy level AND key URL rewriting. Direct SRS exposure would bypass security. The playback controller serves as the HLS proxy with token verification.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `apps/api/vitest.config.ts` |
| Quick run command | `cd apps/api && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/api && npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAY-01 | POST /cameras/{id}/sessions returns session with hlsUrl | unit | `cd apps/api && npx vitest run tests/playback/session-creation.test.ts -x` | Wave 0 |
| PLAY-02 | JWT token contains camera scope, domains, expiry | unit | `cd apps/api && npx vitest run tests/playback/jwt-token.test.ts -x` | Wave 0 |
| PLAY-03 | Domain allowlist matching with wildcards | unit | `cd apps/api && npx vitest run tests/playback/domain-matching.test.ts -x` | Wave 0 |
| PLAY-04 | Session TTL from resolved policy | unit | `cd apps/api && npx vitest run tests/policies/policy-resolution.test.ts -x` | Wave 0 |
| PLAY-05 | Viewer limit enforcement | unit | `cd apps/api && npx vitest run tests/playback/viewer-limits.test.ts -x` | Wave 0 |
| PLAY-06 | Embed snippet generation | unit | `cd apps/api && npx vitest run tests/playback/embed-snippets.test.ts -x` | Wave 0 |
| PLAY-07 | HLS key serving requires valid session | unit | `cd apps/api && npx vitest run tests/playback/key-serving.test.ts -x` | Wave 0 |
| POL-01 | Policy CRUD operations | unit | `cd apps/api && npx vitest run tests/policies/policy-crud.test.ts -x` | Wave 0 |
| POL-02 | Per-field merge policy resolution | unit | `cd apps/api && npx vitest run tests/policies/policy-resolution.test.ts -x` | Wave 0 |
| POL-03 | Three-tier rate limiting | unit | `cd apps/api && npx vitest run tests/playback/rate-limiting.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/api && npx vitest run --reporter=verbose`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/playback/session-creation.test.ts` -- covers PLAY-01
- [ ] `tests/playback/jwt-token.test.ts` -- covers PLAY-02
- [ ] `tests/playback/domain-matching.test.ts` -- covers PLAY-03
- [ ] `tests/playback/viewer-limits.test.ts` -- covers PLAY-05
- [ ] `tests/playback/key-serving.test.ts` -- covers PLAY-07
- [ ] `tests/playback/rate-limiting.test.ts` -- covers POL-03
- [ ] `tests/policies/policy-crud.test.ts` -- covers POL-01
- [ ] `tests/policies/policy-resolution.test.ts` -- covers PLAY-04, POL-02

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | JWT token verification via jose (playback auth), session auth via better-auth (dashboard) |
| V3 Session Management | Yes | PlaybackSession with TTL expiry, no server-side session refresh for playback |
| V4 Access Control | Yes | Policy-based: domain allowlist, viewer concurrency limits, org-scoped data |
| V5 Input Validation | Yes | Zod schemas for API input, URL parsing with try/catch for domain matching |
| V6 Cryptography | Yes | HLS AES-128 encryption (SRS-managed), JWT HS256 signing with min 256-bit secret |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token replay/sharing | Spoofing | TTL expiry, domain restriction, viewer count limits |
| Direct SRS access bypass | Tampering | SRS on_play callback verifies token before allowing playback; SRS not exposed publicly |
| HLS segment theft | Information Disclosure | AES-128 encryption, key served only to verified sessions |
| Rate limit bypass | Denial of Service | Three-tier throttling with Redis-backed storage |
| Policy escalation | Elevation of Privilege | Org-scoped policy CRUD with RLS, system policy editable only by super admin |
| Missing Referer header abuse | Spoofing | Configurable allowNoReferer per policy (default true for convenience, can be locked down) |

## Project Constraints (from CLAUDE.md)

- **Stream Engine:** SRS v6 (ossrs/srs:6) -- all HLS delivery through SRS
- **Deployment:** Docker Compose single server
- **Security Model:** Session-based playback URLs + domain allowlist + API key
- **Backend:** NestJS 11.x with TypeScript strict mode
- **ORM:** Prisma 6.x with PostgreSQL 16
- **Frontend:** Next.js 15.x with App Router
- **Validation:** Zod safeParse in controllers
- **Real-time:** Socket.IO via StatusGateway
- **Jobs:** BullMQ for background processing
- **Redis:** Port 6380 (remapped from default)
- **Testing:** Vitest with fileParallelism disabled for DB tests

## Sources

### Primary (HIGH confidence)
- npm registry -- jose 6.2.2, @nestjs/throttler 6.5.0, hls.js 1.6.15 versions verified
- Existing codebase -- srs-callback.controller.ts, auth.guard.ts, settings.service.ts, cameras.controller.ts, status.service.ts, schema.prisma read and analyzed
- CLAUDE.md -- SRS callback events, HLS configuration, HTTP API surface

### Secondary (MEDIUM confidence)
- SRS documentation (referenced in CLAUDE.md) -- on_play callback param field behavior, hls_keys configuration

### Tertiary (LOW confidence)
- @nestjs/throttler Redis storage import path (A2) -- needs verification during implementation
- hls.js key URL propagation behavior (A5) -- needs testing with actual SRS HLS encryption

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- jose and @nestjs/throttler versions verified on npm, hls.js already installed
- Architecture: HIGH -- builds directly on existing patterns (callback controller, auth guard, CLS org context)
- Pitfalls: MEDIUM -- SRS callback param format and hls.js key propagation need runtime verification
- Policy design: HIGH -- per-field merge pattern is straightforward, schema design follows existing Prisma patterns

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable domain, 30 days)
