# Phase 3: Playback & Security - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 03-playback-security
**Areas discussed:** JWT Token & Session Flow, Policy Data Model & Inheritance, Domain Allowlist & Rate Limiting, Embed Code Generation, HLS Encryption, Embed Page, No-Referer Handling

---

## JWT Token & Session Flow

### JWT Validation Approach

| Option | Description | Selected |
|--------|-------------|----------|
| SRS on_play validate | JWT in URL, SRS on_play callback sends token to backend for verify | ✓ |
| Backend proxy validate | Backend proxies all HLS requests, verify JWT at proxy | |
| Hybrid (token + proxy) | JWT for m3u8, proxy for segments | |

**User's choice:** SRS on_play validate
**Notes:** User asked for detailed explanation of the flow. Key insight: SRS calls on_play once at connection start, not per segment — low backend load. Existing srs-callback.controller.ts already handles on_play.

### Session TTL Default

| Option | Description | Selected |
|--------|-------------|----------|
| 2 hours | Per PLAY-04, suitable for CCTV live stream | ✓ |
| 30 minutes | Short, requires frequent renewal | |
| 24 hours | One day, convenient but less secure | |

**User's choice:** 2 hours
**Notes:** User confirmed this is just a default — configurable per policy.

### Token Sharing

| Option | Description | Selected |
|--------|-------------|----------|
| Count viewers per camera | Don't care about token, just total viewers under max | ✓ |
| 1 token = 1 viewer | Second user of same token rejected | |

**User's choice:** Count viewers per camera
**Notes:** User identified that 1 token = 1 viewer is impractical — when URL is embedded in a webpage, multiple viewers use the same token automatically. Can't ask viewers to request their own tokens.

### Token Expiry Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| No kick | Viewers continue watching, rejected on reconnect | ✓ |
| Background job kick | Cron checks expired sessions, kicks via SRS API | |

**User's choice:** No kick
**Notes:** User understood that developer handles token renewal. Viewers don't get disrupted. Sufficient for CCTV use case.

---

## Policy Data Model & Inheritance

### Policy Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Separate Policy table, assign to each level | Single Policy table, assignable at Camera/Site/Project/System | ✓ |
| Inline fields per level | Each level has own TTL/viewers/domains fields | |
| Policy template + override | Templates with per-level field overrides | |

**User's choice:** Separate Policy table, assign to each level

### System Default Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Seed in DB | Migration creates System Default Policy | ✓ |
| Hardcode in backend | Defaults in code, requires redeploy to change | |

**User's choice:** Seed in DB

### Policy Resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Merge per-field | Each field resolves independently from nearest level | ✓ |
| Override entire policy | If Camera has policy, use all of it, ignore parent | |

**User's choice:** Merge per-field
**Notes:** User added: value 0 = unlimited (e.g., maxViewers=0 means no limit)

---

## Domain Allowlist & Rate Limiting

### Domain Check Location

| Option | Description | Selected |
|--------|-------------|----------|
| SRS on_play callback | Check Referer/pageUrl at play time | ✓ |
| At session creation | Check developer-provided domain at API call | |
| Both | Check at creation and at play time | |

**User's choice:** SRS on_play callback
**Notes:** User asked detailed explanation of how domain checking works. Key insight: browser automatically sends Referer header, SRS forwards as pageUrl in on_play callback. Same mechanism as YouTube embed restrictions.

### Empty Domain Allowlist

| Option | Description | Selected |
|--------|-------------|----------|
| Allow all domains | Empty list = no restriction | ✓ |
| Block all domains | Empty list = block everything | |

**User's choice:** Allow all domains (per recommendation)

### Rate Limiting

| Option | Description | Selected |
|--------|-------------|----------|
| NestJS Throttler | @nestjs/throttler with Redis, 3 tiers | ✓ |
| Custom middleware | Custom sliding window implementation | |
| You decide | Claude picks approach | |

**User's choice:** NestJS Throttler

---

## Embed Code Generation

### Embed Code Format

| Option | Description | Selected |
|--------|-------------|----------|
| iframe + hls.js snippet | Two formats per PLAY-06 | |
| iframe only | Simple, no customization | |
| 3 formats (iframe + hls.js + React) | Three formats for different use cases | ✓ |

**User's choice:** 3 formats
**Notes:** User corrected that embed code should NOT be in API response — no industry player does this. Embed snippets belong on camera detail page (button `</>`) with dynamic URLs, and as templates in Developer Portal (Phase 4).

### Embed Snippet Location

**User's choice:** Camera detail page with `</>` button + Developer Portal (Phase 4) as templates
**Notes:** User specifically requested both locations. Phase 3 handles the dynamic camera-specific version.

---

## HLS Encryption (PLAY-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Enable for all cameras | SRS hls_keys=on, backend serves key for verified sessions | ✓ |
| Configurable per policy | Policy controls encryption on/off per camera | |
| Disabled | Rely on JWT + domain allowlist only | |

**User's choice:** Enable for all cameras

---

## Embed Page

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal player | Fullscreen video player, no branding/nav | ✓ |
| Player + camera info | Player + camera name, status, time | |
| No embed page | Developer builds own player | |

**User's choice:** Minimal player

---

## No-Referer Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Allow if no Referer | Skip domain check, verify JWT + viewer limit only | |
| Block all | No Referer = rejected | |
| Configurable per policy | allowNoReferer boolean in policy | ✓ |

**User's choice:** Configurable per policy

---

## Claude's Discretion

- JWT signing algorithm and secret management
- Prisma schema for PlaybackSession, Policy tables
- Policy resolution service pattern
- Throttler tier configurations
- HLS key serving endpoint
- Embed page player implementation
- Error response formats

## Deferred Ideas

- Active session kick via background job — future enhancement if strict TTL enforcement needed
- 1 token = 1 viewer — impractical for embed use case, deferred indefinitely
- Embed snippet templates in Developer Portal — Phase 4
