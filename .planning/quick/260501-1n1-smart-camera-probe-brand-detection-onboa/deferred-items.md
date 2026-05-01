# Deferred items — quick task 260501-1n1

Pre-existing failures discovered during execution that are OUT OF SCOPE for this task (verified to fail on the worktree branch with my changes stashed):

| Test file | Status | Notes |
|-----------|--------|-------|
| `tests/resilience/boot-recovery.test.ts` | failing pre-task | Failing on `worktree-agent-a92a7c3b00d71ffcd` even with all task changes stashed; unrelated to FfprobeService / StreamProbeProcessor / Prisma schema. |
| `tests/resilience/camera-health.test.ts` | failing pre-task | Same — pre-existing. |
| `tests/resilience/srs-restart-recovery.test.ts` | failing pre-task | Same — pre-existing. |
| `tests/srs/callbacks.test.ts` | failing pre-task | Same — pre-existing. |
| `tests/streams/profile-restart-dedup.test.ts` | failing pre-task | Same — pre-existing. |
| `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog-push.spec.tsx` | failing pre-task | 1 failure ("parses ingestMode column case-insensitive..."). Verified pre-existing with `git stash`. |
| `apps/web/src/app/admin/cameras/components/__tests__/bulk-import-dialog.test.tsx` | failing pre-task | 2 failures (footer counter + Import button enabled). Verified pre-existing with `git stash`. |

Reproducer:

```bash
git stash && pnpm --filter @sms-platform/api exec vitest run \
  tests/resilience/boot-recovery.test.ts \
  tests/resilience/camera-health.test.ts \
  tests/resilience/srs-restart-recovery.test.ts \
  tests/srs/callbacks.test.ts \
  tests/streams/profile-restart-dedup.test.ts
# → 5 files / 5 tests failed without any task changes applied
git stash pop
```

Logged per `<deviation_rules>` SCOPE BOUNDARY (only auto-fix issues directly caused by the current task's changes).

---

## RESOLVED 2026-04-30 (post-quick-task cleanup)

All 7 deferred test failures fixed in a follow-up commit. Root causes:

| Test | Cause | Fix |
|------|-------|-----|
| `camera-health.test.ts` | Old test asserted ONE-tick reap; v1.3.1 added `MISS_TOLERANCE=2` (`badd5a1`) | Call `runTick()` twice; test name now mentions tolerance |
| `boot-recovery.test.ts`, `srs-restart-recovery.test.ts`, `profile-restart-dedup.test.ts` | All asserted `attempts: 20`; lowered to `8` in `cf0c944 fix(streams): pre-flight kick + cap retry attempts` | Update assertions to `attempts: 8` |
| `srs/callbacks.test.ts` | Asserted `fetch('/api/v1/streams')`; v1.3 added `?count=9999` to disable SRS pagination cap (`21840f0`) | Update URL to include query param |
| `bulk-import-dialog.test.tsx`, `bulk-import-dialog-push.spec.tsx` | Counter labels renamed: `valid` → `new`, `duplicate` → `already in DB` | Update text matchers |

All 7 files now green: 46/46 backend tests + 34/34 frontend tests.
