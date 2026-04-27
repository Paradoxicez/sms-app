---
phase: 25-multi-stage-dockerfiles-image-hardening
plan: 06
type: execute
wave: 3
depends_on:
  - 01
  - 02
  - 03
  - 04
  - 05
files_modified:
  - .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md
autonomous: false
requirements:
  - DEPLOY-01
  - DEPLOY-02
must_haves:
  truths:
    - "All 11 steps of D-19 manual checklist pass and outputs are recorded"
    - "Both images (sms-api:phase25-test, sms-web:phase25-test) exist locally with verified sizes within budget"
    - "scripts/dev-smoke.sh exits 0 (no dev workflow regression)"
    - "git diff --quiet HEAD -- apps/api/Dockerfile.dev exits 0 (Phase 24 D-06 byte-identical lock preserved)"
    - "Phase 23 CI workflow (.github/workflows/test.yml) still passes — `pnpm --filter @sms-platform/api test` exits 0"
    - "User has visually confirmed image-build outputs and approved phase completion via checkpoint"
  artifacts:
    - path: .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md
      provides: "Recorded outputs of all 11 D-19 verification steps + image digests + reviewer sign-off"
      contains: "D-19"
  key_links:
    - from: 25-VERIFICATION.md
      to: ROADMAP.md Phase 25 Success Criteria #1-4
      via: "Each numbered criterion maps to one or more D-19 steps"
      pattern: "Success Criteria"
---

<objective>
Run the full D-19 11-step manual verification checklist defined in 25-CONTEXT.md, record every command + output in `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md`, and pause for user sign-off via a `checkpoint:human-verify` task before marking the phase complete.

This plan is the single source of truth for proving DEPLOY-01 + DEPLOY-02 success criteria are met. It collects evidence that:
- ROADMAP §Phase 25 Success Criteria #1: api image is at most 450MB, uses node:22-bookworm-slim, has FFmpeg + tini.
- ROADMAP §Phase 25 Success Criteria #2: api process runs as non-root uid; FFmpeg on PATH.
- ROADMAP §Phase 25 Success Criteria #3: web image is at most 220MB, Next.js standalone with outputFileTracingRoot, boots port 3000 non-root.
- ROADMAP §Phase 25 Success Criteria #4: per-app .dockerignore exists and excludes test files, build artifacts, .planning/.
- D-19 step 10: dev-smoke.sh still passes (no dev regression).
- D-19 step 11: Phase 23 CI workflow still passes (no test regression).

Purpose: Without this gate, downstream phases (26 compose, 28 CI) would proceed against unverified Dockerfiles. The user-sign-off checkpoint catches anything an automated grep can't (e.g. "image is 451MB — within 0.2% of budget but technically over").
Output: 1 new file (25-VERIFICATION.md) + user approval signal.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md

@apps/api/Dockerfile
@apps/api/.dockerignore
@apps/web/Dockerfile
@apps/web/.dockerignore
@apps/web/next.config.ts
@apps/web/src/app/api/health/route.ts
@apps/api/src/health/health.controller.ts
@apps/api/src/health/health.module.ts
@apps/api/src/app.module.ts
@scripts/dev-smoke.sh
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build both images fresh and capture image metadata</name>
  <files>(no file changes — verification only; outputs captured into Task 2's report)</files>
  <read_first>
    - apps/api/Dockerfile (verify all 4 stages, base image, healthcheck, non-root, tini per Plan 04 acceptance)
    - apps/web/Dockerfile (verify all 3 stages, base image, healthcheck, non-root, NO tini per Plan 05 acceptance)
    - apps/api/.dockerignore (verify per-app exclusions per Plan 04 Task 1 acceptance)
    - apps/web/.dockerignore (verify per-app exclusions per Plan 05 Task 1 acceptance)
  </read_first>
  <action>
    From repo root, run a fresh build of both images and capture metadata. Pipe outputs to `/tmp/25-06-*.log` for inclusion in Task 2's report.

    1. Clean any prior tags to ensure a fresh build:
       `docker rmi -f sms-api:phase25-test sms-web:phase25-test 2>/dev/null || true`

    2. Build api image (D-19 step 1):
       `docker build -f apps/api/Dockerfile . -t sms-api:phase25-test 2>&1 | tee /tmp/25-06-api-build.log`
       Capture exit code; expected 0. Capture last 20 lines of build log.

    3. Build web image (D-19 step 6):
       `docker build -f apps/web/Dockerfile . -t sms-web:phase25-test 2>&1 | tee /tmp/25-06-web-build.log`
       Capture exit code; expected 0. Capture last 20 lines of build log.

    4. Image metadata:
       ```
       docker images sms-api:phase25-test --format '{{.Repository}}:{{.Tag}} {{.Size}} {{.ID}}' | tee /tmp/25-06-api-meta.txt
       docker images sms-web:phase25-test --format '{{.Repository}}:{{.Tag}} {{.Size}} {{.ID}}' | tee /tmp/25-06-web-meta.txt
       ```

    5. Image digest (sha256) for downstream Phase 28 reference:
       ```
       docker inspect --format '{{.Id}}' sms-api:phase25-test | tee /tmp/25-06-api-digest.txt
       docker inspect --format '{{.Id}}' sms-web:phase25-test | tee /tmp/25-06-web-digest.txt
       ```

    6. Image history inspection (Pitfall 8 verification — no .env layer):
       ```
       docker history sms-api:phase25-test --no-trunc | tee /tmp/25-06-api-history.txt
       docker history sms-web:phase25-test --no-trunc | tee /tmp/25-06-web-history.txt
       ```
       Manually scan: NO line should contain `.env` (other than `.env.example` references in COPY blocks of upstream layers — verify by `grep "\.env" /tmp/25-06-api-history.txt`; expect empty match).
  </action>
  <verify>
    <automated>docker build -f apps/api/Dockerfile . -t sms-api:phase25-test > /tmp/25-06-api-build.log 2>&1 && docker build -f apps/web/Dockerfile . -t sms-web:phase25-test > /tmp/25-06-web-build.log 2>&1 && docker images sms-api:phase25-test --format '{{.Size}}' > /tmp/25-06-api-meta.txt && docker images sms-web:phase25-test --format '{{.Size}}' > /tmp/25-06-web-meta.txt && ! docker history sms-api:phase25-test --no-trunc | grep -E "(^|[^.])\.env( |$)" && ! docker history sms-web:phase25-test --no-trunc | grep -E "(^|[^.])\.env( |$)"</automated>
  </verify>
  <acceptance_criteria>
    - Both `docker build` invocations exit 0.
    - `/tmp/25-06-api-meta.txt` and `/tmp/25-06-web-meta.txt` are non-empty (image exists).
    - `docker history sms-api:phase25-test` does NOT show any layer containing `.env` (other than `.env.example` if any).
    - `docker history sms-web:phase25-test` does NOT show any layer containing `.env`.
    - Image digests captured to `/tmp/25-06-{api,web}-digest.txt`.
  </acceptance_criteria>
  <done>Both images built fresh, metadata + digests + history captured for the report, no .env leakage detected.</done>
</task>

<task type="auto">
  <name>Task 2: Run all 11 D-19 verification steps and write 25-VERIFICATION.md</name>
  <files>.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md</files>
  <read_first>
    - .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md (D-19 the 11-step checklist — copy each step verbatim into the report headers)
    - /tmp/25-06-api-build.log, /tmp/25-06-web-build.log, /tmp/25-06-api-meta.txt, /tmp/25-06-web-meta.txt, /tmp/25-06-api-digest.txt, /tmp/25-06-web-digest.txt (outputs from Task 1)
  </read_first>
  <action>
    Execute D-19 steps 1-11 in order. For each step, capture the exact command + stdout (or `pass`/`fail` summary) into `25-VERIFICATION.md`. Use the report template below.

    Step-by-step:

    1. Step 1 (api build) — already done in Task 1; capture last 5 lines of /tmp/25-06-api-build.log.
    2. Step 2 (api size) — `docker images sms-api:phase25-test --format '{{.Size}}'`. Convert to bytes (e.g. `412MB` -> 412 * 1024 * 1024 = 432,013,312). Assert at most 450 * 1024 * 1024 (471,859,200 bytes).
    3. Step 3 (api non-root) — `docker run --rm sms-api:phase25-test id` -> stdout must contain `uid=1001(app) gid=1001(app)`.
    4. Step 4 (api ffmpeg) — `docker run --rm sms-api:phase25-test ffmpeg -version | head -1` -> must match `ffmpeg version 5\.`.
    5. Step 5 (api tini) — `docker run --rm --entrypoint /bin/sh sms-api:phase25-test -c 'which tini && /usr/bin/tini --version'` -> must contain `/usr/bin/tini` AND `tini version`.
    6. Step 6 (web build) — already done in Task 1; capture last 5 lines of /tmp/25-06-web-build.log.
    7. Step 7 (web size) — `docker images sms-web:phase25-test --format '{{.Size}}'`. Convert to bytes. Assert at most 220 * 1024 * 1024 (230,686,720 bytes).
    8. Step 8 (web boot + health):
       ```
       docker run --rm -d -p 3000:3000 --name sms-web-25-06 sms-web:phase25-test
       sleep 12
       curl -fsS http://localhost:3000/api/health
       docker rm -f sms-web-25-06
       ```
       Curl output must be `{"ok":true}` with HTTP 200.
    9. Step 9 (api boot — minimal, accepts boot-time errors per D-19):
       ```
       docker run --rm -d -p 3003:3003 \
         -e DATABASE_URL=postgresql://stub:stub@127.0.0.1:5432/stub \
         -e REDIS_HOST=127.0.0.1 -e REDIS_PORT=6379 \
         -e BETTER_AUTH_SECRET=phase25-stub \
         --name sms-api-25-06 sms-api:phase25-test
       sleep 8
       curl -fsS http://localhost:3003/api/health || true
       docker logs sms-api-25-06 | tail -30 > /tmp/25-06-api-logs.txt
       docker rm -f sms-api-25-06
       ```
       Per D-19 step 9 ("verify เฉพาะ Node start + health route reachable แม้ DB unhealthy เพราะ D-03 minimal"): the curl SHOULD return `{"ok":true}` because health endpoint is liveness-only. If the api crashes immediately on missing DB (before HealthController initializes), record this in the report — it is acceptable behavior because the image works in Phase 26 once compose provides DATABASE_URL/REDIS_URL. Record the actual outcome.
    10. Step 10 (dev-smoke regression) — `bash scripts/dev-smoke.sh` -> exit 0 required.
    11. Step 11 (CI test regression) — `pnpm --filter @sms-platform/api test` -> exit 0 required (Phase 23 DEBT-02 locked CI green).

    Cross-cutting verifications (additional must-haves):
    - C1. `git diff --quiet HEAD -- apps/api/Dockerfile.dev` exits 0 (Phase 24 D-06 byte-identical lock preserved).
    - C2. `grep -c "^FROM " apps/api/Dockerfile` returns 4. `grep -c "^FROM " apps/web/Dockerfile` returns 3.
    - C3. `! grep -q "COPY packages" apps/api/Dockerfile && ! grep -q "COPY packages" apps/web/Dockerfile` (D-15, D-17).
    - C4. `! grep -q "tini" apps/web/Dockerfile` (D-07).

    Write the report to `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md` with this template (fill in actual values):

    --- BEGIN REPORT TEMPLATE ---
    # Phase 25 Verification Report

    **Generated:** {ISO-8601 timestamp}
    **Status:** {pass | fail}

    ## Image artifacts

    | Image | Tag | Size | Digest |
    |-------|-----|------|--------|
    | sms-api | phase25-test | {value MB} | {sha256:...} |
    | sms-web | phase25-test | {value MB} | {sha256:...} |

    ## D-19 Manual Checklist

    ### Step 1: api build
    Command: `docker build -f apps/api/Dockerfile . -t sms-api:phase25-test`
    Exit code: 0
    Last 5 lines:
    ```
    {paste}
    ```
    Result: PASS

    ### Step 2: api size at most 450MB
    Command: `docker images sms-api:phase25-test --format '{{.Size}}'`
    Output: {value}
    Bytes: {numeric}
    Budget: 471,859,200 bytes (450MB)
    Result: PASS / FAIL ({delta})

    ... (steps 3-11 + C1-C4) ...

    ## Cross-cutting checks

    | Check | Result |
    |-------|--------|
    | C1: Dockerfile.dev byte-identical | PASS / FAIL |
    | C2: api 4 stages, web 3 stages | PASS / FAIL |
    | C3: no COPY packages line | PASS / FAIL |
    | C4: web has no tini | PASS / FAIL |

    ## Threat-model verification

    | Threat ID | Control | Evidence | Status |
    |-----------|---------|----------|--------|
    | T-25-08 / T-25-14 | .env not in image layer | `docker history` scan returned no .env hits | PASS |
    | T-25-09 / T-25-15 | Non-root uid 1001 | Step 3 + web `id` check | PASS |
    | T-25-10 | tini reaps zombies | Step 5 confirms tini PID 1 | PASS |
    | T-25-11 | Prisma migrations in runtime | `ls /app/apps/api/src/prisma/migrations/` from Plan 04 Task 3 step 6 | PASS |
    | T-25-12 | --ignore-scripts on pnpm install | `grep -c ignore-scripts apps/api/Dockerfile` returned >= 2 | PASS |
    | T-25-16 | Web boot succeeds | Step 8 curl returned {"ok":true} | PASS |

    ## Roadmap success criteria mapping

    | Roadmap criterion | Verifying step(s) | Status |
    |-------------------|-------------------|--------|
    | #1 (api at most 450MB, bookworm-slim, ffmpeg + tini) | Steps 1, 2, 4, 5 | PASS |
    | #2 (api non-root, ffmpeg on PATH) | Steps 3, 4 | PASS |
    | #3 (web at most 220MB, standalone + outputFileTracingRoot, boots 3000 non-root) | Steps 6, 7, 8 + Plan 03 + Plan 05 Task 3 | PASS |
    | #4 (per-app .dockerignore excludes test/build/.planning) | Plan 04 Task 1 + Plan 05 Task 1 acceptance | PASS |

    ## Sign-off

    - [ ] User has reviewed image sizes
    - [ ] User has reviewed `docker history` outputs (no .env leak)
    - [ ] User has approved phase completion
    --- END REPORT TEMPLATE ---
  </action>
  <verify>
    <automated>test -f .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md && grep -q "D-19" .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md && grep -q "Step 1" .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md && grep -q "Step 11" .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md && grep -qE "^[|] *#1.*PASS" .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md && bash scripts/dev-smoke.sh && git diff --quiet HEAD -- apps/api/Dockerfile.dev</automated>
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md` exists.
    - File contains all 11 D-19 step headers (`Step 1` through `Step 11`).
    - File contains the cross-cutting checks (`C1`, `C2`, `C3`, `C4`) and threat-model verification table.
    - Roadmap success criteria mapping table contains rows for `#1`, `#2`, `#3`, `#4` all marked `PASS`.
    - api image size in bytes is at most 471,859,200 (450MB).
    - web image size in bytes is at most 230,686,720 (220MB).
    - `bash scripts/dev-smoke.sh` exits 0.
    - `pnpm --filter @sms-platform/api test` exits 0 (Phase 23 CI green preservation).
    - `git diff --quiet HEAD -- apps/api/Dockerfile.dev` exits 0 (Phase 24 D-06 lock preserved).
  </acceptance_criteria>
  <done>25-VERIFICATION.md exists with all 11 steps + cross-cutting + threat-model + roadmap mapping; all checks PASS or are documented as expected failures with rationale.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: User signs off on image artifacts</name>
  <files>.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md</files>
  <action>Pause execution and present the verification report to the user. Do NOT auto-mark the phase complete; wait for an explicit `approved` reply on the resume-signal. If the user reports an issue, route back to the relevant plan (e.g. image size over budget -> Plan 04 or Plan 05 remediation) before re-running this checkpoint.</action>
  <what-built>
    - apps/api/src/health/{health.controller.ts, health.module.ts} (Plan 01)
    - apps/web/src/app/api/health/route.ts (Plan 02)
    - apps/web/next.config.ts updated with outputFileTracingRoot (Plan 03)
    - apps/api/Dockerfile + apps/api/.dockerignore (Plan 04)
    - apps/web/Dockerfile + apps/web/.dockerignore (Plan 05)
    - .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md (Plan 06 Task 2)

    Both images built fresh, all 11 D-19 steps recorded, cross-cutting checks passed, threat model verified, roadmap criteria mapped.
  </what-built>
  <how-to-verify>
    1. Open `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md` and review:
       - api image size (must be at most 450MB; record actual delta)
       - web image size (must be at most 220MB; record actual delta)
       - Step 5 tini output (api only; confirm `/usr/bin/tini` + `tini version`)
       - Step 8 web boot output (curl `/api/health` returns `{"ok":true}`)
       - Step 9 api boot output (record actual outcome — D-19 accepts boot-time DB errors)
       - Step 10 dev-smoke result (must be exit 0)
       - Step 11 CI test result (must be exit 0)
       - Cross-cutting C1-C4 (all PASS)
       - Threat-model table (all PASS)
       - Roadmap success criteria mapping (all PASS)

    2. Optionally re-run any single step to spot-check:
       - `docker images | grep phase25-test` — confirms both images present.
       - `docker history sms-api:phase25-test --no-trunc | grep -i env` — confirms no `.env` leakage.
       - `bash scripts/dev-smoke.sh` — confirms dev workflow unchanged.

    3. If everything looks good, type `approved`.
       If any check failed or is borderline (e.g. image at 451MB), type the specific concern (e.g. `api image is 451MB — at most 450 budget violated by 1MB; investigate`).
  </how-to-verify>
  <resume-signal>Type `approved` to mark Phase 25 complete, or describe specific concerns for remediation.</resume-signal>
  <verify>
    <automated>test -f .planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md</automated>
  </verify>
  <done>User has typed `approved` on the resume signal; phase 25 is ready to commit.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Verification report -> downstream phases | Phase 26+ rely on this report's PASS verdict; a false PASS here propagates to GA |
| User judgment -> phase completion | Sign-off checkpoint catches issues automation cannot (size at the boundary, unexpected layer content) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-25-19 | Repudiation | Verification report could be fabricated | mitigate | Every numeric value in the report has a `/tmp/25-06-*.{log,txt}` source captured during Task 1; user can spot-check by re-running commands. |
| T-25-20 | Tampering | dev-smoke.sh failure papered over | mitigate | Task 2 acceptance criteria explicitly requires `bash scripts/dev-smoke.sh` exits 0 — gate cannot pass otherwise. |
| T-25-21 | Tampering | Phase 24 Dockerfile.dev modified accidentally | mitigate | Cross-cutting check C1 verifies `git diff --quiet HEAD -- apps/api/Dockerfile.dev` exits 0. |
| T-25-22 | Information Disclosure | .env layer in image (Pitfall 8 BLOCKER) | mitigate | Task 1 step 6 captures `docker history` for both images; Task 2 verify step `! docker history ... | grep -E "(^|[^.])\.env( |$)"` would fail if any layer leaked .env. |
</threat_model>

<verification>
1. `25-VERIFICATION.md` exists with all 11 D-19 steps + cross-cutting + threat-model tables.
2. Both image sizes within budget (api at most 450MB, web at most 220MB).
3. Dev workflow regression check passes (`scripts/dev-smoke.sh` exit 0).
4. Phase 23 CI test regression check passes (`pnpm --filter @sms-platform/api test` exit 0).
5. Phase 24 Dockerfile.dev byte-identical (git diff exit 0).
6. User checkpoint approved.
</verification>

<success_criteria>
- ROADMAP §Phase 25 Success Criteria #1-4 all PASS in the report.
- D-19 11-step checklist all PASS (or documented exceptions for D-19 step 9 boot behavior).
- Phase 24 deploy folder convention preserved (Dockerfile.dev untouched).
- User has approved phase completion via checkpoint.
- Phases 26 + 28 can proceed against verified, signed-off image artifacts.
</success_criteria>

<output>
After completion (user signs off `approved`), create `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-06-SUMMARY.md` linking to 25-VERIFICATION.md and noting the user approval timestamp.
</output>
