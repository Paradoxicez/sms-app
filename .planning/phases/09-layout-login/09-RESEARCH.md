# Phase 9: Layout & Login - Research

**Researched:** 2026-04-17
**Domain:** UI layout (shadcn sidebar), login page redesign, session management (better-auth)
**Confidence:** HIGH

## Summary

Phase 9 replaces the custom navigation system (NavShell, PlatformNav, TenantNav) with the shadcn Sidebar component that already exists in the codebase at `sidebar.tsx` (559 lines). The sidebar supports collapsible icon-only mode, cookie persistence, Cmd+B keyboard shortcut, and mobile Sheet overlay -- all built-in. The login page gets a split-screen redesign with a branding panel and "remember me" functionality using better-auth's native `rememberMe` option.

The primary risk is layout breakage in resize-sensitive components (Leaflet map, Recharts charts) when the sidebar collapses. The solution is a `transitionend` event listener that dispatches `window.resize` for Recharts (which uses `ResponsiveContainer`) and calls `map.invalidateSize()` for Leaflet. No new npm dependencies are required.

**Primary recommendation:** Adopt the existing shadcn sidebar as-is with `collapsible="icon"` variant. Create a shared `app-sidebar.tsx` that consumes nav config arrays, then update both portal layouts to use `SidebarProvider` + `Sidebar` + `SidebarInset`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Adopt shadcn `sidebar.tsx` fully -- migrate away from custom `NavShell`, `PlatformNav`, `TenantNav` components
- **D-02:** Create separate nav config arrays (`adminNavItems[]` and `tenantNavItems[]`) passed into a shared Sidebar component per portal layout
- **D-03:** Delete custom nav files (`nav-shell.tsx`, `platform-nav.tsx`, `tenant-nav.tsx`, `sidebar-nav.tsx`) after migration
- **D-04:** Icon-only mode (3rem width) with tooltip showing menu item name on hover -- no expand-on-hover
- **D-05:** Toggle via click on sidebar rail/trigger button + Cmd+B keyboard shortcut (already in shadcn sidebar)
- **D-06:** Sidebar collapse state persists via cookie (`sidebar_state`, 7-day max-age) -- already built into shadcn sidebar
- **D-07:** Keep shadcn Sheet/drawer overlay pattern for mobile -- hamburger menu opens full sidebar as overlay
- **D-08:** Section groups with label + divider when expanded, divider-only when collapsed
- **D-09:** When expanded: avatar + user name + organization name
- **D-10:** When collapsed: avatar only -- click opens dropdown menu with user name, org info, and logout action
- **D-11:** Split-screen login layout -- left: branding/hero; right: sign-in form
- **D-12:** "Remember me" checkbox -- checked: 30 days; unchecked: browser session
- **D-13:** Implement remember me via better-auth session configuration (rememberMe option in signIn.email call)
- **D-14:** Listen for CSS `transitionend` event on sidebar element after collapse/expand
- **D-15:** On transition end: call Leaflet `map.invalidateSize()` + dispatch `window.resize` for Recharts
- **D-16:** No polling or ResizeObserver -- single event-driven approach

### Claude's Discretion
- Split-screen branding panel design (hero image, pattern, gradient, or illustration)
- Login form field styling and validation feedback details
- Sidebar transition animation timing (200ms ease-linear already in shadcn)
- Tooltip styling and positioning
- Exact dropdown menu items in collapsed footer

### Deferred Ideas (OUT OF SCOPE)
- "Redesign camera detail page" -- belongs to Phase 11
- Bottom tab bar navigation for mobile
- Org switcher in sidebar -- not in scope for v1.1
- Dark mode sidebar variant -- deferred to v1.2+
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-03 | User can collapse sidebar to icon-only mode, state persists across page navigation | shadcn sidebar.tsx already implements collapse with `collapsible="icon"`, cookie persistence via `sidebar_state` cookie (7-day max-age), and Cmd+B keyboard shortcut. Verified in codebase. |
| FOUND-04 | User sees redesigned login page with remember me checkbox | better-auth v1.6.3 supports `rememberMe` boolean in `signIn.email()` body. When `false`, session cookie has no max-age (expires on browser close). Checkbox component exists from Phase 8. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **base-ui render prop pattern**: All components must use base-ui render props, NOT Radix `asChild`. The sidebar.tsx already follows this (uses `useRender` from `@base-ui/react`). [VERIFIED: sidebar.tsx line 1-6]
- **Tech stack**: Next.js 15.x (App Router), NestJS backend, better-auth for authentication, Tailwind 4.2 (CSS variables)
- **Two portals**: `/admin` (PlatformNav) and `/app` (TenantNav) -- separate layouts, separate nav configs
- **Session-based auth**: better-auth with email/password, organization plugin, admin plugin
- **Vitest for testing**: Existing test files use Vitest + Testing Library

## Standard Stack

### Core (Already Installed -- No New Dependencies)

| Library | Version | Purpose | Verified |
|---------|---------|---------|----------|
| shadcn sidebar.tsx | N/A (component) | Full sidebar system with collapse, cookie, keyboard shortcut, mobile Sheet | [VERIFIED: `apps/web/src/components/ui/sidebar.tsx`, 559 lines] |
| better-auth | 1.6.3 | Authentication with `rememberMe` support in `signIn.email()` | [VERIFIED: `apps/web/node_modules/better-auth/package.json`] |
| lucide-react | (installed) | Icons for nav items, sidebar trigger, dropdown menu items | [VERIFIED: existing nav components import from lucide-react] |
| recharts | (installed) | Dashboard charts using `ResponsiveContainer` (resize-aware) | [VERIFIED: `bandwidth-chart.tsx`, `api-usage-chart.tsx`] |
| react-leaflet | (installed) | Map component with `map.invalidateSize()` for resize | [VERIFIED: `camera-map-inner.tsx`] |
| react-hook-form + zod | (installed) | Login form validation (existing pattern) | [VERIFIED: current `sign-in/page.tsx`] |

### No New Dependencies Required

All shadcn components needed are already installed: Sidebar, Sheet, Tooltip, DropdownMenu, Avatar, Separator, Button, Input, Label, Checkbox.

**Installation:** None required.

## Architecture Patterns

### Nav Config Array Pattern (D-02)

**What:** Extract nav items into typed config arrays separate from the rendering component.
**When to use:** When multiple portals share the same sidebar component but different nav items.

```typescript
// Source: derived from existing tenant-nav.tsx + platform-nav.tsx patterns
// File: components/nav/nav-config.ts

import { LayoutDashboard, Building2, Camera, /* ... */ } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: string;       // feature flag key (checked via useFeatures)
  exactMatch?: boolean;   // true for dashboard (exact pathname match)
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const tenantNavGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard, exactMatch: true },
      { label: "Map", href: "/app/map", icon: MapPin, feature: "map" },
    ],
  },
  // ... Cameras, Organization, Developer groups
];

export const adminNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  // ... 7 items total
];
```

[VERIFIED: Pattern derived from existing `tenant-nav.tsx` lines 67-122 and `platform-nav.tsx` lines 19-27]

### Shared Sidebar Component Pattern

**What:** Single `AppSidebar` component that renders nav items from config, with role/feature filtering for tenant portal.
**When to use:** Both `/admin/layout.tsx` and `/app/layout.tsx` use this same component with different nav configs.

```typescript
// File: components/nav/app-sidebar.tsx
// Key props: navGroups, portalLabel, userName, userEmail, activeOrgName?

<Sidebar variant="sidebar" collapsible="icon">
  <SidebarHeader>
    {/* Logo + badge */}
  </SidebarHeader>
  <SidebarContent>
    {navGroups.map(group => (
      <SidebarGroup key={group.label}>
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
        <SidebarMenu>
          {group.items.map(item => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                tooltip={item.label}
                isActive={isActive(item)}
                render={<Link href={item.href} />}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    ))}
  </SidebarContent>
  <SidebarFooter>
    {/* SidebarFooter component */}
  </SidebarFooter>
  <SidebarRail />
</Sidebar>
```

[VERIFIED: shadcn sidebar API from `sidebar.tsx` exports]

### Layout Integration Pattern

**What:** Portal layouts wrap children with `SidebarProvider` + `Sidebar` + `SidebarInset`.

```typescript
// File: app/admin/layout.tsx (after migration)
<SidebarProvider>
  <AppSidebar navGroups={adminNavGroups} ... />
  <SidebarInset>
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      {/* breadcrumb or page title */}
    </header>
    <div className="flex-1 p-4 md:p-8">
      {children}
    </div>
  </SidebarInset>
</SidebarProvider>
```

**Critical:** The existing layouts have auth-check logic (`checkAuth`, `bootstrap`) that MUST be preserved. The sidebar migration only changes the visual shell, not the authentication flow. [VERIFIED: `admin/layout.tsx` lines 18-56, `app/layout.tsx` lines 29-73]

### Sidebar Resize Hook Pattern (D-14, D-15, D-16)

**What:** Custom hook that listens for `transitionend` on the sidebar container and dispatches resize events.

```typescript
// File: hooks/use-sidebar-resize.ts
import { useEffect } from "react";

export function useSidebarResize() {
  useEffect(() => {
    const sidebarGap = document.querySelector('[data-slot="sidebar-gap"]');
    if (!sidebarGap) return;

    function handleTransitionEnd(e: TransitionEvent) {
      if (e.propertyName !== "width") return;
      // Recharts ResponsiveContainer listens to window resize
      window.dispatchEvent(new Event("resize"));
    }

    sidebarGap.addEventListener("transitionend", handleTransitionEnd);
    return () => sidebarGap.removeEventListener("transitionend", handleTransitionEnd);
  }, []);
}
```

**Key insight:** The `data-slot="sidebar-gap"` div is the one that transitions width (line 219-228 of sidebar.tsx). The sidebar container itself is `position: fixed` so its width transition affects the gap div which pushes content. Listening on the gap div's `transitionend` for `propertyName === "width"` is the correct target.

For Leaflet: The map component needs its own handler since `map.invalidateSize()` requires access to the Leaflet map instance via `useMap()`. The window resize event alone is NOT sufficient for Leaflet -- it needs `invalidateSize()` called explicitly. Two approaches:

1. **Approach A (recommended):** Add a `useEffect` inside `camera-map-inner.tsx` that listens for `window.resize` and calls `map.invalidateSize()`. This way the `useSidebarResize` hook only dispatches `window.resize`, and Leaflet picks it up.
2. **Approach B:** Use a custom event (`sidebar-resize`) instead of `window.resize`, listened to by both Recharts wrapper and Leaflet.

[VERIFIED: Recharts uses `ResponsiveContainer` which listens to window resize -- `chart.tsx` line 74. Leaflet requires explicit `invalidateSize()` -- standard Leaflet behavior]

### Login Page Split-Screen Pattern (D-11)

```typescript
// File: app/(auth)/sign-in/page.tsx
export default function SignInPage() {
  return (
    <div className="flex min-h-screen">
      {/* Left: Branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center bg-[var(--sidebar)] px-12 py-16">
        <div className="max-w-[420px]">
          <h1 className="text-2xl font-semibold text-primary">SMS</h1>
          <p className="mt-2 text-xl font-semibold text-foreground">
            Surveillance Management System
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Embed live CCTV streams on your website with a single API call.
          </p>
          {/* Decorative dot pattern */}
        </div>
      </div>
      {/* Right: Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8">
        <div className="w-full max-w-[400px] space-y-6">
          <h2 className="text-xl font-semibold text-center">
            Sign in to SMS Platform
          </h2>
          {/* Form fields */}
        </div>
      </div>
    </div>
  );
}
```

**Auth layout change:** The `(auth)/layout.tsx` currently centers children with `flex items-center justify-center`. For the split-screen, the layout should become a simple full-height wrapper (`min-h-screen`) and let the sign-in page control its own layout. [VERIFIED: current auth layout at `app/(auth)/layout.tsx`]

### Remember Me Pattern (D-12, D-13)

```typescript
// In sign-in form submit handler:
const result = await authClient.signIn.email({
  email: data.email,
  password: data.password,
  rememberMe: rememberMe, // boolean from checkbox state
});
```

**How it works in better-auth v1.6.3:**
- `rememberMe: true` (default): Session cookie gets `max-age` from server config (currently 7 days in `auth.config.ts`)
- `rememberMe: false`: Sets a `dont_remember` signed cookie; session cookie has NO `max-age` (browser session only)
- The 30-day session mentioned in D-12 requires updating `session.expiresIn` in `auth.config.ts` from 7 days to 30 days

[VERIFIED: better-auth source at `dist/api/routes/sign-in.mjs` line 157 -- `rememberMe: z.boolean().default(true).optional()`, and `dist/cookies/index.mjs` line 90 -- `maxAge: dontRememberMe ? void 0 : ctx.context.authCookies.sessionData.attributes.maxAge`]

**IMPORTANT:** The current server session config is `expiresIn: 60 * 60 * 24 * 7` (7 days). For D-12's "30 days when remembered", the backend config needs updating to `60 * 60 * 24 * 30`. This is a backend change in `apps/api/src/auth/auth.config.ts` line 28. [VERIFIED: auth.config.ts line 28]

### Active Nav Item Detection

```typescript
const pathname = usePathname();
const isActive = item.exactMatch
  ? pathname === item.href
  : pathname === item.href || pathname.startsWith(item.href + "/");
```

[VERIFIED: Existing pattern from `nav-shell.tsx` NavRow component, lines 142-145]

### Anti-Patterns to Avoid
- **Don't use `asChild` prop:** The sidebar uses base-ui `render` prop pattern. Use `render={<Link href={item.href} />}` instead of `asChild`. [VERIFIED: sidebar.tsx uses `useRender` from base-ui]
- **Don't use ResizeObserver for sidebar resize:** D-16 explicitly prohibits it. Use `transitionend` event only.
- **Don't create separate sidebar components for admin vs tenant:** One shared `AppSidebar` with different config arrays. [VERIFIED: D-02]
- **Don't remove auth-check logic from layouts:** The sidebar migration is visual only. All `checkAuth`/`bootstrap` effects must be preserved exactly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sidebar collapse animation | Custom CSS animation system | shadcn sidebar `duration-200 ease-linear` transitions | Already implemented with proper CSS custom properties |
| Cookie persistence for sidebar state | Custom cookie read/write | shadcn `SidebarProvider` cookie logic | Built-in, tested, handles max-age correctly |
| Keyboard shortcut (Cmd+B) | Custom keydown listener | shadcn `SidebarProvider` built-in handler | Already wired up in lines 97-110 of sidebar.tsx |
| Mobile sidebar overlay | Custom Sheet/drawer | shadcn `Sidebar` mobile mode (auto-detects via `useIsMobile`) | Handles Sheet open/close, responsive breakpoint |
| Tooltip on collapsed items | Custom hover tooltip | shadcn `SidebarMenuButton` `tooltip` prop | Built-in tooltip integration, auto-hidden when expanded |
| Remember me session logic | Custom cookie manipulation | better-auth `rememberMe` param in `signIn.email()` | Server handles `dont_remember` cookie and session expiry |

**Key insight:** The shadcn sidebar component is a complete solution -- 559 lines handling all edge cases. The migration is primarily about wiring up nav configs and updating layout wrappers, not building sidebar behavior.

## Common Pitfalls

### Pitfall 1: Leaflet Map Not Resizing After Sidebar Collapse
**What goes wrong:** Leaflet map stays at old dimensions after sidebar expands/collapses. White space or clipped map.
**Why it happens:** Leaflet caches its container dimensions. CSS width changes don't trigger recalculation.
**How to avoid:** Call `map.invalidateSize()` after sidebar transition completes. Use `transitionend` event on the sidebar gap element, then either dispatch `window.resize` and have Leaflet listen for it, OR use a custom event.
**Warning signs:** Map has white strips on one side after toggling sidebar.

### Pitfall 2: Multiple transitionend Events Firing
**What goes wrong:** The `transitionend` event fires for EACH CSS property that transitions (width, opacity, etc.). Handler runs multiple times.
**Why it happens:** Sidebar has transitions on both `width` and `opacity` (for label fade).
**How to avoid:** Filter by `event.propertyName === "width"` in the handler.
**Warning signs:** Resize/invalidateSize called 2-3x per toggle.

### Pitfall 3: SidebarProvider defaultOpen vs Cookie State
**What goes wrong:** Sidebar always starts expanded on initial load, ignoring saved cookie state.
**Why it happens:** `SidebarProvider` has `defaultOpen = true`. If the cookie says `collapsed`, the component needs to read it.
**How to avoid:** Read the `sidebar_state` cookie server-side (in the layout's server component portion) and pass it as `defaultOpen` prop. Since both layouts are `"use client"`, read the cookie via `document.cookie` on mount or pass it from a server wrapper.
**Warning signs:** Sidebar flickers from expanded to collapsed on page load.

**Recommended approach:** Since both admin and app layouts are `"use client"` components, read the cookie in a server component wrapper that renders the layout. Example:

```typescript
// In a server component that wraps the layout:
import { cookies } from "next/headers";

export default async function AdminLayoutWrapper({ children }) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  return <AdminLayout defaultOpen={defaultOpen}>{children}</AdminLayout>;
}
```

Or simpler: read `document.cookie` in a `useMemo` for initial state (client-side only, slight flicker risk).

### Pitfall 4: Auth Layout Conflict with Split-Screen
**What goes wrong:** The `(auth)/layout.tsx` has `flex items-center justify-center` which fights the split-screen layout.
**Why it happens:** Current layout assumes centered card. Split-screen needs full-width.
**How to avoid:** Change auth layout to `min-h-screen` only, let the sign-in page control its own layout.
**Warning signs:** Login page looks squished or doesn't fill viewport.

### Pitfall 5: Role-Based Nav Filtering Lost During Migration
**What goes wrong:** All nav items show for all users regardless of role.
**Why it happens:** The existing `TenantNav` has `ROLE_MATRIX` filtering + `useFeatures` feature flag filtering. If the new `AppSidebar` doesn't replicate this, access control breaks.
**How to avoid:** The nav config for tenant portal MUST include the role matrix and feature flag filtering. Either filter items before passing to `AppSidebar`, or include filtering logic in the component.
**Warning signs:** Viewer role sees developer section items.

### Pitfall 6: Existing Tests Break After Nav Component Deletion
**What goes wrong:** Test files `platform-nav.test.tsx` and `tenant-nav.test.tsx` import from deleted components.
**Why it happens:** D-03 deletes the old nav files.
**How to avoid:** Update or rewrite tests to import from the new `nav-config.ts` and `app-sidebar.tsx`. The test assertions (7 admin items, 13 tenant items with role filtering) should still hold.
**Warning signs:** CI test failures after migration.

### Pitfall 7: Session Duration Mismatch
**What goes wrong:** "Remember me" checked but session still expires in 7 days instead of 30.
**Why it happens:** Backend `session.expiresIn` is 7 days. The `rememberMe` flag only controls whether max-age is set -- it doesn't change the duration.
**How to avoid:** Update `apps/api/src/auth/auth.config.ts` `session.expiresIn` to `60 * 60 * 24 * 30` (30 days).
**Warning signs:** Users get logged out after 7 days even with "remember me" checked.

## Code Examples

### shadcn SidebarMenuButton with Tooltip (Collapsed Mode)

```typescript
// Source: sidebar.tsx lines 499-551 (verified in codebase)
// The tooltip prop handles showing label on hover when collapsed
<SidebarMenuButton
  tooltip={item.label}
  isActive={isActiveRoute}
  render={<Link href={item.href} />}
>
  <item.icon />
  <span>{item.label}</span>
</SidebarMenuButton>
// When state="collapsed", tooltip appears on right side
// When state="expanded", tooltip is hidden (line 546: hidden={state !== "collapsed" || isMobile})
```

### better-auth rememberMe API

```typescript
// Source: better-auth dist/api/routes/sign-in.mjs line 157 (verified in node_modules)
// Schema: rememberMe: z.boolean().default(true).optional()
const result = await authClient.signIn.email({
  email: "user@example.com",
  password: "password",
  rememberMe: false, // session cookie only, no max-age
});
```

### SidebarProvider Cookie Behavior

```typescript
// Source: sidebar.tsx lines 28-29, 86 (verified in codebase)
// Cookie name: "sidebar_state"
// Cookie max-age: 604800 (7 days)
// Cookie value: boolean (true = expanded, false = collapsed)
// Set on every toggle: document.cookie = `sidebar_state=${openState}; path=/; max-age=604800`
```

### CSS Dot Pattern for Login Branding (Claude's Discretion)

```typescript
// Decorative dot pattern using radial-gradient
<div
  className="absolute inset-0 opacity-[0.07]"
  aria-hidden="true"
  style={{
    backgroundImage: "radial-gradient(hsl(142 71% 45%) 1px, transparent 1px)",
    backgroundSize: "20px 20px",
  }}
/>
```

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.x + @testing-library/react |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && npx vitest run --reporter=verbose` |
| Full suite command | `cd apps/web && npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-03 | Sidebar renders with collapse toggle | unit | `cd apps/web && npx vitest run src/__tests__/app-sidebar.test.tsx -x` | Wave 0 |
| FOUND-03 | Admin sidebar renders 7 items | unit | `cd apps/web && npx vitest run src/__tests__/platform-nav.test.tsx -x` | Exists (needs update) |
| FOUND-03 | Tenant sidebar renders items with role filtering | unit | `cd apps/web && npx vitest run src/__tests__/tenant-nav.test.tsx -x` | Exists (needs update) |
| FOUND-04 | Login page renders split-screen with remember me | unit | `cd apps/web && npx vitest run src/__tests__/sign-in.test.tsx -x` | Wave 0 |
| FOUND-04 | Remember me passes rememberMe to signIn.email | unit | `cd apps/web && npx vitest run src/__tests__/sign-in.test.tsx -x` | Wave 0 |

### Wave 0 Gaps

- [ ] `src/__tests__/app-sidebar.test.tsx` -- covers FOUND-03 sidebar rendering and collapse behavior
- [ ] `src/__tests__/sign-in.test.tsx` -- covers FOUND-04 login redesign and remember me
- [ ] Update `src/__tests__/platform-nav.test.tsx` -- change imports from `PlatformNav` to new nav config/sidebar
- [ ] Update `src/__tests__/tenant-nav.test.tsx` -- change imports from `TenantNav` to new nav config/sidebar
- [ ] Update `src/__tests__/admin-layout.test.tsx` -- layout now uses SidebarProvider
- [ ] Update `src/__tests__/app-layout.test.tsx` -- layout now uses SidebarProvider

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes | better-auth `signIn.email()` with `rememberMe` -- existing pattern, only adding checkbox toggle |
| V3 Session Management | Yes | better-auth `dont_remember` cookie (signed); session `expiresIn` change from 7d to 30d |
| V4 Access Control | Yes | Role-based nav filtering must be preserved (ROLE_MATRIX + useFeatures) during migration |
| V5 Input Validation | Yes | Existing Zod schema for login form (email + password validation) -- no changes needed |
| V6 Cryptography | No | No crypto operations in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Session fixation via remember me | Spoofing | better-auth generates new session token on each sign-in (built-in) |
| Nav item exposure to unauthorized roles | Information Disclosure | ROLE_MATRIX filtering must be preserved in new sidebar -- server-side route guards remain as defense-in-depth |
| Sidebar state cookie tampering | Tampering | Non-sensitive cookie (UI preference only); no security impact |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Changing `session.expiresIn` to 30 days is acceptable for security | Architecture Patterns | If 30 days is too long, sessions remain valid longer than intended. Can be adjusted in auth.config.ts |
| A2 | `window.dispatchEvent(new Event("resize"))` is sufficient to trigger Recharts `ResponsiveContainer` redraw | Architecture Patterns | If not, would need ResizeObserver on chart containers (contradicts D-16) |
| A3 | The `data-slot="sidebar-gap"` div fires `transitionend` for the width transition | Architecture Patterns | If the transition is on a different element, the listener won't fire; need to inspect rendered DOM |

## Open Questions

1. **Server-side cookie read for sidebar defaultOpen**
   - What we know: `SidebarProvider` defaults to `open=true`. Cookie is set client-side.
   - What's unclear: Whether to read cookie server-side (via Next.js `cookies()`) or client-side (via `document.cookie` in useMemo).
   - Recommendation: Use server component wrapper to avoid flicker. Both admin and app layouts are `"use client"` but can be wrapped by a thin server component that reads the cookie.

2. **NotificationBell placement after migration**
   - What we know: Current NavShell has NotificationBell in the sidebar header and mobile top bar.
   - What's unclear: Where it goes in the new sidebar layout -- SidebarHeader, or the page header inside SidebarInset?
   - Recommendation: Move to the page header area inside `SidebarInset` (next to `SidebarTrigger`). This keeps it visible regardless of sidebar state.

3. **Existing test mock patterns**
   - What we know: Tests mock `next/navigation`, `@/lib/auth-client`, `@/hooks/use-features`.
   - What's unclear: Whether existing `useSidebar` from shadcn needs mocking in tests.
   - Recommendation: For unit tests of nav config arrays, no sidebar mock needed. For integration tests of AppSidebar, wrap in `SidebarProvider` in test setup.

## Sources

### Primary (HIGH confidence)
- `apps/web/src/components/ui/sidebar.tsx` -- Full shadcn sidebar component, 559 lines, all exports verified
- `apps/web/src/components/nav/tenant-nav.tsx` -- Current tenant nav with role matrix and feature filtering
- `apps/web/src/components/nav/platform-nav.tsx` -- Current admin nav with 7 items
- `apps/web/src/components/nav/nav-shell.tsx` -- Current shell with desktop sidebar + mobile Sheet
- `apps/web/src/app/(auth)/sign-in/page.tsx` -- Current login form with Zod + react-hook-form
- `apps/api/src/auth/auth.config.ts` -- Server auth config with session.expiresIn = 7 days
- `apps/web/node_modules/better-auth/dist/api/routes/sign-in.mjs` -- rememberMe schema verified
- `apps/web/node_modules/better-auth/dist/cookies/index.mjs` -- dont_remember cookie behavior verified
- `apps/web/src/components/ui/chart.tsx` -- ChartContainer uses ResponsiveContainer (line 74)
- `apps/web/src/components/map/camera-map-inner.tsx` -- Leaflet MapContainer with hardcoded height classes
- `apps/web/src/app/globals.css` -- Sidebar color tokens (lines 76-83)

### Secondary (MEDIUM confidence)
- `09-UI-SPEC.md` -- Design contract with layout specifications, component inventory, interaction contracts
- `09-CONTEXT.md` -- 16 locked decisions from user discussion

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components already exist in codebase, no new dependencies
- Architecture: HIGH -- patterns derived from existing code + verified shadcn API
- Pitfalls: HIGH -- identified from direct code inspection of sidebar.tsx, chart.tsx, and better-auth source
- Remember me: HIGH -- verified in better-auth dist source (not just assumed from docs)

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable -- no version changes expected)
