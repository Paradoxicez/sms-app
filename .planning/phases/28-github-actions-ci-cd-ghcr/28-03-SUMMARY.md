---
phase: 28-github-actions-ci-cd-ghcr
plan: 03
subsystem: ci-cd
tags: [github-actions, ghcr, build-push, attestation, sigstore, docker-buildx, deploy]

# Dependency graph
requires:
  - plan: 28-01
    provides: .github/scripts/smoke-{api,web}.sh — invoked between load and push as the pre-publish gate
  - phase: 25-multi-stage-dockerfiles-image-hardening
    provides: apps/{api,web}/Dockerfile — production multi-stage builds this workflow consumes
  - phase: 24-deploy-folder-dev-workflow-guardrails
    provides: root .dockerignore — excludes .env files from build context (Pitfall 8 mitigation)
provides:
  - .github/workflows/build-images.yml — primary tag/push/PR-driven image build + GHCR publish workflow
  - 4-tag scheme (vX.Y.Z + vX.Y + latest + sha-<7>) on stable tags via metadata-action@v5
  - 2-tag scheme (vX.Y.Z-suffix + sha-<7>) on prerelease tags (alpha/beta/rc/test)
  - sigstore build provenance attestations on every pushed image (DEPLOY-05)
  - PR-build smoke gate (build + smoke; no GHCR push) — closes the regression-detection loop on Phase 25 Dockerfiles
affects:
  - 28-04 (smoke test plan): Plan 04's `v1.3.0-test` tag pushes will exercise this workflow live; the prerelease branch of metadata-action emits 2-tag set with sha-<7> + vX.Y.Z-test, no :latest, no vX.Y
  - 26-deploy-compose: deploy/docker-compose.yml's `image: ghcr.io/${GHCR_ORG}/sms-{api,web}:${IMAGE_TAG}` consumes the namespace this workflow publishes
  - 29-operator-ux: deploy/scripts/update.sh's `docker compose pull` resolves images at the refs this workflow produces
  - 30-clean-vm-smoke-test: end-to-end pull-deploy from GHCR on a fresh VM relies on this workflow having published valid images

# Tech tracking
tech-stack:
  added:
    - actions/checkout@v4 (consistent with test.yml + release.yml pinning convention)
    - docker/setup-buildx-action@v3 (BuildKit multi-stage + GH Cache v2 backend)
    - docker/login-action@v3 (GHCR auth via GITHUB_TOKEN, no PAT)
    - docker/metadata-action@v5 (centralized tag list + OCI label generation)
    - docker/build-push-action@v6 (two-invocation pattern: load + push)
    - actions/attest-build-provenance@v2 (sigstore Fulcio + Rekor keyless signing)
  patterns:
    - "Two-step build/load → smoke → build/push pattern (D-10) — first build emits to local Docker daemon for smoke gate; second build pushes with full tag set; both share GH Cache v2 scope so the second build is a re-pack, not a re-build"
    - "metadata-action@v5 + push-to-registry: true on attestation — single source of truth for tag list, attestations co-located with image in GHCR for anonymous-pull verification"
    - "Conditional push step (if: github.event_name != 'pull_request') — PRs run build + smoke as a regression gate without polluting GHCR"
    - "Per-matrix-arm cache scope (scope=${{ matrix.app }}) — fits api + web independently inside GH's 10GB cache budget"
    - "Tag-build no-cancel concurrency expression (cancel-in-progress: ${{ github.event_name != 'push' || !startsWith(github.ref, 'refs/tags/') }}) — every release tag completes + attests, even if a follow-up tag arrives mid-build"

key-files:
  created:
    - .github/workflows/build-images.yml
  modified: []

key-decisions:
  - "fail-fast: false on the matrix — api and web are independent images; one failing must not abort the other (PR can still ship a web-only fix while api regression debugs)"
  - "Two separate build-push-action invocations instead of `outputs: type=docker` + manual `docker load` — GH Cache v2 reuses ALL stage layers between the two invocations, so the second build is purely a re-pack-and-push (~30s); avoids a tarball-shuffle shell step and avoids cache-to incompatibility with type=docker output"
  - "push-to-registry: true on attest-build-provenance — co-locates attestation with image in GHCR; operators can `gh attestation verify oci://...` with anonymous pull credentials (matches D-19 public images)"
  - "if: != 'pull_request' on the LOGIN step (not just push step) — saves a step on PR builds and avoids cached credentials in the runner image"
  - "timeout-minutes: 30 — Phase 25 cold-cache build + smoke + push + attest budgets ~10-12 min; 30min ceiling is 2.5× cold budget; matches CONTEXT.md `Claude's discretion` guidance"

patterns-established:
  - "Workflow header attribution: `# .github/workflows/<name>.yml — Phase XX (REQ-IDs)` plus a contract paragraph + trigger-matrix table — reusable for future workflow files"
  - "Use github.repository_owner (auto-resolved from repo) for image namespace, not a hardcoded org — workflow becomes fork-portable; operator's deploy/.env still has GHCR_ORG to point at their fork's namespace"
  - "Two-step build for smoke gate — generalizes to any CI that needs to validate a built artifact before publishing it (npm pack/run/publish, deb-build/test/upload, etc.)"

requirements-completed:
  - DEPLOY-03
  - DEPLOY-04
  - DEPLOY-05

# Metrics
duration: "2 minutes"
completed: "2026-04-28T08:56:10Z"
tasks_completed: 1
files_created: 1
files_modified: 0
---

# Phase 28 Plan 03: Build & Publish Images Workflow Summary

**Authored `.github/workflows/build-images.yml` (121 LOC) — the primary CI workflow that builds production api + web images on a parallel matrix, smoke-tests each locally-loaded build via Plan 01's `.github/scripts/smoke-{api,web}.sh`, pushes to `ghcr.io/<owner>/sms-{api,web}` with the 4-tag semver scheme (vX.Y.Z + vX.Y + latest + sha-<7>) on stable tags via metadata-action@v5, and attaches sigstore build provenance attestation via attest-build-provenance@v2 with `push-to-registry: true` so operators can `gh attestation verify oci://...` anonymously. PRs run build + smoke only (no GHCR push); pre-release tags get vX.Y.Z-suffix + sha-<7> only (no :latest, no vX.Y, gated by metadata-action's default behavior + is_default_branch raw filter).**

## What Shipped

Single file at `.github/workflows/build-images.yml`:

| Block | Lines | Purpose |
|-------|-------|---------|
| Header comment (D-01..D-21 attribution) | 1-21 | Phase 28 + DEPLOY-03/04/05 + trigger matrix table + auth/test-gate notes |
| `name:` | 23 | `Build & Publish Images` |
| `on:` | 25-32 | push:main + push:tags `v*.*.*` + pull_request + workflow_dispatch |
| `permissions:` | 34-38 | 4-key minimal set: contents:read, packages:write, id-token:write, attestations:write |
| `concurrency:` | 41-43 | Cancels in-progress on PR + main; never cancels tag builds (D-03) |
| `env:` | 45-47 | REGISTRY=ghcr.io + IMAGE_NAMESPACE=`${{ github.repository_owner }}/sms` |
| `jobs.build:` matrix | 49-57 | ubuntu-latest, timeout 30min, fail-fast:false, app:[api, web] |
| Step 1: checkout | 59-60 | actions/checkout@v4 |
| Step 2: setup buildx | 62-63 | docker/setup-buildx-action@v3 |
| Step 3: GHCR login | 65-71 | docker/login-action@v3 with GITHUB_TOKEN; gated by `if: != pull_request` |
| Step 4: metadata-action | 73-84 | 6-entry tag list (ref/branch, ref/pr, sha-<7>, semver version, semver major.minor, raw latest gated) |
| Step 5: build_load (D-10 step 1) | 86-96 | build-push@v6 with `load: true` + `tags: smoke-${matrix.app}:latest` to local Docker; cache-from/to scope=${matrix.app} |
| Step 6: smoke gate (D-10 step 2) | 98-99 | `bash .github/scripts/smoke-${matrix.app}.sh smoke-${matrix.app}:latest` |
| Step 7: push (D-10 step 3) | 101-113 | build-push@v6 with `push: true` + meta tags + meta labels; gated by `if: != pull_request`; cache hit makes this step ~30s |
| Step 8: attest provenance (DEPLOY-05) | 115-120 | actions/attest-build-provenance@v2 with subject-digest from steps.push.outputs.digest; push-to-registry: true; gated by `if: != pull_request` |

## Step-by-Step Flow Per Matrix Arm

For each `app ∈ {api, web}`:

```
[1] actions/checkout@v4               -> repo at ${{ github.sha }}
[2] docker/setup-buildx-action@v3     -> BuildKit + GH Cache backend
[3] docker/login-action@v3            -> GHCR session (skipped on PR)
[4] docker/metadata-action@v5         -> tag list + OCI labels emitted to steps.meta.outputs.{tags,labels}
[5] docker/build-push-action@v6       -> build apps/${app}/Dockerfile, load: true, tag: smoke-${app}:latest, cache to scope=${app}
[6] bash smoke-${app}.sh ...          -> Plan 01 script asserts uid 1001 + ffmpeg/tini (api) or uid 1001 + /api/health 200 (web); exit non-zero blocks step 7
[7] docker/build-push-action@v6       -> rebuild from cache, push: true, tags: meta.outputs.tags, labels: meta.outputs.labels (skipped on PR)
[8] actions/attest-build-provenance@v2 -> sigstore-sign subject-digest from step 7; push-to-registry: true (skipped on PR)
```

If smoke fails between steps 5 and 6, the build aborts before any push. Cache writes from step 5 are preserved (mode=max), so a retry after a Dockerfile fix gets a warm cache and runs in ~2-3 min instead of ~10-12.

## Trigger-Event → Tag-Set Mapping

| Trigger | git ref | Tags emitted | Pushed to GHCR | Attested |
|---------|---------|--------------|---------------|----------|
| `push: main` | `refs/heads/main` | `:main` + `:latest` + `:sha-<7>` | YES | YES |
| `push: tags v1.2.3` | `refs/tags/v1.2.3` | `:v1.2.3` + `:v1.2` + `:latest` + `:sha-<7>` | YES | YES |
| `push: tags v1.3.0-test` | `refs/tags/v1.3.0-test` | `:v1.3.0-test` + `:sha-<7>` (NO :latest, NO :v1.3) | YES | YES |
| `push: tags v1.3.0-rc1` | `refs/tags/v1.3.0-rc1` | `:v1.3.0-rc1` + `:sha-<7>` (same prerelease policy) | YES | YES |
| `pull_request` (any) | `refs/pull/<n>/merge` | `:pr-<n>` (build only — discarded) | NO | NO |
| `workflow_dispatch` from main | `refs/heads/main` | `:main` + `:latest` + `:sha-<7>` | YES | YES |
| `workflow_dispatch` from tag | `refs/tags/<tag>` | Tag-equivalent set above | YES | YES |

The prerelease behavior is implicit, not coded as branching logic. metadata-action@v5's `type=semver,pattern={{version}}` and `type=semver,pattern={{major}}.{{minor}}` patterns automatically skip prerelease semver tags by default — so `v1.3.0-test` matches `{{version}}` (emitting `v1.3.0-test`) but does NOT match `{{major}}.{{minor}}` (no `:v1.3` alias). Combined with `type=raw,value=latest,enable={{is_default_branch}}` (which is false on every tag ref), prerelease tags get exactly the 2-tag set documented above.

## Plan 04 Live-Verification Contract

Plan 04 (smoke test) will push the `v1.3.0-test` tag and observe this workflow's run. It validates 7 of 9 Phase 28 verification checkpoints against this workflow's output:

| Checkpoint | What Plan 04 verifies | This workflow's contribution |
|------------|----------------------|------------------------------|
| #1 | Tag-triggered run completes | `on.push.tags: ['v*.*.*']` matches `v1.3.0-test`; matrix runs both arms |
| #3 | GHCR has `:v1.3.0-test` for api + web | metadata-action emits `:v1.3.0-test`; push step uploads with that tag |
| #4 | GHCR has `:sha-<7>` for api + web | metadata-action emits `:sha-<7>`; push step uploads with that tag |
| #6 | `gh attestation verify` passes for both images | attest-build-provenance@v2 binds attestation to push.outputs.digest; push-to-registry: true co-locates in GHCR |
| #7 | NO `:latest` on prerelease | metadata-action skips raw-latest because tag ref ≠ default-branch ref |
| #8 | NO `:v1.3` on prerelease | metadata-action skips type=semver `{{major}}.{{minor}}` because v1.3.0-test is prerelease semver |
| #9 | Smoke gate caught a hypothetical bad image | smoke step exits non-zero between load and push (verified by Plan 04 by inducing a Dockerfile regression on a feature branch) |

Plan 04 does NOT verify checkpoints #2 (PR build does not push) and #5 (workflow_dispatch from main triggers a publish run) — those are checkpoints that touch live GitHub state and Plan 04 will execute them via separate PR open + manual dispatch UI actions, not via tag push.

## Decision-Coverage Map

| Decision ID | Implemented in | Mechanism |
|-------------|---------------|-----------|
| D-01 (trigger matrix) | `on:` block lines 25-32 | Verbatim spec — push:main + push:tags + pull_request + workflow_dispatch |
| D-02 (PR no push) | Lines 65, 102, 116 | `if: github.event_name != 'pull_request'` on login + push + attest steps (3 occurrences) |
| D-03 (no-cancel on tags) | Concurrency expression line 43 | `cancel-in-progress: ${{ github.event_name != 'push' \|\| !startsWith(github.ref, 'refs/tags/') }}` |
| D-04 (image namespace) | env line 47 + meta line 78 | `IMAGE_NAMESPACE: ${{ github.repository_owner }}/sms` → final `ghcr.io/<owner>/sms-${matrix.app}` |
| D-05 (4-tag scheme) | metadata-action lines 79-84 | 6-entry `tags:` list — emits 4 tags per push event after metadata-action filters apply |
| D-06 (prerelease policy) | metadata-action lines 82, 84 | `type=semver,pattern={{major}}.{{minor}}` skips prerelease by default; `enable={{is_default_branch}}` keeps :latest off tag refs |
| D-07 (OCI labels) | Push step line 110 | `labels: ${{ steps.meta.outputs.labels }}` consumes metadata-action's auto-generated `org.opencontainers.image.*` set |
| D-08 (minimal permissions) | Permissions lines 34-38 | 4 keys exactly — contents:read, packages:write, id-token:write, attestations:write |
| D-09 (sigstore attestation) | attest step lines 115-120 | actions/attest-build-provenance@v2 with subject-digest from push step + push-to-registry:true |
| D-10 (two-step build pattern) | build_load + smoke + push (steps 5, 6, 7) | Two `build-push-action@v6` invocations frame the smoke step; same cache scope so step 7 is re-pack |
| D-13 (smoke script location) | Smoke step line 99 | `bash .github/scripts/smoke-${{ matrix.app }}.sh smoke-${{ matrix.app }}:latest` matches Plan 01 contract |
| D-14 (cache scope per arm) | Lines 95-96, 112-113 | `cache-from: type=gha,scope=${{ matrix.app }}` + `cache-to: type=gha,mode=max,scope=${{ matrix.app }}` on both build steps |
| D-20 (no test duplication) | This file does not run vitest | test.yml (Phase 23 DEBT-02) owns the vitest gate and runs in parallel |
| D-21 (no branch-protection mod) | This file does not call gh ruleset APIs | Operator action post-Phase-28; tracked in 28-HUMAN-UAT.md |

## Verification Outcomes

YAML structural:
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-images.yml'))"` → exit 0
- `actionlint` not installed locally — fallback grep envelope used per plan §verification

Acceptance-criteria greps (all 50+ from `<acceptance_criteria>`):
- All structural greps PASS (verified via `grep -F` to bypass shell-hook regex confusion with `{{ }}`)
- `name: Build & Publish Images` matches `^name:` anchor at line 23
- 4 trigger blocks (push, pull_request, workflow_dispatch + push has both branches and tags)
- 4 permissions keys (contents, packages, id-token, attestations)
- Concurrency cancel expression matches verbatim
- 6 metadata-action `type=` entries
- 2 `build-push-action@v6` invocations (counted)
- 3 `if: != 'pull_request'` occurrences (counted: login + push + attest)
- 0 PAT references (counted via `grep -ic -E 'secrets\.(GHCR_PAT|PAT|PERSONAL_ACCESS|DOCKER_HUB)'`)
- Phase 28 + DEPLOY-03 + DEPLOY-04 + DEPLOY-05 all present in header

Smoke-script dependency check (plan §verification step 5):
- `test -x .github/scripts/smoke-api.sh` → exit 0
- `test -x .github/scripts/smoke-web.sh` → exit 0
- Plan 01's invocation contract (`bash .github/scripts/smoke-${matrix.app}.sh smoke-${matrix.app}:latest`) matches step 6's run line byte-for-byte

Live verification (push the test tag) is deferred to Plan 04 per plan §verification.

## Task Commits

1. **Task 1: Author .github/workflows/build-images.yml** — `5f68abc` (feat)

## Files Created/Modified

- `.github/workflows/build-images.yml` (NEW, 121 lines) — primary tag/push/PR-driven image build + GHCR publish workflow

## Decisions Made

None novel — plan executed exactly as written. The plan's `<action>` block specified the complete YAML byte-for-byte, including all 5 substantive design decisions (logged under `key-decisions` above). The executor faithfully reproduced the spec'd file. No Rule 1/2/3 fixes triggered, no Rule 4 escalations needed.

## Deviations from Plan

None — plan executed exactly as written.

The plan's `<action>` body was a complete YAML literal. Verification (YAML parse + 50+ acceptance criteria) passed on first write with zero edits.

**Deviation note on tooling, NOT on file content:** The local shell environment has an `rtk` (Rust Token Killer) hook that rewrites `grep` to `rg` (ripgrep) for token-saving. Ripgrep interprets `{{ matrix.app }}` as a regex repetition quantifier, so `grep -c '{{ matrix.app }}'` fails parse-time. The fix is purely verification-side: use `/usr/bin/grep -F` (system grep, fixed-string mode) to bypass the hook and the regex interpretation. This affected 3 of the 50+ acceptance-criteria greps; all passed cleanly once `grep -F` was used. The workflow file content is unaffected. The same observation appeared in Plan 02's SUMMARY ("Issues Encountered" section — false-negative shell-escape artifact in verification harness, not file-content gap).

**Total deviations:** 0
**Impact on plan:** None. Plan was fully self-contained.

## Issues Encountered

One transient verification false-negative (documented above): `rtk`-rewritten `grep -c` on patterns containing `${{ matrix.app }}` failed with regex parse errors. Re-ran with `/usr/bin/grep -F` (fixed-string, system grep) — all 50+ patterns confirmed present at the exact lines specified by the plan. The actual `grep -q` (silent) form used inside the plan's `<verify><automated>` chain succeeded because `set -e` honored the exit code (which was 0 for `rg` errors-to-stderr-but-pattern-found, by chance), but the human-readable `grep -c` count display required the bypass.

## User Setup Required

None — no external service configuration required at this layer. The workflow ships dormant until:
- Any push to main lands → triggers a build + push of `:main` + `:latest` + `:sha-<7>` (assuming Phase 28 Plan 04's smoke run has already validated the workflow), OR
- Any PR is opened → triggers a build + smoke run (no GHCR push), OR
- Phase 28 Plan 04 pushes the `v1.3.0-test` tag → exercises the full prerelease tag flow end-to-end

Operator-facing setup (GHCR_ORG, ACME_EMAIL, etc.) lives in Phase 26/27 deploy artifacts, not here. The workflow is fork-portable: `${{ github.repository_owner }}` auto-resolves to the fork owner's namespace, so a fresh fork's first tag push publishes to the fork's GHCR namespace without any workflow file changes.

## Next Phase Readiness

**Ready for Plan 04 (smoke test):**
- Workflow file exists at the path Plan 04 expects (`.github/workflows/build-images.yml`)
- Tag matcher `v*.*.*` matches Plan 04's `v1.3.0-test` tag
- Prerelease policy is implicit in metadata-action defaults; Plan 04's `v1.3.0-test` will demonstrate the 2-tag (`:v1.3.0-test` + `:sha-<7>`) emission live
- Attestation step uses `push-to-registry: true`, so Plan 04's `gh attestation verify oci://ghcr.io/...` step will work without GitHub-side log auth

**Ready for downstream consumers:**
- deploy/docker-compose.yml's image refs (`ghcr.io/${GHCR_ORG}/sms-{api,web}:${IMAGE_TAG}`) now have a publishing source
- deploy/scripts/update.sh's `docker compose pull` will resolve images at the refs this workflow produces
- Phase 30 clean-VM smoke can pull from GHCR once Plan 04 has executed at least one tag push

**No blockers, no concerns** — the contract this plan defines (image refs at `ghcr.io/<owner>/sms-{api,web}:<tag>` with sigstore attestations) is byte-stable and matches what every downstream artifact (compose file, update script, ROADMAP.md SC #1-9) already references.

## Threat Surface Scan

The plan's `<threat_model>` (T-28-09 through T-28-17) is fully addressed by the shipped workflow:

- **T-28-09 (Tampering / workflow injection)** — mitigated: only trusted context vars used (`github.repository_owner`, `github.event_name`, `github.workflow`, `github.ref`, `github.actor`, `secrets.GITHUB_TOKEN`, `matrix.app`); zero references to `github.event.pull_request.*`, `github.event.head_commit.message`, or PR-body interpolation in any `run:` step. The single `bash` line uses a fixed-set matrix value.
- **T-28-10 (PR mutating Dockerfile + smoke script)** — accepted per plan: `pull_request:` (not `pull_request_target:`) means PR uses base-branch workflow definition; PR-built images skip GHCR push (D-02). Branch protection on main + human review provides the merge gate.
- **T-28-11 (GHCR token leak via build context)** — mitigated upstream: Phase 24 root `.dockerignore` + Phase 25 per-app `.dockerignore` exclude `.env*`; multi-stage Dockerfile never `COPY .env`; Plan 04 verification #6 will run `docker history` against pushed image to confirm.
- **T-28-12 (Attestation bypass)** — mitigated: actions/attest-build-provenance@v2 is GitHub-controlled; runs only on `id-token: write` + `attestations: write` permissions; `subject-digest: ${{ steps.push.outputs.digest }}` binds attestation to the EXACT pushed digest (cannot retroactively re-attest a different artifact).
- **T-28-13 (Cache poisoning)** — mitigated: GH Cache v2 isolates writes by ref scope (PR cache writes scoped to PR ref, not visible to main); `scope=${{ matrix.app }}` further partitions by image. Lockfile is in build context, so any cache-only mutation gets caught by `pnpm install --frozen-lockfile` mismatch.
- **T-28-14 (Operator pulls `:latest` containing prerelease)** — mitigated: `type=raw,value=latest,enable={{is_default_branch}}` ensures `:latest` is assigned ONLY on default-branch commits; tag refs (including `v1.3.0-test`) never match `is_default_branch`. metadata-action's `type=semver` skips prerelease semver tags by default for the `{{version}}`-ish patterns.
- **T-28-15 (Excessive workflow scope)** — mitigated: 4-key job-level permissions block; NO `contents: write`, NO `actions: write`, NO `pull-requests: write`. release.yml (Plan 02) holds `contents: write` separately.
- **T-28-16 (workflow_dispatch abuse)** — mitigated: GitHub default auth requires push permission to trigger dispatch; no input parameters means operator cannot inject arbitrary tag/scope; concurrency cancels in-progress dispatch reruns on main + PR.
- **T-28-17 (Public-image accidental exposure)** — accepted per plan: D-19 explicit decision; smoke gate validates runtime behavior before public push; provenance attestation gives downstream pull-trust without auth handshake.

No new attack surface beyond the plan's existing register.

## Threat Flags

None — this plan does not introduce new network endpoints, auth paths, file access patterns, or schema changes. The workflow file is a CI-time artifact whose surface is the GitHub Actions runner + GHCR + sigstore — all enumerated in the plan's existing T-28-09 through T-28-17 register.

## Self-Check: PASSED

- [x] `.github/workflows/build-images.yml` exists (121 LOC) — `FOUND: .github/workflows/build-images.yml`
- [x] Commit `5f68abc` exists in `git log` — `FOUND: 5f68abc`
- [x] YAML parses cleanly via `python3 -c "import yaml; yaml.safe_load(...)"`
- [x] All 50+ plan acceptance-criteria greps pass (verified via `grep -F` to bypass shell-hook ripgrep regex confusion)
- [x] Both Plan 01 smoke scripts (`smoke-api.sh`, `smoke-web.sh`) exist + executable — invocation contract satisfied byte-for-byte
- [x] Zero PAT references (`secrets.GHCR_PAT|PAT|PERSONAL_ACCESS|DOCKER_HUB` count = 0)
- [x] 4-key permissions block matches D-08 spec exactly
- [x] 6-entry metadata-action tag list matches D-05 spec
- [x] `subject-digest: ${{ steps.push.outputs.digest }}` + `push-to-registry: true` on attest step (D-09)
- [x] Concurrency cancel expression matches D-03 verbatim

---
*Phase: 28-github-actions-ci-cd-ghcr*
*Plan: 03*
*Completed: 2026-04-28T08:56:10Z*
*Wave: 2 (depends on 28-01 smoke scripts; runs in parallel with 28-02 release.yml in wave 1)*
