# Phase 22: Camera metadata utilization — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 22-camera-metadata-utilization-surface-tags-description-across
**Areas discussed:** Scope cut (3 tiers), Tag data model, Tag normalization, Filter semantics, Form input UX, Bulk operations, Description tooltip placement, Map preview display, Webhook payload, Audit log

---

## Scope cut — 🟢 UI display tier

| Option | Description | Selected |
|--------|-------------|----------|
| Tags column in DataTable | Render tags as badges in Cameras table (2-3 + overflow tooltip), reuse Phase 20 color tokens | ✓ |
| Description in view-stream-sheet | Notes section under camera info on stream-detail page when description is non-empty | ✓ |
| Description tooltip on card view | Hover camera card → description in tooltip | ✓ |

**User additions (free-text "Other"):**
- "Description tooltip ตอน hover ที่ตาราง" → folded as a separate UI surface (D-17)
- "map preview ใส่ tag เพิ่ม" → folded as map-popup tag display (D-19) + map-toolbar tag filter (D-20)

**Outcome:** All 3 audit-suggested UI items kept + 2 new user-driven items added (table-row tooltip on name, map preview tags + filter).

---

## Scope cut — 🟡 Backend filter + bulk ops tier

| Option | Description | Selected |
|--------|-------------|----------|
| Filter cameras by tag | `GET /cameras?tags[]=...` + MultiSelect in filter bar | ✓ |
| Tag autocomplete in form | Distinct tags query for form input, prevent typo divergence | ✓ |
| Bulk add/remove tag | Extend Phase 20 bulk action menu | ✓ |

**Outcome:** All 3 backend items kept.

---

## Scope cut — 🔵 Integration surface tier

| Option | Description | Selected |
|--------|-------------|----------|
| Tags in webhook payload | Emit tags in `camera.online`/`camera.offline` events for subscribe-by-tag use cases | ✓ |
| Document filter in Dev Portal API docs | Surface tag/description filter capability publicly | ✓ |
| Audit log per-field changes | Track who changed tags/description and when | ✓ |

**Outcome:** All 3 integration items kept.

---

## Tag data model

| Option | Description | Selected |
|--------|-------------|----------|
| Keep denormalized `String[]` (Recommended) | Postgres array, optional GIN index, no migration overhead, supports current scale | ✓ |
| Refactor to Tag entity + many-to-many | Enables Tag management page (rename/merge/color), but scope grows: migration + DTO/API rewrite | |

**Outcome:** Denormalized stays. Tag management page deferred to a future phase that owns the refactor.

---

## Tag normalization

| Option | Description | Selected |
|--------|-------------|----------|
| Case-insensitive query, preserve display (Recommended) | Store user's casing as-is; queries/dedup compare lowercase. Preserves "Entrance Gate" display fidelity. | ✓ |
| Lowercase on write (lossy) | Force lowercase on write — simpler queries, but destroys casing for tags like "CCTV-Cam-A" | |

**Outcome:** Case-insensitive query. Implementation strategy (shadow column vs `$queryRaw` vs Prisma middleware) deferred to planner per D-06 / Claude's Discretion.

---

## Filter semantics (multi-tag selection)

| Option | Description | Selected |
|--------|-------------|----------|
| OR (hasSome) — any selected tag matches (Recommended) | `?tags[]=A&tags[]=B` → cameras with A or B; standard MultiSelect filter UX | ✓ |
| AND (hasEvery) — must have all selected | More restrictive; users may find AND counterintuitive as default | |
| Toggle in UI — user picks each time | "Match any/all" switch above MultiSelect; max flexibility but UX complexity | |

**Outcome:** OR. AND toggle deferred (D-07, deferred).

---

## Form input UX

| Option | Description | Selected |
|--------|-------------|----------|
| Chip-based combobox with autocomplete (Recommended) | Type → suggestions (or Enter to commit); tags become chips. Better UX, ~20-30 lines new component. | ✓ |
| Keep comma-separated string + dropdown suggestions | Lower effort, but UX still feels antiquated | |

**Outcome:** Chip combobox. Show mockup before committing if built from scratch (per UI pro-minimal preference).

---

## Bulk tag operations

| Option | Description | Selected |
|--------|-------------|----------|
| Add tag + Remove tag (2 modes, Recommended) | Two clear modes, predictable, no destructive interactions | ✓ |
| Add + Remove + Replace all (3 modes) | Adds Replace mode for batch normalization — destructive, requires confirm dialog | |
| Add only — no bulk Remove | Asymmetric; awkward for "remove maintenance tag from 100 cameras" | |

**Outcome:** Two modes. No confirm dialog (non-destructive, reversible — D-13).

---

## Description tooltip surfaces

| Option | Description | Selected |
|--------|-------------|----------|
| On the camera name in BOTH table row and card view (Recommended) | Trigger is the name text — clean, predictable, doesn't fire on row hover | ✓ |
| Whole-row hover on table | Discoverable but trigger too broad | |
| Hover on a description column in the table | Explicit but consumes column space | |

**Outcome:** Name-text trigger on both table and card surfaces (D-17).

---

## Map preview tag display

| Option | Description | Selected |
|--------|-------------|----------|
| Inside the marker popup (badges + truncated description) | Click marker → popup shows tags + truncated description; map stays clean | |
| Tag filter in the map toolbar (no inline display) | Markers stay clean; users can filter by tag from toolbar | |
| Both: popup display + toolbar filter | Inline display in popup AND filter capability — most complete coverage | ✓ |

**Outcome:** Both. Popup expansion (D-19) + map-toolbar MultiSelect filter (D-20).

---

## Webhook payload extension

| Option | Description | Selected |
|--------|-------------|----------|
| Add `tags` only (Recommended) | Tags drive use-cases (filter alerts); description has no machine use-case | ✓ |
| Add `tags` + `description` | Full metadata in payload; bigger payload, no clear use-case for description | |
| Add `cameraName` + `tags` + `description` | Save consumers a fetch round-trip; payload grows substantially | |

**Outcome:** Tags only (D-22). Description and cameraName stay deferred.

---

## Audit log per-field changes

| Option | Description | Selected |
|--------|-------------|----------|
| Before/after diff in `details.diff` JSON (Recommended) | Includes `{tags: {before, after}, description: {before, after}}` for changed fields only | ✓ |
| After value only | Loses the "what changed" semantics; current full-body capture is already this | |
| Per-field diff only when changed | Same as recommended in practice — the diff already skips unchanged fields | |

**Outcome:** Diff in `details.diff`, only for changed fields. Bulk ops emit one `AuditLog` entry per affected camera (D-26).

---

## Claude's Discretion (deferred to planner)

- Chip combobox component reuse vs build (mockup if built)
- `/cameras/tags/distinct` caching strategy
- Lowercase-shadow implementation (middleware/trigger/computed column)
- Prisma migration approach for GIN index
- Tooltip delay tuning
- Map popup truncation threshold
- Bulk tag popover layout

## Deferred Ideas

(See `<deferred>` in CONTEXT.md for the full list.)
