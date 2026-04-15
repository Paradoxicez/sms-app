---
phase: 03-playback-security
verified: 2026-04-10T20:00:00Z
status: human_needed
score: 5/5 must-haves verified
gaps: []
human_verification:
  - test: "Create a policy via the admin UI at /admin/policies, fill form, save, verify it appears in list"
    expected: "Policy created successfully, appears in table with correct level badge and scope"
    why_human: "UI interaction flow, form validation, dialog behavior cannot be verified programmatically"
  - test: "Navigate to a camera detail page, click embed code button, verify dialog opens with 3 tabs"
    expected: "iframe, hls.js, React tabs each show code snippet with copy button that works"
    why_human: "Dialog rendering, tab switching, clipboard API requires browser interaction"
  - test: "Navigate to /embed/nonexistent, verify black page with error message"
    expected: "Black background, centered gray text: Session not found message"
    why_human: "Visual appearance verification requires browser rendering"
  - test: "Start a stream, create a session via API, navigate to /embed/{sessionId}"
    expected: "HLS video plays fullscreen on black background with native controls"
    why_human: "Live stream playback requires running SRS infrastructure and browser"
  - test: "Verify policy resolution preview on camera detail Policy tab shows correct values with source badges"
    expected: "ResolvedPolicyCard shows TTL, maxViewers, domains etc. with level badges indicating source"
    why_human: "Backend resolve endpoint may not return sources field -- needs runtime verification"
---

# Phase 03: Playback & Security Verification Report

**Phase Goal:** Developers can get a secure, time-limited HLS playback URL via a single API call and embed it on their website
**Verified:** 2026-04-10T20:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Developer can call POST /cameras/{id}/sessions and receive a working HLS playback URL with JWT-signed token | VERIFIED | `PlaybackController.createSession()` at line 39-43 delegates to `PlaybackService.createSession()` which resolves policy, checks viewer limits, creates session record, signs JWT with HS256, returns `{ sessionId, hlsUrl, expiresAt }`. JWT contains sub, cam, org, domains, exp claims. |
| 2 | Playback URL stops working after the configured TTL expires | VERIFIED | JWT signed with `expiresIn: resolved.ttlSeconds` (playback.service.ts:92). `verifyToken()` uses `jwt.verify()` which rejects expired tokens. SRS on_play callback calls `verifyToken()` -- expired tokens return null, on_play returns `{ code: 403 }`. |
| 3 | Playback is rejected when the requesting domain is not in the allowlist | VERIFIED | SRS callback controller on_play (line 65-69) calls `playbackService.matchDomain(pageUrl, session.domains, session.allowNoReferer)`. matchDomain supports exact match, wildcard `*.example.com`, `*` catch-all, and allowNoReferer flag. Returns `{ code: 403 }` on mismatch. |
| 4 | Viewer concurrency limits are enforced -- excess viewers are rejected at session creation | VERIFIED | Two enforcement points: (1) `PlaybackService.createSession()` line 59-63 checks `statusService.getViewerCount(cameraId)` against `resolved.maxViewers`, throws ForbiddenException if exceeded. (2) SRS on_play callback line 72-76 checks viewer limit again at playback time. maxViewers=0 means unlimited (both checks skip when maxViewers <= 0). |
| 5 | Policy inheritance resolves correctly: Camera > Site > Project > System defaults | VERIFIED | `PoliciesService.resolve()` queries policies at all 4 levels, sorts by `LEVEL_PRIORITY` (CAMERA=0, SITE=1, PROJECT=2, SYSTEM=3), takes first non-null value per scalar field. System default seeded on module init with TTL=7200, maxViewers=10, domains=[], allowNoReferer=true. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/prisma/schema.prisma` | Policy + PlaybackSession models with PolicyLevel enum | VERIFIED | PolicyLevel enum (SYSTEM/PROJECT/SITE/CAMERA), Policy model with all fields (ttlSeconds, maxViewers, domains, allowNoReferer, rateLimit), PlaybackSession model with token @unique, indices, reverse relations on Camera/Site/Project |
| `apps/api/src/policies/policies.service.ts` | Policy CRUD and per-field merge resolution | VERIFIED | 214 lines. create/findAll/findOne/update/remove + resolve() with priority sorting + seedSystemDefault() via OnModuleInit |
| `apps/api/src/playback/playback.service.ts` | Session creation with JWT signing, token verification, domain matching | VERIFIED | 227 lines. createSession, verifyToken, verifyTokenMinimal, getSession, matchDomain. Uses jsonwebtoken (not jose -- deviated from plan due to ESM incompatibility, functionally equivalent) |
| `apps/api/src/playback/playback.controller.ts` | POST /cameras/:id/sessions, GET /playback/sessions/:id, HLS key endpoint, m3u8 proxy | VERIFIED | 145 lines. All 4 endpoints implemented: createSession, getSession, serveHlsKey (with JWT verification), proxyM3u8 (with key URL rewriting) |
| `apps/api/src/srs/srs-callback.controller.ts` | JWT + domain verification in on_play callback | VERIFIED | 127 lines. on_play extracts token from params, calls verifyToken, matchDomain, checks viewer limit. @SkipThrottle applied. |
| `apps/api/src/app.module.ts` | PoliciesModule, PlaybackModule, ThrottlerModule | VERIFIED | All three imported. ThrottlerModule.forRoot with 3 tiers (global/tenant/apikey). ThrottlerGuard as APP_GUARD. |
| `apps/web/src/app/admin/policies/page.tsx` | Policy list page | VERIFIED | 260 lines. Fetches from /api/policies, table with columns, empty state, create/edit dialogs, delete with AlertDialog |
| `apps/web/src/app/admin/policies/components/policy-form.tsx` | Reusable policy form | VERIFIED | Exists with level selector, entity selector, all fields, domain editor |
| `apps/web/src/app/admin/cameras/components/embed-code-dialog.tsx` | Embed code dialog with 3 tab formats | VERIFIED | 123 lines. Tabs: iframe, hls.js, React. Each with CodeBlock and help text. |
| `apps/web/src/app/embed/[session]/page.tsx` | Public embed player page | VERIFIED | 188 lines. Fetches session, plays HLS via hls.js, black background (#000), error states, Safari fallback, cleanup on unmount |
| `apps/web/src/components/sidebar-nav.tsx` | Policies nav item with ShieldCheck icon | VERIFIED | ShieldCheck imported, "Policies" entry at line 44 with href /admin/policies |
| `apps/web/src/app/embed/[session]/layout.tsx` | Minimal layout without sidebar | VERIFIED | 3 lines. Returns bare children, no sidebar/header. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| playback.service.ts | policies.service.ts | PoliciesService.resolve() call | WIRED | Line 56: `this.policiesService.resolve(cameraId)` in createSession |
| playback.service.ts | jsonwebtoken | jwt.sign/jwt.verify | WIRED | Lines 83, 115: `jwt.sign()` and `jwt.verify()` (plan specified jose, implementation uses jsonwebtoken -- functionally equivalent) |
| srs-callback.controller.ts | playback.service.ts | verifyToken + matchDomain calls | WIRED | Lines 59, 67: `this.playbackService.verifyToken()` and `this.playbackService.matchDomain()` |
| playback.controller.ts (m3u8 proxy) | key URL rewriting | regex replace for EXT-X-KEY URI | WIRED | Lines 133-136: regex replaces key URIs with token-included paths |
| policies/page.tsx | /api/policies | apiFetch | WIRED | Line 76: `apiFetch<Policy[]>('/api/policies')` |
| embed/[session]/page.tsx | /api/playback/sessions | fetch session info | WIRED | Line 34: `fetch(\`${API_BASE}/api/playback/sessions/${sessionId}\`)` |
| cameras/[id]/page.tsx | EmbedCodeDialog | Component import + render | WIRED | Line 50: import, line 555: rendered with open state |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| policies/page.tsx | policies | GET /api/policies -> PoliciesService.findAll -> Prisma query | Yes -- findMany with orgId filter | FLOWING |
| embed/[session]/page.tsx | session (SessionInfo) | GET /api/playback/sessions/:id -> PlaybackService.getSession -> Prisma findUnique | Yes -- DB lookup by ID | FLOWING |
| sessions-table.tsx | sessions | GET /api/playback/sessions?cameraId=X | **No backend endpoint for list query** | DISCONNECTED |
| resolved-policy-card.tsx | resolved (ResolvedPolicy) | GET /api/policies/resolve/:cameraId -> PoliciesService.resolve | Yes -- DB query, but `sources` field not returned by backend | PARTIAL (data flows but sources field missing) |

### Behavioral Spot-Checks

Step 7b: SKIPPED (requires running servers -- NestJS + PostgreSQL + SRS)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PLAY-01 | 03-01 | POST /cameras/{id}/sessions returns time-limited HLS playback URL | SATISFIED | PlaybackController.createSession + PlaybackService.createSession |
| PLAY-02 | 03-01 | JWT-signed playback tokens with camera scope, domain restriction, expiry | SATISFIED | jwt.sign with sub, cam, org, domains, exp claims |
| PLAY-03 | 03-02 | Domain allowlist enforcement on HLS playback (wildcard subdomain support) | SATISFIED | SRS on_play callback calls matchDomain with wildcard support |
| PLAY-04 | 03-01 | Session TTL configurable per policy (default 2 hours) | SATISFIED | TTL from resolved policy (default 7200s), used in JWT expiresIn + session expiresAt |
| PLAY-05 | 03-01 | Viewer concurrency limits per camera enforced at session creation | SATISFIED | Checked at session creation + SRS on_play callback |
| PLAY-06 | 03-03 | Embed code generation (iframe snippet + hls.js snippet) | SATISFIED | EmbedCodeDialog with iframe, hls.js, React tabs. Note: REQUIREMENTS.md still shows [ ] but code exists |
| PLAY-07 | 03-02 | HLS segment encryption via SRS hls_keys with backend key serving | SATISFIED | PlaybackController.serveHlsKey with JWT verification + m3u8 proxy key URL rewriting |
| POL-01 | 03-01 | Playback policies with TTL, rate limit, viewer concurrency, domain allowlist | SATISFIED | Policy model with all fields, PoliciesService CRUD |
| POL-02 | 03-01 | Policy resolution order: Camera > Site > Project > System defaults | SATISFIED | PoliciesService.resolve with LEVEL_PRIORITY sorting |
| POL-03 | 03-02 | Three-tier rate limiting (global, per-tenant, per-API-key) | SATISFIED | ThrottlerModule with 3 tiers, ThrottlerGuard as APP_GUARD |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| apps/api/src/playback/playback.service.ts | 72-73 | `token: '', hlsUrl: ''` placeholder values | Info | Intentional -- immediately updated after JWT signing (lines 97-99). Not a stub. |
| apps/web/src/app/admin/cameras/components/sessions-table.tsx | 63-64 | Fetches from endpoint that does not exist (`/api/playback/sessions?cameraId=X`) | Warning | Backend only has GET /playback/sessions/:id (single). List endpoint missing. Component gracefully handles with empty state. |
| apps/web/src/app/admin/policies/components/resolved-policy-card.tsx | 101-125 | References `data.sources?.field` which backend does not return | Warning | ResolvedPolicyCard expects `sources` field from resolve API but PoliciesService.resolve() does not include source tracking. Level badges will not appear. |

### Human Verification Required

### 1. Policy CRUD Flow

**Test:** Navigate to /admin/policies, create a CAMERA-level policy, edit it, delete it
**Expected:** Full CRUD cycle works with toast notifications, table updates, delete confirmation dialog
**Why human:** UI interaction flow, dialog rendering, form validation requires browser

### 2. Embed Code Dialog

**Test:** On camera detail page, click embed code button, switch between 3 tabs, click copy
**Expected:** Dialog opens with iframe/hls.js/React tabs, copy button works, snippets contain correct placeholders
**Why human:** Dialog rendering, clipboard API, tab switching requires browser interaction

### 3. Embed Player Page

**Test:** Navigate to /embed/{valid-session-id} with a running stream
**Expected:** Black background, HLS video plays fullscreen, native controls visible
**Why human:** Live stream playback requires SRS infrastructure and visual verification

### 4. Embed Player Error States

**Test:** Navigate to /embed/nonexistent
**Expected:** Black background, centered gray text: "Session not found..."
**Why human:** Visual appearance verification requires browser rendering

### 5. Resolved Policy Card Sources

**Test:** On camera detail Policy tab, verify resolved policy card shows source level badges
**Expected:** Each field shows the level (SYSTEM/PROJECT/SITE/CAMERA) from which it was inherited
**Why human:** Backend may not return sources field -- need runtime check to confirm if badges render

### Gaps Summary

All 5 roadmap success criteria are verified at the code level. All 10 requirement IDs (PLAY-01 through PLAY-07, POL-01 through POL-03) are satisfied with substantive implementations.

All non-blocking issues from initial verification are now **resolved as of 2026-04-15** via quick task `260415-khn`:

- Sessions table data disconnection — `GET /api/playback/sessions` list endpoint added in commit `7bb8b7a`; `sessions-table.tsx` hydrates with live data
- Resolved policy sources field — `sources` field added to `PoliciesService.resolve()` in commit `671a2ad`; `ResolvedPolicyCard` shows source-level badges
- Tests: `c4ed318`, `9dd8aee`

No outstanding non-UI items for Phase 03.

**Note:** REQUIREMENTS.md shows PLAY-06 as `[ ]` (unchecked) but the implementation is complete. This is a documentation update needed.

---

_Verified: 2026-04-10T20:00:00Z_
_Verifier: Claude (gsd-verifier)_
