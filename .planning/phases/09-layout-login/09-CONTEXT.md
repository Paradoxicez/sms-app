# Phase 9: Layout & Login - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Collapsible sidebar and login page redesign across the entire application. Users can collapse the sidebar to icon-only mode with state persistence, and the login page gets a polished split-screen redesign with "remember me" functionality. No new pages or features — only layout-level changes and login UX improvements.

</domain>

<decisions>
## Implementation Decisions

### Sidebar Migration Strategy
- **D-01:** Adopt shadcn `sidebar.tsx` fully — migrate away from custom `NavShell`, `PlatformNav`, `TenantNav` components
- **D-02:** Create separate nav config arrays (`adminNavItems[]` and `tenantNavItems[]`) passed into a shared Sidebar component per portal layout
- **D-03:** Delete custom nav files (`nav-shell.tsx`, `platform-nav.tsx`, `tenant-nav.tsx`, `sidebar-nav.tsx`) after migration

### Sidebar Collapse Behavior
- **D-04:** Icon-only mode (3rem width) with tooltip showing menu item name on hover — no expand-on-hover
- **D-05:** Toggle via click on sidebar rail/trigger button + Cmd+B keyboard shortcut (already in shadcn sidebar)
- **D-06:** Sidebar collapse state persists via cookie (`sidebar_state`, 7-day max-age) — already built into shadcn sidebar

### Mobile Sidebar
- **D-07:** Keep shadcn Sheet/drawer overlay pattern for mobile — hamburger menu opens full sidebar as overlay, same as current behavior

### Nav Groups
- **D-08:** Section groups (Main, Developer for tenant; single group for admin) with label + divider when expanded, divider-only when collapsed — labels hidden in icon-only mode

### Sidebar Footer
- **D-09:** When expanded: avatar + user name + organization name (existing pattern)
- **D-10:** When collapsed: avatar only — click opens dropdown menu with user name, org info, and logout action

### Login Page Redesign
- **D-11:** Split-screen layout — left side: branding/hero with SMS Platform logo and tagline; right side: sign-in form
- **D-12:** "Remember me" checkbox — checked: session extends to 30 days; unchecked: session expires when browser closes
- **D-13:** Implement remember me via better-auth session configuration (rememberMe option in signIn.email call)

### Layout Resize Handling
- **D-14:** Listen for CSS `transitionend` event on sidebar element after collapse/expand
- **D-15:** On transition end: call Leaflet `map.invalidateSize()` for map page + dispatch `window.resize` event for Recharts charts
- **D-16:** No polling or ResizeObserver — single event-driven approach

### Claude's Discretion
- Split-screen branding panel design (hero image, pattern, gradient, or illustration)
- Login form field styling and validation feedback details
- Sidebar transition animation timing (200ms ease-linear already in shadcn)
- Tooltip styling and positioning
- Exact dropdown menu items in collapsed footer

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Sidebar (shadcn)
- `apps/web/src/components/ui/sidebar.tsx` — Full shadcn sidebar component with SidebarProvider, collapse logic, cookie persistence, Cmd+B shortcut, mobile Sheet support (559 lines)

### Current Navigation (to be replaced)
- `apps/web/src/components/nav/nav-shell.tsx` — Shared wrapper with mobile hamburger + desktop sidebar layout
- `apps/web/src/components/nav/platform-nav.tsx` — Admin portal nav items (Dashboard, Organizations, Packages, Cluster Nodes, Stream Engine, Platform Audit, Users)
- `apps/web/src/components/nav/tenant-nav.tsx` — Tenant portal nav items with Main + Developer sections
- `apps/web/src/components/sidebar-nav.tsx` — Legacy/alternate sidebar nav

### Layouts (integration points)
- `apps/web/src/app/admin/layout.tsx` — Admin layout using PlatformNav, needs SidebarProvider
- `apps/web/src/app/app/layout.tsx` — Tenant layout using TenantNav, needs SidebarProvider

### Login Page
- `apps/web/src/app/(auth)/sign-in/page.tsx` — Current login form (email/password, Zod validation, better-auth)
- `apps/web/src/lib/auth-client.ts` — better-auth client configuration

### Resize-Sensitive Components
- `apps/web/src/components/map/camera-map-inner.tsx` — Leaflet map with hardcoded viewport heights
- `apps/web/src/components/dashboard/bandwidth-chart.tsx` — Recharts chart with fixed height
- `apps/web/src/components/dashboard/api-usage-chart.tsx` — Recharts chart with fixed height

### Phase 8 Context
- `.planning/phases/08-foundation-components/08-CONTEXT.md` — base-ui render prop pattern, shadcn component conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sidebar.tsx` — Complete shadcn sidebar system (SidebarProvider, Sidebar, SidebarTrigger, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub, SidebarFooter, SidebarHeader, SidebarInset, SidebarRail) — ready to adopt
- `Sheet` component — Already used for mobile nav overlay
- `DropdownMenu` component — Available for collapsed footer dropdown
- `Tooltip` component — Available for icon-only hover labels
- `better-auth` — Supports `rememberMe` option in `signIn.email()` call
- `cn()` utility — clsx + tailwind-merge for className composition

### Established Patterns
- base-ui render prop pattern (NOT Radix asChild) — 23 components follow this
- Two separate portals with distinct layouts: `/admin` (PlatformNav) and `/app` (TenantNav)
- Mobile detection via responsive classes (md: breakpoint)
- Cookie-based state persistence (shadcn sidebar already uses this pattern)
- Status badges with colored Badge variants

### Integration Points
- `app/admin/layout.tsx` — Wrap with SidebarProvider, replace PlatformNav with Sidebar
- `app/app/layout.tsx` — Wrap with SidebarProvider, replace TenantNav with Sidebar
- `app/(auth)/sign-in/page.tsx` — Redesign form + add split-screen layout
- `camera-map-inner.tsx` — Add transitionend listener for invalidateSize
- `bandwidth-chart.tsx` / `api-usage-chart.tsx` — Handle resize event

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- "Redesign camera detail page" todo — belongs to Phase 11 (Camera Management)
- Bottom tab bar navigation for mobile — potential future enhancement
- Org switcher in sidebar — not in scope for v1.1 (single org per user for now)
- Dark mode sidebar variant — deferred to v1.2+

</deferred>

---

*Phase: 09-layout-login*
*Context gathered: 2026-04-17*
