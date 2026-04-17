# Phase 10: Admin Table Migrations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 10-admin-table-migrations
**Areas discussed:** Migration scope per table, Audit log pagination, Stream profiles conversion, Shared migration pattern

---

## Migration Scope Per Table

### Users Table Quick Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Deactivate only | Keep current behavior — minimal actions | |
| Deactivate + View details | Add View action for user detail | |
| Deactivate + Edit role + View | Full management: change role, view details, deactivate | ✓ |

**User's choice:** Deactivate + Edit role + View
**Notes:** None

### API Keys Table Quick Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Revoke only | Keep current — revoke active keys only | |
| Revoke + Copy key + Regenerate | Add copy and regenerate actions | |
| Revoke + Edit name + Copy | Allow renaming and copying keys | |

**User's choice:** Revoke + Copy key + Delete (custom)
**Notes:** User chose Revoke + Copy key + Delete instead of the presented options

### Audit Log Quick Actions

| Option | Description | Selected |
|--------|-------------|----------|
| View Details only | Keep current — open dialog with log entry | ✓ |
| View Details + Copy JSON | Add copy log entry as JSON | |

**User's choice:** View Details only
**Notes:** None

### Webhooks Quick Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Edit + Toggle + Delete | Add Edit to existing Toggle + Delete | |
| Toggle + Delete (keep current) | Same as current behavior | |
| Edit + Toggle + Delete + Test | Full management with webhook test ping | ✓ |

**User's choice:** Edit + Toggle + Delete + Test
**Notes:** None

### Filters Per Table

| Option | Description | Selected |
|--------|-------------|----------|
| Appropriate filters per table | Users: search+Role, API Keys: search+Status, Audit Log: search+Action+DateRange, Webhooks: search+Status | ✓ |
| Search only for all tables | Simple search bar, no faceted filters | |
| Claude decides | Let Claude choose appropriate filters | |

**User's choice:** Appropriate filters per table (recommended)
**Notes:** None

---

## Audit Log Pagination

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side offset pagination | Standard numbered pages, requires count query, consistent UX | ✓ |
| Cursor-based in DataTable | Previous/Next without page numbers, no API change needed | |
| Claude decides | Let Claude choose based on codebase and API | |

**User's choice:** Server-side offset pagination
**Notes:** None

---

## Stream Profiles Conversion

### Columns

| Option | Description | Selected |
|--------|-------------|----------|
| All values | Name, Mode, Resolution, FPS, Video Bitrate, Audio Bitrate, Actions | ✓ |
| Key values only | Name, Mode, Resolution, Actions — details in View | |
| Claude decides | Let Claude choose appropriate columns | |

**User's choice:** All values — show everything in the table
**Notes:** None

### Quick Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Edit + Duplicate + Delete | Per HIER-03 requirement | ✓ |
| Edit + Delete only | Simpler, no Duplicate | |

**User's choice:** Edit + Duplicate + Delete (per requirement)
**Notes:** None

---

## Shared Migration Pattern

### Migration Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Replace in-place | Delete old table, create DataTable + columns in its place | ✓ |
| Side-by-side then swap | Build new version alongside old, test, then switch | |

**User's choice:** Replace in-place
**Notes:** None

### Data Fetching

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as-is | Tables keep existing data fetching pattern, only UI changes | ✓ |
| Move all to DataTable | DataTable fetches data internally via API endpoint | |
| Claude decides | Let Claude choose per table | |

**User's choice:** Keep as-is
**Notes:** User asked for recommendation. Claude recommended keeping existing pattern because: (1) DataTable is headless/presentational, (2) each table has different API patterns, (3) audit log just needs pagination callbacks, (4) avoids scope creep

---

## Claude's Discretion

- Exact filter choices per table beyond what's specified
- Loading skeleton and empty state design
- Column widths and responsive behavior
- Stream profiles filter strategy
- Plan splitting strategy (one plan vs multiple)

## Deferred Ideas

- Redesign camera detail page — Phase 11
- Inline cell editing — explicitly out of scope
- Export to CSV — not in scope for v1.1
