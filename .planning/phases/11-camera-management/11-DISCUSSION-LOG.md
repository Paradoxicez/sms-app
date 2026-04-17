# Phase 11: Camera Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 11-camera-management
**Areas discussed:** Table and Card View, Quick Actions Menu, View Stream Sheet, Table/Card Toggle

---

## Table and Card View

### Camera Table Columns

| Option | Description | Selected |
|--------|-------------|----------|
| Full info | Status dot, Name, Project, Site, Codec, Resolution, Created, Actions | ✓ |
| Compact | Status dot, Name, Site, Status badge, Actions | |
| Extended | Status, Name, Project, Site, Stream URL, Codec, Resolution, FPS, Tags, Created, Actions | |

**User's choice:** Full info — same as existing table + Actions column

### Card View Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Live preview + info | Top: HLS player thumbnail, Bottom: name + status dot + site + "..." menu | ✓ |
| Preview only | Full card video, name + status overlay on video | |
| Detailed card | Preview + name + status + project + site + codec + resolution + actions | |

**User's choice:** Live preview + info

### Cards Per Page

| Option | Description | Selected |
|--------|-------------|----------|
| Grid 3 columns | 3 desktop, 2 tablet, 1 mobile | |
| Grid 4 columns | 4 desktop — smaller cards but more visible | ✓ |
| Auto-fit | CSS grid auto-fill minmax | |

**User's choice:** Grid 4 columns

### HLS Management in Card View

| Option | Description | Selected |
|--------|-------------|----------|
| Max 4 concurrent | IntersectionObserver plays 4 visible players | |
| Max 6 concurrent | Plays 6 visible players | |
| Thumbnail only | Static thumbnail/snapshot, click opens View Stream sheet | ✓ (modified) |

**User's choice:** Thumbnail/placeholder by default, hover to play live preview muted (not full HLS), click opens sheet
**Notes:** User wants snapshot-style display with hover-to-preview behavior, not persistent live streams in cards

### Filters

| Option | Description | Selected |
|--------|-------------|----------|
| Status + Site | Search + Status + Site faceted filters | |
| Status + Site + Project | Add Project filter | ✓ |
| Status only | Search + Status filter only | |

**User's choice:** Status + Site + Project — full filter set

---

## Quick Actions Menu

### Actions UI Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Dialog-based | Each action opens a dialog/sheet/confirm | ✓ (modified) |
| Inline + Dialog mixed | Some inline expand, some dialog | |
| All navigate | Navigate to separate pages | |

**User's choice:** Dialog-based with modifications:
- Stream Profile merged into Edit dialog (not separate action)
- Create dialog also includes Stream Profile
- Record is a menu button that toggles state (not inline toggle)

### Disable Camera Action

| Option | Description | Selected |
|--------|-------------|----------|
| Stop stream + gray out | Disable stops stream, grays out in list | |
| Flag only | Just a flag, no stream stop | |
| Hide from list | Hidden, needs filter to see | |

**User's choice:** Removed entirely — no Disable action

### Delete Camera + Recordings

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm + cascade | Delete camera + all recordings | |
| Camera only | Delete camera, keep recordings | ✓ |
| Soft delete | Mark deleted, hide from list | |

**User's choice:** Camera only — recordings become orphaned

---

## View Stream Sheet

### Sheet Tabs

| Option | Description | Selected |
|--------|-------------|----------|
| 4 tabs | Preview, Policies, Embed Code, Activity | |
| 3 tabs | Preview, Policies, Activity | ✓ (modified) |
| 2 tabs + sidebar | Preview + Activity tabs, Embed/Policies as sidebar | |

**User's choice:** 3 tabs — Preview (HLS + info), Policies, Activity. Embed Code removed from tabs (available in quick actions menu)

### Sheet Size

| Option | Description | Selected |
|--------|-------------|----------|
| Half-screen right | 50% width from right | ✓ |
| Two-thirds screen | ~66% width | |
| Full-screen overlay | Full overlay | |

**User's choice:** Half-screen right (shadcn Sheet)
**Notes:** User initially asked if it was a dialog — clarified difference between Sheet (slide-in panel, table still visible) and Dialog (modal overlay)

### Auto-play

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-play muted | Stream plays immediately on open | ✓ |
| Manual play | Thumbnail + Play button | |

**User's choice:** Auto-play muted

### Preview Tab Content

| Option | Description | Selected |
|--------|-------------|----------|
| Player + key info | HLS player top + camera info below | ✓ |
| Player only | Just the player | |
| Player + actions | Player + info + action buttons | |

**User's choice:** Player + key info (name, status, site, project, codec, resolution, profile, stream URL)

---

## Table/Card Toggle

### Toggle Location

| Option | Description | Selected |
|--------|-------------|----------|
| Toolbar toggle buttons | Icon buttons in toolbar, right side | ✓ |
| Tab-style | Tabs above toolbar | |
| Dropdown | View dropdown | |

**User's choice:** Toolbar toggle buttons

### Default View

| Option | Description | Selected |
|--------|-------------|----------|
| Table view | Opens as table | ✓ |
| Card view | Opens as cards | |
| Remember last choice | localStorage persistence | |

**User's choice:** Table view (no persistence)

### Filter Sharing

| Option | Description | Selected |
|--------|-------------|----------|
| Shared filter | Same filter bar for both views | ✓ |
| Separate per view | Independent filters | |

**User's choice:** Shared filter — switching view preserves filters

---

## Claude's Discretion

- Card hover preview implementation details (debounce, transitions, max concurrent)
- HLS player buffer limits for hover preview
- Sheet transition animation
- Empty state design
- Loading skeletons
- Card dimensions and spacing

## Deferred Ideas

- Snapshot/thumbnail API — future enhancement
- Camera disable/enable — removed from scope
- View preference persistence — decided against
