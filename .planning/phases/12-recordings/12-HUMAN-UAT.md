---
status: complete
phase: 12-recordings
source: [12-01-SUMMARY.md, 12-02-SUMMARY.md]
started: 2026-04-17T15:00:00Z
updated: 2026-04-17T16:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. DataTable Visual Rendering
expected: Navigate to /app/recordings. Table shows 10 columns: checkbox, Camera Name, Project, Site, Date, Time Range, Duration, Size, Status badge, Actions (3-dot menu).
result: pass

### 2. Faceted Filter Integration
expected: Click Camera/Project/Site/Status filter buttons in toolbar. Popover shows options to select. Selecting a filter updates URL query params and table re-fetches with filtered data.
result: pass

### 3. Search and Date Range
expected: Type in "Search recordings..." input — after 300ms debounce, URL updates and table re-fetches. Select a date range — from/to params appear in URL.
result: pass

### 4. Single Download as MP4 File
expected: Click 3-dot menu on a recording row, click "Download". Browser downloads an MP4 file named like "cam1-2026-04-15.mp4".
result: pass

### 5. Bulk Download as ZIP
expected: Select 2+ recordings via checkboxes. "Download (N)" button appears. Click it. Progress dialog shows "Processing recording 1 of 2..." with progress bar. When done, browser downloads a zip file containing MP4s.
result: pass

### 6. Single Delete with Confirmation
expected: Click 3-dot menu on a recording, click "Delete". AlertDialog appears asking to confirm. Click "Delete Recording" — recording removed, toast appears.
result: pass

### 7. Bulk Delete with Confirmation
expected: Select 2+ recordings via checkboxes. "Delete (N)" button appears. Click it. AlertDialog shows count. Confirm — recordings removed, toast shows count.
result: pass

### 8. Camera Name Navigation
expected: Click a camera name in the table (blue, underlined). Browser navigates to /app/cameras/{id}?tab=recordings.
result: issue
reported: "Camera detail page (/app/cameras/[id]) redirects back to /app/cameras — no detail page exists yet"
severity: major

### 9. Server-Side Pagination
expected: If more than 10 recordings, pagination controls appear at bottom. Changing page updates URL with page param. Changing page size (10/25/50) updates pageSize param.
result: pass

### 10. Empty State
expected: If no recordings exist, shows "No recordings yet" message with "Go to Cameras" link.
result: pass

## Summary

total: 10
passed: 9
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Camera name link navigates to camera detail page with recordings tab"
  status: failed
  reason: "User reported: Camera detail page (/app/cameras/[id]) redirects back to /app/cameras — no detail page exists yet"
  severity: major
  test: 8
  root_cause: "/app/cameras/[id]/page.tsx contains redirect('/app/cameras') — camera detail page not implemented"
  artifacts:
    - path: "apps/web/src/app/app/cameras/[id]/page.tsx"
      issue: "Redirects to cameras list instead of showing detail"
  missing:
    - "Camera detail page is a separate feature (likely Phase 13 or later) — camera name link should be removed or point elsewhere until detail page exists"
  debug_session: ""
