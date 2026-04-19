# Deferred Items — Phase 15

Items discovered during plan execution that are out of scope for the
current task and logged here per execution guard rules (fix attempt limit
+ scope boundary).

## 15-01: Pre-existing test failures (NOT introduced by 15-01)

Baseline verification: ran full `pnpm --filter @sms-platform/api test`
against commit 80e598c (before 15-01 changes) and reproduced the same
failures — confirms they pre-date this plan.

Failing tests at baseline (commit 80e598c):

- tests/admin/super-admin.test.ts (1 test — session guard)
- tests/auth/sign-in.test.ts (4 tests — better-auth/crypto ESM dynamic import)
- tests/cluster/cluster.service.test.ts (1 test)
- tests/cluster/load-balancer.test.ts (1 test)
- tests/packages/package-limits.test.ts (1 test)
- tests/recordings/manifest.test.ts (3 tests — fMP4 HLS manifest)
- tests/srs/callbacks.test.ts (5 tests — StatusService mock mismatch)
- tests/srs/config-generator.test.ts (1 test)
- tests/srs/on-play-verification.test.ts (3 tests — on_play/JWT)
- tests/streams/ffmpeg-command.test.ts (1 test — stopStream)
- tests/streams/reconnect.test.ts (1 test)
- tests/streams/stream-lifecycle.test.ts (3 tests — mock `job.remove()` missing `.catch()`)
- tests/users/org-user-management.test.ts (1 test — hashPassword ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING)

Total: 26 failing tests across 13 files — all pre-existing.

The tests under `tests/status/` that DO fall under 15-01 scope were
updated in Task 4 (state-machine.test.ts Queue mock) and expanded in
Task 5 (debounce.test.ts + maintenance-suppression.test.ts). All 26
status/ tests pass.

## Action

Out of scope for 15-01. Surface to orchestrator / a future housekeeping
plan for triage.
