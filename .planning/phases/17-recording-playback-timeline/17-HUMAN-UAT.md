---
status: partial
phase: 17-recording-playback-timeline
source: [17-VERIFICATION.md]
started: 2026-04-20
updated: 2026-04-20
---

## Current Test

[awaiting human testing]

## Tests

### 1. Real HLS video plays end-to-end
expected: `/app/recordings/[valid-id]` loads, video plays in Chrome and Safari without error; segments load over the proxied `/api/recordings/segments/:id/proxy` path with cookie auth
result: [pending]

### 2. Timeline scrubbing UX feels smooth
expected: TimelineBar click + drag selects ranges smoothly; arrow-key navigation moves cursor; ARIA slider role announces position; click on hour with recording navigates to that recording
result: [pending]

### 3. Heatmap colors visually distinguish has-data from empty hours
expected: Hours with recordings show `bg-chart-1` fill; empty hours show `bg-muted`; sufficient color contrast in light + dark modes
result: [pending]

### 4. Browser back-button traverses recording history correctly
expected: Navigate `/app/recordings` list → recording A → date change to B → recording B → click Back twice → lands on A then back at the recordings list (browser history preserved by `router.push` not `router.replace`)
result: [pending]

### 5. Calendar dot decoration renders on days with recordings
expected: Date label opens shadcn Calendar popover; days with recordings show dot decoration via `after:bg-chart-1` pseudo-element; navigating months refreshes dots based on `displayedMonth` state (not `selectedDate`)
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
