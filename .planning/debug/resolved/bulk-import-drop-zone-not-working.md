---
status: resolved
trigger: "In the Import Cameras dialog (Bulk Import) on /admin/cameras, the drag-and-drop file zone does not accept dropped files. Clicking the zone to open the file picker works fine; only the drop interaction is broken."
created: 2026-04-26T00:00:00Z
updated: 2026-04-26T13:42:00Z
---

> **2026-04-26 — CONFIRMED FIXED end-to-end by user.** Drag-and-drop now works in the browser; dropping a CSV onto the dashed zone parses it and advances to the preview step the same way as clicking the picker.

## Current Focus

hypothesis: Confirmed — drop zone had no drag/drop handlers at all. Fix wires onDragOver + onDragEnter + onDragLeave + onDrop on the same `<button>`, all calling `preventDefault()`. File processing extracted to a shared `handleFile(file)` helper used by both the file-picker change and the drop handler.
test: Vitest run of the bulk-import-dialog test file, including 4 new drop-zone regression tests.
expecting: All tests pass; drop-zone tests assert that fireEvent.drop populates the preview, that dragover is canceled (preventDefault), that the data-drag-over attribute toggles, and that empty drop is a no-op.
next_action: Resolved — no further action.

## Symptoms

expected: Dragging a CSV/JSON/XLSX file onto the dashed drop zone ("Drop file here, or click to upload") should upload it the same way as clicking and selecting via the file picker.
actual: Dragging a file over the drop zone produces no visual feedback (no hover state) and releasing the file does nothing. Browser may navigate away to open the file directly because the page didn't preventDefault.
errors: None reported in the UI.
reproduction:
  1. Open the web app, log in, navigate to /admin/cameras
  2. Click the "Import" button to open the BulkImportDialog
  3. Drag a CSV file from Finder onto the dashed drop zone
  4. Observe: nothing happens (or browser opens the file natively)
  5. Compare: clicking the same zone opens a file picker that works correctly
started: Likely present since the dialog was built — the component has recent edits but drag-drop appears never implemented.

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-26T00:00:00Z
  checked: bulk-import-dialog.tsx upload-step JSX (lines 612-649)
  found: Drop zone is `<button type="button" onClick={() => fileInputRef.current?.click()} ...>`. Only an onClick handler. No onDragOver, onDragEnter, onDragLeave, or onDrop. No `e.preventDefault()` for dragover anywhere.
  implication: Confirms hypothesis. The drop zone was never wired for drag-and-drop — the visual cue ("Drop file here") promises behavior that was never implemented. Browser default for unhandled dragover is to reject the drop, so onDrop would never fire even if it existed; file open in the browser tab is the default fallback.

- timestamp: 2026-04-26T00:00:00Z
  checked: grep for "onDrag", "onDrop", "dataTransfer" across bulk-import-dialog.tsx
  found: Zero matches.
  implication: Truly nothing — not a typo or misnamed handler. Need to add the full drop interaction.

## Resolution

root_cause: Drop zone element has no drag-and-drop event handlers (`onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop`). Without `onDragOver` calling `preventDefault()`, the browser uses its default behavior of rejecting drops, so dropping a file does nothing (or navigates the browser to the file). The element looks like a drop zone (dashed border, "Drop file here" copy) but only the click-to-pick path was implemented.
fix: |
  1. Extracted `handleFile(file: File)` helper from `handleFileChange` so file-picker and drop interaction share the same parse/decode/processRows pipeline (preserves Thai CP874 + Excel paths).
  2. Added `handleDragOver`, `handleDragEnter`, `handleDragLeave`, `handleDrop` — all call `preventDefault()` and `stopPropagation()`. drop reads `e.dataTransfer.files?.[0]` and forwards to `handleFile`.
  3. Added `isDragOver` state, wired onto the button as `data-drag-over` attribute and used to swap border color (`border-primary` while dragging, `border-muted-foreground/25` idle). Visual feedback that was previously missing.
  4. The drop-zone element remains a `<button>` so click-to-pick + keyboard accessibility (Enter/Space) still work.
verification: |
  Self-verified:
  - `pnpm --filter @sms-platform/web test -- bulk-import-dialog` → 39 / 39 passed (28 in bulk-import-dialog.test.tsx + 11 in -push.spec.tsx). 4 new drop-zone tests cover: drop populates preview, dragover preventDefault, data-drag-over toggle, empty-drop no-op.
  - `pnpm --filter @sms-platform/web exec tsc --noEmit` → clean.
  Pending human-verify in a real browser (drag-and-drop dataTransfer is JSDOM-emulated, real browser nuances around dragenter/dragleave bubbling on child elements can differ).
files_changed:
  - apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx
  - apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx
