---
phase: 23
slug: tech-debt-cleanup-phase-0-prerequisites
status: draft
nyquist_compliant: false
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

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| DEBT-01 | StreamProcessor guard refuses empty `cameraId` AND records metric | unit | `pnpm --filter @sms-platform/api test -- stream-processor-guard` | ✅ extend `apps/api/tests/streams/stream-processor-guard.test.ts` | ⬜ pending |
| DEBT-01 | `StreamGuardMetricsService.snapshot()` shape + status enum | unit | `pnpm --filter @sms-platform/api test -- stream-guard-metrics` | ❌ W0 — `apps/api/tests/streams/stream-guard-metrics.test.ts` | ⬜ pending |
| DEBT-01 | Real BullMQ worker + empty job → no FFmpeg spawn + metric incremented | integration | `pnpm --filter @sms-platform/api test -- stream-guard.integration` | ❌ W0 — `apps/api/tests/integration/stream-guard.integration.test.ts` | ⬜ pending |
| DEBT-02 | CI runs vitest + drift on every push + PR | smoke (CI) | `gh run list --workflow=test.yml --limit 1 --json conclusion -q '.[0].conclusion'` returns `success` | ❌ W0 — `.github/workflows/test.yml` | ⬜ pending |
| DEBT-03 | `generateOriginSrsConfig` does not contain `hls_use_fmp4` | unit | `pnpm --filter @sms-platform/api test -- config-generation` | ✅ extend `apps/api/tests/cluster/config-generation.test.ts` | ⬜ pending |
| DEBT-03 | `SettingsService.generateSrsConfig` does not contain `hls_use_fmp4` | unit | `pnpm --filter @sms-platform/api test -- srs-config` | ❌ W0 — `apps/api/tests/settings/srs-config.test.ts` | ⬜ pending |
| DEBT-04 | `getRecording()` API response includes `camera.tags` + `camera.description` | unit | `pnpm --filter @sms-platform/api test -- get-recording` | ✅ extend `apps/api/tests/recordings/get-recording.test.ts` | ⬜ pending |
| DEBT-04 | Playback page renders TagsCell when tags non-empty + line-clamped description | unit (component) OR manual | `pnpm --filter @sms-platform/web test -- playback-page-header` if web vitest exists, else manual smoke | ❌ W0 — `apps/web/src/app/app/recordings/[id]/components/__tests__/playback-page-header.test.tsx` (component) OR manual | ⬜ pending |
| DEBT-05 | `prisma migrate deploy` against fresh DB succeeds | integration | bash one-liner: `createdb sms_phase23_check && DATABASE_URL=postgresql://...sms_phase23_check pnpm --filter @sms-platform/api exec prisma migrate deploy && dropdb sms_phase23_check` | ❌ W0 — manual verify step in PLAN; `db:check-drift` is the steady-state gate | ⬜ pending |
| DEBT-05 | `db:check-drift` returns exit 0 against current schema.prisma | smoke | `pnpm --filter @sms-platform/api db:check-drift` | ✅ once `db:check-drift` script lands, the script IS the test | ⬜ pending |

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

*Note: Wave 0 produces empty/skeleton tests so subsequent waves' test commands resolve. The skeleton must include `it.skip("placeholder")` so vitest doesn't error on empty files.*

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
- [ ] Wave 0 covers all `❌ W0 —` references in the per-task map
- [ ] No watch-mode flags (every command is one-shot)
- [ ] Feedback latency < 45s for the full suite
- [ ] `nyquist_compliant: true` set in frontmatter once planner confirms every task in every plan has either an `<automated>` block or appears in this map

**Approval:** pending
