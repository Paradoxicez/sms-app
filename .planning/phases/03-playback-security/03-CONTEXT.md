# Phase 3: Playback & Security - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Developers can get a secure, time-limited HLS playback URL via a single API call and embed it on their website. Includes JWT-signed playback sessions, domain allowlist enforcement, viewer concurrency limits, playback policies with inheritance, HLS segment encryption, embed code generation, and three-tier rate limiting. No developer portal, API key management, or webhooks — those are Phase 4.

</domain>

<decisions>
## Implementation Decisions

### JWT Token & Session Flow
- **D-01:** SRS on_play callback validation — JWT token embedded in HLS URL as query param, SRS on_play callback sends token to backend for verification (reuses existing srs-callback.controller.ts handler), return code 0 to allow or non-zero to reject
- **D-02:** POST /cameras/{id}/sessions creates a new session each call — returns hlsUrl with token embedded, sessionId, and expiresAt. Each call generates a unique token/session
- **D-03:** API response contains only sessionId, hlsUrl, expiresAt — no embed code in API response
- **D-04:** Session TTL default 2 hours — configurable per policy, suitable for CCTV live stream use case (PLAY-04)

### Viewer Limits
- **D-05:** Viewer count enforced per camera, not per token — total active viewers on a camera must not exceed maxViewers in resolved policy. Multiple viewers can share the same token URL (e.g., embedded on a public webpage)
- **D-06:** Viewer counting uses existing SRS on_play/on_stop callbacks that already increment/decrement viewer count in srs-callback.controller.ts

### Token Expiry Behavior
- **D-07:** No active kick on token expiry — viewers watching when token expires continue watching until they disconnect. Reconnecting after expiry is rejected at on_play. Sufficient for CCTV use case; active kick can be added later if needed
- **D-08:** Developer is responsible for token renewal — frontend or server-side auto-renew before expiry to ensure seamless viewing experience

### Policy Data Model & Inheritance
- **D-09:** Single Policy table, assignable at Camera, Site, Project, or System level — policy resolution order: Camera > Site > Project > System defaults (POL-02)
- **D-10:** Merge per-field resolution — each field (TTL, maxViewers, domains, etc.) resolves independently from the nearest level that has it set. Camera sets TTL but not maxViewers → uses Camera TTL + Site/Project/System maxViewers
- **D-11:** Value 0 = unlimited (e.g., maxViewers=0 means no viewer limit)
- **D-12:** System Default Policy seeded in DB via migration — TTL=2h, maxViewers=10, domains=[], allowNoReferer=true. Super Admin can edit after deployment

### Domain Allowlist
- **D-13:** Domain check at SRS on_play callback — uses Referer/pageUrl sent by browser to verify against allowlist in resolved policy. Checked alongside JWT verification in the same callback
- **D-14:** Empty domain allowlist (domains=[]) means allow all domains — equivalent to ["*"], convenient for getting started
- **D-15:** Wildcard subdomain support — e.g., "*.example.com" matches sub.example.com, deep.sub.example.com

### No-Referer Handling
- **D-16:** No-Referer behavior configurable per policy — allowNoReferer field (boolean) in policy determines whether requests without Referer (VLC, direct browser access, curl) are allowed or blocked. Resolves via same per-field merge as other policy fields

### Rate Limiting
- **D-17:** NestJS Throttler with Redis storage — three tiers per POL-03: Global (platform-wide), Per-tenant (org package limit), Per-API-key (policy limit). Standard rate limit headers in responses (X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After)

### HLS Encryption
- **D-18:** HLS segment encryption enabled for all cameras — SRS hls_keys=on with AES-128 encryption. Backend serves decryption key only to verified sessions (valid JWT + active session). Adds security layer on top of JWT + domain allowlist

### Embed Code Generation
- **D-19:** Three embed snippet formats: iframe, hls.js, React component — available on camera detail page via `</>` button. Snippets are pre-filled with the camera's actual URL. Tab UI to switch between formats with copy button
- **D-20:** Embed page at /embed/{session} — minimal fullscreen video player, no branding or navigation. Optimized for iframe embedding in third-party websites
- **D-21:** Embed snippets also available in Developer Portal (Phase 4) as templates — Phase 3 provides the dynamic camera-specific version in dashboard

### Claude's Discretion
- JWT signing algorithm and secret management approach
- Exact Prisma schema design for PlaybackSession, Policy tables
- Policy resolution service implementation pattern
- Throttler configuration values for each tier
- HLS key serving endpoint implementation
- Embed page design and player library choice
- Error response format for rejected playback attempts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Playback & Security Requirements
- `.planning/REQUIREMENTS.md` §Playback & Security — PLAY-01 through PLAY-07 requirements
- `.planning/REQUIREMENTS.md` §Policies — POL-01 through POL-03 requirements

### SRS Integration (Critical)
- `CLAUDE.md` §SRS HTTP Callbacks — on_play/on_stop callback events, data fields, auth pattern (return code 0/non-zero)
- `CLAUDE.md` §HLS Configuration — hls_keys, hls_fragment, hls_window, AES-128 encryption settings
- `CLAUDE.md` §HTTP API Surface — Client management endpoints for viewer tracking (DELETE /api/v1/clients/{id})

### Prior Phase Context
- `.planning/phases/01-foundation-multi-tenant/01-CONTEXT.md` — RLS pattern, package limits (maxViewers), role model, tenancy module
- `.planning/phases/02-stream-engine-camera-management/02-CONTEXT.md` — SRS callback handler, stream key format ({orgId}/{cameraId}), internal preview vs external API separation, StatusGateway WebSocket

### Existing Code (Must Read)
- `apps/api/src/srs/srs-callback.controller.ts` — Existing on_play/on_stop handlers with viewer counting (extend for JWT verification)
- `apps/api/src/auth/guards/auth.guard.ts` — Session-based auth guard pattern (reference for playback guard design)
- `apps/api/src/tenancy/prisma-tenancy.extension.ts` — Org-scoped query pattern via CLS
- `apps/api/src/settings/settings.service.ts` — SRS config generation (add hls_keys configuration)

### Tech Stack
- `CLAUDE.md` §Recommended Web App Stack — NestJS Throttler, Redis, JWT libraries

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/api/src/srs/srs-callback.controller.ts` — on_play/on_stop already counting viewers, extend with JWT verification + domain check
- `apps/api/src/auth/guards/auth.guard.ts` — Auth guard pattern with CLS org_id injection, reference for PlaybackGuard
- `apps/api/src/settings/settings.service.ts` — generateSrsConfig() can be extended to include hls_keys settings
- `apps/api/src/status/status.gateway.ts` — StatusGateway WebSocket for real-time viewer count broadcasts

### Established Patterns
- NestJS modular architecture with @Global() for cross-cutting concerns
- nestjs-cls for request-scoped org context
- Prisma ORM with explicit schema models
- Zod safeParse in controllers for request validation
- BullMQ for background job processing
- Docker Compose with sms-network bridge for internal service communication

### Integration Points
- SRS callback URL pattern: `http://api:3001/api/srs/callbacks/*` (from docker-compose.yml)
- Stream key format: `{orgId}/{cameraId}` — used to identify camera in on_play callback
- Package.maxViewers — viewer limit from org's package (fallback when no policy set)
- Camera → Site → Project hierarchy already in Prisma schema — policy can reference these levels
- Redis (port 6380) available for rate limiting storage and session tracking

</code_context>

<specifics>
## Specific Ideas

- Internal platform preview (Phase 2, D-14) uses session auth + backend proxy — completely separate from external JWT playback. Phase 3 only adds the external API flow
- Embed code NOT in API response — follows industry standard (Twitch, YouTube, Mux don't include embed in API). Embed snippets live on camera detail page (button `</>`) and Developer Portal (Phase 4)
- Public camera use case (e.g., municipal CCTV) works with same mechanism — just set permissive policy (TTL=24h, maxViewers=0, domains=["*"])
- Developer's server calls API for token, embeds URL in their webpage — viewers don't know tokens exist

</specifics>

<deferred>
## Deferred Ideas

- Active session kick via background job (cron + SRS DELETE /api/v1/clients/{id}) — can add later if customers need strict TTL enforcement
- 1 token = 1 viewer enforcement — not practical for embed use case, deferred indefinitely
- Embed snippet templates in Developer Portal — Phase 4

</deferred>

---

*Phase: 03-playback-security*
*Context gathered: 2026-04-10*
