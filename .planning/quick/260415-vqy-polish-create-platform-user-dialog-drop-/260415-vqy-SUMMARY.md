---
quick_id: 260415-vqy
description: Polish Create Platform User dialog — drop misleading "super admin" copy and stop defaulting Organization to System
completed: 2026-04-15
---

# Quick 260415-vqy — Complete

## What changed

- `apps/web/src/app/admin/users/components/create-platform-user-dialog.tsx` — Dialog description replaced "Create a super admin or org admin" → "Create a user and assign them to any organization" to match actual capability (Role dropdown offers Member roles only; User.role=admin cannot be minted from this UI).
- `apps/web/src/app/admin/users/page.tsx` — Sort the org list passed into the dialog with System last (tenant orgs alphabetical first). `organizationId` default is already `""`, so `<SelectValue placeholder="Select an organization" />` renders until the user picks deliberately.

## must_haves verification

| truth | status | evidence |
|---|---|---|
| Dialog description no longer claims super-admin creation | pass | grep `"super admin or org admin"` on updated file → 0 matches |
| Organization dropdown requires explicit selection | pass | `defaultValues.organizationId = ""`; no Select pre-fills; placeholder text visible |
| System is not the first Organization option | pass | `page.tsx` sorts orgs with `name.toLowerCase() === 'system'` pushed to end |

## Context

Raised during UAT 999.1 Test 8 as Issue A + Issue B (minor). Blocker (Issue C — org list filtered to System-only) was already fixed inline during UAT.
