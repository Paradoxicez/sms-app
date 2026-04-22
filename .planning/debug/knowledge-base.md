# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## notification-popover-overflow — Notification popover list overflows beyond container, no internal scroll
- **Date:** 2026-04-22
- **Error patterns:** ScrollArea, max-h, overflow, popover, Base UI, size-full, scrollbar hidden, no scroll, list extends beyond container
- **Root cause:** Base UI `ScrollAreaPrimitive.Root` needs an explicit **height** (not `max-height`) because the inner Viewport uses `size-full` (height: 100%). With only `max-h-*`, the Root sizes to content, Viewport matches content height, and Base UI's `getHiddenState()` reports `clientHeight >= scrollHeight` → scrollbars hidden → no scroll → list renders at full natural height.
- **Fix:** One-line change: `<ScrollArea className="max-h-96">` → `<ScrollArea className="h-96">`. Applies to any Base UI ScrollArea whose parent doesn't provide a bounded height context (dialog body, flex-1 child). Alternative: use `flex-1 min-h-0` inside a flex parent with bounded height.
- **Files changed:** apps/web/src/components/notifications/notification-dropdown.tsx
---
