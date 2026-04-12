# Phase 5: Dashboard & Monitoring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 05-Dashboard & Monitoring
**Areas discussed:** Dashboard widgets, Map view, Audit log & SRS logs, Notifications

---

## Folded Todos

| Todo | Score | Decision |
|------|-------|----------|
| Redesign camera detail page | 0.9 | Folded into Phase 5 scope |

---

## Dashboard Widgets

### Layout Style

| Option | Description | Selected |
|--------|-------------|----------|
| Summary cards + charts | Row of stat cards + charts below — Grafana-style | |
| Compact overview | Stat cards + camera list only, no charts | |
| Full monitoring hub | Cards + charts + system metrics + mini camera grid — NOC-style | ✓ |

**User's choice:** Full monitoring hub
**Notes:** Data-dense monitoring layout with all key metrics visible at once

### Chart Library

| Option | Description | Selected |
|--------|-------------|----------|
| Recharts | React-native, declarative, easy responsive | |
| Chart.js (react-chartjs-2) | Canvas-based, performant | |
| shadcn/ui charts | Built on Recharts, theme-aware, consistent with existing design system | ✓ |

**User's choice:** shadcn/ui charts
**Notes:** User specifically requested shadcn charts (https://ui.shadcn.com/charts/area). Project already uses shadcn/ui extensively — charts maintain design consistency.

### System Metrics Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| On main dashboard | System metrics as widget on main dashboard | |
| Separate page | Dedicated System Health page in sidebar | |
| Super admin only | System metrics visible only to super admin | ✓ |

**User's choice:** Super admin only
**Notes:** Org admin/operator sees only camera stats + charts

### Org Dashboard Content

| Option | Description | Selected |
|--------|-------------|----------|
| Camera stats + charts | Stat cards + bandwidth chart + API usage chart + camera status list | ✓ |
| Camera stats only | Stat cards + camera list, no charts | |
| Full hub (mini version) | Stats + charts + mini camera grid + recent activity | |

**User's choice:** Camera stats + charts

### Real-time Update Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| WebSocket + polling hybrid | Camera status via Socket.IO, charts/stats via 30s polling | ✓ |
| Full WebSocket | Everything pushed via Socket.IO | |
| Polling only | All data fetched every 15-30s | |

**User's choice:** WebSocket + polling hybrid

### Chart Time Range

| Option | Description | Selected |
|--------|-------------|----------|
| 24h / 7d / 30d toggle | Three time ranges to choose from | ✓ |
| 24h only | Single fixed time range | |
| Custom date picker | User-selected date range | |

**User's choice:** 24h / 7d / 30d toggle

---

## Map View

### Map Library

| Option | Description | Selected |
|--------|-------------|----------|
| Leaflet + react-leaflet | Open-source, free, no API key, OpenStreetMap tiles | ✓ |
| Mapbox GL JS | Premium maps, 3D support, requires API key + billing | |
| Google Maps | Familiar, requires API key + billing | |

**User's choice:** Leaflet + react-leaflet
**Notes:** Free and self-hosted compatible

### Click Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Popup with live preview | Popup shows camera name, status, viewer count + mini HLS preview | ✓ |
| Popup info only | Popup with info + link to camera detail page | |
| Side panel | Camera detail appears in side panel without covering map | |

**User's choice:** Popup with live preview

### Camera Clustering

| Option | Description | Selected |
|--------|-------------|----------|
| Cluster markers | Nearby cameras grouped into numbered clusters, zoom to expand | ✓ |
| No clustering | All markers shown individually | |

**User's choice:** Cluster markers

---

## Audit Log & SRS Logs

### Audit Scope

| Option | Description | Selected |
|--------|-------------|----------|
| All write actions | Create/update/delete on all resources | ✓ |
| All actions including reads | Write + read tracking | |
| Security events only | Login/logout, API key, role changes only | |

**User's choice:** All write actions

### SRS Log Viewer

| Option | Description | Selected |
|--------|-------------|----------|
| Tail log file via WebSocket | Real-time log stream via Socket.IO with level filter | ✓ |
| Polling log endpoint | Fetch logs every 5-10s | |

**User's choice:** Tail log file via WebSocket

### Audit Log UI

| Option | Description | Selected |
|--------|-------------|----------|
| Filter by actor + action + date range | Three filter dimensions | ✓ |
| Full-text search | Search across all fields | |
| Chronological only | Time-ordered list, no filtering | |

**User's choice:** Filter by actor + action + date range

---

## Notifications

### Delivery Channel

| Option | Description | Selected |
|--------|-------------|----------|
| In-app only | Notification bell + dropdown, Socket.IO delivery | ✓ |
| In-app + email | Bell + email alerts for critical events | |
| In-app + email + webhook | All channels (webhook exists from Phase 4) | |

**User's choice:** In-app only
**Notes:** Email can be added later; webhook system already exists from Phase 4 for developer-facing events

### Notification Types

| Option | Description | Selected |
|--------|-------------|----------|
| Camera events + system alerts | Camera status changes + system health warnings | ✓ |
| Camera events only | Only camera status changes | |

**User's choice:** Camera events + system alerts

### User Preferences

| Option | Description | Selected |
|--------|-------------|----------|
| Per event type | Enable/disable each notification type individually | ✓ |
| No preferences | Everyone gets all notifications | |

**User's choice:** Per event type

---

## Claude's Discretion

- Exact component layout and spacing
- Leaflet tile provider and marker icon design
- Audit log pagination and table design
- SRS log file detection and tail implementation
- Notification bell UI design and animation
- Notification storage schema and retention
- Camera detail page specific redesign layout
- System metrics polling interval
- Chart data aggregation endpoint design
