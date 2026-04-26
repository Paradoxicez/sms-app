---
phase: quick-260427-2sd
plan: 01
subsystem: web/navigation
tags: [ui-polish, sidebar, header, navigation, branding]
requires:
  - StreamBridgeLogo (already shipped)
  - NotificationBell self-loads its own session
  - useSidebar() returns state="expanded"|"collapsed"
provides:
  - AppSidebar with no portalBadge/portalBadgeTitle props
  - Top-header org badge + NotificationBell on both portals
  - Sidebar footer version label "v0.1.0" (expanded only)
affects:
  - apps/web/src/components/nav/app-sidebar.tsx
  - apps/web/src/components/nav/sidebar-footer.tsx
  - apps/web/src/app/app/layout.tsx
  - apps/web/src/app/admin/layout.tsx
  - apps/web/src/__tests__/app-sidebar.test.tsx
tech_stack:
  added: []
  patterns:
    - Right-align secondary header content with `ml-auto flex` cluster
    - Module-level constant for app version (sync with package.json on release)
key_files:
  created: []
  modified:
    - apps/web/src/components/nav/app-sidebar.tsx
    - apps/web/src/components/nav/sidebar-footer.tsx
    - apps/web/src/app/app/layout.tsx
    - apps/web/src/app/admin/layout.tsx
    - apps/web/src/__tests__/app-sidebar.test.tsx
decisions:
  - Place version label as a 11px muted div above DropdownMenuTrigger inside SidebarFooterContent (single source of truth — both portals reuse footer)
  - Hide version label when sidebar collapses (icon-only mode prioritises affordances over chrome)
  - Mirror identical badge+bell cluster on tenant and admin headers; differ only in badge text (truncated activeOrgName vs literal "Platform")
metrics:
  duration_seconds: 184
  completed_at: "2026-04-26T19:06:47Z"
  tasks_completed: 2
  checkpoint_skipped: 1
  files_changed: 5
---

# Quick Task 260427-2sd: Move Org Badge + Bell to Top Header Bar Summary

Moved the org/portal badge and `<NotificationBell />` from the cramped sidebar header into the top-right cluster of each layout's `<header>`, simplified `AppSidebar` to take no `portalBadge` / `portalBadgeTitle` props, and added a discreet `v0.1.0` build label inside the sidebar footer (only visible when the sidebar is expanded).

## What Changed

### `apps/web/src/components/nav/app-sidebar.tsx`
- Dropped `NotificationBell` import.
- Removed `portalBadge: string;` and `portalBadgeTitle?: string;` from `AppSidebarProps`.
- Rewrote `SidebarHeaderContent` to be parameterless: renders only `<StreamBridgeLogo />` (collapsed) or logo + "StreamBridge" wordmark (expanded). No badge, no bell, no `justify-between`.
- Removed the corresponding props from the `AppSidebar({...})` destructure and from the `<SidebarHeaderContent />` invocation.

### `apps/web/src/components/nav/sidebar-footer.tsx`
- Added module-level constant `const APP_VERSION = "0.1.0";` (commented "Sync with apps/web/package.json on release").
- Wrapped the existing `<DropdownMenu>` in a fragment and prepended a conditional `<div>` that renders `v{APP_VERSION}` only when `state === "expanded"`. Styling: `px-3 pb-1 text-[11px] font-medium text-muted-foreground/60` — small, dim, sits directly above the user dropdown trigger.
- No changes to dropdown contents, avatar logic, or sign-out handler.

### `apps/web/src/app/app/layout.tsx` (tenant)
- Imported `NotificationBell` from `@/components/notifications/notification-bell`.
- Removed `portalBadge=` and `portalBadgeTitle=` from `<AppSidebar />`.
- Replaced the bare `<header>{ <SidebarTrigger /> }</header>` with a flex header that adds an `ml-auto` cluster containing:
  - A truncated `activeOrgName` badge (or "Workspace" fallback), with `title={activeOrgName}` for full-name tooltip on hover.
  - `<NotificationBell />`.
- Reused existing `truncate(...)` helper and `activeOrgName` from `useCurrentRole()` — no new imports/hooks.

### `apps/web/src/app/admin/layout.tsx` (admin)
- Imported `NotificationBell`.
- Removed `portalBadge="Platform"` from `<AppSidebar />`.
- Replaced the bare `<header>{ <SidebarTrigger /> }</header>` with a flex header that adds an `ml-auto` cluster containing:
  - A literal "Platform" badge (no truncation, no tooltip).
  - `<NotificationBell />`.

## Visual Outcome

- **Sidebar header (expanded)**: just the StreamBridge icon + "StreamBridge" wordmark — no longer fights for ~240px with badge + bell.
- **Sidebar header (collapsed)**: just the icon.
- **Top header bar (tenant)**: `[trigger] ─── [orgBadge truncated, tooltip] [bell]`
- **Top header bar (admin)**: `[trigger] ─── [Platform badge] [bell]`
- **Sidebar footer (expanded)**: small dim `v0.1.0` line directly above the user avatar/name row.
- **Sidebar footer (collapsed)**: version label hidden — only the avatar trigger remains.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated `apps/web/src/__tests__/app-sidebar.test.tsx` to match new AppSidebarProps**
- **Found during:** Task 2 typecheck verification
- **Issue:** `app-sidebar.test.tsx` `renderSidebar()` helper passed `portalBadge="Test"` and a `"renders portal badge"` test asserted on it, both of which referenced the now-removed prop. `npx tsc --noEmit` flagged `TS2322` on the prop assignment.
- **Fix:** Dropped the `portalBadge="Test"` line from `renderSidebar()` and removed the `"renders portal badge"` `it()` block (the assertion no longer applies — badge moved out of AppSidebar entirely).
- **Files modified:** `apps/web/src/__tests__/app-sidebar.test.tsx`
- **Commit:** `6a5cd2f`

This is in scope: the test file directly tests the AppSidebar component whose prop surface we changed. Without the fix, the typecheck/build would block — so the prop removal is incomplete until the test catches up.

## Verification

- `npx tsc --noEmit` (run from `apps/web/`): **No errors found** after Task 2 + the test fix.
- `grep -rn "portalBadge" apps/web/src/`: zero matches (no lingering references anywhere).
- All Task 1 grep gates pass:
  - `app-sidebar.tsx` has 0 `portalBadge|portalBadgeTitle` occurrences.
  - `app-sidebar.tsx` has 0 `NotificationBell` occurrences.
  - `sidebar-footer.tsx` contains `APP_VERSION` and `state === "expanded"`.
- All Task 2 grep gates pass:
  - `app/layout.tsx` has exactly 2 `NotificationBell` matches (1 import + 1 usage), 0 `portalBadge` matches.
  - `admin/layout.tsx` has exactly 2 `NotificationBell` matches (1 import + 1 usage), 0 `portalBadge` matches.

Human visual verification (Task 3, `checkpoint:human-verify`) is pending — orchestrator will surface to user.

## Commits

- `2d5c0c5` — refactor(quick-260427-2sd): simplify sidebar header + add version label to footer (Task 1)
- `6a5cd2f` — feat(quick-260427-2sd): move org badge + NotificationBell to top header bar (Task 2 + test fix)

## Self-Check

- File `apps/web/src/components/nav/app-sidebar.tsx`: FOUND
- File `apps/web/src/components/nav/sidebar-footer.tsx`: FOUND
- File `apps/web/src/app/app/layout.tsx`: FOUND
- File `apps/web/src/app/admin/layout.tsx`: FOUND
- File `apps/web/src/__tests__/app-sidebar.test.tsx`: FOUND
- Commit `2d5c0c5`: FOUND
- Commit `6a5cd2f`: FOUND

## Self-Check: PASSED
