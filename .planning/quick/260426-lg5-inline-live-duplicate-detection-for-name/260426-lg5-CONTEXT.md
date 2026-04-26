# Quick Task 260426-lg5: Inline live duplicate detection for Name and Stream URL - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Task Boundary

Add inline live duplicate detection (as user types) for the **Name** and **Stream URL** fields in BOTH camera-creation paths:

1. **Single-camera Add Camera dialog** (`apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx`)
2. **Bulk Import review dialog** (`apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx`)

Inline alerts appear at the field level — not toast — so the user gets immediate feedback before pressing Save / Confirm Import.

Stream URL already has a DB-level unique constraint (`@@unique([orgId, streamUrl])`). Name does NOT — adding it as part of this task.

</domain>

<decisions>
## Implementation Decisions

### Name uniqueness enforcement
- **DB-level unique constraint.** Add `@@unique([orgId, name])` to the `Camera` model in Prisma. Migrate so duplicate names are impossible at the DB level — frontend inline check is purely a UX enhancement on top, not the source of truth.
- Rationale: client checks are bypassable (clear cache, hit API directly). Real enforcement must be at DB. Streaming URL already has this; name should match.
- Pre-migration data audit: query existing cameras for duplicate-name conflicts within the same org. If conflicts exist, document them in the task summary and either (a) auto-rename one with a suffix `(2)`, (b) ask the user to resolve manually, or (c) skip the migration if any conflicts exist and surface them as a blocker. The planner decides the safest sequence — but DO NOT silently drop data.

### Detection strategy (frontend hint)
- **Fetch existing org cameras once on dialog open** → cache in component state → check each keystroke locally.
- Rationale: zero latency per keystroke, single API call per dialog session, no debounce needed. Backend enforcement covers the stale-cache case (DB unique catches anything client missed). User won't notice staleness in practice — dialog sessions are seconds, not minutes.
- Endpoint: reuse existing `/api/cameras` (already returns the org's camera list with `name` + `streamUrl`). No new endpoint required.

### Bulk Import against-DB duplicate flagging
- **Yes — fetch existing org cameras on Bulk Import dialog open** and extend `annotateDuplicates` to mark rows whose `streamUrl` already exists in DB as `duplicateReason: 'against-db'`.
- Rationale: user sees "Already exists in your account" badge per row BEFORE clicking Confirm — can edit/remove rows proactively. Without this, the only feedback is a post-confirm "skipped N duplicates" toast which doesn't tell them WHICH rows.
- Same pre-fetch as the single-camera dialog — share a hook (`useExistingCameras` or similar) if it keeps both files DRY.

### Visual treatment (Claude's Discretion)
- Field-level alert below the input: red border + small helper text. Match existing form-error styling (apps/web likely uses shadcn `<FormMessage>` or similar).
- Bulk-import row treatment: keep the same red-row pattern that within-file dedup already uses. Add a tooltip or distinct icon to differentiate `within-file` vs `against-db` reason if it doesn't add too much complexity.

### Case sensitivity for name match (Claude's Discretion)
- Default: case-INSENSITIVE comparison + trim whitespace. So "BKR01" and "bkr01" and " BKR01 " are all considered duplicates by the inline check. The DB unique constraint stays case-sensitive (Postgres default) — but the inline UX warning catches the user before they hit a confusing edge case where DB allows "bkr01" + "BKR01" as separate rows. If this conflicts with project conventions, planner can revise.

</decisions>

<specifics>
## Specific Ideas

- Fetch endpoint: existing `GET /api/cameras` returning array of `{ id, name, streamUrl, ... }`
- Backend dedup primitives already exist: `DuplicateStreamUrlError` (Phase 19 D-09), `@@unique([orgId, streamUrl])` constraint
- Within-file dedup already in `bulk-import-dialog.tsx` line ~270: `annotateDuplicates(rows)` — extend to take an `existingUrls: Set<string>` parameter
- Name uniqueness migration: standard `pnpm --filter @sms-platform/api db:push` flow per CLAUDE.md (push + generate + rebuild + restart)
- Pre-migration audit query: `SELECT "orgId", LOWER(name) AS lname, COUNT(*) FROM "Camera" GROUP BY "orgId", LOWER(name) HAVING COUNT(*) > 1` — surface any conflicts to the executor before migrate

</specifics>

<canonical_refs>
## Canonical References

- `apps/api/src/prisma/schema.prisma` — Camera model line ~225, current `@@unique([orgId, streamUrl])` at line 233
- `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx` — `annotateDuplicates` at line 270, `CameraRow.duplicateReason` at line 76 already typed as `'within-file' | 'against-db'` (the type exists but the 'against-db' branch is never written today — perfect drop-in target)
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` — single-camera form, target for inline check
- Phase 19 docs: `.planning/phases/19-*` — the original dedup work for context

</canonical_refs>
