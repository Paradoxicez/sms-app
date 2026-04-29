---
phase: 30
plan: 05
subsystem: deploy
tags: [deploy, smoke-test, backup, restore, verifier, ga-gate]
requires:
  - 30-01 (deploy/SMOKE-TEST-LOG.md template — best-effort tee target)
  - Phase 29 (deploy/scripts/backup.sh + restore.sh — invoked via bash subprocesses)
  - Phase 27 (deploy/Caddyfile + caddy service — cert preservation assertion target)
  - Phase 26 (deploy/docker-compose.yml + .env — DC compose handle + env load)
provides:
  - Phase 30 SC#4 backup-component verifier (covers Phase 29 SC#4 byte-equivalent round-trip)
  - Reusable mc_digest helper pattern for bucket file-key set comparison
affects:
  - SMOKE-TEST-LOG.md "Phase 29 SC#4" row gets PASS/FAIL evidence on smoke run
  - v1.3 GA gate (D-12 hard fail on any byte-equivalence violation)
tech_stack:
  added:
    - "(no new deps — uses docker compose, psql, mc, sha256sum, tar, curl already in stack)"
  patterns:
    - "sha256(sorted file-key listing) for stable bucket-snapshot digest comparison"
    - "Indirect ${!varname} expansion for loop-driven pre/post variable pairs"
    - "Best-effort SMOKE-TEST-LOG.md append guarded by [[ -f ]]"
key_files:
  created:
    - deploy/scripts/verify-backup.sh (344 LOC, mode 0755)
  modified: []
decisions:
  - "Use sha256-of-sorted-listing instead of `mc diff` for bucket comparison: mc diff is built for cross-alias compares not point-in-time snapshots within the same instance, and mc ls metadata (timestamps, sizes) drifts non-deterministically — only the file-key set is contractually preserved by mirror round-trips."
  - "Recording table count = 0 warns but does NOT fail: verify-playback's 60s record step might genuinely have failed during the smoke run, and we still want backup.sh to be exercised against User/Org/Member/Camera. Fail-fast only on User/Org/Member/Camera < 1."
  - "Cert preservation scope = `--since=2m` on caddy logs: covers full restore.sh runtime (60-120s) without picking up unrelated ACME activity from the broader smoke run."
  - "Archive path captured from backup.sh stdout via grep + awk + tail -1: backup.sh writes the canonical path in its summary block (`Archive: /path/to/sms-backup-<UTC>.tar.gz`); we tee stdout to a tmp log and extract from there rather than introducing a new contract on backup.sh."
metrics:
  duration: ~25min (single-task plan, executor agent)
  completed: 2026-04-29
  loc: 344
  tasks: 1
---

# Phase 30 Plan 05: verify-backup.sh — Backup/Restore Round-Trip Verifier

**One-liner:** Script that runs ON the smoke VM, captures pre-backup row counts + bucket file-key digests, invokes backup.sh + restore.sh --yes end-to-end, then asserts byte-equivalent recovery (5 Postgres tables + 3 MinIO buckets + TLS cert preserved) — closes Phase 29 SC#4 backup component for v1.3 GA gate.

## What Shipped

`deploy/scripts/verify-backup.sh` (344 LOC, mode 0755, executable bit set in git index per D-20). Six numbered steps, each with PASS/FAIL counter contributions:

| Step | Action | Assertions |
|------|--------|-----------|
| [1/6] | Pre-backup snapshot — `pg_count` for 5 tables + `mc_digest` for 3 buckets | None (snapshot only); fail-fast if User/Org/Member/Camera < 1 (exit 2) |
| [2/6] | `bash deploy/scripts/backup.sh` → tee output → grep ARCHIVE_PATH | 3 PASS: backup.sh exit 0, archive path captured, archive shape (postgres.dump + minio/ + caddy_data.tar.gz) |
| [3/6] | `bash deploy/scripts/restore.sh ${ARCHIVE_PATH} --yes` (DESTRUCTIVE: drops volumes via `compose down -v`, replays archive) + 120s health-recovery wait | 1 PASS: restore.sh --yes exit 0 |
| [4/6] | Post-restore snapshot + pairwise pre==post equality | 8 PASS: 5 table-count assertions + 3 bucket-digest assertions |
| [5/6] | TLS cert preservation: HTTPS reachable + 0 `certificate obtained` log lines since restore | 2 PASS: HTTPS 200, ACME no-op |
| [6/6] | Summary + best-effort tee `<!-- ... -->` HTML comment to SMOKE-TEST-LOG.md | None (output only) |

**Total: 14 PASS counter slots, exit 0 only when FAIL == 0.**

## SHA256-of-Sorted-Listing Pattern (Bucket Diff)

Rationale recorded in the script comment block at `mc_digest()`:

```bash
mc_digest() {
  local bucket="$1"
  ${DC} exec -T minio mc ls --recursive "local/${bucket}/" 2>/dev/null \
    | awk '{print $NF}' \
    | sort \
    | sha256sum \
    | awk '{print $1}'
}
```

Why not `mc diff`?
- `mc diff` requires a remote-source argument and is built for cross-alias compares (e.g. `local/avatars` vs `s3/avatars`), not point-in-time snapshots within the same MinIO instance.
- Plain `mc ls` output includes timestamps + sizes that drift non-deterministically across the round-trip even when file content is identical.
- Only the **file-key set** is contractually preserved by `mc mirror` (the underlying primitive backup.sh + restore.sh use), so the file-name listing is the correct invariant to assert on.
- Empty bucket → both pre and post hash the same empty input → no false-fail (T-30-12 mitigation in plan threat model).

## Destructive-Operation Warning

Documented loudly in three locations:

1. **Preamble comment block** (`# DESTRUCTIVE WARNING:`) explains that `restore.sh --yes` drops postgres + minio + caddy_data named volumes via `compose down -v` and rebuilds them from the just-captured archive. Operator MUST NOT run this on a stack carrying real production data without an offsite backup first. Intended scope: clean smoke VM only.
2. **Step [3/6] log line:** `[verify-backup] [3/6] Running restore.sh --yes (DESTRUCTIVE — wipes + restores volumes)` so the operator sees the destructive boundary in the live terminal output.
3. **Threat model T-30-13** (in plan): wrong invocation context. Mitigation: explicit warning + Plan 06 wrapper will prompt operator before invoking this verifier.

## Plan Verification Results

All plan `<verify><automated>` greps + `<acceptance_criteria>` checks:

| Check | Result |
|-------|--------|
| `test -x deploy/scripts/verify-backup.sh` | PASS |
| `bash -n deploy/scripts/verify-backup.sh` | PASS |
| `grep -qE '^set -euo pipefail$'` | PASS |
| `grep -qE '\[1/6\]'` ... `\[6/6\]` (all 6) | PASS (6/6) |
| `grep -qE 'pg_count'` | PASS |
| `grep -qE 'backup\.sh'` | PASS |
| `grep -qE 'restore\.sh.*--yes'` | PASS |
| `grep -qE 'PRE_COUNTS'` + `POST_COUNTS` | PASS |
| `grep -qE 'sha256sum'` | PASS |
| `grep -qE 'certificate obtained'` | PASS |
| `git ls-files --stage` mode = `100755` | PASS |
| `[verify-backup]` log prefix present | PASS |
| MinIO bucket pre/post refs >= 6 | PASS (10 refs) |
| Exit codes 0/1/2 reachable | PASS |
| `declare -A PRE_COUNTS` + `POST_COUNTS` | PASS |
| SMOKE-TEST-LOG.md append guarded by `[[ -f ${LOG_FILE} ]]` | PASS |

**Net: 0 plan checks failing.**

## Integration Points

- **Inputs (read at runtime):**
  - `deploy/.env` (DOMAIN, POSTGRES_USER/DB, MINIO_ROOT_USER/PASSWORD)
  - `deploy/docker-compose.yml` (DC handle for compose exec)
  - Live stack: postgres, minio, caddy services running

- **Subprocesses invoked:**
  - `bash ${SCRIPT_DIR}/backup.sh` (Phase 29 DEPLOY-20)
  - `bash ${SCRIPT_DIR}/restore.sh ${ARCHIVE} --yes` (Phase 29 DEPLOY-21, --yes flag = D-22)

- **Outputs (best-effort):**
  - Appends `<!-- verify-backup.sh run <UTC> — N PASS, M FAIL  duration=Ns  archive=/path -->` HTML comment to `deploy/SMOKE-TEST-LOG.md` (Wave 1 sink) — guarded by `[[ -f ]]`, never errors if log absent.

## Deviations from Plan

None — plan executed exactly as written, including the 9-section `<action>` template structure and all helper-function shapes. Two minor adaptations for shellcheck cleanliness, kept faithful to plan intent:

1. **`local` keyword stripped from top-level scope.** The plan's `<action>` template shows `local pre_avatars pre_recordings pre_snapshots` etc. inside numbered steps, but `local` is only valid inside function bodies in bash. Lifted these into uppercase top-level vars (`PRE_AVATARS`, `POST_AVATARS`, ...) which is also what enables the `${!varname}` indirect-expansion loop in step [4/6]. Pure naming/scoping fix; no logic change.
2. **Bucket variable naming uppercased to enable indirect expansion.** Plan template named them `pre_avatars` (lowercase); switched to `PRE_AVATARS` so the loop `for bucket in avatars recordings snapshots` can build `pre_var="PRE_${bucket_upper}"` cleanly via `tr '[:lower:]' '[:upper:]'`. Same indirect-expansion pattern, more idiomatic shell convention.

Both adaptations preserve the plan's exact assertion semantics, counter increments, and exit-code paths.

## Threat Surface Scan

No new external attack surface — script is operator-invoked locally on the smoke VM, reads/writes only local files (`SMOKE-TEST-LOG.md`, tmp logs) and invokes already-existing `backup.sh`/`restore.sh` whose threat models are covered in Phase 29. Plan threat register T-30-07 / T-30-12 / T-30-13 all addressed in script as documented above.

## Self-Check: PASSED

- Created file exists: `/Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app/.claude/worktrees/agent-abd576f3c6f02ebdb/deploy/scripts/verify-backup.sh` — FOUND
- Commit `d043461` exists in git log — FOUND
- File mode in git index: `100755` — VERIFIED
- All 16 plan acceptance grep guards PASS — VERIFIED
