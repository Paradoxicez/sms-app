---
status: resolved
trigger: "Cameras created via Bulk Import don't get the org's default Stream Profile assigned (DB row has streamProfileId = NULL)."
created: 2026-04-26T00:00:00Z
updated: 2026-04-26T07:37:00Z
resolution: "User-confirmed working 2026-04-26 after API restart loaded new build. Backend now resolves org isDefault profile once before the create loop and writes cam.streamProfileId ?? orgDefault?.id ?? null per row. DTO accepts optional per-row streamProfileId for future per-row overrides. 36/36 bulk-import tests pass + 3 new regression guards. Out-of-scope follow-ups: backfill existing null streamProfileId rows, frontend per-row picker."
---

## Current Focus

hypothesis: CONFIRMED. Fix applied + verified.
test: 36/36 bulk-import tests pass (3 new regression guards green); 141/141 cameras tests pass; SWC build clean.
expecting: User confirms in real workflow that bulk-imported cameras now show the org default profile in the Cameras table + detail page.
next_action: Await human-verify checkpoint response.

## Symptoms

expected: When the org has at least one Stream Profile flagged isDefault=true, every camera created — bulk import or single — should land in DB with streamProfileId = orgDefault.id.
actual: Bulk-imported cameras have streamProfileId = NULL. Single-camera path works (frontend pre-selects + backend writes verbatim).
errors: None. Silent semantic gap. Playback may still resolve via runtime fallback in PoliciesService.resolve.
reproduction: Bulk Import a CSV with no streamProfileId column → camera detail shows blank Stream Profile field; DB row has streamProfileId = NULL.
started: Phase 19 (when bulk import wired up). Surfaced 2026-04-26 after default-indicator work (quick-260426-29p).

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-26T00:01:00Z
  checked: apps/api/src/cameras/cameras.service.ts lines 825-839 (bulkImport tx.camera.create payload)
  found: Payload includes orgId, siteId, name, streamUrl, ingestMode, streamKey, description, location, tags, status, needsTranscode. **No streamProfileId.** Zod-stripped DTO would have nowhere to put it anyway.
  implication: Bulk-imported cameras land in DB with streamProfileId column at default null.

- timestamp: 2026-04-26T00:01:30Z
  checked: apps/api/src/cameras/cameras.service.ts line 189 (createCamera)
  found: `streamProfileId: dto.streamProfileId` — single-camera path writes verbatim from DTO.
  implication: Asymmetry confirmed. Single-camera works because frontend (camera-form.tsx, quick-260426-0nc) pre-selects org default and POSTs it; bulk import has no equivalent.

- timestamp: 2026-04-26T00:02:00Z
  checked: apps/api/src/cameras/dto/bulk-import.dto.ts (BulkImportCameraSchema)
  found: Fields: name, ingestMode, streamUrl, description, location, tags. No streamProfileId, no thumbnail. Compare create-camera.dto.ts:22 which has `streamProfileId: z.string().uuid().optional()`.
  implication: To accept per-row override (symmetry with single-camera), DTO must add the same optional field.

- timestamp: 2026-04-26T00:02:30Z
  checked: apps/api/src/prisma/schema.prisma lines 199-240 (Camera model)
  found: `streamProfileId String?` optional. FK `streamProfile StreamProfile? @relation(... onDelete: SetNull)`. No DB default on streamProfileId — bare null when not supplied.
  implication: Schema supports null (matches the runtime fallback contract). Setting it from the org default is purely an application-layer concern; no migration needed.

- timestamp: 2026-04-26T00:03:00Z
  checked: apps/api/src/prisma/schema.prisma lines 242-260 (StreamProfile model)
  found: `isDefault Boolean @default(false)`, `@@index([orgId])`. No `@@unique([orgId, isDefault])` constraint, but quick-260426-29p auto-marks the first profile per org. `findFirst({ where: { orgId, isDefault: true } })` is the canonical lookup pattern.
  implication: Single Prisma query before the create loop is sufficient — N+1 avoided.

- timestamp: 2026-04-26T00:03:30Z
  checked: apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx lines 553-569 (payload assembly)
  found: Payload omits streamProfileId entirely. Frontend never sends it from bulk import. Constraint says backend-resolution is preferred and frontend stays unchanged — confirmed correct decision.
  implication: No frontend change needed. Backend resolves the default; frontend can override per-row in the future via DTO field if a CSV column is added.

## Resolution

root_cause: bulkImport's tx.camera.create payload (apps/api/src/cameras/cameras.service.ts:825-839) does not include streamProfileId — neither from the row's DTO (which has no such field per bulk-import.dto.ts) nor from the org's isDefault profile. The single-camera path (createCamera, line 189) writes it verbatim because the frontend `camera-form.tsx` pre-selects the org's default before POST. The two paths drifted: the single-camera path was patched at the FRONTEND (quick-260426-0nc), the bulk-import path was never patched at all.
fix: (1) Extended `BulkImportCameraSchema` with `streamProfileId: z.string().uuid().optional()` for symmetry with single-camera DTO. (2) In `bulkImport`, after the site-exists check and before the create loop, resolved `orgDefaultProfile = await this.tenancy.streamProfile.findFirst({ where: { orgId, isDefault: true }, select: { id: true } })` once (single round-trip, reused per row). (3) In the per-row create payload, write `streamProfileId: cam.streamProfileId ?? orgDefaultProfile?.id ?? null`. Per-row override wins, then org default, then null. Null does not throw — runtime fallback in PoliciesService.resolve handles playback. (4) Added 3 regression tests in apps/api/tests/cameras/bulk-import.test.ts. (5) Updated 2 sibling tests' tenancy mocks to include `streamProfile.findFirst` so they don't blow up on the new lookup.
verification:
  - SWC build: clean (162 files compiled, no TypeScript errors).
  - bulk-import tests: 36/36 pass (3 new regression guards: org-default assignment, per-row override wins, null-when-no-default-no-throw).
  - cameras suite: 141/141 pass — no regressions.
  - git status confirms all 4 changed files present in parent worktree.
  - Awaiting human-verify: real-flow Bulk Import smoke test (Org Admin → Cameras → Bulk Import → upload CSV → confirm camera detail shows org default profile name).
files_changed:
  - apps/api/src/cameras/dto/bulk-import.dto.ts
  - apps/api/src/cameras/cameras.service.ts
  - apps/api/tests/cameras/bulk-import.test.ts
  - apps/api/tests/cameras/bulk-import-push-service.test.ts
