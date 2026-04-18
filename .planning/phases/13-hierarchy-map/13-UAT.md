---
status: complete
phase: 13-hierarchy-map
source: [13-01-SUMMARY.md, 13-02-SUMMARY.md]
started: 2026-04-18T06:30:00Z
updated: 2026-04-18T08:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Hierarchy Tree Renders
expected: Open /app/projects. Left panel shows a tree with collapsible nodes. Projects show Folder icon + name + site count badge. Sites show MapPin icon + name + camera count badge. Cameras show status dot + name.
result: pass

### 2. Tree Expand/Collapse
expected: Click chevron (▶) on a project node — it expands to show sites. Click again — it collapses. Same for site nodes expanding to cameras.
result: pass

### 3. Tree Search
expected: Type in the search box at top of tree. Tree filters to show only matching nodes with their parent chain preserved. Clear search restores full tree.
result: pass

### 4. Split Panel Resize
expected: Drag the divider between tree and table. Tree panel resizes smoothly between 200px (min) and 400px (max). Default width is ~280px.
result: pass

### 5. Mobile Sheet Overlay
expected: Resize browser below 768px. Tree panel hides. A PanelLeft button appears. Clicking it opens the tree as a left-side sheet overlay. Selecting a node closes the sheet.
result: pass

### 6. Tree-to-Table Navigation
expected: At root level, right panel shows Projects table. Click a project in tree — right panel shows Sites table for that project. Click a site — right panel shows Cameras table (Phase 11 DataTable with sort/filter/actions).
result: pass

### 7. Breadcrumb Navigation
expected: When a site is selected, breadcrumb shows "Projects > ProjectName > SiteName". Clicking "Projects" goes back to root. Clicking project name goes back to project level.
result: pass

### 8. Camera CRUD from Projects Page
expected: At site level, click "Add Camera" — camera form dialog opens with Project and Site pre-filled. Use action menu on a camera row — Edit, Delete, Embed Code, View Stream all work correctly.
result: pass

### 9. Bulk Import from Projects Page
expected: At site level in Projects page, click "Import" button. Bulk import dialog opens allowing CSV/Excel upload.
result: pass

### 10. Map Tree Overlay
expected: Open /app/map. Click the tree toggle button (top-left area, not overlapping zoom controls). A floating panel opens with the same hierarchy tree. Close button hides it.
result: pass

### 11. Map Filter by Tree Selection
expected: In map tree overlay, select a project or site node. Map markers filter to show only cameras under that node. Map auto-zooms to fit the filtered markers. Click "Clear" to show all cameras again.
result: pass

### 12. Camera Location Management
expected: Drag existing marker to new position — confirm bar appears with Save/Cancel. Click 📍 on unlocated camera in tree — crosshair mode — click map — same confirm bar appears.
result: pass

### 13. View Stream from Map
expected: Click camera marker — popup opens. Click "View Stream" — popup closes, ViewStreamSheet opens in front of map.
result: pass

## Summary

total: 13
passed: 13
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
