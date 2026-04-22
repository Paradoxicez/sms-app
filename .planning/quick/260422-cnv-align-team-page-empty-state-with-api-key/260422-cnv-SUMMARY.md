---
phase: quick-260422-cnv
plan: 01
subsystem: web-ui
tags: [ui, team, empty-state, datatable, consistency]
dependency_graph:
  requires:
    - apps/web/src/components/ui/data-table/data-table.tsx (shared DataTable primitive)
    - apps/web/src/components/team/team-columns.tsx (column defs, untouched)
  provides:
    - Team page empty state that matches API Keys empty state pattern
  affects:
    - apps/web/src/app/app/team/page.tsx
    - apps/web/src/components/team/team-data-table.tsx
tech_stack:
  added: []
  patterns:
    - "Shared DataTable primitive handles toolbar + empty row + pagination for both Team and API Keys pages — no new abstraction needed"
key_files:
  created: []
  modified:
    - apps/web/src/app/app/team/page.tsx
    - apps/web/src/components/team/team-data-table.tsx
decisions:
  - "Do not create a shared TenantPageEmptyState component. Both pages already consume the same DataTable; only page-level/wrapper-level string and prop drift had to be corrected."
  - "Keep the fetching useState pair in TeamPage even though the value is no longer read. Plan scope said do not touch data-fetching logic, and a future loading-skeleton parity task will re-introduce the reader."
metrics:
  duration: "~2 min"
  completed_date: "2026-04-22"
  tasks_completed: 2
  files_changed: 2
---

# Quick 260422-cnv: Align Team Page Empty State with API Keys Summary

Team page empty state now matches the API Keys page: shared DataTable search bar, column headers, single empty-state row, and pagination footer — no more "Just you so far" centered block, and the top-right button now has a Plus icon prefix.

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/app/app/team/page.tsx` | Removed `justYou` branch; render `TeamDataTable` unconditionally in admin+activeOrg path; added Plus icon prefix to header button; imported `Plus` from `lucide-react` |
| `apps/web/src/components/team/team-data-table.tsx` | Aligned `searchPlaceholder` and `emptyState` copy to API Keys cadence |

## Tasks

### Task 1: Remove justYou branch in Team page and add Plus icon to header button
- **Commit:** `fd6eb9a`
- **Files:** `apps/web/src/app/app/team/page.tsx`
- Deleted `const justYou = !fetching && members.length <= 1;`
- Replaced the `{justYou ? (...) : (<TeamDataTable ... />)}` ternary with an unconditional `<TeamDataTable ... />` render (same props as before: `members`, `orgId`, `orgName`, `currentUserId`, `onRefresh`)
- Removed the centered `UsersRound` icon + "Just you so far" heading + description + centered "Add Team Member" button JSX
- Updated the top-right action button to `<Plus className="mr-2 h-4 w-4" />` followed by `Add Team Member`
- Added `Plus` to the `lucide-react` import (kept `Lock` for role gate and `UsersRound` for `!activeOrgId` branch)
- **Typecheck:** clean (`npx tsc --noEmit -p tsconfig.json` — no errors)

### Task 2: Align TeamDataTable empty-state copy and search placeholder to API Keys pattern
- **Commit:** `a4f2eb0`
- **Files:** `apps/web/src/components/team/team-data-table.tsx`
- `searchPlaceholder="Filter members..."` → `searchPlaceholder="Search team members..."`
- `emptyState.title: "No team members"` → `"No team members yet"`
- `emptyState.description: "Add your first team member to get started."` → `"Get started by adding your first team member."`
- Did NOT add a `loading` prop or touch column definitions — out of scope per plan
- **Typecheck:** clean

## Verification

- **Typecheck:** Full web app `npx tsc --noEmit -p tsconfig.json` → zero errors after both tasks
- **Lint:** No project-level lint script is configured (`pnpm lint` prints `"lint not configured yet"`; web app has no lint script)
- **String grep verification:**
  - `page.tsx` contains no occurrences of `Just you so far` or `justYou`
  - `page.tsx` contains `<Plus className="mr-2 h-4 w-4" />` directly before `Add Team Member`
  - `team-data-table.tsx` contains exactly `searchPlaceholder="Search team members..."`, `title: "No team members yet"`, `description: "Get started by adding your first team member."`

## Before / After (visual QA recommended)

Suggested side-by-side screenshots for manual confirmation:

| View | Before | After |
|------|--------|-------|
| Team page with only current user | Centered UsersRound icon + "Just you so far" + centered "Add Team Member" | DataTable toolbar (search + Role filter), Name/Email/Role/Added column headers, single row "No team members yet" with description, pagination footer "Showing 0-0 of 0" + "Rows per page: 10" |
| Top-right button | `Add Team Member` (text only) | `+ Add Team Member` (Plus icon + text) |
| Side-by-side with `/app/developer/api-keys` empty state | Different layouts | Visually identical layout; only domain-specific copy differs |

## Finding Confirmed

The fix was purely string/prop drift at the page and wrapper layer:
- Both pages already consume the same shared `DataTable` component at `apps/web/src/components/ui/data-table/data-table.tsx`
- That shared component already owns the toolbar, column headers, single empty-state row, and pagination footer
- No new shared empty-state abstraction was needed — creating one would have been over-engineering

## Deviations from Plan

None — plan executed exactly as written.

## Out-of-Scope Deferrals (Explicitly Not Done)

- Loading-skeleton parity for `TeamDataTable` (no `loading` prop passed from `TeamPage`). The Team page already shows a top-level `Skeleton` while `useCurrentRole` is loading, so empty-state alignment is complete without this. A follow-up task can wire `loading={fetching}` and plumb it through.
- Column definition changes in `team-columns.tsx`
- Populated-state (2+ members) rendering changes
- Invite-flow / `AddTeamMemberDialog` changes

## Known Stubs

None.

## Threat Flags

None — UI-only empty-state copy change. No new network endpoints, auth paths, file access, or schema changes.

## Self-Check: PASSED

- File `apps/web/src/app/app/team/page.tsx`: FOUND
- File `apps/web/src/components/team/team-data-table.tsx`: FOUND
- Commit `fd6eb9a`: FOUND in `git log`
- Commit `a4f2eb0`: FOUND in `git log`
- All 8 success criteria from PLAN.md verified via grep + typecheck
