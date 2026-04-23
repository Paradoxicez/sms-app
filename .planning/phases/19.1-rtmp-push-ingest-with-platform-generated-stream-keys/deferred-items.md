# Phase 19.1 Deferred Items

Items discovered during execution that are **out of scope** for the plan
in-flight. They are logged here rather than auto-fixed per the executor's
scope-boundary rule.

## From Plan 19.1-01 (Wave 1 foundation)

### Pre-existing `tests/cameras/stream-probe.test.ts` failures

- **Observed:** `pnpm vitest run tests/cameras/stream-probe.test.ts` reports
  10 failed / 3 passed / 0 todo when run against the working tree.
- **Root cause:** `StreamProbeProcessor` tests instantiate the processor
  without supplying `statusGateway`, so `writeCodecInfo` crashes on
  `this.statusGateway.broadcastCodecInfo(...)` (line 73 of
  `stream-probe.processor.ts`).
- **Verified:** same failure reproduces on the pristine plan-00 SUMMARY
  commit (`3e8260a`, before any Plan 01 edits) — confirmed by `git stash`
  during Task 3 verification. Plan 19.1-01 changes do not influence this.
- **Scope judgement:** Plan 19.1-01 does not touch `StreamProbeProcessor`,
  `stream-probe.test.ts`, or `StatusGateway`. This is a pre-existing Phase
  19 regression (likely from Phase 19 wave-N that introduced the gateway
  broadcast without updating the test harness), not caused by Plan 01's
  schema/util/DTO/service additions.
- **Deferred to:** Plan 19.1-04 (StreamProbeProcessor passthrough + codec
  mismatch) — that plan already opens the file for `CodecInfo.mismatchCodec`
  wiring, and the test harness will need a gateway mock or DI refactor
  there regardless.
