---
quick_id: 260415-vqy
description: Polish Create Platform User dialog — drop misleading "super admin" copy and stop defaulting Organization to System
created: 2026-04-15
---

# Quick 260415-vqy: Create Platform User dialog polish

## Context

Raised during UAT 999.1 Test 8. Current `apps/web/src/app/admin/users/components/create-platform-user-dialog.tsx` has two minor UX defects:

- **Issue A:** Description reads "Create a super admin or org admin." — but the Role dropdown only offers Member-level roles (admin/operator/developer/viewer). A real super admin (User.role=admin) cannot be created here, so the copy misleads.
- **Issue B:** Organization dropdown defaults to the System org (platform-internal org for super admins). Creating a new user inside System is almost never intended — tenant Org Admin creation is the common case. Default to empty placeholder so the user picks deliberately.

## Tasks

### 1. Rewrite dialog description and force explicit Organization selection

**Files:** `apps/web/src/app/admin/users/components/create-platform-user-dialog.tsx`

**Action:**
- Replace description with: "Create a user and assign them to any organization. They can sign in immediately with the password you set."
- Leave `defaultValues.organizationId = ""` (already empty) and ensure `<SelectValue placeholder="Select an organization" />` shows even if a stale value lingered.
- Reorder the Organization dropdown so "System" sorts to the bottom (or is visually de-emphasised). Easiest: sort `orgs` with System last in the page that passes the list, not the dialog.
- Keep the existing Role dropdown options unchanged — they correctly reflect Member roles.

**Verify:**
- `grep -q "super admin or org admin" apps/web/src/app/admin/users/components/create-platform-user-dialog.tsx` returns non-zero (phrase removed).
- `grep -q "Create a user and assign them to any organization" apps/web/src/app/admin/users/components/create-platform-user-dialog.tsx` matches.
- Dialog opens with placeholder "Select an organization" instead of a pre-selected value.
- Organizations list in the page passes System last.

**Done:** Copy and default behaviour address UAT Issues A+B; no other behaviour changes.

## must_haves

- truths:
  - "The dialog's description text does not claim it can create a super admin."
  - "The Organization dropdown requires the user to make an explicit selection (no System pre-fill)."
  - "System is not the first Organization option in the dropdown."
- artifacts:
  - "Updated `apps/web/src/app/admin/users/components/create-platform-user-dialog.tsx` with the new description."
  - "Updated `apps/web/src/app/admin/users/page.tsx` to sort orgs with System last before passing to the dialog."
- key_links:
  - "page.tsx passes orgs → dialog."
  - "dialog uses orgs without re-sorting."
