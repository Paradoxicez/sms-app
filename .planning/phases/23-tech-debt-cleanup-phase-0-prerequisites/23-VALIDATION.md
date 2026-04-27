---
phase: 23
slug: tech-debt-cleanup-phase-0-prerequisites
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-27
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (resolves from `apps/api/package.json`) |
| **Config file** | `apps/api/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @sms-platform/api test -- <pattern>` |
| **Full suite command** | `pnpm --filter @sms-platform/api test` |
| **Setup hook** | `pretest` runs `prisma generate && pnpm run db:test:setup` |
| **Test DB bootstrap** | `apps/api/scripts/setup-test-db.sh` |
| **Estimated runtime** | ~42 seconds (819 passing tests today) |
| **Drift gate** | `pnpm --filter @sms-platform/api db:check-drift` (exit 0 / exit 2 on drift) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @sms-platform/api test -- <touched-area-pattern>`
- **After every plan wave:** Run `pnpm --filter @sms-platform/api test` (full api suite)
- **Before `/gsd-verify-work`:** Full suite green AND `db:check-drift` returns 0
- **Max feedback latency:** ~45 seconds (full suite + drift)

---

## Per-Task Verification Map

> Populated by `gsd-planner` when plans are written. Each task in a PLAN.md must reference a row here or carry its own `<automated>` block. The mapping below is the planner's required input.

| Req ID | Task ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|---------|----------|-----------|-------------------|-------------|--------|
| DEBT-01 | 23-02-02 | StreamProcessor guard refuses empty `cameraId` AND records metric | unit | `pnpm --filter @sms-platform/api test -- stream-processor-guard --run` | ✅ extend `apps/api/tests/streams/stream-processor-guard.test.ts` | ⬜ pending |
| DEBT-01 | 23-02-01 | `StreamGuardMetricsService.snapshot()` shape + status enum | unit | `pnpm --filter @sms-platform/api test -- stream-guard-metrics --run` | ❌ Task 23-02-01 creates `apps/api/tests/streams/stream-guard-metrics.test.ts` (no Wave 0 skeleton) | ⬜ pending |
| DEBT-01 | 23-02-04 | Real BullMQ worker + empty job → no FFmpeg spawn + metric incremented | integration | `pnpm --filter @sms-platform/api test -- stream-guard.integration --run` | ❌ Task 23-02-04 creates `apps/api/tests/integration/stream-guard.integration.test.ts` (no Wave 0 skeleton) | ⬜ pending |
| DEBT-01 | 23-02-03 | `/api/srs/callbacks/metrics` returns `streamGuard` field | smoke (build) | `pnpm --filter @sms-platform/api build` | ✅ build is the gate; runtime smoke documented in plan | ⬜ pending |
| DEBT-02 | 23-05-03, 23-05-04 | CI runs vitest + drift on every push + PR | smoke (CI) | `gh run list --workflow=test.yml --limit 1 --json conclusion -q '.[0].conclusion'` returns `success` | ❌ Task 23-05-03 creates `.github/workflows/test.yml`; Task 23-05-04 verifies first run | ⬜ pending |
| DEBT-02 | 23-05-05 (USER) | Branch protection on main requires `test` check | manual | `gh api /repos/<owner>/<repo>/branches/main/protection -q '.required_status_checks.contexts'` returns `["test"]` | ❌ checkpoint:human-action — user runs gh api or Settings UI | ⬜ pending |
| DEBT-02 | 23-05-01 | 121 it.todo backlog tracked for v1.4 | smoke (file) | `test -f .planning/todos/v1.4-test-backfill.md` | ❌ Task 23-05-01 creates the file | ⬜ pending |
| DEBT-03 | 23-03-01 | `generateOriginSrsConfig` does not contain `hls_use_fmp4` | unit | `pnpm --filter @sms-platform/api test -- config-generation --run` | ✅ extend `apps/api/tests/cluster/config-generation.test.ts` | ⬜ pending |
| DEBT-03 | 23-03-02 | `SettingsService.generateSrsConfig` does not contain `hls_use_fmp4` | unit | `pnpm --filter @sms-platform/api test -- srs-config --run` | ❌ Task 23-03-02 creates `apps/api/tests/settings/srs-config.test.ts` | ⬜ pending |
| DEBT-04 | 23-04-01 | `getRecording()` API response includes `camera.tags` + `camera.description` | unit | `pnpm --filter @sms-platform/api test -- get-recording --run` | ✅ extend `apps/api/tests/recordings/get-recording.test.ts` | ⬜ pending |
| DEBT-04 | 23-04-02 | `RecordingCameraInclude` type includes tags + description; web build green | smoke (build) | `pnpm --filter @sms-platform/web build` | ✅ build is the gate | ⬜ pending |
| DEBT-04 | 23-04-03 | Playback page renders TagsCell + line-clamped description (chained build + grep regression gate) | smoke (build+grep) | `pnpm --filter @sms-platform/web build && grep -q 'TagsCell' apps/web/src/app/app/recordings/\[id\]/components/playback-page-header.tsx && grep -q 'line-clamp-2' apps/web/src/app/app/recordings/\[id\]/components/playback-page-header.tsx && grep -q 'descriptionExpanded' apps/web/src/app/app/recordings/\[id\]/components/playback-page-header.tsx` | ✅ chained verify in plan; manual visual smoke optional and recorded in SUMMARY | ⬜ pending |
| DEBT-05 | 23-06-02 [BLOCKING checkpoint] | `prisma migrate deploy` against fresh DB succeeds + `db:check-drift` exit 0 (operator-driven, gates Plan 23-06 Task 3 destructive deletion) | integration | Operator runs the 5-step recipe locally (`createdb sms_phase23_drift_check && DATABASE_URL=postgresql://localhost/sms_phase23_drift_check pnpm --filter @sms-platform/api exec prisma migrate deploy && pnpm --filter @sms-platform/api db:check-drift && pnpm --filter @sms-platform/api db:reset && dropdb sms_phase23_drift_check`); resume signal `migrate-deploy-verified` | ❌ checkpoint:human-action — gates Task 3 deletion | ⬜ pending |
| DEBT-05 | 23-01-02 | `db:check-drift` script exists in apps/api/package.json | smoke | `node -e "if(!require('./apps/api/package.json').scripts['db:check-drift']) process.exit(1)"` | ✅ Task 23-01-02 creates the script | ⬜ pending |
| DEBT-05 | 23-06-01 | `setup-test-db.sh` uses `prisma migrate deploy`, no references to deleted RLS files | smoke | `! grep -E 'rls\.policies\.sql\|rls_apply_all\|prisma db push' apps/api/scripts/setup-test-db.sh && grep -q 'prisma migrate deploy' apps/api/scripts/setup-test-db.sh` | ✅ Task 23-06-01 edits script | ⬜ pending |
| DEBT-05 | 23-06-03 | All 8 hand-rolled migration directories + 2 standalone RLS files deleted | smoke | `[ "$(ls apps/api/src/prisma/migrations | wc -l | tr -d ' ')" = "1" ] && test ! -e apps/api/src/prisma/rls.policies.sql && test ! -e apps/api/src/prisma/rls-phase5.sql` | ✅ Task 23-06-03 deletes them | ⬜ pending |
| DEBT-05 | 23-01-01 | Squashed `0_init/migration.sql` exists with schema + RLS + grants | smoke | `grep -q 'CREATE TABLE "Camera"' apps/api/src/prisma/migrations/20260427000000_init/migration.sql && grep -q 'CREATE POLICY' apps/api/src/prisma/migrations/20260427000000_init/migration.sql && grep -q 'app_user' apps/api/src/prisma/migrations/20260427000000_init/migration.sql` | ❌ Task 23-01-01 creates the file | ⬜ pending |
| DEBT-05 | 23-01-03 | CLAUDE.md Prisma workflow rule reflects db:reset swap | smoke | `grep -q 'db:reset' CLAUDE.md && ! grep -E 'pnpm --filter @sms-platform/api db:push[^:]' CLAUDE.md` | ✅ Task 23-01-03 edits CLAUDE.md | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/api/tests/streams/stream-guard-metrics.test.ts` — DEBT-01 unit (snapshot + recordRefusal)
- [ ] `apps/api/tests/integration/stream-guard.integration.test.ts` — DEBT-01 integration (real BullMQ + Redis, `describe.skipIf(!isRedisAvailable)`)
- [ ] `apps/api/tests/settings/srs-config.test.ts` — DEBT-03 settings.service emit path negative assertion
- [ ] `.github/workflows/test.yml` — DEBT-02 CI workflow file (the artifact IS the gate)
- [ ] `apps/api/package.json` — `db:check-drift` script must exist before CI references it
- [ ] `apps/web/src/app/app/recordings/[id]/components/__tests__/playback-page-header.test.tsx` — DEBT-04 component test (only if `apps/web` has a vitest runner; otherwise this becomes a manual smoke step)
- [ ] `.planning/todos/v1.4-test-backfill.md` — D-07 backlog entry tracking 121 `it.todo` placeholders
- [ ] No new framework install — Vitest 2.x already in repo

*Note: Plan 23-02 (DEBT-01) inlines test file creation into the owning task (no Wave 0 skeleton-then-fill split). Each test file is written fresh in one pass — `stream-guard-metrics.test.ts` is created in Task 23-02-01 alongside the service; `stream-guard.integration.test.ts` is created in Task 23-02-04 with the full BullMQ harness. Other Wave 0 artifacts (`.github/workflows/test.yml`, `db:check-drift` script, `srs-config.test.ts`, `v1.4-test-backfill.md`) are still produced by their owning tasks before the artifacts that depend on them.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `prisma migrate deploy` against an empty Postgres produces v1.2-equivalent schema (Success Criteria #1) | DEBT-05 | One-time baseline verification — not steady-state CI work; needs throwaway DB | `createdb sms_phase23_check; DATABASE_URL=postgresql://localhost:5432/sms_phase23_check pnpm --filter @sms-platform/api exec prisma migrate deploy; pnpm --filter @sms-platform/api db:check-drift; dropdb sms_phase23_check` — all steps must succeed |
| Branch protection on `main` requires `test.yml` check before merge (Success Criteria #5) | DEBT-02 | GitHub admin action; `gh api` requires push permission token; UI fallback always works | Run `gh api -X PUT repos/{owner}/{repo}/branches/main/protection -f required_status_checks.strict=true -f 'required_status_checks.contexts[]=test'` OR enable in Settings → Branches → main → Require status checks |
| SRS container cold-boot serves first HLS segment within 30s of camera publish (Success Criteria #3) | DEBT-03 | Requires real SRS container; deferred to Phase 30 smoke test on clean VM | Phase 30 verifies — Phase 23 only locks the absence of `hls_use_fmp4` in the rendered config (regression gate) |
| Playback page tag badges + description display when `apps/web` lacks vitest runner | DEBT-04 | Component test cannot run without test infra; if Wave 0 doesn't add web vitest, this stays manual for v1.3 | Open `https://localhost:{web-port}/app/recordings/{id}` for a recording whose camera has tags + description; verify badge row + line-clamped description appear in header zone |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies listed
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Test file creation tasks are not split between skeleton + fill (Plan 23-02 inlined skeleton into owning tasks per planner-revision)
- [ ] No watch-mode flags (every command is one-shot)
- [ ] Feedback latency < 45s for the full suite
- [ ] `nyquist_compliant: true` set in frontmatter once planner confirms every task in every plan has either an `<automated>` block or appears in this map

**Approval:** ready (planner — 2026-04-27)
