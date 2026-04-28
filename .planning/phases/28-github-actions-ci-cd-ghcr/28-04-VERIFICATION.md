# Phase 28 Verification Runbook

**Purpose:** Live-execute the 9 verification checkpoints from CONTEXT D-22 against
the GitHub Actions workflows landed by Plans 01-03. Plan 04 (this runbook) is
the BLOCKING gate before Phase 28 is marked complete.

**Prerequisites:**
- Plans 28-01, 28-02, 28-03 committed to `main` (workflows exist on default branch)
- Operator has push permission to the repo (for tag push + GHCR_ORG resolution)
- Operator has `gh` CLI installed and authenticated (`gh auth status` exit 0)
- Operator has `docker` CLI installed
- Operator knows the GitHub repo owner (e.g. `acme-corp` or username) — referenced as `<OWNER>` below

## Manual operator action — D-19 GHCR public visibility toggle (one-time)

GHCR images default visibility on first publish:
- If the repo is **public** → images inherit public visibility automatically
- If the repo is **private** → images publish as private; operator must toggle to public per D-19

**Why public:** D-19 + Pitfall 11 — public images let operators `docker compose pull` without `docker login ghcr.io` (no PAT trap). This is the explicit Phase 28 stance for the OSS-friendly self-hostable v1.3 deploy model.

**Steps (one-time, after the FIRST publish completes):**
1. Navigate to `https://github.com/<OWNER>?tab=packages` (or `https://github.com/orgs/<OWNER>/packages` for org accounts)
2. Click `sms-api`
3. Right sidebar → "Package settings" → scroll to "Danger Zone" → "Change package visibility" → select "Public" → confirm by typing the package name
4. Repeat for `sms-web`

**Note:** This toggle persists. Future tag pushes inherit the visibility. If the toggle is set BEFORE first publish, it cannot be toggled (the package does not yet exist) — must run after Checkpoint #1 completes successfully.

***

## Checkpoint state log

Update each row's `Status` column with `pass`, `fail`, or `blocked` as the operator runs the checkpoint. Include a one-line note on failure or blocker.

| # | Checkpoint | Status | Note |
|---|------------|--------|------|
| 1 | Tag push triggers matrix build, both jobs green within 10 min | pending | |
| 2 | Anonymous `docker pull` succeeds for both images (D-19 public visibility) | pending | |
| 3 | `docker inspect` shows correct RepoTags + OCI labels for prerelease | pending | |
| 4 | `gh attestation verify` exits 0 for both images (DEPLOY-05) | pending | |
| 5 | GitHub Release `v1.3.0-test` exists with prerelease badge + image-ref body | pending | |
| 6 | PR build runs but does NOT push to GHCR | pending | |
| 7 | Push to main publishes `:main` + `:latest` + `:sha-<7>` only | pending | |
| 8 | Phase 23 test.yml passes on the same commits | pending | |
| 9 | Stable `v1.3.0` tag re-attaches `:latest` + `:v1.3` | pending | |

***

## Checkpoint commands + expected output

### Checkpoint 1 — Test-tag matrix build (D-22 #1)

```sh
# Push the test tag (must NOT collide with an existing release tag)
git tag v1.3.0-test
git push origin v1.3.0-test

# Watch the run (replace with the run ID gh prints)
gh run watch
```

**Expected:** `Build & Publish Images / build (api)` and `Build & Publish Images / build (web)` both complete successfully. Total wall-clock < 10 minutes (cold cache; warm cache <3 min).

**Pass criterion:** Both matrix jobs end with green checkmarks; `gh run list --workflow=build-images.yml --limit 1 --json conclusion --jq '.[0].conclusion'` returns `"success"`.

***

### Checkpoint 2 — Anonymous public pull (D-22 #2, D-19)

**Precondition:** Checkpoint 1 passed AND D-19 visibility toggle done.

Run from a machine that has NEVER run `docker login ghcr.io`:

```sh
# Use a docker context with no GHCR auth, OR delete ~/.docker/config.json registry entry first
docker logout ghcr.io 2>/dev/null || true

docker pull ghcr.io/<OWNER>/sms-api:v1.3.0-test
docker pull ghcr.io/<OWNER>/sms-web:v1.3.0-test
```

**Expected:** Both pulls succeed without `unauthorized` error.

**Pass criterion:** Both `docker pull` commands exit 0. If either returns `denied: requested access to the resource is denied` or `401 Unauthorized`, re-confirm the D-19 visibility toggle was applied to BOTH packages.

***

### Checkpoint 3 — RepoTags + OCI labels (D-22 #3, D-05, D-07)

```sh
docker inspect ghcr.io/<OWNER>/sms-api:v1.3.0-test \
  --format '{{json .RepoTags}}' | jq

docker inspect ghcr.io/<OWNER>/sms-api:v1.3.0-test \
  --format '{{json .Config.Labels}}' | jq
```

**Expected RepoTags (D-06 prerelease policy):**
- Includes: `ghcr.io/<OWNER>/sms-api:v1.3.0-test`, `ghcr.io/<OWNER>/sms-api:sha-<7-char>`
- Excludes: `ghcr.io/<OWNER>/sms-api:latest`, `ghcr.io/<OWNER>/sms-api:v1.3`

**Expected Labels (D-07 OCI metadata):**
- `org.opencontainers.image.source` set to `https://github.com/<OWNER>/<repo>`
- `org.opencontainers.image.revision` set to commit SHA
- `org.opencontainers.image.version` set to `v1.3.0-test`
- `org.opencontainers.image.created` set to ISO 8601 timestamp

**Pass criterion:** `RepoTags` array contains 2 entries (the version tag + sha tag); `Config.Labels` JSON contains all 4 OCI keys above.

***

### Checkpoint 4 — Provenance attestation (D-22 #4, DEPLOY-05)

```sh
gh attestation verify oci://ghcr.io/<OWNER>/sms-api:v1.3.0-test --owner <OWNER>
gh attestation verify oci://ghcr.io/<OWNER>/sms-web:v1.3.0-test --owner <OWNER>
```

**Expected output (per image):**
```
Loaded digest sha256:<...> for oci://ghcr.io/<OWNER>/sms-api:v1.3.0-test
Loaded 1 attestation from GitHub API
✓ Verification succeeded!

The following policy criteria were met:
- Subject:        sha256:<...>
- Issuer:         https://token.actions.githubusercontent.com
- Predicate type: https://slsa.dev/provenance/v1
```

**Pass criterion:** Both commands exit 0 and print "Verification succeeded".

***

### Checkpoint 5 — GitHub Release entry (D-22 #5, Plan 02)

```sh
gh release view v1.3.0-test --json tagName,isPrerelease,body --jq '{tag: .tagName, prerelease: .isPrerelease, body: .body}'
```

**Expected:**
- `prerelease: true` (D-17 regex matched `-test`)
- `body` contains all of:
  - `ghcr.io/<OWNER>/sms-api:v1.3.0-test`
  - `ghcr.io/<OWNER>/sms-web:v1.3.0-test`
  - `gh attestation verify oci://`
  - `docker compose pull`
  - Auto-generated commit-history section (entries from previous tag → this tag)

**Pass criterion:** `gh release view` returns a JSON object with `prerelease: true` and the body matches all 5 markers above.

***

### Checkpoint 6 — PR build-only mode (D-22 #6, D-02)

Open a draft PR that touches `apps/api/Dockerfile` (e.g. add a `# Phase 28 verification PR — discard` comment line):

```sh
git checkout -b phase-28-verify-pr-build-only
echo "# Phase 28 verification PR — discard" >> apps/api/Dockerfile
git add apps/api/Dockerfile
git commit -m "test(28-04): verify PR build does not push to GHCR"
git push origin phase-28-verify-pr-build-only
gh pr create --draft --title "Phase 28 verification (do not merge)" --body "Verification only — D-22 #6 — discard after Checkpoint 6 passes"
```

Watch the PR run. After it completes, verify:

```sh
# Should show NO new versions for v1.3.0-test... only Checkpoint 1's existing version
gh api /users/<OWNER>/packages/container/sms-api/versions --jq '.[].metadata.container.tags' | sort -u
```

**Expected:** PR run completed (build + smoke green for both matrix arms); GHCR version list does NOT contain a new entry tied to the PR ref. Only Checkpoint 1's tags remain.

**Pass criterion:** PR workflow succeeds AND GHCR shows no PR-pushed version. After confirmation, close the PR without merging and delete the branch:

```sh
gh pr close phase-28-verify-pr-build-only --delete-branch
```

***

### Checkpoint 7 — Main push tag set (D-22 #7, D-05)

After Checkpoint 6, merge a non-trivial commit to main (e.g. a docs-only change or this VERIFICATION.md file landing). Watch the workflow on main:

```sh
gh run watch
```

After completion:

```sh
gh api /users/<OWNER>/packages/container/sms-api/versions --jq '.[0].metadata.container.tags' | jq
```

**Expected tags on the latest version:** `main`, `latest`, `sha-<7-char>` (exactly 3 tags — no semver, no prerelease).

**Pass criterion:** Tag set on the latest GHCR version matches `["main", "latest", "sha-XXXXXXX"]` (any order; SHA matches `git rev-parse --short HEAD` truncated to 7 chars).

***

### Checkpoint 8 — Phase 23 test.yml co-existence (D-22 #8, D-20)

For the same commit SHA Checkpoint 7 ran against:

```sh
gh run list --workflow=test.yml --limit 1 --json conclusion,headSha --jq '.[0]'
```

**Expected:**
- `conclusion: "success"`
- `headSha` matches the commit SHA Checkpoint 7 ran on

**Pass criterion:** `test.yml` is green on the same commit `build-images.yml` ran. Confirms D-20 (no test breakage from Phase 28 introducing the build workflow).

***

### Checkpoint 9 — Stable semver tag (D-22 #9, D-05, D-06)

Push the real production tag:

```sh
git tag v1.3.0
git push origin v1.3.0
gh run watch
```

After completion:

```sh
gh api /users/<OWNER>/packages/container/sms-api/versions --jq '.[0].metadata.container.tags' | jq
```

**Expected tags on the latest version:** `v1.3.0`, `v1.3`, `latest`, `sha-<7-char>` (exactly 4 — D-05 stable semver re-attaches `:latest` + `:v1.3` because `v1.3.0` is NOT prerelease).

**Pass criterion:** Tag set is `["v1.3.0", "v1.3", "latest", "sha-XXXXXXX"]` (any order). Run `gh attestation verify oci://ghcr.io/<OWNER>/sms-api:v1.3.0 --owner <OWNER>` and confirm exit 0 — proves attestation works on stable releases too.

***

## Bonus: Pitfall 8 leak check (recommended, not in D-22)

```sh
docker history ghcr.io/<OWNER>/sms-api:v1.3.0 --no-trunc | grep -c "\.env"
```

**Expected:** Returns 0 (no `.env` layer in image history). If non-zero, IMMEDIATELY rotate all secrets and investigate the build context — Phase 24 root `.dockerignore` + Phase 25 per-app `.dockerignore` should prevent this.

***

## Failure handling

If any checkpoint fails:

1. Update its row in the state log with `fail` and a one-line note
2. Capture the failing command output to `.planning/phases/28-github-actions-ci-cd-ghcr/28-04-FAILURE-<N>.md`
3. STOP execution — do not proceed to subsequent checkpoints
4. Triage:
   - Workflow YAML bug → escalate to Plan 03 (re-execute with fixes)
   - Smoke script bug → escalate to Plan 01
   - Release body bug → escalate to Plan 02
   - GHCR visibility bug → re-confirm D-19 toggle was applied
   - GitHub-side flake → retry once before declaring fail

After all 9 checkpoints pass, this runbook serves as the verification log for Phase 28 SUMMARY.md.
