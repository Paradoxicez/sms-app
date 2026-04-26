---
status: resolved
trigger: "Bulk Import Camera silently drops fields (lat/long, tags, possibly more) entered in the import-review dialog — they don't persist to the Camera record visible on the camera detail page."
created: 2026-04-26T00:00:00Z
updated: 2026-04-26T03:05:00Z
followup: bulk-import-camera-thai-encoding.md
---

> **2026-04-26 update — field-drop fix CONFIRMED FIXED end-to-end by user.** While verifying, the user discovered a sibling bug: Thai characters in CSV uploads render as underscores/blanks in the review dialog. That investigation is tracked separately in `.planning/debug/bulk-import-camera-thai-encoding.md` (same file, same dialog, different layer — encoding mismatch in `FileReader.readAsText`).

## Current Focus

hypothesis: CONFIRMED — Bulk-import frontend sends `location: { lat, lng }` (matching single-camera shape) but the bulk-import Zod DTO expects flat `lat`/`lng` keys, so Zod silently strips `location` (default `.object()` strips unknown keys). Service then sees `cam.lat == null` → writes `location: undefined`. Tags also dropped via secondary mismatch (frontend sends string but uses `;` in sample CSV; service splits on `,`).
test: Read DTO schema + service mapping + frontend payload-builder side by side
expecting: Identify exact field-shape mismatch
next_action: Apply fix — align bulk-import DTO and service to the same shape the frontend (and single-camera DTO) already use: `location: {lat, lng}`, `tags: string[]`.

## Symptoms

expected: When the user opens the Cameras → Bulk Import flow, uploads a CSV, then edits a row in the review/edit dialog to add latitude/longitude or tags (or any non-required field), those values should be saved to the Camera record and visible on the camera detail page after import completes.

actual: After import, opening the imported camera's detail page shows lat/long/tags as empty/missing. The values entered in the review dialog appear lost. The import itself succeeds (camera is created) — only the optional fields are silently dropped.

errors: No error message. The save returns success. Data just doesn't make it to the DB row.

reproduction:
1) Cameras page → click Bulk Import
2) Upload a small CSV with required fields (name, RTSP url, etc.)
3) In the review dialog, manually edit a row to fill in latitude/longitude (and/or tags)
4) Click final Import/Save
5) Open the newly created camera's detail page → lat/long/tags are empty

started: User reports this just discovered while testing. Bulk import was introduced in Phase 19. Status of that phase is `complete` — so this is a regression/gap in shipped feature.

## Eliminated

- hypothesis: Prisma schema is missing fields
  evidence: `apps/api/src/prisma/schema.prisma:199-240` — Camera model has `description String?`, `location Json?`, `tags String[] @default([])`. All three fields exist.
  timestamp: 2026-04-26

- hypothesis: GET /api/cameras/:id strips location/tags
  evidence: `cameras.service.ts:280-294 findCameraById` returns the full row via `findUnique` without a `select` — Prisma defaults to all scalars. Serializer `serialize-camera.util.ts` only touches `streamKey`/`streamUrl` for masked perspective. Read path is intact.
  timestamp: 2026-04-26

- hypothesis: Single-camera Add path is broken
  evidence: `create-camera.dto.ts:14-20` accepts `location: {lat, lng}` and `tags: string[]` — matches what `camera-form-dialog.tsx:218-228` sends. Service `createCamera` (line ~117) maps `dto.location` and `dto.tags` correctly. Out of scope for this bug — the Add Camera path works.
  timestamp: 2026-04-26

## Evidence

- timestamp: 2026-04-26
  checked: `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx:449-471` (handleImport payload builder)
  found: Frontend builds `cameras[].location = { lat: Number(r.latitude), lng: Number(r.longitude) }` and `cameras[].tags = r.tags || undefined` (raw CSV string, NOT split). Sends siteId at top level.
  implication: Payload shape matches `CreateCameraSchema` (single-camera) but NOT `BulkImportCameraSchema`.

- timestamp: 2026-04-26
  checked: `apps/api/src/cameras/dto/bulk-import.dto.ts:5-58`
  found: `BulkImportCameraSchema` declares `lat: z.number().optional()`, `lng: z.number().optional()`, `tags: z.string().optional()`. NO `location` key. Default `z.object()` mode strips unknown keys.
  implication: When frontend sends `location: {lat, lng}`, Zod silently drops it. The parsed `cam` object has `cam.lat === undefined` and `cam.lng === undefined`.

- timestamp: 2026-04-26
  checked: `apps/api/src/cameras/cameras.service.ts:825-842` (bulkImport tx body)
  found: `location: cam.lat != null && cam.lng != null ? { lat: cam.lat, lng: cam.lng } : undefined`. Reads flat `cam.lat`/`cam.lng`. Tags: `cam.tags ? cam.tags.split(',').map((t) => t.trim()) : []`.
  implication: With `cam.lat == undefined` (post-Zod strip), the conditional always evaluates to undefined → location never written. Tags: when frontend forwards CSV cell verbatim and CSV uses `;` (per sample CSV line 253: "outdoor;entrance"), `split(',')` yields `["outdoor;entrance"]` — single tag containing semicolons (UX broken even if the DTO accepted it).

- timestamp: 2026-04-26
  checked: `apps/api/src/prisma/schema.prisma:199-240` Camera model
  found: Camera has `description String?`, `location Json?`, `tags String[] @default([])`. All target fields exist in the DB.
  implication: Schema is fine; bug is in the request/validation/service layer.

- timestamp: 2026-04-26
  checked: `apps/api/src/cameras/cameras.service.ts:280-294 findCameraById` and `cameras.controller.ts:209-218`
  found: `findCameraById` uses `findUnique({ where: { id }, include: { site: { include: { project: true } }, streamProfile: true } })`. No `select` clause means all scalars (location, tags, description) come back. `serializeCamera` doesn't touch them.
  implication: Read path returns location/tags/description correctly. Bug is purely write-side.

- timestamp: 2026-04-26
  checked: `apps/api/tests/cameras/bulk-import.test.ts:176-188`
  found: Existing CSV parse test only asserts `tags: 'entrance,outdoor'` is preserved as a string at the DTO layer. No test asserts that the SERVICE actually writes lat/lng/tags to the DB row.
  implication: Test coverage gap let the field-shape mismatch ship in Phase 19.

## Column Matrix (post-investigation, pre-fix)

| CSV header | Review-dialog field | Frontend payload key | DTO field | Prisma field | Status (pre-fix) | Where it dies |
|---|---|---|---|---|---|---|
| name | name (Input) | `name` | `name: z.string()` | `name String` | works | — |
| streamUrl / url | streamUrl (Input) | `streamUrl` | `streamUrl` | `streamUrl String` | works | — |
| ingestMode / mode | (cell-row metadata, not editable) | `ingestMode` | `ingestMode: z.enum([pull,push])` | `ingestMode String` | works | — |
| latitude / lat | latitude (Input) | `location.lat` (nested) | `lat: z.number().optional()` (FLAT) | `location Json?` | DROPPED | DTO strip @ `bulk-import.dto.ts:13` (Zod strips unknown `location` key, expected flat `lat`) |
| longitude / lng / lon | longitude (Input) | `location.lng` (nested) | `lng: z.number().optional()` (FLAT) | `location Json?` | DROPPED | DTO strip @ `bulk-import.dto.ts:14` (same as above) |
| tags | tags (Input) | `tags` (raw CSV-cell string) | `tags: z.string().optional()` | `tags String[]` | PARTIALLY BROKEN | DTO accepts but: (a) sample CSV uses `;` separator, service splits on `,` → single bogus tag; (b) shape mismatch with single-camera DTO `tags: string[]` |
| description | (NOT EDITABLE in review dialog — display-only via parser) | `description` (parsed from CSV) | `description: z.string().optional()` | `description String?` | works (if CSV has column) but no UI to edit |
| projectName | (none) | (not sent) | `projectName: z.string().optional()` (dead — siteId resolves project) | n/a | dead field | — |
| siteName | (none) | (not sent) | `siteName: z.string().optional()` (dead — siteId resolves site) | n/a | dead field | — |
| (no header) | thumbnail | (not collected by bulk import) | n/a | `thumbnail String?` | not in scope | — |
| (no header) | streamProfileId | (not collected by bulk import) | n/a | `streamProfileId String?` | not in scope (defaults to org default profile post-260426-29p) | — |

## Root Cause

**Two layers of breakage, both in the bulk-import write path:**

1. **DTO/payload field-shape mismatch (primary, silent):** Frontend `bulk-import-dialog.tsx:468-470` sends `location: { lat, lng }` (matching single-camera `CreateCameraSchema` shape from `create-camera.dto.ts:14-19`). Backend `BulkImportCameraSchema` (`bulk-import.dto.ts:13-14`) expects flat `lat: z.number()` and `lng: z.number()` keys. Zod's default `.object()` mode strips unknown keys (no `.passthrough()` configured), so `location` is silently dropped. The service (`cameras.service.ts:835`) then reads `cam.lat`/`cam.lng` which are `undefined`, and writes `location: undefined` to Prisma → DB row has NULL location. **No error surfaced anywhere — Zod thinks the row is valid because `lat`/`lng` are merely optional.**

2. **Tags shape + delimiter mismatch (secondary):** Frontend forwards the raw CSV-cell tags string (e.g. `"outdoor;entrance"`) as `tags: string`. Backend DTO accepts it as `string`. Service splits on `,`. But the frontend sample CSV uses `;` separators (line 253 of `bulk-import-dialog.tsx`). Result: a single tag `"outdoor;entrance"` instead of `["outdoor", "entrance"]`. The single-camera `CreateCameraSchema` uses `tags: z.array(z.string())` already — the bulk-import DTO is the inconsistent one.

**Why this shipped:** Test gap. `bulk-import.test.ts` only validated DTO acceptance of the FLAT `lat`/`lng` shape (`safeParse({ name, streamUrl, tags, description })` at line 178-184) — never an end-to-end POST → DB read assertion that the location/tags actually persisted. The frontend was written against the single-camera mental model (`location` object); backend DTO was written without consulting the single-camera shape.

## Fix Plan

**Approach: Align the bulk-import shape to the single-camera shape (the frontend is already correct).**

Why this direction (vs. fixing the frontend):
- Frontend matches the single-camera DTO — natural convergence
- Service doesn't need to maintain two different incoming shapes
- Sample CSV semantics stay user-friendly (one tag per cell, separator handled by frontend)

**Changes:**

1. `apps/api/src/cameras/dto/bulk-import.dto.ts`:
   - Replace flat `lat: z.number().optional()` + `lng: z.number().optional()` with nested `location: z.object({ lat: z.number(), lng: z.number() }).optional()`.
   - Change `tags: z.string().optional()` → `tags: z.array(z.string()).optional()`.
   - Drop dead fields `projectName` and `siteName` (no consumer).

2. `apps/api/src/cameras/cameras.service.ts:825-842` (bulkImport create body):
   - Replace `cam.lat != null && cam.lng != null ? { lat: cam.lat, lng: cam.lng } : undefined` with `cam.location ?? undefined`.
   - Replace `cam.tags ? cam.tags.split(',').map((t) => t.trim()) : []` with `cam.tags ?? []`.

3. `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx`:
   - Sample CSV uses `,` between tags? Actually the sample uses `;` for tag separation inside the cell. We need to (a) update the CSV parser to handle the tags cell — split on `;` or `,` — and (b) split tags client-side to `string[]` before POSTing. Since CSV cell values may contain commas natively (CSV column delimiter is also comma), `;` inside a single cell remains the simplest convention. Update the payload builder to:
     - `tags: r.tags ? r.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean) : undefined`
   - Keep sample CSV using `;` between tags (it's clearer in CSV cells where `,` is the column delimiter).

4. `apps/api/tests/cameras/bulk-import.test.ts`:
   - Update existing DTO test to use the new nested `location` + `tags: []` shape.
   - Add an end-to-end assertion: bulk-import a row WITH location + tags, then read it back via `findCameraById`, assert `location.lat`, `location.lng`, `tags` match input. This is the regression guard the original phase missed.

5. Frontend test `bulk-import-dialog.test.tsx`:
   - Add an assertion that the POST body for a row with lat/long contains `location: { lat: ..., lng: ... }` and tags as a `string[]`.

## Resolution

root_cause: Frontend `bulk-import-dialog.tsx` sends `location: { lat, lng }` (matching single-camera shape) but backend `BulkImportCameraSchema` (`bulk-import.dto.ts:13-14`) expects flat `lat`/`lng` keys → Zod silently strips the unknown `location` key → service `cameras.service.ts:835` reads `cam.lat == undefined` → writes `location: undefined` → DB row has NULL location. Tags also broken via shape mismatch (string vs string[]) and delimiter mismatch (sample uses `;`, service splits `,`).

fix: |
  Aligned the bulk-import shape to the single-camera shape (the frontend was already correct):

  1. apps/api/src/cameras/dto/bulk-import.dto.ts
     - Replaced flat `lat: z.number().optional()` + `lng: z.number().optional()` with nested `location: z.object({ lat: z.number(), lng: z.number() }).optional()` — same shape as `CreateCameraSchema`.
     - Changed `tags: z.string().optional()` → `tags: z.array(z.string()).optional()` — same shape as `CreateCameraSchema`.
     - Dropped dead fields `projectName` and `siteName` (no consumer; siteId resolves both).
     - Tightened `description` to `.max(500)` to match `CreateCameraSchema`.

  2. apps/api/src/cameras/cameras.service.ts (bulkImport tx body)
     - Replaced `cam.lat != null && cam.lng != null ? { lat: cam.lat, lng: cam.lng } : undefined` with `cam.location ?? undefined`.
     - Replaced `cam.tags ? cam.tags.split(',').map((t) => t.trim()) : []` with `cam.tags ?? []`.

  3. apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx (handleImport payload builder)
     - Split tags client-side with regex `/[,;]/` so the user can use either delimiter inside a single CSV cell — the wire payload is always `string[]`.
     - Use spread-conditional for `tags`/`description` so empty cells emit no key (cleaner backend payloads).
     - Continue sending nested `location: { lat, lng }` (already correct).

  4. apps/api/tests/cameras/bulk-import.test.ts
     - Updated the existing CSV-shape DTO test to use the new nested `location` + `tags: []` shape.
     - Added regression guard test asserting that the legacy flat `lat`/`lng` shape is silently stripped (proves the original bug condition is now harmless because no path produces it).
     - Added end-to-end persistence test: bulk-import a row with location + tags, read it back via Prisma, assert all three fields persist correctly. This is the regression guard the original phase missed.

  5. apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx
     - Added two regression tests: (a) row with lat/long/tags POSTs nested `location` and `tags: string[]` (NOT flat lat/lng); (b) row with no optional fields omits all three keys from the payload.

verification:
  - TypeScript: API compiles (only pre-existing unrelated errors remain — none in bulk-import.dto.ts, cameras.service.ts, or bulk-import-dialog.tsx). Frontend compiles cleanly with no errors.
  - API tests: `vitest run tests/cameras/bulk-import.test.ts` → 25/25 pass (including 2 new regression guards: legacy-shape-strip + end-to-end persistence).
  - API push-flow tests: `bulk-import-push-dto.test.ts` (4) + `bulk-import-push-service.test.ts` (4) → 8/8 pass (no regression).
  - Frontend tests: `vitest run bulk-import-dialog.test.tsx` → 19/19 pass (17 original + 2 new payload-shape guards).
  - Frontend push-flow tests: `bulk-import-dialog-push.spec.tsx` → 11/11 pass.
  - Awaiting human-verify: real CSV upload through the UI to confirm end-to-end persistence on the camera detail page.

files_changed:
  - apps/api/src/cameras/dto/bulk-import.dto.ts
  - apps/api/src/cameras/cameras.service.ts
  - apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx
  - apps/api/tests/cameras/bulk-import.test.ts
  - apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx
  - .planning/debug/bulk-import-camera-fields-dropped-EXAMPLE.csv (reference template)

## Working CSV Example

A complete, copy-pasteable template covering every supported column. Saved separately at `.planning/debug/bulk-import-camera-fields-dropped-EXAMPLE.csv`:

```csv
name,streamUrl,ingestMode,description,tags,latitude,longitude
Front Gate,rtsp://192.168.1.10:554/stream1,pull,Main entrance fish-eye camera,outdoor;entrance;hd,13.7563,100.5018
Back Yard,rtsp://192.168.1.11:554/stream1,pull,Backyard PTZ,outdoor;ptz,13.7564,100.5019
Lobby,rtmp://rtmp.example.com/live/lobby,pull,Reception area,indoor;hd,13.7565,100.5020
Loading Dock,srt://192.168.1.12:10080,pull,Service entrance,outdoor;loading,13.7566,100.5021
Conference Encoder,,push,Mobile encoder feed (URL generated on save),indoor;mobile,,
```

Notes for the user:
- Tags inside a cell are separated by `;` (semicolon). Comma also works (the parser accepts either) but `;` is recommended because comma is the CSV column separator and ambiguous if quoted incorrectly.
- For `ingestMode=push` rows, leave `streamUrl` empty AND leave `latitude`/`longitude` empty if you have no GPS — the trailing `,,` on the last row is intentional.
- All four protocols on the allowlist are demonstrated: `rtsp://`, `rtmp://`, `rtmps://` (omitted from sample but accepted), `srt://`.
- Header names are flexible: `lat` or `latitude`, `lng`/`lon`/`longitude`, `mode` or `ingestMode` — the parser normalizes them.
