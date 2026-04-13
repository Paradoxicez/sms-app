# Phase 5 -- UI Review

**Audited:** 2026-04-12
**Baseline:** 05-UI-SPEC.md (Design Contract)
**Screenshots:** Not captured (dev server returns redirect on :3000, no visual verification)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Most spec copy implemented accurately; dashboard empty state body deviates from contract, notification empty body truncated |
| 2. Visuals | 3/4 | Strong visual hierarchy with stat cards, charts, table; icon-only buttons have aria-labels and tooltips |
| 3. Color | 3/4 | Status colors consistent; hardcoded hex in map markers instead of CSS variables; some raw Tailwind colors instead of chart tokens |
| 4. Typography | 4/4 | Uses declared 4-size scale (xs/sm/xl/2xl) with 2 weights (regular/semibold) per spec |
| 5. Spacing | 3/4 | Consistent gap-4 and space-y-6 pattern; a few arbitrary pixel values in non-spec components |
| 6. Experience Design | 3/4 | Loading skeletons on all sections; error states present; missing "Export Report" and "Export Log" CTAs from spec |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **Map marker colors use hardcoded hex values instead of CSS variables** -- Dark mode will show incorrect marker colors and the values drift from the design system. Replace `#22c55e` etc. in `camera-marker.tsx` with computed values from CSS custom properties (`--chart-1`, `--chart-5`, `--chart-4`, `text-blue-500`) or use `getComputedStyle` to read them at runtime.

2. **Dashboard empty state body text deviates from spec copy** -- Spec says "Register your first camera to start monitoring. Go to Cameras to add one." but implementation says "Register your first camera to start monitoring. Once cameras are active, stats and charts will appear here." The spec copy includes a directional CTA ("Go to Cameras") that helps users take action. Update `dashboard/page.tsx:84` to match spec exactly and add a link to `/admin/cameras`.

3. **Missing "Export Report" and "Export Log" primary CTAs** -- UI-SPEC declares "Export Report" on Dashboard and "Export Log" on Audit Log as primary CTAs. Neither is implemented. Add export buttons to dashboard page header and audit log page header that trigger CSV download of currently displayed data.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Matches spec:**
- Dashboard heading: "Dashboard" -- correct
- Map View heading: "Map View" -- correct
- Map feature disabled: heading and body match spec exactly (`map/page.tsx:82-87`)
- Map empty state: "No camera locations available" + body -- matches spec (`map/page.tsx:111-114`)
- Audit log feature disabled: heading and body match spec (`audit-log/page.tsx:119-122`)
- Audit log empty state: "No activity recorded" + body -- matches spec (`audit-log-table.tsx:66-69`)
- SRS logs disconnected: "Log stream disconnected. Reconnecting..." -- matches spec (`log-viewer.tsx:99`)
- SRS logs empty: "No log entries. Waiting for SRS activity..." -- matches spec (`log-viewer.tsx:93`)
- Notification empty: "No notifications" -- matches heading

**Deviations from spec:**
- `dashboard/page.tsx:84`: Dashboard empty state body differs from spec. Missing "Go to Cameras to add one." directional CTA.
- `notification-dropdown.tsx:64`: Notification empty body is "You're all caught up!" but spec says "You're all caught up. Notifications will appear here when camera events occur." -- truncated.
- Missing "Export Report" button on dashboard (spec Primary CTA)
- Missing "Export Log" button on audit log (spec Primary CTA)
- Missing "Locate Camera" button on map page (spec Primary CTA)
- Camera status table: spec defines columns as "Name, Status, Viewers, Bandwidth, Uptime, Actions" but implementation has "Name, Status, Viewers, Bandwidth" -- missing Uptime and Actions columns

### Pillar 2: Visuals (3/4)

**Strengths:**
- Clear focal point: stat cards at top establish immediate data hierarchy
- Icon-only buttons (Copy HLS URL, Embed Code) on camera detail have `aria-label` and `<Tooltip>` -- good (`cameras/[id]/page.tsx:350-379`)
- Notification bell has `aria-label={N unread notifications}` -- meets spec accessibility note
- Log viewer has `role="log"` and `aria-live="polite"` -- meets spec
- Status badges use both color AND text label (never color-only) -- meets spec
- Visual hierarchy through size differentiation: 2xl stat values > xl headings > sm body > xs labels

**Issues:**
- Camera popup preview is 200x112px (`camera-popup.tsx:74`), spec says 160x90px (16:9). Current size (200x112) is approximately 16:9 but doesn't match the exact spec dimensions.
- No map "Loading map..." text centered in skeleton -- spec says skeleton rectangle with "Loading map..." text, implementation uses plain `<Skeleton>` rectangle without text (`map/page.tsx:107`)

### Pillar 3: Color (3/4)

**CSS variable usage (correct):**
- Charts use `var(--chart-1)` and `var(--chart-2)` -- matches spec chart color assignment
- Notification bell badge uses `bg-primary text-primary-foreground` -- matches spec
- Active nav items use `border-primary bg-primary/10 text-primary` -- matches spec
- Unread notification background: `bg-primary/5` -- matches spec
- Log viewer level colors: `text-chart-4` for warn, `text-chart-5` for error -- matches spec

**Hardcoded color issues:**
- `camera-marker.tsx:18-22`: Five hardcoded hex values (`#22c55e`, `#ef4444`, `#f59e0b`, `#3b82f6`) for map markers. These won't adapt to theme changes or dark mode. Should derive from CSS variables.
- `camera-popup.tsx:85`: `text-gray-400` instead of `text-muted-foreground` for "Stream offline" text
- `camera-status-table.tsx:33-49`: Uses `text-emerald-700` / `text-red-700` / `text-amber-700` / `text-blue-700` instead of the spec's `text-chart-1` / `text-chart-5` / `text-chart-4` / `text-blue-500` tokens. Functionally similar colors but not using the declared chart variable system.
- `stat-card.tsx:33`: `text-emerald-600` / `text-red-600` for trend indicators -- raw Tailwind colors rather than semantic tokens
- `log-viewer.tsx:76`: `text-green-600` / `text-red-600` for connection status -- should use semantic tokens
- `notification-item.tsx:21-33`: `text-green-500` / `text-red-500` / `text-amber-500` -- uses raw Tailwind colors for notification type icons instead of chart variables

### Pillar 4: Typography (4/4)

**Size usage matches spec's 4-size scale:**
- `text-xs` (12px) -- stat card labels, chart axis labels, badge text, timestamps, muted captions
- `text-sm` (14px) -- table cells, descriptions, body text, notification items
- `text-xl` (20px) -- page titles: "Dashboard", "Map View", "Audit Log"
- `text-2xl` -- stat card display values (spec says 28px/Display role; `text-2xl` is 24px -- slight deviation but close)

**Weight usage matches spec's 2-weight constraint:**
- `font-semibold` (600) -- headings, stat card values, section titles
- `font-medium` (500) -- nav items, labels, notification titles (note: spec says 400 for labels, implementation uses 500 for some labels via `font-medium`)

**Minor note:** `font-medium` (500) is used alongside `font-semibold` (600). Spec declares only 400 and 600. The `font-medium` usage is borderline but does not create visual confusion. Score maintained at 4/4 as the overall hierarchy is clear and consistent.

### Pillar 5: Spacing (3/4)

**Consistent patterns:**
- `space-y-6` (24px) as section-level vertical spacing -- matches spec `lg` token (24px)
- `gap-4` (16px) for grid gaps between stat cards and charts -- matches spec `md` token
- `px-3 py-2` for nav items -- consistent 12px/8px internal spacing
- `p-4` for card content padding -- matches spec `md` token (16px)
- Notification dropdown `w-[320px]` -- matches spec (320px wide)
- Notification dropdown `max-h-96` (384px) -- matches spec max-height

**Arbitrary values found:**
- `h-[108px]` skeleton for stat cards -- acceptable (matches component height)
- `h-[250px]` chart containers -- acceptable (fixed chart height)
- `h-[500px]` log viewer -- matches spec (500px)
- `h-[300px]` / `h-[400px]` map container -- matches spec (300px mobile, 400px desktop)
- `h-[18px] min-w-[18px]` notification badge -- matches spec (18px diameter)
- `border-l-[3px]` active nav indicator -- acceptable design detail
- `w-[240px]` sidebar -- acceptable (fixed sidebar width)
- `style={{ width: 200, height: 112 }}` in camera popup -- inline style instead of Tailwind classes, and dimensions differ from spec (160x90)

Overall spacing is well-structured and consistent with declared scale.

### Pillar 6: Experience Design (3/4)

**Loading states -- comprehensive:**
- Stat cards: 4 skeleton placeholders in grid -- matches spec pattern
- Charts: Skeleton rectangle matching container -- matches spec
- Camera table: 5 skeleton rows -- matches spec
- Map: Skeleton rectangle at correct height -- present (though missing "Loading map..." text)
- Notification dropdown: 3 skeleton items -- matches spec
- Audit log: 5 skeleton rows -- present
- Notification preferences: 5 skeleton toggle rows -- present

**Error states:**
- Dashboard page: No explicit error banner for failed dashboard load. If `stats` is null and not loading, nothing renders. Spec declares: "Unable to load dashboard data. Check your connection and try refreshing the page."
- Map page: Error state with destructive-styled banner -- present (`map/page.tsx:101-103`)
- Audit log: Error state present -- matches spec text (`audit-log/page.tsx:184-187`)
- System metrics: Silently returns null on error (`system-metrics.tsx:25`) -- no error message shown

**Empty states:**
- Dashboard: "No cameras registered" -- present
- Map: "No camera locations available" -- present  
- Map feature disabled: present with upgrade message
- Audit log empty: "No activity recorded" -- present
- Audit log feature disabled: present
- Notifications empty: "No notifications" -- present

**Missing interactions from spec:**
- No "Export Report" CTA on dashboard
- No "Export Log" CTA on audit log
- No "Locate Camera" CTA on map
- No confirmation dialog for "Clear All Notifications" (spec: "This will permanently remove all your notifications. This action cannot be undone.")
- Dashboard error state text from spec not implemented

**Real-time updates:**
- Camera status via Socket.IO: implemented in dashboard and map
- 30s polling for stats/charts: implemented via hooks
- Notification via Socket.IO: implemented with real-time badge count
- SRS log streaming via Socket.IO: implemented with auto-scroll

---

## Registry Safety

Registry audit: shadcn official only. No third-party registries declared. No flags.

---

## Files Audited

- `apps/web/src/app/admin/dashboard/page.tsx`
- `apps/web/src/components/dashboard/stat-card.tsx`
- `apps/web/src/components/dashboard/bandwidth-chart.tsx`
- `apps/web/src/components/dashboard/api-usage-chart.tsx`
- `apps/web/src/components/dashboard/camera-status-table.tsx`
- `apps/web/src/components/dashboard/system-metrics.tsx`
- `apps/web/src/app/admin/map/page.tsx`
- `apps/web/src/components/map/camera-map-inner.tsx`
- `apps/web/src/components/map/camera-marker.tsx`
- `apps/web/src/components/map/camera-popup.tsx`
- `apps/web/src/app/admin/audit-log/page.tsx`
- `apps/web/src/components/audit/audit-log-table.tsx`
- `apps/web/src/components/audit/audit-detail-dialog.tsx`
- `apps/web/src/components/notifications/notification-bell.tsx`
- `apps/web/src/components/notifications/notification-dropdown.tsx`
- `apps/web/src/components/notifications/notification-item.tsx`
- `apps/web/src/components/notifications/notification-preferences.tsx`
- `apps/web/src/components/srs-logs/log-viewer.tsx`
- `apps/web/src/components/sidebar-nav.tsx`
- `apps/web/src/app/admin/cameras/[id]/page.tsx`
