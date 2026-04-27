# Phase 18 — Deferred Items (Out-of-Scope Discoveries)

Issues observed during plan execution that are PRE-EXISTING and unrelated to
the current work. Logged here per GSD scope-boundary rule; do NOT fix inline.

## 2026-04-21 — Plan 18-01 execution

### Status suite (20 failures in 3 files)

Pre-existing failures in `apps/api/tests/status/`:

- `tests/status/state-machine.test.ts` (12 failing) —
  `TypeError: this.prisma.camera.findFirst is not a function`. The test
  constructs `StatusService` with a mock that pre-dates a refactor to
  `SystemPrismaService`; the service now uses a different Prisma field shape.
- `tests/status/debounce.test.ts` (4 failing) — same root cause.
- `tests/status/maintenance-suppression.test.ts` (4 failing) — same root cause.

Verified unrelated to Plan 01 work: reproducing on the pre-Plan-01 commit via
`git stash && pnpm test tests/status/` also shows 20 failures. Recommend
tracking as a separate quick-fix before Phase 18 merges back to main.

## 2026-04-21 — Plan 18-04 execution

### `pnpm build` type error in `storage-forecast-card.tsx`

`apps/web/src/components/dashboard/storage-forecast-card.tsx:101` fails TS
2322: `Tooltip formatter={(value: number) => [...]}` signature narrower than
recharts' `Formatter<ValueType, NameType>` (expects `ValueType | undefined`).

Introduced by Plan 18-05 (`45caf4e feat(18-05)`) before Plan 18-04. Not
touched by this plan; `pnpm test` suite runs green; Plan 18-04's own changes
(`camera-popup.tsx`, `camera-popup.test.tsx`) type-check clean. Should be
fixed as a follow-up quick task to unblock the full phase `pnpm build`.

