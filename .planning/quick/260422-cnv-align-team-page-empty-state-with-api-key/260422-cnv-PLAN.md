---
phase: quick-260422-cnv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/app/team/page.tsx
  - apps/web/src/components/team/team-data-table.tsx
autonomous: true
requirements:
  - UX-TEAM-EMPTY-ALIGN
must_haves:
  truths:
    - "Team page empty state shows a search bar at the top (same position as API Keys page)"
    - "Team page empty state shows the table header row with Name/Email/Role/Added columns when the table is empty"
    - "Team page empty state shows a single empty-state row reading 'No team members yet' with description 'Get started by adding your first team member.'"
    - "Team page empty state shows a pagination footer reading 'Showing 0-0 of 0' with a 'Rows per page' selector"
    - "Team page no longer renders a centered icon + 'Just you so far' heading + centered 'Add Team Member' button"
    - "Top-right action button reads '+ Add Team Member' with a Plus icon prefix, matching '+ Create API Key' on the API Keys page"
  artifacts:
    - path: "apps/web/src/app/app/team/page.tsx"
      provides: "Team page renders TeamDataTable unconditionally for admins (no justYou branch); action button has Plus icon prefix"
      contains: "TeamDataTable"
    - path: "apps/web/src/components/team/team-data-table.tsx"
      provides: "Empty-state copy and search placeholder aligned to API Keys pattern"
      contains: "Search team members..."
  key_links:
    - from: "apps/web/src/app/app/team/page.tsx"
      to: "apps/web/src/components/team/team-data-table.tsx"
      via: "direct render — no justYou branch guards it"
      pattern: "<TeamDataTable"
    - from: "apps/web/src/components/team/team-data-table.tsx"
      to: "apps/web/src/components/ui/data-table/data-table.tsx"
      via: "DataTable props: searchKey, searchPlaceholder, emptyState"
      pattern: "emptyState=\\{"
---

<objective>
Align the Team page empty state with the API Keys page empty state pattern so both pages look and behave identically when no rows exist.

Purpose: Consistent org-admin UX — both Team and API Keys are tenant pages that share the same DataTable primitive. The Team page currently short-circuits to a custom "Just you so far" centered block when there are 0-1 members, bypassing the shared empty-state pattern and creating visual inconsistency.

Output: Team page (apps/web/src/app/app/team/page.tsx) renders TeamDataTable unconditionally for admins. TeamDataTable (apps/web/src/components/team/team-data-table.tsx) uses the same search placeholder cadence and empty-state copy as ApiKeysDataTable. Top-right button gets a Plus icon prefix to match "+ Create API Key".
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/app/team/page.tsx
@apps/web/src/components/team/team-data-table.tsx
@apps/web/src/components/pages/tenant-developer-api-keys-page.tsx
@apps/web/src/components/api-keys/api-keys-data-table.tsx

<interfaces>
<!-- The shared DataTable already supports everything needed. No new abstraction. -->
<!-- From apps/web/src/components/ui/data-table/data-table.tsx (signature excerpt): -->

```typescript
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  facetedFilters?: FacetedFilterConfig[]
  loading?: boolean
  emptyState?: {
    icon?: React.ReactNode
    title: string
    description?: string
    action?: React.ReactNode
  }
  // ...
}
```

Behavior confirmed by reading data-table.tsx + data-table-pagination.tsx:
- When data=[] and no loading state: renders table header row, then a single empty-state row with title + description.
- Toolbar (search + faceted filters) always renders when searchKey is set — even with 0 rows.
- Pagination footer ("Showing 0-0 of 0", "Rows per page") always renders.

<!-- API Keys reference (target pattern): -->
From apps/web/src/components/api-keys/api-keys-data-table.tsx:
```tsx
<DataTable
  columns={columns}
  data={keys}
  searchKey="name"
  searchPlaceholder="Search API keys..."
  loading={loading}
  emptyState={{
    title: "No API keys yet",
    description: "Get started by creating your first API key.",
  }}
/>
```

From apps/web/src/components/pages/tenant-developer-api-keys-page.tsx (button pattern):
```tsx
<Button onClick={() => setCreateOpen(true)}>
  <Plus className="mr-2 h-4 w-4" />
  Create API Key
</Button>
```
</interfaces>

## Finding (scope note)

Both pages already consume the shared `DataTable` component at `apps/web/src/components/ui/data-table/data-table.tsx`. The shared component already owns the search bar + column headers + empty row + pagination footer. The Team page's drift is purely at the page/wrapper layer: it adds a `justYou` conditional that bypasses TeamDataTable when `members.length <= 1`. Removing that conditional and aligning two strings (searchPlaceholder, emptyState copy) plus adding a Plus icon is the entire fix. **No new shared empty-state abstraction is needed.**
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove justYou branch in Team page and add Plus icon to header button</name>
  <files>apps/web/src/app/app/team/page.tsx</files>
  <action>
Edit `apps/web/src/app/app/team/page.tsx`:

1. Remove the `justYou` computation (the line `const justYou = !fetching && members.length <= 1;`) so it no longer exists.

2. Replace the entire `{justYou ? (...) : (<TeamDataTable ... />)}` ternary block with an unconditional `<TeamDataTable ... />` render. Keep all existing props: `members`, `orgId={activeOrgId}`, `orgName`, `currentUserId`, `onRefresh={load}`.

3. Delete the now-dead "Just you so far" empty-state JSX (the centered `<div className="mt-12 flex flex-col items-center justify-center text-center">` block containing UsersRound icon, h2, p, and the centered Button).

4. Update the top-right header button to match the API Keys pattern — add a `<Plus className="mr-2 h-4 w-4" />` icon prefix before the "Add Team Member" text:
   ```tsx
   <Button onClick={() => setDialogOpen(true)}>
     <Plus className="mr-2 h-4 w-4" />
     Add Team Member
   </Button>
   ```

5. Update imports at the top of the file:
   - Change `import { Lock, UsersRound } from "lucide-react";` to `import { Lock, Plus, UsersRound } from "lucide-react";` (Plus added; Lock still used by the role-gate block; UsersRound still used by the `!activeOrgId` block).

6. Keep everything else intact: `useCurrentRole`, `load()`, loading skeleton, role gate (Lock), `!activeOrgId` guard (UsersRound), AddTeamMemberDialog. Do NOT touch the role gate. Do NOT touch data-fetching logic.

Do NOT add any bilingual/Thai copy (English-only per user preference).
Do NOT create a new shared empty-state component — the existing DataTable already handles the empty state correctly.
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "team/page|error" | head -20 || true</automated>

Manual visual check after build (not blocking for this task):
- Navigate to /app/team as an org admin with an org that has only the current user as a member
- Confirm: search bar at top, table header row visible, single row "No team members yet" with description, pagination footer "Showing 0-0 of 0" + "Rows per page: 10"
- Confirm: no "Just you so far" heading, no big centered icon, no centered "Add Team Member" button
- Confirm: top-right button shows "+ Add Team Member" (Plus icon + text)
  </verify>
  <done>
`justYou` variable and its JSX branch are fully removed. `TeamDataTable` is rendered unconditionally for the admin-with-activeOrg path. Top-right button has a Plus icon prefix. TypeScript compiles without new errors in this file.
  </done>
</task>

<task type="auto">
  <name>Task 2: Align TeamDataTable empty-state copy and search placeholder to API Keys pattern</name>
  <files>apps/web/src/components/team/team-data-table.tsx</files>
  <action>
Edit `apps/web/src/components/team/team-data-table.tsx`:

1. Change `searchPlaceholder="Filter members..."` to `searchPlaceholder="Search team members..."` to match the API Keys page cadence ("Search API keys...").

2. Change the `emptyState` prop to match the API Keys copy exactly (same verb "Get started by ..."):
   ```tsx
   emptyState={{
     title: "No team members yet",
     description: "Get started by adding your first team member.",
   }}
   ```
   (Previous: `title: "No team members"`, `description: "Add your first team member to get started."` — reword to match API Keys exactly.)

3. Keep everything else intact: `searchKey="name"`, `facetedFilters` for Role, the Remove action, AlertDialog confirmation. Do NOT change the column definitions (that lives in team-columns.tsx and is out of scope).

4. Pass through the existing `loading` behavior if one is currently missing — inspect the current file: TeamDataTable does NOT currently receive a `loading` prop from TeamPage. Leave that as-is for this scope (loading state parity is out of scope; the Team page already shows a top-level Skeleton while `useCurrentRole` loads). Adding a fetching-level skeleton is a follow-up, not part of empty-state alignment.

English-only copy. No Thai/bilingual strings.
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "team-data-table|error" | head -20 || true</automated>

Manual visual check:
- With 0 team members rendered, empty row text reads exactly: "No team members yet" (title) and "Get started by adding your first team member." (description)
- Search bar placeholder reads exactly: "Search team members..."
  </verify>
  <done>
TeamDataTable renders with `searchPlaceholder="Search team members..."`. Empty-state title is "No team members yet" and description is "Get started by adding your first team member." TypeScript compiles clean.
  </done>
</task>

</tasks>

<verification>
Overall phase check (run once at the end):

1. `cd apps/web && npx tsc --noEmit` — zero new type errors introduced by these two files.
2. Run the dev server (`pnpm --filter web dev` or project's equivalent) and navigate to `/app/team` as an org admin whose active org has ONLY the current user as a member (this is the scenario that previously triggered the `justYou` branch). Confirm all six must-have truths visually:
   - Search bar at top with placeholder "Search team members..."
   - Table header row (Name / Email / Role / Added) visible
   - One empty row with "No team members yet" + "Get started by adding your first team member."
   - Pagination footer "Showing 0-0 of 0" + "Rows per page: 10"
   - No centered icon / "Just you so far" heading / centered button anywhere on the page
   - Top-right button shows a Plus icon followed by "Add Team Member"
3. Side-by-side compare with `/app/developer/api-keys` (empty state) — layout and component positions should be pixel-equivalent (with the obvious copy differences: "team members" vs "API keys", "Add Team Member" vs "Create API Key").
4. Regression check: with 2+ team members, the populated table still renders correctly (unchanged from before — this task does not touch populated-state behavior).
</verification>

<success_criteria>
- apps/web/src/app/app/team/page.tsx no longer contains the string "Just you so far"
- apps/web/src/app/app/team/page.tsx no longer contains a `justYou` variable
- apps/web/src/app/app/team/page.tsx renders `<TeamDataTable ... />` unconditionally inside the admin+activeOrg path
- apps/web/src/app/app/team/page.tsx header button contains `<Plus className="mr-2 h-4 w-4" />` before "Add Team Member"
- apps/web/src/components/team/team-data-table.tsx contains `searchPlaceholder="Search team members..."`
- apps/web/src/components/team/team-data-table.tsx emptyState has `title: "No team members yet"` and `description: "Get started by adding your first team member."`
- TypeScript type-check passes (`npx tsc --noEmit`) with no new errors attributable to these files
- Populated-state rendering (2+ members) is unchanged — no regression
</success_criteria>

<output>
After completion, create `.planning/quick/260422-cnv-align-team-page-empty-state-with-api-key/260422-cnv-SUMMARY.md` summarizing:
- Files changed (2)
- Before/after screenshots suggested (Team page empty state alongside API Keys empty state for visual confirmation)
- Finding confirmed: no new shared abstraction created — both pages already consume the same DataTable primitive; only page-level and wrapper-level string/prop drift had to be corrected
- Out-of-scope deferrals explicitly NOT done: loading skeleton parity for TeamDataTable, column definition changes, populated-state changes, invite-flow changes
</output>
