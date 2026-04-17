---
status: complete
phase: 09-layout-login
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md, 09-03-SUMMARY.md]
started: 2026-04-17T19:25:00+07:00
updated: 2026-04-17T19:30:00+07:00
---

## Current Test

[testing complete]

## Tests

### 1. Sidebar collapse and expand
expected: Click the sidebar toggle button (or press Cmd+B). Sidebar collapses to icon-only mode showing only icons without labels. Click again (or Cmd+B) to expand back to full sidebar with labels.
result: pass

### 2. Sidebar state persists across reload
expected: Collapse the sidebar, then reload the page (F5/Cmd+R). Sidebar should remain collapsed after reload (state saved via cookie).
result: pass

### 3. Sidebar role filtering
expected: In tenant portal (/app), sidebar shows items based on your role. Admin sees all items. Viewer should not see Developer-only items like API Keys.
result: pass

### 4. Login split-screen layout
expected: Navigate to /sign-in (log out first). Page shows split-screen layout: branding panel on the left (hidden on mobile), login form on the right with email, password, and "Remember me" checkbox (checked by default).
result: pass

### 5. Sidebar resize — charts redraw
expected: On a page with Recharts charts (e.g., dashboard), toggle the sidebar. After the sidebar animation completes, charts should redraw to fill the new available width without clipping or white space.
result: pass

### 6. Sidebar resize — map resizes
expected: On a page with a Leaflet map (e.g., camera map), toggle the sidebar. After the sidebar animation completes, the map should resize correctly without white strips on the edges.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
