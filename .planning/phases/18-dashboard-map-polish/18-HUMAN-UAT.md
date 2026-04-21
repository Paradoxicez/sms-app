---
status: partial
phase: 18-dashboard-map-polish
source: [18-VERIFICATION.md]
started: 2026-04-21T08:50:00Z
updated: 2026-04-21T08:50:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Tenant dashboard visual + real-time
expected: Log in as an org admin, open `/app/dashboard` with mixed camera states (some online, some offline, one recording, one in maintenance).
- 6 stat cards in a single row at ≥1280px (Cameras Online, Cameras Offline, Recording, In Maintenance, Total Viewers, Stream Bandwidth).
- No SystemMetrics panel (CPU/Memory/Load/SRS Uptime) visible.
- IssuesPanel shows offline + maintenance rows; no CameraStatusTable.
- Disconnect a camera → within ~30s the offline count increments and a new row appears in IssuesPanel.
- Bring a camera back online → empty state reward ("All cameras healthy") renders when all issues clear.
result: [pending]

### 2. Super admin dashboard composition + DataTable behavior
expected: Log in as super admin, open `/admin/dashboard`.
- 7 stat cards at ≥1536px (xl:grid-cols-7).
- Vertical stack: stat cards → SystemMetrics → Platform Issues → Cluster & Edge Nodes → Storage Forecast (7d default, switch to 30d re-fetches chart) → Organization Health (sortable DataTable, default sort by worst usage desc) → Recent Activity.
- Click an org row in Organization Health → navigates to `/admin/organizations/{id}`.
- Click ⋮ menu → View and Manage items open without also triggering row click (stopPropagation).
- Storage Forecast caption shows warning color when `daysUntilFull ≤ 14`; shows "Not enough data yet." when backend returns null.
result: [pending]

### 3. Map marker + popup visual + interactive
expected: Open `/app/map` with cameras of varied statuses including one recording and one in maintenance mode.
- Pins render as teardrop SVGs (28×36), not colored dots. White camera icon centered. Status colors: green=online, red=offline, amber=degraded/reconnecting, blue=connecting.
- Recording camera shows a red 8×8 pulsing dot at the pin's upper-right.
- Maintenance camera shows a gray 10×10 wrench badge at the pin's lower-right.
- Zoom out → cluster bubbles form; bubble color reflects worst child status (any offline → red, degraded → amber, all green → green).
- Click a recording online pin → popup shows 240×135 live preview (HLS attaches), REC pulse top-left, Recording badge with retention below the preview.
- Click a maintenance pin → popup shows Maintenance pill top-left, Maintenance badge with by-user + relative time.
- Click Toggle Maintenance in ⋮ dropdown → AlertDialog opens with Thai+English copy ("เข้าสู่โหมดซ่อมบำรุง / Enter maintenance mode"); Confirm calls `/api/cameras/:id/maintenance` (POST/DELETE) and the pin updates.
- Change viewer count (broadcast from another browser) → the popup's `<video>` element does NOT remount (Phase 13 regression guard, visually no black flash / re-buffer).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
