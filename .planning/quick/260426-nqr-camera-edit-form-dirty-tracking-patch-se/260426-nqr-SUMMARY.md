---
phase: 260426-nqr
plan: 01
subsystem: web/cameras + web/audit
tags: [camera-edit, audit-log, activity-tab, dirty-tracking, frontend-only]
requires:
  - apps/api/src/cameras/dto/update-camera.dto.ts (UpdateCameraSchema, .strict())
  - apps/web/src/lib/api.ts (apiFetch)
provides:
  - Edit Camera form: PATCH body contains only changed keys
  - deriveActionLabel: 6 new single-field rules (tags, description, location, siteId, streamUrl, needsTranscode)
affects:
  - Activity tab Action labels for /api/cameras/:id PATCH entries
tech-stack:
  added: []
  patterns:
    - useRef snapshot for form-level dirty tracking (no react-hook-form migration)
    - Rule-registry single-key gate via meaningfulCameraKeys() allowlist
key-files:
  created: []
  modified:
    - apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx
    - apps/web/src/lib/audit/derive-action-label.ts
    - apps/web/src/lib/audit/__tests__/derive-action-label.test.ts
decisions:
  - Skipped needsTranscode dirty-tracking in the form (no UI control exists; CodecMismatchBanner owns that PATCH)
  - Extended CAMERA_MEANINGFUL_KEYS rather than building a parallel allowlist
metrics:
  duration: ~14 min
  completed: 2026-04-26
---

# Quick 260426-nqr: Camera Edit Form Dirty-Tracking PATCH + Single-field Audit Labels Summary

Frontend-only refactor that turns the Edit Camera dialog into a dirty-tracking PATCH submitter and extends `deriveActionLabel` so single-field camera updates get specific Activity-tab labels (Updated tags / description / location / stream URL / Moved to another site / Toggled auto-transcode ON|OFF) instead of the generic "Updated camera".

## Overview

The Edit Camera dialog previously sent the full body on every save (name, streamUrl, description, location, tags, streamProfileId, siteId), which meant the audit log always recorded every field — making the existing single-field rules in `deriveActionLabel` (Renamed, Changed stream profile from quick-260426-l5a) effectively dead code, since multi-field bodies always tripped the generic "Updated camera" fallback.

This plan threaded a `useRef` snapshot through the dialog so `handleSubmit`'s edit branch builds the PATCH body by diffing current state against the snapshot captured at open. Empty diff → silent close, no PATCH fires. Then it extended `CAMERA_MEANINGFUL_KEYS` with `tags`/`description`/`location` and registered six new single-field rules between the existing rule 8 (Change stream profile) and rule 9 (generic Updated camera). Multi-field PATCHes still resolve to the generic label.

## Files Changed

| Task | File | Commit | Lines |
|------|------|--------|-------|
| 1 (RED) | `apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx` | `ccb6e01` | +93 |
| 1 (GREEN) | `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` | `8336cf3` | +110 / −19 |
| 2 (RED) | `apps/web/src/lib/audit/__tests__/derive-action-label.test.ts` | `f71234d` | +105 |
| 2 (GREEN) | `apps/web/src/lib/audit/derive-action-label.ts` | `18dd74f` | +68 |

Total: **4 files, 376 insertions, 19 deletions** across 4 commits (TDD: 2 RED + 2 GREEN).

### Key changes

- `camera-form-dialog.tsx`:
  - New `initialValuesRef: useRef<{...} | null>` alongside `pendingSiteIdRef`.
  - Open-pre-fill `useEffect` captures the snapshot in edit mode and sets `null` in create mode.
  - `resetForm()` clears the snapshot so reopens re-snapshot.
  - `handleSubmit` edit branch: per-field diff (name, streamUrl pull-only, description with empty→null, tags with normalized array deep-equal, streamProfileId with empty→null, siteId, location with both-cleared→null + partial-fill skip). Empty body short-circuits to silent close. CREATE mode body construction extracted intact below the edit branch.
- `derive-action-label.ts`:
  - `CAMERA_MEANINGFUL_KEYS` extended with `tags`, `description`, `location`.
  - 6 new rules (8a-8f) inserted in registration order before the generic update rule 9.

## Test Counts

| Suite | Existing | New | Total | Status |
|-------|----------|-----|-------|--------|
| `camera-form-dialog.test.tsx` | 28 | 2 (dirty-tracking) | 30 | All passing |
| `derive-action-label.test.ts` | 13 | 8 (7 single-field + 1 multi-field guard) | 21 | All passing |
| **Combined scoped run (with deps)** | — | — | **51** | All passing |

## Verification

| Command | Exit | Result |
|---------|------|--------|
| `pnpm --filter @sms-platform/web test -- --run camera-form-dialog` | 0 | 30/30 pass |
| `pnpm --filter @sms-platform/web test -- --run derive-action-label` | 0 | 21/21 pass |
| `pnpm --filter @sms-platform/web test -- --run derive-action-label camera-form-dialog` | 0 | 51/51 pass (includes dependent suites) |
| `pnpm --filter @sms-platform/web build` | 0 | Next.js build clean (TypeScript clean) |

No backend changes → no `db:push`, no service restart required.

## Why It Matters

Before this plan, every Edit Camera save shipped all 7 form fields, so the audit log had no signal about what the user actually changed. The Activity tab on the View Stream sheet always rendered "Updated camera" even for trivial single-field edits like a rename or tag tweak.

With dirty-tracking in place:
- `Renamed → "X"` and `Changed stream profile` rules from quick-260426-l5a now actually fire (they were registered but never matched in practice).
- 6 new rules light up the Activity tab for tags / description / location / stream URL / site moves / auto-transcode toggles.
- Empty saves no longer hit the network at all (and don't pollute the audit log with no-op entries).

The `needsTranscode` rule is also covered — even though the Edit dialog has no UI for it, the CodecMismatchBanner flow elsewhere PATCHes `{ needsTranscode: bool }` to the same endpoint, and those entries will now get the specific toggle label.

## Deviations from Plan

None. The plan was followed exactly:
- Exact scope: 4 files, no react-hook-form migration, no backend changes, no touching the dirty bulk-import / API files.
- Exact rule order: 5 (maintenance ON), 6 (maintenance OFF), 7 (rename), 8 (change-profile), **8a-8f (new single-field)**, 9 (generic update), 10 (create), 11 (delete).
- Exact UI copy: English-only, verbatim from the plan ("Updated tags", "Moved to another site", "Toggled auto-transcode ON/OFF", etc.).
- `needsTranscode` was correctly skipped in the form dirty-tracker (no UI control) but added to the audit registry per plan note.
- TDD: each task RED-committed first then GREEN-committed.

## Self-Check: PASSED

Files exist:
- FOUND: `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx`
- FOUND: `apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx`
- FOUND: `apps/web/src/lib/audit/derive-action-label.ts`
- FOUND: `apps/web/src/lib/audit/__tests__/derive-action-label.test.ts`

Commits exist:
- FOUND: `ccb6e01` test(quick-260426-nqr): add failing dirty-tracking PATCH tests for Edit Camera form
- FOUND: `8336cf3` feat(quick-260426-nqr): dirty-tracking PATCH in Edit Camera form
- FOUND: `f71234d` test(quick-260426-nqr): add failing tests for 6 single-field deriveActionLabel rules
- FOUND: `18dd74f` feat(quick-260426-nqr): single-field deriveActionLabel rules for camera PATCH
