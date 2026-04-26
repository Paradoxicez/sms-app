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

## bulk-import-drop-zone-not-working — Drag-and-drop file zone in Bulk Import dialog ignores dropped files (click-to-pick still works)
- **Date:** 2026-04-26
- **Error patterns:** drop zone, drag-and-drop, onDrop never fires, no hover state, browser opens file natively, dragover, preventDefault, dataTransfer, file drop ignored
- **Root cause:** Drop zone element had no drag-and-drop event handlers (`onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop`). Without `onDragOver` calling `preventDefault()`, the browser's default behavior is to **reject the drop** — so `onDrop` never fires regardless of whether it's wired or not. Visual cue ("Drop file here" copy + dashed border) promised behavior that was never implemented; only the click-to-pick path existed. Generalizable lesson: in React, drop zones MUST call `e.preventDefault()` on `onDragOver` (and ideally `onDragEnter`) — this is the load-bearing call that tells the browser "yes, accept the drop here". Forgetting it is the #1 silent React drop-zone bug.
- **Fix:** Wire `onDragOver` + `onDragEnter` + `onDragLeave` + `onDrop` on the drop-zone element, all calling `e.preventDefault()` and `e.stopPropagation()`. Extract file processing into a shared `handleFile(file: File)` helper so the file picker (`onChange`) and the drop handler (`onDrop` → `e.dataTransfer.files[0]`) feed the same parse pipeline. Add an `isDragOver` state for visual feedback (border color swap + `data-drag-over` attribute for tests). Test the contract directly: assert `fireEvent.dragOver` returns `false` (canceled) — without this assertion, regressions to a missing `preventDefault()` slip through.
- **Files changed:** apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx, apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx
---
