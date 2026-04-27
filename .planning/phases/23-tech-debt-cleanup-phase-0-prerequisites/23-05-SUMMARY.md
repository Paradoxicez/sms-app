---
plan: 23-05
phase: 23-tech-debt-cleanup-phase-0-prerequisites
status: partial
completed_tasks: 3
total_tasks: 5
deferred_tasks: 2
date: 2026-04-27
requirements: [DEBT-02]
---

# Plan 23-05 — DEBT-02 CI Gate (Partial)

> **Status: partial.** Tasks 1-3 complete on main. Tasks 4-5 deferred until repo gets a GitHub remote (the artifact files exist locally; activation requires `git push`).

## Objective

Establish the CI quality gate so future failures cannot land on main. Workflow runs `pnpm install`, `prisma generate`, `pnpm test`, and `pnpm db:check-drift` against a Postgres 16 service container. After first CI run on main, branch protection requires the `test` check before merge.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create `.planning/todos/v1.4-test-backfill.md` (track 121 `it.todo` placeholders) | `2f48c74` | `.planning/todos/v1.4-test-backfill.md` |
| 2 | Add `engines.pnpm: ">=10"` to root package.json + regenerate lockfile under pnpm 10 | `d6f5876` | `package.json`, `pnpm-lock.yaml` |
| 3 | Create `.github/workflows/test.yml` (Postgres 16 service, pnpm 10, node 22, vitest, db:check-drift) | `997666c` | `.github/workflows/test.yml` |

## Deferred Tasks (require GitHub remote)

| Task | Name | Reason | Resume When |
|------|------|--------|-------------|
| 4 | Verify first CI run is green on main | No `origin` remote configured (`git remote -v` empty); no GitHub repo to push to | After user runs `gh repo create` (or `git remote add origin ...`) and pushes main |
| 5 | Enable branch protection requiring the `test` check | Same as Task 4 — branch protection cannot be configured for a non-existent repo, and the `test` check needs to run at least once before it appears in the dropdown (Pitfall 6) | After Task 4 completes |

### How to resume Task 4 + Task 5 once a remote is set up

1. **Create a GitHub repo (one-time):**
   ```bash
   gh repo create <name> --source=. --remote=origin --private --push
   ```
   Or for an existing GitHub repo:
   ```bash
   git remote add origin git@github.com:<owner>/<repo>.git
   git push -u origin main
   ```

2. **Verify first CI run:**
   ```bash
   gh run list --workflow=test.yml --limit 1 --json url,conclusion,createdAt
   # Wait until conclusion=success
   ```

3. **Enable branch protection (Task 5):**
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

   If the GitHub UI renders the check as `Test / test` (workflow name / job name), use `["Test / test"]` instead of `["test"]`.

4. **Verify branch protection:**
   ```bash
   gh api /repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection \
     -q '.required_status_checks.contexts'
   # Expected: ["test"] or ["Test / test"]
   ```

## Key Files Created

- `.github/workflows/test.yml` (90 LOC) — name: `test`, triggers on push/PR to main, Postgres 16 service container with health check, pnpm 10 + node 22 setup with cache, runs `pnpm install --frozen-lockfile` + `prisma generate` + `pnpm db:test:setup` + `pnpm test` + `pnpm db:check-drift`. Uses `SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sms_platform_shadow` env so the drift check works (consumes Plan 23-01 hotfix `ae20337`).
- `.planning/todos/v1.4-test-backfill.md` (39 LOC) — tracks the 121 `it.todo` placeholders for v1.4 backfill.
- `package.json` updated with `engines.pnpm: ">=10"`.
- `pnpm-lock.yaml` regenerated under pnpm 10.33.2 (format-only diff: `packageExtensionsChecksum` SHA256, peer-dependency hash compaction; no dependency version drift).

## Verification

- Tasks 1-3 verifiable today on main:
  - `test -f .github/workflows/test.yml` → present
  - `test -f .planning/todos/v1.4-test-backfill.md` → present
  - `node -e "process.exit(require('./package.json').engines?.pnpm ? 0 : 1)"` → exit 0
  - `pnpm install --frozen-lockfile` → succeeds (lockfile compatible)
- Tasks 4-5 verifiable only after `git remote add origin` + push.

## Deviations Tracked

1. **Pitfall 6 (chicken-and-egg) compounded by no remote** — Plan presumed the repo had a GitHub origin. Task 5 awaits a one-time `gh repo create` (out of GSD's plan scope; tracked in roadmap as a follow-up).
2. **pnpm 9 → 10 lockfile incompatibility** — adding `engines.pnpm: ">=10"` triggered `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` under pnpm 9. Resolved by upgrading executor to pnpm 10.33.2 and regenerating the lockfile (format-only diff, no version drift). Local devs on pnpm 9 will hit the same error and need to upgrade — documented in v1.4 backlog.
3. **Workflow added `SHADOW_DATABASE_URL` env block** — required by Plan 23-01 hotfix `ae20337` (which moved `db:check-drift` to env-var-driven shadow URL). Workflow sets it to `postgresql://postgres:postgres@localhost:5432/sms_platform_shadow` so Prisma can create/drop the shadow DB inside the service container.

## Phase 23 Coverage

| Requirement | Plan | Status |
|-------------|------|--------|
| DEBT-01 | 23-02 | ✓ Complete |
| DEBT-02 | 23-05 | ◐ Partial (Tasks 1-3 of 5; 4-5 deferred to first push) |
| DEBT-03 | 23-03 | ✓ Complete |
| DEBT-04 | 23-04 | ✓ Complete |
| DEBT-05 | 23-01 + 23-06 | ✓ Complete |

Success Criteria #5 (CI workflow runs on every push, locks merge on red) — workflow file exists; gate activation deferred until first push to GitHub origin.
