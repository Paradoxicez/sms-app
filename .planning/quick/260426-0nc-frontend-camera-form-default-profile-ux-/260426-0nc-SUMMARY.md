---
phase: quick-260426-0nc
plan: 01
subsystem: web/admin/cameras
tags: [camera-form, stream-profile, ux, frontend, validation, empty-state]
dependency-graph:
  requires:
    - quick-260426-07r (backend default-profile semantic alignment)
  provides:
    - explicit-stream-profile-selection-ux
  affects:
    - apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog-push.spec.tsx
tech-stack:
  added:
    - next/link (already a project dep — first use in this file)
    - lucide-react Info icon (already a project dep — first use in this file)
  patterns:
    - "async-then-effect: pre-select after async fetch resolves via useEffect dep on the fetched array"
    - "empty-state callout pattern (amber) with CTA link replacing a misleading placeholder option"
    - "client-side required-field validation surfaced inline before server roundtrip"
key-files:
  created: []
  modified:
    - apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog-push.spec.tsx
decisions:
  - "Disable Save (not hide) when org has 0 profiles — keeps Cancel reachable and dialog layout stable"
  - "Empty-state link hardcoded to /app/stream-profiles — super-admin context not handled (super-admins rarely create cameras)"
  - "Pre-select effect lives in a separate useEffect (not inside the existing [open] effect) so it can react to the async stream-profiles fetch without re-firing the project/site setup logic"
  - "body.streamProfileId = streamProfileId || null UNCHANGED — the legacy edit path still passes null through to the backend, which 260426-07r now resolves to the org isDefault server-side"
metrics:
  duration: ~25 min
  completed: "2026-04-26"
  tasks: 1
  files: 3
  tests-added: 5
---

# Quick 260426-0nc: Frontend Camera Form Default Profile UX Summary

Explicit Stream Profile selection UX in the Add/Edit Camera dialog — replaces the hardcoded "Default" SelectItem footgun with a required field, auto-pre-select of the org's isDefault profile, an empty-state callout when the org has 0 profiles, and an amber warning for legacy edit-mode cameras with `streamProfileId === null`.

## What Changed

**1. StreamProfile interface extension** (`camera-form-dialog.tsx` line 41-45)
Added `isDefault: boolean` so the create-mode pre-select effect can locate the org default. The `/api/stream-profiles` endpoint already returns this field after 260426-07r, so no API contract change.

**2. Auto-pre-select in create mode** (new useEffect)
A new `useEffect` depending on `[open, camera, streamProfiles, streamProfileId]` fires after the async `/api/stream-profiles` fetch resolves and auto-selects the org's isDefault profile. Skipped when:
- dialog closed
- edit mode (existing init effect handles `camera.streamProfileId`)
- user already picked something
- org has 0 profiles (empty-state branch handles UI)

**3. Required-profile validation guard** (`handleSubmit`)
When the org has profiles but the user hasn't picked one, surface an inline `Please select a stream profile` error and bail before POSTing — friendlier than waiting for the backend's 409.

**4. Empty-state callout** (replaces Stream Profile Select when `streamProfiles.length === 0`)
Amber Info-icon callout with a `Create your first stream profile →` link to `/app/stream-profiles`. The Save button is disabled in this state via an extension to the `canSubmit` IIFE. The dialog layout stays stable (Cancel still works) — explicit decision over hiding the form region.

**5. Legacy-null edit warning** (above the Select in edit mode)
For legacy cameras with `streamProfileId === null`, render an amber `⚠ This camera has no profile assigned. Choose one to enable hot-reload.` paragraph above the Select. No auto-override of the user's empty state — they must explicitly pick.

**6. Hardcoded `<SelectItem value="">Default</SelectItem>` removed**
Trigger placeholder changed from `"Default"` to `"Select a stream profile"`. Body assembly (`body.streamProfileId = streamProfileId || null`) is **unchanged** — backend 260426-07r resolves null → org isDefault.

## Test Additions

Five new vitest+RTL test cases in a new `describe('CameraFormDialog Stream Profile selection — quick 260426-0nc', ...)` block at the bottom of `camera-form-dialog.test.tsx`:

| Case | Scenario |
|------|----------|
| (a) | Create mode + org has isDefault → trigger displays `Pull Default` (asserted on the last `[data-slot="select-value"]` to disambiguate from Project/Site selects) |
| (b) | Create mode + no isDefault + Save click → inline error, no POST (filter on `mock.calls`) |
| (c) | Create mode + 0 profiles → empty-state callout text, link href === `/app/stream-profiles`, Save disabled |
| (d) | Edit mode + camera has streamProfileId → pre-selects camera's profile, NOT org default |
| (e) | Edit mode + legacy `streamProfileId === null` → amber warning, no auto-select to org default |

Final result: **24/24 tests pass** across `camera-form-dialog.test.tsx` (18 tests) and `camera-form-dialog-push.spec.tsx` (6 tests). Full web suite: **510/511 pass** (1 unrelated pre-existing skip).

## Stub Updates Required in Pre-existing Tests

The hardcoded `Default` removal means orgs with empty `/api/stream-profiles` responses now hit the empty-state branch, which disables Save. The default `installDefaultApiMocks` stubs in both test files used to return `[]` for `/api/stream-profiles`, which would break every test that clicks Save.

Updated:
- `camera-form-dialog.test.tsx`: `installDefaultApiMocks` + the 409/500 inline mocks all return `[{ id: 'p1', name: 'Default', isDefault: true }]`
- `camera-form-dialog-push.spec.tsx`: same fix in `installDefaultApiMocks` (covers the two save-clicking tests `on push-mode save` and `Done on reveal triggers...`)

## Deviations from Plan

**[Rule 1 - Bug] Test (a) trigger assertion needed disambiguation**
- **Found during:** Task 1, GREEN phase
- **Issue:** `screen.getByText('Pull Default')` matched multiple DOM nodes — both the Stream Profile SelectValue trigger AND the SelectItem option text rendered in the closed Popup, causing `Found multiple elements` failure. A first-pass fix using `container.querySelector` failed because base-ui dialogs render via `data-base-ui-portal` outside the testing-library container root. A second pass using `document.querySelector('[data-slot="select-value"]')` returned the Project select's trigger (first in DOM order, displaying "Project 1") instead of the Stream Profile select.
- **Fix:** Use `document.querySelectorAll('[data-slot="select-value"]')` and assert against the last entry — the Stream Profile select is rendered last in the dialog form so it's the last `select-value` span in DOM order.
- **Files modified:** `camera-form-dialog.test.tsx` test (a) only
- **Commit:** included in 68e2a71

**[Rule 1 - Bug] Test (b) postCalls filter type signature**
- **Found during:** Task 1, post-GREEN tsc verification
- **Issue:** `vitest`'s `MockInstance.calls` is typed as `any[][]`, and the destructured-tuple parameter `([path, opts]: [unknown, unknown]) => boolean` failed `tsc --noEmit` because `any[]` is not assignable to a fixed-length 2-tuple.
- **Fix:** Replace tuple destructuring with index access (`call[0]`, `call[1]`) and let TypeScript infer.
- **Files modified:** `camera-form-dialog.test.tsx` test (b) only
- **Commit:** included in 68e2a71

No architectural deviations. No backend changes. No bulk-import-dialog changes.

## Known Minor Scope (Documented per plan)

- **Empty-state link is hardcoded** to `/app/stream-profiles` (tenant-app URL). Super-admin context (`/admin/...` routes) is not handled. Acceptable because super-admins rarely create cameras directly — they manage tenants, not camera config. If needed later, can be made context-aware via `usePathname()` or a prop.
- **No tooltip on disabled Save** when in empty-state — the callout itself explains the state, and disabled-button reasoning is inline.

## Follow-ups Deferred

Outside the scope of this quick task (per plan):
- **bulk-import-dialog parity** — has its own profile selection; user said separate task.
- **Stream Profiles page indicator** — Task C in user's larger plan, not this quick task.
- **Permission/role gating on the empty-state link** — assumes any user with Add Camera access has org-admin to create profiles.

## Verification

| Check | Result |
|-------|--------|
| `pnpm --filter @sms-platform/web test -- camera-form-dialog --run` | 24/24 pass |
| `pnpm --filter @sms-platform/web exec tsc --noEmit` | 0 errors |
| Full web suite `pnpm --filter @sms-platform/web test -- --run` | 510 pass, 1 unrelated skip |
| `grep -n "Default" camera-form-dialog.tsx` | Only matches in comments + `e.preventDefault()` — no SelectItem |
| `grep -n "isDefault" camera-form-dialog.tsx` | Matches in interface + useEffect comment + find predicate |

## Self-Check: PASSED

Files exist:
- FOUND: apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
- FOUND: apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog.test.tsx
- FOUND: apps/web/src/app/admin/cameras/components/__tests__/camera-form-dialog-push.spec.tsx

Commit exists:
- FOUND: 68e2a71 (feat(quick-260426-0nc-01): require explicit Stream Profile selection in camera form)
