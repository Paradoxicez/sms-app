---
phase: 09-layout-login
plan: 01
subsystem: navigation
tags: [sidebar, shadcn, nav, layout, role-filtering]
dependency_graph:
  requires: []
  provides: [AppSidebar, nav-config, sidebar-footer, admin-layout-sidebar, tenant-layout-sidebar]
  affects: [admin-layout, app-layout]
tech_stack:
  added: [shadcn-sidebar]
  patterns: [collapsible-icon-sidebar, render-prop-links, cookie-state-persistence]
key_files:
  created:
    - apps/web/src/components/nav/nav-config.ts
    - apps/web/src/components/nav/app-sidebar.tsx
    - apps/web/src/components/nav/sidebar-footer.tsx
    - apps/web/src/__tests__/app-sidebar.test.tsx
  modified:
    - apps/web/src/app/admin/layout.tsx
    - apps/web/src/app/app/layout.tsx
    - apps/web/src/__tests__/platform-nav.test.tsx
    - apps/web/src/__tests__/tenant-nav.test.tsx
    - apps/web/src/__tests__/admin-layout.test.tsx
    - apps/web/src/__tests__/app-layout.test.tsx
  deleted:
    - apps/web/src/components/nav/nav-shell.tsx
    - apps/web/src/components/nav/platform-nav.tsx
    - apps/web/src/components/nav/tenant-nav.tsx
    - apps/web/src/components/sidebar-nav.tsx
decisions:
  - "Used shadcn Sidebar with collapsible='icon' for both portals via single shared AppSidebar"
  - "Moved useFeatures hook call to tenant layout (before early returns) to respect React hooks rules"
  - "SidebarMenuButton data-active is boolean attribute (empty string = true) per base-ui convention"
metrics:
  duration: 352s
  completed: "2026-04-17T03:16:44Z"
  tasks: 3
  files_created: 4
  files_modified: 6
  files_deleted: 4
  tests_passed: 30
---

# Phase 09 Plan 01: Sidebar Migration Summary

Migrated both portal layouts from custom NavShell/PlatformNav/TenantNav to shadcn Sidebar system with collapsible icon-only mode, cookie persistence, keyboard shortcut (Cmd+B), and mobile Sheet support.

## One-liner

Shared AppSidebar component using shadcn collapsible="icon" with typed nav config, ROLE_MATRIX filtering, and cookie-persisted state.

## What Was Done

### Task 1: Create nav config arrays and shared sidebar component (483a0c6)
- Created `nav-config.ts` with typed `NavItem`/`NavGroup` interfaces, `adminNavGroups` (7 items), `tenantNavGroups` (4 groups, 13 items), `ROLE_MATRIX`, and `filterNavGroups` helper
- Created `app-sidebar.tsx` with shared `AppSidebar` component using `collapsible="icon"`, render prop Links, tooltips, active route detection, and NotificationBell
- Created `sidebar-footer.tsx` with expanded (inline user info) and collapsed (dropdown menu with sign out) states

### Task 2: Integrate sidebar into both portal layouts (d303b37)
- Replaced `PlatformNav` import with `SidebarProvider` + `AppSidebar` + `SidebarInset` in admin layout
- Replaced `TenantNav` import with `SidebarProvider` + `AppSidebar` + `SidebarInset` in tenant layout
- Moved `useFeatures` + `filterNavGroups` role filtering to tenant layout (called before early returns for hooks rules compliance)
- All auth logic preserved: checkAuth, bootstrap, role redirects (D-22)

### Task 3: Delete old nav files and update tests (8481d51)
- Deleted 4 old nav files: nav-shell.tsx, platform-nav.tsx, tenant-nav.tsx, sidebar-nav.tsx
- Rewrote platform-nav.test.tsx to test `adminNavGroups` config (5 tests)
- Rewrote tenant-nav.test.tsx to test `filterNavGroups` and `ROLE_MATRIX` (11 tests)
- Updated admin-layout.test.tsx and app-layout.test.tsx to mock AppSidebar (7 tests)
- Created app-sidebar.test.tsx for component rendering (7 tests)
- All 30 tests pass, zero remaining imports of deleted files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] React hooks rules violation in tenant layout**
- **Found during:** Task 2
- **Issue:** `useFeatures` was placed after early return statements in app/layout.tsx, violating React hooks rules (hooks must be called unconditionally)
- **Fix:** Moved `useFeatures(activeOrgId)` call to top of component, before any early returns, right after `useCurrentRole()`
- **Files modified:** apps/web/src/app/app/layout.tsx
- **Commit:** d303b37

**2. [Rule 1 - Bug] data-active attribute assertion in app-sidebar test**
- **Found during:** Task 3
- **Issue:** shadcn SidebarMenuButton sets `data-active=""` (boolean HTML attribute) not `data-active="true"`. Test expected `"true"` value.
- **Fix:** Changed assertion to `toHaveAttribute("data-active")` (presence check)
- **Files modified:** apps/web/src/__tests__/app-sidebar.test.tsx
- **Commit:** 8481d51

## Threat Mitigations

| Threat ID | Status | Implementation |
|-----------|--------|----------------|
| T-09-01 | Mitigated | ROLE_MATRIX preserved in filterNavGroups; viewer cannot see Developer items (verified in tenant-nav.test.tsx) |
| T-09-02 | Mitigated | All auth checks preserved in both layouts: admin role redirect, user role redirect, session checks (verified in layout tests) |
| T-09-03 | Accepted | sidebar_state cookie is UI-only preference, no security impact |

## Known Stubs

None -- all components are fully wired with real data sources.

## Self-Check: PASSED

- All 8 created/modified files exist
- All 4 deleted files confirmed removed
- All 3 commits found in git log (483a0c6, d303b37, 8481d51)
