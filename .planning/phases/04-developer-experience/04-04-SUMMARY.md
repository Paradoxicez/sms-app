---
phase: 04-developer-experience
plan: 04
subsystem: ui
tags: [react, nextjs, developer-portal, api-keys, webhooks, quick-start, sidebar-nav]

# Dependency graph
requires:
  - phase: 04-01
    provides: API key management backend (CRUD, guards, usage tracking)
  - phase: 04-02
    provides: Swagger UI and batch playback sessions endpoint
  - phase: 04-03
    provides: Webhook CRUD backend, BullMQ delivery processor, HMAC signing
provides:
  - Developer Portal frontend with sidebar navigation
  - Quick Start guide with D-07 dynamic curl examples (real API key + camera ID)
  - API key management UI (create/list/revoke with one-time reveal)
  - Webhook management UI (create/list/detail/deliveries with one-time secret reveal)
  - CodeBlock component with copy-to-clipboard
affects: [05-monitoring, 06-scaling, 07-recording]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - One-time secret reveal dialog pattern (API key + webhook secret)
    - Dynamic curl example population from live API data (D-07 Stripe-style)
    - Expandable delivery log rows with JSON payload display

key-files:
  created:
    - apps/web/src/components/sidebar-nav.tsx (Developer section added)
    - apps/web/src/components/code-block.tsx
    - apps/web/src/components/quick-start-guide.tsx
    - apps/web/src/app/admin/developer/page.tsx
    - apps/web/src/app/admin/developer/api-keys/page.tsx
    - apps/web/src/components/api-key-create-dialog.tsx
    - apps/web/src/components/api-key-table.tsx
    - apps/web/src/app/admin/developer/webhooks/page.tsx
    - apps/web/src/app/admin/developer/webhooks/[id]/page.tsx
    - apps/web/src/components/webhook-create-dialog.tsx
    - apps/web/src/components/webhook-delivery-log.tsx
  modified:
    - apps/api/src/api-keys/api-keys.module.ts
    - apps/api/src/api-keys/auth-or-apikey.guard.ts
    - apps/api/src/auth/auth.module.ts

key-decisions:
  - "AuthOrApiKeyGuard DI resolved via ModuleRef lazy resolution to avoid circular dependency"
  - "Webhook pages use isActive field from API response (not 'active') matching backend schema"

patterns-established:
  - "One-time reveal dialog: show secret once on creation, transition to reveal card with copy + warning, clear on close"
  - "Dynamic Quick Start: fetch real user data (API keys, cameras) and pre-fill curl examples like Stripe dashboard"
  - "Developer sidebar section: separated from admin nav with Separator + section label"

requirements-completed: [DEV-01, DEV-02]

# Metrics
duration: 15min
completed: 2026-04-12
---

# Phase 04 Plan 04: Developer Portal Frontend Summary

**Developer Portal with sidebar nav, D-07 dynamic Quick Start curl examples, API key management UI with one-time reveal, and webhook management pages with delivery log viewer**

## Performance

- **Duration:** ~15 min (across multiple sessions including checkpoint verification)
- **Started:** 2026-04-12T00:00:00Z
- **Completed:** 2026-04-12
- **Tasks:** 4 (3 auto + 1 checkpoint:human-verify)
- **Files modified:** 14

## Accomplishments

- Developer section added to sidebar with Quick Start, API Keys, Webhooks, Docs, and API Reference links
- Quick Start 3-step guide dynamically pre-fills curl examples with user's real API key (prefix+lastFour) and camera IDs per D-07 design decision
- API key management page with create dialog (PROJECT/SITE scope selector), one-time key reveal with copy + warning, table with revoke confirmation
- Webhook management: create dialog with event checkboxes and HTTPS validation, subscription list, detail page with delivery log showing status/payload/retries

## Task Commits

Each task was committed atomically:

1. **Task 1: Sidebar nav + CodeBlock + Dynamic Quick Start guide (D-07)** - `0032b8b` (feat)
2. **Task 2: API keys management page** - `c8a0bbe` (feat)
3. **Task 3: Webhooks management pages + delivery log** - `a983579` (feat)
4. **Task 4: Visual verification checkpoint** - approved by user (no commit)

**Post-checkpoint fixes:**
- `1f391a2` - fix: resolve AuthOrApiKeyGuard DI via ModuleRef lazy resolution
- `61c8433` - fix: use isActive field from API instead of active in webhook pages

## Files Created/Modified

- `apps/web/src/components/sidebar-nav.tsx` - Developer nav section with 5 links + external API Reference
- `apps/web/src/components/code-block.tsx` - Dark-themed code block with clipboard copy button
- `apps/web/src/components/quick-start-guide.tsx` - D-07 dynamic Quick Start fetching real API keys and cameras
- `apps/web/src/app/admin/developer/page.tsx` - Developer Portal overview page with QuickStartGuide
- `apps/web/src/app/admin/developer/api-keys/page.tsx` - API key list with create/revoke flows
- `apps/web/src/components/api-key-create-dialog.tsx` - Create dialog with scope selector and one-time reveal
- `apps/web/src/components/api-key-table.tsx` - API key table with status badges and revoke action
- `apps/web/src/app/admin/developer/webhooks/page.tsx` - Webhook subscription list with create/delete
- `apps/web/src/app/admin/developer/webhooks/[id]/page.tsx` - Webhook detail with delivery log
- `apps/web/src/components/webhook-create-dialog.tsx` - Create dialog with event checkboxes and secret reveal
- `apps/web/src/components/webhook-delivery-log.tsx` - Delivery log table with expandable payload rows
- `apps/api/src/api-keys/api-keys.module.ts` - Fixed module exports for guard DI
- `apps/api/src/api-keys/auth-or-apikey.guard.ts` - ModuleRef lazy resolution for circular DI
- `apps/api/src/auth/auth.module.ts` - Auth module adjustment for guard resolution

## Decisions Made

- **AuthOrApiKeyGuard DI via ModuleRef:** Used lazy resolution through ModuleRef to avoid circular dependency between ApiKeysModule and AuthModule
- **isActive field mapping:** Webhook pages use `isActive` field from API response (matching Prisma schema) rather than `active`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AuthOrApiKeyGuard circular DI resolution**
- **Found during:** Post-checkpoint testing
- **Issue:** AuthOrApiKeyGuard had circular dependency between ApiKeysModule and AuthModule causing DI failure
- **Fix:** Switched to ModuleRef lazy resolution pattern
- **Files modified:** apps/api/src/api-keys/auth-or-apikey.guard.ts, apps/api/src/api-keys/api-keys.module.ts, apps/api/src/auth/auth.module.ts
- **Committed in:** 1f391a2

**2. [Rule 1 - Bug] Webhook isActive field mismatch**
- **Found during:** Post-checkpoint testing
- **Issue:** Frontend used `active` property but API returns `isActive` (matching Prisma schema field name)
- **Fix:** Updated webhook pages to use `isActive` field
- **Files modified:** apps/web/src/app/admin/developer/webhooks/page.tsx, apps/web/src/app/admin/developer/webhooks/[id]/page.tsx
- **Committed in:** 61c8433

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct runtime behavior. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Developer Portal frontend complete -- all CRUD operations wired to backend APIs from plans 01-03
- Phase 04 plan 05 (if any) or Phase 05 can proceed
- Quick Start guide will automatically show real data as users create API keys and cameras

## Self-Check: PASSED

- All 11 created files verified present
- All 5 commit hashes verified in git log (0032b8b, c8a0bbe, a983579, 1f391a2, 61c8433)

---
*Phase: 04-developer-experience*
*Completed: 2026-04-12*
