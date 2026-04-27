---
status: partial
phase: 23-tech-debt-cleanup-phase-0-prerequisites
source: [23-VERIFICATION.md]
started: 2026-04-27T18:45:00Z
updated: 2026-04-27T18:45:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Re-run api test suite locally to confirm green
expected: `pnpm --filter @sms-platform/api test` returns `828 passed | 0 failed | 121 todo | 11 skipped` (or close — 11 skipped are Redis-gated integration tests)
result: [pending]

Command:
```bash
pnpm --filter @sms-platform/api test 2>&1 | tail -5
```

### 2. Visual smoke test /app/recordings/[id]
expected: Recording playback page header shows
- Tag badge row (using TagsCell component) when the parent camera has tags
- Description line-clamped to 2-3 lines with "Show more" disclosure when overflowing
- Read-only badges (no clickable filter)
- Both displayed above the player
result: [pending]

Steps:
1. Start dev stack: `pnpm dev`
2. Open browser to a recording for a camera with tags + description (must have v1.2 data — pick a Camera that has both populated)
3. URL: `http://localhost:3000/app/recordings/{recording-id}`
4. Confirm header zone above the player shows badge row + line-clamped description
5. If description is long, click "Show more" → expands; click "Show less" → collapses
6. Memory `feedback_ui_pro_minimal` applies — check spacing/density feels minimal, not cluttered

### 3. Activate CI gate (DEBT-02 Tasks 4 + 5 deferred from 23-05)
expected: `gh repo create` (or `git remote add`), push to GitHub, wait for first green `test.yml` run, then enable branch protection requiring `test` check on `main`
result: [pending]

Steps (when ready to push to GitHub):
1. Create GitHub repo + push:
   ```bash
   gh repo create <name> --source=. --remote=origin --private --push
   # OR for existing repo:
   git remote add origin git@github.com:<owner>/<repo>.git
   git push -u origin main
   ```

2. Wait for first CI run (~3-5 min):
   ```bash
   gh run watch --workflow=test.yml
   ```
   First run must conclude `success`. If it fails, fix the failure before enabling branch protection.

3. Enable branch protection requiring `test` check:
   ```bash
   gh api \
     --method PUT \
     -H "Accept: application/vnd.github+json" \
     -H "X-GitHub-Api-Version: 2022-11-28" \
     /repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection \
     --input - <<'EOF'
   {
     "required_status_checks": {
       "strict": true,
       "contexts": ["test"]
     },
     "enforce_admins": false,
     "required_pull_request_reviews": null,
     "restrictions": null
   }
   EOF
   ```

4. Verify:
   ```bash
   gh api /repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection -q '.required_status_checks.contexts'
   # Expected: ["test"] or ["Test / test"]
   ```

   If GitHub renders the check name as `Test / test` (workflow name / job name), use `["Test / test"]` instead of `["test"]`.

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
