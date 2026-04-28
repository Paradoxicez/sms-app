---
phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli
plan: 01
subsystem: infra
tags: [cli, bin-sms, super-admin, prisma, better-auth, scrypt, dockerfile, deploy]

requires:
  - phase: 23-tech-debt-cleanup-phase-0-prerequisites
    provides: prisma migrate history + DATABASE_URL_MIGRATE RLS-bypass DSN pattern (consumed by datasourceUrl)
  - phase: 25-multi-stage-dockerfiles-image-hardening
    provides: 4-stage production Dockerfile with builder source-tree mount + final-stage WORKDIR /app/apps/api + non-root app:app uid 1001 (patched here with one-line COPY)
  - phase: 26-production-compose-migrate-init-networking-volumes
    provides: sms-migrate init service + .env ADMIN_EMAIL/ADMIN_PASSWORD declarations (consumed by Plan 29-02 bootstrap.sh)

provides:
  - apps/api/src/cli/sms.ts (Node CLI source, ~211 LOC, SWC-compiled to dist/cli/sms.js)
  - apps/api/bin/sms (3-line bash wrapper, mode 100755 in git index, exec node /app/apps/api/dist/cli/sms.js)
  - apps/api/Dockerfile patch (single-line COPY apps/api/bin into final stage, total final-stage COPY count 5→6)
  - bin/sms create-admin subcommand: idempotent super-admin upsert (Org→User→Account→Member) with --force password rotation

affects:
  - phase 29-02 (bootstrap.sh — runtime consumer that invokes `docker compose exec api bin/sms create-admin --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD"` per D-09)
  - phase 30 (clean-VM smoke test — exercises bin/sms end-to-end, validates the executable bit ships through GHCR pulls)
  - any future v1.4 subcommand (doctor, reset-password, verify-backup) — extends src/cli/sms.ts switch in main()

tech-stack:
  added: []  # zero new build-time deps; reuses better-auth/crypto + @prisma/client
  patterns:
    - Light-CLI pattern (Node script + bash wrapper, no NestJS factory) — ~0ms boot vs ~1-2s with DI
    - Subcommand router via process.argv switch — extensible without refactor
    - RLS bypass via datasourceUrl: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL (mirrors seed.ts)
    - Email-deterministic IDs (`super-admin-${Date.now()}`, `acct-${userId}`, `member-${userId}`) — re-runs hit same row deterministically
    - --force flag for idempotent password rotation; default exit 1 protects against accidental clobber
    - Single-admin invariant lock (refuses 2nd super-admin with different email — multi-admin support deferred to DEPLOY-29 v1.4)

key-files:
  created:
    - apps/api/src/cli/sms.ts (211 LOC — subcommand router + create-admin handler)
    - apps/api/bin/sms (3 non-empty lines — bash wrapper, mode 100755 in git index)
  modified:
    - apps/api/Dockerfile (+1 line — `COPY --from=builder --chown=app:app /app/apps/api/bin ./apps/api/bin` between dist COPY and src/prisma COPY)

key-decisions:
  - Light-CLI over Nest factory (D-01) — saves ~1-2s on every operator invocation; reuses seed.ts upsert chain step-for-step so RLS regression risk is zero
  - Single super-admin invariant for v1.3 (revision B2) — refuses second admin with different email; multi-admin via DEPLOY-29 in v1.4
  - Email-deterministic IDs (revision B1) — replaces hardcoded `'super-admin-user-id'`/`'super-admin-account-id'`/`'super-admin-member-id'` literals from seed.ts; re-runs against existing user reuse the same row, fresh installs get `super-admin-${Date.now()}`
  - process.exit(2) for usage errors / unknown subcommand; process.exit(1) for runtime failures (existing-user-no-force, db error) — matches D-29 conventions
  - Better Auth scrypt (D-05) over ROADMAP "bcrypt" wording — code-as-truth; ROADMAP language correction tracked for future docs sweep
  - Skip Developer Package upsert (D-06 step 5 in seed.ts) — that's dev-only; org doesn't need packageId for login; operator creates package via admin UI post-bootstrap

patterns-established:
  - "Light-CLI subcommand router: standalone Node script + bash wrapper (no DI/Nest factory) for operator tools"
  - "RLS-bypass DSN reuse: every standalone script that touches Member/Account uses `datasourceUrl: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL`"
  - "git update-index --chmod=+x for shipping executables through Dockerfile COPY (preserves exec bit on cross-platform clones, NTFS, Windows)"
  - "Email-as-primary-identity for super-admin idempotency (NOT user.id) — operator-visible, stable across DB resets"

requirements-completed: [DEPLOY-17]

duration: ~16min
completed: 2026-04-28
---

# Phase 29 Plan 01: bin/sms create-admin Operator CLI Summary

**Subcommand-router Node CLI with `create-admin` handler that upserts a super-admin into the System organization (Org → User → Account → Member chain), idempotent via `--force`, ships into the production image via a single-line Dockerfile patch, and is callable as `docker compose exec api bin/sms create-admin --email <e> --password <p>` per ROADMAP §Phase 29 SC #1.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-04-28T14:02Z
- **Completed:** 2026-04-28T14:18Z
- **Tasks:** 3 (all autonomous, no checkpoints)
- **Files created:** 2 (src/cli/sms.ts, bin/sms)
- **Files modified:** 1 (apps/api/Dockerfile)
- **Total LOC added:** 215 (211 cli source + 3 wrapper + 1 Dockerfile)

## Accomplishments

- **`apps/api/src/cli/sms.ts` (211 LOC)** — Light-CLI source: subcommand router (D-03) + `create-admin` handler that mirrors seed.ts upsert chain step-for-step (Organization → User → Account → Member), skips Developer Package (dev-only per D-06), and reads email/password from CLI argv (NOT env). Bypasses Member/Account RLS via `datasourceUrl: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL` (same pattern as seed.ts). Hashes password via Better Auth scrypt (`better-auth/crypto.hashPassword`).
- **`apps/api/bin/sms` (3 non-empty lines, mode 100755)** — Minimal bash shim: `#!/usr/bin/env bash` + `set -euo pipefail` + `exec node /app/apps/api/dist/cli/sms.js "$@"`. Working-tree exec bit set via `chmod +x`; git-index mode set via `git update-index --chmod=+x` so cross-platform clones (Windows, NTFS) preserve the executable bit through Dockerfile COPY.
- **`apps/api/Dockerfile` (+1 line)** — Single-line patch in final stage between dist COPY (L102) and src/prisma COPY (L103) inserts `COPY --from=builder --chown=app:app /app/apps/api/bin ./apps/api/bin`. Final-stage COPY count goes 5→6. WORKDIR/USER/HEALTHCHECK/ENTRYPOINT preserved. Phase 25 cross-touch acknowledged + locked here per CLAUDE.md Deploy Folder Convention rule 2.
- **Idempotency contract (D-04 + revision B2)** — Re-running `bin/sms create-admin --email same@example.com --password new` exits 1 with `Error: User same@example.com already exists. Use --force to update password.`; adding `--force` rotates the credential account password (re-hashes via scrypt) without disturbing user.id, member, or org-membership rows.
- **Single-admin invariant locked in source (revision B2)** — Refuses to create a second super-admin with a different email. Source comment + grep-asserted string `v1.3 supports single super-admin only` directs operators to v1.4 (DEPLOY-29) for multi-admin support.

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-executor convention):

1. **Task 1: Author apps/api/src/cli/sms.ts (subcommand router + create-admin handler)** — `6f929bb` (feat)
2. **Task 2: Author apps/api/bin/sms (bash wrapper) + chmod +x in source tree** — `a49b67d` (feat)
3. **Task 3: Patch apps/api/Dockerfile final stage with COPY apps/api/bin ./apps/api/bin** — `0a6a15b` (chore)

## Files Created/Modified

- **`apps/api/src/cli/sms.ts`** (created, 211 LOC) — Subcommand router + create-admin handler; PrismaClient with RLS-bypass datasourceUrl; better-auth/crypto scrypt; 4-step upsert chain (Org→User→Account→Member); idempotency via --force; single-admin invariant lock; `process.exit(2)` for usage errors, `process.exit(1)` for runtime failures.
- **`apps/api/bin/sms`** (created, 3 non-empty lines) — Bash wrapper. `git ls-files --stage apps/api/bin/sms` returns `100755 f12d127… 0	apps/api/bin/sms`.
- **`apps/api/Dockerfile`** (modified, +1 line) — Single-line patch inserting bin COPY between dist COPY and src/prisma COPY in final stage.

## Verbatim Dockerfile Diff

```diff
@@ -100,6 +100,7 @@ ENV NODE_ENV=production
 COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
 COPY --from=prod-deps --chown=app:app /app/apps/api/node_modules ./apps/api/node_modules
 COPY --from=builder --chown=app:app /app/apps/api/dist ./apps/api/dist
+COPY --from=builder --chown=app:app /app/apps/api/bin ./apps/api/bin
 COPY --from=builder --chown=app:app /app/apps/api/src/prisma ./apps/api/src/prisma
 COPY --from=builder --chown=app:app /app/apps/api/package.json ./apps/api/
```

## bin/sms Git-Index Mode Confirmation

```
$ git ls-files --stage apps/api/bin/sms
100755 f12d1277ada8802f749253ba54e7d96f5d190493 0	apps/api/bin/sms
```

Mode `100755` (NOT `100644`) — the executable bit ships through Docker BuildKit COPY into `/app/apps/api/bin/sms` in the runtime image. This is critical for cross-platform clones (Windows, NTFS) where the working-tree `chmod +x` is lost on `git checkout` but the git-index mode survives.

## Verification Evidence (Plan-Level Success Criteria)

| # | Criterion | Result |
|---|-----------|--------|
| SC1 | `apps/api/dist/cli/sms.js` compiles via existing Phase 25 builder stage with no new build-time deps | PASS — `pnpm --filter @sms-platform/api build` emitted dist/cli/sms.js, contains `create-admin` literal at multiple positions |
| SC2 | `apps/api/bin/sms` committed with mode 100755 in git index | PASS — `git ls-files --stage` returns `100755 f12d1277…` |
| SC3 | `apps/api/Dockerfile` has exactly one added line — `COPY --from=builder --chown=app:app /app/apps/api/bin ./apps/api/bin` — between dist and src/prisma COPYs | PASS — `git diff HEAD~1 HEAD -- apps/api/Dockerfile` shows `+1, -0`; total final-stage COPY count is 6 (was 5); awk-asserted ordering `dist < bin < prisma` |
| SC4 | CLI subcommand router uses `case 'create-admin'`; missing/unknown subcommand prints usage and exits 2; create-admin refuses existing user without --force (exit 1); --force rotates password idempotently; all four upserts use DATABASE_URL_MIGRATE | PASS — all 18 acceptance greps from Task 1 pass; manual code review confirms all four prisma.{organization,user,account,member}.upsert calls share the single PrismaClient with the RLS-bypass DSN |
| SC5 | `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet` exits 0 against the patched Dockerfile reference | PASS — exit code 0 |

## Decisions Made

None new — plan executed exactly as written. All decisions came from 29-CONTEXT.md (D-01 through D-06 + D-29) and were honored verbatim, including:

- D-01 light-CLI 3-line bash wrapper
- D-02 single-line Dockerfile patch with `./apps/api/bin` destination (NOT `./bin` per revision B1)
- D-03 subcommand router with `case 'create-admin'`
- D-04 idempotency via error + `--force`
- D-05 Better Auth scrypt (NOT bcrypt despite ROADMAP wording — code-as-truth)
- D-06 4-step upsert chain skipping Developer Package
- Revision B2 single-admin invariant lock with explicit source comment + grep guard

## Deviations from Plan

None — plan executed exactly as written. All static greps and acceptance criteria pass on first attempt.

## Issues Encountered

None. Build succeeded first try; chmod + git update-index --chmod=+x produced mode 100755 first try; Dockerfile single-line insertion was clean Edit; `docker compose config --quiet` exits 0.

## Threat Model Status

| Threat | Disposition | Status |
|--------|-------------|--------|
| T-29-01 (argv password disclosure) | accept | Documented for v1.4 mitigation; no code change required at this plan |
| T-29-02 (Dockerfile COPY ships mode 644) | mitigate | **MITIGATED** — `git ls-files --stage` returns 100755; gate enforced at plan-execution time, not deploy time |
| T-29-03 (RLS bypass via DATABASE_URL_MIGRATE) | mitigate | **MITIGATED** — by-design admin-tool path; DSN scoped to compose service; container is non-root |
| T-29-04 (bcrypt vs scrypt language drift) | accept | Documented in D-05; ROADMAP correction tracked for future docs sweep |
| T-29-05 (forgotten --force on retry) | mitigate | **MITIGATED** — D-04 default-error path emits actionable stderr; bootstrap.sh in Plan 29-02 wraps in `… || … --force` (D-09) |

## User Setup Required

None — Plan 29-02 (bootstrap.sh) is the runtime consumer of this CLI. Operator never invokes `bin/sms` directly during first-run bootstrap; bootstrap.sh sources `deploy/.env` and calls `docker compose exec api bin/sms create-admin --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD"` per D-09. Day-2 password rotation will be a documented runbook step in Plan 29-06 TROUBLESHOOTING.md.

## Next Phase Readiness

- **Plan 29-02 (bootstrap.sh)** — Unblocked. Can now invoke `docker compose exec api bin/sms create-admin` with confidence that the wrapper resolves at `/app/apps/api/bin/sms` (relative `bin/sms` from runtime WORKDIR `/app/apps/api`), the binary is executable (mode 100755 git index), and the create-admin handler is idempotent via `--force` per D-09 retry pattern.
- **Phase 30 (clean-VM smoke)** — Will exercise the CLI end-to-end during the <10-min bootstrap claim. Live verification deferred to that phase per `<verification>` block of the plan; no Docker daemon was used at plan-execution time but `docker compose config --quiet` confirmed compose still parses.
- **Future v1.4 subcommands** — Router pattern (D-03 switch in main()) accepts new cases (`doctor`, `reset-password`, `verify-backup`) without refactor. parseArgs() helper is reusable for future flag-based subcommands.

## Self-Check: PASSED

**Files claimed exist:**
- `apps/api/src/cli/sms.ts` — FOUND (211 LOC)
- `apps/api/bin/sms` — FOUND (mode 100755 in git index)
- `apps/api/Dockerfile` — FOUND (modified, +1 line)
- `apps/api/dist/cli/sms.js` — FOUND (SWC compile output, contains `create-admin` literal)

**Commits claimed exist:**
- `6f929bb` (Task 1) — FOUND in `git log --oneline`
- `a49b67d` (Task 2) — FOUND in `git log --oneline`
- `0a6a15b` (Task 3) — FOUND in `git log --oneline`

---
*Phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli*
*Completed: 2026-04-28*
