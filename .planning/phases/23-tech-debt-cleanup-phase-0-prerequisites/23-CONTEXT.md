# Phase 23: Tech Debt Cleanup + Phase 0 Prerequisites - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

ปิด tech debt ที่ production จะขยายผลแบบเงียบๆ ก่อนเริ่ม v1.3 deploy work — Phase 23 เป็น **Phase 0 prerequisite ที่ block ทุกอย่าง** ใน v1.3 จนกว่าจะเสร็จ.

**Delivers:**
- DEBT-01 — StreamProcessor guard fast-fail metric + unit/integration tests (FFmpeg children must not leak from undefined `cameraId` jobs)
- DEBT-02 — Decision recorded for 23 "test failures" (actual state = 121 `it.todo` + 11 Redis-gated `describe.skipIf`, 0 failures); no test code changes in this phase, but CI gate added
- DEBT-03 — SRS config template stops emitting `hls_use_fmp4` so cold-boot SRS v6 has no manual config edit step
- DEBT-04 — Recording playback page (`/app/recordings/[id]`) surfaces parent camera tags + description (closes Phase 22 ↔ Phase 17 audit gap)
- DEBT-05 — Hand-rolled SQL files in `apps/api/src/prisma/migrations/*` converted to a single squashed Prisma `0_init` migration including RLS; `prisma migrate deploy` against an empty DB produces v1.2-equivalent schema
- CI — `.github/workflows/test.yml` (lint + typecheck + `pnpm test` + `db:check-drift`) + branch protection requiring this check before merge to `main`

**Out of scope (belongs to other phases):**
- Multi-stage production Dockerfiles (Phase 25)
- `deploy/` folder + dev Dockerfile rename (Phase 24)
- `migrate` init service in compose (Phase 26 — wiring; Phase 23 only ensures `migrate deploy` works against empty DB)
- GitHub Actions image build / GHCR push / release workflow (Phase 28)
- Branch protection on tags / cosign / provenance (Phase 28)
- Backfilling 121 `it.todo` placeholders into real tests (deferred to v1.4)

</domain>

<decisions>
## Implementation Decisions

### DEBT-05: Migration baseline strategy
- **D-01:** Squash all 8 hand-rolled SQL files into a single `0_init` Prisma migration. Generate the schema baseline with `prisma migrate diff --from-empty --to-schema-datamodel apps/api/src/prisma/schema.prisma --script`, then **append** the consolidated RLS policy SQL (idempotent `IF NOT EXISTS` blocks copied from `rls_apply_all/migration.sql` and `rls_phase02/migration.sql`) to the same `migration.sql`. Result: one reviewable file that produces v1.2-equivalent schema + RLS in one apply.
- **D-02:** Delete the 8 existing hand-rolled directories (`camera_push_fields/`, `camera_stream_url_unique/`, `drop_org_settings_dead_fields/`, `recording_segment_has_keyframe/`, `rls_apply_all/`, `rls_phase02/`, `rls_policies/`, `rls_superuser_bypass_positive_signal/`) after their content has been folded into `0_init`. Use a Prisma timestamped name (e.g., `20260427000000_init`).
- **D-03:** Replace the `db:push` script in `apps/api/package.json` with `db:reset` (runs `prisma migrate reset --force --skip-seed`) for dev DB recreation. Drop `db:push:skip-rls` entirely — no escape hatch needed.
- **D-04:** Add `db:check-drift` npm script: `prisma migrate diff --from-migrations apps/api/src/prisma/migrations --to-schema-datamodel apps/api/src/prisma/schema.prisma --exit-code`. Phase 23 runs once locally to confirm zero drift before commit; CI workflow (D-13 below) runs it on every push.
- **D-05:** No production `migrate resolve` baseline needed — v1.3 has no live prod DB yet. Dev databases get dropped + reset.

### DEBT-02: Test triage philosophy
- **D-06:** **Leave 121 `it.todo` tests as-is.** Actual test state today: `108 passed, 11 skipped, 121 todo, 0 failures`. The "23 failures" referenced in research/REQUIREMENTS reflects an earlier snapshot — current tree is green. `it.todo` does not fail CI.
- **D-07:** Track the 121 todo placeholders as a backlog item — append a single entry to `.planning/todos/` (or roadmap backlog) noting "121 `it.todo` tests across api package, fill incrementally in v1.4+". Do not delete, do not convert to GitHub issues this phase.
- **D-08:** No test code edits in DEBT-02. The 11 `describe.skipIf(!isRedisAvailable)` integration files stay as-is (they run on machines/CI with Redis).
- **D-09:** No coverage threshold configured this phase. Add `pnpm test --coverage` flag later if needed; Phase 23 only enforces "tests stay green" as the regression gate.

### DEBT-01: StreamProcessor guard observability
- **D-10:** Create `StreamGuardMetricsService` (apps/api/src/streams/) following the existing `ArchiveMetricsService` pattern (`apps/api/src/recordings/archive-metrics.service.ts`). In-memory counters, `recordRefusal(reason: 'undefined_cameraId' | 'empty_inputUrl')`, `snapshot()` returning `{ refusals, byReason, status: 'idle'|'healthy'|'degraded'|'failing', lastRefusalAt, lastRefusalReason }`. No new dependencies.
- **D-11:** Existing guard at `apps/api/src/streams/processors/stream.processor.ts:68-77` keeps its current `return` behavior (do not throw — preserves "no retry storm" guarantee from Phase 21.1 memory note). Add `streamGuardMetrics.recordRefusal(reason)` call before the `return`. Logging stays as-is (already correct).
- **D-12:** Expose `StreamGuardMetricsService.snapshot()` via the existing `/api/srs/callbacks/metrics` endpoint as a new top-level field `streamGuard` alongside the existing `archives` field. Reuse the same controller, no new route.
- **D-13:** Test coverage = unit + integration. **Unit:** mock `Job<StreamJobData>` with `cameraId: undefined`, `inputUrl: ''`; assert `process()` returns void without calling `ffmpegService.startStream`, and `streamGuardMetrics.snapshot().refusals === 1`. **Integration:** spawn real BullMQ queue + worker, enqueue a job with empty data, await completion, assert FFmpeg never spawned (no child process, no status transition) and metrics counter incremented. Closes the bug open since 2026-04-21.

### DEBT-03: SRS hls_use_fmp4 cold-boot fix
- **D-14:** Audit both `apps/api/src/settings/settings.service.ts` and `apps/api/src/cluster/templates/srs-origin.conf.ts` for any `hls_use_fmp4` directive. Current grep found no matches — verify by re-reading the SRS config emit path during planning. If implicit defaults (or commented references) emit anything that breaks SRS v6 cold-boot, remove unconditionally.
- **D-15:** Lock SRS to v6 (`ossrs/srs:6` Docker tag). No version-detection gating, no Settings UI toggle. Future v7 upgrade gets its own ticket.
- **D-16:** Keep `hls_fragment` and `hls_window` at current values (verified by tests in `tests/cluster/config-generation.test.ts`); only `hls_use_fmp4` is in scope.
- **D-17:** Phase 23 verification = unit test asserting the rendered SRS config string does not contain `hls_use_fmp4`. Phase 30 smoke test (clean VM cold boot) is the integration verification — not duplicated in Phase 23.

### DEBT-04: Recording playback page metadata
- **D-18:** Layout = **header zone above the player** in `apps/web/src/app/app/recordings/[id]/page.tsx` (and admin equivalent if applicable). Two elements:
  - **Tag badge row** — same Badge component / sizing / spacing as Phase 22 camera card (`Camera` listing). Inline-flex, gap-2.
  - **Description block** — line-clamped to 2-3 lines with "Show more" disclosure when overflowing. Same Tailwind utility used in Phase 22.
- **D-19:** Tags are **read-only badges** in v1.3. No clickable filtering, no link-to-cameras-filtered-by-tag. Hover tooltip showing full tag text is fine.
- **D-20:** Both `/app/recordings/[id]` and `/admin/recordings/[id]` paths get the metadata header. (Verify both pages exist during planning — admin variant may be separate file.)
- **D-21:** Data source = parent Camera record fetched alongside Recording. Add `tags: true, description: true` to existing Prisma include / API response payload. No new endpoint.

### CI gate (Success Criteria #5)
- **D-22:** Phase 23 creates `.github/workflows/test.yml`. Triggers: `push` (main), `pull_request`. Steps: checkout → setup pnpm 10 → setup node 22 → `pnpm install --frozen-lockfile` → `pnpm lint` (if root script exists; otherwise per-package) → `pnpm typecheck` (or `pnpm -r build` if no typecheck script) → spin up Postgres 16 service → `pnpm --filter @sms-platform/api test` → `pnpm --filter @sms-platform/api db:check-drift`.
- **D-23:** Phase 23 also enables GitHub branch protection on `main` requiring this `test` check to pass. User has admin and will run the `gh api` call (or click through Settings → Branches) — recorded as a manual verification step in PLAN, not automated.
- **D-24:** Phase 28 owns image build / release workflows (`build-images.yml`, `release.yml`). Phase 23 does **not** touch image build at all — only the test/quality gate.

### Claude's Discretion
- Exact layout pixel spacing for DEBT-04 (Tailwind utility selection within design system).
- Vitest test file names (e.g., `stream-guard-metrics.test.ts` vs `stream-processor-guard-metrics.test.ts`).
- The exact wording of refusal reason strings (`undefined_cameraId` is a starting point — planner can normalize to project enum convention).
- Exact GitHub Actions `services:` syntax for Postgres 16 (planner picks based on standard `actions/checkout@v4` + `services:` recipe).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + research (locked decisions)
- `.planning/REQUIREMENTS.md` §Tech Debt — DEBT-01..05 statements (lines 13-17, 120-124)
- `.planning/research/SUMMARY.md` — Phase 0 framing, locked decisions (Caddy/Prisma/runtime base), critical blockers list
- `.planning/research/ARCHITECTURE.md` — Why Phase 0 must precede Dockerfile work; migration baseline reasoning
- `.planning/research/PITFALLS.md` — Pitfalls 1, 2, 4, 14, 15, 16 (the ones Phase 23 closes)
- `.planning/research/STACK.md` — `node:22-bookworm-slim`, Prisma 6.19, Postgres 16 baseline
- `.planning/ROADMAP.md` §Phase 23 (lines 70-81) — Goal + Success Criteria #1-5

### Existing patterns to follow
- `apps/api/src/recordings/archive-metrics.service.ts` — Reference pattern for `StreamGuardMetricsService` (in-memory counter, `snapshot()`, status enum)
- `apps/api/src/streams/processors/stream.processor.ts:60-77` — Current StreamProcessor guard (DEBT-01 starting point)
- `apps/api/src/prisma/schema.prisma` — Single source of truth for the `0_init` migration target schema
- `apps/api/src/prisma/migrations/rls_apply_all/migration.sql` + `rls_phase02/migration.sql` + `rls_policies/migration.sql` — RLS SQL to consolidate into `0_init`
- `apps/api/package.json` — `scripts.db:push` (the script being replaced); existing `test`, `db:test:setup`
- `apps/api/tests/cluster/config-generation.test.ts` — Pattern for asserting rendered SRS config content
- `CLAUDE.md` §Prisma schema change workflow — 4-step rule (db push → build → restart → verify) — applies to dev workflow but Phase 23 itself REPLACES `db:push` with `db:reset`
- `apps/web/src/app/app/recordings/[id]/page.tsx` + `apps/web/src/app/app/recordings/[id]/components/recordings-list.tsx` — Recording playback page (DEBT-04 target)
- `apps/web/src/app/app/cameras/` — Phase 22 camera card layout reference (badge row + description line-clamp)

### SRS config emit paths (DEBT-03 audit targets)
- `apps/api/src/settings/settings.service.ts` (around line 127-180) — Settings-driven SRS config emission
- `apps/api/src/cluster/templates/srs-origin.conf.ts` (around line 13-50) — Cluster origin template
- `apps/api/src/recordings/recordings.service.ts:215, 579` — Existing comments noting v6 lacks fMP4

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ArchiveMetricsService` (recordings/) — clone-and-adapt template for `StreamGuardMetricsService`. Same DI pattern, same snapshot shape, same controller exposure pattern.
- `Logger` from `@nestjs/common` — already used inside StreamProcessor; no new logging dep needed.
- `Badge` component + line-clamp Tailwind utility — already shipped in Phase 22 for camera cards; reused for DEBT-04.
- Prisma `include` pattern — recordings already include parent Camera relation in some queries; just add `tags + description` selectors.

### Established Patterns
- **Metrics snapshot via REST:** Project pattern is in-memory counter + `/api/.../metrics` JSON endpoint, **not** Prometheus exporter. Stay consistent.
- **Optional DI guards:** StreamProcessor uses `@Optional() @Inject()` for Redis + Prisma to keep tests with positional construction working. Apply the same pattern when wiring `StreamGuardMetricsService` so existing test files (`stream-processor.test.ts`, `stream-processor-guard.test.ts`) keep building.
- **Idempotent SQL with `IF NOT EXISTS`:** All current RLS migrations are write-safe on already-applied DBs. Preserve this when squashing into `0_init` so re-running `migrate deploy` against a partially-baselined DB never errors.
- **Test layout:** `apps/api/tests/<area>/<file>.test.ts`. Integration tests gated by `describe.skipIf(!isRedisAvailable)` when Redis is required.
- **CLAUDE.md Prisma rule:** Schema → `db push` → `prisma generate` → rebuild → restart → verify metrics endpoint. Phase 23 changes the first link in this chain to `db reset` (full migrate apply); the rest of the rule still applies.

### Integration Points
- `/api/srs/callbacks/metrics` endpoint — extend response shape to add `streamGuard` block (alongside `archives`); no new route, same controller.
- `Recording` Prisma include path (recordings.service.ts) — append `camera: { select: { tags: true, description: true } }` to playback queries.
- Vitest setup (`apps/api/scripts/setup-test-db.sh`) — already wires test DB; no Phase 23 changes needed.
- GitHub Actions (`.github/workflows/`) — currently no test workflow; Phase 23 creates `test.yml`. Phase 28 will add `build-images.yml` + `release.yml` next to it.
- `next.config.ts` (web) — DEBT-04 only edits page.tsx + queries; no Next config changes.

</code_context>

<specifics>
## Specific Ideas

- DEBT-04 layout matches Phase 22 camera card: badge row inline-flex gap-2, description line-clamped 2-3 lines with disclosure. Read-only — no clickable tag filter in v1.3.
- `0_init` migration **must** end with the consolidated RLS SQL block; if Prisma's autogenerated SQL doesn't preserve order, append RLS as a manual edit before commit.
- `db:check-drift` exit code behavior: returns non-zero on drift → CI fails the test job → branch protection blocks merge. This is the entire enforcement chain — no other moving parts.
- StreamGuard refusal counts must be visible in the metrics JSON within 1s of refusal (in-memory; no Redis hop).
- `it.todo` count today = 121; if planner finds a different number when running, log it but do NOT treat the diff as drift — the spec is "leave todos alone, capture count in backlog".

</specifics>

<deferred>
## Deferred Ideas

- **Convert `it.todo` placeholders to real tests** — backlog item for v1.4+. Track count + areas (`tests/srs/srs-log-gateway.test.ts` is the largest cluster).
- **Coverage threshold gate** — defer until v1.4 once the `it.todo` backfill is underway. Adding it now would be noise.
- **Prometheus exporter** for stream guard + archive metrics — Phase 8 (deferred observability profile per research).
- **Production `migrate resolve` baselining** — only relevant once a real prod DB exists with the old (non-Prisma-tracked) schema. Currently no such DB; defer.
- **DEBT-04 clickable tag filter** linking recording playback → cameras filtered by tag — defer to a future "search & discovery" phase.
- **SRS v7 fMP4 upgrade path** — separate ticket; touches recording manifest service (`recordings.service.ts:579` already comments the upgrade plan).
- **Cosign keyless signing** — explicitly Phase 8 / v1.3.x deferral per research summary.

</deferred>

---

*Phase: 23-tech-debt-cleanup-phase-0-prerequisites*
*Context gathered: 2026-04-27*
