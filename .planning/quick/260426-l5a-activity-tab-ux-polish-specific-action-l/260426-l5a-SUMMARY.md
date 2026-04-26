---
phase: 260426-l5a
plan: 01
subsystem: ui
tags: [audit-log, react, vitest, frontend-only, tanstack-table]

# Dependency graph
requires:
  - phase: ca55e22
    provides: Activity-tab URL composition fix that scopes audit-log to a single camera (resourceId param). This polish builds on that scoping.
provides:
  - Pure deriveActionLabel(entry) function with extensible Rule[] registry (11 mapping rules + fallback)
  - hideResourceColumn?: boolean prop on AuditLogDataTable
  - Specific Action verbs ("Started stream", "Renamed → \"X\"", "Toggled maintenance ON", …) in the camera Activity tab
affects: future audit polish plans, any future caller that wants per-camera audit views

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Rule[] registry pattern for extensible label derivation (first-match-wins, no switch fan-out)
    - Conditional column omission via spread-array (mirrors existing showOrganization pattern)

key-files:
  created:
    - apps/web/src/lib/audit/derive-action-label.ts
    - apps/web/src/lib/audit/__tests__/derive-action-label.test.ts
  modified:
    - apps/web/src/components/audit/audit-log-columns.tsx
    - apps/web/src/components/audit/audit-log-data-table.tsx
    - apps/web/src/components/audit/__tests__/audit-log-data-table.test.tsx
    - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx

key-decisions:
  - Mapped entries render plain text (no pill); unmapped fall back to existing color-coded pill so global / tenant audit-log pages remain visually unchanged
  - Filter on the underlying generic action verb (create/update/delete) so the existing Action faceted filter still works after the cell started rendering specific verbs
  - "Meaningful keys" allowlist for camera resource (name, streamProfileId, streamUrl, siteId, ingestMode, needsTranscode) disambiguates Rule 7 (rename) vs Rule 8 (profile change) vs Rule 9 (multi-field update)
  - UUID-shaped path segments collapse to `:id` so a single rule signature covers any camera ID

patterns-established:
  - "Pure deriver module per UI lib/<feature>: types + Rule[] registry + named exports, zero React/DOM imports — easy to unit test + reuse"
  - "Conditional column rendering: spread an array that is `[column]` or `[]` based on options flag, matching the existing showOrganization pattern in the same file"

requirements-completed:
  - L5A-01-action-label-deriver
  - L5A-02-hide-resource-column-prop
  - L5A-03-view-stream-wireup

# Metrics
duration: ~10min
completed: 2026-04-26
---

# Quick Task 260426-l5a: Activity Tab UX Polish Summary

**Replaced generic create/update/delete pill on the camera Activity tab with specific human-readable verbs derived from method+path+details, and hid the now-redundant Resource column on that single tab while leaving the global and tenant audit-log pages untouched.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-26T15:18Z
- **Completed:** 2026-04-26T15:28Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- New pure `deriveActionLabel(entry)` deriver with Rule[] registry (11 specific verbs + fallback)
- `hideResourceColumn?: boolean` prop wired through `AuditLogDataTable` → `createAuditLogColumns`
- Camera View Stream sheet's Activity tab now self-explanatory at a glance: specific verbs in the Action column, no Resource noise
- Global `/admin/audit-log` and tenant audit-log pages unchanged (Resource column visible, generic pill for unmapped entries)
- 13 deriver unit tests + 2 new RTL test cases (5 total in `audit-log-data-table.test.tsx`, 3 existing regression tests untouched)

## Task Commits

1. **Task 1: deriveActionLabel + unit tests** — `de5ad8a` (feat, TDD red→green)
2. **Task 2: Wire deriver + hideResourceColumn prop chain + RTL tests** — `00fc95e` (feat)
3. **Task 3: Final verification** — verification-only (typecheck + tests + build), no commit

## Files Created/Modified

- `apps/web/src/lib/audit/derive-action-label.ts` (new) — Pure `deriveActionLabel(entry)` + types + path-normalization helper + 11-rule registry. Zero React/DOM imports.
- `apps/web/src/lib/audit/__tests__/derive-action-label.test.ts` (new) — 13 Vitest cases covering every mapping rule, fallback, and URL normalization (trailing slash + query string).
- `apps/web/src/components/audit/audit-log-columns.tsx` — Action cell now calls `deriveActionLabel`. Mapped entries render plain text; unmapped fall back to the existing `ACTION_COLORS` pill. New `hideResourceColumn` option spreads the resource column conditionally (mirrors existing `showOrganization` pattern).
- `apps/web/src/components/audit/audit-log-data-table.tsx` — New optional `hideResourceColumn` prop, threaded into `createAuditLogColumns` and added to the `columns` `useMemo` deps.
- `apps/web/src/components/audit/__tests__/audit-log-data-table.test.tsx` — 2 new RTL cases (hides + sanity-default) using a shared `ONE_ROW` mock; 3 existing regression tests untouched.
- `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx` — Activity tab passes `hideResourceColumn` (single-line addition, line 329).

## Mapping Rules Registered

| # | Signature                                                  | Label                                       |
| - | ---------------------------------------------------------- | ------------------------------------------- |
| 1 | `POST /api/cameras/:id/start-stream`                       | "Started stream"                            |
| 2 | `POST /api/cameras/:id/stop-stream`                        | "Stopped stream"                            |
| 3 | `POST /api/cameras/:id/start-recording`                    | "Started recording"                         |
| 4 | `POST /api/cameras/:id/stop-recording`                     | "Stopped recording"                         |
| 5 | `PATCH /api/cameras/:id/maintenance` + `details.enabled=true`  | "Toggled maintenance ON"                |
| 6 | `PATCH /api/cameras/:id/maintenance` + `details.enabled=false` | "Toggled maintenance OFF"               |
| 7 | `PATCH /api/cameras/:id` + only `name`                     | `Renamed → "${details.name}"` (U+2192 arrow) |
| 8 | `PATCH /api/cameras/:id` + only `streamProfileId`          | "Changed stream profile"                    |
| 9 | `PATCH /api/cameras/:id` + ≥2 meaningful keys              | "Updated camera"                            |
| 10| `POST /api/cameras`                                        | "Created camera"                            |
| 11| `DELETE /api/cameras/:id`                                  | "Deleted"                                   |
| * | anything else                                              | `{ label: entry.action, fallback: true }` (existing pill) |

## Test Counts

- **Deriver tests** (`derive-action-label.test.ts`): 13/13 passing — one `it` per row in the rule table above.
- **Data-table tests** (`audit-log-data-table.test.tsx`): 5/5 passing — 3 existing regression + 2 new (`hides resource column`, `renders by default`).
- **Total touched in this plan:** 18 tests, all green.

## Verification Status

- `npx tsc --noEmit -p apps/web/tsconfig.json` — clean (no errors). The web package has no `typecheck` script, so direct `tsc --noEmit` was used in lieu of `pnpm --filter @sms-platform/web typecheck`.
- `pnpm --filter @sms-platform/web test -- --run audit-log-data-table derive-action-label` — 18/18 pass.
- `pnpm --filter @sms-platform/web build` — Next.js production build succeeded; route table includes audit-log pages unchanged.
- `git diff --stat HEAD~2 HEAD` — exactly the 6 files listed in `files_modified`. No bulk-import WIP files in the diff.
- `grep -rn "hideResourceColumn" apps/web/src` — matches only in `audit-log-columns.tsx`, `audit-log-data-table.tsx`, `audit-log-data-table.test.tsx`, `view-stream-sheet.tsx`. NOT in `audit-log/page.tsx` or `tenant-audit-log-page.tsx`.
- Thai-character scan on all 6 files: clean (English-only UI copy preserved).

## Decisions Made

- Mapped entries render plain text instead of the pill — keeps the camera Activity tab visually quiet (full sentences read better than a colored badge), but unmapped entries still get the pill so global / tenant audit-log pages look identical to before.
- Defined a `CAMERA_MEANINGFUL_KEYS` allowlist rather than counting `Object.keys(details)` — the audit interceptor body may carry housekeeping props, and the allowlist keeps Rule 7/8/9 disambiguation predictable.
- Kept `accessorKey: "action"` and the `filterFn` unchanged so the existing Create/Update/Delete faceted filter still works on the underlying action verb.
- Used `mockResolvedValue` (persistent) instead of `mockResolvedValueOnce` for the row fixture in the new RTL tests — the data-table's debounce effect can re-fetch shortly after mount, and a one-shot mock left subsequent calls returning empty rows.

## Deviations from Plan

**1. [Rule 3 — Blocking] No `typecheck` script on `@sms-platform/web`**
- **Found during:** Task 3 (Final verification)
- **Issue:** Plan called for `pnpm --filter @sms-platform/web typecheck`, but neither the package nor the workspace root defines a `typecheck` script. `pnpm run` returned: `None of the selected packages has a "typecheck" script`.
- **Fix:** Ran `npx tsc --noEmit -p apps/web/tsconfig.json` directly — `TypeScript: No errors found`. This is the same check the plan intended; only the script wrapper was missing.
- **Files modified:** None (verification-only)
- **Verification:** `tsc --noEmit` exits 0; production `next build` (which also typechecks) succeeded.
- **Committed in:** N/A (verification step, no source changes needed)

**Total deviations:** 1 (blocking — missing tooling alias). Did not affect implementation.
**Impact on plan:** None — equivalent typecheck performed via direct `tsc`.

## Issues Encountered

- First run of the new sanity test (`renders the Resource column by default`) failed because `mockResolvedValueOnce` only handled the first call; the data-table's debounce-driven re-fetch returned empty rows and the row never rendered. Switched to `mockResolvedValue` and used `screen.findByText("Created camera")` to wait for the row. Test passes.
- For the `hideResourceColumn={true}` case I initially used `findByText("cam-xyz")` to wait for the row — but `cam-xyz` is the resource cell, which is the very thing being hidden. Switched the wait target to the Action cell's derived text (`"Created camera"`) which proves the row rendered without depending on the hidden column.

## Confirmation: Out-of-Scope Files Untouched

- Bulk-import WIP files (cameras.service.ts, bulk-import.dto.ts, bulk-import.test.ts, bulk-import-dialog.tsx, bulk-import-dialog.test.tsx, bulk-import-camera-fields-dropped-EXAMPLE.csv): NOT in the staged diff. Verified via `git diff --stat HEAD~2 HEAD`.
- Backend audit code (`apps/api/src/audit/*`, `apps/api/src/prisma/schema.prisma`): NOT touched.
- `apps/web/src/app/admin/audit-log/page.tsx` (global audit-log): NOT touched. Resource column still visible there.
- `apps/web/src/components/pages/tenant-audit-log-page.tsx` (tenant audit-log): NOT touched. Resource column still visible there.
- `view-stream-sheet.test.tsx` and `view-stream-sheet-push.spec.tsx`: NOT modified — their existing AuditLogDataTable mocks absorb the new prop without change.

## User Setup Required

None — frontend-only change. No env vars, no migrations, no API restart, no `db:push`. The Next.js dev server picks up the changes automatically.

## Next Phase Readiness

- The deriver registry is open to extension: future plans can add rules for new resources (sites, projects, stream profiles) by appending to the `RULES` array — no caller changes required.
- The `hideResourceColumn` prop pattern is reusable: if a future single-resource detail page wants to embed `AuditLogDataTable`, it has a one-line opt-in.
- Manual smoke remains for the user post-merge: open the camera View Stream sheet → Activity tab; confirm Resource column is gone and Action cells show specific verbs. Open `/admin/audit-log`; confirm Resource column still visible and generic action pills still present.

## Self-Check: PASSED

- `apps/web/src/lib/audit/derive-action-label.ts` — FOUND
- `apps/web/src/lib/audit/__tests__/derive-action-label.test.ts` — FOUND
- `apps/web/src/components/audit/audit-log-columns.tsx` — FOUND (modified)
- `apps/web/src/components/audit/audit-log-data-table.tsx` — FOUND (modified)
- `apps/web/src/components/audit/__tests__/audit-log-data-table.test.tsx` — FOUND (modified)
- `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx` — FOUND (modified)
- Commit `de5ad8a` (Task 1) — FOUND
- Commit `00fc95e` (Task 2) — FOUND

---

*Quick task: 260426-l5a — Activity tab UX polish (specific Action labels + hidden Resource column on camera View Stream sheet)*
*Completed: 2026-04-26*
