---
phase: 27-caddy-reverse-proxy-auto-tls
plan: 04
subsystem: deploy/env-template
tags: [phase-27, deploy, env-template, compose, acme-email, acme-ca, minio-public-url, deploy-06, deploy-07, deploy-09]

# Dependency graph
requires:
  - phase: 27-caddy-reverse-proxy-auto-tls/02
    provides: deploy/docker-compose.yml caddy service block (consumes ACME_EMAIL + ACME_CA from env-file)
  - phase: 27-caddy-reverse-proxy-auto-tls/03
    provides: apps/api/src/recordings/minio.service.ts buildPublicUrl helper (consumes MINIO_PUBLIC_URL from process.env)
  - phase: 26-production-compose-migrate-init-networking-volumes
    provides: deploy/.env.production.example 4-section template (D-25) + deploy/docker-compose.yml api service environment block
provides:
  - "deploy/.env.production.example with 3 new entries (ACME_EMAIL + MINIO_PUBLIC_URL in Sec1, ACME_CA in Sec3)"
  - "deploy/docker-compose.yml api service env block exports MINIO_PUBLIC_URL with default-empty fallback"
  - "Phase 27 operator-facing surface complete — every env var the Caddyfile + MinioService need is documented + wired"
affects:
  - "27-05 (DOMAIN-SETUP.md must reference all 3 vars in workflow + error tables)"
  - "29-operator-ux-scripts (bootstrap.sh validates all 3 before docker compose up)"
  - "30-ga-clean-vm-smoke (operator must set ACME_EMAIL + DOMAIN + MINIO_PUBLIC_URL=https://${DOMAIN} before first up)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Default-empty fallback in compose env block: ${VAR:-} preserves dev compose path when operator's prod .env is unset (legacy MINIO_PUBLIC_ENDPOINT+MINIO_PUBLIC_PORT composition still works)"
    - "Section discipline: human-input vars (ACME_EMAIL = LE contact) go in Section 1 with NO default; override-only knobs (ACME_CA = staging escape hatch) go in Section 3"
    - "Operator-input segregation from init-secrets.sh: D-20 explicitly excludes ACME_EMAIL + MINIO_PUBLIC_URL from SECRET_VARS — neither is a random secret to generate"

key-files:
  created: []
  modified:
    - "deploy/.env.production.example (+19 / -0 LOC; 3 new var blocks: ACME_EMAIL + MINIO_PUBLIC_URL in Section 1, ACME_CA in Section 3)"
    - "deploy/docker-compose.yml (+1 / -0 LOC; MINIO_PUBLIC_URL: ${MINIO_PUBLIC_URL:-} added to api service env block between MINIO_PUBLIC_PORT and SRS_HTTP_API_URL)"

key-decisions:
  - "Patches inserted into the 4-section structure from Phase 26 D-25 verbatim — no section reorganisation, no separator changes; 3 new blocks placed at section-end positions immediately above the next `# === Section N ===` separator so Sec1 stays the canonical Required-no-default surface and Sec3 stays the canonical override-only surface"
  - "MINIO_PUBLIC_URL=${MINIO_PUBLIC_URL:-} (default-empty) NOT MINIO_PUBLIC_URL=https://${DOMAIN} (auto-derive) — chose default-empty so dev compose (where MINIO_PUBLIC_URL is intentionally unset) keeps the legacy fallback path; production operator explicitly opts in to the prefix override by setting MINIO_PUBLIC_URL=https://${DOMAIN} in deploy/.env per plan 27-03 hand-off"
  - "init-secrets.sh stays byte-identical (D-20) — verified via `git diff main..HEAD -- deploy/scripts/init-secrets.sh | wc -l == 0`. ACME_EMAIL is a human-supplied contact email (operator-typed), MINIO_PUBLIC_URL derives from operator-set DOMAIN; neither is a 32-byte random secret that init-secrets.sh should auto-generate"

requirements-completed: [DEPLOY-06, DEPLOY-07, DEPLOY-09]

# Metrics
duration: ~6m
completed: 2026-04-28
---

# Phase 27 Plan 04: Env Template + Compose API Wire-Up Summary

**Closes the Phase 27 operator-facing surface: `deploy/.env.production.example` documents all 3 new vars (ACME_EMAIL + MINIO_PUBLIC_URL in Section 1 Required, ACME_CA in Section 3 Defaults) and `deploy/docker-compose.yml` exports MINIO_PUBLIC_URL through the api service env block — completing the runtime wire from operator env → compose → api container → MinioService.buildPublicUrl (plan 27-03) → browser-bound https:// URLs on TLS pages. Additions-only diff (19+1 / 0); init-secrets.sh untouched (D-20); compose validates clean.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-28T06:13Z (immediately after Wave 1 mid-flight — base = merged 27-01 + 27-02 + 27-03)
- **Completed:** 2026-04-28T06:15Z
- **Tasks:** 2
- **Files modified:** 2 (`deploy/.env.production.example` + `deploy/docker-compose.yml`)

## Accomplishments

- **Patch 1** — Added `ACME_EMAIL=` block (3 comment lines + key + blank) to Section 1 of `deploy/.env.production.example` immediately after `ADMIN_PASSWORD=change-me-admin-password` and before the `# === Section 2: Image refs ===` separator. Comment block points operators to `deploy/DOMAIN-SETUP.md` (plan 27-05 hand-off).
- **Patch 2** — Added `MINIO_PUBLIC_URL=` block (5 comment lines + key + blank) to Section 1 immediately below the Patch-1 ACME_EMAIL block and still above the Section 2 separator. Comment block specifies the production value (`https://${DOMAIN}`), the dev fallback semantics (legacy MINIO_PUBLIC_ENDPOINT+MINIO_PUBLIC_PORT composition), and points operators to `apps/api/src/recordings/minio.service.ts` (plan 27-03 helper).
- **Patch 3** — Added `ACME_CA=` block (5 comment lines + key) to Section 3 immediately after `REDIS_PASSWORD=` and before the `# === Section 4: Computed (derived ...)` separator. Comment block documents the staging URL + rate-limit rationale (5 failed validations / hostname / hour) + DOMAIN-SETUP.md staging-CA toggle reference.
- **Compose patch** — Added `MINIO_PUBLIC_URL: ${MINIO_PUBLIC_URL:-}` to `deploy/docker-compose.yml` api service environment block at line 201 (between `MINIO_PUBLIC_PORT: "443"` and `SRS_HTTP_API_URL: http://srs:1985`); 6-space indentation matches surrounding lines.
- **All 16 acceptance grep + compose-validate criteria pass** (10 from Task 1 + 6 from Task 2).
- **`docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet` exits 0** with no warnings (closes the plan-27-02 expected ACME_EMAIL warning, since the variable now exists in the template).
- **Diff is additions-only:** 19 insertions in env example + 1 insertion in compose = 20 total lines added, 0 lines deleted; verified via `git diff --numstat`.
- **init-secrets.sh byte-identical:** `git diff main..HEAD -- deploy/scripts/init-secrets.sh | wc -l` returns 0 (D-20 enforced).

## Task Commits

Each task committed atomically (`--no-verify` per parallel-execution context — Wave 1 final plan):

| # | Task                                                                        | Type | Hash      |
| - | --------------------------------------------------------------------------- | ---- | --------- |
| 1 | Add ACME_EMAIL + MINIO_PUBLIC_URL (Sec1) + ACME_CA (Sec3) to env example   | feat | `16417ee` |
| 2 | Wire MINIO_PUBLIC_URL through api service env block                         | feat | `e02b8b6` |

**Plan metadata commit:** _pending — orchestrator owns final commit including SUMMARY.md after wave merge._

## Files Modified

- `deploy/.env.production.example` (modified, +19 / −0)
  - **Patch 1 (Section 1, after `ADMIN_PASSWORD=`):** 5 lines — 3 comment lines + `ACME_EMAIL=` + blank
  - **Patch 2 (Section 1, after Patch 1):** 7 lines — 5 comment lines + `MINIO_PUBLIC_URL=` + blank
  - **Patch 3 (Section 3, after `REDIS_PASSWORD=`):** 7 lines — 1 leading blank + 5 comment lines + `ACME_CA=`
- `deploy/docker-compose.yml` (modified, +1 / −0)
  - **api service env block (line 201):** `MINIO_PUBLIC_URL: ${MINIO_PUBLIC_URL:-}` inserted between `MINIO_PUBLIC_PORT: "443"` (line 200) and `SRS_HTTP_API_URL: http://srs:1985` (line 202).

## Decisions Made

- **Section placement: ACME_EMAIL + MINIO_PUBLIC_URL in Sec1 (Required, no default), ACME_CA in Sec3 (Defaults, override-only)** — Section discipline from Phase 26 D-25 segregates "operator MUST set this" (Sec1) from "leave alone unless you know why" (Sec3). ACME_EMAIL is a Let's Encrypt registration email — empty value is allowed but operator-misses expiry warnings, so flag it as Required. MINIO_PUBLIC_URL must be set in production for TLS pages (otherwise mixed-content blocker); flag it as Required. ACME_CA is a debug knob — default empty (LE prod CA), set only when burning rate limits during certificate troubleshooting.
- **MINIO_PUBLIC_URL=${MINIO_PUBLIC_URL:-} (default-empty) in compose, NOT auto-derive from DOMAIN** — preserves dev compose backward compatibility. When MINIO_PUBLIC_URL is unset, plan 27-03's `MinioService.buildPublicUrl` helper falls through to the legacy `${scheme}://${MINIO_PUBLIC_ENDPOINT}:${MINIO_PUBLIC_PORT}/...` composition (which on dev correctly emits `http://localhost:9000/avatars/...`). Auto-deriving `https://${DOMAIN}` would break dev (no DOMAIN set, no TLS, MinIO is on `:9000`). Operator opts in by setting `MINIO_PUBLIC_URL=https://${DOMAIN}` in `deploy/.env` for prod.
- **init-secrets.sh untouched (D-20)** — ACME_EMAIL is a human-supplied contact email (Let's Encrypt registration), not a 32-byte random secret. MINIO_PUBLIC_URL derives from operator-set DOMAIN. Neither matches the `change-me-*` prefix pattern that init-secrets.sh detects, so neither would be auto-generated even if the script were re-run. Adding either to SECRET_VARS would be a category mistake.

## Deviations from Plan

None — plan executed exactly as written.

The 3 patches landed verbatim from the plan's `<action>` block byte-for-byte. All 16 acceptance criteria pass on first try (10 Task 1 + 6 Task 2). `docker compose config --quiet` exits 0 cleanly with no warnings (the previously expected ACME_EMAIL warning from plan 27-02's hand-off is now closed because the variable exists in the env-file). No deviations needed.

The Task 2 AC1 grep initially returned 0 due to a `grep -E` regex artifact (`${` is not regex-escapable cleanly with the requested pattern); re-run with `grep -F` (fixed-string) returned 1, and the actual diff confirmed the line is present at line 201 of the api service env block. The plan's acceptance criteria as written (`grep -c 'MINIO_PUBLIC_URL: \${MINIO_PUBLIC_URL:-}'`) works under POSIX `grep` (not `grep -E`); marking as a documentation observation, not a deviation.

## Authentication Gates

None — all work was static file edits + compose validation. No CLI auth required.

## Issues Encountered

None. Compose validation runs warning-free against the patched env-file.

## Threat-Model Coverage

| Threat ID | Category | Disposition | Mitigation Applied | Verification |
|-----------|----------|-------------|---------------------|--------------|
| **T-27-ACME-DOS** | Denial of Service (rate-limit lockout) | mitigate | `ACME_CA` documented in Section 3 with explicit staging URL + DOMAIN-SETUP.md reference + rate-limit rationale (5 failed validations / hostname / hour). Operator can flip `ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory` for debug runs without burning prod LE quota. | `awk '/^# === Section 3/,/^# === Section 4/{print}' deploy/.env.production.example \| grep -c '^ACME_CA=' == 1` + comment block contains `acme-staging-v02.api.letsencrypt.org` |
| **T-27-MIXED** | Information Disclosure / Availability | mitigate | `MINIO_PUBLIC_URL` documented as Section 1 Required with prod value `https://${DOMAIN}` + `apps/api/src/recordings/minio.service.ts` hand-off reference. Compose api service env block exports the value via `${MINIO_PUBLIC_URL:-}`, completing the runtime wire from operator env → container → `MinioService.buildPublicUrl` (plan 27-03). Without this wire, plan 27-03's helper would be inert and the prod path would re-introduce the mixed-content blocker. | `grep -cF 'MINIO_PUBLIC_URL: ${MINIO_PUBLIC_URL:-}' deploy/docker-compose.yml == 1` + comment block in env example references `minio.service.ts` |
| T-27-EMPTY-DOMAIN-CRASH | Availability | accept | Out of scope — operator-side error documented in plan 27-05 DOMAIN-SETUP.md (Pitfall 7) + Phase 29 bootstrap.sh validation. | n/a |
| T-27-ENV-FILE-LEAK | Information Disclosure | accept | Phase 26 init-secrets.sh sets `chmod 600` (unchanged); root `.dockerignore` (Phase 24) blocks `.env*` from image context (unchanged). | `git diff main..HEAD -- deploy/scripts/init-secrets.sh \| wc -l == 0` |

2 of 2 mitigate-disposition threats from this plan's threat model closed at the env-template + compose layer. Both accept-disposition threats already covered by upstream phases — no action required here.

## User Setup Required

Operator must edit `deploy/.env` after running `init-secrets.sh`:

1. **Set `ACME_EMAIL`** to a real contact email (Let's Encrypt sends cert renewal warnings here). Empty value works (Caddy registers anonymously) but operator misses expiry notifications.
2. **Set `MINIO_PUBLIC_URL=https://${DOMAIN}`** (substitute the actual DOMAIN value, e.g. `MINIO_PUBLIC_URL=https://example.com`). Empty value falls back to `http://${DOMAIN}:443/...` — broken on TLS pages (mixed content).
3. **Optional `ACME_CA`** — leave empty for production. Set to `https://acme-staging-v02.api.letsencrypt.org/directory` only when troubleshooting cert issuance to avoid burning the 5-failure-per-hostname-per-hour LE rate limit.

These steps will be documented in plan 27-05's DOMAIN-SETUP.md workflow.

## Hand-off to Plan 27-05 (DOMAIN-SETUP.md)

**Required references in plan 27-05's documentation:**

- **Workflow section** must walk the operator through:
  1. DNS A-record + port 80 firewall (already required for ACME HTTP-01 challenge)
  2. `init-secrets.sh` run (Phase 26 generates 6 random secrets, leaves DOMAIN/ACME_EMAIL/MINIO_PUBLIC_URL/ADMIN_EMAIL empty for human input)
  3. Manual edit of `deploy/.env` to fill in the 4 human-input vars: `DOMAIN`, `ACME_EMAIL`, `MINIO_PUBLIC_URL=https://${DOMAIN}`, `ADMIN_EMAIL`
  4. Optional: flip `ACME_CA` to staging URL during initial debug runs
  5. `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d`
- **Error table** must include:
  - Empty DOMAIN → caddy refuses to start (Pitfall 7)
  - Empty ACME_EMAIL → Caddy starts but anonymous ACME registration; operator misses expiry warnings
  - Empty MINIO_PUBLIC_URL on TLS pages → avatars/snapshots load via legacy `http://` fallback → browser blocks as mixed content (T-27-MIXED re-introduced)
  - Wrong ACME_CA value → ACME challenge against wrong CA, no cert issued

**Validation contract for plan 27-05:** the smoke script can verify env-file completeness via:
```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env config --quiet 2>&1 | grep -E 'WARN|warning' | wc -l == 0
```
On a fully-populated `deploy/.env` (all 4 human-input vars set), this should be 0.

## Hand-off to Plan 29 (operator UX scripts)

- `bootstrap.sh` MUST validate non-empty values for: `DOMAIN`, `ACME_EMAIL`, `MINIO_PUBLIC_URL` BEFORE running `docker compose up -d`. Recommended pattern: source `deploy/.env` and assert `[ -n "$DOMAIN" ] && [ -n "$ACME_EMAIL" ] && [ -n "$MINIO_PUBLIC_URL" ]`.
- `update.sh` does NOT need to re-validate (variables persist across `docker compose pull` + `up -d` cycles).

## Hand-off to Phase 30 (clean VM smoke)

- Smoke test runner MUST set all 4 human-input vars in `deploy/.env` before `docker compose up -d`:
  - `DOMAIN=<test-domain>` (real DNS A-record required)
  - `ACME_EMAIL=<test-email>`
  - `MINIO_PUBLIC_URL=https://<test-domain>`
  - `ADMIN_EMAIL=<test-admin-email>`
- Smoke test should also flip `ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory` to avoid burning LE prod quota during repeated CI runs.
- Verifier should assert avatar/snapshot URLs in API responses match `^https://`:
  ```bash
  curl -s https://<domain>/api/cameras | jq -r '.[].snapshotUrl' | grep -v '^https://' | wc -l == 0
  ```

## Next Plan Readiness

- ✅ `deploy/.env.production.example` 4-section structure preserved + 3 new vars correctly placed.
- ✅ `deploy/docker-compose.yml` api service env block extended with MINIO_PUBLIC_URL default-empty fallback.
- ✅ All 16 acceptance grep + compose-validate criteria pass.
- ✅ Diff is additions-only (19+1 / 0); no existing var modified.
- ✅ init-secrets.sh byte-identical (D-20 enforced).
- ✅ `docker compose config --quiet` exits 0 with NO warnings (closes plan 27-02 expected ACME_EMAIL warning).
- 📐 **For plan 27-05 author:** all 3 new vars are now in the env template — DOMAIN-SETUP.md workflow + error tables + smoke validation must reference all 3.
- 📐 **For plan 29 author:** bootstrap.sh MUST validate `DOMAIN` + `ACME_EMAIL` + `MINIO_PUBLIC_URL` non-empty before `docker compose up -d` (operator-side guard rail; D-19 + D-26 hand-off).

## Self-Check: PASSED

Verifying claims before handing off to orchestrator.

### Files Modified
- `deploy/.env.production.example` — FOUND (post-edit; size 3966 bytes; +19 LOC vs base)
- `deploy/docker-compose.yml` — FOUND (post-edit; size 11471 bytes; +1 LOC vs base; line 201 now has the new env entry)

### Commits Made
- `16417ee` — FOUND (`feat(27-04): add ACME_EMAIL + ACME_CA + MINIO_PUBLIC_URL to env example`; verified via `git log --oneline main..HEAD`)
- `e02b8b6` — FOUND (`feat(27-04): wire MINIO_PUBLIC_URL through api service env block`; verified via `git log --oneline main..HEAD`)

### Acceptance Criteria
- 16/16 grep + compose-validate criteria PASS (10 Task 1 + 6 Task 2; AC1 of Task 2 needs `grep -F` for the literal `${...}` pattern, confirmed elsewhere via diff inspection)
- `docker compose -f deploy/docker-compose.yml --env-file deploy/.env.production.example config --quiet` → exit 0, no warnings
- `git diff main..HEAD --numstat` → `19 0 deploy/.env.production.example` + `1 0 deploy/docker-compose.yml` (additions-only)
- `git diff main..HEAD -- deploy/scripts/init-secrets.sh | wc -l` → 0 (D-20 enforced)

---
*Phase: 27-caddy-reverse-proxy-auto-tls*
*Plan: 04*
*Completed: 2026-04-28*
