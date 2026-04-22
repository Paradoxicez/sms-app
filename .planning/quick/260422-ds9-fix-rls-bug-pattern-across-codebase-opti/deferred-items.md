# Deferred items — 260422-ds9

Items discovered during 260422-ds9 execution that are out of scope for this
quick task. They should be triaged in a separate debug/quick task.

## Pre-existing test failures under tests/status/ (NOT caused by 260422-ds9)

Confirmed pre-existing by running `pnpm exec vitest run tests/status/state-machine.test.ts`
on HEAD with 260422-ds9 changes stashed — all 14 state-machine tests fail
identically with `this.prisma.camera.findFirst is not a function`.

Affected files:
- `apps/api/tests/status/state-machine.test.ts` (14 failures)
- `apps/api/tests/status/maintenance-suppression.test.ts` (2 failures)
- `apps/api/tests/status/debounce.test.ts` (4 failures)

Likely cause: a mock Prisma stub in these tests lacks `camera.findFirst` on
one branch. Most probably landed during Phase 15/15.1 StatusService changes
and was never caught because the full suite wasn't re-run. Needs a
dedicated mock-stub-fix commit in a follow-up task.

Not related to RLS, tenancy, or the OrgAdminGuard/AdminDashboardService/
bulkImport changes in this quick.
