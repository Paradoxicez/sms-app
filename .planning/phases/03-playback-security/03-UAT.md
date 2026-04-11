---
status: complete
phase: 03-playback-security
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md]
started: 2026-04-10T04:30:00Z
updated: 2026-04-11T00:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Policies List Page
expected: Navigate to /admin/policies. Page shows "Playback Policies" heading with "Create Policy" button. System Default policies appear in table with Level badge, TTL, Max Viewers columns.
result: pass

### 2. Create Policy (System level)
expected: Click "Create Policy". Dialog opens with Policy Level radio buttons, Name, Description, TTL, Max Viewers, Domain Allowlist, No-Referer toggle, Rate Limit fields. Select System, fill name and TTL, click "Create Policy". Toast "Policy created" appears. Dialog closes. New policy appears in table.
result: pass

### 3. Edit Policy
expected: Click the three-dot menu on a policy row, select "Edit". Edit dialog opens pre-filled with current values including entity selector for non-System levels. Change a field, click "Save Changes". Toast "Policy updated". Dialog closes. Table reflects changes.
result: pass

### 4. Delete Policy
expected: Click the three-dot menu on a non-default policy, select "Delete". Confirmation dialog appears. Click "Delete Policy". Toast "Policy deleted". Policy removed from table. System Default policy cannot be deleted (error shown).
result: pass

### 5. Camera Detail — Embed Button
expected: Navigate to a camera detail page. Embed code button (Code icon) visible in the header area. Clicking it opens "Embed Code" dialog with iframe/hls.js/React tabs and code blocks with Copy buttons.
result: pass

### 6. Embed Code — Copy
expected: In the Embed Code dialog, click "Copy" on any code block. Button text changes to "Copied!" briefly, then reverts to "Copy". Clipboard contains the code snippet.
result: pass

### 7. Embed Page — Invalid Session
expected: Navigate to /embed/nonexistent. Page shows dark background with error message indicating session not found or invalid.
result: pass

### 8. Policy Level Placeholder Behavior
expected: In Create Policy dialog, when System is selected, TTL/Max Viewers/Rate Limit show example placeholders (e.g., 7200, 10, 100). When switching to Project/Site/Camera, placeholders change to "(inherited)".
result: pass
note: User suggests showing e.g. style placeholders for all levels

### 9. Select Dropdowns Show Names
expected: In Create Policy dialog (Project/Site/Camera level) and Add Camera dialog, select dropdowns display entity names — not UUIDs — both in the dropdown list and after selection.
result: pass
note: Empty dropdowns (no data) show broken UI state

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
