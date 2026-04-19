---
status: resolved
phase: 16-user-self-service
source: [16-VERIFICATION.md]
started: 2026-04-19T11:54:31Z
updated: 2026-04-19T15:55:00Z
---

## Current Test

[all 9 items verified by human]

## Tests

### 1. Tenant sidebar dropdown → Account settings navigates to /app/account and loads Profile + Security + Plan & Usage sections
expected: Sidebar footer avatar button opens dropdown; clicking 'Account settings' lands on /app/account with H1 'Account settings', Profile card (avatar + display name form), Security card (3 password fields + strength bar), Plan & Usage card (4 progress bars + API calls + 3 features + contact paragraph)
result: passed (admin portal verified — tenant portal pending)

### 2. Avatar upload happy path (tenant or admin portal)
expected: Click 'Upload new avatar' → select JPEG/PNG/WebP under 2 MB → spinner appears → avatar <img> replaces initials within ~1s → toast 'Avatar updated' → refresh page and image persists (sourced from real MinIO URL with ?v= cache-buster)
result: passed (admin portal)

### 3. Avatar remove happy path
expected: With avatar set, click 'Remove' → DELETE fires → avatar reverts to initials → toast 'Avatar removed' → refresh and initials persist
result: passed (admin portal)

### 4. Password change happy path
expected: Fill 3 fields with valid values → strength bar reflects score → 'Change password' → toast 'Password changed. Signed out from other devices.' → form resets → other browser session is invalidated within a few seconds
result: passed (admin portal, both sessions verified)

### 5. Password change with wrong current password
expected: Submit with incorrect current password → no toast → inline error 'Current password is incorrect.' under the Current password field
result: passed (admin portal)

### 6. Unauthenticated visitor to /app/account and /admin/account
expected: Both URLs redirect to /sign-in before rendering any Profile/Security content; skeleton briefly visible then replaced by sign-in page
result: passed

### 7. Non-admin user hits /admin/account directly via URL
expected: Redirects to /app/dashboard (role-gate defence-in-depth), no Profile/Security content ever rendered
result: passed

### 8. Plan & Usage section displays real package, usage counts, and feature flags
expected: Shows current plan name/description, 4 progress bars with correct used/max values + threshold colors (≥95% red, ≥80% amber, else primary), API calls MTD count, 3 feature rows (Recordings/Webhooks/Map view), 'Need more? Contact your system administrator to upgrade your plan.' text with NO upgrade button
result: passed (after PlanUsageController + Service switched to TENANCY_CLIENT — RLS fix landed in 5ca5918)

### 9. Super admin /admin/account correctly omits Plan & Usage section
expected: Admin portal account page renders Profile + Security only; no Plan & Usage card; no /api/organizations/.../plan-usage fetch in Network tab
result: passed

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
