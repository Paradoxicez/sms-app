# Phase 9: Layout & Login - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 09-layout-login
**Areas discussed:** Sidebar migration strategy, Sidebar collapse behavior, Login page redesign, Layout resize handling, Sidebar nav groups/sections, Sidebar footer content

---

## Sidebar Migration Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Adopt shadcn sidebar | Migrate nav items from PlatformNav/TenantNav into shadcn Sidebar — get collapse, cookie, Cmd+B free. Delete custom nav code | ✓ |
| Enhance existing custom nav | Add collapse logic to NavShell/PlatformNav/TenantNav — no migration but reinvent the wheel | |
| Hybrid approach | Use SidebarProvider + useSidebar() from shadcn for state, keep custom nav for rendering | |

**User's choice:** Adopt shadcn sidebar
**Notes:** User wanted detailed explanation of options before choosing. Confirmed full migration.

### Portal Nav Items

| Option | Description | Selected |
|--------|-------------|----------|
| Separate config arrays | adminNavItems[] and tenantNavItems[] as separate configs, inject into shared Sidebar per portal | ✓ |
| Sidebar component แยกกัน | Create AdminSidebar and TenantSidebar as 2 separate components with hardcoded items | |

**User's choice:** Separate config arrays

---

## Sidebar Collapse Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Tooltip แสดงชื่อ | Hover on icon shows tooltip with menu item name — simple, no layout disruption | ✓ |
| Expand on hover | Hover on sidebar temporarily expands it — flashy but may be jittery | |
| Icon only, no hover | Just icons, click to navigate — minimal but requires memorizing icons | |

**User's choice:** Tooltip แสดงชื่อ

### Mobile Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| shadcn Sheet เหมือนเดิม | Keep hamburger menu opening Sheet overlay — shadcn sidebar supports this natively | ✓ |
| Bottom tab bar | Replace sidebar with bottom navigation on mobile — better UX but new component | |

**User's choice:** shadcn Sheet เหมือนเดิม

---

## Login Page Redesign

| Option | Description | Selected |
|--------|-------------|----------|
| Split screen | Left: branding/hero, Right: sign-in form — professional, Vercel/Linear style | ✓ |
| Centered card | Keep card centered but polish it — simpler, same layout | |

**User's choice:** Split screen

### Remember Me

| Option | Description | Selected |
|--------|-------------|----------|
| Extend session to 30 days | Checked = 30 day session, unchecked = expires on browser close | ✓ |
| Extend session to 7 days | Shorter duration, more secure but more frequent logins | |
| Claude ตัดสินใจ | Let Claude choose appropriate value during research | |

**User's choice:** Extend session to 30 days

---

## Layout Resize Handling

| Option | Description | Selected |
|--------|-------------|----------|
| CSS transition end event | Listen for transitionend, then call map.invalidateSize() + dispatch window resize — targeted, no polling | ✓ |
| ResizeObserver on container | Watch main content area — generic but fires before transition completes | |
| Claude ตัดสินใจ | Let Claude choose during research | |

**User's choice:** CSS transition end event

---

## Sidebar Nav Groups/Sections

| Option | Description | Selected |
|--------|-------------|----------|
| Divider line + hidden label | Expanded: section label + divider; Collapsed: divider only between icon groups | ✓ |
| Collapsible groups | Click section headers to show/hide items — confusing with sidebar collapse | |
| Flat list, no groups | All items in one list — simple but long | |

**User's choice:** Divider line + hidden label

---

## Sidebar Footer Content

| Option | Description | Selected |
|--------|-------------|----------|
| Avatar only + dropdown | Collapsed: avatar, click opens dropdown (name, org, logout); Expanded: full user info | ✓ |
| Avatar + tooltip | Collapsed: avatar with hover tooltip for name, click for logout | |
| Claude ตัดสินใจ | Let Claude choose | |

**User's choice:** Avatar only + dropdown

---

## Claude's Discretion

- Split-screen branding panel design
- Login form field styling and validation feedback
- Sidebar transition animation timing
- Tooltip styling and positioning
- Exact dropdown menu items in collapsed footer

## Deferred Ideas

- Redesign camera detail page — Phase 11
- Bottom tab bar for mobile — future enhancement
- Org switcher in sidebar — not v1.1 scope
- Dark mode sidebar — deferred to v1.2+
