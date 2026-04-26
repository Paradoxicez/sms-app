# Quick 260426-lg5: Inline duplicate detection — SUMMARY

**Status:** Done — user-verified 2026-04-26

## What shipped

### Backend (DB-level enforcement)
- `apps/api/src/prisma/schema.prisma` — added `@@unique([orgId, name])` on Camera (parallel to existing `@@unique([orgId, streamUrl])`).
- `apps/api/src/cameras/errors/duplicate-camera-name.error.ts` — new error class mirroring `DuplicateStreamUrlError`.
- `apps/api/src/cameras/cameras.service.ts` — P2002 catch in `createCamera` + `bulkImport` translates the new constraint to `DuplicateCameraNameError` → HTTP 409 + code `DUPLICATE_CAMERA_NAME`.
- Pre-migration audit confirmed zero conflicts; `db:push` ran clean.

### Frontend — single-camera Add Camera dialog
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` — fetch `/api/cameras` on dialog open, cache in state, check Name (case-insensitive trim, exclude self in edit mode) and Stream URL (exact match) per keystroke. Inline red alert under the field + Save disabled. 409 race path falls back to bottom error slot.

### Frontend — Bulk Import dialog (audited + redesigned per user feedback)
First pass (executor):
- `existingUrls` Set fetched on dialog open.
- `annotateDuplicates(rows, existingUrls?)` flags `duplicateReason: 'against-db'` when streamUrl matches DB.
- Initial visual: amber `Copy` icon in Status column with tooltip.

Second pass (orchestrator, after user feedback "0 valid, 7 duplicate locked me out"):
- **Bug fix**: `useEffect` on dialog open replaces racing `loadSites()` call inside `processRows`. Annotation no longer runs with empty Set.
- **Re-annotate `useEffect`** on `existingUrls` / `existingNames` change so flags appear without re-upload (slow-network race).
- **Name dedup symmetry**: cache `existingNames: Set<string>` (lowercase trimmed). Extended `annotateDuplicates(rows, existingUrls?, existingNames?)` returns `duplicateField: 'name' | 'streamUrl' | 'both' | 'within-file'`.
- **Per-row visual** matching single-camera form:
  - Conflicting cell gets `border-amber-500` (Name and/or Stream URL).
  - Status column shows text pill: `New` (green), `Name in DB` / `URL in DB` / `Already in DB` / `Duplicate row` (amber), `Error` (red).
- **Bottom summary** language: "X new" / "Y already in DB" / empty-state hint "All rows already exist — nothing new to import".
- **Footer button** smarter:
  - `validCount > 0` → `Confirm Import (N)` (counter shows what will actually import).
  - `validCount === 0 && duplicateCount > 0` → button morphs to `Close` (no API call — backend skip would be a no-op).

## Why this matters

Original "0 valid, 7 duplicate" + disabled Confirm Import felt broken — user couldn't proceed and the icon-only status didn't communicate cause. New design:
1. Icon → labeled pill with explicit reason.
2. Conflicting cell highlighted (consistent with single-camera form).
3. Friendlier exit path when nothing's importable.

## Files changed (in this task)

- `apps/api/src/prisma/schema.prisma`
- `apps/api/src/cameras/errors/duplicate-camera-name.error.ts` (new)
- `apps/api/src/cameras/cameras.service.ts`
- `apps/api/tests/cameras/camera-crud.test.ts`
- `apps/api/tests/cameras/bulk-import.test.ts`
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx`
- `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx`
- `apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx`
- `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx`

## Out of scope (flagged for follow-up)

- Add `existingNames` to bulk-import test fixtures (current tests cover URL path only).
- Extend single-camera form's Stream URL field to also detect within-current-form race when user opens 2 tabs (low priority — backend 409 already covers).

## Lessons captured to project memory

- Per `feedback_verify_subagent_writes`: the executor's first pass landed code, but the visual-design layer didn't match user expectation until a second iteration — keep the orchestrator close to the visual review loop, not just the file-write verification.
