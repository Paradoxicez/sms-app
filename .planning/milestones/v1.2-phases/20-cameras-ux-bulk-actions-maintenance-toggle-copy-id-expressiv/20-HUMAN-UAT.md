---
status: resolved
phase: 20-cameras-ux-bulk-actions-maintenance-toggle-copy-id-expressiv
source: [20-VERIFICATION.md]
started: 2026-04-25T05:50:00Z
updated: 2026-04-25T10:20:00Z
---

## Current Test

[all approved by user]

## Tests

### 1. Pulse animation timing feels right on LIVE + REC pills
expected: Pulses read as "alive indicator", not distracting throb; OS "Reduce Motion" setting halts pulse while state remains legible
result: passed

### 2. Width transition feels smooth on Stream/Record pill buttons
expected: Toggling active → idle does not jank; neighboring tab-row elements do not reflow (min-w-[340px] reservation holds)
result: passed

### 3. Tooltip delay on ID chip feels right
expected: Tooltip with full UUID appears ~500ms after hover; dismisses cleanly
result: passed-after-fix
note: First hover showed tooltip clipped BEHIND sheet overlay (z-index bug in shared tooltip primitive). Fixed by raising tooltip Positioner z-50 → z-[1200] (above Sheet's z-[1100]). Re-tested and approved.

### 4. Sticky bulk toolbar z-index interplay with Sheet portal
expected: Toolbar pinned during scroll; sits BEHIND sheet overlay when View Stream opened; re-pins after sheet closes
result: passed

### 5. Failed-row AlertTriangle hover tooltip shows error reason verbatim
expected: Tooltip contains exact API error string, wraps correctly within viewport
result: passed

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

### Resolved during UAT

1. **Tooltip portal z-index** — shared `tooltip.tsx` primitive layered below Sheet. Fixed: `z-50 → z-[1200]`.
2. **Projects page missing BulkToolbar** — Plan 20-03 only modified `tenant-cameras-page.tsx` but the `select` column in `cameras-columns.tsx` is global, so checkboxes appeared on `/app/projects` without an action surface. Fixed by extracting `useCameraBulkActions` hook + `CameraBulkActions` component and wiring them into `tenant-projects-page.tsx`. Also unified row-menu Maintenance on Projects to the D-07 asymmetric flow.
