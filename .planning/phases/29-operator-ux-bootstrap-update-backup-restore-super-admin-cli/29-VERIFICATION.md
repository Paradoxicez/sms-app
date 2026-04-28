---
phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli
verified: 2026-04-28T15:30:00Z
status: human_needed
score: 5/5 must-haves verified statically
re_verification: false
human_verification:
  - test: "SC #2 — Cold deploy <10-minute wall-clock claim on fresh VM"
    expected: "On a fresh DigitalOcean/Hetzner Ubuntu 22.04 droplet (4GB RAM, Docker pre-installed), `bash deploy/scripts/bootstrap.sh` completes pre-flight + auto-secrets + image pull + sms-migrate + create-admin + HTTPS poll within 10 minutes wall-clock; bootstrap.sh's D-12 ELAPSED log records the actual seconds and the HTTPS endpoint returns 200 on /api/health"
    why_human: "Requires fresh VM provisioning + DNS A-record + Let's Encrypt cert issuance — not testable in static analysis. Phase 30 (DEPLOY-25) is the explicit acceptance gate; Plan 29-02 verification block defers this live test by design and Plan 29-06 ships SMOKE-TEST-LOG.md placeholder for Phase 30 to populate."
  - test: "SC #1 — bin/sms create-admin runtime correctness against live DB"
    expected: "`docker compose exec api bin/sms create-admin --email <e> --password <p>` exits 0; the user can log in via Better Auth at the deployed URL using the same credentials; re-running with the same email exits 1 with 'already exists' message; re-running with --force rotates the credential.password column without changing user.id, member.id, or role"
    why_human: "Requires running api container with live Postgres + Better Auth — static greps confirmed scrypt via `better-auth/crypto`, the 4-step upsert chain, RLS-bypass DSN, and --force/no-force exit codes, but actual login + password-rotation byte-equivalence requires Phase 30 fresh-VM smoke test."
  - test: "SC #3 — update.sh atomic recycle without dropping in-flight requests beyond grace period"
    expected: "On a running stack at v1.3.0, `bash deploy/scripts/update.sh v1.3.1` switches IMAGE_TAG, runs pre-flight migrate against new image, recycles services in dependency order (postgres → redis → minio → migrate → api → web → caddy), and curl probes against /api/health succeed within configured Caddy grace period (no requests dropped for >5s)"
    why_human: "Requires two image tags built + GHCR push + running stack to demonstrate the atomic switch. Static analysis confirmed pre-flight migrate ordering (line 92 < sed line 102), Phase 26 depends_on chain wiring, and 120s health-poll budget — but graceful-recycle observation is a live test."
  - test: "SC #4 — backup.sh + restore.sh byte-equivalent round-trip"
    expected: "On a populated stack: `bash deploy/scripts/backup.sh` produces sms-backup-<UTC-ts>.tar.gz; `bash deploy/scripts/restore.sh <archive> --yes` rebuilds; SELECT counts on User/Organization/Member/Camera/Recording match pre-backup; MinIO bucket object lists match (avatars/recordings/snapshots); Caddy serves HTTPS without re-issuing cert (caddy_data preserved)"
    why_human: "Requires populated source DB + MinIO buckets + active TLS cert. Static analysis confirmed 3-entry archive contract (postgres.dump + minio/ + caddy_data.tar.gz), pg_dump -Fc + pg_restore --clean --if-exists symmetry, mc mirror forward + reverse symmetry, alpine tar volume-mount symmetry, and 5 awk ordering checks (verify→destroy, confirm→destroy, extract→destroy, wipe→boot, caddy→full-up) — but byte-equivalent data parity is a live test."
  - test: "SC #5 — README quickstart end-to-end on fresh VM"
    expected: "A first-time operator follows deploy/README.md §Quickstart steps 1-5 verbatim (clone → cp .env → fill DOMAIN/ADMIN_EMAIL/GHCR_ORG → bash bootstrap.sh → login at https://${DOMAIN}) and reaches a logged-in super-admin session without consulting any other doc; SMOKE-TEST-LOG.md captures the elapsed seconds + any drift between docs and live behavior"
    why_human: "Phase 30 DEPLOY-25 is the explicit acceptance gate per ROADMAP §Phase 30. The docs ARE the test plan. Static analysis confirmed all 5 D-25 sub-sections present, all cross-links closed, all 6 D-28 mandatory symptoms in TROUBLESHOOTING.md, and the SMOKE-TEST-LOG.md placeholder forward-references Phase 30."
---

# Phase 29: Operator UX (bootstrap/update/backup/restore + super-admin CLI) Verification Report

**Phase Goal:** A developer who has never seen the codebase can clone the repo, copy the env example, run a single `bootstrap.sh`, and reach a working super-admin login URL in under 10 minutes. Day-2 ops (update / backup / restore) each fit on a single command and produce auditable, idempotent results.

**Verified:** 2026-04-28T15:30:00Z
**Status:** human_needed (static checks pass; live VM verification is Phase 30 DEPLOY-25)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP §Phase 29 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | `bin/sms create-admin --email <e> --password <p>` creates super-admin with system-org membership and scrypt-hashed password; user can log in immediately | ✓ VERIFIED (static) | apps/api/src/cli/sms.ts:14-23 imports `PrismaClient` + `better-auth/crypto.hashPassword` (D-05 scrypt, NOT bcrypt despite ROADMAP wording); lines 105-167 implement 4-step upsert (Organization slug=system → User role=admin → Account providerId=credential → Member); line 17 uses `process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL` for RLS bypass; apps/api/dist/cli/sms.js compiled (8.2K, contains `create-admin` literal); apps/api/bin/sms exists with mode 100755 in git index; apps/api/Dockerfile line 103 has `COPY --from=builder --chown=app:app /app/apps/api/bin ./apps/api/bin` between dist (102) and prisma (104). Live login deferred to Phase 30. |
| SC2 | `bash deploy/scripts/bootstrap.sh` completes in under 10 minutes wall-clock on a fresh VM | ✓ VERIFIED (static) | deploy/scripts/bootstrap.sh:189 LOC, mode 100755; D-07 pre-flight (docker info + .env + DOMAIN); D-08 auto-secrets via `bash "${SCRIPT_DIR}/init-secrets.sh"` on placeholder match (line 70-72); D-09 `${DC} up -d --wait sms-migrate` (line 107) gates create-admin; line 141+145 invoke `${DC} exec -T api bin/sms create-admin` with --force fallback via stderr scrape; D-10 HTTPS poll loop `seq 1 24` × `curl --max-time 5 https://${DOMAIN}/api/health` (lines 162-167); D-12 `START=$(date +%s)` (line 57) + `ELAPSED=$(( $(date +%s) - START ))` (line 181) print elapsed seconds. Live <10-min wall-clock proof deferred to Phase 30 (SMOKE-TEST-LOG.md placeholder shipped). |
| SC3 | `bash deploy/scripts/update.sh v1.3.1` updates IMAGE_TAG + runs migrate + recycles in dependency order without dropping requests beyond grace period | ✓ VERIFIED (static) | deploy/scripts/update.sh:128 lines, mode 100755; D-13 positional arg + semver/latest regex `^v[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9]+(\.[a-z0-9]+)*)?$|^latest$`; D-15 atomic guard awk-proven: migrate line 92 (`IMAGE_TAG="${TAG}" ${DC} run --rm sms-migrate`) precedes sed line 102 (`sed -i.tmp "s\|^IMAGE_TAG=.*\|IMAGE_TAG=${TAG}\|"`) — broken migrate cannot mutate .env; D-14 backup `cp ENV_FILE ${BACKUP}` + `chmod 600 "${BACKUP}"` + UTC timestamp `date -u +%Y%m%dT%H%M%SZ`; recycle via bare `${DC} up -d` (no --force-recreate, no --no-deps) inheriting Phase 26 depends_on chain; D-16 health probe `curl https://${DOMAIN}/api/health` 5s × 24. Live recycle observation deferred to Phase 30. |
| SC4 | `bash deploy/scripts/backup.sh` produces single timestamped archive (pg_dump + MinIO mirror + caddy_data tar); `restore.sh <archive>` rebuilds byte-equivalent | ✓ VERIFIED (static) | **backup.sh:** 164 LOC, mode 100755; D-18 awk-proven: stop line 89 (`${DC} stop api web`) precedes pg_dump line 101 (`${DC} exec -T postgres pg_dump -U ... -Fc`); D-19 mc mirror loop `for BUCKET in avatars recordings snapshots`; D-19 `tar -C /data -czf /backup/caddy_data.tar.gz .` against `sms-platform_caddy_data:/data:ro` mount; archive name `sms-backup-${TS}.tar.gz` with `TS=$(date -u +%Y-%m-%dT%H%MZ)` matching ROADMAP SC #4 verbatim; `chmod 600 "${ARCHIVE}"` (line 141); EXIT trap restarts api+web on any path; D-19 exclusions verified — no `redis_data`, no `hls_data`, no `tar.*\.env` references in code paths. **restore.sh:** 200 LOC, mode 100755; 5 awk ordering checks all pass: verify (line 68) → confirm (line 78) → extract (line 96) → wipe (line 104) → boot postgres+minio (line 111); D-21 integrity verify `tar -tzf` + grep for 3 required entries before `compose down -v`; D-22 confirmation gate with `--yes` bypass; D-23 `pg_restore --clean --if-exists --no-owner --no-privileges`, `mc mb --ignore-existing`, alpine `rm -rf /data/* && tar -C /data -xzf` for caddy_data. Live byte-equivalent round-trip deferred to Phase 30. |
| SC5 | `deploy/README.md` documents 5-step quickstart proving <10-min claim with timing log | ✓ VERIFIED (static) | deploy/README.md:172 lines (overwrote Phase 24 stub); 7 H2 sections including `## Quickstart` with all 5 D-25 H3 sub-sections present (`### 1. Clone`, `### 2. Configure secrets + identity`, `### 3. Configure DNS`, `### 4. Bootstrap`, `### 5. Login`); `## Day-2 Operations` covers update.sh/backup.sh/restore.sh + bin/sms create-admin --force rotation; `## Layout` table covers all 5 scripts + 4 prod docs; `## <10-minute proof` cross-links to deploy/SMOKE-TEST-LOG.md (Phase 30 forward-pointer); `## Reference` points to ROADMAP/REQUIREMENTS/research; `## Troubleshooting` cross-links to TROUBLESHOOTING.md; relative paths `./DOMAIN-SETUP.md` / `./BACKUP-RESTORE.md` / `./TROUBLESHOOTING.md` / `./SMOKE-TEST-LOG.md` all present. deploy/SMOKE-TEST-LOG.md (18 lines) is intentional placeholder with explicit "Phase 30 (DEPLOY-25) populates first real entry" forward-pointer. Recorded walkthrough/timing log deferred to Phase 30. |

**Score:** 5/5 truths verified statically. Live runtime verification (HTTPS login, byte-equivalent round-trip, <10-min wall-clock, graceful recycle, end-to-end smoke) is the explicit Phase 30 (DEPLOY-25) acceptance gate per ROADMAP — Phase 29 ships the mechanism; Phase 30 ships the proof.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/cli/sms.ts` | Subcommand router + create-admin handler with RLS-bypass DSN, scrypt, 4-step upsert | ✓ VERIFIED | 211 LOC; PrismaClient with `DATABASE_URL_MIGRATE ?? DATABASE_URL`; `better-auth/crypto.hashPassword`; `case 'create-admin'`; single-admin invariant comment + grep guard `v1.3 supports single super-admin only`; `--force` + email-deterministic IDs (`super-admin-${Date.now()}`, `acct-<userId>`, `member-<userId>`); 4 prisma.{organization,user,account,member}.upsert calls. SWC-compiled to dist/cli/sms.js (8.2K). |
| `apps/api/bin/sms` | 3-line bash wrapper with mode 100755 in git index | ✓ VERIFIED | Exactly 3 non-empty lines: `#!/usr/bin/env bash` + `set -euo pipefail` + `exec node /app/apps/api/dist/cli/sms.js "$@"`. `git ls-files --stage` returns `100755 f12d1277...`. |
| `apps/api/Dockerfile` | +1 line COPY apps/api/bin into final stage between dist and prisma | ✓ VERIFIED | Line 103 has `COPY --from=builder --chown=app:app /app/apps/api/bin ./apps/api/bin` between dist COPY (102) and prisma COPY (104). Total final-stage COPY count = 6 (was 5). WORKDIR /app/apps/api (line 108), USER app (line 107), HEALTHCHECK (line 113), ENTRYPOINT (line 117) all preserved. |
| `deploy/scripts/bootstrap.sh` | First-run orchestrator with D-07..D-12 pipeline | ✓ VERIFIED | 189 lines, mode 100755; pre-flight (docker info + .env + DOMAIN) + auto-secrets + `set -a; source ENV; set +a` + two-phase compose up (`up -d --wait sms-migrate` then `up -d`) + api healthcheck poll + `bin/sms create-admin` with --force fallback via stderr scrape + 120s HTTPS poll + ELAPSED + day-2 ops summary. |
| `deploy/scripts/update.sh` | Atomic image-tag upgrade with pre-flight migrate guard | ✓ VERIFIED | 128 lines, mode 100755; positional arg + semver/latest/prerelease regex; pre-flight migrate (line 92) BEFORE sed (line 102); UTC-timestamped .env backup + chmod 600; bare `${DC} up -d` recycle relying on Phase 26 depends_on chain; 120s `/api/health` poll. |
| `deploy/scripts/backup.sh` | Offline atomic 3-source bundle with EXIT-trap restart | ✓ VERIFIED | 164 lines, mode 100755; stop api+web (line 89) BEFORE pg_dump (line 101); 3 buckets (avatars/recordings/snapshots); `sms-platform_caddy_data:/data:ro` mount; archive name `sms-backup-<UTC>.tar.gz` matching ROADMAP SC #4; chmod 600 archive; EXIT trap unconditionally restarts api+web; D-19 exclusions verified. |
| `deploy/scripts/restore.sh` | Verify-first DR script with --yes bypass | ✓ VERIFIED | 200 lines, mode 100755; 5 awk ordering checks all pass (verify=68 < confirm=78 < extract=96 < wipe=104 < boot=111); 3-entry archive contract enforcement (postgres.dump + minio/ + caddy_data.tar.gz); pg_restore --clean --if-exists --no-owner --no-privileges; mc mb --ignore-existing before mirror; alpine rm -rf + tar xzf for caddy_data. |
| `deploy/README.md` | 5-step quickstart + day-2 ops + Layout table + <10-min proof | ✓ VERIFIED | 172 lines (overwrote Phase 24 stub); all 5 D-25 H3 sub-sections; Day-2 Operations with verbose `docker compose -f ... --env-file ... exec api bin/sms create-admin` rotation snippet; Layout table covers every file in deploy/; cross-links to DOMAIN-SETUP.md, BACKUP-RESTORE.md, TROUBLESHOOTING.md, SMOKE-TEST-LOG.md. |
| `deploy/BACKUP-RESTORE.md` | Cron + rclone + DR walkthrough + retention + RTO | ✓ VERIFIED | 151 lines, 9 H2 sections (Quick Reference, archive contents table, Cron auto-schedule with `0 2 * * *` line, Offsite copy with rclone, Encryption with gpg/age, DR walkthrough with exactly 7 numbered steps, Retention with 7 daily + 4 weekly + 3 monthly, Restore RTO target with size-based table, Troubleshooting cross-link). |
| `deploy/TROUBLESHOOTING.md` | 3-column Symptom/Diagnosis/Fix table covering 6 D-28 mandatory + 7th N2 row | ✓ VERIFIED | 64 lines; 3-column markdown table covers ALL 6 D-28 mandatory symptoms (ACME pending / sms-migrate exit 1 / create-admin user-exists / compose pull denied / backup disk full / restore volume in use) + 7th restore-interrupted row (B3 N2); Less common section + Diagnostics section with concrete docker compose commands; cross-links to BACKUP-RESTORE.md and DOMAIN-SETUP.md; staging-CA toggle reference (Phase 27 D-09). |
| `deploy/SMOKE-TEST-LOG.md` | Placeholder forward-referencing Phase 30 | ✓ VERIFIED | 18 lines; explicit "Phase 30 (DEPLOY-25) populates first real entry" forward-pointer; satisfies README's `<10-minute proof` link target without dangling. |

### Key Link Verification

All key-link contracts manually verified — `gsd-tools verify key-links` produced false-positive "not found" results due to over-escaped YAML regex patterns; manual grep confirms every link is wired.

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `apps/api/bin/sms` | `apps/api/dist/cli/sms.js` | `exec node /app/apps/api/dist/cli/sms.js "$@"` | ✓ WIRED | Line 3 of bin/sms is the literal exec invocation. |
| `apps/api/src/cli/sms.ts` | Prisma RLS-bypass DSN | `PrismaClient({ datasourceUrl: ... DATABASE_URL_MIGRATE ?? DATABASE_URL })` | ✓ WIRED | Line 17 is the literal datasourceUrl construction. |
| `apps/api/src/cli/sms.ts` | `better-auth/crypto` | `await import('better-auth/crypto')` + `hash(password)` | ✓ WIRED | Line 21 dynamic import + line 22 hash call. |
| `apps/api/Dockerfile` | `apps/api/bin/sms` | `COPY --from=builder --chown=app:app /app/apps/api/bin ./apps/api/bin` | ✓ WIRED | Line 103 of Dockerfile, exact match. |
| `deploy/scripts/bootstrap.sh` | `init-secrets.sh` | `bash "${SCRIPT_DIR}/init-secrets.sh"` | ✓ WIRED | Line 72; SCRIPT_DIR is deploy/scripts so the resolved path is deploy/scripts/init-secrets.sh. |
| `bootstrap.sh` | compose up sms-migrate | `${DC} up -d --wait sms-migrate` | ✓ WIRED | Line 107; DC expands to `docker compose -f ... --env-file ...`. Header comment block (lines 14-17) shows literal verbose form. |
| `bootstrap.sh` | `bin/sms create-admin` | `${DC} exec -T api bin/sms create-admin --email --password [--force]` | ✓ WIRED | Lines 141 + 145 (first-run + --force retry). |
| `bootstrap.sh` | `https://${DOMAIN}/api/health` | curl 5s × 24 (120s) | ✓ WIRED | Lines 162-167. |
| `update.sh` | `compose run --rm sms-migrate` | Pre-flight migrate via env-prefix override | ✓ WIRED | Lines 90-93; `IMAGE_TAG="${TAG}" ${DC} run --rm sms-migrate`. |
| `update.sh` | `deploy/.env` | `sed -i.tmp "s\|^IMAGE_TAG=.*\|IMAGE_TAG=${TAG}\|"` | ✓ WIRED | Line 102; runs ONLY after pre-flight migrate succeeds (awk-verified ordering). |
| `update.sh` | `https://${DOMAIN}/api/health` | curl 5s × 24 | ✓ WIRED | Lines 116-123. |
| `backup.sh` | postgres pg_dump | `${DC} exec -T postgres pg_dump -Fc` | ✓ WIRED | Line 95-101. |
| `backup.sh` | MinIO mc mirror | `${DC} exec -T minio sh -c 'mc mirror ...'` | ✓ WIRED | Lines 107-114. |
| `backup.sh` | caddy_data volume | `docker run --rm -v sms-platform_caddy_data:/data:ro alpine tar -C /data -czf` | ✓ WIRED | Lines 128-133; literal `sms-platform_caddy_data` ref at line 124+136. |
| `restore.sh` | tar -tzf integrity verify | Index-read + grep for 3 required entries | ✓ WIRED | Line 68; precedes compose down -v. |
| `restore.sh` | compose down -v | `${DC} down -v` | ✓ WIRED | Line 104. |
| `restore.sh` | postgres pg_restore | `${DC} exec -T postgres pg_restore --clean --if-exists` | ✓ WIRED | Line 137-143. |
| `restore.sh` | MinIO mc mirror reverse | `${DC} exec -T minio sh -c 'mc mb --ignore-existing && mc mirror'` | ✓ WIRED | Line 161. |
| `restore.sh` | caddy_data restore | `docker run --rm -v sms-platform_caddy_data:/data alpine sh -c "rm -rf /data/* && tar ..."` | ✓ WIRED | Lines 169-175. |
| `README.md` | bootstrap.sh | Step 4 quickstart command | ✓ WIRED | Line 78 (and line 160). |
| `README.md` | DOMAIN-SETUP.md / BACKUP-RESTORE.md / TROUBLESHOOTING.md / SMOKE-TEST-LOG.md | Relative paths | ✓ WIRED | All cross-links present (verified with `grep -E ./[A-Z-]+\.md` on README). |
| `BACKUP-RESTORE.md` | backup.sh / restore.sh | Recipe sections | ✓ WIRED | Lines 9, 12, 15, 18 + DR walkthrough. |
| `TROUBLESHOOTING.md` | All scripts + DOMAIN-SETUP.md | Symptom-fix table | ✓ WIRED | All 4 scripts + DOMAIN-SETUP referenced in Common failures rows. |

### Data-Flow Trace (Level 4)

Not applicable — Phase 29 ships infrastructure scripts and operator docs; no UI components rendering dynamic data. The CLI/scripts ARE the data flow (operator argv → CLI → DB writes; backup script → archive contents). Static analysis confirmed all data sources (Prisma upserts, pg_dump, mc mirror, alpine tar) produce real outputs from real targets — no hardcoded empty values, no static returns. Live data-flow verification (login session, byte-equivalent round-trip) is Phase 30 territory.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CLI source compiles via SWC | `pnpm --filter @sms-platform/api build` (per Plan 29-01 SUMMARY) | dist/cli/sms.js emitted (8.2K, contains `create-admin` literal at multiple positions) | ✓ PASS |
| 4 bash scripts pass syntax check | `bash -n` on bootstrap/update/backup/restore | ALL_BASH_SYNTAX_OK | ✓ PASS |
| Compose syntax valid against example env | `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet` (per all 6 plan SUMMARYs) | exit 0 | ✓ PASS |
| Git index executable bits | `git ls-files --stage` on bin/sms + 4 deploy scripts | All return mode 100755 | ✓ PASS |
| update.sh atomic ordering | awk migrate-line < sed-line | migrate=92 sed=102 (delta 10) | ✓ PASS |
| backup.sh atomic ordering | awk stop-line < pg_dump-line | stop=89 pg_dump=101 (delta 12) | ✓ PASS |
| restore.sh 5-stage ordering | awk verify < confirm < extract < wipe < boot | verify=68 confirm=78 extract=96 wipe=104 boot=111 | ✓ PASS |
| Live VM smoke test | bootstrap.sh on fresh VM | Not run | ? SKIP — Phase 30 DEPLOY-25 |
| Round-trip data parity | backup.sh → restore.sh on populated stack | Not run | ? SKIP — Phase 30 DEPLOY-25 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DEPLOY-17 | 29-01 | `bin/sms create-admin` CLI creates super-admin with system org membership and scrypt password (ROADMAP says "bcrypt" but code-as-truth is scrypt per D-05) | ✓ SATISFIED | apps/api/src/cli/sms.ts implements router + create-admin with `better-auth/crypto.hashPassword`; apps/api/bin/sms wrapper mode 100755; apps/api/Dockerfile patched with single-line bin COPY. SWC-compiled to dist/cli/sms.js. |
| DEPLOY-18 | 29-02 | `bootstrap.sh` validates env, pulls images, runs migrate + seeds, brings up stack, prints URL | ✓ SATISFIED | deploy/scripts/bootstrap.sh implements D-07..D-12 in full; pre-flight + auto-secrets + two-phase compose up + create-admin + HTTPS poll + ELAPSED log + day-2 summary. |
| DEPLOY-19 | 29-03 | `update.sh` pulls new image tag, runs migrate, recycles services in dependency order | ✓ SATISFIED | deploy/scripts/update.sh implements D-13..D-16; semver-validated positional arg, atomic pre-flight migrate, .env backup + sed, bare `compose up -d` recycle, post-recycle health poll. |
| DEPLOY-20 | 29-04 | `backup.sh` produces single timestamped archive containing pg_dump + MinIO mirror + caddy_data tar | ✓ SATISFIED | deploy/scripts/backup.sh implements D-17..D-20 + D-29; offline atomic snapshot, EXIT-trap restart guarantee, pg_dump -Fc + mc mirror loop + alpine caddy_data tar, single tar.gz output, BACKUP_DIR override. |
| DEPLOY-21 | 29-05 | `restore.sh` consumes backup archive and rebuilds all volumes; idempotent overwrite | ✓ SATISFIED | deploy/scripts/restore.sh implements D-21..D-24; verify-before-destroy, --yes bypass, extract-before-wipe, compose down -v + pg_restore + mc mirror reverse + caddy_data extract, schema-version cross-restore safe via prisma migrate deploy idempotency. |
| DEPLOY-23 | 29-06 | `deploy/README.md` documents 5-step quickstart proving <10-min cold deploy | ✓ SATISFIED | deploy/README.md (172 lines, overwrote Phase 24 stub) + deploy/BACKUP-RESTORE.md (151 lines, 9 H2 sections) + deploy/TROUBLESHOOTING.md (64 lines, 6+1 D-28 rows) + deploy/SMOKE-TEST-LOG.md (18 lines, Phase 30 forward-pointer placeholder). |

**No orphaned requirements.** REQUIREMENTS.md maps DEPLOY-17, 18, 19, 20, 21, 23 to Phase 29 — every ID is claimed by exactly one plan in this phase. DEPLOY-22 (env vars + init-secrets.sh) belongs to Phase 26 (already complete). DEPLOY-24 (DOMAIN-SETUP.md) belongs to Phase 27 (already complete). DEPLOY-25 (clean-VM smoke) and DEPLOY-26 (port lockdown) belong to Phase 30 (not started). DEPLOY-27/28/29 are deferred to v1.4.

### Anti-Patterns Found

No blocker or warning anti-patterns. Files reviewed:

- `apps/api/src/cli/sms.ts` — 211 LOC, no TODO/FIXME/PLACEHOLDER, no `return null` empty handlers, no `console.log` only paths. The `console.log` calls at lines 116, 134, 154, 168, 171, 173 are operator-facing progress reports, not stub markers. The `process.exit(2)` on bad args is intentional (exit-code spec per D-29).
- `apps/api/bin/sms` — 3 lines, exec-only.
- `apps/api/Dockerfile` — single-line patch, no anti-patterns introduced.
- `deploy/scripts/bootstrap.sh` / `update.sh` / `backup.sh` / `restore.sh` — all have `set -euo pipefail`, no swallowed `|| true` except 1 intentional case in bootstrap.sh line 121 (`STATE=$(...|| true)` for retry-loop semantics, documented in plan).
- `deploy/README.md` / `BACKUP-RESTORE.md` / `TROUBLESHOOTING.md` — placeholder values are clearly marked operator-supplied (`<placeholder>`, `$DOMAIN`, `$ADMIN_EMAIL`, `<UTC-ts>`); no real secret material; `deploy/SMOKE-TEST-LOG.md` is intentional Phase-30 forward-pointer placeholder (not a stub blocking the phase goal).

### Human Verification Required

5 items deferred to Phase 30 (DEPLOY-25) per the explicit Phase 29 plan-level `<verification>` blocks:

1. **SC #2 cold-deploy <10-minute wall-clock** — Bootstrap.sh's D-12 ELAPSED log captures actual seconds; Phase 30 redirects bootstrap.sh stdout to deploy/SMOKE-TEST-LOG.md to satisfy ROADMAP SC #5.
2. **SC #1 bin/sms create-admin runtime correctness** — Live login + password rotation byte-equivalence requires running api container with live Postgres + Better Auth.
3. **SC #3 graceful update.sh recycle** — Requires two image tags + GHCR push + running stack; static greps confirm pre-flight migrate atomic guard.
4. **SC #4 byte-equivalent backup/restore round-trip** — Requires populated source DB + MinIO + active TLS; static greps confirm 3-entry archive symmetry.
5. **SC #5 README quickstart end-to-end** — Phase 30 follows README step-by-step on fresh VM; the docs ARE the test plan.

### Gaps Summary

None blocking. Phase 29 ships all 5 ROADMAP success criteria mechanisms and the 6 requirements (DEPLOY-17, 18, 19, 20, 21, 23) are complete. Live runtime evidence is the explicit Phase 30 (DEPLOY-25) acceptance gate per ROADMAP §Phase 30 — Phase 29 ships the mechanism; Phase 30 ships the proof. The deploy/SMOKE-TEST-LOG.md placeholder gives Phase 30 a clear target file.

The 29 CONTEXT decisions D-01..D-29 are all honored:

- **D-02:** Dockerfile destination is `./apps/api/bin` (NOT `./bin`) — verified.
- **D-04:** `--force` flag implemented for idempotency — verified.
- **D-05:** scrypt via `better-auth/crypto` (NOT bcrypt despite ROADMAP wording) — verified.
- **D-15:** update.sh atomic pre-flight migrate guard — awk-verified (line 92 < line 102).
- **D-19:** backup excludes .env + redis_data + hls_data — verified (no code-path references).
- **D-21:** restore integrity verify before destroy — awk-verified (line 68 < line 104).
- **D-29:** bash convention `set -euo pipefail` + `IFS=$'\n\t'` across all 4 scripts — verified.

**Tooling note:** `gsd-tools verify key-links` produced 9 false-positive "not found" results due to over-escaped YAML regex patterns (e.g. `\\\\.` instead of `\\.`); manual grep confirmed every link is wired correctly. The `verify artifacts` tool also flagged update.sh as failing on `contains: "compose run --rm sms-migrate"` — this is a literal-substring check, but the script uses `${DC} run --rm sms-migrate` where `DC="docker compose -f ... --env-file ..."` so the resolved invocation is `docker compose -f ... run --rm sms-migrate`. The semantic contract is satisfied; the tool's literal-substring check cannot see through variable expansion.

---

_Verified: 2026-04-28T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
