# Phase 19.1 Deferred Items

Items discovered during execution that are **out of scope** for the plan
in-flight. They are logged here rather than auto-fixed per the executor's
scope-boundary rule.

## From Plan 19.1-01 (Wave 1 foundation)

### Pre-existing `tests/cameras/stream-probe.test.ts` failures — **RESOLVED in Plan 04**

- **Observed:** `pnpm vitest run tests/cameras/stream-probe.test.ts` reports
  10 failed / 3 passed / 0 todo when run against the working tree.
- **Root cause:** two independent drifts —
  1. `StreamProbeProcessor` tests instantiate the processor without supplying
     `statusGateway`, so `writeCodecInfo` crashes on
     `this.statusGateway.broadcastCodecInfo(...)` (line 73).
  2. `normalizeError` dictionary was rewritten during Phase 19 for
     user-friendly copy (e.g. "Camera refused the connection — check the port
     …"), but the tests still asserted the old short literals
     (`"Connection refused"`, `"Auth failed — check credentials"`, etc.).
     The `"Stream not found"` → `"No stream at that URL path"` pattern also
     diverged.
- **Verified:** same failure reproduces on the pristine plan-00 SUMMARY
  commit (`3e8260a`, before any Plan 01 edits) — confirmed by `git stash`
  during Task 3 verification. Plan 19.1-01 changes do not influence this.
- **Fix (Plan 04, commit deferred-items resolver):**
  - Made `statusGateway` `@Optional()` on `StreamProbeProcessor` so tests
    can omit it without the broadcast-site TypeError. Production DI still
    injects the real gateway via the `@Global()` `StatusModule`.
  - Added a sibling `@Optional() auditService?: AuditService` parameter for
    the new D-21 `camera.push.publish_rejected` emission.
  - Aligned 5 test expectations in
    `apps/api/tests/cameras/stream-probe.test.ts` to match the current
    `normalizeError` dictionary copy. Test descriptions were also updated so
    future readers don't expect the stale short phrases.
  - Added a `findUnique` mock on `mockPrisma.camera` to exercise the new
    push-mode ingest-mode check (defaults to pull so the Phase 19 tests stay
    on the success path).
- **Result:** 13/13 passing in `tests/cameras/stream-probe.test.ts` plus the
  5 new Plan-04 `tests/streams/probe-mismatch.test.ts` cases.
