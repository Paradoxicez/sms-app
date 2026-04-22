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

## Plan 19-08 discoveries (2026-04-22)

### 3 pre-existing probe-processor test failures (out of scope for rename)

Observed when running `pnpm --filter @sms-platform/api test -- --run tests/streams/`.
Stashing the 19-08 rename commit and re-running produced the SAME 3 failures, confirming
they are pre-existing and not caused by the `rtspUrl → inputUrl` rename.

1. **`tests/streams/probe-processor.test.ts > updates camera.codecInfo with PENDING before probing, then success`** — fixture mismatch in `codecInfo.status` transition (`pending` vs `failed`).
2. **`tests/streams/probe-processor.test.ts > updates camera.codecInfo with FAILED on probe error`** — assertion matcher mismatch (`ObjectContaining` vs `Object`).
3. **`tests/streams/probe-processor.test.ts > survives a DB error in the error-recording branch (logs only)`** — test rejects instead of resolves when DB `update` throws.

**Scope decision:** These failures are in `probe-processor.test.ts`, a file NOT in the 19-08 rename scope. `rg "rtspUrl|inputUrl" probe-processor.test.ts` returns zero hits. They were introduced/left behind by an earlier wave (P03 probe wiring) and are unrelated to the D-14 field rename.

**Recommended follow-up:** Audit probe-processor test fixtures against current `StreamProbeProcessor` implementation — likely drift in `codecInfo.status` enum transitions or promise handling in error branch.
