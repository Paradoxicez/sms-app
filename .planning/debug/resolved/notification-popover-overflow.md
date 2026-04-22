---
status: resolved
trigger: "Notification popover overflow — list extends beyond popover container and overlaps page content"
created: 2026-04-22T00:00:00Z
updated: 2026-04-22T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — ScrollArea `max-h-96` is set on the Root, but because neither the Popover Popup nor a parent establishes a bounded height context, the Root sizes to its content; the Viewport's `size-full` then matches content height, so Base UI's `getHiddenState()` reports `clientHeight >= scrollHeight` and scrollbars stay hidden with no scroll
test: Read notification-bell.tsx, notification-dropdown.tsx, ui/popover.tsx, ui/scroll-area.tsx, and Base UI ScrollAreaViewport source
expecting: Confirm that max-h-96 on Root has no effect because Root has no intrinsic height and children determine height
next_action: Report root cause to caller

## Symptoms

expected: Popover has fixed max-height (~400-500px or `max-h-[min(80vh, 500px)]`). List scrolls internally. Page stays uncovered.
actual: List renders full-length. Items 6+ draw past the popover boundary over page content. No internal scroll.
errors: Visual-only; no console errors.
reproduction: Login -> click bell "99+" badge -> popover opens -> items 6+ extend beyond popover container.
started: Introduced in commit de46d14 "feat(05-05): notification bell, dropdown, preferences, and real-time hook" — the bug has existed since the feature landed.

## Eliminated

- hypothesis: API returns unbounded notifications so the popover must render all of them
  evidence: apps/web/src/hooks/use-notifications.ts:44 and :115 both pass `take=20` to /api/notifications. Pagination is in place (cursor-based with "Load more" button). API is NOT the root cause.
  timestamp: 2026-04-22

- hypothesis: A parent layout with `overflow-hidden` is clipping the popover
  evidence: The popover uses `<PopoverPrimitive.Portal>` (apps/web/src/components/ui/popover.tsx:29), so it escapes sidebar overflow. Items 6+ drawing BELOW the popover's visible whitespace (not clipped) is consistent with "the popup itself has no height cap" not "a parent is clipping."
  timestamp: 2026-04-22

- hypothesis: shadcn `Command`/`CommandList` default max-h was lost
  evidence: This codebase uses Base UI (@base-ui/react), not shadcn/Radix CMDK. Not applicable.
  timestamp: 2026-04-22

## Evidence

- timestamp: 2026-04-22
  checked: apps/web/src/components/notifications/notification-bell.tsx
  found: `<PopoverContent align="end" sideOffset={8} className="w-auto p-2">` wraps `<NotificationDropdown />`. No height cap on PopoverContent.
  implication: The Popup itself grows to fit whatever NotificationDropdown renders.

- timestamp: 2026-04-22
  checked: apps/web/src/components/notifications/notification-dropdown.tsx:59
  found: `<ScrollArea className="max-h-96">` wraps the list. This is the ONLY height constraint in the component tree.
  implication: Looks correct at first glance — but `max-h-96` only works if the element is otherwise taller than its max. Base UI's ScrollArea doesn't force a height.

- timestamp: 2026-04-22
  checked: apps/web/src/components/ui/scroll-area.tsx:8-29
  found: The `ScrollArea` component renders `<ScrollAreaPrimitive.Root className="relative {className}">` and inside it `<ScrollAreaPrimitive.Viewport className="size-full ...">` (size-full = width:100%; height:100%).
  implication: The Viewport wants 100% of the Root's height. If the Root has no explicit `height`, only `max-height`, then the Root sizes to content (block default), making `max-height` effectively `max-content`.

- timestamp: 2026-04-22
  checked: node_modules/@base-ui/react/scroll-area/viewport/ScrollAreaViewport.js — function `getHiddenState`
  found: `const y = viewport.clientHeight >= viewport.scrollHeight;` determines if scrollbar is hidden. Also `style: { overflow: 'scroll' }` is applied inline on the viewport.
  implication: For `overflow: scroll` to actually scroll, the viewport's `clientHeight` must be LESS than its `scrollHeight`. With `size-full` in a Root that sizes to content, clientHeight === scrollHeight → scrollbar hidden → no scroll → list renders at full natural height.

- timestamp: 2026-04-22
  checked: apps/web/src/components/ui/popover.tsx:37-44
  found: `PopoverPrimitive.Popup` uses `flex flex-col gap-2.5 rounded-lg ... p-2.5`. No `max-height`, no `overflow`.
  implication: The Popup has no height cap either. It grows to fit the NotificationDropdown child, which grows to fit ScrollArea-Root, which grows to fit the list.

- timestamp: 2026-04-22
  checked: apps/web/src/components/audit/audit-detail-dialog.tsx:106 vs apps/web/src/components/hierarchy/hierarchy-tree.tsx:214
  found: audit-detail uses `<ScrollArea className="max-h-64">` — works because it's inside a Dialog whose body is in a flex column. hierarchy-tree uses `<ScrollArea className="flex-1">` inside a flex container — flex-1 gives bounded height from the parent.
  implication: Base UI ScrollArea DOES work with `max-h-*` — but only when the parent establishes a bounded height context (dialog body, flex:1 child). PopoverContent's Popup has `flex flex-col` but no bounded height, so `max-h-96` on a child that isn't `flex-1` can't resolve.

- timestamp: 2026-04-22
  checked: apps/web/src/hooks/use-notifications.ts
  found: API request uses `?take=20` with cursor pagination. User has "99+" notifications (per symptom screenshot), so first page renders 20 items → ~1200px tall, well beyond any reasonable popover.
  implication: API is healthy. Even with pagination, 20 items at ~60px each = ~1200px list — it MUST scroll internally.

- timestamp: 2026-04-22
  checked: git log for notification-dropdown.tsx
  found: Introduced in de46d14 "feat(05-05): notification bell, dropdown, preferences, and real-time hook"; only subsequent commit 1a15be5 is unrelated.
  implication: Bug has existed since the feature was introduced. Not a regression from phase 16-18.

## Resolution

root_cause: |
  apps/web/src/components/notifications/notification-dropdown.tsx:59
    `<ScrollArea className="max-h-96">` sets max-height on the Base UI `ScrollAreaPrimitive.Root`, but the Root has no `height` — only `max-height`.
    The inner `ScrollAreaPrimitive.Viewport` uses `size-full` (height: 100%), which resolves to content height when the Root is content-sized.
    Base UI's viewport then computes `clientHeight >= scrollHeight` → `hiddenState.y = true` → scrollbars hidden → `overflow: scroll` has nothing to scroll → the list renders at its full natural height (~1200px for 20 items), bleeding out of the Popup.
    The enclosing `PopoverContent` (apps/web/src/components/ui/popover.tsx:37) has no max-height either, so the Popup grows to fit the full list — but the perceived "white box" visually stops around items 5-6 where the page scrolls, while the rest of the popup overlays page content below the fold.

  Secondary contributor: `PopoverContent` uses `flex flex-col` but doesn't set a bounded height, so even if ScrollArea used `flex-1`, there's no parent height to flex against.

fix: |
  PRIMARY (one-line fix, highest confidence):
    Change apps/web/src/components/notifications/notification-dropdown.tsx:59
    FROM: <ScrollArea className="max-h-96">
    TO:   <ScrollArea className="h-96">   // or: h-[400px], h-[min(80vh,500px)]

    Rationale: Giving the Root an explicit `height` (not `max-height`) creates a bounded height context. `size-full` on the Viewport then resolves to that height, Base UI sees `scrollHeight > clientHeight`, and the inline `overflow: scroll` kicks in. This exactly mirrors the documented Base UI pattern (https://base-ui.com/react/components/scroll-area — examples use fixed heights like `h-64`).

    Tradeoff: Empty/short-list states (e.g., 1-3 notifications or the "No notifications" placeholder) will render with fixed height = extra whitespace. To avoid that, swap at render time:
      className={notifications.length === 0 ? '' : 'h-96'}
    OR use a fixed-height inner wrapper instead:
      <ScrollArea className="h-auto">
        <div className="max-h-96" style={{ height: Math.min(listHeight, 384) }}>...</div>
      </ScrollArea>
    (Not recommended — adds complexity. Prefer the conditional className.)

  ALTERNATIVE (two-line fix, also high confidence):
    Give the Popup a bounded height AND make ScrollArea flex-fill:
    - apps/web/src/components/notifications/notification-bell.tsx:58 — PopoverContent className: add `max-h-[500px]`
    - apps/web/src/components/notifications/notification-dropdown.tsx:32 — root div: change `w-[320px]` to `w-[320px] flex flex-col h-full`
    - apps/web/src/components/notifications/notification-dropdown.tsx:59 — ScrollArea: change `max-h-96` to `flex-1 min-h-0`
    Tradeoff: matches the `hierarchy-tree.tsx` pattern (flex-1 inside flex parent). More idiomatic for Base UI, but touches two files.

  NOT NEEDED:
    - Option B (swap to shadcn ScrollArea for styled scrollbar): the component is already Base UI ScrollArea which has styled scrollbars. No change needed.
    - Option C (pagination/virtualization): already paginated (take=20, "Load more" button). Not the bug.
    - Option D (dedicated /notifications page with "See all" CTA): No such page exists in the app router. Worth a product conversation but NOT required to fix the overflow bug.

  CONFIDENCE:
    - PRIMARY fix (change max-h-96 → h-96): VERY HIGH. Single-line CSS. Directly addresses the root cause.
    - ALTERNATIVE (flex-1 pattern): HIGH. More architecturally consistent with other ScrollArea usages in this codebase (hierarchy-tree.tsx), but overkill for this case.

verification: Applied 2026-04-22 — see Fix Applied section below.
files_changed:
  - apps/web/src/components/notifications/notification-dropdown.tsx

## Fix Applied

- **Commit:** 81e28c8
- **Option chosen:** A (one-line fix — change `max-h-96` → `h-96`)
- **File:** apps/web/src/components/notifications/notification-dropdown.tsx:59
- **Typecheck:** `pnpm --filter @sms-platform/web exec tsc --noEmit` — passed with no output
- **Hot reload:** Web dev server already running on port 3000 (PID 92803) — change picked up by Next.js Turbopack HMR

### Diff

```diff
--- a/apps/web/src/components/notifications/notification-dropdown.tsx
+++ b/apps/web/src/components/notifications/notification-dropdown.tsx
@@ -56,7 +56,7 @@ export function NotificationDropdown({
       </div>
 
       {/* List */}
-      <ScrollArea className="max-h-96">
+      <ScrollArea className="h-96">
         {loading && notifications.length === 0 ? (
           <div className="space-y-2 px-3">
             {[1, 2, 3].map((i) => (
```

### Rationale for plain `h-96` (no empty-state conditional)

Per task constraint: default to plain `h-96` unless there's clear evidence the popover frequently renders with zero items. The evidence in this session points the opposite way — the user has "99+" notifications (reproduction symptom) and the API returns 20 per page. The empty-state case is rare enough that the extra whitespace tradeoff is acceptable and the conditional complexity is unwarranted.

### Verification notes for the user

1. Login and click the bell icon — popover opens.
2. Expect: list scrolls internally within a 384px (h-96) region; items no longer draw past the popover boundary onto page content.
3. Empty state (no notifications) will render with 384px of whitespace — acceptable tradeoff per Option A.
