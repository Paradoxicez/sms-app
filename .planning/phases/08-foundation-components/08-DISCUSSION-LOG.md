# Phase 8: Foundation Components - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 08-foundation-components
**Areas discussed:** DataTable API, Filter patterns, DatePicker, Pagination

---

## DataTable API

| Option | Description | Selected |
|--------|-------------|----------|
| TanStack Table (headless) | @tanstack/react-table as headless logic + shadcn Table as UI — standard shadcn pattern | ✓ |
| Custom wrapper | Build wrapper around shadcn Table without new dependency — lighter but more manual code | |
| นายเลือกได้เลย | Let Claude choose the best approach | |

**User's choice:** TanStack Table (headless)
**Notes:** User asked whether Next.js handles table logic natively — clarified that Next.js doesn't include table logic, and TanStack is headless (logic only, no UI).

## Row Actions

| Option | Description | Selected |
|--------|-------------|----------|
| ปุ่ม "..." ท้ายแถว | MoreHorizontal button at end of each row, opens dropdown | ✓ |
| แสดงตอน hover | Action buttons appear only on row hover | |
| นายเลือกได้เลย | Let Claude decide | |

**User's choice:** ปุ่ม "..." ท้ายแถว
**Notes:** Matches existing pattern in package-table and org-table.

## Toolbar

| Option | Description | Selected |
|--------|-------------|----------|
| Search + Filter + Actions | Search bar left, filter buttons center, action buttons right — standard SaaS dashboard | ✓ |
| แค่ search bar | Only search bar, no complex filters | |
| นายเลือกได้เลย | Let Claude decide | |

**User's choice:** Search + Filter + Actions

## Filter Patterns

| Option | Description | Selected |
|--------|-------------|----------|
| Faceted filter buttons | Chip-like buttons [Status ▼] [Role ▼] opening popover with multi-select — Linear/Vercel pattern | ✓ |
| Sidebar filter panel | Filter panel on the left side | |
| นายเลือกได้เลย | Let Claude decide | |

**User's choice:** Faceted filter buttons

## Filter State

**User's choice:** URL params via Next.js useSearchParams (no additional library)
**Notes:** User pointed out Next.js can handle this natively — no need for nuqs library.

## DatePicker

| Option | Description | Selected |
|--------|-------------|----------|
| Popover + Calendar | Button trigger opens popover showing Calendar — standard shadcn pattern | ✓ |
| นายเลือกได้เลย | Let Claude decide | |

**User's choice:** Popover + Calendar

## Pagination

| Option | Description | Selected |
|--------|-------------|----------|
| เลขหน้า (offset) | Previous / 1 2 3 ... / Next — shows total, jump to page | ✓ |
| Load more (cursor) | "Load more" button at bottom — good for timelines | |
| ผสมทั้งสอง | Numbered pages as default, Load more for audit/recordings | |

**User's choice:** เลขหน้า (offset)

---

## Claude's Discretion

- Loading skeleton design for DataTable
- Exact spacing and typography in toolbar
- Page size options
- Empty state design

## Deferred Ideas

- Column visibility toggle
- Column resizing
- Export to CSV
