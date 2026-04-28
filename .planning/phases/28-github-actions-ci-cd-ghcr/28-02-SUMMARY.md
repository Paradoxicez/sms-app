---
phase: 28-github-actions-ci-cd-ghcr
plan: 02
subsystem: infra
tags: [github-actions, release, ghcr, softprops-action-gh-release, ci-cd, deploy]

# Dependency graph
requires:
  - phase: 25-multi-stage-dockerfiles-image-hardening
    provides: production Dockerfiles whose images Plan 03 (build-images.yml) will publish to GHCR
  - phase: 26-production-compose-migrate-init-networking-volumes
    provides: deploy/docker-compose.yml whose `docker compose pull && up -d` upgrade snippet appears verbatim in the Release body
provides:
  - .github/workflows/release.yml — tag-triggered (`v*.*.*`) GitHub Release publication
  - Auto-generated changelog (commits since previous tag) prepended to a custom body
  - Body template listing GHCR image refs for sms-api + sms-web
  - Embedded `gh attestation verify` snippet (DEPLOY-05 hand-off) — operators copy-paste to verify provenance once Plan 03 finishes pushing
  - Embedded `docker compose pull && up -d` upgrade snippet (Phase 26 hand-off)
  - Auto-prerelease flagging for tags matching `-(alpha|beta|rc|test)` (D-17)
affects:
  - 28-03 (build-images.yml — runs in parallel on the same tag push; image refs in this body resolve once Plan 03 finishes pushing)
  - 28-04 (smoke test — the `v1.3.0-test` tag from Plan 04 will be flagged as prerelease by this workflow's regex)
  - 29-operator-ux-scripts (deploy/README.md link in Release body resolves once Phase 29 lands docs)
  - 30-clean-vm-smoke-test (release flow exercised end-to-end on real tag push)

# Tech tracking
tech-stack:
  added:
    - softprops/action-gh-release@v2 (GitHub Release publication action — pinned to major)
    - actions/checkout@v4 (consistent with .github/workflows/test.yml convention)
  patterns:
    - "Tag-triggered workflows separated by concern: release.yml owns Release entry, build-images.yml owns image push"
    - "Minimal permissions (contents: write only) to enforce DEPLOY-03 SC #4 separation — release.yml literally cannot push to GHCR even if compromised (T-28-06)"
    - "Static prerelease detection via bash regex against `${{ github.ref_name }}` written to `$GITHUB_OUTPUT`"
    - "softprops/action-gh-release@v2 with both `generate_release_notes: true` AND custom `body:` — auto-generated changelog prepends, custom body appends"

key-files:
  created:
    - .github/workflows/release.yml
  modified: []

key-decisions:
  - "release.yml has permissions: contents: write ONLY (no packages: write) — DEPLOY-03 SC #4 separation from build-images.yml"
  - "release.yml does NOT depend on build-images.yml job success — operators see the Release entry immediately on tag; image refs resolve once build-images.yml finishes pushing (parallel-not-serial contract)"
  - "Prerelease regex covers alpha|beta|rc|test (D-17) — the `test` alternative covers the Phase 28 SC #1 `v1.3.0-test` smoke tag pattern"
  - "Two literal `gh attestation verify` lines (api + web) instead of one templated line — copy-paste safe for operators, no mental substitution"
  - "timeout-minutes: 5 — release.yml does one checkout + one API call; explicit timeout makes a stuck run fail loud instead of consuming default 360min"

patterns-established:
  - "Workflow header convention: `# .github/workflows/<name>.yml — Phase XX (REQ-IDs)` plus contract paragraph (what this workflow does NOT do, separation of concerns)"
  - "Bash-regex prerelease detection writes to GITHUB_OUTPUT for downstream `with: prerelease: ${{ steps.x.outputs.y }}` consumption — pattern reusable for future tag-classification workflows"
  - "Release body template uses fenced ```sh blocks for operator copy-paste; no smart quotes, no shell variables that need substitution"

requirements-completed:
  - DEPLOY-03
  - DEPLOY-04

# Metrics
duration: 1m 6s
completed: 2026-04-28
---

# Phase 28 Plan 02: Release Workflow Summary

**Tag-triggered GitHub Release workflow (`v*.*.*`) that auto-generates changelog notes, lists GHCR image refs for sms-api + sms-web, embeds `gh attestation verify` + `docker compose pull` snippets, and flags prereleases on `-(alpha|beta|rc|test)` suffixes — all under `permissions: contents: write` only (no GHCR push, separation from build-images.yml).**

## Performance

- **Duration:** 1m 6s
- **Started:** 2026-04-28T08:48:10Z
- **Completed:** 2026-04-28T08:49:16Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments

- Authored `.github/workflows/release.yml` (65 lines) — fresh create, no prior file existed
- All 22 plan acceptance criteria pass (verified twice: once with regex grep, once with fixed-string `grep -F` to confirm the 3 shell-escape false negatives were artifacts of the test loop, not file content)
- YAML parses cleanly via `python3 -c "import yaml; yaml.safe_load(open(...))"` — exit 0
- Permissions block is minimal: `contents: write` only; `grep -v "packages: write"` exits 0 — DEPLOY-03 SC #4 separation enforced at the file level
- Prerelease regex `-(alpha|beta|rc|test)` matches D-17 spec verbatim, including the `-test` suffix used by Phase 28 SC #1 smoke tag (`v1.3.0-test`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Author .github/workflows/release.yml** — `707669f` (feat)

_Note: Single-task plan; no follow-up commits needed._

## Files Created/Modified

- `.github/workflows/release.yml` — Tag-triggered (`v*.*.*`) GitHub Release publication; runs in parallel with build-images.yml; uses softprops/action-gh-release@v2 with auto-generated notes + custom body listing image refs, gh attestation verify command, and `docker compose pull && up -d` upgrade snippet; auto-flags prereleases via bash regex on `${{ github.ref_name }}`; permissions: `contents: write` only

## Decisions Made

None novel — plan executed exactly as written. The plan itself encodes 5 substantive decisions (logged under `key-decisions` above) which were all preserved verbatim:

1. `permissions: contents: write` only (no `packages: write`) — separation from build-images.yml per DEPLOY-03 SC #4 + threat T-28-06
2. No `needs:` on build-images.yml — Release entry visible immediately on tag, image refs resolve later when Plan 03 finishes pushing
3. Prerelease regex includes `test` to flag the Phase 28 SC #1 smoke tag (`v1.3.0-test`) as a prerelease in the GitHub UI
4. Two literal `gh attestation verify` lines (one per image) instead of one templated line — copy-paste safe for operators
5. `timeout-minutes: 5` — explicit short cap because the workflow does one checkout + one API call; default 360min would silently burn runner minutes on a stuck run

## Deviations from Plan

None — plan executed exactly as written.

The plan's `<action>` block specified the complete YAML byte-for-byte; verification (22 acceptance criteria + YAML parse + verify pipeline) passed on first write with zero edits. No Rule 1/2/3 fixes triggered, no Rule 4 escalations needed.

**Total deviations:** 0
**Impact on plan:** Plan was fully self-contained; the executor faithfully reproduced the spec'd file. All success criteria green.

## Issues Encountered

One transient false-negative during local acceptance-criteria scripting: a chained `&&` shell loop reported 3 fails on the `${{ github.repository_owner }}` / `${{ github.ref_name }}` greps. Re-verified using `grep -F` (fixed-string) — all 3 strings are present in the file at the exact lines specified by the plan. The fails were shell-escape artifacts in the verification harness, not file-content gaps. The actual `grep -q` calls from the `<verify><automated>` block of the plan all pass cleanly.

## User Setup Required

None — no external service configuration required at this layer. The workflow ships dormant until:
- A maintainer pushes a `v*.*.*` tag, OR
- Phase 28 Plan 04 pushes the `v1.3.0-test` smoke tag to exercise this workflow end-to-end

Operator-facing setup (DNS, GHCR_ORG, ACME_EMAIL, etc.) is documented in Phase 26/27 deploy artifacts, not here.

## Next Phase Readiness

**Ready for Plan 03 (build-images.yml):**
- Image-ref pattern `ghcr.io/${{ github.repository_owner }}/sms-{api,web}:${{ github.ref_name }}` is now consumed by release.yml's body — Plan 03 must produce images at exactly these refs (string contract, not function call)
- Both workflows trigger on the same `v*.*.*` push event but neither blocks the other — Plan 03 is free to take 5-15 minutes (multi-stage build + multi-platform if it adds it later) without blocking the Release entry

**Ready for Plan 04 (smoke test):**
- Plan 04's `v1.3.0-test` tag will:
  1. Trigger release.yml → create Release entry with `prerelease: true` (T-test alternative in D-17 regex)
  2. Trigger build-images.yml in parallel → push images
  3. Operator verifies Release body image refs resolve once Plan 03 push completes

**No blockers, no concerns** — the contract this plan defined (string-only contract via `${{ github.ref_name }}` interpolation) means Plan 03 has zero coupling to this plan's internals.

## Threat Flags

None — no new attack surface beyond what was registered in the plan's `<threat_model>` (T-28-05/06/07/08 all addressed at file level: regex hardening accepted-as-mitigated, no `packages:` scope, default GitHub branch protection assumed, body content all operator-facing by design).

## Self-Check: PASSED

- File exists: `FOUND: .github/workflows/release.yml`
- Commit exists: `FOUND: 707669f`

---
*Phase: 28-github-actions-ci-cd-ghcr*
*Completed: 2026-04-28*
