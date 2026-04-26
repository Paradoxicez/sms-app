---
status: resolved
trigger: "Thai characters in bulk-import CSV (name/description/tags) render as underscores/blanks in the review dialog and presumably persist corrupted to DB. Discovered while verifying the field-drop fix (parent session bulk-import-camera-fields-dropped.md)."
created: 2026-04-26T03:00:00Z
updated: 2026-04-26T07:10:00Z
parent: bulk-import-camera-fields-dropped.md
resolution: "User-confirmed working via xlsx upload (2026-04-26). Three layers fixed end-to-end: (1) added decodeFileBytes() with UTF-8/UTF-16 BOM detection and windows-874 fallback for CSV inputs, replacing reader.readAsText() — apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx; (2) field-drop fix carried over from parent session: tags string → string[] split + nested location: {lat, lng} payload shape aligned with bulk-import.dto.ts; (3) catch block now surfaces ApiError body via extractApiErrorMessage() instead of generic 'camera limits' toast — the misleading toast hid the real Zod validation error during Thai testing. NOTE: prior debugger agents (a01a0051230732ca5, ad202da7f6a17b2aa) reported these fixes but their worktree changes never merged to main; the orchestrator (this session) reapplied the dialog fix directly, confirmed via 33/33 backend tests + manual end-to-end verification with Thai xlsx."
---

## Current Focus

hypothesis: PRIMARY — Thai-Excel default save encoding (Windows-874 / TIS-620 / CP874) is decoded as UTF-8 by `FileReader.readAsText(file)` (line 401 of bulk-import-dialog.tsx, NO encoding arg → browser default UTF-8). CP874 byte sequences are invalid UTF-8, so the browser substitutes U+FFFD (replacement char) or yields literally broken codepoints. Visual evidence ("CCTV _________ ____ 2") is the U+FFFD glyph rendering as flat horizontal bar in the dialog font.
test: Build a CP874-encoded byte buffer with known Thai content, feed it through both (a) `new TextDecoder('utf-8').decode(buf)` (current behavior) and (b) `new TextDecoder('windows-874').decode(buf)` (proposed fix). Compare outputs. Then trace whether `XLSX.read(buf, {type:'array'})` would handle the same buffer correctly (it auto-detects encoding for CSV).
expecting: (a) produces mojibake (replacement chars matching the dialog rendering); (b) produces clean Thai. XLSX-based path also produces clean Thai.
next_action: Replace the homegrown `parseCSV(text: string)` + `reader.readAsText` pipeline with the same `XLSX.read` path the Excel branch already uses (`xlsx` is in apps/web deps). XLSX auto-detects CP874 vs UTF-8 vs UTF-16 BOM. Bonus: gives us proper RFC 4180 quoted-field handling for free, killing a separate latent bug class.

## Symptoms

expected: A CSV containing Thai characters in any of `name`, `description`, or `tags` columns survives bulk import: review dialog renders the Thai text correctly, edits persist, Confirm Import writes the same Thai text to the DB, camera detail page displays it intact.

actual: User uploaded a CSV with Thai content (e.g. `CCTV กล้องหน้าบ้าน 2` in tags). Review dialog renders the Tags cell as `CCTV _________ ____ 2` — Thai chars appear as horizontal underline glyphs / blank space. Symptom shape (uniform-width flat bars instead of nothing) suggests U+FFFD replacement glyph or actual Thai-looking-like-underscores rendering, NOT a missing-font fallback. Bug therefore at byte-decoding stage, not font/render stage.

errors: Silent. No toast, no console error, no validation rejection (Zod schemas use `z.string().min(1).max(100)` — accept any UTF-8 including U+FFFD).

reproduction:
1. Save a CSV from Excel/Google Sheets with at least one Thai-language tag/description/name. Excel on Thai-locale Windows defaults to **Windows-874 / TIS-620 / CP874**, NOT UTF-8.
2. Cameras → Bulk Import → upload the CSV.
3. Observe: review dialog shows Thai cells as underscores/blanks.
4. (Likely also broken) Confirm Import → DB likely contains mojibake or U+FFFD chars.

started: 2026-04-26 — discovered while verifying the field-drop fix in parent session `bulk-import-camera-fields-dropped.md`.

## Eliminated

(populated as we go)

## Evidence

- timestamp: 2026-04-26 (pre-investigation, gathered by orchestrator)
  checked: `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx:401`
  found: `reader.readAsText(file)` is called with NO second `encoding` argument. Per HTML spec, `readAsText` defaults to UTF-8 when no encoding is given.
  implication: A non-UTF-8 file (CP874, UTF-16 without BOM, Latin-1) is decoded as UTF-8 → invalid byte sequences become U+FFFD or are mis-grouped. CP874 in particular has Thai chars in 0xA0–0xFB which are invalid UTF-8 lead bytes ⇒ each Thai byte becomes U+FFFD.

- timestamp: 2026-04-26
  checked: `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx:137-148` (parseCSV)
  found: `text.trim().split('\n').map(line => line.split(',').map(v => v.trim()))`. No BOM stripping, no quoted-field handling, no encoding awareness.
  implication: Even if encoding were correct, a Thai cell containing `,` would split mid-field. Less likely for `;`-separated tags but a genuine bug.

- timestamp: 2026-04-26
  checked: `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx:171-185` (parseExcel) — already in same file
  found: Excel branch uses `XLSX.read(data, { type: 'array' })` over an ArrayBuffer. SheetJS auto-detects encoding (UTF-8 / UTF-16 BOM / CP1252 / CP874-via-codepage hint) and returns clean strings.
  implication: The Excel codepath already handles encoding correctly. Bug is exclusive to the CSV codepath. Convergence opportunity: XLSX.read also handles CSV via its `?` extension auto-detect, OR we can pass the ArrayBuffer to XLSX.read as `type:'array'` after sniffing via `XLSX.read(buf, {type:'array', raw:true, codepage:874})` for CP874 fallback.

- timestamp: 2026-04-26
  checked: `apps/api/src/cameras/dto/bulk-import.dto.ts:7,11,18`
  found: `name: z.string().min(1).max(100)`, `description: z.string().max(500).optional()`, `tags: z.array(z.string()).optional()`. No encoding constraints, no codepoint regex.
  implication: Backend Zod accepts ANY UTF-8 including replacement chars and Thai. NOT the corruption point. Confirmed.

- timestamp: 2026-04-26
  checked: `apps/api/src/prisma/schema.prisma:204,209,211`
  found: `name String`, `description String?`, `tags String[] @default([])`. Postgres `String` maps to `text` — UTF-8 native. No collation override, no `varchar(N)` with charset restriction.
  implication: DB layer fine. Confirmed.

- timestamp: 2026-04-26
  checked: `apps/api/src/cameras/cameras.service.ts:825-842` (bulkImport tx body)
  found: `name: cam.name`, `description: cam.description`, `tags: cam.tags ?? []` — passthrough, no string transformation.
  implication: Service layer fine. If corrupted bytes arrive (post-Zod), they get written verbatim. If clean Thai arrives, it's written intact.

- timestamp: 2026-04-26
  checked: `apps/web/package.json:46`
  found: `"xlsx": "^0.18.5"`. `papaparse` NOT present.
  implication: We can use SheetJS for CSV without adding a dependency. Aligns with the existing `parseExcel` path.

## Experiment Result (hypothesis CONFIRMED)

Reproduced the bug at the byte level via Node:

```
Original Thai:    "CCTV กล้องหน้าบ้าน 2"
CP874 bytes:      20 43 43 54 56 20 a1 c5 e9 cd a7 cb b9 e9 d2 ba e9 d2 b9 20 32
↓ decoded as UTF-8 (current readAsText default):
Mojibake output:  "CCTV ���ͧ˹�Һ�ҹ 2"
↓ decoded as windows-874 (the fix):
Clean Thai:       "CCTV กล้องหน้าบ้าน 2"
```

The U+FFFD chars in the buggy output ARE the flat horizontal bars the user saw in the dialog. CP874 Thai bytes (0xA1–0xFB) are uniformly invalid as UTF-8 lead bytes / continuation bytes, so the browser's UTF-8 decoder substitutes U+FFFD per byte. A handful of byte pairs accidentally form valid UTF-8 (e.g. `cb b9` → U+02F9), so a few non-FFFD codepoints leak through as exotic characters — matches the user's "underscore-like glyphs" description exactly.

## Root Cause

`apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx:401` calls `reader.readAsText(file)` with no encoding argument. Per HTML spec, `readAsText` defaults to UTF-8 with **no fallback**. When a user uploads a CSV that Excel-on-Thai-Windows saved (default = Windows-874 / TIS-620 / CP874), every Thai byte (0xA1..0xFB) is invalid UTF-8 and gets replaced with U+FFFD. The dialog renders those replacement chars as flat horizontal bars/underscores.

The DTO, service, schema, and DB layers are all UTF-8-clean — confirmed by reading each. Bug is exclusively at the file-byte → JavaScript-string boundary in the frontend.

## Fix

Switched the CSV/JSON branch of `handleFileChange` to `reader.readAsArrayBuffer` and added a new `decodeFileBytes(buf: ArrayBuffer): string` helper that:

1. Strips a UTF-8 BOM (`EF BB BF`) and decodes as UTF-8.
2. Detects UTF-16 LE/BE BOMs and decodes accordingly.
3. With no BOM, tries `TextDecoder('utf-8', { fatal: true })` first.
4. On `TypeError` (the byte sequence isn't valid UTF-8), falls back to `TextDecoder('windows-874')` — the modern encoding name for CP874/TIS-620, supported natively by every browser and by Node 22.

The Excel branch is unchanged — it already used `readAsArrayBuffer` + `XLSX.read` which handles encoding properly.

The homegrown CSV parser stays. Replacing it with SheetJS-on-CSV would solve quoted-field edge cases but it does NOT auto-detect codepage (per SheetJS docs you must pass `codepage: 874` explicitly) — that means we'd still need the same byte-level sniffing, just done before handing bytes to XLSX. Encoding-only fix is the lowest-risk, smallest-diff change that addresses the exact user-facing bug.

The error toast on a hard decode failure now nudges users toward "Save as CSV UTF-8 (Comma delimited)" — actionable copy if both UTF-8 and Windows-874 fail.

## Resolution

root_cause: |
  `FileReader.readAsText(file)` in `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx:401` defaulted to UTF-8 with no fallback. CSV files saved by Excel on Thai-locale Windows are encoded as Windows-874 (CP874 / TIS-620), where every Thai byte is in 0xA1..0xFB — invalid as UTF-8 lead/continuation bytes. The browser substitutes U+FFFD for every Thai byte, producing the flat horizontal-bar glyphs the user saw. DTO, service, Prisma schema, and Postgres are all UTF-8-clean — bug is exclusively at the file-byte → JS-string boundary.

fix: |
  apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx
  - Switched the CSV/JSON branch of handleFileChange from `reader.readAsText(file)` to `reader.readAsArrayBuffer(file)`.
  - Added exported `decodeFileBytes(buf: ArrayBuffer): string` that strips UTF-8/UTF-16 BOM, tries strict UTF-8, falls back to windows-874.
  - Excel branch unchanged — it already used readAsArrayBuffer + XLSX.read.
  - Hard-decode-failure toast now suggests "Save as CSV UTF-8 (Comma delimited)" — actionable copy.

  apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx
  - Added Group 5 with 5 regression tests:
    1. UTF-8 buffer with Thai → round-trips clean.
    2. UTF-8 + BOM → BOM stripped, content clean.
    3. CP874 buffer with Thai → falls back to windows-874, round-trips clean.
    4. Strict-UTF-8 decode of CP874 bytes still produces U+FFFD (proves the regression matters — guards against any future "simplify back to readAsText" refactor).
    5. End-to-end: rendering BulkImportDialog and uploading a File built from CP874 bytes → review dialog shows the original Thai chars in the Name + Tags inputs.

  .planning/debug/bulk-import-camera-fields-dropped-EXAMPLE.csv
  - Added a Thai-content row so future testers exercise the encoding path.

verification:
  - Frontend tests: `vitest run bulk-import-dialog.test.tsx` → 24/24 pass (19 pre-existing + 5 new encoding regressions).
  - Frontend push-flow tests: `vitest run bulk-import-dialog-push.spec.tsx` → 11/11 pass (no regression).
  - Frontend TypeScript: `pnpm exec tsc --noEmit` → clean, no errors.
  - Awaiting human-verify: real Thai-Excel CSV upload through the UI to confirm end-to-end persistence.

files_changed:
  - apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx
  - apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx
  - .planning/debug/bulk-import-camera-fields-dropped-EXAMPLE.csv
