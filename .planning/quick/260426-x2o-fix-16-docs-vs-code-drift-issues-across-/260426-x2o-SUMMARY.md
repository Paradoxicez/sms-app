---
phase: 260426-x2o
plan: 01
subsystem: tenant-developer-portal-docs
tags: [docs, drift, policies, api-workflow, stream-profiles, webhooks]
requires:
  - apps/api/src/policies/policies.service.ts SYSTEM_DEFAULTS (read-only)
  - apps/api/src/policies/policies.controller.ts route map (read-only)
  - apps/api/src/playback/playback.controller.ts route map (read-only)
  - apps/api/src/streams/dto/create-stream-profile.dto.ts zod schema (read-only)
  - apps/api/src/webhooks/processors/webhook-delivery.processor.ts header set (read-only)
provides:
  - Tenant developer portal docs (policies, api-workflow, stream-profiles, webhooks) aligned with running API
affects:
  - apps/web/src/app/admin/developer/docs/policies/page.tsx
  - apps/web/src/app/admin/developer/docs/api-workflow/page.tsx
  - apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx
  - apps/web/src/app/admin/developer/docs/webhooks/page.tsx
tech-stack:
  added: []
  patterns: ["docs-as-code source-of-truth verification (grep against backend)"]
key-files:
  created: []
  modified:
    - apps/web/src/app/admin/developer/docs/policies/page.tsx
    - apps/web/src/app/admin/developer/docs/api-workflow/page.tsx
    - apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx
    - apps/web/src/app/admin/developer/docs/webhooks/page.tsx
decisions:
  - Use literal `{orgId}` and `{sessionId}` placeholders in docs (matches NestJS @Get route param style; avoids fake IDs that look real)
  - Drop "0 means unlimited" maxViewers claim — verified policies.service.ts has no zero-special-case; default is hard limit of 10
metrics:
  duration: "3m"
  completed: "2026-04-26"
  tasks: 3
  files_modified: 4
  fixes_applied: 16
---

# Quick Task 260426-x2o: Fix 16 Docs-vs-Code Drift Issues Summary

Aligned 4 tenant developer-portal docs pages with the running NestJS API + Next.js routes after audit found 60x-off defaults (TTL 120s vs real 7200s), wrong field names (rateLimitPerMin vs real rateLimit), and endpoint URLs that returned 404 (resolve-policy, HLS, embed).

## What Was Built

### Task 1 — Policies guide aligned with SYSTEM_DEFAULTS (commit 9c54317)

`apps/web/src/app/admin/developer/docs/policies/page.tsx` — 6 fixes:

1. **Resolution Order CodeBlock**: System Policy ttl 120 → 7200, all 5 occurrences of `rateLimitPerMin` → `rateLimit`, System rate-limit value 60 → 100, Resolved row updated to match
2. **Configurable Fields ttl row**: default 120 → 7200, description clarified "(7200 seconds = 2 hours)"
3. **Configurable Fields maxViewers row**: default "0 (unlimited)" → 10, dropped "0 means no limit" (no such special-case in policies.service.ts)
4. **Configurable Fields rate-limit row**: field name rateLimitPerMin → rateLimit, default 60 → 100
5. **POST policies curl payload**: `"rateLimitPerMin": 120` → `"rateLimit": 120`
6. **Resolve-policy curl URL**: `${baseUrl}/api/cameras/cam_abc123/resolved-policy` → `${baseUrl}/api/policies/resolve/cam_abc123`

### Task 2 — api-workflow + stream-profiles + webhooks (commit d37cd13)

`apps/web/src/app/admin/developer/docs/api-workflow/page.tsx` — 2 fixes:

7. **Step 2 hlsUrl + Step 4 Option B hls.js URL**: `${baseUrl}/stream/cam_abc123/index.m3u8?token=...` → `${baseUrl}/api/playback/stream/{orgId}/cam_abc123.m3u8?token=...` (matches `@Get('playback/stream/:orgId/:cameraId.m3u8')` in playback.controller.ts:162)
8. **Step 4 Option A iframe URL**: `${baseUrl}/embed/cam_abc123?token=...` → `${baseUrl}/embed/{sessionId}` plus an explanatory `<p>` note above the iframe explaining sessionId comes from the Step 2 session-create response

`apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx` — 7 fixes (zod schema-aligned):

9. **codec row**: `auto / h264` → `auto / copy / libx264`, description rewritten to explain each enum value
10. **preset row**: `ultrafast to veryslow` → `ultrafast / superfast / veryfast / faster / fast / medium`
11. **resolution row**: `1080p / 720p / 480p / 360p` → `Format: WxH (e.g. 1920x1080, 1280x720, 854x480, 640x360)`
12. **fps row**: `5 / 10 / 15 / 25 / 30` → `Integer 1-60`
13. **videoBitrate row**: `256k to 4000k` → `Format: Nk (e.g. 500k to 8000k typical for transcode); no hard bounds enforced by schema`
14. **audioCodec row**: `aac` → `aac / copy / mute`, description rewritten
15. **audioBitrate row**: `64k / 128k` → `Format: Nk (e.g. 64k, 128k)`

`apps/web/src/app/admin/developer/docs/webhooks/page.tsx` — 1 fix:

16. **HMAC Verification section**: Inserted a new paragraph after the existing "Header format:" line and before the verification CodeBlock, documenting the two informational headers `X-Webhook-Event: {eventName}` and `X-Webhook-Delivery: {uniqueDeliveryId}` (set by webhook-delivery.processor.ts lines 50-52)

### Task 3 — Verification gates (no commit, verification-only)

- `npx tsc --noEmit` in apps/web → **TypeScript: No errors found**
- All 4 docs URLs return HTTP 200 from the dev server on port 3000:
  - `/app/developer/docs/policies → 200`
  - `/app/developer/docs/api-workflow → 200`
  - `/app/developer/docs/stream-profiles → 200`
  - `/app/developer/docs/webhooks → 200`
- `git diff --name-only HEAD~2 HEAD` shows exactly the 4 expected files, no collateral changes

## Verification Gates (all 6 passed)

| Gate | Result |
|------|--------|
| `pnpm` web typecheck (via `npx tsc --noEmit`) | PASS — zero TypeScript errors |
| `grep -rn "rateLimitPerMin" apps/web/src/app/admin/developer/docs` | PASS — 0 matches |
| `grep -rEn "/api/cameras/[^/]+/resolved-policy\|/stream/[^/]+/index\.m3u8\|/embed/cam_" apps/web/.../docs` | PASS — 0 matches |
| `curl /app/developer/docs/policies` | PASS — 200 |
| `curl /app/developer/docs/api-workflow` | PASS — 200 |
| Diff scope: exactly 4 files | PASS — only the 4 target files modified |

## Source-of-Truth Cross-Check (key_links from PLAN.md frontmatter)

| Docs page | API source | Verified pattern |
|-----------|------------|------------------|
| policies/page.tsx | policies.service.ts SYSTEM_DEFAULTS | `ttl=7200`, `rateLimit=100`, `maxViewers=10` all present |
| policies/page.tsx | policies.controller.ts `@Get('resolve/:cameraId')` | `/api/policies/resolve/cam_abc123` present |
| api-workflow/page.tsx | playback.controller.ts `@Get('playback/stream/:orgId/:cameraId.m3u8')` | `/api/playback/stream/{orgId}/cam_abc123.m3u8` present |
| stream-profiles/page.tsx | create-stream-profile.dto.ts zod enums | `auto / copy / libx264`, `ultrafast / superfast / veryfast / faster / fast / medium`, `aac / copy / mute` all present |
| webhooks/page.tsx | webhook-delivery.processor.ts headers | `X-Webhook-Event` + `X-Webhook-Delivery` both present |

## Deviations from Plan

None — plan executed exactly as written. The 16 fixes were applied verbatim per the spec.

## Self-Check: PASSED

- File `apps/web/src/app/admin/developer/docs/policies/page.tsx` exists (modified)
- File `apps/web/src/app/admin/developer/docs/api-workflow/page.tsx` exists (modified)
- File `apps/web/src/app/admin/developer/docs/stream-profiles/page.tsx` exists (modified)
- File `apps/web/src/app/admin/developer/docs/webhooks/page.tsx` exists (modified)
- Commit 9c54317 (Task 1 — policies) found in git log
- Commit d37cd13 (Task 2 — api-workflow + stream-profiles + webhooks) found in git log
- TypeScript build passes (zero errors)
- All 4 docs pages return HTTP 200
- Diff scope verified: exactly 4 files
