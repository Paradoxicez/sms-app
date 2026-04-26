# Phase 22 Audit Context

**Source:** Explore agent audit, 2026-04-26
**Trigger:** User asked "tags + description ของ camera ถูกใช้ที่ไหน" — answer: write-only metadata, never surfaced anywhere after persistence.

## Schema (current state)

`apps/api/src/prisma/schema.prisma:199-240`

- `description: String?` (nullable, max 500 chars enforced via Zod)
- `tags: String[]` (Postgres array, default `[]`, no separate Tag entity)

## Coverage matrix

| Layer | tags | description |
|-------|:---:|:---:|
| Backend write (form, bulk import, update) | ✓ | ✓ |
| Backend return (GET endpoints, via `serializeCamera`) | ✓ pass-through | ✓ pass-through |
| Backend search/filter | ✗ | ✗ |
| Frontend write (form + bulk import) | ✓ | ✓ |
| Frontend display (DataTable column) | ✗ | ✗ |
| Frontend display (view-stream-sheet) | ✗ | ✗ |
| Frontend display (card view) | ✗ | ✗ |
| Webhook payload | ✗ | ✗ |
| Audit log (per-field changes) | ✗ | ✗ |
| Public Dev Portal API docs | ✗ | ✗ |

## Key file references

**Backend (existing wiring):**
- `apps/api/src/cameras/cameras.service.ts:185,187` — create assigns description + tags
- `apps/api/src/cameras/cameras.service.ts:320-322` — update applies via `data: safe`
- `apps/api/src/cameras/cameras.service.ts:842,844` — bulk import loop
- `apps/api/src/cameras/cameras.service.ts:261-294` — findAllCameras / findCameraById (no explicit select; full pass-through)
- `apps/api/src/cameras/cameras.controller.ts:201-217` — GET endpoints + serializeCamera (masks streamKey only)
- `apps/api/src/cameras/dto/create-camera.dto.ts:13,20`
- `apps/api/src/cameras/dto/update-camera.dto.ts:20,28`
- `apps/api/src/cameras/dto/bulk-import.dto.ts:11,18`

**Frontend (existing wiring):**
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx:74,75,114,117,225,229-233` — Textarea + comma-split tags input
- `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx:290,554-555,564` — CSV template + parser (splits `/[,;]/`)
- `apps/web/src/app/admin/cameras/components/cameras-columns.tsx:49-50` — type defs only (`description`, `tags?: string[]`)
- `apps/web/src/app/admin/cameras/components/cameras-data-table.tsx` — **no column rendered**
- `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx` — **no display section**

## Proposed scope (9 sub-items, 3 tiers)

### 🟢 UI display (quick wins)

1. **Tags column in Cameras DataTable** — show 2-3 badges + `+N` overflow tooltip; reuse Stream Profile badge color tokens for consistency (Phase 19's `quick-260425-uw0` pattern)
2. **Description block in `view-stream-sheet`** — "Notes" section under camera info if non-empty (no table column — too long for tabular display)
3. **Description tooltip on card view** — hover snapshot reveals description (Phase 20 card view already shows snapshot thumbnails)

### 🟡 Backend filter + bulk operations

4. **Filter by tag** — `GET /cameras?tags[]=entrance&tags[]=perimeter` → Prisma `where: { tags: { hasSome: [...] } }`; add MultiSelect to DataTable filter bar (follow `siteId` filter pattern)
5. **Tag autocomplete in form** — query distinct tags within org, suggest while typing to prevent typo divergence (Entrance/entrance/Ent)
6. **Bulk tag operations** — extend Phase 20's bulk action menu with "Add tag", "Remove tag" for selected cameras

### 🔵 Integration surface

7. **Tags in webhook payload** — emit on `camera.online` / `camera.offline` so customers can subscribe by tag ("alert when ANY 'perimeter' camera offline")
8. **Document tags+description filter in Developer Portal API docs** — surface filter capability publicly
9. **Audit log per-field metadata changes** — track who changed tags/description and when (currently only full request snapshot, if anything)

## Open design questions (resolve in /gsd-discuss-phase)

- **Tag normalization:** lowercase on write OR `mode: 'insensitive'` on query? (affects display fidelity and uniqueness semantics)
- **Tag entity refactor:** stay with denormalized `String[]` OR introduce `Tag` table + many-to-many? Required if scope adds "Tag management page" (rename/merge/color) — currently NOT in scope but user may want it.
- **Bulk add/remove semantics:** append (union), replace (set), or both modes selectable in UI?
- **Scope cutoff:** user explicitly said "may want to drop some items" — confirm which of 9 stay.
- **Audit log integration point:** is there an existing audit log infra (Phase 18?) or does this require new infra? — needs check before scoping.
- **Webhook payload backwards compat:** if existing customers parse fixed payload shape, adding fields may break them — confirm whether webhook contract is versioned.

## Related phases

- Phase 19 — Camera input validation (touched create/bulk paths; safe to extend)
- Phase 20 — Cameras UX bulk actions (sub-item 6 extends this)
- Phase 21 — Hot-reload stream profile (unrelated; just current focus)
