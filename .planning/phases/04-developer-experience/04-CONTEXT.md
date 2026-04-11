# Phase 4: Developer Experience - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Developers can programmatically manage cameras and streams using scoped API keys with full documentation and event notifications. Includes API key management with project/site scoping and usage tracking, developer portal with interactive API reference (Swagger UI) and quick start guide, webhook subscriptions for camera events with HMAC signatures, in-app documentation guides, and batch playback session creation. No dashboard/monitoring (Phase 5), no cluster scaling (Phase 6), no recordings (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### API Key Design
- **D-01:** Authentication via `X-API-Key` header — dedicated header separate from session auth, no collision with Better Auth Bearer tokens
- **D-02:** API keys scoped to Project or Site level — matches existing hierarchy (Organization > Project > Site > Camera). Key scoped to project accesses all cameras in that project; key scoped to site accesses only cameras in that site
- **D-03:** Usage tracking as daily aggregates — requests/day and bandwidth/day stored as summary records per API key. Lightweight storage, sufficient for usage dashboard and billing prep
- **D-04:** API key format: prefixed string (e.g., `sk_live_xxx`) — key shown once at creation, stored as hash in DB. Standard revoke/regenerate flow

### Developer Portal
- **D-05:** Hybrid approach — Custom Next.js portal pages at `/admin/developer/*` for API keys, webhooks, usage + Swagger UI embed/link for interactive API reference
- **D-06:** Swagger UI at `/api/docs` served by NestJS @nestjs/swagger (v11, already in deps) — public access, no login required. Developers can evaluate the API before signing up
- **D-07:** curl examples pre-filled with real data — user's actual API key + real camera IDs populated in examples (like Stripe dashboard). Copy-paste and run immediately
- **D-08:** Embed snippet templates in Quick Start section — 3-step guide: (1) Create API key, (2) Create playback session, (3) Embed with iframe/hls.js/React snippet. Fulfills Phase 3 deferred embed templates

### Webhook System
- **D-09:** Camera events only for v1 — 4 event types: `camera.online`, `camera.offline`, `camera.degraded`, `camera.reconnecting`. Matches DEV-04 requirement exactly
- **D-10:** Exponential backoff retry with 5 attempts — intervals ~1m, 5m, 30m, 2h, 12h. Uses existing BullMQ infrastructure for job queuing and retry logic
- **D-11:** HMAC-SHA256 signature on every delivery — secret per webhook subscription, signature in `X-Webhook-Signature` header. Developer verifies with shared secret
- **D-12:** Recent deliveries log visible in portal — shows payload, response status, timestamp, retry attempts per delivery. Developer can debug failed webhooks

### In-App Documentation
- **D-13:** Documentation as in-app Next.js pages at `/admin/developer/docs/*` — content lives in the app, no separate docs site to host/maintain
- **D-14:** Five documentation guides:
  1. **API Workflow Guide** — Getting started: create key, create session, embed stream (end-to-end)
  2. **Policies Guide** — Policy inheritance, TTL, viewer limits, domain allowlist configuration
  3. **Stream Profiles Guide** — Passthrough vs transcode, resolution/FPS/codec options
  4. **Webhooks Guide** — Subscribe, event types, HMAC verification, retry behavior
  5. **Streaming Basics Guide** — RTSP/HLS/codec fundamentals relevant to using the platform

### Batch Playback Sessions
- **D-15:** New endpoint `POST /api/playback/sessions/batch` — accepts array of camera IDs, returns array of session objects (cameraId, sessionId, hlsUrl, expiresAt). Extends existing PlaybackService

### Claude's Discretion
- API key hashing algorithm (bcrypt, SHA-256, etc.)
- Exact Prisma schema design for ApiKey, ApiKeyUsage, WebhookSubscription, WebhookDelivery tables
- Swagger decorator strategy on existing controllers
- Portal page layout and component design
- Documentation content writing and formatting
- BullMQ queue configuration for webhook delivery
- Daily aggregation job scheduling (cron timing)
- Batch session creation limit (max cameras per batch)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Developer Experience Requirements
- `.planning/REQUIREMENTS.md` §Developer Experience — DEV-01 through DEV-05 requirements

### Prior Phase Context (Must Read)
- `.planning/phases/01-foundation-multi-tenant/01-CONTEXT.md` — RLS pattern, package limits, role model, feature toggle system (FeatureKey.API_KEYS, FeatureKey.WEBHOOKS already defined)
- `.planning/phases/02-stream-engine-camera-management/02-CONTEXT.md` — SRS callback handler, camera status state machine, StatusGateway WebSocket, Project > Site > Camera hierarchy
- `.planning/phases/03-playback-security/03-CONTEXT.md` — JWT playback tokens (HS256), session creation endpoint, three-tier rate limiting, embed page at /embed/{session}

### Existing Code (Must Read)
- `apps/api/src/playback/playback.controller.ts` — Existing POST /cameras/:cameraId/sessions endpoint (extend for batch)
- `apps/api/src/playback/playback.service.ts` — JWT signing pattern with jsonwebtoken, session creation logic
- `apps/api/src/auth/guards/auth.guard.ts` — Session auth guard pattern (reference for API key guard)
- `apps/api/src/features/feature-key.enum.ts` — FeatureKey.API_KEYS and FeatureKey.WEBHOOKS already in enum
- `apps/api/src/app.module.ts` — ThrottlerModule with 3 profiles (global, tenant, apikey) already configured
- `apps/api/src/srs/srs-callback.controller.ts` — Camera event source (on_publish/on_unpublish triggers for webhook events)

### Tech Stack
- `CLAUDE.md` §Recommended Web App Stack — @nestjs/swagger, BullMQ, ioredis, jsonwebtoken
- `CLAUDE.md` §SRS HTTP Callbacks — Event data fields for webhook payloads

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/playback/playback.service.ts` — JWT signing pattern (HS256 + jsonwebtoken) reusable for API key token generation
- `apps/api/src/auth/guards/auth.guard.ts` — Guard pattern with CLS org_id injection, template for ApiKeyGuard
- `apps/api/src/features/` — FeatureGuard + FeatureKey enum already has API_KEYS and WEBHOOKS toggles
- `apps/api/src/app.module.ts` — ThrottlerModule with `apikey` profile already configured (30/min)
- BullMQ already set up for background jobs — reuse for webhook delivery queue and usage aggregation
- `apps/web/src/components/ui/` — Full shadcn/ui library for portal UI
- `apps/web/src/lib/api.ts` — apiFetch() helper for frontend API calls

### Established Patterns
- NestJS modular architecture: one feature = controller + service + module + dto folder
- Zod safeParse in controllers for request validation
- nestjs-cls for request-scoped org context (auto-populated by AuthGuard)
- Prisma tenancy extension for automatic org_id filtering
- @Global() modules for cross-cutting concerns (FeaturesModule, StatusModule)
- Docker Compose with sms-network bridge for internal service communication

### Integration Points
- Camera status changes in StreamsModule → emit webhook events
- SRS callbacks (on_publish/on_unpublish) → trigger camera.online/camera.offline webhooks
- StatusGateway WebSocket → can also trigger webhook delivery alongside real-time UI updates
- Existing admin layout + sidebar nav → add Developer section
- @nestjs/swagger v11 in package.json → needs bootstrap integration in main.ts

</code_context>

<specifics>
## Specific Ideas

- curl examples pre-filled with real user data (like Stripe dashboard) — not placeholder templates
- Quick Start is a 3-step flow: Create key → Create session → Embed stream
- Streaming Basics guide covers fundamentals (RTSP/HLS/codecs) that developers need to understand the platform
- Embed snippet templates fulfill Phase 3's deferred idea (D-21 from Phase 3 CONTEXT.md)
- API docs public access lets developers evaluate before signing up

</specifics>

<deferred>
## Deferred Ideas

- Redesign camera detail page — UI todo, not related to Developer Experience scope
- Stream/playback/policy webhook events — start with camera events only, expand event catalog later
- Per-request usage logs — daily aggregates sufficient for v1, can add detailed logs later
- SDK generation from OpenAPI spec — future enhancement after API stabilizes
- API versioning strategy — defer until v2 API changes are needed

</deferred>

---

*Phase: 04-developer-experience*
*Context gathered: 2026-04-11*
