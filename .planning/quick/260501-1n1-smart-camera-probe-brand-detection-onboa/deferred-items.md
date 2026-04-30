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
