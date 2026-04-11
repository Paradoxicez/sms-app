# Phase 4: Developer Experience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 04-developer-experience
**Areas discussed:** API Key Design, Developer Portal, Webhook System, In-App Documentation

---

## API Key Design

| Option | Description | Selected |
|--------|-------------|----------|
| X-API-Key header | Dedicated header, separate from session auth (Stripe/Twilio pattern) | ✓ |
| Bearer token | Standard HTTP auth, but collides with Better Auth session tokens | |
| Both | Accept both headers, flexible but complex | |

**User's choice:** X-API-Key header
**Notes:** Clean separation from session-based auth

| Option | Description | Selected |
|--------|-------------|----------|
| Project + Site | Scoped to project or site per existing hierarchy, matches DEV-01 | ✓ |
| Organization-wide only | Access all cameras in org, simple but not granular | |
| Project + Site + Camera | Camera-level scope, overly granular for v1 | |

**User's choice:** Project + Site
**Notes:** Matches DEV-01 requirement "scoped to project or site"

| Option | Description | Selected |
|--------|-------------|----------|
| Daily aggregates | requests/day + bandwidth/day summary, lightweight | ✓ |
| Per-request log | Every request logged with endpoint/status/response time | |
| Both | Per-request (short retention) + daily aggregates (long retention) | |

**User's choice:** Daily aggregates
**Notes:** Sufficient for dashboard display

---

## Developer Portal

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid | Custom portal pages + Swagger UI embed for API reference | ✓ |
| Swagger UI only | Just @nestjs/swagger at /api/docs | |
| Custom portal entirely | Build everything from scratch including API reference | |

**User's choice:** Hybrid
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-filled with real data | User's actual API key + real camera IDs in examples | ✓ |
| Template placeholders | YOUR_API_KEY, CAMERA_ID placeholders | |

**User's choice:** Pre-filled with real data
**Notes:** Like Stripe dashboard experience

| Option | Description | Selected |
|--------|-------------|----------|
| Quick Start section | 3-step guide in portal: create key → create session → embed | ✓ |
| Separate tab | Dedicated Embed Snippets tab in portal | |

**User's choice:** Quick Start section
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Public | API docs viewable without login | ✓ |
| Login required | Must authenticate to view API reference | |

**User's choice:** Public
**Notes:** Helps developers evaluate before signing up

**Additional context:** Developer portal lives inside the admin app as routes under /admin/developer/*, not as a separate application

---

## Webhook System

| Option | Description | Selected |
|--------|-------------|----------|
| Camera events only | camera.online, camera.offline, camera.degraded, camera.reconnecting | ✓ |
| Camera + Stream events | Add stream.started, stream.stopped, playback.created | |
| Full event catalog | All events including policy changes, API key events | |

**User's choice:** Camera events only
**Notes:** Matches DEV-04 exactly, expand later

| Option | Description | Selected |
|--------|-------------|----------|
| Exponential backoff 5 retries | ~1m, 5m, 30m, 2h, 12h via BullMQ | ✓ |
| Fixed interval 3 retries | Every 5 minutes, 3 attempts | |
| You decide | Claude's discretion | |

**User's choice:** Exponential backoff 5 retries
**Notes:** Industry standard (Stripe/GitHub pattern)

| Option | Description | Selected |
|--------|-------------|----------|
| Recent deliveries log | Full payload, response, timestamp, retries visible in portal | ✓ |
| Status only | Success/fail counts only | |

**User's choice:** Recent deliveries log
**Notes:** Developer debugging capability

---

## In-App Documentation

| Option | Description | Selected |
|--------|-------------|----------|
| In-app pages | Next.js pages in /admin/developer/docs/* | ✓ |
| External docs site | Docusaurus/Nextra separate deployment | |
| Markdown in portal | .md files rendered in portal page | |

**User's choice:** In-app pages
**Notes:** No separate hosting needed

**Documentation scope (multi-select):**
- ✓ API Workflow Guide
- ✓ Policies Guide
- ✓ Stream Profiles Guide
- ✓ Webhooks Guide
- ✓ Streaming Basics Guide (user-added: "ใส่ความรู้พื้นฐานเกี่ยวกับ stream ที่เกี่ยวข้องกับการใช้ระบบไว้ด้วย")

---

## Claude's Discretion

- API key hashing algorithm
- Prisma schema design for new tables
- Swagger decorator strategy
- Portal page layout/design
- Documentation content
- BullMQ queue configuration
- Batch session creation limit

## Deferred Ideas

- Redesign camera detail page — UI todo, not Phase 4 scope
- Extended webhook event catalog — camera events first, expand later
- Per-request usage logs — daily aggregates for v1
- SDK generation from OpenAPI spec
- API versioning strategy
