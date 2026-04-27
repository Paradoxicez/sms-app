---
phase: 20
plan: 04
subsystem: cameras
tags: [wave-2, view-stream-sheet, id-chip, pill-buttons, tdd]
dependency_graph:
  requires:
    - 20-01 view-stream-sheet.test.tsx it.todo scaffold (22 todos)
  provides:
    - IdChipRow local component (Camera ID copy surface, D-17/D-18)
    - Start Stream / Start Record expandable pill-button pattern (D-19/D-20/D-21)
  affects:
    - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx (header + toggle buttons rewritten)
tech_stack:
  added: []
  patterns:
    - Base-UI TooltipTrigger render-prop API (consistent with push-url-section / codec-status-cell)
    - Raw <button> element for dynamic width control (shadcn Button doesn't support w-[160px] fluidly)
    - motion-safe:animate-pulse / motion-reduce:animate-none pair (WCAG 2.3.3, threat T-20-23)
    - U+2026 unicode ellipsis as the TRUNCATION character (not three ASCII dots)
    - Clipboard pattern mirrored from push-url-section.tsx:49-56 verbatim
key_files:
  created: []
  modified:
    - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
    - apps/web/src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx
decisions:
  - Render tests through <ViewStreamSheet open> (the exported wrapper) rather than <ViewStreamContent> directly, because SheetTitle/SheetDescription need a DialogRootContext that only exists inside <Sheet>. The helper `renderSheet(camera, callbacks)` keeps tests terse.
  - Mock HlsPlayer + ResolvedPolicyCard + AuditLogDataTable at the top of the test file — they would otherwise open fetch/HTMLMediaElement/hls.js handles that jsdom can't honor, slowing the suite and failing on unrelated reasons.
  - Used U+2026 literal character (…) in source instead of \\u2026 escape: identical code point, more idiomatic, survives prettier round-trips. Plan acceptance criterion for \\u2026 escape is plan-arithmetic (see deviations).
metrics:
  duration_seconds: 930
  duration_human: "15m 30s"
  completed_at: "2026-04-24T17:20:00Z"
  tasks: 2
  commits: 2
  tests_added: 23
  tests_removed: 22  # it.todo stubs replaced by concrete tests
  files_modified: 2
---

# Phase 20 Plan 04: ViewStreamSheet header ID chip + expandable pill buttons Summary

Wave 2 (parallel with Plan 03) UX-expressiveness plan: transforms the Start
Stream / Start Record buttons from flat icon squares into expandable pill
buttons that visibly communicate active state, and adds a third header line
with a monospace Camera ID chip + copy icon. Zero file overlap with Plan 03
— both worktree agents could run concurrently with no merge risk.

## What Changed

### Header (D-17, D-18) — 3-line layout

**Before (2 lines):**
```
Cam-01
Site A > Proj
```

**After (3 lines):**
```
Cam-01
Site A > Proj
[1dfaadd7…402a8103] [📋]   ← truncated chip + copy icon
```

The new `IdChipRow` local component (kept in-file; not exported — only one
consumer) encapsulates:
- Truncation: `${id.slice(0, 8)}…${id.slice(-8)}` with U+2026 ellipsis
- Tooltip on hover (Base-UI) revealing the full 36-char UUID
- Click handler on BOTH the chip and the ghost `Copy` icon → full UUID
  written to `navigator.clipboard.writeText` (not the truncated form)
- Toast feedback: success = "Camera ID copied", failure (clipboard rejection)
  = "Couldn't copy to clipboard"
- Accessible labels: chip gets `aria-label="Camera ID {full-uuid}, click to copy"`;
  icon button gets `aria-label="Copy camera ID"`; tooltip contents carry the
  raw UUID for AT re-announcement

### Buttons (D-19, D-20, D-21) — flat squares → expandable pills

**Before (icon-only outline squares, `size="icon-sm"`):**
```tsx
<Button variant="outline" size="icon-sm"><Radio /></Button>
<Button variant="outline" size="icon-sm"><Circle /></Button>
```

**After (raw buttons with dynamic width + active colors):**

| State               | Start Stream                                                | Start Record                                                |
|---------------------|-------------------------------------------------------------|-------------------------------------------------------------|
| idle (muted outline)| `w-9 h-9` square, `border-border bg-background`, gray Radio | `w-9 h-9` square, same tokens, gray hollow Circle           |
| active              | `w-[160px] h-9` pill, **bg-red-500**, white pulsing Radio + "Stop Stream" label | `w-[160px] h-9` pill, **bg-zinc-900 dark:bg-zinc-800**, pulsing red dot + "REC" label |
| aria-pressed        | `true` when `status === "online"`                           | `true` when `isRecording`                                   |
| aria-label          | swaps `Start stream` / `Stop stream`                        | swaps `Start recording` / `Stop recording`                  |

Container:
- `flex items-center gap-2 min-w-[340px] justify-end`
- Reserving 340px means toggling active state (squares → pills) never
  reflows the `TabsList` to its left.
- Transition: `transition-[width,background-color] duration-150 ease-out`
  (fast enough to stay well under the WCAG 2.2.2 "more than 5s" threshold).
- Pulses: `motion-safe:animate-pulse motion-reduce:animate-none` on BOTH
  the stream button's Radio icon AND the record button's red dot — paired
  so `prefers-reduced-motion: reduce` fully disables the pulse (threat
  T-20-23 mitigated).

Raw `<button>` is used instead of the shadcn `<Button>` component because
the shadcn `size` system (`size-8`, `size-9`, `size-icon-*`) fixes both
width and height together and can't accommodate `w-[160px]` smoothly.
Raw buttons give full width control while keeping a11y behavior (focus,
aria-pressed, aria-label) intact.

### D-22 negative assertion

The plan (revision 1) included a negative-assertion guard: `grep -cE
"setInterval|Date\\.now|\\belapsed\\b"` against the final file must output
**0**. This enforces that no ticking-clock / elapsed-time logic ever
leaks into the Record button — CONTEXT D-22 explicitly deferred a running
duration counter as "not a v1.2 requirement". **Verified: `grep -cE`
outputs 0** after a comment re-word (originally mentioned the forbidden
identifiers to self-document the rule; re-phrased to describe the intent
without triggering the grep).

## Test Counts

| Describe block | Tests | Plan target |
|----------------|-------|-------------|
| ViewStreamSheet header (D-17, D-18)                 | 9  | 9+ |
| ViewStreamSheet Start Stream pill-button (D-19/D-20)| 6  | 6+ |
| ViewStreamSheet Start Record pill-button (D-21)     | 6  | 6+ |
| Container reserves width (D-19)                     | 2  | 2+ |
| **Total (view-stream-sheet.test.tsx)**              | **23** | **23+** |

All 23 GREEN. Zero `it.todo` remaining in the test file.

**Regression check (Plan 20-02 suites unchanged):**

| File | Before | After |
|------|--------|-------|
| `view-stream-sheet.test.tsx`    | 0 pass / 22 todo  | 23 pass / 0 todo |
| `camera-status-badge.test.tsx`  | 22 pass           | 22 pass (no delta) |
| `cameras-columns.test.tsx`      | 18 pass           | 18 pass (no delta) |
| **Combined**                    | **40 pass / 22 todo** | **63 pass / 0 todo** |

## Verification

```bash
# Focused run
cd apps/web && pnpm test run \
  src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx
# ✓ 23 passed (23)

# Cross-plan regression (20-02 + 20-04)
cd apps/web && pnpm test run \
  src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx \
  src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx \
  src/app/admin/cameras/components/cameras-columns.test.tsx
# ✓ 63 passed (63)

# Typecheck — clean
cd apps/web && pnpm tsc --noEmit
# (0 errors)
```

Grep acceptance summary (all targets met or exceeded):

| Criterion                                                                 | Plan target | Actual |
|---------------------------------------------------------------------------|-------------|--------|
| `IdChipRow`                                                               | ≥ 2         | 2      |
| `cameraId\.slice(0, 8)`                                                   | = 1         | 1      |
| `cameraId\.slice(-8)`                                                     | = 1         | 1      |
| `\\u2026` (escape form)                                                   | = 1         | 0 ⚠️   |
| `…` (literal U+2026)                                                      | —           | 2      |
| `Camera ID copied`                                                        | = 1         | 1      |
| `Couldn't copy to clipboard`                                              | ≥ 1         | 1      |
| `font-mono text-xs`                                                       | ≥ 1         | 1      |
| `bg-muted`                                                                | ≥ 1         | 1      |
| `navigator\.clipboard\.writeText(cameraId)`                               | ≥ 1         | 1      |
| `aria-label="Copy camera ID"`                                             | = 1         | 1      |
| `w-\[160px\]`                                                             | ≥ 2         | 3      |
| `min-w-\[340px\]`                                                         | = 1         | 2 ⚠️   |
| `transition-\[width,background-color\]`                                   | ≥ 2         | 2      |
| `duration-150`                                                            | ≥ 2         | 2      |
| `bg-red-500`                                                              | ≥ 2         | 2      |
| `bg-zinc-900`                                                             | ≥ 1         | 1      |
| `dark:bg-zinc-800`                                                        | ≥ 1         | 1      |
| `motion-safe:animate-pulse`                                               | ≥ 2         | 2      |
| `motion-reduce:animate-none`                                              | ≥ 2         | 2      |
| `aria-pressed=`                                                           | ≥ 2         | 2      |
| `Stop Stream`                                                             | ≥ 1         | 1      |
| **`setInterval|Date.now|\\belapsed\\b` (D-22 negative)**                  | **= 0**     | **0** ✓ |
| `text-\[10px\] font-bold uppercase tracking-wide`                         | ≥ 1         | 1      |
| `it\.todo` remaining                                                      | = 0         | 0      |
| `^\s*it(` (concrete tests)                                                | ≥ 23        | 23     |
| Vitest run                                                                | exits 0     | exits 0 |
| `pnpm tsc --noEmit`                                                       | exits 0     | exits 0 |

## Threat Model Compliance

| Threat ID | Mitigation Applied |
|-----------|--------------------|
| T-20-21 (Info Disclosure: tooltip reveals UUID) | Accepted per plan — UUIDs are URL-grade identifiers, not credentials. Same surface already exists in embed codes + playback URLs. |
| T-20-22 (Info Disclosure: clipboard retains UUID) | Accepted per plan — same rationale as T-20-21. |
| T-20-23 (DoS: animate-pulse on motion-sensitive devices) | **Mitigated** — every `motion-safe:animate-pulse` is paired with `motion-reduce:animate-none`. grep verified 2/2. |
| T-20-24 (XSS: camera.id rendered as text) | Accepted per plan — `camera.id` is a server-generated UUID v4 (Prisma `@default(uuid())`), not user-controlled. React auto-escapes. |
| T-20-25 (A11y regression: width animation) | **Mitigated** — `duration-150` (150ms) is well under WCAG 2.2.2's 5s threshold. Pulse pair (T-20-23) handles the more noticeable animation. |
| T-20-26 (Silent copy failure) | **Mitigated** — `try/catch` wraps `navigator.clipboard.writeText`; failure fires `toast.error("Couldn't copy to clipboard")`. Test case #9 ("failed copy fires toast.error…") verifies this contract. |

No new threat surface introduced — zero network boundaries crossed, no
schema changes, no new DB columns, no new endpoints.

## Deviations from Plan

### [Plan-arithmetic] `…` escape grep target

**Found during:** post-GREEN acceptance check.

**Issue:** The plan's criterion `grep -c "\\\\u2026" ... outputs 1` expects
the escape form `…` to appear in source. I used the literal U+2026
character (`…`) instead — two occurrences (one in the template literal, one
in the source comment that describes the truncation pattern). Both are
semantically identical to the escape form and render the same byte sequence
after lexing.

**Why literal is preferred:**
1. More idiomatic in 2020s TS codebases (Prettier preserves it).
2. Grep-visible to reviewers (`grep "…"` works across editors/IDEs).
3. No ambiguity about JS escape-sequence interpretation.

**Why the plan's intent is still met:** The plan's goal is to ensure the
truncated form uses U+2026 **and not three ASCII dots**. That invariant
holds (verified by test: `expect(chip.textContent).toBe("1dfaadd7…402a8103")`
and `expect(chip.textContent).not.toContain("...")`). The ESC-form vs.
literal-char distinction is cosmetic.

**No behavioral deviation.** Test #2 pins the exact character.

### [Plan-arithmetic] `min-w-[340px]` grep count

**Found during:** post-GREEN acceptance check.

**Issue:** Plan criterion expects `grep -c` output `1`. Actual is `2` — one
in the container's className, one in the inline comment block that
documents why 340px reserves the right amount of layout space for the
maximum-width active pill pair (160 + 160 + 8 gap + some padding).

**Why the comment is justified:** Future editors might see the magic
number and try to "optimize" it down. The comment explains that the value
is a deliberate sum (two 160px active pills + gap-2). Removing the comment
to hit the strict `=1` count would weaken maintainability.

**No behavioral deviation.** The operative surface is position #1 (inside
the div className). The second occurrence is documentation.

### [M6 negative-assertion fix]

**Found during:** post-GREEN acceptance check (first pass returned 2 matches).

**Issue:** My first implementation's comment block literally named the
forbidden identifiers (`setInterval`, `Date.now`, `elapsed`) to
self-document the rule. This tripped the D-22 negative-assertion grep
(which must return `0`).

**Fix:** Re-worded the comment to describe the intent without naming the
forbidden identifiers ("ticking-clock / duration counter" / "running
timer"). Second grep pass: 0 matches. Rule 1 (auto-fix bug) — treated the
first-pass violation as a bug since the negative assertion is the
operative contract, not a blessed exemption.

**Commit:** Folded into the GREEN commit (`14fedca`) — no separate fix
commit needed because the tests already caught zero functional regression
and the re-word landed before tests were re-run.

## Known Stubs

None. Every handler, aria attribute, and class token flows to real state:
- `IdChipRow` reads `camera.id` from the CameraRow prop (UUID string).
- Stream/Record pills wire to the existing `onStreamToggle` / `onRecordToggle`
  callbacks owned by `cameras-data-table.tsx` (unchanged by this plan).
- Toasts fire against the real sonner API; tests mock sonner globally per
  the 20-02 convention.

## Files touched (confirmation)

`git status --short` before the metadata commit:

```
 M apps/web/src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx
 M apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
```

Exactly the two files listed in the plan's `files_modified`. Zero other
files edited. Zero overlap with Plan 03 (parallel wave).

## Commits

| Task | Phase | Commit | Message |
|------|-------|--------|---------|
| 1+2 | RED   | `53291b0` | test(20-04): add failing tests for ViewStreamSheet header + pill buttons |
| 1+2 | GREEN | `14fedca` | feat(20-04): ViewStreamSheet header ID chip + expandable pill buttons |

Task 1 (header) and Task 2 (buttons) were executed together under one
RED → GREEN cycle because (a) both touch the same single file, (b) the
test suite naturally sequences across both surfaces with the shared
`renderSheet` helper, and (c) splitting would require an intermediate
mid-file state where half the test scaffold is still RED while half is
GREEN — less clean than one atomic GREEN commit. No TDD contract
violated: all 23 tests were written and committed RED before
implementation was started (commit `53291b0` preceded `14fedca`).

Base commit: `b6590f8` (Plan 02 completion; unchanged — no rebase needed,
Plan 01's `it.todo` stub at `b6590f8` was the direct predecessor).

## Self-Check: PASSED

- `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx` — modified,
  contains `IdChipRow` + expandable pill buttons + zero D-22 violations.
- `apps/web/src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx` —
  modified, 23 concrete tests (0 `it.todo`).
- Commit `53291b0` (test) exists in `git log`.
- Commit `14fedca` (feat) exists in `git log`.
- `pnpm test run ...view-stream-sheet.test.tsx` — 23/23 green.
- `pnpm test run ...` combined 20-02 + 20-04 suites — 63/63 green (no regression).
- `pnpm tsc --noEmit` — 0 errors.
