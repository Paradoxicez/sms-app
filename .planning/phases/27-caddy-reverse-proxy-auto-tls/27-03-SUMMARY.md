---
phase: 27-caddy-reverse-proxy-auto-tls
plan: 03
subsystem: api/recordings
tags: [phase-27, mixed-content-fix, minio, public-url, tls, deploy-07, t-27-mixed]
requirements: [DEPLOY-07]
dependency-graph:
  requires:
    - "Phase 26 deploy compose (api service env block — plan 27-04 will wire MINIO_PUBLIC_URL)"
    - "CONTEXT.md D-26 (locked decision: emit https://${DOMAIN}/<bucket>/<object> on browser-bound URLs)"
  provides:
    - "MINIO_PUBLIC_URL env var contract — when set, exact prefix for getAvatarUrl + getSnapshotUrl"
    - "buildPublicUrl(bucket, objectName, version) private helper — single source of truth for public URL composition"
    - "Mixed-content regression guard test — expect(url).toMatch(/^https:\\/\\//) blocks future regressions"
  affects:
    - "apps/api/src/recordings/minio.service.ts (helper + 2 call-site swaps; SDK init untouched)"
    - "apps/api/tests/account/minio-avatars.test.ts (5 URL-composition tests, +3 new + 2 reshaped)"
tech-stack:
  added: []
  patterns:
    - "Env-var prefix override (MINIO_PUBLIC_URL) wins over derived endpoint+port composition"
    - "Trailing-slash strip via .replace(/\\/+$/, '') for safe prefix concatenation"
    - "Regex regression guard in test asserting scheme prefix (/^https:\\/\\//)"
key-files:
  created: []
  modified:
    - "apps/api/src/recordings/minio.service.ts (+23 / -11 LOC)"
    - "apps/api/tests/account/minio-avatars.test.ts (+35 / -2 LOC)"
decisions:
  - "Chose Option A from CONTEXT D-26: introduce MINIO_PUBLIC_URL env var as exact public prefix (not Option B's MINIO_PUBLIC_PROTOCOL split). Minimal blast radius — only the public-URL emitter changes; the api↔minio SDK init keeps MINIO_USE_SSL semantics for the internal HTTP path."
  - "Helper extraction: both getAvatarUrl and getSnapshotUrl now share a single buildPublicUrl(bucket, objectName, version) helper. Eliminates the 8-line duplication that originally housed the bug."
  - "Trailing-slash strip lives in the helper, not the env-var consumer. Operators may set MINIO_PUBLIC_URL=https://example.com/ (with trailing slash) and the helper normalises — no double-slash composition surprises."
metrics:
  duration: "~6m"
  completed-date: "2026-04-28T06:11Z"
---

# Phase 27 Plan 03: Mixed-Content Fix via MINIO_PUBLIC_URL Summary

`MinioService.getAvatarUrl()` + `getSnapshotUrl()` now emit `https://${DOMAIN}/<bucket>/<object>?v=<ts>` URLs on production via the new `MINIO_PUBLIC_URL` env-var override (Option A from CONTEXT D-26), with the legacy `${scheme}://${endpoint}:${port}/...` path preserved for dev compatibility.

## Files Modified

| File | LOC delta | Notes |
|------|-----------|-------|
| `apps/api/src/recordings/minio.service.ts` | +23 / −11 | Added `buildPublicUrl` private helper + swapped both `getAvatarUrl` and `getSnapshotUrl` bodies to delegate. SDK init at lines 13-21 byte-identical. |
| `apps/api/tests/account/minio-avatars.test.ts` | +35 / −2 | Replaced 2 existing URL-composition tests + added 3 new (10 tests total in file). Includes `expect(url).toMatch(/^https:\/\//)` regression guard for T-27-MIXED. |

## Commits

| Step | Commit | Type | Message |
|------|--------|------|---------|
| RED | `4b2429c` | test | add failing tests for MINIO_PUBLIC_URL public URL builder |
| GREEN | `7b66927` | feat | emit https public URLs via MINIO_PUBLIC_URL (D-26 mixed-content fix) |

## Decision Recorded

**Chose Option A** from CONTEXT D-26 (over Option B's `MINIO_PUBLIC_PROTOCOL`-split):

- **Rationale:** Single env var = single source of truth for the public host. The browser-facing URL prefix is one operator-supplied string (`https://${DOMAIN}` in prod, unset in dev), not a derived recombination of three vars (`MINIO_USE_SSL` × `MINIO_PUBLIC_ENDPOINT` × `MINIO_PUBLIC_PORT`). Operators stop reasoning about whether `MINIO_USE_SSL` describes the SDK leg or the browser leg — it now describes only the SDK leg, unambiguously.
- **Blast radius:** ~20 LOC in 1 file + 5 test cases. No changes to controllers, services that call `getAvatarUrl`/`getSnapshotUrl`, or the api↔minio SDK init.
- **Backward compatibility:** Legacy `MINIO_PUBLIC_ENDPOINT` + `MINIO_PUBLIC_PORT` + `MINIO_USE_SSL` fallback path preserved verbatim — when `MINIO_PUBLIC_URL` is unset (dev compose), behaviour is identical to before this plan.

## Test Additions (5 cases — 10 total in file)

| Test | Asserts |
|------|---------|
| `getAvatarUrl uses MINIO_PUBLIC_URL exactly when set (Phase 27 D-26 — fixes mixed content)` | URL == `https://example.com/avatars/user-1.webp?v=1234567890` AND `expect(url).toMatch(/^https:\/\//)` regression guard |
| `getSnapshotUrl uses MINIO_PUBLIC_URL exactly when set` | URL == `https://example.com/snapshots/cam-7.jpg?v=99` AND regression guard |
| `buildPublicUrl strips trailing slashes from MINIO_PUBLIC_URL (no double-slash)` | Trailing `/` on `MINIO_PUBLIC_URL` does NOT produce `//avatars/` — `expect(url).not.toMatch(/\/\/avatars/)` |
| `getAvatarUrl falls back to legacy endpoint+port when MINIO_PUBLIC_URL unset (dev compat)` | Legacy `MINIO_PUBLIC_ENDPOINT=cdn.example.com` + `MINIO_PUBLIC_PORT=443` + `MINIO_USE_SSL=true` still emits `https://cdn.example.com:443/avatars/...` |
| `getAvatarUrl falls back to MINIO_ENDPOINT/MINIO_PORT when public overrides unset` | Bottom-tier fallback (`MINIO_ENDPOINT` + `MINIO_PORT` + `MINIO_USE_SSL`) preserved for dev compose |

## Verification

| Check | Result |
|-------|--------|
| `pnpm --filter @sms-platform/api exec vitest run tests/account/minio-avatars.test.ts` | **10/10 PASS** (3 RED → 0 RED after GREEN) |
| `pnpm --filter @sms-platform/api build` (nest build → SWC) | **PASS** — Successfully compiled 173 files |
| AC1: `grep -c "MINIO_PUBLIC_URL" minio.service.ts` >= 1 | **2** ✓ |
| AC2: `grep -c "buildPublicUrl" minio.service.ts` >= 3 | **3** ✓ (helper definition + 2 call sites) |
| AC3: trailing-slash strip count == 1 | **1** ✓ |
| AC4: `getAvatarUrl(userId: string, version?: number): string` count == 1 | **1** ✓ (signature preserved) |
| AC5: `getSnapshotUrl(cameraId: string, version?: number): string` count == 1 | **1** ✓ (signature preserved) |
| AC6: SDK init `useSSL: ... === 'true'` count == 1 | **1** ✓ (api↔minio leg untouched) |
| AC7: 5 URL-composition test names | **5** ✓ |
| AC8: `expect(url).toMatch(/^https:\/\//)` regression guard count >= 1 | **2** ✓ (one per public-URL emitter) |
| AC9: `expect(url).toBe('http://...` in tests count <= 1 | **1** ✓ (only the legacy-fallback dev test, NOT the prod-path) |

## Threats Mitigated

| Threat ID | Category | Disposition | Status |
|-----------|----------|-------------|--------|
| **T-27-MIXED** | Information Disclosure / Availability | mitigate | **CLOSED** — `buildPublicUrl` emits `https://` from the operator-supplied `MINIO_PUBLIC_URL`. Test 6 (`expect(url).toMatch(/^https:\/\//)`) prevents regression. Phase 30 GA blocker (avatars + snapshots loading on TLS pages) is unblocked. |
| T-27-PUBLIC-URL-INJECTION | Tampering | accept | Operator-controlled env var; `chmod 600 deploy/.env` already in place (Phase 26 init-secrets.sh). |
| T-27-LEGACY-FALLBACK-DRIFT | Information Disclosure | accept | Dev compose intentionally serves over `http://localhost`; legacy fallback remains documented in helper JSDoc. |

## Hand-off to Plan 27-04

Plan 27-04 (next wave member, executes in parallel worktree) **must** wire two changes:

1. **`deploy/docker-compose.yml`** — Add to the `api` service `environment:` block:
   ```yaml
   MINIO_PUBLIC_URL: https://${DOMAIN}
   ```

2. **`deploy/.env.production.example`** — Add to the `# Computed` or `# Defaults (override-only)` section:
   ```env
   # Public URL prefix for MinIO objects (avatars + snapshots). Phase 27 D-26
   # mixed-content fix: when set, MinioService.getAvatarUrl + getSnapshotUrl
   # use this exact prefix instead of deriving scheme from MINIO_USE_SSL
   # (which is correctly false for the api↔minio SDK leg). Production must
   # be `https://${DOMAIN}` so URLs are not blocked as mixed content on
   # TLS-served pages. Leave empty in dev compose to keep legacy http://
   # localhost fallback.
   MINIO_PUBLIC_URL=https://${DOMAIN}
   ```

Without 27-04's wiring, this plan's helper still works — production just stays on the legacy fallback path (i.e., still emits `http://${DOMAIN}:443/...` and re-introduces the mixed-content blocker). 27-03 + 27-04 must both land before Phase 27 closes.

## Deviations from Plan

None — plan executed exactly as written. RED → GREEN → verify cycle followed cleanly:
- 3 new tests written and verified failing (RED) before implementation
- Implementation matches CONTEXT D-26 Option A and the plan's `<action>` block byte-for-byte
- All 10 tests pass after GREEN; legacy fallback tests (Tests 4 + 5) untouched in semantics

## Self-Check: PASSED

- `apps/api/src/recordings/minio.service.ts`: **FOUND** at `7b66927` (HEAD) with `buildPublicUrl` helper at line 121, `getAvatarUrl` at line 139, `getSnapshotUrl` at line 198, SDK init at line 14-20 byte-identical
- `apps/api/tests/account/minio-avatars.test.ts`: **FOUND** at `4b2429c` with 5 URL-composition tests + 2 regression guards
- Commit `4b2429c`: **FOUND** in `git log --oneline -5` (test RED)
- Commit `7b66927`: **FOUND** in `git log --oneline -5` (feat GREEN)
- All 9 grep acceptance criteria: **PASS** (verified above)
- `vitest run tests/account/minio-avatars.test.ts`: **10/10 PASS**
- `pnpm --filter @sms-platform/api build`: **PASS**

---

*Plan 27-03 complete. T-27-MIXED closed pending plan 27-04 env wire-up.*
