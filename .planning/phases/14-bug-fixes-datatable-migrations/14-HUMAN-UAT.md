---
status: partial
phase: 14-bug-fixes-datatable-migrations
source: [14-VERIFICATION.md]
started: 2026-04-18
updated: 2026-04-18
---

## Current Test

[awaiting human testing]

## Tests

### 1. System org user creation
expected: Super admin can create a new user in the system organization without RLS errors
result: [pending]

### 2. API key copy from create dialog
expected: Clicking copy button in the create dialog copies the full raw API key (not masked) to clipboard
result: [pending]

### 3. API key hard delete
expected: Deleting an API key removes the record from the database entirely (not soft-delete), and cascade deletes usage records
result: [pending]

### 4. DataTable visual consistency
expected: All 4 migrated pages (Team, Organizations, Cluster Nodes, Platform Audit) render DataTable with sorting, filtering, pagination, and row actions consistently
result: [pending]

### 5. Self-removal prevention
expected: Current user cannot remove themselves from the Team page (remove action hidden or disabled for own row)
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
