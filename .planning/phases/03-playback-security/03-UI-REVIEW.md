# Phase 3 -- UI Review

**Audited:** 2026-04-10
**Baseline:** 03-UI-SPEC.md design contract
**Screenshots:** not captured (dev server returns 307 redirect, no Playwright MCP available)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All CTA labels, empty states, and error messages match UI-SPEC contract exactly |
| 2. Visuals | 3/4 | Clear focal points and hierarchy; icon-only embed button lacks aria-label |
| 3. Color | 4/4 | Policy level badges match spec colors; accent usage restrained to declared elements only |
| 4. Typography | 4/4 | Three sizes (xs/sm/xl) plus base used consistently; weights limited to regular, medium, semibold |
| 5. Spacing | 3/4 | Consistent 8-point scale usage; three arbitrary pixel values in dialogs |
| 6. Experience Design | 3/4 | Loading, error, and empty states present throughout; no ErrorBoundary for embed page fetch failures |

**Overall: 21/24**

---

## Top 3 Priority Fixes

1. **Embed button missing aria-label** -- Screen reader users cannot identify the icon-only `</>` button on camera detail page -- Add `aria-label="Embed Code"` to the Button in `cameras/[id]/page.tsx:299` (the Tooltip provides visual label but not programmatic)
2. **Embed page hardcoded colors outside CSS variable system** -- `#000` and `#fff` used inline in embed page instead of CSS variables -- Acceptable for the isolated embed context per spec (pure black background, no branding), but `color: '#fff'` on the spinner should use `hsl(0 0% 100%)` for consistency with the spec's hsl notation
3. **Arbitrary pixel values in dialog max-width** -- `sm:max-w-[500px]` in create/edit policy dialogs and `w-[50px]` in table action column -- Replace with Tailwind preset values: `sm:max-w-lg` (512px) for dialogs, `w-12` (48px) or `w-14` (56px) for table column

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

All copy matches the UI-SPEC contract:

- **CTAs:** "Create Policy" (Plus icon), "Save Policy", "Save Changes", "Delete Policy" (destructive) -- all per spec
- **Empty states:**
  - Policy list: "No playback policies" + "The system default policy is active..." -- exact spec match (`page.tsx:129-134`)
  - Sessions table: "No active sessions" + "Playback sessions will appear here..." -- matches spec (`sessions-table.tsx:93-97`)
- **Error states:**
  - Policy save: "Could not save policy. Please check the form values and try again." -- exact spec match (`create-policy-dialog.tsx:123`, `edit-policy-dialog.tsx:140`)
  - Embed errors: All three error messages match spec verbatim (`embed/[session]/page.tsx:41-42`, `:86-87`, `:89-90`)
- **Delete confirmation:** AlertDialog with "Delete Policy" title and spec-matching body text (`page.tsx:239-244`)
- **Embed dialog notes:** Each tab has contextual help text explaining placeholder replacement (`embed-code-dialog.tsx:100-116`)
- No generic labels (Submit, Click Here, OK) found anywhere

### Pillar 2: Visuals (3/4)

Strong visual hierarchy and focal points:

- **Page header pattern consistent:** "Playback Policies" heading + "Create Policy" button (top-right) -- matches spec focal point
- **Camera detail embed button:** Code2 icon button with Tooltip "Embed Code" positioned in header action row -- correct per spec
- **PolicyLevelBadge:** Four distinct colors (gray/emerald/amber/primary) provide clear visual differentiation
- **ResolvedPolicyCard:** Green left-border (`border-l-2 border-primary`) highlights fields set at current level -- matches spec
- **Empty state pattern:** Centered icon (48px via h-12 w-12) + heading + body + CTA -- consistent across all empty states
- **Embed page:** Fullscreen black with centered content for all states (loading/error/playing)

Issue found:
- **Icon-only embed button (`cameras/[id]/page.tsx:299-304`):** The `<Code2>` icon button uses a Tooltip for label but no `aria-label` attribute. Screen readers will not identify this button. The Tooltip wraps the button, but `TooltipTrigger` does not automatically set `aria-label`.

### Pillar 3: Color (4/4)

Color usage is well-controlled and matches the spec:

- **Policy level badges** -- exact spec match:
  - SYSTEM: `bg-muted text-muted-foreground` (gray)
  - PROJECT: `bg-emerald-700 text-white` (dark green)
  - SITE: `bg-amber-500 text-white` (amber)
  - CAMERA: `bg-primary text-primary-foreground` (green)
- **Session status badges:**
  - Active: `bg-primary text-primary-foreground` (green) -- matches spec
  - Expired: `variant="secondary"` (gray) -- matches spec
- **Accent (primary) reserved usage:** Only on declared elements -- Create Policy button, Save Policy button, active session badge, camera-level policy badge, resolved card current-level border. Count: 4 unique component usages. Well within 10% budget.
- **Destructive color:** Used for delete actions and error text only -- correct per spec
- **Hardcoded colors:** Only 2 found, both in embed page (`#000` background, `#fff` spinner) -- acceptable per spec which explicitly states "hsl(0 0% 0%) pure black" for embed

### Pillar 4: Typography (4/4)

Font sizes used across Phase 3 components:

| Size | Tailwind Class | Usage Count | Spec Role |
|------|---------------|-------------|-----------|
| 12px | `text-xs` | 18 instances | Label: badge text, hints, error text, timestamps |
| 14px | `text-sm` | 12 instances | Body: field labels, table cells, descriptions |
| 16px | `text-base` | 1 instance | ResolvedPolicyCard title |
| 20px | `text-xl` | 4 instances | Heading: page titles, empty state headings |

Font weights:
- `font-semibold`: Page headings and section headers
- `font-medium`: Table name column, resolved policy values
- `font-mono`: Session IDs, code blocks, stream URLs

This aligns with the spec's 3-role typography (Body 14px, Label 12px, Heading 20px). No unauthorized sizes (no 3xl, 4xl, etc.). Monospace used correctly for technical content.

### Pillar 5: Spacing (3/4)

Standard Tailwind spacing scale used consistently:

- `space-y-6`: Page-level sections (24px) -- matches spec "lg" token
- `space-y-4`: Form field groups (16px) -- matches spec "md" token
- `space-y-2`: Label-to-input gaps (8px) -- matches spec "sm" token
- `gap-2`, `gap-4`: Grid and flex gaps on 8-point scale
- `py-16`, `py-12`: Empty state vertical padding (64px, 48px) -- matches spec 3xl/2xl tokens
- `p-4`: Card and code block padding (16px) -- matches spec "md" token
- `mt-2`, `mt-4`, `mb-4`: Consistent 8-point multiples

Arbitrary values found (3 instances):
1. `sm:max-w-[500px]` in `create-policy-dialog.tsx:136` and `edit-policy-dialog.tsx:153` -- could use `sm:max-w-lg` (512px)
2. `w-[50px]` in `page.tsx:154` for action column -- could use `w-12` (48px) or `w-14` (56px)
3. `sm:max-w-[600px]` in `embed-code-dialog.tsx:86` -- could use `sm:max-w-xl` (576px) or `sm:max-w-2xl` (672px)

These are minor and within acceptable tolerances for dialog/table column sizing.

### Pillar 6: Experience Design (3/4)

State coverage is comprehensive:

**Loading states:**
- Policy list: Skeleton rows (`page.tsx:121-125`)
- Edit policy page: Skeleton blocks (`[id]/page.tsx:71-77`)
- Edit policy dialog: Skeleton rows (`edit-policy-dialog.tsx:158-163`)
- Resolved policy card: Loader2 spinner (`resolved-policy-card.tsx:90-92`)
- Sessions table: Text loading indicator (`sessions-table.tsx:82-85`)
- Embed page: White spinner on black background (`embed/[session]/page.tsx:152-157`)

**Error states:**
- Policy list fetch error: Destructive banner (`page.tsx:114-117`)
- Edit policy load error: Centered muted text (`[id]/page.tsx:81-86`)
- Form save errors: Inline destructive text (`create-policy-dialog.tsx:266-268`)
- Embed page: Three distinct error messages for session not found, stream offline, and generic errors

**Empty states:**
- Policy list: Icon + heading + body + CTA (`page.tsx:127-142`)
- Sessions table: Icon + heading + body (`sessions-table.tsx:89-99`)
- Resolved policy card: "Select a camera to preview" (`resolved-policy-card.tsx:133-136`)

**Interactive states:**
- Delete policy: AlertDialog confirmation with destructive button (`page.tsx:231-257`)
- Stop stream: AlertDialog confirmation (`cameras/[id]/page.tsx:561-579`)
- Save buttons: Disabled during save with "Saving..." text
- Copy button: "Copy" -> "Copied!" with icon swap for 2 seconds (`code-block.tsx:35-45`)
- Sessions table: Auto-refresh every 30 seconds (`sessions-table.tsx:77`)
- Sessions table: "Load More" pagination (`sessions-table.tsx:155-163`)

Issues:
- **No ErrorBoundary for embed page:** If the fetch call in embed page throws an unhandled error (e.g., network completely down before fetch starts), React will crash without a friendly fallback. The try/catch handles fetch errors, but a React ErrorBoundary wrapper would be safer for the public-facing embed page.
- **Sessions table loading state uses text only** (`sessions-table.tsx:82-85`): Uses plain "Loading sessions..." text instead of Skeleton rows, which is inconsistent with the rest of the app's Skeleton loading pattern.

---

## Registry Safety

Registry audit: No third-party registries declared. All components from shadcn official registry. No flags.

---

## Files Audited

- `apps/web/src/app/admin/policies/page.tsx`
- `apps/web/src/app/admin/policies/new/page.tsx`
- `apps/web/src/app/admin/policies/[id]/page.tsx`
- `apps/web/src/app/admin/policies/components/create-policy-dialog.tsx`
- `apps/web/src/app/admin/policies/components/edit-policy-dialog.tsx`
- `apps/web/src/app/admin/policies/components/policy-form.tsx`
- `apps/web/src/app/admin/policies/components/policy-level-badge.tsx`
- `apps/web/src/app/admin/policies/components/domain-list-editor.tsx`
- `apps/web/src/app/admin/policies/components/resolved-policy-card.tsx`
- `apps/web/src/app/admin/cameras/[id]/page.tsx`
- `apps/web/src/app/admin/cameras/components/embed-code-dialog.tsx`
- `apps/web/src/app/admin/cameras/components/code-block.tsx`
- `apps/web/src/app/admin/cameras/components/sessions-table.tsx`
- `apps/web/src/app/embed/[session]/page.tsx`
- `apps/web/src/app/embed/[session]/layout.tsx`
- `apps/web/src/components/sidebar-nav.tsx`
