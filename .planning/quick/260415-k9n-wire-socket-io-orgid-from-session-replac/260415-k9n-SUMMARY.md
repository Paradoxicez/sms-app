---
phase: quick-260415-k9n
plan: 01
subsystem: web/admin
tags: [security, multi-tenancy, socket.io, bugfix]
requires:
  - apps/web/src/hooks/use-camera-status.ts (existing)
  - apps/web/src/lib/auth-client.ts (existing)
provides:
  - session-derived orgId wired into cameras list, detail, and map Socket.IO connections
affects:
  - apps/web/src/app/admin/cameras/page.tsx
  - apps/web/src/app/admin/cameras/[id]/page.tsx
  - apps/web/src/app/admin/map/page.tsx
tech-stack:
  added: []
  patterns:
    - authClient.getSession() on mount to derive activeOrganizationId for Socket.IO room
key-files:
  created: []
  modified:
    - apps/web/src/app/admin/cameras/page.tsx
    - apps/web/src/app/admin/cameras/[id]/page.tsx
    - apps/web/src/app/admin/map/page.tsx
decisions:
  - "Mirror dashboard page's session-load pattern exactly for codebase consistency"
metrics:
  duration: ~3min
  completed: 2026-04-15
  tasks: 3
  files: 3
  commits: 2
requirements:
  - PHASE-02-VERIFICATION-ITEM-1
---

# Quick 260415-k9n: Wire Socket.IO orgId from Session Summary

**One-liner:** Replaced hardcoded `'default'` orgId placeholder in three admin pages' `useCameraStatus` calls with session-derived `activeOrganizationId`, closing a P0 multi-tenant Socket.IO leak.

## What Changed

All three remaining admin pages that consume `useCameraStatus` now load the current session on mount and pass the real `activeOrganizationId` instead of the `'default'` room name. The hook already short-circuits on `!orgId`, so no Socket.IO connection fires until the real orgId is known. This matches the pattern already used by `apps/web/src/app/admin/dashboard/page.tsx`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire session orgId into cameras list page | `48c4ffb` | `apps/web/src/app/admin/cameras/page.tsx` |
| 2 | Wire session orgId into camera detail and map pages | `02cfe4f` | `apps/web/src/app/admin/cameras/[id]/page.tsx`, `apps/web/src/app/admin/map/page.tsx` |
| 3 | Verify no `'default'` literal remains (verification-only) | — | — |

## Verification Results

- `grep -rn "useCameraStatus(\s*['\"]default['\"]" src/app/admin` — **no matches**
- `grep -rn "activeOrganizationId" src/app/admin/cameras/page.tsx src/app/admin/cameras/[id]/page.tsx src/app/admin/map/page.tsx` — all three files present
- `pnpm tsc --noEmit` — **passed with no errors**

## Success Criteria

- Phase 02 VERIFICATION.md item #1 resolved: P0 multi-tenant Socket.IO leak closed
- Zero regressions in existing camera status update behavior (hook contract unchanged; returns early on `undefined` orgId until session resolves)
- Single consistent pattern for deriving orgId from session across all four admin pages that use `useCameraStatus` (dashboard, cameras list, camera detail, map)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: apps/web/src/app/admin/cameras/page.tsx
- FOUND: apps/web/src/app/admin/cameras/[id]/page.tsx
- FOUND: apps/web/src/app/admin/map/page.tsx
- FOUND commit: 48c4ffb
- FOUND commit: 02cfe4f
