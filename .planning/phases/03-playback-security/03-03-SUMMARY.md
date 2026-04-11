---
phase: 03-playback-security
plan: 03
subsystem: web
tags: [nextjs, policies, embed, hls, ui, dialog]

# Dependency graph
requires:
  - phase: 03-playback-security
    provides: Policy CRUD API, PlaybackSession API, JWT signing, HLS key endpoint
provides:
  - Policy management UI (list, create dialog, edit dialog, delete)
  - Camera embed code dialog with iframe/hls.js/React tabs
  - Public /embed/{session} player page
  - Sessions table on camera detail policy tab
  - Sidebar nav with Policies link
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [dialog-based CRUD, Base UI Select with custom value display, Next.js rewrites proxy]

key-files:
  created:
    - apps/web/src/app/admin/policies/page.tsx
    - apps/web/src/app/admin/policies/components/create-policy-dialog.tsx
    - apps/web/src/app/admin/policies/components/edit-policy-dialog.tsx
    - apps/web/src/app/admin/policies/components/policy-form.tsx
    - apps/web/src/app/admin/policies/components/policy-level-badge.tsx
    - apps/web/src/app/admin/policies/components/domain-list-editor.tsx
    - apps/web/src/app/admin/policies/components/resolved-policy-card.tsx
    - apps/web/src/app/admin/cameras/components/embed-code-dialog.tsx
    - apps/web/src/app/admin/cameras/components/sessions-table.tsx
    - apps/web/src/app/admin/cameras/components/code-block.tsx
    - apps/web/src/app/embed/[session]/page.tsx
    - apps/web/src/app/embed/[session]/layout.tsx
  modified:
    - apps/web/src/app/admin/cameras/[id]/page.tsx
    - apps/web/src/components/sidebar-nav.tsx
    - apps/web/src/app/admin/layout.tsx
    - apps/web/src/app/(dashboard)/layout.tsx
    - apps/web/src/lib/api.ts
    - apps/web/src/lib/auth-client.ts
    - apps/web/next.config.ts

key-decisions:
  - "Policy create/edit use dialog pattern (not full page) to match other admin pages"
  - "Base UI Select requires custom SelectValue children to display names instead of UUIDs"
  - "Next.js rewrites proxy /api/* to backend for same-origin cookie handling"
  - "Auth client uses window.location.origin for same-origin requests"
  - "System Default policy deletion blocked by name check, not level check"

patterns-established:
  - "Dialog-based CRUD: list page with create/edit dialogs, no separate pages"
  - "SelectValue with entity lookup for Base UI Select name display"
  - "apiFetch uses relative URLs through Next.js rewrites proxy"

requirements-completed: [PLAY-06]

# Metrics
duration: ~30min (including UAT fixes)
completed: 2026-04-11
---

# Phase 03 Plan 03: Frontend — Policies, Embed & Player Summary

**Policy management dialogs, camera embed code generation, and public embed player page**

## Performance

- **Tasks:** 3 (2 code + 1 human verification)
- **Files modified:** 19

## Accomplishments
- Policy list page with table view (name, level badge, scope, TTL, max viewers, domains)
- Create Policy dialog with level-aware placeholders and entity selector
- Edit Policy dialog with disabled level display and entity selector
- Delete policy with System Default protection
- Sidebar nav updated with Policies link (ShieldCheck icon)
- Camera detail page embed button opening Embed Code dialog with iframe/hls.js/React tabs
- Code block component with copy-to-clipboard functionality
- Sessions table on camera detail Policy tab
- Resolved policy card showing effective policy for camera
- Public /embed/{session} page with dark background, HLS player, error handling
- Domain list editor with tag-based UI and validation

## Task Commits

1. **Task 1: Policy management pages + sidebar nav** — `9e95263` (feat)
2. **Task 2: Embed code dialog, sessions table, embed player** — `a6d1b45` (feat)
3. **Task 3: Human verification** — completed via UAT (03-UAT.md, 9/9 passed)

## Runtime Fixes Applied During UAT
- jose ESM → jsonwebtoken CJS compatibility
- Auth redirect path /auth/sign-in → /sign-in
- CORS origin + trustedOrigins for dev port
- Body parser rawBody:true for non-auth routes
- Next.js rewrites proxy for same-origin cookies
- Auto-set active organization on admin layout
- Select dropdown UUID → name display fix
- UI audit top 3 fixes (aria-label, Tailwind presets, spinner color)

## Deviations from Plan
- Policy create/edit changed from full page to dialog pattern (user feedback during UAT)
- Breadcrumb removed from policies page (consistency with other admin pages)

## Issues Encountered
- jose v6 ESM-only incompatible with NestJS CJS — replaced with jsonwebtoken
- Better Auth cross-origin cookie issue — solved with Next.js rewrites proxy
- Base UI Select displays value (UUID) not children — solved with custom SelectValue render

---
*Phase: 03-playback-security*
*Completed: 2026-04-11*
