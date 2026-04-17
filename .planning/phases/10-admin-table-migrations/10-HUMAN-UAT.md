---
status: partial
phase: 10-admin-table-migrations
source: [10-VERIFICATION.md]
started: 2026-04-17T06:00:00Z
updated: 2026-04-17T06:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Audit Log DataTable
expected: Sortable columns (Timestamp, Actor, Action, Resource, IP Address, Actions), numbered page pagination, faceted Action filter, date range picker, debounced search, View Details dialog
result: [pending]

### 2. Users DataTable
expected: Sortable columns (Email, Name, Role badge, Orgs count, Last Sign-in), Role faceted filter, search by email, "..." menu with View details/Edit role/Deactivate (with AlertDialog)
result: [pending]

### 3. API Keys DataTable
expected: Columns with masked key (prefix...lastFour), Status badges (Active green, Revoked red), active keys show Copy/Revoke/Delete, revoked keys show Delete only
result: [pending]

### 4. Webhooks DataTable
expected: Name, truncated URL, event badges (blue), Status badge, "..." menu with Edit/Disable(or Enable)/Test webhook/Delete, dynamic toggle label
result: [pending]

### 5. Stream Profiles DataTable
expected: Table layout (not cards) with Name, Mode badge, Resolution, FPS, Video Bitrate, Audio Bitrate columns. "..." menu with Edit/Duplicate/Delete. Duplicate creates copy with (copy) suffix
result: [pending]

### 6. Cross-Table Consistency
expected: Same filter bar position above table, same pagination controls below, same "..." action menu style, same empty state card pattern across all 5 tables
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
