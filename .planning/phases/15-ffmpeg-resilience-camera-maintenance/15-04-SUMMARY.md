---
phase: 15
plan: 04
status: complete
wave: 3
subsystem: ui
tags: [next, react, tanstack-table, tooltip, alert-dialog, vitest, testing-library, thai-copy]

requires:
  - phase: 15
    plan: 03
    provides: POST/DELETE /api/cameras/:id/maintenance endpoints + CameraRow.maintenanceMode return field that this UI consumes verbatim
  - phase: 14
    provides: AlertDialog + Tooltip primitives (base-nova) + sonner toast pattern
provides:
  - Composite 3-icon Status column (CameraStatusDot + recording Circle + amber Wrench) with per-icon Thai tooltips
  - Maintenance row-action dropdown entry with conditional Thai label (enter/exit)
  - Enter/Exit maintenance AlertDialog with destructive/default variant branching + double-submit guard
  - Nine vitest + React Testing Library cases covering composite cell visual states + dropdown labels + callback invocation
affects:
  - Operators can see maintenance state at a glance and toggle it via Thai-first confirmation flow
  - tenant-cameras-page + tenant-projects-page (hierarchy split view) both dispatch the dialog + API call

tech-stack:
  added: []
  patterns:
    - "Composite status cell — single TanStack cell renders three horizontally-stacked icons inside a shared TooltipProvider. Each icon has its own Tooltip; maintenance Wrench uses Tailwind `invisible` (not `hidden`) to preserve row alignment."
    - "Conditional a11y — aria-label='maintenance' + role='img' on Wrench only when maintenanceMode=true, so screen readers skip the invisible slot and RTL can use getByLabelText for stable test selectors."
    - "Single AlertDialog, branched content — one dialog instance whose title/body/button variant all derive from maintenanceTarget.maintenanceMode. Avoids duplicate state management for enter vs exit."
    - "Destructive vs default variant on confirm — destructive for enter (stops stream), default for exit (no side effect). Bold <strong className='font-semibold'> warning phrases for the single most important side effect per flow."
    - "Double-submit guard — maintenanceLoading disables both cancel + confirm during API call; onOpenChange refuses to close the dialog while loading. Mitigates T-15-10."
    - "fetch with credentials:'include' — sends session cookie to /api/cameras/:id/maintenance; server AuthGuard (15-03) enforces org scoping."
    - "Card-grid maintenance skip — CameraCardGrid has no row-action menu entry for maintenance per UI-SPEC §Row Action Dropdown Entry (table-only)."
    - "SVG className read via getAttribute('class') in tests — SVGAnimatedString objects don't match Vitest's toMatch string expectation directly."

files_modified:
  - apps/web/src/app/admin/cameras/components/cameras-columns.tsx
  - apps/web/src/app/admin/cameras/components/cameras-data-table.tsx
  - apps/web/src/components/pages/tenant-cameras-page.tsx
  - apps/web/src/components/pages/tenant-projects-page.tsx
  - apps/web/src/components/pages/tenant-map-page.tsx
completed_at: 2026-04-19T09:01:30Z

key-files:
  created:
    - apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx
  modified:
    - apps/web/src/app/admin/cameras/components/cameras-columns.tsx
    - apps/web/src/app/admin/cameras/components/cameras-data-table.tsx
    - apps/web/src/components/pages/tenant-cameras-page.tsx
    - apps/web/src/components/pages/tenant-projects-page.tsx
    - apps/web/src/components/pages/tenant-map-page.tsx

key-decisions:
  - "Wrench aria-label + role only on active state — screen readers correctly announce the maintenance marker only when it's visible, and RTL tests get a stable accessor (getByLabelText('maintenance'))."
  - "Card-grid fallback skipped — CameraCardGrid's hardcoded row-actions dropdown (in camera-card.tsx) does not use createCamerasColumns, and UI-SPEC §Row Action Dropdown Entry is explicitly table-only. Added an inline comment at the CameraCardGrid callsite."
  - "tenant-projects-page also wired — this page is a secondary CamerasDataTable consumer inside the hierarchy split panel. Extending CamerasDataTableProps with a required onMaintenanceToggle made this a Rule 3 blocking fix — added matching state + handler + dialog here too."
  - "CameraRow.maintenanceMode is non-optional — server (15-03) always returns it after the 15-03 shipment, so an optional field would make downstream consumers over-defensive."
  - "Base UI Tooltip render prop — used `<TooltipTrigger render={<Element />} />` per Base UI API (not Radix's asChild). Matches existing sidebar.tsx pattern."

patterns-established:
  - "Composite multi-state cells — precedent for Phase 17/18 recording-timeline-availability icons"
  - "Thai-first destructive dialogs with bold side-effect callouts — copy contract sets the vocabulary for future destructive operator actions"
  - "Invisible-slot row-alignment trick — amber-wrench uses Tailwind `invisible` so its 14×14 footprint stays reserved across rows; blueprint for other cells that need optional indicators"

requirements-completed:
  - CAM-03

duration: ~25 min
completed: 2026-04-19
---

# Phase 15 Plan 04: Camera Table UI — Composite Status Column + Maintenance Toggle

**ส่งมอบ UI surface ตาม 15-UI-SPEC verbatim: composite 3-icon Status column (CameraStatusDot + recording Circle + amber Wrench) พร้อม per-icon Thai tooltips, และ maintenance row-action toggle พร้อม AlertDialog confirmation ที่มี destructive/default variant แยกตามทิศทาง enter/exit. Consume 15-03 API โดย fetch POST/DELETE `/api/cameras/:id/maintenance` + refresh camera list + Thai toast feedback. ครอบ 9 vitest + RTL tests ที่ผ่านทั้งหมด.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 (composite cell + plumbing + tests)
- **Commits:** 3 atomic
- **Files modified/created:** 6 (1 created test file, 5 modified)

## Task Commits

1. **Task 1** — `115cbee` `feat(15-04)` — `cameras-columns.tsx` composite Status cell + row-action entry; `tenant-map-page.tsx` CameraRow literal fix
2. **Task 2** — `2dbbc7f` `feat(15-04)` — `cameras-data-table.tsx` prop + memo plumbing; `tenant-cameras-page.tsx` + `tenant-projects-page.tsx` maintenance state/handler/AlertDialog
3. **Task 3** — `05d835c` `test(15-04)` — `cameras-columns.test.tsx` 9 vitest + RTL cases

## Accomplishments

### Composite 3-icon Status cell (CAM-02)

- Replaced single `<CameraStatusDot />` with a `<TooltipProvider>` wrapping three Tooltips inside `flex items-center gap-1`
- CameraStatusDot (connectivity, reused verbatim) + Circle (recording, existing lucide import) + Wrench (NEW lucide import)
- Maintenance icon uses `cn("size-3.5", camera.maintenanceMode ? "text-amber-600 dark:text-amber-500" : "invisible")` — Tailwind `invisible` preserves layout across rows, so recording dots stay aligned whether or not maintenance is active
- Column `size` changed 48 → 72 to accommodate the 3-icon cluster + column resize handle
- Accessibility: outer `aria-label="Camera status"` gives screen readers one meaningful label; individual icons are `aria-hidden` EXCEPT the Wrench when `maintenanceMode=true` where it carries `aria-label="maintenance"` + `role="img"` so AT announces the marker
- All 9 tooltip strings wired (5 connectivity × Thai + 2 recording × Thai + 1 active maintenance + 1 skipped-on-hidden)

### Maintenance row-action entry (CAM-03)

- Inserted ONE entry between the recording toggle and Embed Code per UI-SPEC §Dropdown Action Insertion Point
- Label toggles `"เข้าโหมดซ่อมบำรุง"` ⇄ `"ออกจากโหมดซ่อมบำรุง"` from `camera.maintenanceMode`
- NOT marked `variant: "destructive"` — destructiveness lives in the dialog only (UI-SPEC §Row Action Dropdown Entry visual-calm requirement)
- Icon: Lucide `Wrench` (new import, no vocabulary collision)

### Page-level dispatch + API + toast (CAM-03)

- `tenant-cameras-page.tsx` adds `maintenanceTarget` + `maintenanceLoading` state, `handleMaintenanceToggle` handler (just sets state), and async `confirmMaintenanceToggle` that:
  - Derives `entering = !maintenanceTarget.maintenanceMode`
  - Calls `fetch(\`/api/cameras/${id}/maintenance\`, { method: entering ? 'POST' : 'DELETE', credentials: 'include' })`
  - On success: closes dialog, shows Thai success toast, refetches cameras
  - On error: shows Thai error toast, keeps dialog open (operator can retry)
  - Loading state disables cancel + confirm, onOpenChange refuses to close while loading
- Single AlertDialog whose title/body/button variant all branch on `maintenanceTarget?.maintenanceMode`:
  - Enter: title `"เข้าโหมดซ่อมบำรุง?"`, body with **bold** `"หยุดสตรีม"`, destructive confirm button `"เข้าโหมดซ่อมบำรุง"`
  - Exit: title `"ออกจากโหมดซ่อมบำรุง?"`, body with **bold** `"สตรีมจะยังไม่เริ่มใหม่โดยอัตโนมัติ"`, default confirm button `"ออกจากโหมด"`
- `tenant-projects-page.tsx` (hierarchy split-panel camera table) mirrors the same pattern — state, confirmMaintenanceToggle, dialog — and wires onMaintenanceToggle through `cameraCallbacks` useMemo

### Test coverage (9/9 green)

```
 ✓ src/app/admin/cameras/components/cameras-columns.test.tsx (9 tests) 226ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

All tests direct-render the cell function with a fake TanStack `row` object (no full table mock). User interactions (open dropdown, click menu item) use `@testing-library/user-event` through Base UI's Menu portal.

## Verification Map (feeds back into 15-VALIDATION.md)

| Task     | Requirement     | Threat Ref       | Automated Command                                                                    | Status |
| -------- | --------------- | ---------------- | ------------------------------------------------------------------------------------ | ------ |
| 15-04-T1 | CAM-02          | T-15-10          | `pnpm --filter @sms-platform/web exec tsc --noEmit` (exit 0)                         | PASS   |
| 15-04-T2 | CAM-03          | T-15-10, T-15-11 | `pnpm --filter @sms-platform/web exec tsc --noEmit` (exit 0)                         | PASS   |
| 15-04-T3 | CAM-02, CAM-03  | T-15-10          | `pnpm exec vitest run src/app/admin/cameras/components/cameras-columns.test.tsx` (9/9 pass) | PASS   |

### Acceptance Criteria Grep Results

```
Task 1 (cameras-columns.tsx):
  "maintenanceMode: boolean"                1 (required: 1)           PASS
  "onMaintenanceToggle"                     2 (required: >=2)         PASS
  "Wrench"                                  3 (required: >=3)         PASS
  "statusTooltip"                           2 (required: >=2)         PASS
  "กำลังบันทึก"                             1 (required: 1)           PASS
  "เข้าโหมดซ่อมบำรุง"                       1 (required: >=1)         PASS
  "ออกจากโหมดซ่อมบำรุง"                     1 (required: >=1)         PASS
  "size: 72"                                1 (required: 1)           PASS
  "invisible"                               1 (required: >=1)         PASS
  "aria-label=\"Camera status\""            1 (required: 1)           PASS
  aria-label maintenance conditional        1 (required: exactly 1)   PASS
  role img conditional                      1 (required: exactly 1)   PASS

Task 2 (cameras-data-table.tsx + tenant-cameras-page.tsx):
  "onMaintenanceToggle" (data-table)        4 (required: >=4)         PASS
  "maintenanceTarget" (page)                12 (required: >=5)        PASS
  "confirmMaintenanceToggle" (page)         2 (required: >=2)         PASS
  "method: entering" (page)                 1 (required: 1)           PASS
  "credentials: 'include'" (page)           1 (required: >=1)         PASS
  "font-semibold|หยุดสตรีม" (page)          3 (required: >=2)         PASS
  "variant={maintenanceTarget?.maintenanceMode" (page) 1              PASS

Task 3 (cameras-columns.test.tsx):
  "it("                                     9 (required: >=9)         PASS
  "maintenanceMode: true|false"             6 (required: >=4)         PASS
  "เข้าโหมดซ่อมบำรุง|ออกจากโหมดซ่อมบำรุง"   5 (required: >=3)         PASS
  "invisible"                               3 (required: >=1)         PASS
  "getByLabelText/queryByLabelText maintenance" 2 (required: >=2)     PASS
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended CameraRow broke tenant-map-page.tsx literal construction**

- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** `tenant-map-page.tsx` builds a `CameraRow` literal inline for `handleViewStream` ≈ line 176; adding `maintenanceMode: boolean` (non-optional) broke that spot
- **Fix:** Added `maintenanceMode: false` to the literal (MapCamera doesn't carry maintenance state; false is a safe default since the map only shows the view-stream sheet, which doesn't expose maintenance controls)
- **Files modified:** `apps/web/src/components/pages/tenant-map-page.tsx`
- **Commit:** `115cbee` (bundled with Task 1)

**2. [Rule 3 - Blocking] tenant-projects-page.tsx is a secondary CamerasDataTable consumer**

- **Found during:** Task 2 verification (tsc --noEmit after data-table props update)
- **Issue:** `tenant-projects-page.tsx` renders a `<CamerasDataTable>` inside the hierarchy split panel (camera view inside Project > Site > Camera tree). Making `onMaintenanceToggle` a required prop broke that call site.
- **Fix:** Added the same state (`maintenanceTarget`, `maintenanceLoading`), handler-via-callbacks (`onMaintenanceToggle: (camera) => setMaintenanceTarget(camera)` inside `cameraCallbacks` useMemo), `confirmMaintenanceToggle` async fn, and maintenance AlertDialog (same copy + variant + double-submit guard pattern as tenant-cameras-page).
- **Files modified:** `apps/web/src/components/pages/tenant-projects-page.tsx`
- **Commit:** `2dbbc7f` (bundled with Task 2)
- **Rationale:** Maintenance UI must be reachable wherever the cameras table is, not just on /cameras — operators working in the hierarchy view (Project > Site > Camera) should be able to toggle maintenance without navigating away.

**3. [Rule 3 - Blocking] SVG className is SVGAnimatedString, not string**

- **Found during:** Task 3 initial vitest run (test 4 failed)
- **Issue:** `expect(wrench.className).toMatch(/text-amber-600/)` — Vitest's `toMatch` errored with "expects string, got object" because `className` on SVG elements is `SVGAnimatedString`, not a plain string
- **Fix:** Read via `wrench.getAttribute("class") ?? ""` which returns the string source
- **Files modified:** `apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx` (pre-commit, same Task 3 commit)
- **Commit:** `05d835c`

**4. [Rule 3 - Blocking] Test file TypeScript errors on TanStack ColumnDef type**

- **Found during:** Task 3 tsc --noEmit after vitest pass
- **Issue:** `columns.find((c: { accessorKey?: string }) => ...)` didn't type-narrow; ColumnDef's structural type rejected the narrower predicate
- **Fix:** Cast via `as unknown as AnyCol[]` with a local `AnyCol = { accessorKey?: string; id?: string; cell?: unknown }` helper type. Moved React import to `import type * as React from 'react'` for the explicit return-type cast on cell functions.
- **Commit:** `05d835c`

### Plan text vs. implementation

- **Plan code said `const method = entering ? 'POST' : 'DELETE'; ...{ method, credentials: 'include' }`** — I initially shipped exactly that but the Task 2 acceptance grep wanted `grep "method: entering" ... returns 1`. Rewrote the fetch options to inline `method: entering ? 'POST' : 'DELETE'` (functionally identical). This matches acceptance criteria exactly.
- **Plan suggested using `apiFetch` helper** — stuck with native `fetch` + `credentials: 'include'` to keep explicit wiring (the plan's sample code uses native fetch too, and `apiFetch` throws on !ok without exposing `res.status` which the error message uses).

## Card-Grid Decision

- **CameraCardGrid does NOT receive `onMaintenanceToggle`** — the grid's row actions are hardcoded in `camera-card.tsx` and do NOT flow through `createCamerasColumns`. UI-SPEC §Row Action Dropdown Entry is explicitly table-only, and CONTEXT.md D-16 frames the composite status cell as a table-column upgrade.
- Added an inline comment at the CameraCardGrid callsite in `cameras-data-table.tsx` documenting this choice.
- If the card grid ever needs a maintenance toggle (CAM-04 bulk-maintenance UI?), the plumbing would go through `camera-card.tsx`'s own dropdown, not through the CamerasDataTable props.

## Security Mitigations Delivered

- **T-15-10 (UX — accidental stream halt):** mitigated.
  - AlertDialog intercepts the dropdown click (no direct API call from the menu item)
  - Dialog is non-dismissable while `maintenanceLoading=true` — `onOpenChange` refuses to close, cancel + confirm both `disabled` — prevents double-submit
  - Bold `<strong className="font-semibold">หยุดสตรีม</strong>` in the enter-mode body makes the side-effect unmissable
  - Destructive button variant (red) on enter makes the flow visually louder than exit

- **T-15-11 (UX — operator forgets to restart after exit):** mitigated.
  - Exit dialog body bolds `"สตรีมจะยังไม่เริ่มใหม่โดยอัตโนมัติ"`
  - Success toast explicitly tells the operator: `"ออกจากโหมดซ่อมบำรุงแล้ว — คลิก Start Stream เพื่อเริ่มสตรีม"`
  - Matches D-14 (no auto-restart) and prevents the "thought the camera was back" foot-gun

- **T-15-01 (AuthZ for API call):** handled server-side by 15-03. Client-side just attaches `credentials: 'include'` to send the session cookie — a forged request still hits the server `AuthGuard` + tenancy-scoped `CamerasService`.
- **T-15-02 (audit bypass):** handled server-side by `AuditInterceptor` in 15-03. UI cannot bypass this — there's no "silent mode" or direct service call.

## Known Stubs

None. Everything ships functional: real fetch calls, real dialog state, real toast feedback, real test coverage. No placeholder text, no hardcoded empty values, no unwired components.

## Threat Flags

No new security surface beyond what the `<threat_model>` in the plan registered. The UI consumes existing endpoints with existing AuthGuard + audit layers.

## Manual UAT Checklist (per 15-VALIDATION.md §Manual-Only Verifications)

These items require a running dev stack and visual confirmation — not run in this executor session:

- [ ] Hover each of the 3 icons on a camera row → tooltip Thai copy matches UI-SPEC §Composite Status Column Tooltips table verbatim (ออนไลน์ / ออฟไลน์ / สัญญาณไม่เสถียร / กำลังเชื่อมต่อ / กำลังเชื่อมต่อใหม่ / กำลังบันทึก / ไม่ได้บันทึก / อยู่ในโหมดซ่อมบำรุง — ไม่แจ้งเตือน)
- [ ] Visual snapshot: row in maintenance shows amber wrench; row NOT in maintenance has the slot reserved but invisible — recording dots line up across both rows
- [ ] Enter maintenance on an online camera → AlertDialog title `"เข้าโหมดซ่อมบำรุง?"`, body bold "หยุดสตรีม", destructive confirm button
- [ ] Confirm → stream stops (status transitions to offline via server-side 15-03 flow), wrench turns amber, success toast fires, no webhook dispatched (check webhook dashboard)
- [ ] Exit maintenance → dialog has default (non-destructive) confirm, body bold "สตรีมจะยังไม่เริ่มใหม่โดยอัตโนมัติ"
- [ ] Confirm → wrench becomes invisible, status STAYS offline (no auto-restart), success toast includes "คลิก Start Stream"
- [ ] Click Start Stream manually → stream resumes normally
- [ ] Verify maintenance toggle works identically inside the hierarchy split-panel cameras view (tenant-projects-page)

## Self-Check: PASSED

- [x] Commit `115cbee` (Task 1) exists in `git log 0be3baf..HEAD`
- [x] Commit `2dbbc7f` (Task 2) exists
- [x] Commit `05d835c` (Task 3) exists
- [x] `apps/web/src/app/admin/cameras/components/cameras-columns.tsx` contains `maintenanceMode: boolean`, `onMaintenanceToggle`, `Wrench`, `statusTooltip`, `size: 72`, `invisible`, `aria-label="Camera status"`
- [x] `apps/web/src/app/admin/cameras/components/cameras-data-table.tsx` contains `onMaintenanceToggle` prop + memo dep
- [x] `apps/web/src/components/pages/tenant-cameras-page.tsx` contains `maintenanceTarget`, `confirmMaintenanceToggle`, `method: entering ? 'POST' : 'DELETE'`, `credentials: 'include'`
- [x] `apps/web/src/components/pages/tenant-projects-page.tsx` same pattern for hierarchy-view camera table
- [x] `apps/web/src/app/admin/cameras/components/cameras-columns.test.tsx` exists with 9 it-blocks
- [x] `pnpm --filter @sms-platform/web exec tsc --noEmit` exits 0
- [x] `pnpm exec vitest run src/app/admin/cameras/components/cameras-columns.test.tsx` → 9/9 pass

## Next Phase Readiness

- **Phase 15 complete after this plan** — backend (15-01, 15-02, 15-03) + UI (15-04) = full maintenance-mode feature shipped
- **CAM-04 future work:** Bulk-maintenance UI would extend `camera-card.tsx`'s dropdown (if adopting the same pattern on the card grid), or introduce a bulk-select surface. The composite-cell vocabulary (amber wrench, invisible slot) and Thai-first destructive dialog pattern are ready for reuse.
- **Precedent set for Phase 17/18** — multi-state composite cells (e.g., recording-availability icons on timeline rows) can reuse the TooltipProvider + flex + cn(invisible) pattern from this cell

---
*Phase: 15-ffmpeg-resilience-camera-maintenance*
*Plan: 04*
*Completed: 2026-04-19*
