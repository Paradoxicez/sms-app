---
phase: 17
plan: 03
subsystem: web/recordings
tags: [refactor, move, shared-component, REC-02, REC-03, D-13, D-14, T-17-V3]
requires: [17-00, 17-01, 17-02]
provides:
  - apps/web/src/components/recordings/hls-player.tsx
  - apps/web/src/components/recordings/timeline-bar.tsx
  - REC-03 GREEN heatmap tests
affects:
  - apps/web/src/app/admin/cameras/components/recordings-tab.tsx (import path)
  - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx (import path)
tech_stack:
  added: []
  patterns: [git-mv-preserves-history, shared-component-via-alias]
key_files:
  created:
    - apps/web/src/components/recordings/hls-player.tsx
    - apps/web/src/components/recordings/timeline-bar.tsx
  modified:
    - apps/web/src/app/admin/cameras/components/recordings-tab.tsx
    - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
    - apps/web/src/__tests__/timeline-bar.test.tsx
  deleted:
    - apps/web/src/app/admin/cameras/components/hls-player.tsx
    - apps/web/src/app/admin/cameras/components/timeline-bar.tsx
decisions:
  - "Updated view-stream-sheet.tsx (second consumer) in addition to recordings-tab.tsx — plan only mentioned recordings-tab but Step 1 grep found both; followed plan instruction 'If Step 1 found additional consumers, update those imports too'"
metrics:
  duration_minutes: 5
  tasks_completed: 2
  commits: 2
  tests_added: 3
  tests_passing: 149
  tests_todo: 9
  completed_date: "2026-04-20"
---

# Phase 17 Plan 03: Move HlsPlayer & TimelineBar to Shared Dir + REC-03 Heatmap Tests Summary

Relocated HlsPlayer and TimelineBar from `app/admin/cameras/components/` to the shared `components/recordings/` location per D-13 (so plan 17-04 playback page consumes the same instance), and replaced REC-03 `it.todo` stubs with 3 GREEN tests that lock the `bg-chart-1` heatmap contract from UI-SPEC §Color.

## Objective Recap

Per D-13: components used in two places move; they don't get duplicated. Both `HlsPlayer` and `TimelineBar` will be consumed by the upcoming playback page at `/app/recordings/[id]` (plan 17-04) AND by the existing admin `RecordingsTab` (and, as discovered during execution, by `ViewStreamSheet`). The relocation must be transparent — no behavior change, just path relocation — and the T-17-V3 mitigation (`xhr.withCredentials = true`) must survive the move.

## What Was Done

### Task 1 — Git-move components and update consumers (commit `1837ae9`)

1. **Pre-move grep** found two existing consumers of `./hls-player`:
   - `apps/web/src/app/admin/cameras/components/recordings-tab.tsx` (planned)
   - `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx` (NOT in plan, discovered)

   Plan instruction explicitly covered this: *"If Step 1 found additional consumers, update those imports too"*. Both consumers updated.

2. **Created shared dir:** `apps/web/src/components/recordings/`

3. **`git mv` (history-preserving)**:
   ```
   apps/web/src/app/admin/cameras/components/hls-player.tsx →
   apps/web/src/components/recordings/hls-player.tsx
   apps/web/src/app/admin/cameras/components/timeline-bar.tsx →
   apps/web/src/components/recordings/timeline-bar.tsx
   ```
   Confirmed by `git status` reporting `R` (rename) at 100% similarity.

4. **Consumer import updates:**
   ```diff
   -import { HlsPlayer } from './hls-player';
   -import { TimelineBar } from './timeline-bar';
   +import { HlsPlayer } from '@/components/recordings/hls-player';
   +import { TimelineBar } from '@/components/recordings/timeline-bar';
   ```
   (recordings-tab.tsx, lines 38-39)

   ```diff
   -import { HlsPlayer } from "./hls-player"
   +import { HlsPlayer } from "@/components/recordings/hls-player"
   ```
   (view-stream-sheet.tsx, line 18)

5. **T-17-V3 mitigation verification (security-critical):**
   ```
   $ grep -n withCredentials apps/web/src/components/recordings/hls-player.tsx
   38:            xhr.withCredentials = true;
   ```
   Survives the move unchanged at line 38.

6. **TypeScript build:** `npx tsc --noEmit -p tsconfig.json` exits 0.
7. **Web test suite:** 146/146 passing post-move (baseline equal — no regression introduced by move).
8. **Stale-reference grep (clean):**
   - `from './hls-player'`: zero matches
   - `from './timeline-bar'`: zero matches
   - `admin/cameras/components/hls-player`: zero matches
   - `admin/cameras/components/timeline-bar`: zero matches

### Task 2 — Fill REC-03 heatmap tests (commit `b047756`)

Replaced the 3 `it.todo` stubs in `apps/web/src/__tests__/timeline-bar.test.tsx` with real GREEN test bodies:

1. **Alternating pattern:** 12 hours `hasData=true`, 12 false → expect `container.querySelectorAll('.bg-chart-1').length === 12`
2. **All-empty day:** 24 false → expect 0 `.bg-chart-1`
3. **All-full day:** 24 true → expect 24 `.bg-chart-1`

Imports `TimelineBar` from `@/components/recordings/timeline-bar` (the new shared path), confirming the alias resolves correctly.

Per the plan's resolution procedure, I read the moved `timeline-bar.tsx` first (line 154) and confirmed the component already renders `bg-chart-1` for `hourMap.get(i) === true` — matching the UI-SPEC §Color contract. No component fix or UI-SPEC reconciliation needed; tests went GREEN on first run.

## Verification

| Gate | Command | Result |
|------|---------|--------|
| TypeScript | `cd apps/web && npx tsc --noEmit -p tsconfig.json` | exit 0 |
| REC-03 tests | `cd apps/web && pnpm test -- src/__tests__/timeline-bar.test.tsx --run` | 3 passed |
| Full web suite | `cd apps/web && pnpm test -- --run` | 149 passed, 9 todo, 0 failed (baseline 146 + 3 new REC-03) |
| `withCredentials` survives move | `grep -n withCredentials apps/web/src/components/recordings/hls-player.tsx` | match at line 38 |
| Old paths absent | `grep -rn "admin/cameras/components/hls-player\|admin/cameras/components/timeline-bar" apps/web/src` | zero matches |
| Old relative imports absent | `grep -rn "from ['\"]\\./hls-player['\"]\\|from ['\"]\\./timeline-bar['\"]" apps/web/src` | zero matches |
| Files exist at new path | `ls apps/web/src/components/recordings/` | hls-player.tsx + timeline-bar.tsx |

## Threat Model — T-17-V3 Mitigation Status

| Threat | Component | Disposition | Verification |
|--------|-----------|-------------|--------------|
| T-17-V3 (Spoofing/Auth) | HlsPlayer (post-move) | mitigate | `xhrSetup` callback at line 37-39 of moved `hls-player.tsx` sets `xhr.withCredentials = true` — confirmed by grep |
| T-17-V12 (Info Disclosure) | HLS manifest URLs | accept | Server-side concern, unaffected by client-side file move |
| T-17-D14 (RecordingsTab regression) | admin/cameras RecordingsTab | mitigate | Full web test suite passes; consumer imports explicitly updated |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Critical Functionality] Updated second consumer `view-stream-sheet.tsx` not enumerated in plan**
- **Found during:** Task 1 Step 1 (the explicit "verify no other consumers exist BEFORE moving" grep)
- **Issue:** Plan only listed `recordings-tab.tsx` as the consumer to update. Pre-move grep found `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx:18` also imports `HlsPlayer` from `./hls-player`. Without updating it, the post-move TypeScript build would fail and the live-stream View Stream sheet would break at runtime.
- **Fix:** Updated the import to `@/components/recordings/hls-player` (same pattern as RecordingsTab). Plan explicitly authorized this action: *"If Step 1 found additional consumers, update those imports too (using the same alias path)."*
- **Files modified:** `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx`
- **Commit:** `1837ae9`

**2. [Rule 3 — Blocking] Installed pnpm dependencies in worktree**
- **Found during:** Task 1 Step 6 (TypeScript build attempt)
- **Issue:** Worktree had no `node_modules` — `pnpm tsc` failed with `Command "tsc" not found`.
- **Fix:** Ran `pnpm install` at the repo root. Resolved 1073 packages from cache.
- **Files modified:** None (lockfile unchanged, no commit needed).
- **Commit:** N/A (environment setup only)

### Auth Gates

None.

## Decisions Made

- **Use `git mv` not `mv` + `git add/rm`:** Plan mandated, executed verbatim. Git status confirmed `R` (rename) at 100% similarity → history preserved per D-13.
- **Update second consumer (view-stream-sheet) not in plan:** Plan explicitly authorized; necessary to keep the build green and the live-stream sheet functional (D-14 regression guard extends to ALL consumers, not just RecordingsTab).
- **No component edit needed for REC-03:** Read the moved `timeline-bar.tsx` first; line 154 already renders `bg-chart-1` correctly per UI-SPEC. Tests went GREEN immediately — no need to invoke the "fix component" or "reconcile UI-SPEC" branches of the plan's resolution procedure.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `1837ae9` | refactor(17-03) | move HlsPlayer and TimelineBar to shared recordings dir |
| 2 | `b047756` | test(17-03) | fill REC-03 heatmap tests for moved TimelineBar |

## Self-Check: PASSED

Verified each claim above:

- [x] `apps/web/src/components/recordings/hls-player.tsx` — FOUND
- [x] `apps/web/src/components/recordings/timeline-bar.tsx` — FOUND
- [x] `apps/web/src/app/admin/cameras/components/hls-player.tsx` — DELETED (confirmed absent in `ls` output)
- [x] `apps/web/src/app/admin/cameras/components/timeline-bar.tsx` — DELETED (confirmed absent in `ls` output)
- [x] Commit `1837ae9` — FOUND in `git log --oneline -3`
- [x] Commit `b047756` — FOUND in `git log --oneline -3`
- [x] `withCredentials` present at line 38 of moved `hls-player.tsx`
- [x] Both consumer files use `@/components/recordings/*` alias paths
- [x] 3 REC-03 tests passing (149 total web tests pass)

No missing items.
