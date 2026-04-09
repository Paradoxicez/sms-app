# Feature Landscape

**Domain:** CCTV Streaming SaaS Platform (Developer-facing, HLS-based)
**Researched:** 2026-04-08

## Table Stakes

Features developers expect from a streaming platform. Missing any of these means developers leave for Mux, Cloudflare Stream, or Angelcam.

### API & Developer Experience

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| RESTful API with predictable resource URLs | Every competitor (Mux, Cloudflare Stream, api.video) uses REST with clear resource hierarchy. Developers expect `POST /cameras`, `GET /cameras/{id}/streams` patterns | Medium | Follow Mux's pattern: separate management IDs (internal) from playback IDs (public-facing) |
| API key authentication with scoping | Mux uses Access Token + Secret pairs; Cloudflare uses bearer tokens. Developers need project-level or site-level scoping | Medium | Support both header-based (`Authorization: Bearer`) and query param for embed scenarios |
| Interactive API docs with curl examples | Mux's docs are the gold standard. Developers evaluate platforms by trying the API in 5 minutes | Medium | Swagger/OpenAPI spec with runnable examples. Must show request AND response |
| Webhook events for camera lifecycle | Mux sends `live_stream.connected`, `live_stream.active`, `live_stream.idle`, `live_stream.disconnected`. Developers need push notifications, not polling | Medium | Core events: camera.online, camera.offline, camera.degraded, stream.started, stream.stopped, recording.ready |
| SDK/embed code generation | Cloudflare provides iframe embeds; Mux provides `<mux-player>` web component; api.video has player SDK. Developers need copy-paste embed snippets | Low | Provide: iframe snippet, hls.js raw snippet, and a lightweight player web component |
| Rate limit headers in responses | Standard practice: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Developers need visibility to self-regulate | Low | Include in every API response. Per-key and per-tenant limits visible |
| Pagination, filtering, sorting on list endpoints | Standard REST expectation. Without cursor-based pagination, large camera lists break | Low | Use cursor-based pagination (not offset). Support `?status=online&site_id=xxx` filtering |
| Error responses with actionable messages | Developers expect `{ "error": { "type": "rate_limit_exceeded", "message": "...", "retry_after": 30 } }` not generic 500s | Low | Consistent error envelope across all endpoints |

### Playback & Security

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Secure playback URLs (signed/time-limited) | Cloudflare and Mux both require signed URLs for protected content. Unsigned HLS URLs get scraped immediately | High | **Use JWT-signed URLs** (see API Design Patterns section below). Self-signing keys for high-volume, API-generated tokens for low-volume |
| Domain allowlist (referrer restriction) | Cloudflare calls it "Allowed Origins"; Mux calls it "Referrer Validation". Prevents hotlinking of streams | Medium | Enforce on manifest AND segment requests. Support wildcard subdomains (`*.example.com`) |
| Configurable TTL on playback sessions | Platform default + per-camera override. Developers need control over session duration | Low | Default 120s is too short for live CCTV monitoring. Default should be 1-4 hours for live, shorter for on-demand clips |
| Viewer concurrency limits | Prevent a single camera stream from being watched by unlimited viewers (bandwidth cost control) | Medium | Enforce at the session creation level, not at the stream level |
| CORS handling | Streams must be playable from allowed origins without CORS errors | Low | SRS must serve HLS with proper CORS headers matching domain allowlist |

### Stream Management

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Camera CRUD with status monitoring | Register camera, get status (online/offline/degraded/connecting), start/stop stream | Medium | Poll SRS for status; expose via API and webhooks |
| Stream health metrics | Bitrate, FPS, dropped frames, reconnect count. Developers need to know if a camera feed is degraded | Medium | SRS provides callback hooks for stream events; expose as API + webhook |
| Auto-reconnect on stream failure | Cameras drop connections. Platform must auto-retry without developer intervention | High | Exponential backoff with configurable max retries. Status transitions: online -> reconnecting -> degraded -> offline |
| Stream profiles (transcoding config) | Developers need to choose resolution/codec/FPS per camera or as defaults | Medium | Reusable profiles assignable at project/site/camera level. Passthrough mode for low-latency scenarios |
| Multi-protocol ingest (RTSP/RTMP/SRT) | Cameras use different protocols. Must support all three at minimum | Medium | SRS handles this natively. RTSP may need ffmpeg relay depending on SRS version |

### Multi-Tenant & Access Control

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Organization isolation | Data must never leak between tenants. Table stakes for any SaaS | High | Shared database with tenant_id column + Row-Level Security (RLS) in PostgreSQL. Every query scoped by org |
| Role-based access (Admin/Operator/Developer/Viewer) | Standard SaaS pattern. Different roles need different permissions | Medium | Admin: full access. Operator: manage cameras/streams. Developer: API keys + docs. Viewer: watch-only |
| Package/plan system with limits | Camera count, concurrent viewers, bandwidth, storage, API rate limits per plan | Medium | Super admin manages plans. Enforce limits at API layer, not just UI |
| API key management with usage tracking | Developers need to create/revoke keys and see usage stats | Medium | Keys scoped to project or site. Track: requests/day, bandwidth, active sessions |

### Recordings

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Record camera streams with retention | Developers expect to access recorded footage via API | High | SRS DVR mode or segment-based recording. Storage management is the hard part |
| Playback recorded footage via API | `GET /cameras/{id}/recordings?from=...&to=...` returning HLS URL for time range | High | Requires proper segment indexing and on-demand HLS manifest generation |
| Configurable retention policies | Per-camera or per-plan storage limits and TTL | Medium | Auto-cleanup of expired recordings. Alert before deletion |

## Differentiators

Features that set SMS Platform apart from competitors. Not expected, but create competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Single API call to playback URL** | Core value prop. Mux requires asset creation + playback ID + signed URL. SMS Platform: `POST /cameras/{id}/sessions` returns ready-to-embed URL | Low | This IS the product. One call, one URL, embed immediately. No multi-step orchestration |
| **Hierarchical policy inheritance** | Camera > Site > Project > System defaults. No competitor offers this for CCTV specifically | Medium | Reduces config overhead for large deployments. Override at any level |
| **Map view with live status overlay** | Unique to physical-camera platforms. Generic video APIs don't handle geolocation | Medium | Camera lat/lng with status indicators. Click for live preview. Existing UI already has this |
| **Bulk camera import** | Enterprise clients have 100+ cameras. CSV/JSON import with validation and preview | Medium | Template download, dry-run validation, progress tracking |
| **Stream engine config via web UI** | Competitors require SSH/config files. SRS config manageable through dashboard | High | Wrap SRS HTTP API. No TOML editing. Visual transcoding pipeline config |
| **Developer portal with guided onboarding** | Step-by-step: create project -> add camera -> get API key -> make first API call -> embed stream. Measured time-to-first-stream | Medium | Track onboarding funnel. Aim for < 5 minutes to first working embed |
| **Audit log with full API trail** | Enterprise compliance requirement that most dev platforms skip | Medium | Log all mutations with actor, timestamp, IP, old/new values |
| **Real-time stream preview in dashboard** | See camera feeds directly in admin UI without generating playback URLs | Medium | Useful for operators verifying camera setup. Internal HLS player in dashboard |
| **Per-camera bandwidth and viewer analytics** | Know which cameras are most watched, peak viewing times, bandwidth consumption | Medium | Aggregate per camera, per site, per project. Expose via API and dashboard |
| **Connection test before camera registration** | Validate RTSP/SRT URL is reachable and streaming before committing to database | Medium | Prevents ghost cameras. Returns codec info, resolution, frame rate on success |

## Anti-Features

Features to deliberately NOT build. Each would add complexity without matching the platform's core value.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **AI video analytics (face detection, object detection, license plates)** | Massive scope creep. Angelcam and Rhombus are investing millions here. It's not your differentiator -- your differentiator is developer API simplicity | Provide webhook events so customers can pipe frames to their own AI services. Consider exposing snapshot API for integration with third-party AI |
| **P2P/WebRTC live streaming** | Different protocol stack, different infrastructure, different latency profile. HLS is the right choice for embeddable CCTV | Stick with HLS. If ultra-low-latency needed later, SRS supports WebRTC but scope it as a separate milestone |
| **Built-in billing/payment (Stripe integration)** | Premature for v1. Super admin manual management is sufficient until product-market fit is proven | Super admin sets plan limits manually. Add billing integration in a later milestone |
| **Mobile native SDKs (iOS/Android)** | HLS works natively on iOS and via hls.js on Android browsers. Native SDKs are maintenance burden with no unique value | Provide web-based embed code that works in mobile WebViews. Document HLS URL usage for native players |
| **Multi-CDN delivery** | Overkill for self-hosted Docker Compose deployment. CDN only matters at scale | Serve HLS directly from SRS. Add CDN/reverse proxy (nginx) when needed |
| **SSO/SAML/OAuth provider** | Enterprise SSO is complex (SAML assertions, IdP metadata, certificate management). Email/password + API keys covers v1 | Use email/password for dashboard. API keys for programmatic access. Add SSO in enterprise tier later |
| **Video editing/clipping in browser** | Feature bloat. Recording playback is sufficient | Expose time-range API for recordings. Let developers build their own clip UIs |
| **Camera PTZ control** | Protocol complexity varies wildly per manufacturer. Not core to streaming delivery | Document that PTZ is out of scope. Suggest ONVIF integration as future consideration |
| **Custom video player with DRM** | DRM (Widevine/FairPlay) requires licensing, CDM servers, and per-platform implementation | Signed URLs with TTL provide "good enough" protection for CCTV. Full DRM is for premium content, not surveillance |
| **Multi-region/geo-distributed deployment** | Docker Compose target means single region. Multi-region requires service mesh, database replication, stream routing | Design with region-awareness in mind (tenant metadata) but deploy single-region for v1 |

## API Design Patterns

How successful streaming platforms design their developer APIs. SMS Platform should follow these patterns.

### Resource Hierarchy (follow Mux's pattern)

```
Organizations (tenant)
  └── Projects
       └── Sites
            └── Cameras
                 ├── Stream Profiles (assigned)
                 ├── Policies (assigned or inherited)
                 ├── Sessions (playback sessions)
                 └── Recordings
```

**Key principle from Mux:** Separate management IDs from playback IDs. The camera ID is for management (`api.sms.com/v1/cameras/{camera_id}`). The playback session returns a different, opaque token for streaming (`stream.sms.com/{session_token}/index.m3u8`).

### Playback Session API Design

**Recommended approach: JWT-signed URLs with self-signing keys**

This is the pattern used by both Mux and Cloudflare Stream for high-volume scenarios:

```
# Step 1: One-time setup - create a signing key pair
POST /v1/signing-keys
Response: { "id": "key_abc", "private_key": "-----BEGIN RSA PRIVATE KEY-----..." }

# Step 2: Per-playback - create session (server-side)
POST /v1/cameras/{camera_id}/sessions
Body: { "ttl": 3600, "allowed_domains": ["app.example.com"] }
Response: {
  "session_id": "sess_xyz",
  "playback_url": "https://stream.sms.com/sess_xyz/index.m3u8?token={JWT}",
  "embed_code": "<iframe src='...'></iframe>",
  "expires_at": "2026-04-08T13:00:00Z"
}
```

**Why JWT-signed URLs over alternatives:**

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **JWT-signed URLs** (recommended) | Self-signing at scale, no API call per viewer, standard JWT libraries everywhere, embeddable claims (domain, expiry, camera scope) | Slightly more complex initial setup | **Use this.** Matches Mux + Cloudflare pattern. Scale without API bottleneck |
| Server-generated opaque tokens | Simple implementation, full server control | API call per viewer = bottleneck at scale, rate-limit risk | Good for low-volume or as fallback |
| Session cookies | Familiar web pattern | Doesn't work for iframe embeds or cross-origin, breaks API-first model | **Do not use** |

**JWT claims for playback tokens:**

```json
{
  "sub": "cam_abc123",          // Camera ID (subject)
  "sid": "sess_xyz",            // Session ID
  "aud": "playback",            // Audience: "playback" | "recording" | "thumbnail"
  "exp": 1712588400,            // Expiry (UNIX timestamp)
  "iss": "sms-platform",        // Issuer
  "kid": "key_abc",             // Signing key ID
  "org": "org_tenant1",         // Tenant ID (for validation)
  "domains": ["*.example.com"], // Allowed referrer domains
  "max_viewers": 50             // Concurrent viewer cap for this session
}
```

### Webhook Design (follow Mux pattern)

```
POST /v1/webhooks
Body: {
  "url": "https://app.example.com/hooks/sms",
  "events": ["camera.online", "camera.offline", "stream.degraded", "recording.ready"],
  "secret": "whsec_..." // For HMAC signature verification
}
```

**Event payload structure:**

```json
{
  "id": "evt_abc123",
  "type": "camera.online",
  "created_at": "2026-04-08T12:00:00Z",
  "data": {
    "camera_id": "cam_xyz",
    "project_id": "proj_abc",
    "site_id": "site_def",
    "metadata": { "resolution": "1920x1080", "codec": "h264", "fps": 30 }
  }
}
```

**Webhook best practices from Mux:**
- HMAC-SHA256 signature in `X-SMS-Signature` header
- Retry with exponential backoff (1s, 5s, 30s, 5min, 1hr)
- Idempotency via event ID
- Webhook logs viewable in dashboard (Rhombus recently added this)

### Rate Limiting Design

**Three-tier approach (industry standard for multi-tenant SaaS):**

| Tier | Scope | Purpose |
|------|-------|---------|
| Global | Platform-wide | Protect infrastructure from abuse |
| Tenant | Per-organization | Enforce plan limits, prevent noisy neighbors |
| Key | Per-API-key | Fine-grained developer control |

**Response headers (follow RFC 6585 + draft-ietf-httpapi-ratelimit-headers):**

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1712588400
Retry-After: 30  (only on 429 responses)
```

### API Versioning

Use URL-based versioning (`/v1/cameras`). It's explicit, cacheable, and what every major video API uses (Mux: `/video/v1/`, Cloudflare: `/client/v4/`).

## Multi-Tenant Patterns

### Tenant Isolation

**Recommended: Shared database with RLS (PostgreSQL Row-Level Security)**

This is the 2025/2026 standard for SaaS platforms at SMS Platform's scale:

- Every table has `org_id` column
- RLS policies enforce `current_setting('app.current_org') = org_id`
- Application sets `app.current_org` on every database connection
- Defense in depth: application-layer filtering + database-layer RLS

### Plan Limits & Feature Gating

```
Plans table:
  - max_cameras: integer
  - max_concurrent_viewers: integer
  - max_bandwidth_gb: integer
  - max_storage_gb: integer
  - max_api_requests_per_day: integer
  - features: jsonb  // { "recordings": true, "webhooks": true, "map_view": true, "bulk_import": false }
```

**Enforcement points:**
- API middleware checks plan limits before allowing resource creation
- Stream engine checks viewer limits before allowing new playback sessions
- Background job tracks bandwidth/storage and sends alerts at 80%/90%/100%
- Feature flags checked at both API and UI level

### Tenant Onboarding Flow

```
Super Admin creates org -> assigns plan -> creates admin user
Admin logs in -> creates project -> adds site -> registers cameras -> generates API key
Developer uses API key -> creates playback session -> embeds stream
```

## Feature Dependencies

```
Authentication ─────────────────────────────────────────────┐
    │                                                        │
Multi-Tenant (org isolation, RLS) ──────────────────────────┤
    │                                                        │
Plan/Package System ────────────────────────────────────────┤
    │                                                        │
Project > Site > Camera Hierarchy ──────────────────────────┤
    │                                                        │
    ├── Stream Profiles ──── Camera Stream Management        │
    │                            │                           │
    │                       Stream Health Monitoring         │
    │                            │                           │
    ├── Policies ───────── Playback Session API              │
    │                            │                           │
    │                       Signed URL / JWT Generation      │
    │                            │                           │
    │                       Embed Code Generation            │
    │                                                        │
    ├── API Keys ──────── Rate Limiting ── Usage Analytics   │
    │                                                        │
    ├── Webhooks ──────── Camera Event System                │
    │                                                        │
    ├── Recordings ────── Storage Management ── Retention    │
    │                                                        │
    └── Dashboard ─────── Map View                           │
                          Audit Log                          │
                          Developer Portal ──────────────────┘
```

**Critical path:** Auth -> Multi-tenant -> Camera hierarchy -> SRS integration -> Playback sessions -> Embed code. Everything else builds on this chain.

## MVP Recommendation

**Prioritize (in order):**

1. **Multi-tenant auth with org isolation** -- foundational; everything else depends on it
2. **Camera CRUD with SRS integration** -- core product: register camera, start stream, get status
3. **Playback session API with JWT-signed URLs** -- the ONE API call that IS the product
4. **Stream profiles (basic: passthrough + 1-2 transcode presets)** -- needed for HLS output
5. **API keys with project scoping** -- developers need programmatic access
6. **Embed code generation (iframe + hls.js snippet)** -- time-to-first-embed must be < 5 minutes
7. **Domain allowlist** -- basic security for embed scenarios
8. **Webhook events (camera online/offline)** -- developers can't poll; they need push
9. **Dashboard with camera status** -- operators need visibility
10. **Plan/package system with limits** -- enforce SaaS boundaries

**Defer to post-MVP:**

- **Recordings**: High complexity (storage, indexing, retention). Ship live streaming first
- **Map view**: Nice-to-have, not blocking any developer workflow
- **Bulk import**: Only needed at scale (10+ cameras)
- **Audit log**: Important for enterprise, not for initial developer adoption
- **Developer portal with guided onboarding**: Can be docs page initially, interactive portal later
- **Per-camera analytics**: Useful but not blocking core value delivery
- **Stream engine web UI config**: SRS defaults work initially; UI config is polish

## Sources

- [Mux Video API](https://www.mux.com/video-api) -- API design patterns, developer experience benchmark
- [Mux Secure Video Playback](https://www.mux.com/docs/guides/video/secure-video-playback) -- JWT-signed URL pattern, playback restrictions
- [Mux Fundamentals](https://www.mux.com/docs/core/mux-fundamentals) -- Asset vs playback ID separation
- [Cloudflare Stream Security](https://developers.cloudflare.com/stream/viewing-videos/securing-your-stream/) -- Self-signing keys, JWT claims, access rules
- [Cloudflare Stream Overview](https://developers.cloudflare.com/stream/) -- API design, live input patterns
- [Angelcam Developers](https://www.angelcam.com/developers) -- CCTV-specific platform features, connector model
- [Rhombus API Blog](https://www.rhombus.com/blog/the-rhombus-api-enterprise-video-security-without-limits/) -- Enterprise security API patterns, webhook management
- [api.video Player SDK](https://docs.api.video/sdks/player/apivideo-player-sdk) -- Player embed patterns
- [FastPix Signed URLs](https://www.fastpix.io/blog/how-to-protect-video-content-with-signed-urls) -- Token security best practices
- [Zuplo API Rate Limiting](https://zuplo.com/learning-center/10-best-practices-for-api-rate-limiting-in-2025) -- Multi-tenant rate limiting patterns
- [Zuplo API Gateway Multi-Tenant](https://zuplo.com/learning-center/api-gateway-for-multi-tenant-saas) -- Tenant isolation at API layer
- [Multi-Tenant Architecture Guide 2025](https://zenn.dev/shineos/articles/saas-multi-tenant-architecture-2025?locale=en) -- RLS patterns, hybrid isolation
- [Best Video APIs 2025](https://www.mux.com/articles/the-best-video-apis-right-now) -- Competitive landscape
