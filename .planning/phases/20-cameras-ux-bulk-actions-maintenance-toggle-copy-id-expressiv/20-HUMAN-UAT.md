---
status: partial
phase: 20-cameras-ux-bulk-actions-maintenance-toggle-copy-id-expressiv
source: [20-VERIFICATION.md]
started: 2026-04-25T05:50:00Z
updated: 2026-04-25T05:50:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Pulse animation timing feels right on LIVE + REC pills
expected: Pulses read as "alive indicator", not distracting throb; OS "Reduce Motion" setting halts pulse while state remains legible
result: [pending]

### 2. Width transition feels smooth on Stream/Record pill buttons
expected: Toggling active → idle does not jank; neighboring tab-row elements do not reflow (min-w-[340px] reservation holds)
result: [pending]

### 3. Tooltip delay on ID chip feels right
expected: Tooltip with full UUID appears ~500ms after hover; dismisses cleanly
result: [issue-then-fixed]
note: First hover showed tooltip clipped BEHIND sheet overlay (z-index bug in shared tooltip primitive). Fixed in commit (tooltip Positioner z-50 → z-[1200], above Sheet's z-[1100]). Awaiting re-test.

### 4. Sticky bulk toolbar z-index interplay with Sheet portal
expected: Toolbar pinned during scroll; sits BEHIND sheet overlay when View Stream opened; re-pins after sheet closes
result: [pending]

### 5. Failed-row AlertTriangle hover tooltip shows error reason verbatim
expected: Tooltip contains exact API error string, wraps correctly within viewport
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
