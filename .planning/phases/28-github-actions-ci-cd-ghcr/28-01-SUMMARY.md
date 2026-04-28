---
phase: 28-github-actions-ci-cd-ghcr
plan: 01
subsystem: ci-cd
tags: [ci, github-actions, smoke-tests, ghcr, deploy-gate]
requires:
  - apps/api/Dockerfile (Phase 25 — runtime invariants this gate asserts)
  - apps/web/Dockerfile (Phase 25 — runtime invariants this gate asserts)
  - apps/web/src/app/api/health/route.ts (Phase 25 Plan 02 — `{ok:true}` shape)
provides:
  - .github/scripts/smoke-api.sh (api image pre-push gate, exit 0/non-zero contract)
  - .github/scripts/smoke-web.sh (web image pre-push gate, exit 0/non-zero contract)
affects:
  - Plan 28-03 (build-images.yml will invoke both scripts after `docker buildx build --load`, before `docker push`)
tech-stack:
  added: []
  patterns:
    - "Two-step build/load → smoke → push CI pattern (DEPLOY-03 pre-push gate)"
    - "--entrypoint override on `docker run --rm` to bypass tini-wrapped ENTRYPOINT for single-shot assertions"
    - "trap cleanup EXIT for guaranteed container teardown on assertion failure"
key-files:
  created:
    - .github/scripts/smoke-api.sh
    - .github/scripts/smoke-web.sh
  modified: []
decisions:
  - "ffmpeg version regex `5|6|7` (not 5-only) — Bookworm-slim ships 5.1.x today but a base-image bump could promote to 6/7; the actual constraint is the Phase 25 ≤450MB image budget, not ffmpeg major version"
  - "Use `--entrypoint /usr/bin/id` instead of relying on PATH — the api Dockerfile sets `ENTRYPOINT [\"/usr/bin/tini\", \"--\"]` which would treat `id -u` as a tini arg and fail; explicit entrypoint override is unambiguous"
  - "Web smoke boots a real container (vs static checks only) — Phase 25 D-18 outputFileTracingRoot regression would manifest as boot failure here, before the bad image hits GHCR"
  - "30s health-probe timeout — Phase 25 web cold start observed ~3-8s on ubuntu-latest runner; 30s gives 4× safety margin without dragging job time"
  - "grep `\"ok\":true` (not jq) — looser parse, jq dependency-free, sufficient for this binary go/no-go gate"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-28T08:49:43Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 28 Plan 01: Smoke-test scripts for prod images Summary

Authored two bash smoke-test scripts under `.github/scripts/` that automate the Phase 25 D-19 manual checklist as CI pre-push gates — Plan 03 will boot each script after `docker buildx build --load` and before `docker push`, so any regression in Dockerfile content (non-root UID 1001, FFmpeg apt package, tini install, Next.js standalone outputFileTracingRoot) fails the build at the smoke step and never pollutes GHCR with a broken `:latest`.

## What Shipped

### `.github/scripts/smoke-api.sh` (39 LOC, mode 0755)

Asserts three Phase 25 D-19 invariants on a built api image:

| Step | Phase 25 D-19 # | Assertion |
|------|-----------------|-----------|
| 1/3  | #3 | `docker run --rm --entrypoint /usr/bin/id "$IMAGE" -u` returns `1001` |
| 2/3  | #4 | `docker run --rm --entrypoint /usr/bin/ffmpeg "$IMAGE" -version` outputs `ffmpeg version 5\|6\|7\.` |
| 3/3  | #5 | `docker run --rm --entrypoint /usr/bin/tini "$IMAGE" --version` outputs `^tini version ` |

All three steps use `--entrypoint` override because Phase 25's `apps/api/Dockerfile:116` sets `ENTRYPOINT ["/usr/bin/tini", "--"]` — without override, `id -u` / `ffmpeg -version` / `tini --version` would be interpreted as args to tini-wrapped `node dist/main`. Explicit entrypoint override isolates each assertion to a single-shot probe.

### `.github/scripts/smoke-web.sh` (45 LOC, mode 0755)

Asserts two Phase 25 D-19 invariants on a built web image:

| Step | Phase 25 D-19 # | Assertion |
|------|-----------------|-----------|
| 1/2  | #1 | `docker run --rm --entrypoint /usr/bin/id "$IMAGE" -u` returns `1001` |
| 2/2  | #7, #8 | `docker run -d -p 3000:3000` boots; `curl -fsS http://localhost:3000/api/health` returns JSON containing `"ok":true` within 30s (1s polling × 30 retries) |

Step 2 boots a real container because it is the only way to surface a regression in Phase 25 D-18 (`outputFileTracingRoot: path.join(__dirname,'../../')`) — a misconfigured pnpm monorepo standalone build manifests as `Cannot find module` at runtime, not at build time. `trap cleanup EXIT` ensures the test container is removed even on assertion failure or signal, keeping the CI runner clean for the matrix's other job. On failure, the script dumps `docker logs --tail 50` to stderr for CI debugging.

## Plan 03 Contract

Both scripts share an identical invocation contract that Plan 03 (`build-images.yml`) consumes via the matrix-driven app name:

```yaml
- name: Smoke test image
  run: bash .github/scripts/smoke-${{ matrix.app }}.sh smoke-${{ matrix.app }}:latest
```

| Property | smoke-api.sh | smoke-web.sh |
|----------|--------------|--------------|
| Arg shape | `<image-ref>` (single positional) | `<image-ref>` (single positional) |
| Exit 0 | All assertions pass — image safe to push | All assertions pass — image safe to push |
| Exit 1 | At least one assertion failed | At least one assertion failed (or 30s probe timeout) |
| Exit 64 | Missing/wrong-count argv | Missing/wrong-count argv |
| Side effects | None (`--rm` on every probe) | Spawns 1 detached container, `trap cleanup EXIT` removes it |
| External deps | Docker daemon | Docker daemon, port 3000 free on runner |

## Verification

All plan-level success criteria PASS:

```
$ bash -n .github/scripts/smoke-api.sh && bash -n .github/scripts/smoke-web.sh && echo OK
OK

$ ls -la .github/scripts/
-rwxr-xr-x  smoke-api.sh   # mode 0755
-rwxr-xr-x  smoke-web.sh   # mode 0755

$ bash .github/scripts/smoke-api.sh
Usage: .github/scripts/smoke-api.sh <image-ref>     # → exit 64

$ bash .github/scripts/smoke-web.sh
Usage: .github/scripts/smoke-web.sh <image-ref>     # → exit 64

$ grep -l 'Phase 25 D-19' .github/scripts/smoke-api.sh .github/scripts/smoke-web.sh
.github/scripts/smoke-api.sh
.github/scripts/smoke-web.sh
```

Plan task-level `<verify><automated>` blocks (the runtime gates Plan 03 will see):

```
# smoke-api.sh
bash -n + executable + shebang + pipefail + entrypoint /usr/bin/id + ffmpeg version (5|6|7) + tini version → PASS

# smoke-web.sh
bash -n + executable + shebang + pipefail + localhost:3000/api/health + "ok":true + trap cleanup EXIT → PASS
```

Local docker-build smoke run (optional per plan §verification) was skipped — Phase 25's images are not pre-built in this worktree, and the plan explicitly defers live docker validation to Plan 03 in CI. The runtime gate is the matrix-triggered ubuntu-latest runner.

## Deviations from Plan

### None — plan executed exactly as written.

The plan's `<action>` body for Task 1 contained an in-line CORRECTION block (lines 147-154) instructing the executor to use `--entrypoint /usr/bin/id "$IMAGE" -u` instead of bare `id -u` (avoiding ENTRYPOINT shadowing by tini). The corrected form was applied verbatim — this is documented as the plan's intended final shape, not a deviation.

### Observation: planner acceptance-criteria regex anchor

Task 1's acceptance criterion line includes `grep -q '^tini version ' .github/scripts/smoke-api.sh → exit 0 (the regex appears in the script)`. The literal string `^tini version ` does appear inside the script (as the regex argument to the script's own internal `grep -qE`), but the `^` anchor in the *outer* acceptance grep requires the string to appear at start of a line — which it does not. The plan's `<verify><automated>` block uses the unanchored form `grep -q 'tini version'` (no `^`), which the script satisfies. This is a planner doc-bug in the acceptance text, not a script defect; the script correctly asserts `tini version ` at start-of-line for tini's actual stdout, which is the intended runtime behavior.

No code change was made — modifying the script to satisfy the unsatisfiable anchor would have broken the runtime regex.

## Threat Surface Scan

The plan's `<threat_model>` (T-28-01..T-28-04) is fully addressed by the shipped scripts:

- **T-28-01 (Tampering / command injection via IMAGE arg)** — mitigated: `"$IMAGE"` is double-quoted at every `docker run` call site (5 occurrences across both scripts); workflow-driven matrix arg is not PR-controlled until merge.
- **T-28-02 (Information Disclosure / `docker logs` leaks env)** — accepted per plan: web smoke dumps `docker logs --tail 50` only on failure; web image at smoke time has no production secrets (no `.env` mounted, only image-baked `PORT=3000` / `NODE_ENV=production`).
- **T-28-03 (DoS / orphaned smoke container)** — mitigated: `trap cleanup EXIT` (smoke-web.sh L34); `--rm` on every smoke-api.sh probe; matrix job has GH default 6h timeout backstop.
- **T-28-04 (Spoofing / malicious image arg)** — mitigated: Plan 03 will only ever pass `smoke-${matrix.app}:latest` (locally-built from this checkout, not pulled from external registry).

No new threat-flag surface introduced beyond the plan's existing register.

## Self-Check: PASSED

- [x] `.github/scripts/smoke-api.sh` exists (39 LOC, mode 0755)
- [x] `.github/scripts/smoke-web.sh` exists (45 LOC, mode 0755)
- [x] Commit `327b4f3` exists in `git log` (Task 1: smoke-api.sh)
- [x] Commit `09b5986` exists in `git log` (Task 2: smoke-web.sh)
- [x] Both scripts pass `bash -n`
- [x] Both scripts exit 64 on missing argv
- [x] Both scripts reference `Phase 25 D-19` in header comments
- [x] Plan 03 invocation contract (`bash .github/scripts/smoke-${matrix.app}.sh smoke-${matrix.app}:latest`) is satisfied without modification
