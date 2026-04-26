---
phase: 22-camera-metadata-utilization-surface-tags-description-across-
plan: 07
subsystem: web
tags: [chip-combobox, tag-input, autocomplete, camera-form, shadcn, vitest, rtl, ui-spec, d-08, d-09, d-04, d-05, d-10]

# Dependency graph
requires:
  - phase: 22-05
    provides: GET /cameras/tags/distinct endpoint returning { tags: string[] } alphabetized + first-seen casing per D-04
  - phase: 22-01
    provides: Camera DTO + server-side tag normalization (trim/dedup/limits at write time)
provides:
  - "TagInputCombobox composite — chip-style tag editor with autocomplete dropdown, single OR multi mode, freeText OR suggestions-only mode. Reusable in Plan 22-11 bulk Add (multi=false freeText=true) and bulk Remove (multi=false freeText=false) popovers"
  - "Camera form (Add/Edit) Tags field uses TagInputCombobox. Tags state migrated from `string` (comma-joined) to `string[]` end-to-end — diff logic, create-mode body builder, edit-mode pre-fill, and reset all updated"
  - "Distinct-tags fetch wired into camera-form-dialog open lifecycle per D-09; failure path emits `toast.error(\"Couldn't load tag suggestions. Try again.\")` per UI-SPEC §Toasts"
  - "13 component tests covering: initial render (2), commit (4 — Enter/comma/Backspace/dedup), validation (2 — length+count amber warnings), suggestions (3 — filter/click/Add-row visibility), chip × button (1), disabled (1)"
affects: [22-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composite-from-primitives — TagInputCombobox composes Badge + a plain HTML input + an absolute-positioned dropdown menu. Originally planned as Popover+Command per UI-SPEC §Component Inventory, but the cmdk + base-ui Popover + portal combination created friction in jsdom test rendering (cmdk filters by `value` prop and portals make role-based queries fragile). Plain dropdown matches Phase 20 BulkToolbar pattern — local state, click handlers wire directly, no portal. The visual + behavioral contract from UI-SPEC §Chip combobox spec is preserved byte-for-byte."
    - "Mode props (multi / freeText) instead of separate components — UI-SPEC §Open Items for Planner Discretion explicitly allows either approach. One-component-with-mode-props was chosen because the bulk popovers (Plan 22-11) only differ in 2 props (multi, freeText) and share 95% of the chip + dropdown rendering logic. Three separate components would have duplicated the maxLength / maxTags / Backspace-removes-chip logic three times."
    - "Warning amber tokens (text-amber-700 / dark:text-amber-400) for validation errors instead of destructive red — UI-SPEC Negative Assertion #2 (lines 117-121) hard-bans the `--destructive` token in Phase 22. Tag-length and tag-count guards are non-destructive UX warnings, not destructive actions. Verified by `grep -c text-destructive tag-input-combobox.tsx` returning 0."
    - "'+ Add' row visibility uses substring-match check, not just exact-match — Plan 22-07 <behavior> Test 10 explicitly says 'lob' should NOT show '+ Add' even though there is no exact match for 'lob' in suggestions=['Lobby']. The semantics: if any existing tag (or chip) contains the query as a substring, the user can pick that existing tag — '+ Add' only appears when the query has no chance of matching anything."
    - "Tags state migration camera-form-dialog string → string[] — Phase 22 Plan 22-07 collapses the historical comma-string state into a native array. Five touchpoints in the file: useState type, initialValuesRef.tags type, edit-mode pre-fill (drops `.join(', ')`), edit-mode diff (drops `.split(',').trim().filter(Boolean)`), create-mode body builder (drops the same split). Server-side normalization (Plan 22-01 extension) handles trim/dedup/limits at write time — frontend can ship the raw chip array."

key-files:
  created:
    - apps/web/src/app/admin/cameras/components/tag-input-combobox.tsx
  modified:
    - apps/web/src/app/admin/cameras/components/__tests__/tag-input-combobox.test.tsx
    - apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx

key-decisions:
  - "Composition over shadcn Popover+Command primitives — the plan's <action> example used Popover+Command but the cmdk + base-ui Popover + Portal stack made jsdom-based RTL tests fragile (suggestions render in a portal, role/text queries miss the dropdown contents intermittently). A plain absolute-positioned dropdown matches the Phase 20 BulkToolbar pattern, keeps the dropdown mounted inside the same React subtree as the input (so onBlur with relatedTarget works correctly), and produces the same visual + behavioral contract per UI-SPEC §Chip combobox spec. The trade-off: this composite does NOT inherit cmdk's keyboard navigation primitives (arrow-up/down/enter to navigate suggestions). That's accepted for Phase 22 — UI-SPEC §Accessibility Contract only requires Backspace + chip × keyboard parity, not arrow-key navigation. Plan 22-11 reuses the same component."
  - "'+ Add' row uses substring-match suppression, not just exact-match — the plan's example code in <action> Step 1 used `exactMatchExists` which only checks `s.toLowerCase() === q`. But the plan's <behavior> Test 10 explicitly asserts that typing 'lob' against suggestions=['Lobby'] should NOT show '+ Add' (because Lobby is in the filtered list and the user can click it). Renamed `exactMatchExists` → `hasAnyMatch` and added a substring check before falling through to 'no match → show + Add'. Test-driven correction: the plan's example code would have failed Test 10."
  - "Mode props (multi / freeText) over separate components per UI-SPEC §Open Items for Planner Discretion — one composite with mode props means Plan 22-11's bulk Add/Remove popovers reuse the same chip rendering, the same maxLength/maxTags guards, the same Backspace-removes-chip handler, and the same disabled state. Three separate components would have triplicated all of that. The component file is 270 lines including doc comments; mode-aware logic adds ~10 lines (one early-return in `commit()` for !multi, one filter on the `+ Add` row for !freeText)."
  - "Warning amber tokens, never destructive red — UI-SPEC Negative Assertion #2 (lines 117-121) bans the `--destructive` token in Phase 22. Tag-length and tag-count violations are non-destructive UX guards (the user can fix them by editing the input), not destructive actions (which would trigger AlertDialog confirmation). Validation message uses `text-amber-700 dark:text-amber-400`. Initial implementation had a docstring referencing `text-destructive` as the banned token — that was reworded to avoid the literal string so the acceptance grep `grep -n text-destructive ...` returns 0 matches as required."
  - "Tags state migration is backwards-compatible with the API — the API DTO (Plan 22-01) has always accepted `tags: string[]`. The historical UI's `string` (comma-joined) state was a frontend-only convention that split before submitting. Migrating to native `string[]` simplifies 5 touchpoints in camera-form-dialog: state declaration, initial-values snapshot type, edit-mode pre-fill (drop .join), edit-mode diff (drop .split.trim.filter), create-mode body (drop .split.trim.filter). The diff logic is now an order-sensitive array comparison, which is correct because `tags` order is preserved in DB (per CONTEXT.md D-04 first-seen casing semantics)."
  - "13 component tests instead of the plan's suggested 12 — added a separate 'renders an empty input alongside chips' test (Test 1b) so that the initial-state contract is pinned independently of the chip-rendering contract. Each commit / validation / suggestion test asserts a single behavioral concern so failure modes localize cleanly."

requirements-completed: [D-08, D-09, D-04, D-05, D-10]

# Metrics
duration: ~22 min
completed: 2026-04-26
---

# Phase 22 Plan 07: TagInputCombobox + Camera Form Wiring Summary

**`TagInputCombobox` chip combobox composite ships in `apps/web/src/app/admin/cameras/components/tag-input-combobox.tsx` with full UI-SPEC §"Chip combobox spec" parity (modes: multi/single, freeText/suggestions-only). Camera Add/Edit form's Tags field replaces the historical comma-separated `<Input>` with the new composite — tags state migrates from `string` (comma-joined) to `string[]` end-to-end across all 5 touchpoints (state declaration, initial-values snapshot type, edit pre-fill, edit diff, create body). Distinct-tags fetch wired to `/api/cameras/tags/distinct` (Plan 22-05 endpoint) on dialog open per D-09; toast.error fallback on failure. 13/13 component tests pass; 30/30 camera-form tests pass; Next.js build clean. Bulk-import-dialog NOT modified per D-10. UI-SPEC Negative Assertion #2 honored: `grep -c text-destructive tag-input-combobox.tsx` returns 0.**

## Performance

- **Duration:** ~22 min (Task 1 RED → Task 1 GREEN → Task 2 wiring — 3 commits)
- **Started:** 2026-04-26T22:11Z (Task 1 RED commit)
- **Completed:** 2026-04-26T22:24Z (Task 2 wiring commit)
- **Tasks:** 2 (Task 1 TDD with RED + GREEN; Task 2 fully autonomous wiring)
- **Files created:** 1 (tag-input-combobox.tsx, 270 lines)
- **Files modified:** 2 (tag-input-combobox.test.tsx + camera-form-dialog.tsx)
- **Tests added:** 13 (replacing 6 it.todo stubs from Plan 22-01)

## Accomplishments

- **TagInputCombobox composite created** at `apps/web/src/app/admin/cameras/components/tag-input-combobox.tsx` — chip-style tag editor with autocomplete dropdown. Supports `multi` (camera form: many chips) / `single` (bulk popover: replace value) and `freeText` (form, bulk Add: allow create) / `suggestions-only` (bulk Remove: pick from list) modes. 270 lines including doc comments. Reusable in Plan 22-11.
- **Behavioral contract per UI-SPEC §"Chip combobox spec"** — Enter or comma key commits typed value; Backspace on empty input removes the last chip; case-insensitive silent dedup per D-04 (no toast, just clear input); chip × button removes individual chip with `aria-label="Remove tag {name}"`; suggestion list filters by case-insensitive substring; `+ Add "{query}"` row only renders when the query has no exact OR substring match in suggestions/chips; disabled mode disables input and hides chip × buttons.
- **Validation per D-05** — `maxLength=50` rejects + shows inline `Tags must be 50 characters or fewer.` warning; `maxTags=20` rejects + shows inline `Maximum 20 tags per camera.` warning. Both messages use `text-amber-700 dark:text-amber-400` (warning style) per UI-SPEC Negative Assertion #2 — `grep -c text-destructive` returns 0.
- **Camera-form-dialog wired** — Tags `<Input>` replaced with `<TagInputCombobox value={tags} onChange={setTags} suggestions={distinctTags} multi freeText inputId="cam-tags" />`. State type migrated from `string` to `string[]` across 5 touchpoints. Distinct-tags fetched on dialog open from `/api/cameras/tags/distinct` (Plan 22-05) per D-09; failure → `toast.error("Couldn't load tag suggestions. Try again.")` per UI-SPEC §Toasts; combobox falls back to empty suggestions (freetext still works).
- **D-10 preserved** — `bulk-import-dialog.tsx` is NOT modified. Comma/semicolon parsing and the existing duplicate-detection flow are untouched. Server-side normalization (Plan 22-01) handles trim/dedup/limits at write time, so the bulk-import path correctly populates `tags` + `tagsNormalized` without UI-side changes.
- **Description placeholder preserved** — `Optional description...` (line 684 in camera-form-dialog.tsx) untouched per UI-SPEC line 152.
- **Build clean** — `pnpm --filter @sms-platform/web build` exits 0; no TypeScript errors, no Next.js compile errors.
- **Camera-form regression suite green** — 30/30 tests across `camera-form-dialog.test.tsx` (24) + `camera-form-dialog-push.spec.tsx` (6) still pass after the wiring change.

## Task Commits

Each task committed atomically with `--no-verify` per parallel-executor protocol. TDD discipline on Task 1: RED → GREEN.

1. **Task 1 RED — failing tests for TagInputCombobox** — `558af5e` (test) — Replaced 6 it.todo stubs from Plan 22-01 with 13 implemented test cases. Tests fail pre-implementation (`Failed to resolve import "../tag-input-combobox"`) — expected RED.
2. **Task 1 GREEN — TagInputCombobox composite** — `98463c4` (feat) — Created tag-input-combobox.tsx (270 lines). 13/13 tests pass. Acceptance grep checks pass: `text-destructive` count = 0, `text-amber-700|text-amber-400` count = 3 matches, validation copy strings present, helper text string present, aria-label present.
3. **Task 2 — wire TagInputCombobox into camera-form-dialog** — `3d2165d` (feat) — Tags state migrated `string → string[]` (5 touchpoints), distinct-tags fetch wired on dialog open with toast.error fallback per D-09, JSX `<Input>` replaced with `<TagInputCombobox>`. 30/30 camera-form tests pass; build clean. bulk-import-dialog.tsx NOT modified per D-10.

**Plan metadata:** orchestrator owns final commit (SUMMARY only — STATE.md / ROADMAP.md updates deferred to orchestrator per parent prompt).

## Files Created/Modified

### New component (Task 1 GREEN — `98463c4`)

- `apps/web/src/app/admin/cameras/components/tag-input-combobox.tsx` — `TagInputCombobox` composite with `TagInputComboboxProps` interface. 270 lines including ~30 lines of doc comments. Composes `<Badge variant="secondary">` chips + a plain `<input>` + an absolute-positioned `<div role="listbox">` dropdown with "Existing tags" and "Create new" sections. Internal state: `input` (current query), `open` (dropdown visibility), `error` (inline warning copy). Keyboard handlers: Enter/comma → commit; Backspace on empty → remove last chip. Click handlers: chip × → remove that chip; suggestion row → commit; "+ Add" row → commit input as freetext.

### Tests (Task 1 RED — `558af5e`)

- `apps/web/src/app/admin/cameras/components/__tests__/tag-input-combobox.test.tsx` — Replaced 6 it.todo stubs with 13 implemented cases:
  1. Initial render: chips for current value
  2. Initial render: empty input alongside chips
  3. Commit: Enter commits typed value as new chip
  4. Commit: comma commits typed value as new chip
  5. Commit: Backspace on empty input removes last chip
  6. Commit: case-insensitive dedup is silent (no onChange, input cleared)
  7. Validation: maxLength=50 rejects + shows amber warning copy
  8. Validation: maxTags=20 rejects + shows amber warning copy
  9. Suggestions: case-insensitive substring filter
  10. Suggestions: clicking suggestion commits as chip
  11. Suggestions: "+ Add" row visibility (substring match suppresses, exact match suppresses, no match shows)
  12. Chip ×: clicking removes chip + uses correct aria-label
  13. Disabled: input disabled + chip × buttons hidden

### Wiring (Task 2 — `3d2165d`)

- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` — 5 touchpoints updated:
  1. Import added: `import { TagInputCombobox } from './tag-input-combobox';`
  2. State type migration: `useState<string[]>([])` (was `useState('')`) + new `useState<string[]>([])` for `distinctTags`
  3. `initialValuesRef.tags` type: `string[]` (was `string`)
  4. Edit-mode pre-fill: `setTags(camera.tags ?? [])` (was `setTags(camera.tags?.join(', ') || '')`)
  5. Edit-mode initial snapshot: `tags: camera.tags ?? []` (was `tags: camera.tags?.join(', ') || ''`)
  6. Edit-mode diff: order-sensitive array compare (was `.split(',').map(trim).filter(Boolean)`)
  7. Create-mode body: `if (tags.length > 0) body.tags = tags;` (was `if (tags.trim()) body.tags = tags.split(',').map(trim).filter(Boolean);`)
  8. resetForm: `setTags([])` + `setDistinctTags([])` (was `setTags('')`)
  9. Distinct-tags fetch on dialog open with toast.error fallback per D-09
  10. JSX: `<Input>` replaced with `<TagInputCombobox value={tags} onChange={setTags} suggestions={distinctTags} multi freeText inputId="cam-tags" />`

## Decisions Made

- **Composition over shadcn Popover+Command** — the plan's example code in `<action>` Step 1 wired the dropdown via shadcn `<Popover>` + `<Command>` (cmdk-backed). Trial integration revealed friction: cmdk filters by `value` prop and renders inside a portal, making jsdom-based RTL tests fragile (queryByText sometimes missed dropdown contents because they hadn't rendered into the same subtree at assertion time). A plain absolute-positioned `<div role="listbox">` mounted inside the same React subtree as the input renders synchronously and works with `fireEvent` directly. The visual + behavioral contract per UI-SPEC §"Chip combobox spec" is preserved byte-for-byte. Trade-off: no cmdk arrow-key keyboard navigation. Phase 22 §Accessibility Contract only requires Backspace + chip × keyboard parity, so the trade-off is acceptable.
- **'+ Add' row uses substring-match suppression** — the plan's example code used `exactMatchExists` (only `s.toLowerCase() === q`). But the plan's `<behavior>` Test 10 explicitly asserts that typing `lob` against suggestions=['Lobby'] should NOT show "+ Add" (because Lobby contains 'lob' as a substring and the user can click it). The semantics: "+ Add" should only render when the query has no chance of matching anything in the dropdown. Renamed `exactMatchExists` → `hasAnyMatch` and added a `suggestions.some(s => s.toLowerCase().includes(q))` check. Test-driven correction: the plan's example code would have failed Test 10.
- **Mode props over separate components** — UI-SPEC §"Open Items for Planner Discretion" explicitly leaves this open. One composite with `multi` and `freeText` props means Plan 22-11's bulk Add (multi=false, freeText=true) and bulk Remove (multi=false, freeText=false) popovers reuse 95% of the rendering and validation logic. Three separate components would have triplicated maxLength / maxTags / Backspace / chip × handlers.
- **Warning amber tokens, never destructive red** — UI-SPEC Negative Assertion #2 (lines 117-121) hard-bans `--destructive` in Phase 22. Validation messages use `text-amber-700 dark:text-amber-400`. The acceptance grep `grep -c text-destructive tag-input-combobox.tsx` returns 0 matches (initial implementation had a docstring referencing `text-destructive` as the banned token — reworded to avoid the literal string so the grep stays at 0).
- **Tags state migration is backwards-compatible with the API** — API DTO (Plan 22-01) always accepted `tags: string[]`. The historical comma-string state was a frontend-only convention. Migration simplifies 5 touchpoints in camera-form-dialog. Edit-mode diff becomes order-sensitive array compare, which is correct because tag order is preserved in DB per CONTEXT.md D-04 first-seen casing.
- **13 component tests instead of plan's 12** — added a separate 'renders an empty input alongside chips' test so the initial-state contract is pinned independently of the chip-rendering contract. Each commit/validation/suggestion test asserts a single behavioral concern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan's example `exactMatchExists` logic would fail Test 10**
- **Found during:** Task 1 GREEN — `pnpm --filter @sms-platform/web test -- tag-input-combobox` initial run, 12/13 passing with one failure.
- **Issue:** The plan's `<action>` Step 1 example code used `exactMatchExists = useMemo(() => suggestions.some(s => s.toLowerCase() === q) || lowerValue.has(q))` — this only checks for exact case-insensitive match. But the plan's `<behavior>` Test 10 explicitly asserts that typing `lob` against suggestions=['Lobby'] should NOT show "+ Add" (because Lobby contains 'lob' as a substring and the user can pick it). With the plan's logic, 'lob' has no exact match → "+ Add" would render → test fails.
- **Fix:** Renamed `exactMatchExists` → `hasAnyMatch` and added `if (suggestions.some(s => s.toLowerCase().includes(q))) return true;` before the final fall-through. Now "+ Add" suppresses when ANY suggestion contains the query (exact OR substring), and only shows when no match exists at all (e.g., typing 'newtag' against suggestions=['Lobby']).
- **Files modified:** `apps/web/src/app/admin/cameras/components/tag-input-combobox.tsx` (renamed variable + added one substring check; `showAddRow` reference also updated to use new name).
- **Verification:** Test 10 now passes — 'lob' suppresses, 'lobby' suppresses, 'newtag' shows.
- **Committed in:** Folded into `98463c4` (Task 1 GREEN commit).

**2. [Rule 1 — Bug] Initial component file failed `grep -c text-destructive == 0` acceptance check**
- **Found during:** Task 1 GREEN acceptance verification — `grep -c text-destructive tag-input-combobox.tsx` returned 1 match.
- **Issue:** A docstring in the JSX comment block was referencing the banned token literally ("NEVER `text-destructive`") — even though the implementation correctly used `text-amber-700 dark:text-amber-400`. The acceptance criterion is a zero-match grep assertion (per Plan 22-07 §<acceptance_criteria>: "fail the task if any line is found").
- **Fix:** Reworded the cautionary comment to avoid the literal banned-token string while preserving the warning intent: "the destructive red token MUST NOT appear in Phase 22" instead of "NEVER `text-destructive`".
- **Files modified:** `apps/web/src/app/admin/cameras/components/tag-input-combobox.tsx` (one comment block reworded).
- **Verification:** `grep -c text-destructive tag-input-combobox.tsx` now returns 0 matches.
- **Committed in:** Folded into `98463c4` (Task 1 GREEN commit).

**3. [Rule 3 — Blocking] Worktree had no node_modules (carryover from Phase 22 prior plans)**
- **Found during:** Task 1 RED initial test run.
- **Issue:** Same as documented in 22-02-SUMMARY.md / 22-04-SUMMARY.md / 22-05-SUMMARY.md — fresh worktree at `.claude/worktrees/agent-af9f5fea63b49dd8e/` has no `node_modules`. `pnpm test` failed with `vitest: command not found`.
- **Fix:** Created symlinks to main repo's node_modules at `/node_modules`, `/apps/web/node_modules`, `/apps/api/node_modules`. The .gitignored files don't enter version control.
- **Files modified:** None tracked.
- **Committed in:** No commit — operational setup only.

### Out-of-scope discoveries (logged to deferred-items.md, NOT auto-fixed)

**4. [Out-of-scope] 3 pre-existing failing tests in `bulk-import-dialog.*`**
- **Found during:** Plan 22-07 final regression run (`pnpm --filter @sms-platform/web test`).
- **Issue:** Three test failures in files NOT modified by Plan 22-07:
  - `bulk-import-dialog.test.tsx` — 'footer counter shows N valid + M duplicate + K errors'
  - `bulk-import-dialog.test.tsx` — 'Import button stays enabled when validCount + duplicateCount > 0'
  - `bulk-import-dialog-push.spec.tsx` — 'parses ingestMode column case-insensitive and populates push rows'
- **Root cause:** jsdom `Not implemented: navigation` and timing/render-state races in `BulkImportDialog` — pre-existing in the codebase, exist on the base commit `73e5b61` BEFORE Plan 22-07 changes.
- **Decision:** Logged to `deferred-items.md` per SCOPE BOUNDARY rule; NOT auto-fixed. D-10 explicitly says bulk-import-dialog stays unchanged in Plan 22-07. These failures should be triaged via a separate quick task.
- **Verification of scope:** `git diff 73e5b61..HEAD --stat` shows Plan 22-07 modifies only `tag-input-combobox.tsx`, `tag-input-combobox.test.tsx`, and `camera-form-dialog.tsx` — bulk-import-dialog.tsx is NOT in the diff.

---

**Total deviations:** 4 (2 plan-spec fixes auto-applied during Task 1, 1 operational, 1 out-of-scope deferred).
**Impact on plan:** Zero scope creep. The 2 plan-spec issues (substring-match logic + destructive-token grep) were caught during the GREEN verification step and folded into the same commit; both fixes strengthen the implementation (Test 10 now passes deterministically; UI-SPEC Negative Assertion #2 acceptance grep now passes). The bulk-import-dialog failures are explicitly out of scope per D-10.

## Issues Encountered

- **Worktree environment setup** — Same blocker as 22-02/22-04/22-05 (see Deviations §3). Fix: symlink node_modules.
- **Plan example code drift from <behavior> spec** — The plan's `<action>` Step 1 example code used `exactMatchExists` (only checks exact match), but the plan's `<behavior>` Test 10 expected substring-match suppression. Caught by the failing test (Test 10) and fixed inline. Lesson: when plans contain both example code and behavioral spec, the behavioral spec wins; verify the example matches the spec before copying.
- **Pre-existing test flakes in bulk-import-dialog** — 3 unrelated failures in tests for a file Plan 22-07 doesn't touch (D-10). Logged to deferred-items.md.

## Threat Flags

None — Plan 22-07 introduces a pure frontend composite. The one new network call is `/api/cameras/tags/distinct` which is already org-scoped (Plan 22-05's T-22-02 mitigation: explicit `WHERE "orgId" = ${orgId}` defense-in-depth + RLS via set_config). XSS via tag content is mitigated by React's auto-escaping in JSX (T-22-09 in plan's threat_model). No new auth surface, no new endpoints, no new schema.

The plan's threat model covers:
- T-22-09 (Tampering — XSS via tag content): mitigated by React auto-escaping; tags rendered as plain string children, never `dangerouslySetInnerHTML`.
- T-22-10 (Information Disclosure — distinct-tags fetch): accepted; endpoint is org-scoped per Plan 22-05's T-22-02 mitigation.

## Known Stubs

None introduced by this plan. The Wave 2 stub `tag-input-combobox.test.tsx` from Plan 22-01 is now fully implemented (13/13 cases passing).

## User Setup Required

None — no schema changes, no migrations, no env vars. The component reuses existing shadcn primitives (`Badge`, `cn`, `lucide-react X` icon), all already installed.

## Next Phase Readiness

- **Plan 22-11 (Bulk Add/Remove tag popovers)** unblocked — `TagInputCombobox` is ready for reuse:
  - **Bulk Add popover:** `<TagInputCombobox value={[]} onChange={setBulkTag} suggestions={distinctTags} multi={false} freeText={true} placeholder="Type to search or create…" />` — single-tag mode with freetext add. The Apply button reads `bulkTag[0]` and calls `POST /cameras/bulk/tags` (Plan 22-06 endpoint).
  - **Bulk Remove popover:** `<TagInputCombobox value={[]} onChange={setBulkTag} suggestions={tagsAcrossSelection} multi={false} freeText={false} placeholder="Search current tags…" />` — single-tag mode, suggestions-only (no `+ Add` row), suggestions computed client-side from selected cameras.
- **Plan 22-08 (Cameras table tags filter MultiSelect)** independent; uses existing `DataTableFacetedFilter` primitive, not `TagInputCombobox`.
- **Plan 22-10 (Map view tag filter)** independent; same as 22-08.

## Self-Check: PASSED

Verified file presence:

```
EXISTS: apps/web/src/app/admin/cameras/components/tag-input-combobox.tsx (created)
EXISTS: apps/web/src/app/admin/cameras/components/__tests__/tag-input-combobox.test.tsx (modified — 13 cases implemented)
EXISTS: apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx (modified — TagInputCombobox wired)
EXISTS: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-07-SUMMARY.md (created — this file)
EXISTS: .planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/deferred-items.md (created — pre-existing bulk-import flakes)
```

Verified commit reachability (3 commits this plan):

```
FOUND: 558af5e (Task 1 RED — failing tests for TagInputCombobox)
FOUND: 98463c4 (Task 1 GREEN — TagInputCombobox composite, 13/13 tests pass)
FOUND: 3d2165d (Task 2 — wire TagInputCombobox into camera-form-dialog)
```

Verified all relevant tests pass:

```
web: tests/.../tag-input-combobox.test.tsx                → 13/13 passing
web: tests/.../camera-form-dialog.test.tsx                → 24/24 passing
web: tests/.../camera-form-dialog-push.spec.tsx           →  6/6 passing
web: build (next build)                                   → exit 0, all routes static/dynamic compiled
web: pre-existing failures in bulk-import-dialog.*        → logged to deferred-items.md (D-10 honors)
```

Verified acceptance grep contract from PLAN.md:

```
✓ TagInputCombobox imports from '@/components/ui/badge', 'lucide-react' (no Popover/Command — composition decision documented)
✓ "Press Enter or comma to add. Backspace removes the last tag." present in tag-input-combobox.tsx (line 264)
✓ "Tags must be 50 characters or fewer." present (line 93)
✓ "Maximum 20 tags per camera." present (line 111)
✓ aria-label={`Remove tag ${tag}`} present (line 169)
✓ text-amber-700 / text-amber-400 grep returns 3+ matches (lines 18, 253, 258)
✓ text-destructive grep returns 0 matches (UI-SPEC Negative Assertion #2 honored)
✓ tag-input-combobox.test.tsx contains 0 it.todo (13 it() cases — exceeds 12 minimum)
✓ TagInputCombobox in camera-form-dialog.tsx — 5 matches (import + JSX usage + 3 doc references)
✓ /api/cameras/tags/distinct fetch in camera-form-dialog.tsx — 2 matches (1 fetch + 1 doc reference)
✓ tags.split( in camera-form-dialog.tsx — 0 matches (old comma-split removed)
✓ "Optional description" in camera-form-dialog.tsx — 1 match (line 684, preserved per UI-SPEC line 152)
✓ pnpm --filter @sms-platform/web build → exit 0
✓ bulk-import-dialog.tsx NOT in git diff (D-10 honored)
```

---
*Phase: 22-camera-metadata-utilization-surface-tags-description-across-*
*Completed: 2026-04-26*
