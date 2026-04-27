# Phase 19 — Deferred Items (out-of-scope issues surfaced during execution)

## Plan 19-02 discoveries (2026-04-22)

### Full API test suite has 59 pre-existing failures

Observed when running `pnpm --filter @sms-platform/api test -- --run`. Scoped verification
(`tests/cameras/ffprobe tests/streams/ffmpeg-command-builder`) passes all 16 tests
(12 existing + 4 new in each file). The following failures were confirmed pre-existing
via a baseline run on HEAD~2 (before plan 19-02 commits):

1. **`tests/cameras/bulk-import.test.ts`** — 12 failures. `this.prisma.camera.findFirst is not a function` — prisma mock/test-harness issue, not DTO logic.
2. **`tests/status/*`** (debounce, maintenance-suppression, state-machine) — StatusService test harness failures, unrelated to 19-02.
3. **`tests/users/org-admin-guard.test.ts`** — `table public.PlaybackSession does not exist` — test DB is missing Phase 1+ migrations (`prisma db push` not run against `sms_platform_test`).
4. **Other** — sampling shows similar DB-migration and mock-wiring pre-existing issues.

**Scope decision:** Rule 1-3 auto-fix applies only to code directly touched by the current plan. These failures exist in tests of unrelated services (bulk-import DTO, StatusService, OrgAdminGuard). Deferring for a dedicated "test infrastructure repair" quick task.

**Recommended follow-up:** Run `pnpm --filter @sms-platform/api db:push` against the test DB (or re-run `db:test:setup`) and audit Prisma client injection patterns in tests/cameras/bulk-import.test.ts.

## Plan 19-03 regression — RESOLVED (2026-04-22 post-verify cleanup)

### `probe-processor.test.ts` broken by Phase 19-03 processor rewrite — RESOLVED BY DELETION

The 19-08 executor initially labeled these 3 test failures as "pre-existing" based on a stash-and-rerun check. The verifier subsequently reproduced the pre-Phase-19 baseline (commit 7eed3d4, 7 source files reverted) and found **all 4 tests passed** on that baseline — confirming the failures were introduced by Phase 19-03, not inherited debt.

Root cause: `tests/streams/probe-processor.test.ts` was authored 2026-04-21 by quick task 260421-f0c for the original 2-arg `StreamProbeProcessor` + flat `codecInfo` shape. Phase 19-03 rewrote the constructor to 3-arg (adding `SrsApiService`) and changed `codecInfo` to a tagged union (`{ status, video, audio, probedAt }`). The old tests still asserted the flat shape and the 2-arg constructor.

**Resolution:** Deleted `tests/streams/probe-processor.test.ts`. Its coverage is fully superseded by `tests/cameras/stream-probe.test.ts` (created in 19-03, 13/13 passing, exercises the new tagged-union shape, defensive guard, normalizeError dictionary, and SRS-api branch).

**Verification:** `pnpm --filter @sms-platform/api test -- --run tests/cameras/stream-probe.test.ts` → 13 passed. No other test file imports or references `probe-processor.test.ts`.
