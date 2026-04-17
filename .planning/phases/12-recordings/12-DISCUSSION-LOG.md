# Phase 12: Recordings - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 12-recordings
**Areas discussed:** Table columns & filters, Quick actions & bulk ops, Page layout & playback, Backend API design

---

## Table Columns & Filters

### Columns

| Option | Description | Selected |
|--------|-------------|----------|
| Full detail | Checkbox, Camera name, Project, Site, Date, Time Range, Duration, Size, Status, Actions | ✓ |
| Compact | Checkbox, Camera name, Date+Time, Duration, Status, Actions — cut Project/Site/Size | |

**User's choice:** Full detail
**Notes:** Cross-camera browsing needs to show which project/site each recording belongs to

### Filters

| Option | Description | Selected |
|--------|-------------|----------|
| Full filters | Search + Camera + Project + Site + DateRangePicker + Status | ✓ |
| Essential only | Search + Camera + DateRangePicker + Status | |

**User's choice:** Full filters
**Notes:** Covers all REC-02 requirements

### Pagination

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side | Offset pagination at backend — scales with large recording counts | ✓ |
| Client-side | Fetch all, paginate at frontend | |

**User's choice:** Server-side
**Notes:** None

### Default Sort

| Option | Description | Selected |
|--------|-------------|----------|
| Newest first | startedAt descending | ✓ |
| Oldest first | startedAt ascending | |

**User's choice:** Newest first
**Notes:** None

---

## Quick Actions & Bulk Ops

### Row Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Download + Delete | 2 actions: presigned URL download, delete with confirmation | ✓ |
| Download + Play + Delete | 3 actions: adds playback shortcut from row | |

**User's choice:** Download + Delete
**Notes:** None

### Bulk Delete Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Toolbar button | "Delete Selected (N)" in toolbar when checkboxes selected | ✓ |
| Floating action bar | Floating bar at bottom when items selected | |

**User's choice:** Toolbar button
**Notes:** None

### Download Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Presigned URL | Backend generates MinIO presigned URL, browser downloads directly | ✓ |
| Proxy through API | Download streams through API server | |

**User's choice:** Presigned URL
**Notes:** Saves API server bandwidth

---

## Page Layout & Playback

### Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Table only | DataTable with filters, no player on page | ✓ |
| Table + inline player | Expandable rows with HLS player | |
| Table + side sheet | Click row opens sheet with player + details | |

**User's choice:** Table only
**Notes:** Click camera name links to camera page which has full player/timeline/calendar

### Calendar/Timeline

| Option | Description | Selected |
|--------|-------------|----------|
| No — DateRangePicker only | Use Phase 8 DateRangePicker as filter | ✓ |
| Yes — add calendar sidebar | Calendar panel showing days with recordings | |

**User's choice:** No — DateRangePicker only
**Notes:** Calendar/timeline better suited for per-camera view (recordings-tab)

---

## Backend API Design

### Cross-Camera Endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| New list endpoint | GET /api/recordings with full query params | ✓ |
| Extend existing endpoint | Make cameraId optional on existing per-camera route | |

**User's choice:** New list endpoint
**Notes:** Clean separation from per-camera endpoint

### Download Endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| New download endpoint | GET /api/recordings/:id/download returns presigned URL | ✓ |
| Reuse manifest endpoint | Use existing manifest endpoint for download | |

**User's choice:** New download endpoint
**Notes:** Manifest is for HLS playback (m3u8), download is for file download — different purposes

---

## Claude's Discretion

- Loading skeleton design for DataTable
- Empty state when no recordings match filters
- Exact toolbar layout spacing
- Search field placeholder text
- Page size options
- Bulk delete error handling
- Search query scope (camera name, project name, or both)
