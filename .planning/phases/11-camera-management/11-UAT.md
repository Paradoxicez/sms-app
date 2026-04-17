---
status: complete
phase: 11-camera-management
source: [11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md]
started: 2026-04-17T19:35:00+07:00
updated: 2026-04-17T19:42:00+07:00
---

## Current Test

[testing complete]

## Tests

### 1. DataTable with sortable columns and search
expected: Navigate to /admin/cameras. Table shows cameras with columns: Status, Name, Project, Site, Codec, Resolution, Created, Actions. Click column headers (Name, Status, Created) to sort. Type in search box to filter by camera name.
result: pass

### 2. Faceted filters
expected: In the toolbar, click Status filter — see options (Online, Offline, Degraded, etc.). Select one or more to filter. Also try Project and Site filters. Filters narrow the table results.
result: pass

### 3. Quick actions menu
expected: Click "..." on any camera row. Menu shows: Edit, View Stream, Start/Stop Stream, Start/Stop Recording, Embed Code, Delete. Each action triggers the correct dialog/sheet/API call.
result: pass

### 4. Camera form — create and edit
expected: Click "Add Camera" — form dialog opens for creating a new camera with stream profile selector. Click Edit from quick actions — same dialog opens pre-filled with camera data, title shows "Edit Camera", submit button shows "Save Changes".
result: pass

### 5. Delete confirmation
expected: Click Delete from quick actions. AlertDialog appears with title "Delete Camera" and description mentioning the camera name and that recordings will be kept. Cancel dismisses, Delete removes the camera.
result: pass

### 6. Card view toggle
expected: Click the grid icon in the toolbar. View switches to responsive card grid (4 columns desktop, 2 tablet, 1 mobile). Click table icon to switch back. Active filters persist when switching views.
result: pass

### 7. Card hover HLS preview
expected: In card view with online cameras, hover over a card thumbnail. After ~300ms, HLS live preview starts playing (muted). Move mouse away — preview stops immediately.
result: pass

### 8. View Stream sheet
expected: Click "View Stream" (from table row menu or card). Sheet slides in from the right at ~50% viewport width. Shows camera name in header, two tabs: Preview and Activity. Control buttons (stream toggle, record toggle) appear in the tab bar row.
result: pass

### 9. Preview tab layout
expected: Preview tab shows HLS player at top (full width). Below: two side-by-side cards — Camera Info (left) with name/status/site/project/codec/resolution, and Resolved Policy (right) with TTL/Max Viewers/Domains/etc.
result: pass

### 10. Sheet camera switching
expected: With the sheet open, click a different camera (from table or card). Sheet content updates to the new camera without closing and reopening.
result: pass

### 11. Start/Stop Stream action
expected: From quick actions or sheet control button, click Start Stream on an offline camera. Toast shows "Stream started". Camera status should change. Click Stop Stream on an online camera — toast shows "Stream stopped".
result: pass

### 12. Camera detail page redirects
expected: Navigate directly to /app/cameras/any-id or /admin/cameras/any-id. Page redirects to the cameras list page instead of showing old detail page or 404.
result: pass

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
