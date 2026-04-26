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

## view-stream-activity-tab-no-events — View Stream sheet Activity tab always empty for every camera
- **Date:** 2026-04-26
- **Error patterns:** audit log, Activity tab, empty, "No audit log entries", "Showing 0-0 of 0", search filter, resourceId, URL composition, double question mark, query string, AuditService.findAll, view-stream-sheet, audit-log-data-table
- **Root cause:** TWO independent bugs. (1) Backend `AuditService.findAll` `search` OR-clause matched only `resource` (a type literal like "camera") and `ip` (an IP address) — never `resourceId` (where camera UUIDs live) or `path`. The DTO had no `resourceId` filter either, so a camera-scoped query like `?resource=camera&search=<uuid>` could never return rows even when audit history existed. (2) Frontend `AuditLogDataTable` composed the request as `${apiUrl}?${params.toString()}` — when the caller passed an apiUrl that already had a query string (e.g. `/api/audit-log?resource=camera&search=<id>`), the result had two `?` separators, corrupting the search value with `?page=1&pageSize=25` suffix. Either bug alone would have produced the empty Activity tab; both shipped together. Generalizable lesson: when scoping a list endpoint to a single entity instance, add a dedicated id filter (e.g. `resourceId`) — don't overload free-text `search` to do entity narrowing, because `search` is structurally an OR-clause designed to widen, not narrow.
- **Fix:** Backend — added `resourceId: z.string().optional()` to `auditQuerySchema`; in `findAll`, applied `where.resourceId = query.resourceId` BEFORE the search OR-clause so it AND-narrows; extended search OR-clause to also match `resourceId` and `path`. Frontend — replaced `${apiUrl}?${params}` with `new URL(apiUrl, window.location.origin)` + `searchParams.set(...)`, then handed `${url.pathname}${url.search}` to `apiFetch`. Caller — Activity tab now passes `?resource=camera&resourceId=<id>` instead of `&search=<id>`.
- **Files changed:** apps/api/src/audit/dto/audit-query.dto.ts, apps/api/src/audit/audit.service.ts, apps/api/tests/audit/audit-interceptor.test.ts, apps/web/src/components/audit/audit-log-data-table.tsx, apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx, apps/web/src/components/audit/__tests__/audit-log-data-table.test.tsx
---
