---
status: partial
phase: 13-hierarchy-map
source: [13-VERIFICATION.md]
started: 2026-04-17T18:00:00Z
updated: 2026-04-17T18:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Projects Page Tree + Table Layout
expected: Left panel shows tree with Folder icons for projects, MapPin for sites, status dots for cameras. Child counts appear as badges. DataTable updates per tree selection. Breadcrumb works.
result: [pending]

### 2. Resizable Split Panel
expected: Drag divider between 200-400px smoothly. Keyboard arrow keys adjust by 20px.
result: [pending]

### 3. Mobile Layout
expected: Tree hidden below 768px. PanelLeft button opens Sheet overlay. Selecting a node closes sheet and updates table.
result: [pending]

### 4. Map Tree Overlay and Filtering
expected: Floating panel opens on map page. Selecting node filters markers and zooms to fit.
result: [pending]

### 5. Placement Mode Flow
expected: Set Location enters crosshair mode. Click places preview marker. Confirm saves via PATCH API. Cancel/Escape discards.
result: [pending]

### 6. View Stream from Map
expected: Popup View Stream button opens ViewStreamSheet with camera preview.
result: [pending]

### 7. Search with Parent Chain
expected: Typing in tree search filters to matching branches with parent nodes preserved.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
