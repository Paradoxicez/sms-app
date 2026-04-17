---
status: partial
phase: 12-recordings
source: [12-VERIFICATION.md]
started: 2026-04-17T15:00:00Z
updated: 2026-04-17T15:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. DataTable Visual Rendering
expected: Table shows columns: checkbox, Camera Name, Project, Site, Date, Time Range, Duration, Size, Status badge, Actions
result: [pending]

### 2. Faceted Filter Integration
expected: Selecting a filter option updates the URL query string and the table re-fetches showing filtered results
result: [pending]

### 3. Bulk Delete Flow
expected: AlertDialog appears with correct count, confirming deletes recordings and shows success toast
result: [pending]

### 4. Download via Presigned URL
expected: Browser opens new tab with MinIO presigned URL triggering file download
result: [pending]

### 5. Camera Name Navigation
expected: Browser navigates to /app/cameras/{id}?tab=recordings with recordings tab active
result: [pending]

### 6. Server-Side Pagination
expected: URL updates with page/pageSize params, table shows correct number of rows
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
