---
status: partial
phase: 05-dashboard-monitoring
source: [05-VERIFICATION.md]
started: 2026-04-12T17:00:00+07:00
updated: 2026-04-12T17:00:00+07:00
---

## Current Test

[awaiting human testing]

## Tests

### 1. Dashboard end-to-end data flow with real cameras
expected: Dashboard page loads with stat cards showing camera counts, bandwidth chart, API usage chart, and camera status table populated from real database data. System metrics visible for super admin only.
result: [pending]

### 2. Map view Leaflet rendering and marker interaction
expected: Map view renders OpenStreetMap tiles with camera markers colored by status. Clicking a marker shows popup with camera info and HLS live preview. Clustering works when zoomed out.
result: [pending]

### 3. Real-time notification delivery on camera status change
expected: When a camera transitions status (e.g. offline→connecting→online), notification bell shows unread badge, dropdown displays notification with correct event type and camera name. Mark as read works.
result: [pending]

### 4. SRS live log streaming via WebSocket
expected: Stream Engine page shows SRS Logs tab (admin only). Log viewer connects via Socket.IO, displays live log lines with level coloring, level filter works, auto-scroll follows new entries.
result: [pending]

### 5. Audit log capture and display after write operations
expected: Performing write operations (create/update/delete cameras, update settings) creates audit log entries. Audit Log page shows entries with actor, action, timestamp, IP. Detail dialog shows full payload. Filters work.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
