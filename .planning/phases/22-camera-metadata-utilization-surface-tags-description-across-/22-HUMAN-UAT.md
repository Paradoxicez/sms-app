---
status: partial
phase: 22-camera-metadata-utilization-surface-tags-description-across-
source: [22-VERIFICATION.md]
started: 2026-04-26T00:00:00.000Z
updated: 2026-04-26T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Tags column visible in /admin/cameras DataTable (after Stream Profile)
expected: Up to 3 tag badges + +N overflow chip; +N hover shows tooltip "All tags ({N})" with full alphabetized list; empty cell when zero tags
result: [pending]

### 2. Camera name tooltip on hover in DataTable + camera-card view
expected: Tooltip shows description with max-w-[320px] + line-clamp-6; suppressed when description empty; default Radix delay
result: [pending]

### 3. view-stream-sheet Notes section
expected: Section appears between SheetHeader and Tabs ONLY when description non-empty; preserves user newlines via whitespace-pre-line; no edit button
result: [pending]

### 4. Dashboard Map popup tags + description
expected: Tag badges row + description block (line-clamp-2 + Show more disclosure) appear between subtitle and View Stream button; Show more toggles to Show less
result: [pending]

### 5. Map toolbar Tags MultiSelect filter
expected: Selecting tag(s) narrows visible markers via OR semantics; state independent from cameras-table filter (D-21 — navigate between pages, both retain own state)
result: [pending]

### 6. Bulk Add tag / Remove tag buttons in cameras bulk toolbar
expected: Add tag always visible when ≥1 selected; Remove tag visible only when selected cameras have ≥1 tag; popover opens with TagInputCombobox; submit fires POST /cameras/bulk/tags + toast "Tag {tag} added/removed to/from {N} cameras"; NO confirmation dialog (D-13)
result: [pending]

### 7. TagInputCombobox in camera form (Add/Edit)
expected: Chip-based combobox; type → autocomplete from /cameras/tags/distinct; Enter or comma commits chip; Backspace on empty input removes last chip; +Add row only when no exact match; validation "Tags must be 50 characters or fewer." / "Maximum 20 tags per camera." uses amber warning style (NOT red destructive)
result: [pending]

### 8. Webhook delivery to a real subscriber
expected: camera.online and camera.offline payload includes tags string array (preserves casing); description and cameraName NOT in payload
result: [pending]

### 9. GIN index performance under load
expected: After seeding 1k+ cameras, EXPLAIN ANALYZE on tagsNormalized && ARRAY filter shows Bitmap Index Scan, not Seq Scan
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
