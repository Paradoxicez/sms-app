---
phase: 23
plan: 03
subsystem: srs-config-emit
tags: [debt-03, srs, regression-lock, tests, cold-boot]
requirements: [DEBT-03]
dependency-graph:
  requires:
    - apps/api/src/cluster/templates/srs-origin.conf.ts (audit confirmed clean)
    - apps/api/src/settings/settings.service.ts (audit confirmed clean)
  provides:
    - "Unit-level regression gate against hls_use_fmp4 reintroduction in either SRS config emit path"
  affects:
    - apps/api/tests/cluster/config-generation.test.ts (extended)
    - apps/api/tests/settings/srs-config.test.ts (created)
tech-stack:
  added: []
  patterns:
    - "Negative assertion via expect(cfg).not.toContain('hls_use_fmp4')"
    - "Pure-function direct construction (null DI deps for synchronous methods)"
key-files:
  created:
    - apps/api/tests/settings/srs-config.test.ts
  modified:
    - apps/api/tests/cluster/config-generation.test.ts
decisions:
  - "Construct SettingsService directly with null DI deps — generateSrsConfig is a synchronous pure function over SystemSettingsConfig that does not touch tenantPrisma / systemPrisma / srsApiService / clusterService. No Nest TestingModule or Prisma mocking needed; the plan's skeleton was overly cautious."
  - "Two test cases per file (hlsEncryption: false + true) cover both branches of the rendered hlsKeysBlock template literal. The assertion is identical, but covering both branches guards against a directive being emitted only inside the encryption branch."
metrics:
  duration: "~3 minutes"
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  commits: 2
  completed: 2026-04-27
---

# Phase 23 Plan 03: SRS hls_use_fmp4 Regression Lock Summary

Lock the SRS v6 cold-boot fix as a unit-level regression gate. Both SRS config emit paths (cluster origin template + SettingsService runtime emit) now have `expect(cfg).not.toContain('hls_use_fmp4')` assertions; future PRs that re-introduce the directive fail CI before merge.

## What Was Built

- **`apps/api/tests/cluster/config-generation.test.ts`** — appended a new `describe('generateOriginSrsConfig — Phase 23 DEBT-03 cold-boot regression lock', ...)` block at the end of the file (preserves existing 9 `generateEdgeNginxConfig` tests). Two new `it()` cases assert the rendered SRS origin config does not contain `hls_use_fmp4` with both `hlsEncryption: false` and `hlsEncryption: true`.
- **`apps/api/tests/settings/srs-config.test.ts`** — new file (55 LOC). Constructs `SettingsService` directly with `null` DI deps (allowed because `generateSrsConfig` is a synchronous pure function over `SystemSettingsConfig`) and asserts the rendered config does not contain `hls_use_fmp4` for both encryption branches.

## Test Counts

| File | Before | After | Delta |
|------|--------|-------|-------|
| `apps/api/tests/cluster/config-generation.test.ts` | 9 tests (60 LOC) | 11 tests (104 LOC) | +2 it() cases (+44 LOC) |
| `apps/api/tests/settings/srs-config.test.ts` | n/a (file did not exist) | 2 tests (55 LOC) | +1 file, +2 it() cases |

## Sanity Meta-Test (Gate Validation)

Verified that the regression gate actually catches the bug it's designed to prevent. Procedure for each emit path:

| Emit path | Inject | Test result | Revert | Re-test |
|-----------|--------|-------------|--------|---------|
| `apps/api/src/cluster/templates/srs-origin.conf.ts` | added `        hls_use_fmp4    on;\n` between `hls_wait_keyframe on;` and `${hlsKeysBlock}` | **2 failed** ✅ (gate fired correctly) | restored original 84-LOC file via Edit | **11 passed** ✅ |
| `apps/api/src/settings/settings.service.ts` | added `        hls_use_fmp4    on;\n` after `hls_ts_ctx on;` | **2 failed** ✅ (gate fired correctly) | restored original via Edit | **2 passed** ✅ |

`grep -n hls_use_fmp4 apps/api/src/...` returns 0 matches in both source files post-revert (confirmed via shell grep, exit 1).

## Verification Commands (from PLAN)

| # | Command | Result |
|---|---------|--------|
| 1 | `pnpm --filter @sms-platform/api test -- config-generation --run` | ✅ 11 passed (9 existing + 2 new) — 756ms |
| 2 | `pnpm --filter @sms-platform/api test -- srs-config --run` | ✅ 2 passed — 631ms |
| 3 | `grep -c hls_use_fmp4 apps/api/tests/cluster/config-generation.test.ts` | 4 (2 in `it()` strings + 2 in `expect().not.toContain()`) — exceeds the ≥2 minimum |
| 4 | `grep -c hls_use_fmp4 apps/api/tests/settings/srs-config.test.ts` | 5 (2 in `it()` strings + 2 in `expect().not.toContain()` + 1 in top-of-file comment) — exceeds the ≥1 minimum |
| 5 | Sanity meta-test (manual injection → fail → revert → pass) | ✅ documented above |

## Confirmation: SettingsService method name

The plan flagged uncertainty around the method name on `SettingsService` (the `<read_first>` block listed `generateSrsConfig` as the assumed name). Confirmed by reading `apps/api/src/settings/settings.service.ts:138`:

```ts
generateSrsConfig(settings: SystemSettingsConfig): string {
```

Method is exactly `generateSrsConfig`. It is **synchronous** (returns `string`, not `Promise<string>`) and takes a plain `SystemSettingsConfig` shape — no `orgId` argument. Callers (`updateSystemSettings`, `regenerateAndReloadSrs`, `regenerateAndReloadSrsAtBoot`) read settings from Prisma and pass the resulting object in. This means the test does NOT need Prisma mocking.

The interface used by both emit paths is now identical-by-shape:

```ts
{ hlsFragment, hlsWindow, hlsEncryption, rtmpPort, httpPort, apiPort }
```

(Same fields, same types — `SrsOriginSettings` in `srs-origin.conf.ts` and `SystemSettingsConfig` in `settings.service.ts`. They are not the same TypeScript type, but they are structurally equivalent.)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing `node_modules` and `.env.test`**

- **Found during:** Task 1 verification (`pnpm --filter @sms-platform/api test` failed with `prisma: command not found` then `TEST_DATABASE_URL is not set`).
- **Issue:** A fresh git worktree does not inherit `node_modules` from the parent monorepo, and `.env.test` is gitignored so it was not present in the worktree either.
- **Fix:** Symlinked `node_modules` and `apps/api/node_modules` to the parent monorepo's installations (avoids the multi-minute `pnpm install` hit on every worktree). Copied `apps/api/.env.test` from the parent. These artifacts are local-only — the symlinks are untracked (parent paths are absolute, would not work elsewhere) and were NOT committed.
- **Files modified:** none committed; only worktree-local symlinks + `.env.test`.
- **Commit:** none (local-only artifacts).

### Architectural simplification (vs plan skeleton)

The plan's Task 2 skeleton suggested mocking `tenantPrisma.streamProfile.findFirst`, `tenantPrisma.orgSettings.findUnique`, etc. After reading `settings.service.ts:138`, I confirmed `generateSrsConfig` is a synchronous pure function that takes the config object directly (no Prisma access). The implemented test therefore uses `null as any` for all four DI deps — much cleaner than the plan's mock skeleton, and the plan explicitly allowed simpler positional construction "if it works".

This is **not a deviation requiring a Rule** — the plan permitted it ("Construct positionally if SettingsService allows it"). Recording it here for the next planner so future SettingsService unit tests follow the same pattern.

## Commits

| Hash | Task | Message |
|------|------|---------|
| `6a5323d` | 1 | `test(23-03): add hls_use_fmp4 regression lock to SRS origin config test` |
| `696ed29` | 2 | `test(23-03): add hls_use_fmp4 regression lock to SettingsService emit path` |

## Threat Mitigation

T-23-10 (DoS via cold-boot crash from `hls_use_fmp4`) — **mitigated**. Both emit paths gated by negative assertions. Phase 30 smoke test (clean VM cold-boot) is the integration-level verification; this plan delivers the unit-level lock referenced in the threat model.

T-23-11 (tampering of SRS config emit code) — disposition **accept**, no action needed.

## Self-Check: PASSED

Verified files:
- ✅ `apps/api/tests/cluster/config-generation.test.ts` exists (104 LOC, contains `hls_use_fmp4` 4×)
- ✅ `apps/api/tests/settings/srs-config.test.ts` exists (55 LOC, contains `hls_use_fmp4` 5×)
- ✅ `apps/api/src/cluster/templates/srs-origin.conf.ts` clean (0 matches for `hls_use_fmp4`)
- ✅ `apps/api/src/settings/settings.service.ts` clean (0 matches for `hls_use_fmp4`)

Verified commits:
- ✅ `6a5323d` present in `git log --oneline`
- ✅ `696ed29` present in `git log --oneline`

Verified test runs:
- ✅ `pnpm --filter @sms-platform/api test -- config-generation --run` exits 0 (11/11)
- ✅ `pnpm --filter @sms-platform/api test -- srs-config --run` exits 0 (2/2)
