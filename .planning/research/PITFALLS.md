# Domain Pitfalls

**Domain:** CCTV Streaming SaaS Platform (SRS-based)
**Researched:** 2026-04-08

## Critical Pitfalls

Mistakes that cause rewrites, production outages, or fundamental architectural problems.

### Pitfall 1: SRS Single-Process Architecture Hits a Wall Under Load

**What goes wrong:** SRS uses a single-threaded cooperative multitasking model (State Threads library). A single SRS process supports roughly 3,000 concurrent RTMP/FLV connections or ~1,000 WebRTC connections on one CPU core. For high-bitrate CCTV streams (4-8 Mbps each), the practical limit drops further. Teams design around "one SRS instance handles everything" and discover at 50-100 cameras that CPU is maxed on a single core while other cores sit idle.

**Why it happens:** SRS deliberately chose single-process for simplicity and to avoid thread synchronization complexity. This is a design choice, not a bug. Teams coming from multi-threaded servers (Nginx, etc.) assume SRS will use all available cores.

**Consequences:** Stream stuttering, HLS segment generation delays, API timeouts. Cannot fix by adding more CPU cores to the same container.

**Prevention:**
- Design for multiple SRS instances from the start. Use stream-key hashing or tenant-based routing to distribute cameras across SRS containers.
- Set CPU affinity per SRS container (`cpuset` in Docker Compose) so each instance gets one dedicated core.
- Monitor per-instance connection counts, not just aggregate CPU.
- Plan the transition: start with one SRS instance per Docker Compose, but architect the backend to address SRS instances by ID so adding more is a configuration change, not a rewrite.

**Detection:** Single-core CPU at >70% utilization. HLS segment generation time exceeding the configured `hls_fragment` value. Increasing stream startup latency.

**Phase relevance:** Must be addressed in the initial architecture design (Phase 1). Retrofitting multi-instance routing onto a single-instance design is painful.

---

### Pitfall 2: H.265 Camera Streams Cannot Play in Browsers

**What goes wrong:** Many modern CCTV cameras ship with H.265 (HEVC) as the default codec. Browsers (Chrome, Firefox, Edge) do not support H.265 via MSE (Media Source Extensions). Only Safari has partial H.265 support, and only via hardware decoding on Apple Silicon. Teams accept H.265 camera feeds, pass them through to HLS, and discover playback fails for 85%+ of users.

**Why it happens:** H.265 licensing costs and patent pool complexity have prevented browser adoption. Camera manufacturers default to H.265 for its 30-50% bandwidth savings over H.264, not considering browser playback.

**Consequences:** Streams that work in VLC or native players completely fail in browser-based hls.js playback. The platform appears broken to end users. Fixing requires either transcoding (expensive) or reconfiguring cameras (not always possible for the SaaS platform operator).

**Prevention:**
- **Detection at ingest:** When a camera connects, probe the codec. If H.265, flag it and alert the user that transcoding is required for browser playback.
- **Mandatory transcoding pipeline:** Use FFmpeg (forked by SRS or as a sidecar container) to transcode H.265 to H.264 before HLS packaging. SRS 6.0+ supports HEVC ingest natively, but output must be H.264 for browsers.
- **Stream profile defaults:** Default stream profiles should specify H.264 output. Make passthrough an explicit opt-in only for H.264 sources.
- **Resource budgeting:** H.265-to-H.264 transcoding is CPU-intensive. Budget 0.5-1.0 CPU cores per 1080p stream for real-time transcoding.

**Detection:** Camera status check should report codec on connection. Dashboard should show which cameras require transcoding vs passthrough.

**Phase relevance:** Must be designed in the stream profile and camera registration phases. The transcoding infrastructure (FFmpeg sidecar containers, CPU allocation) is an architectural decision that affects Docker Compose design.

---

### Pitfall 3: HLS Segment Timing Mismatch With Camera GOP Causes Unpredictable Latency

**What goes wrong:** SRS HLS segment duration is calculated as `max(hls_fragment * hls_td_ratio, gop_size * N)`. If the camera's GOP (Group of Pictures) interval is 4 seconds and `hls_fragment` is set to 2 seconds, actual segments will be 4 seconds minimum because SRS waits for keyframes. With `hls_window` of 3 segments, latency becomes 12+ seconds instead of the expected 6 seconds. Teams promise "low latency" without understanding this dependency.

**Why it happens:** HLS segments must start on keyframes for clean playback. Camera GOP settings (often 2-4 seconds, sometimes up to 10 seconds) are set by the camera manufacturer or installer, not the streaming platform. The platform cannot control GOP without transcoding.

**Consequences:** Unpredictable latency per camera (varies by camera model/config), user complaints about "lag," inability to deliver on latency SLAs.

**Prevention:**
- **Document realistic latency:** Standard HLS with passthrough is 15-30 seconds. Optimized HLS (small fragments + small window) is 6-10 seconds. Sub-5-second requires LL-HLS or protocol changes (WebRTC).
- **Detect GOP on ingest:** Log and display each camera's actual GOP interval in the dashboard. Alert when GOP > 2 seconds for cameras assigned to "low latency" profiles.
- **Transcoding for latency control:** Only transcoding lets you enforce a specific keyframe interval. Passthrough inherits whatever the camera sends.
- **SRS configuration:** Set `hls_wait_keyframe on` (default) to avoid playback artifacts. Reduce `hls_fragment` to 2s and `hls_window` to 10s for the low-latency profile, but warn users that actual latency depends on source GOP.

**Detection:** Monitor actual HLS segment durations vs configured values. Large discrepancies indicate GOP mismatch.

**Phase relevance:** Impacts stream profile design and the developer documentation. Must set correct expectations in the API docs and dashboard UI.

---

### Pitfall 4: RTSP Camera Disconnects Are the Norm, Not the Exception

**What goes wrong:** CCTV cameras on customer networks disconnect frequently -- network glitches, WiFi interference, power cycles, ISP resets, NAT timeout, firewall state table flushes. Teams build the "happy path" (camera connects, stream plays) and treat disconnects as edge cases. In production, cameras disconnect multiple times per day. Without robust reconnection, the platform shows cameras as permanently offline after the first network hiccup.

**Why it happens:** SRS does not natively pull RTSP streams. RTSP ingest typically requires an FFmpeg process per camera that pulls the RTSP feed and pushes RTMP/SRT to SRS. If FFmpeg crashes or the RTSP connection drops, nothing reconnects automatically.

**Consequences:** Cameras shown as "offline" when they are actually online and reachable. Users lose trust in the platform. Support tickets flood in.

**Prevention:**
- **Implement a stream manager service** that monitors each FFmpeg RTSP-pull process. On exit/crash, restart with exponential backoff (1s, 2s, 4s, 8s, max 60s).
- **Use RTSP over TCP** (interleaved mode) as the default transport. UDP-based RTSP fails through NAT/firewalls far more often. FFmpeg flag: `-rtsp_transport tcp`.
- **RTSP keepalive:** Configure keepalive interval to 30 seconds (below typical 60-second NAT timeout). Use GET_PARAMETER instead of OPTIONS for keepalive.
- **Camera health state machine:** Implement states: `connecting -> online -> degraded -> reconnecting -> offline`. Only mark "offline" after N consecutive reconnection failures over a configurable timeout (e.g., 5 minutes).
- **SRS HTTP callbacks:** Use `on_publish` / `on_unpublish` callbacks to track when streams appear/disappear in SRS and update camera status accordingly.

**Detection:** Track reconnection frequency per camera. Cameras reconnecting more than 5 times per hour indicate network issues that should surface as "degraded" status.

**Phase relevance:** The stream manager (FFmpeg process supervisor) is core infrastructure that must be built early. Camera status state machine should be part of Phase 1 camera management.

---

### Pitfall 5: Playback URL Token Leaking Exposes Live Streams

**What goes wrong:** HLS playback URLs contain authentication tokens (e.g., `/live/stream.m3u8?token=abc123`). These URLs get logged in browser developer tools, shared in support tickets, cached by CDNs/proxies, or exposed via Referer headers. If tokens are long-lived or not properly scoped, anyone with a captured URL can view the stream.

**Why it happens:** HLS is HTTP-based -- every segment request is a separate HTTP GET. Tokens must be included in each request or in the initial manifest URL. Unlike WebSocket-based protocols, there is no persistent authenticated connection.

**Consequences:** Unauthorized access to live CCTV feeds. Privacy violations. Potential legal liability depending on jurisdiction (GDPR, etc.).

**Prevention:**
- **Short-lived tokens:** Default TTL of 120 seconds as specified in PROJECT.md is good. Tokens should expire even if the viewer is still watching (force re-authentication via API).
- **Token scoping:** Bind tokens to specific streams, IP addresses, and User-Agent. Validate all three on each segment request.
- **SRS HTTP callback integration:** Use `on_hls` callback to validate tokens on each segment request, not just the manifest request. This prevents token replay.
- **Domain allowlist:** Enforce via CORS headers AND via server-side Referer validation. CORS alone is insufficient (only enforced by browsers, not curl/scripts).
- **Never log tokens:** Strip tokens from access logs. Configure nginx/reverse proxy to redact query parameters.
- **Separate manifest from segment URLs:** Generate signed segment URLs within the manifest itself, each with independent short TTLs.

**Detection:** Monitor for playback sessions from unexpected IP addresses or after token expiry. Alert on concurrent playback from multiple IPs with the same token.

**Phase relevance:** Security architecture must be designed in Phase 1 (API design). Implementation in the playback session phase. Domain allowlist enforcement in deployment configuration.

---

### Pitfall 6: Recording Storage Grows Exponentially and Kills the Server

**What goes wrong:** A single 1080p H.264 camera at 4 Mbps generates ~42 GB/day. With 50 cameras and 30-day retention, that is 63 TB. Teams deploy with a 1TB disk, enable recording for a few cameras, and within a week the disk fills up. SRS DVR continues trying to write, disk IO becomes saturated, HLS segment delivery stalls, and ALL streams (not just recorded ones) degrade.

**Why it happens:** Recording storage math is not intuitive. Teams plan for "a few terabytes" without calculating per-camera-per-day requirements. SRS DVR does not have built-in retention enforcement -- it writes files and does not delete old ones.

**Consequences:** Disk full crashes the entire platform (not just recording). All live streams are affected because HLS segment generation shares the same disk IO. Recovery requires manual intervention.

**Prevention:**
- **Separate volumes:** Mount HLS segments on tmpfs (RAM disk) or a fast SSD. Mount recordings on a separate volume with quota enforcement.
- **Storage calculator in UI:** Show users exactly how much storage their recording configuration will consume before enabling it. Formula: `(bitrate_mbps / 8) * 3600 * 24 * cameras * retention_days = GB`.
- **Retention cron job:** Build an external retention enforcement service that runs every hour and deletes recordings older than the configured retention period. SRS will not do this for you.
- **Disk usage alerts:** Alert at 70% disk usage. Automatically disable new recordings at 85%. Emergency-stop all recordings at 95%.
- **Package limits:** Enforce per-tenant storage quotas at the application level. A tenant's recording should not be able to affect other tenants.

**Detection:** Disk usage monitoring with trend projection. If current growth rate will fill disk within 7 days, alert immediately.

**Phase relevance:** Storage volume separation must be in Docker Compose design (Phase 1). Retention enforcement and storage calculator in the recording feature phase. Package limits in the multi-tenant billing/limits phase.

---

## Moderate Pitfalls

### Pitfall 7: SRS HTTP API is Unsecured by Default

**What goes wrong:** SRS exposes its HTTP API on port 1985 with no authentication by default. The API allows listing all streams, kicking clients, and querying server internals. If the port is exposed (common in Docker deployments), anyone can enumerate all active streams and disrupt service.

**Prevention:**
- Enable HTTP basic auth (SRS 5.0.152+ / 6.0.40+) via `http_api.auth` configuration.
- Bind SRS HTTP API to localhost only (`listen 127.0.0.1:1985`) and proxy through the backend API with proper authentication.
- Never expose SRS ports directly in Docker Compose `ports:` -- use internal Docker networking only.
- Note: HTTP API auth does NOT protect WebRTC endpoints. Use HTTP callbacks for WebRTC authentication.

**Phase relevance:** Docker Compose configuration (Phase 1). Must be enforced before any production deployment.

---

### Pitfall 8: SRS HLS Disk IO Blocks the Event Loop

**What goes wrong:** SRS is single-threaded. HLS segment writes are synchronous disk IO operations. With many concurrent streams generating HLS segments simultaneously, disk writes block the entire event loop, causing stuttering on ALL streams, not just the ones generating segments.

**Prevention:**
- **tmpfs for HLS:** Mount `/path/to/hls` as tmpfs in Docker. HLS segments are ephemeral -- they only need to exist in the `hls_window` (e.g., 60 seconds). RAM is fast enough that writes never block.
- **Limit concurrent HLS streams:** Not every camera needs HLS output simultaneously. Generate HLS only for cameras with active viewers (on-demand HLS generation via `on_play` callbacks).
- **SRS configuration:** Disable `hls_ctx` and `hls_ts_ctx` if not using CDN -- they add overhead per-request without benefit in single-origin deployments.

**Phase relevance:** Docker Compose volume configuration (Phase 1). On-demand HLS activation in the stream management phase.

---

### Pitfall 9: Multi-Tenant "Noisy Neighbor" via Shared SRS Instance

**What goes wrong:** All tenants' camera streams route through the same SRS instance. One tenant with 30 cameras consuming high bandwidth saturates the SRS process, causing stream quality degradation for all other tenants.

**Prevention:**
- **Docker resource limits:** Set `cpus` and `mem_limit` per SRS container in Docker Compose. This bounds the blast radius.
- **Tenant-to-instance mapping:** For v1, route tenants to specific SRS instances (even if on the same server). This provides logical isolation.
- **SRS vhost per tenant:** SRS vhosts provide stream namespace isolation (same stream names across tenants), but they do NOT provide resource isolation. Vhosts share the same process and CPU.
- **Connection limits:** Enforce maximum connections per tenant at the application layer (before traffic reaches SRS).
- **Bandwidth monitoring per tenant:** Track ingress/egress per tenant. Alert when one tenant exceeds their package allocation.

**Phase relevance:** Multi-tenant architecture design (Phase 1). Resource limits in Docker Compose configuration. Per-tenant monitoring in the dashboard phase.

---

### Pitfall 10: CORS Configuration Breaks HLS Playback Silently

**What goes wrong:** hls.js makes cross-origin requests for both the m3u8 manifest and each .ts segment. If CORS headers are missing or misconfigured on any request (manifest, segments, or key files), playback fails silently -- the player shows a black screen or generic "network error" with no useful diagnostic information.

**Prevention:**
- **Configure CORS at the reverse proxy level** (nginx), not in SRS. SRS has limited CORS configuration.
- **Required headers:** `Access-Control-Allow-Origin` (use explicit domain from allowlist, never `*` in production), `Access-Control-Allow-Headers`, `Access-Control-Expose-Headers`.
- **Handle OPTIONS preflight:** HLS requests with custom headers trigger preflight requests that must return proper CORS headers.
- **Test from actual embed domains:** CORS issues only manifest when the player is on a different domain than the HLS server. Test from the customer's embed domain, not from the same origin.
- **Include CORS on error responses:** A 403 or 500 response without CORS headers shows as a CORS error in the browser, masking the real error.

**Phase relevance:** Nginx/reverse proxy configuration (deployment phase). Must be tested with the embeddable player snippet.

---

### Pitfall 11: FFmpeg Transcoding Processes Leak Memory and Zombie

**What goes wrong:** Each RTSP camera requires a dedicated FFmpeg process for ingest (RTSP pull -> RTMP push to SRS). FFmpeg processes can leak memory over long-running sessions (days/weeks), accumulate zombie processes on crash, or silently stop transcoding while the process remains alive (producing no output).

**Prevention:**
- **Health check per FFmpeg process:** Monitor output bitrate, not just process existence. If FFmpeg is alive but producing no output for 30 seconds, kill and restart.
- **Periodic restart:** Schedule graceful FFmpeg process restarts every 24 hours during low-usage periods to prevent memory accumulation.
- **Process isolation:** One FFmpeg process per camera (not multiplexed). This prevents one camera's issues from affecting others.
- **Resource limits:** Set per-process memory limits. A passthrough FFmpeg process should use <100MB. A transcoding process uses 200-500MB. Anything above indicates a leak.
- **Zombie cleanup:** The stream manager service must properly `wait()` on child processes. Use process groups for clean termination.

**Phase relevance:** Stream manager service design (early phase). Process supervision patterns must be established before scaling to many cameras.

---

### Pitfall 12: Docker Compose Volume Data Loss on Recreate

**What goes wrong:** `docker-compose down` with default settings removes containers and networks. If volumes are anonymous (not named), data is lost. Teams run `docker-compose down -v` (or `--volumes`) during troubleshooting and wipe all recordings, database data, and configuration.

**Prevention:**
- **Named volumes for all persistent data:** Database, recordings, SRS configuration. Never use anonymous volumes.
- **Separate volume declarations:** Recording volumes, database volumes, and application data should be distinct named volumes.
- **Document destructive commands:** Warn operators about `docker-compose down -v` in operational documentation.
- **Backup strategy:** Regular database backups. Recordings are inherently expendable (retention-limited), but database loss means losing all tenant configurations.
- **Use bind mounts for recordings:** Bind mounts to host filesystem are more visible and harder to accidentally delete than Docker volumes.

**Phase relevance:** Docker Compose design (Phase 1). Operational documentation in the deployment phase.

---

## Minor Pitfalls

### Pitfall 13: SRS Edge Cluster Only Supports RTMP/FLV

**What goes wrong:** Teams plan to use SRS edge-origin clustering for horizontal scaling, expecting it to distribute HLS. SRS edge cluster only supports RTMP/FLV protocols. HLS distribution must be handled by a separate CDN or nginx layer.

**Prevention:** Use nginx for HLS distribution/caching. Reserve SRS clustering only for RTMP/FLV distribution if needed. For v1 (single server), this is not relevant but becomes critical when planning scale-out.

**Phase relevance:** Not relevant for Docker Compose single-server v1 but must be considered in the scale-out architecture planning.

---

### Pitfall 14: Camera RTSP URL Variations Across Manufacturers

**What goes wrong:** RTSP URL formats vary wildly across camera manufacturers. Hikvision uses `/Streaming/Channels/101`, Dahua uses `/cam/realmonitor?channel=1&subtype=0`, generic cameras use `/stream1`. Teams hardcode or assume a format and it breaks for half the cameras customers try to add.

**Prevention:**
- **Free-form RTSP URL input:** Let users paste the full RTSP URL including path. Do not try to construct it from IP + port.
- **Connection test on add:** Implement `ffprobe` or similar to test the RTSP URL before saving, verifying connectivity and detecting codec/resolution.
- **Documentation:** Provide a reference guide of common camera RTSP URL patterns by manufacturer.
- **Credential handling:** RTSP auth is typically embedded in the URL (`rtsp://user:pass@ip/path`). Store credentials securely, never log full RTSP URLs.

**Phase relevance:** Camera registration UI/API design.

---

### Pitfall 15: HLS Cleanup Timer vs CDN Cache Race Condition

**What goes wrong:** SRS `hls_cleanup` deletes expired .ts segments from disk. If a CDN or browser cached an m3u8 playlist referencing a segment that has been deleted, playback breaks with 404 errors. This is more subtle than outright failure -- viewers see intermittent buffering or playback restarts.

**Prevention:**
- Set `hls_dispose` longer than your CDN cache TTL.
- In single-origin (no CDN) deployments, this is less of an issue, but still set `hls_dispose` >= `hls_window` as recommended by SRS docs.
- Disable `hls_ctx` and `hls_ts_ctx` in non-CDN deployments to avoid unique URL generation that defeats caching.

**Phase relevance:** SRS configuration tuning during deployment.

---

### Pitfall 16: Underestimating Bandwidth Requirements

**What goes wrong:** Each viewer of a 1080p stream consumes 4-8 Mbps. With 10 cameras and 10 viewers each, that is 400-800 Mbps of egress bandwidth from the server. Teams provision standard cloud instances with 1 Gbps network and hit bandwidth limits with modest viewer counts.

**Prevention:**
- **Calculate bandwidth budgets:** `cameras * avg_bitrate * max_concurrent_viewers = required_egress`.
- **Enforce viewer concurrency limits** per camera (as planned in PROJECT.md) to cap bandwidth.
- **Package limits:** Tie bandwidth allowances to tenant packages. Monitor and enforce.
- **Consider adaptive bitrate:** Generate multiple quality profiles (1080p, 720p, 480p) so viewers on slower connections consume less bandwidth. This requires transcoding but dramatically reduces aggregate bandwidth.

**Phase relevance:** Package design (multi-tenant phase). Monitoring dashboard.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| SRS Integration | Single-process architecture limits (Pitfall 1) | Design multi-instance routing from day one |
| SRS Integration | HTTP API unsecured by default (Pitfall 7) | Bind to localhost, proxy through backend |
| Camera Management | RTSP disconnects treated as edge case (Pitfall 4) | Build stream manager with reconnection from the start |
| Camera Management | RTSP URL variations (Pitfall 14) | Free-form URL + connection test |
| Stream Profiles | H.265 cameras cannot play in browser (Pitfall 2) | Codec detection + mandatory transcoding path |
| Stream Profiles | GOP mismatch causes unpredictable latency (Pitfall 3) | Document realistic latency, detect GOP at ingest |
| HLS Delivery | CORS breaks playback silently (Pitfall 10) | Configure at nginx level, test from embed domains |
| HLS Delivery | Disk IO blocks SRS event loop (Pitfall 8) | tmpfs for HLS segments |
| Multi-Tenant | Noisy neighbor (Pitfall 9) | Docker resource limits + per-tenant monitoring |
| Playback Security | Token leaking (Pitfall 5) | Short TTL, IP binding, callback validation |
| Recording | Storage explosion (Pitfall 6) | Separate volumes, retention cron, storage calculator |
| Recording | Volume data loss (Pitfall 12) | Named volumes, bind mounts for recordings |
| Transcoding | FFmpeg process leaks (Pitfall 11) | Health checks, periodic restart, memory limits |
| Docker Deployment | Single-server scaling limit | Monitor per-core utilization, plan multi-instance path |
| Scale-Out | SRS edge only supports RTMP/FLV (Pitfall 13) | Use nginx for HLS distribution |

## Sources

- [SRS Hidden Flaws (by SRS creator)](https://blog.ossrs.io/the-hidden-flaws-of-srs-what-you-need-to-know-b7adcb1541af) - MEDIUM confidence
- [SRS HEVC Documentation](https://ossrs.net/lts/en-us/docs/v6/doc/hevc) - HIGH confidence
- [SRS HLS Documentation](https://ossrs.net/lts/en-us/docs/v5/doc/hls) - HIGH confidence
- [SRS DRM Documentation](https://ossrs.net/lts/en-us/docs/v5/doc/drm) - HIGH confidence
- [SRS HTTP API Security](https://ossrs.net/lts/en-us/blog/secure-your-http-api) - HIGH confidence
- [SRS Multi-CPU Issue #2188](https://github.com/ossrs/srs/issues/2188) - HIGH confidence
- [SRS Performance Docs](https://ossrs.io/lts/en-us/docs/v4/doc/performance) - HIGH confidence
- [SRS HTTP Callback Docs](https://ossrs.net/lts/en-us/docs/v4/doc/http-callback) - HIGH confidence
- [SRS Oryx Low-Latency HLS Blog](https://ossrs.net/lts/en-us/blog/hls-5s-low-latency) - HIGH confidence
- [RTSP NAT Traversal RFC 7604](https://datatracker.ietf.org/doc/html/rfc7604) - HIGH confidence
- [AWS SaaS Tenant Isolation Strategies](https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/isolation-security-or-noisy-neighbor.html) - HIGH confidence
- [CCTV Storage Calculator](https://www.cctvdesigntool.com/calculators/storage/) - MEDIUM confidence
