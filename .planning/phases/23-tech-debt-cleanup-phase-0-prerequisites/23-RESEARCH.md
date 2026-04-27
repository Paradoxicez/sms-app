# Phase 23: Tech Debt Cleanup + Phase 0 Prerequisites — Research

**Researched:** 2026-04-27
**Domain:** Prisma migration baseline + drift detection, BullMQ guard observability, NestJS module wiring, GitHub Actions CI gate, branch protection
**Confidence:** HIGH (CONTEXT.md locks all design choices; this file documents only mechanics)

> **Scope guard.** All five DEBT requirements have already been **decided** in 23-CONTEXT.md. This research file does not re-litigate any choice — its job is to surface the exact CLI flags, YAML shape, NestJS DI wiring, and code locations the planner needs to write tasks. Where CONTEXT is silent, this file makes a recommendation; where CONTEXT is explicit, this file copies the decision verbatim and adds verified mechanics underneath.

## Summary

Phase 23 is a pure **mechanics phase** — every architectural decision is locked. The five DEBT items split into three workstreams:

1. **Prisma migration baseline (DEBT-05)** — squash 8 hand-rolled SQL files into a single `0_init` Prisma migration, append RLS as a manual SQL block, switch dev workflow from `db:push` to `db:reset`, add `db:check-drift` as the new safety net. Mechanics verified: the Prisma 6.19 CLI uses `--to-schema-datamodel <path>` (NOT the newer `--to-schema` form some docs show); `--exit-code` returns 2 on drift / 0 on clean; `migrate diff` does **not** detect RLS policies or other "unsupported" schema features (triggers, views, custom functions).

2. **StreamGuard observability (DEBT-01)** — clone-and-adapt the `ArchiveMetricsService` shape into a new `StreamGuardMetricsService` under `apps/api/src/streams/`. Add `recordRefusal()` call to the existing `StreamProcessor.process()` guard at lines 72-76 (the guard already exists from quick task 260421-g9o; only the metric call + DI wiring is new). Extend the existing `/api/srs/callbacks/metrics` endpoint to include `streamGuard` alongside `archives` — same controller, no new route. Unit test extends the existing `stream-processor-guard.test.ts`; integration test follows the `profile-restart-active-job.integration.test.ts` real-Redis pattern with `describe.skipIf(!isRedisAvailable)`.

3. **CI gate + small fixups (DEBT-02, 03, 04)** — author `.github/workflows/test.yml` running on `ubuntu-latest` with `postgres:16` service, pnpm 10, Node 22; capture branch protection enable as a manual `gh api` step. DEBT-03 audit confirmed the codebase: **neither `settings.service.ts` nor `srs-origin.conf.ts` currently emits `hls_use_fmp4`** — Phase 23's job for DEBT-03 is therefore a regression-lock test (assert the rendered config does not contain that string), not a code edit. DEBT-04 is a precise 2-line `include` extension on `recordings.service.ts:512` plus a header re-render on `playback-page-header.tsx` reusing the existing `TagsCell` component from `apps/web/src/app/admin/cameras/components/tags-cell.tsx`.

**Primary recommendation:** Plan Phase 23 as **5 small parallel-eligible plans** (one per DEBT) plus **1 Wave-0 setup plan** (test infrastructure for the new metrics service). The DEBT items have low cross-coupling: 01 touches `streams/`, 03 touches a test file only, 04 touches `recordings/` + web, 05 touches `prisma/`, 02 touches `package.json` + new workflow file. CI gate (D-22, D-23) sequences last — it asserts everything else is green.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**DEBT-05: Migration baseline strategy**
- **D-01:** Squash all 8 hand-rolled SQL files into a single `0_init` Prisma migration. Generate the schema baseline with `prisma migrate diff --from-empty --to-schema-datamodel apps/api/src/prisma/schema.prisma --script`, then **append** the consolidated RLS policy SQL (idempotent `IF NOT EXISTS` blocks copied from `rls_apply_all/migration.sql` and `rls_phase02/migration.sql`) to the same `migration.sql`. Result: one reviewable file that produces v1.2-equivalent schema + RLS in one apply.
- **D-02:** Delete the 8 existing hand-rolled directories (`camera_push_fields/`, `camera_stream_url_unique/`, `drop_org_settings_dead_fields/`, `recording_segment_has_keyframe/`, `rls_apply_all/`, `rls_phase02/`, `rls_policies/`, `rls_superuser_bypass_positive_signal/`) after their content has been folded into `0_init`. Use a Prisma timestamped name (e.g., `20260427000000_init`).
- **D-03:** Replace the `db:push` script in `apps/api/package.json` with `db:reset` (runs `prisma migrate reset --force --skip-seed`) for dev DB recreation. Drop `db:push:skip-rls` entirely — no escape hatch needed.
- **D-04:** Add `db:check-drift` npm script: `prisma migrate diff --from-migrations apps/api/src/prisma/migrations --to-schema-datamodel apps/api/src/prisma/schema.prisma --exit-code`. Phase 23 runs once locally to confirm zero drift before commit; CI workflow (D-13 below) runs it on every push.
- **D-05:** No production `migrate resolve` baseline needed — v1.3 has no live prod DB yet. Dev databases get dropped + reset.

**DEBT-02: Test triage philosophy**
- **D-06:** Leave 121 `it.todo` tests as-is. Actual state today: 108 passed, 11 skipped, 121 todo, 0 failures. (Verified during research: `grep -r "it\.todo"` count = 123, drift acceptable per D-29.)
- **D-07:** Track 121 todo placeholders as a backlog item — append a single entry to `.planning/todos/` (or roadmap backlog).
- **D-08:** No test code edits in DEBT-02. The 11 `describe.skipIf(!isRedisAvailable)` integration files stay as-is. (Verified: only 1 file currently uses this pattern — `tests/integration/profile-restart-active-job.integration.test.ts`.)
- **D-09:** No coverage threshold configured this phase.

**DEBT-01: StreamProcessor guard observability**
- **D-10:** Create `StreamGuardMetricsService` (apps/api/src/streams/) following the existing `ArchiveMetricsService` pattern.
- **D-11:** Existing guard at `apps/api/src/streams/processors/stream.processor.ts:68-77` keeps its current `return` behavior (do not throw). Add `streamGuardMetrics.recordRefusal(reason)` call before the `return`.
- **D-12:** Expose `StreamGuardMetricsService.snapshot()` via the existing `/api/srs/callbacks/metrics` endpoint as a new top-level field `streamGuard` alongside `archives`. Reuse the same controller.
- **D-13:** Test coverage = unit + integration. Unit: mock `Job<StreamJobData>` with `cameraId: undefined`, `inputUrl: ''`. Integration: spawn real BullMQ queue + worker, assert FFmpeg never spawned + metrics counter incremented.

**DEBT-03: SRS hls_use_fmp4 cold-boot fix**
- **D-14:** Audit both `apps/api/src/settings/settings.service.ts` and `apps/api/src/cluster/templates/srs-origin.conf.ts` for any `hls_use_fmp4` directive.
- **D-15:** Lock SRS to v6 (`ossrs/srs:6` Docker tag).
- **D-16:** Keep `hls_fragment` and `hls_window` at current values; only `hls_use_fmp4` is in scope.
- **D-17:** Phase 23 verification = unit test asserting the rendered SRS config string does not contain `hls_use_fmp4`. Phase 30 smoke test is the integration verification.

**DEBT-04: Recording playback page metadata**
- **D-18:** Layout = header zone above the player. Tag badge row (same `TagsCell` component / sizing as Phase 22 camera card) + description block (line-clamped 2-3 lines, `Show more` disclosure).
- **D-19:** Tags are read-only badges. No clickable filtering. Hover tooltip showing full tag text is fine.
- **D-20:** Both `/app/recordings/[id]` and `/admin/recordings/[id]` paths get the metadata header. (Verified during research: `apps/web/src/app/admin/recordings/page.tsx` exists but is the LIST page, NOT a per-recording detail. Only one playback page exists at `apps/web/src/app/app/recordings/[id]/page.tsx`. **Planner: confirm with user whether admin needs its own detail page or if the existing app one serves both roles.**)
- **D-21:** Data source = parent Camera record fetched alongside Recording. Add `tags: true, description: true` to existing Prisma `include` in `recordings.service.ts:512`.

**CI gate (Success Criteria #5)**
- **D-22:** Phase 23 creates `.github/workflows/test.yml`. Triggers: `push` (main), `pull_request`. Steps: checkout → setup pnpm 10 → setup node 22 → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` (or `pnpm -r build`) → spin up Postgres 16 service → `pnpm --filter @sms-platform/api test` → `pnpm --filter @sms-platform/api db:check-drift`.
- **D-23:** Phase 23 also enables GitHub branch protection on `main` requiring this `test` check to pass. Manual `gh api` step recorded in PLAN, not automated.
- **D-24:** Phase 28 owns image build / release workflows. Phase 23 does NOT touch image build at all.

### Claude's Discretion
- Exact layout pixel spacing for DEBT-04 (Tailwind utility selection within design system).
- Vitest test file names (e.g., `stream-guard-metrics.test.ts` vs `stream-processor-guard-metrics.test.ts`).
- The exact wording of refusal reason strings (`undefined_cameraId` is a starting point — planner can normalize to project enum convention).
- Exact GitHub Actions `services:` syntax for Postgres 16 (planner picks based on standard `actions/checkout@v4` + `services:` recipe).

### Deferred Ideas (OUT OF SCOPE)
- Convert `it.todo` placeholders to real tests — backlog item for v1.4+.
- Coverage threshold gate — defer until v1.4.
- Prometheus exporter for stream guard + archive metrics — Phase 8 (deferred observability profile).
- Production `migrate resolve` baselining — defer; no real prod DB yet.
- DEBT-04 clickable tag filter (recording → cameras filtered by tag) — defer to a future "search & discovery" phase.
- SRS v7 fMP4 upgrade path — separate ticket.
- Cosign keyless signing — Phase 8 / v1.3.x.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEBT-01 | StreamProcessor.process rejects undefined/empty `cameraId` job data with fast-fail logging + metric | Existing guard at `stream.processor.ts:72-76` keeps `return` behavior; add `recordRefusal()` call. Pattern from `archive-metrics.service.ts` (60 LOC, in-memory, snapshot). Module wiring follows `RecordingsModule` exports + `StreamsModule` providers. Tests extend `stream-processor-guard.test.ts` (verified pattern in repo) + new integration test mirroring `profile-restart-active-job.integration.test.ts`. |
| DEBT-02 | Triage all pre-existing API test failures (~23) — fix-now / skip-with-issue / delete; CI locks on red | Verified: `grep -c "it\.todo"` = 123 across api tests; `describe.skipIf` count = 1 file. Vitest 2.1.x (per package.json `"vitest": "2"`). No code edits — only the CI workflow (D-22) provides the regression gate. |
| DEBT-03 | SRS config template stops emitting `hls_use_fmp4` directive on cold boot | Audit confirmed during research: **NEITHER** `settings.service.ts` (lines 138-218) **NOR** `cluster/templates/srs-origin.conf.ts` (lines 10-83) currently emits `hls_use_fmp4`. The directive was already removed (or never reached emit code). Phase 23's task is therefore a **regression-lock test** in `tests/cluster/config-generation.test.ts` + a parallel test for `settings.service.ts` (none currently exists). |
| DEBT-04 | Recording playback page surfaces parent camera tags + description | `recordings.service.ts:508-526` has the include path; needs `tags: true, description: true` added to the `camera.select` block. `apps/web/src/hooks/use-recordings.ts:18` `RecordingCameraInclude` type extension. `playback-page-header.tsx` accepts new props (tags, description) and renders `TagsCell` + line-clamp block. Reuse `apps/web/src/app/admin/cameras/components/tags-cell.tsx` (already does badge row + overflow tooltip for read-only display). |
| DEBT-05 | Hand-rolled SQL files converted to Prisma migration history; `prisma migrate deploy` against fresh DB produces v1.2-equivalent schema | Mechanics: `prisma migrate diff --from-empty --to-schema-datamodel <path> --script` (verified Prisma 6.19 CLI — flag is `--to-schema-datamodel`, not the newer `--to-schema`); append the 4 RLS files (`rls_apply_all`, `rls_phase02`, `rls_policies`, `rls_superuser_bypass_positive_signal`) verbatim with their `IF NOT EXISTS` guards intact; **delete** old directories AFTER folding. `migrate diff` does NOT detect RLS — drift script will only catch schema-level drift, RLS divergence still requires manual review. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

The following project-canon directives apply to Phase 23 work and MUST be respected:

| Directive | Source | Applies To Phase 23 |
|-----------|--------|---------------------|
| **GSD Workflow Enforcement** — Use `/gsd-execute-phase` for all planned phase work; no direct repo edits outside GSD | CLAUDE.md §"GSD Workflow Enforcement" | All Phase 23 plans |
| **Prisma schema change workflow** (4-step rule: edit → `db:push` → build → restart → verify) | CLAUDE.md §"Conventions" | DEBT-05 **REPLACES** the first link with `db:reset`; the rest of the rule (build, restart, verify metrics endpoint) still applies. The CLAUDE.md doc itself must be updated in DEBT-05's plan to reflect the new dev command. |
| **Verify subagent writes** — grep claimed files before relaying success | Memory `feedback_verify_subagent_writes` | All Phase 23 verification steps must `git diff --stat` and `cat` post-write |
| **English-only UI copy default** | Memory `feedback_language_english_default` | DEBT-04 header strings (e.g., "About this camera", "Show more") stay English only |
| **API docs static templates** | Memory `feedback_api_docs_static_templates` | N/A this phase (no API docs touched) |
| **SaaS role architecture** — admin vs tenant portal split | Memory `saas_role_architecture` | DEBT-04 D-20 ambiguity flagged: confirm whether admin needs its own playback page |

## Standard Stack

> Phase 23 introduces no new runtime dependencies. The "stack" here is the test/CI tooling Phase 23 wires up.

### Core (already in repo, locked by v1.3 research)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | **6.19.3** | Schema + migration runner (DEBT-05) | [VERIFIED: apps/api/package.json:33,46] Locked by v1.3 STACK.md. CLI flag verified: `--to-schema-datamodel`. (npm latest is 7.8.0 — DO NOT bump in Phase 23, that is a Phase 25+ concern.) |
| @prisma/client | **6.19.3** | Runtime ORM | [VERIFIED: package.json:33] Must match Prisma CLI version exactly (CLAUDE.md observability rule). |
| Vitest | **2.x** (resolves 2.1.x at install) | Test runner (DEBT-01, 02, 03, 04) | [VERIFIED: package.json:73] No upgrade in Phase 23 — adding the CI gate locks the current minor. |
| BullMQ | **5.73.2** | Real-Redis integration test for DEBT-01 | [VERIFIED: package.json:36] Pattern from `tests/integration/profile-restart-active-job.integration.test.ts`. |
| ioredis | **5.10.1** | Redis client for integration test | [VERIFIED: package.json:40] |
| @nestjs/common, @nestjs/bullmq | 11.x | DI + BullMQ Nest integration | [VERIFIED: package.json:23,22] |

### Supporting (CI infrastructure introduced by Phase 23)

| Library / Action | Version | Purpose | When to Use |
|---|---|---|---|
| `actions/checkout@v4` | v4 | Git checkout in GH Actions | [VERIFIED: GitHub Docs] Standard. |
| `actions/setup-node@v4` | v4 with `cache: pnpm` + `node-version: 22` | Node 22 + pnpm-store cache | [VERIFIED: pnpm.io/continuous-integration] **Must run AFTER `pnpm/action-setup`** so `cache: pnpm` resolves. |
| `pnpm/action-setup@v6` | v6 with `version: 10` | pnpm 10 binary | [VERIFIED: github.com/pnpm/action-setup] D-22 specifies pnpm 10. |
| `postgres:16` (Docker image) | 16 | GH Actions service container for DB tests | [VERIFIED: Docker Hub `postgres:16`] Matches v1.3 prod target (STACK.md). |
| `gh api` (GitHub CLI) | bundled | Branch protection enable (D-23) | [VERIFIED: docs.github.com/en/rest/branches/branch-protection] PUT `/repos/{owner}/{repo}/branches/main/protection`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Append RLS to `0_init/migration.sql` | Two files (`0_init`, `1_rls`) | Two-file form is "more Prisma-native" but breaks the "single reviewable squash" goal in D-01. Stick with append. |
| `actions/setup-node@v4` cache | `actions/cache@v4` directly | setup-node's built-in pnpm cache is the documented current best — fewer moving parts. |
| `gh api` PUT for branch protection | UI clicks in Settings → Branches | UI is fine and CONTEXT D-23 already records it as "manual verification step". `gh api` documented as a fallback. |
| Mock BullMQ for integration test | Real Redis (chosen) | Mocks already cover DEBT-01 unit path; integration's value is real-Redis end-to-end (per `profile-restart-active-job.integration.test.ts` precedent). |
| Bump Prisma CLI to 7.x in Phase 23 | Stay on 6.19.3 | Bump is breaking (config moves to `prisma.config.ts`, deprecation warning currently emitted) — out of Phase 23 scope. |

**Installation:** No new packages. Phase 23 only edits `apps/api/package.json` scripts (D-03, D-04) and creates `.github/workflows/test.yml`.

**Version verification (2026-04-27):**
```bash
pnpm --filter @sms-platform/api exec prisma --version  # → 6.19.3 [VERIFIED locally]
node -v                                                 # → v22.11.0 [VERIFIED locally]
pnpm -v                                                 # → 9.9.0  [VERIFIED locally; CI pins 10]
```

## Architecture Patterns

### Recommended File Layout (changes Phase 23 introduces)

```
apps/api/
├── src/
│   ├── streams/
│   │   ├── stream-guard-metrics.service.ts        # NEW (DEBT-01)
│   │   ├── streams.module.ts                      # EDIT — add provider + export
│   │   └── processors/stream.processor.ts         # EDIT lines 72-76 — recordRefusal call
│   ├── srs/
│   │   └── srs-callback.controller.ts             # EDIT line 60-63 — add streamGuard field
│   ├── recordings/
│   │   └── recordings.service.ts                  # EDIT line 512-524 — include tags+description
│   └── prisma/
│       └── migrations/
│           └── 20260427000000_init/
│               └── migration.sql                  # NEW — squashed baseline + RLS
│           # DELETED: camera_push_fields/, camera_stream_url_unique/,
#                     drop_org_settings_dead_fields/, recording_segment_has_keyframe/,
#                     rls_apply_all/, rls_phase02/, rls_policies/,
#                     rls_superuser_bypass_positive_signal/
├── package.json                                   # EDIT — db:push → db:reset, +db:check-drift
├── scripts/setup-test-db.sh                       # EDIT — switch to migrate deploy from raw SQL
└── tests/
    ├── streams/stream-guard-metrics.test.ts       # NEW (unit)
    ├── streams/stream-processor-guard.test.ts     # EDIT — assert recordRefusal called
    ├── integration/stream-guard.integration.test.ts # NEW (real-Redis BullMQ end-to-end)
    ├── cluster/config-generation.test.ts          # EDIT — add hls_use_fmp4 negative assertion
    ├── settings/srs-config.test.ts                # NEW — settings.service render assertion
    └── recordings/get-recording.test.ts           # EDIT — assert tags+description included

apps/web/
├── src/
│   ├── hooks/use-recordings.ts                    # EDIT — extend RecordingCameraInclude type
│   └── app/app/recordings/[id]/
│       ├── page.tsx                               # EDIT — pass tags/description to header
│       └── components/playback-page-header.tsx    # EDIT — render TagsCell + description block

.github/workflows/test.yml                          # NEW (D-22)
.planning/todos/v1.4-test-backfill.md              # NEW (D-07 backlog entry)
CLAUDE.md                                           # EDIT — Prisma workflow first link db:push → db:reset
```

### Pattern 1: Metrics Service (clone-and-adapt from ArchiveMetricsService)

**What:** A no-deps `@Injectable()` that owns in-memory counters + a `snapshot()` method returning a typed object including a `status` enum (`idle | healthy | degraded | failing`).
**When to use:** Any time the project needs a fail-fast / fail-rate signal exposed via JSON HTTP — without pulling in Prometheus.
**Reference (verified in repo):** `apps/api/src/recordings/archive-metrics.service.ts` (60 LOC).

**Adapted shape for `StreamGuardMetricsService`:**

```typescript
// Source: apps/api/src/recordings/archive-metrics.service.ts (clone target)
import { Injectable, Logger } from '@nestjs/common';

export type StreamGuardRefusalReason = 'undefined_cameraId' | 'empty_inputUrl';

interface StreamGuardMetricsSnapshot {
  refusals: number;
  byReason: Record<StreamGuardRefusalReason, number>;
  lastRefusalAt: string | null;
  lastRefusalReason: StreamGuardRefusalReason | null;
  status: 'idle' | 'healthy' | 'degraded' | 'failing';
}

@Injectable()
export class StreamGuardMetricsService {
  private readonly logger = new Logger(StreamGuardMetricsService.name);
  private refusals = 0;
  private byReason: Record<StreamGuardRefusalReason, number> = {
    undefined_cameraId: 0,
    empty_inputUrl: 0,
  };
  private lastRefusalAt: Date | null = null;
  private lastRefusalReason: StreamGuardRefusalReason | null = null;

  recordRefusal(reason: StreamGuardRefusalReason): void {
    this.refusals += 1;
    this.byReason[reason] += 1;
    this.lastRefusalAt = new Date();
    this.lastRefusalReason = reason;
    if (this.refusals === 1 || this.refusals % 10 === 0) {
      this.logger.warn(
        `StreamGuard refusals: ${this.refusals} total. Latest reason: ${reason}`,
      );
    }
  }

  snapshot(): StreamGuardMetricsSnapshot {
    let status: StreamGuardMetricsSnapshot['status'];
    if (this.refusals === 0) status = 'idle';
    else if (this.refusals < 5) status = 'degraded';      // 1-4 refusals
    else status = 'failing';                               // 5+ refusals — alert
    // 'healthy' state intentionally unreachable: any refusal is degradation.
    // Status enum kept for parity with ArchiveMetricsService's shape so the
    // two metrics blocks render identically in operator tooling.

    return {
      refusals: this.refusals,
      byReason: { ...this.byReason },
      lastRefusalAt: this.lastRefusalAt?.toISOString() ?? null,
      lastRefusalReason: this.lastRefusalReason,
      status,
    };
  }
}
```

**Status thresholds (planner discretion):** ArchiveMetrics uses `failureRate` because it has `successes` to divide by — StreamGuard does not (no "successful refusal"). Above is a reasonable adaptation; planner may choose simpler `idle | failing` if status is not consumed by alerting. Document the choice in the plan.

### Pattern 2: NestJS Module Wiring (provider + export)

**What:** Match the `ArchiveMetricsService` ↔ `RecordingsModule` ↔ `SrsCallbackController` topology.

| Decision | Recommendation | Why |
|---|---|---|
| Where does `StreamGuardMetricsService` live? | `StreamsModule` (apps/api/src/streams/streams.module.ts) | Service belongs to the streams domain — same ownership as the processor that calls it. Symmetric to `ArchiveMetricsService` living under `recordings/`. |
| How does `SrsCallbackController` get a reference? | `StreamsModule` adds the service to `exports`. `SrsModule` already imports `StreamsModule` indirectly via forwardRef chain. Confirm by reading `apps/api/src/srs/srs.module.ts` during planning. | Avoids a circular dep introduction. |
| Should the controller inject it `@Optional()`? | **YES.** Mirror `archiveMetrics?: ArchiveMetricsService` at `srs-callback.controller.ts:49`. | Keeps existing positional-construction unit tests building. CLAUDE.md memory `verify_subagent_writes` warns about silent test breakage. |
| Should StreamProcessor inject it `@Optional()`? | **YES.** | `stream-processor-guard.test.ts` constructs `new StreamProcessor(ffmpeg, status)` positionally — adding a non-optional 5th constructor param breaks all 4 existing test files. |

**Wiring delta in StreamProcessor constructor:**

```typescript
// Source: apps/api/src/streams/processors/stream.processor.ts:46-58 (current)
// EDIT: add @Optional() injected metrics, reference from guard
constructor(
  private readonly ffmpegService: FfmpegService,
  private readonly statusService: StatusService,
  @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  @Optional() private readonly systemPrisma?: SystemPrismaService,
  @Optional() private readonly streamGuardMetrics?: StreamGuardMetricsService, // NEW
) {
  super();
}

// In process() at line 72-77:
if (!cameraId || !inputUrl) {
  const reason = !cameraId ? 'undefined_cameraId' : 'empty_inputUrl';
  this.streamGuardMetrics?.recordRefusal(reason);  // NEW — guarded with ?.
  this.logger.error(/* existing message */);
  return;
}
```

### Pattern 3: Prisma Migration Squash (DEBT-05)

**Generation:**

```bash
# Step 1 — Generate the bare schema-baseline SQL (no RLS).
mkdir -p apps/api/src/prisma/migrations/20260427000000_init
pnpm --filter @sms-platform/api exec prisma migrate diff \
  --from-empty \
  --to-schema-datamodel apps/api/src/prisma/schema.prisma \
  --script \
  > apps/api/src/prisma/migrations/20260427000000_init/migration.sql

# Step 2 — APPEND the 4 hand-rolled non-RLS additions that already exist as DDL/DML.
# (camera_push_fields ingestMode='pull' UPDATE is data-only — its target column
#  is now in schema.prisma so step 1 emits the column. The UPDATE is still needed
#  to seed the default for any pre-baseline rows; on a fresh DB it is a no-op.)
cat \
  apps/api/src/prisma/migrations/camera_stream_url_unique/migration.sql \
  apps/api/src/prisma/migrations/camera_push_fields/migration.sql \
  apps/api/src/prisma/migrations/recording_segment_has_keyframe/migration.sql \
  apps/api/src/prisma/migrations/drop_org_settings_dead_fields/migration.sql \
  >> apps/api/src/prisma/migrations/20260427000000_init/migration.sql

# Step 3 — APPEND RLS in canonical order (rls_policies first sets up role+grants;
# rls_apply_all + rls_phase02 add policies; rls_superuser_bypass_positive_signal
# replaces older bypasses with the positive-signal version per setup-test-db.sh).
cat \
  apps/api/src/prisma/migrations/rls_policies/migration.sql \
  apps/api/src/prisma/migrations/rls_phase02/migration.sql \
  apps/api/src/prisma/migrations/rls_apply_all/migration.sql \
  apps/api/src/prisma/migrations/rls_superuser_bypass_positive_signal/migration.sql \
  >> apps/api/src/prisma/migrations/20260427000000_init/migration.sql

# Step 4 — Sanity check on a throwaway DB (use a temp DB, NOT the dev DB).
createdb sms_phase23_drift_check
DATABASE_URL="postgresql://localhost/sms_phase23_drift_check" \
  pnpm --filter @sms-platform/api exec prisma migrate deploy
DATABASE_URL="postgresql://localhost/sms_phase23_drift_check" \
  pnpm --filter @sms-platform/api exec prisma migrate diff \
    --from-migrations apps/api/src/prisma/migrations \
    --to-schema-datamodel apps/api/src/prisma/schema.prisma \
    --exit-code
# Expect: exit 0 (no drift). Then dropdb sms_phase23_drift_check.

# Step 5 — Delete old migration directories (D-02).
rm -rf apps/api/src/prisma/migrations/{camera_push_fields,camera_stream_url_unique,drop_org_settings_dead_fields,recording_segment_has_keyframe,rls_apply_all,rls_phase02,rls_policies,rls_superuser_bypass_positive_signal}
```

**Critical:** `rls.policies.sql` (the file at `apps/api/src/prisma/rls.policies.sql`, NOT under `migrations/`) is referenced by `setup-test-db.sh:90`. It is the SAME content as `rls_policies/migration.sql` and creates the `app_user` role + grants. **Phase 23 must decide:** keep `rls.policies.sql` as the standalone RLS file OR fold its content into `0_init` and update `setup-test-db.sh` to stop referencing it. Recommendation: fold into `0_init` so `migrate deploy` is the single source of truth (matches D-01's "one reviewable file" goal); update setup-test-db.sh accordingly.

**Drift detection script:**

```json
// apps/api/package.json scripts (final shape after D-03 + D-04)
{
  "db:reset": "prisma migrate reset --force --skip-seed",
  "db:check-drift": "prisma migrate diff --from-migrations src/prisma/migrations --to-schema-datamodel src/prisma/schema.prisma --exit-code"
}
```

`db:check-drift` exit codes (verified Prisma 6.19 CLI):
- **0** — schema.prisma matches the migration history (no drift)
- **1** — error (e.g., shadow DB inaccessible)
- **2** — drift detected (changes present)

CI workflow: treat exit `1` and `2` both as failures. The naive `&&` chain in CI will work (any non-zero fails the step).

### Pattern 4: Test Workflow Skeleton (DEBT-02 / D-22)

```yaml
# .github/workflows/test.yml — full file
name: Test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: sms_platform_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/sms_platform_test
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/sms_platform_test
      DATABASE_URL_MIGRATE: postgresql://postgres:postgres@localhost:5432/sms_platform_test
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v6
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm -r lint || echo "no lint script in some packages — proceeding"
        # NOTE: Confirm during planning whether root pnpm lint exists.

      - name: Build (typecheck via SWC)
        run: pnpm -r build

      - name: Run API tests
        run: pnpm --filter @sms-platform/api test

      - name: Check schema drift
        run: pnpm --filter @sms-platform/api db:check-drift

  # NOTE: Web app tests run as a separate matrix entry OR as a sibling job.
  # If apps/web has tests today, add a "web-test" job; otherwise omit.
```

**Caveats verified during research:**

1. **pnpm/action-setup@v6 vs @v4** — both support `version: 10`. v6 is the latest stable as of 2026-04. Either works; pick v6.
2. **setup-node MUST come AFTER pnpm/action-setup** when using `cache: pnpm` (pnpm.io/continuous-integration explicit guidance).
3. **`pnpm install --frozen-lockfile`** — this is the documented CI flag. Do NOT use `pnpm install --frozen-lockfile=true` (older syntax).
4. **`pnpm -r build` for typecheck** — there is NO `pnpm typecheck` in the root scripts today (verified). The api package's `prebuild: prisma generate` + `build: nest build` runs SWC type emission as a side-effect; this is the de-facto typecheck. If the planner wants explicit `tsc --noEmit`, add a `typecheck` script to each package as part of the plan.
5. **Postgres service container env vars** — Docker `postgres:16` will create the `POSTGRES_DB` automatically; no explicit `CREATE DATABASE` needed. But `setup-test-db.sh` does its own DB-existence check (line 39-41), which is idempotent and safe.

### Pattern 5: Recording Playback Header (DEBT-04)

**Backend payload extension** (recordings.service.ts:512):

```typescript
// Source: apps/api/src/recordings/recordings.service.ts:508-526 (current)
const recording = await this.tenantPrisma.recording.findFirst({
  where: { id, orgId },
  include: {
    _count: { select: { segments: true } },
    camera: {
      select: {
        id: true,
        name: true,
        tags: true,           // NEW — D-21
        description: true,    // NEW — D-21
        site: {
          select: {
            id: true,
            name: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    },
  },
});
```

**Type extension** (apps/web/src/hooks/use-recordings.ts:18):

```typescript
export interface RecordingCameraInclude {
  id: string;
  name: string;
  tags: string[];                    // NEW
  description: string | null;        // NEW
  site: {
    id: string;
    name: string;
    project: { id: string; name: string };
  };
}
```

**Header render** — extend `playback-page-header.tsx` props interface and add a new render block above the camera-name h1:

```tsx
// Reuse existing TagsCell for read-only badge row (D-19).
import { TagsCell } from '@/app/admin/cameras/components/tags-cell';

// In PlaybackPageHeaderProps:
tags?: string[];
description?: string | null;

// In the JSX, ABOVE the existing flex flex-col block:
{(tags?.length || description) && (
  <div className="space-y-2 pb-2 border-b">
    {tags && tags.length > 0 && (
      <TagsCell tags={tags} maxVisible={4} />
    )}
    {description && (
      <p className="text-sm text-muted-foreground line-clamp-2">
        {description}
      </p>
    )}
  </div>
)}
```

**Show more disclosure** — Phase 22 popup (`apps/web/src/components/map/camera-popup.tsx:251-275`) already has this pattern: useState toggle, `>100 chars` heuristic, `Show more / Show less` button. Planner can lift that exact disclosure to a small reusable component **OR** inline it on the playback header. Inline is faster (5 LOC) and matches CONTEXT D-18's "line-clamped 2-3 lines with disclosure when overflowing".

### Anti-Patterns to Avoid

- **Throwing in StreamProcessor guard.** D-11 explicit: keep `return`. Throwing triggers BullMQ retry → silent loop on a malformed job → exactly the bug Phase 21.1 closed.
- **New REST endpoint for streamGuard metrics.** D-12 explicit: extend the existing `getMetrics()` response. Adding a new route doubles the surface and breaks the operator monitoring assumption.
- **Generating `0_init` from a "shadow database url" the planner forgot to set.** `migrate diff --from-migrations` requires a shadow DB only when comparing migrations-against-schema. `--from-empty --to-schema-datamodel` does NOT require a shadow DB. Use the `--from-empty` form for generation; use `--from-migrations` only for the drift check (which DOES need shadow DB or the live DB to be accessible).
- **Renaming the migration directory after committing.** Prisma's `_prisma_migrations` table records the directory name. Once any DB has applied `20260427000000_init`, the directory CANNOT be renamed without a `migrate resolve --rolled-back` dance. Phase 23 ships once with this name and lives with it.
- **Bumping Prisma to 7.x as a "free win".** 7.x removes `--skip-seed`, requires `prisma.config.ts` (deprecation warning visible today), and is breaking. Out of Phase 23 scope.
- **Adding clickable tag filtering to DEBT-04.** Explicitly deferred (D-19 + Deferred Ideas).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema → SQL conversion | Manual `CREATE TABLE` writing | `prisma migrate diff --from-empty --to-schema-datamodel` | Hand-written DDL drifts from schema.prisma the moment a field is added; diff regenerates deterministically. |
| In-memory metrics counter | Custom singleton with timers | Clone `ArchiveMetricsService` shape | Existing pattern is 60 LOC, tested, already exposed via the same controller. Diverging risks two different status enums in the metrics JSON. |
| Tag badge row UI | New `<Badge>` array component | Reuse `TagsCell` from `apps/web/src/app/admin/cameras/components/tags-cell.tsx` | Phase 22 D-15 forbids per-tag color; TagsCell already enforces neutral styling, alphabetic sort, +N overflow tooltip. |
| Description line-clamp + Show more | Custom hook | Lift the disclosure pattern from `camera-popup.tsx:251-275` (Phase 22 Plan 10) | Already in the codebase, already accessibility-tested. Inline copy is OK; reuse via prop is better if 3+ surfaces want it. |
| Real-Redis BullMQ test harness | New mock framework | Mirror `tests/integration/profile-restart-active-job.integration.test.ts` (`describe.skipIf(!isRedisAvailable)` + synchronous `bash /dev/tcp` probe) | The skip pattern is the project's chosen idiom — vitest evaluates `describe.skipIf` at module-load, so Redis detection MUST be synchronous. |
| Branch protection wire-up | Custom GitHub App | `gh api -X PUT /repos/<owner>/<repo>/branches/main/protection --input -` with minimum JSON body | One CLI call. CONTEXT D-23 already records this as a manual operator step. |
| RLS drift detection | Custom DB schema diff tool | None — accept that `migrate diff` can't see RLS. Add a manual periodic `psql -c "SELECT * FROM pg_policies"` dump + git-diff comparison **OR** rely on `tests/tenancy/rls-isolation.test.ts` to catch policy regressions at runtime. | Prisma docs explicit: "two databases differ only in unsupported features [views, triggers, RLS] → migrate diff will not show any difference." Drift script catches schema drift only. |

**Key insight:** Phase 23 is hostile to invention. Every primitive needed already exists in the repo (ArchiveMetricsService, TagsCell, the integration test harness, the SRS config-generation test pattern). The plan should look like a series of small clones + 2-3-line edits, not new patterns.

## Runtime State Inventory

> Phase 23 includes DEBT-05 (migration squash) which is a structural rename/refactor of migration directories. It also drops the `db:push:skip-rls` script and changes the `db:push` command. Inventory below addresses what runtime state could break from this.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `_prisma_migrations` table on every dev DB that has run `db:push` will be **empty** (db push doesn't write to it). The new `0_init` migration will apply to a fresh DB cleanly via `migrate deploy`, but on existing dev DBs it would try to recreate tables that exist → error. | **D-05 already addresses this:** dev DBs get dropped + reset (`db:reset` = `prisma migrate reset --force`). Plan must include a one-liner step in CLAUDE.md / README telling devs "if your dev DB was created via the old `db:push` flow, run `pnpm --filter @sms-platform/api db:reset` once after pulling Phase 23". |
| Stored data | The 4 RLS files contain **`IF NOT EXISTS`** guards on every `CREATE POLICY`. Re-running them via `0_init` against an already-RLS-applied DB is a no-op. **VERIFIED** by reading `rls_apply_all/migration.sql:9-19`. | None — guards already idempotent. Preserve them in the squash. |
| Stored data | `apps/api/src/prisma/rls.policies.sql` (109 LOC, NOT under `migrations/`) is referenced by `setup-test-db.sh:90`. It defines the `app_user` role + grants. | Plan must either (a) fold into `0_init` and update `setup-test-db.sh` to stop sourcing it, OR (b) keep it standalone and document its role. Recommendation (a) — single source of truth. |
| Live service config | None — Phase 23 does not touch n8n, Datadog, Tailscale, or any external service config. | None. |
| OS-registered state | None — Phase 23 does not touch Windows Task Scheduler, pm2, launchd, or systemd. The Vitest test DB (`sms_platform_test`) is created on demand by `setup-test-db.sh`; nothing else is OS-registered. | None. |
| Secrets / env vars | `DATABASE_URL_MIGRATE` env var is currently used by the `db:push` chain (apps/api/package.json:18). After D-03 the script changes — verify whether `db:reset` also needs `DATABASE_URL_MIGRATE` or just `DATABASE_URL`. **Verified:** `prisma migrate reset` uses the schema's datasource URL (= `DATABASE_URL`). | Plan: confirm by running `db:reset` once locally; update `.env.example` documentation if `DATABASE_URL_MIGRATE` becomes unused. |
| Secrets / env vars | CI workflow needs `TEST_DATABASE_URL` + `DATABASE_URL` in the job env block (see Pattern 4 above). No GitHub Actions secret needed since the Postgres service runs on the runner. | None — handled in workflow YAML. |
| Build artifacts | `node_modules/.prisma/client` (generated Prisma client) is regenerated by `pnpm install` postinstall hook (package.json:16) and by `prebuild: prisma generate` (package.json:7). | None — auto-handled. |
| Build artifacts | Stale `dist/` from before the schema change. CLAUDE.md "Prisma schema change workflow" rule applies: dev must `pnpm --filter @sms-platform/api build` after `db:reset`. | Document in CLAUDE.md edit (replace step 1 of the rule, keep steps 2-4). |

**Nothing found in Live Service Config, OS-registered state — verified by reading project memory + CLAUDE.md.**

## Common Pitfalls

### Pitfall 1: `migrate diff --from-migrations` requires a shadow database

**What goes wrong:** Running `db:check-drift` on a developer machine without shadow DB credentials emits an error like "Could not connect to shadow database" — which `--exit-code` reports as exit 1 (error), indistinguishable from drift to a CI step that only checks `if [ $? -ne 0 ]`.
**Why it happens:** `migrate diff --from-migrations` needs to actually apply the migrations to a real Postgres to see the resulting schema; it can't compute symbolically.
**How to avoid:**
1. Document in `apps/api/package.json` script comment: `db:check-drift` requires `DATABASE_URL` to point at a Postgres instance with permission to create+drop databases (Prisma will create a `_shadow_*` DB temporarily).
2. CI job already has Postgres available (Pattern 4 above) — works out of the box.
3. Optional: pass `--shadow-database-url <url>` explicitly in CI to be deterministic.
**Warning signs:** `db:check-drift` exits 1 with a connection error; CI logs show "shadow database" in stderr.

### Pitfall 2: RLS divergence undetected by drift script

**What goes wrong:** A future hand-edit to `rls.policies.sql` (or a new RLS file) is not picked up by `migrate diff` because Prisma can't see RLS.
**Why it happens:** Prisma docs explicit — "the migrate diff command can only compare database features that are supported by Prisma. If two databases differ only in unsupported features, such as views or triggers, then migrate diff will not show any difference between them." RLS is in the same bucket.
**How to avoid:**
1. Folding `rls.policies.sql` into `0_init` (recommended) means future RLS changes MUST go through a new migration directory — surfaced in code review.
2. Add a sentinel comment to `0_init/migration.sql`: `-- RLS section locked. New RLS = new migration directory.`
3. Existing `tests/tenancy/rls-isolation.test.ts` is the runtime gate. Phase 23 doesn't add new tests here; it just preserves the existing coverage.
**Warning signs:** A multi-tenant data leak surfaces in a smoke test that the unit suite missed.

### Pitfall 3: Re-applying `0_init` to an existing dev DB fails on duplicate constraints

**What goes wrong:** A developer pulls Phase 23, runs `pnpm --filter @sms-platform/api db:reset` — but their dev DB already has every table (created via `db:push`), and the `_prisma_migrations` tracking table is empty. `migrate reset` will drop+recreate the database, so this is fine — UNLESS they run `migrate deploy` directly without reset.
**Why it happens:** `migrate deploy` won't drop existing tables; it just tries to apply pending migrations and fails on `relation "Camera" already exists`.
**How to avoid:**
1. The dev workflow rule changes from `db:push` to `db:reset` (D-03). `db:reset` = `migrate reset --force --skip-seed`, which drops and reapplies — safe.
2. NEVER tell devs to run `migrate deploy` against an old dev DB; always `db:reset`.
3. Document the one-time cutover in PHASE 23 PR description: "After pulling, run `db:reset` once. Your old dev DB will be dropped and recreated from the new `0_init`."
**Warning signs:** Dev sees `relation "X" already exists` after pulling; check whether they ran `db:reset` or `migrate deploy`.

### Pitfall 4: `setup-test-db.sh` not updated

**What goes wrong:** Phase 23 changes the source-of-truth for schema → migrations, but `setup-test-db.sh` still references `migrations/rls_apply_all/migration.sql` (line 91) and `rls_superuser_bypass_positive_signal/migration.sql` (line 92) — both deleted in D-02.
**Why it happens:** The 8 hand-rolled directories are referenced by name in the test setup script. Deleting them without updating the script breaks `pnpm test`.
**How to avoid:**
1. Plan must include an edit to `setup-test-db.sh`: replace the 3 explicit `psql ... -f` lines (90-92) with a single `prisma migrate deploy` call against the test DB URL. The new `0_init` contains everything the old chain applied.
2. Verify by running `pnpm --filter @sms-platform/api test` after changes.
**Warning signs:** Test suite fails on `psql: ... no such file or directory`; the file name in the error matches a deleted migration directory.

### Pitfall 5: GitHub Actions Postgres service container vs job-container mismatch

**What goes wrong:** When the workflow uses `runs-on: ubuntu-latest` (no `container:` key), the runner is the host and `services.postgres.ports: ["5432:5432"]` exposes Postgres at `localhost:5432`. But if a future maintainer adds `container: node:22` to the job, Postgres becomes reachable at hostname `postgres` not `localhost`, breaking `TEST_DATABASE_URL=...@localhost:5432`.
**Why it happens:** Docker network resolution differs between "job on host" vs "job in container" — GitHub docs explicit.
**How to avoid:**
1. Phase 23 workflow uses host-runner (no `container:`). Document in a YAML comment: `# DO NOT add container: — Postgres reachable at localhost only when job runs on host.`
2. If Phase 28's image-build workflow needs a container later, it can use a separate job, not this one.
**Warning signs:** Test suite errors with `connect ECONNREFUSED 127.0.0.1:5432` on CI but works locally.

### Pitfall 6: Branch protection blocks the PR that creates the workflow

**What goes wrong:** Phase 23 PR adds `.github/workflows/test.yml` and tries to enable branch protection in the same PR. But branch protection requires the named status check to have run at least once before it can be set as required — chicken-and-egg.
**Why it happens:** GitHub rejects `required_status_checks.contexts: ["test"]` if no PR has ever shown a `test` check status.
**How to avoid:**
1. **Two-step process** — recorded in PLAN, not automated:
   - Step A: Merge the workflow into main. Wait for at least one CI run (push to main or open a no-op PR).
   - Step B: Run the `gh api` PUT or click through Settings → Branches → Add rule.
2. Alternative: Configure the rule via Repository Rulesets (newer API) which allows specifying the check by name without prior history. Same `gh api` shape but POST `/repos/.../rulesets`.
**Warning signs:** `gh api` returns "Required status check 'test' is not present in the latest commit on the default branch."

### Pitfall 7: pnpm 9 lockfile incompatibility with pnpm 10

**What goes wrong:** Local devs are on pnpm 9.9.0 (verified). CI uses pnpm 10. If the `pnpm-lock.yaml` was generated by pnpm 9 and pnpm 10 has a stricter lockfile schema, `pnpm install --frozen-lockfile` fails on CI.
**Why it happens:** Lockfile format version bumps between pnpm major versions.
**How to avoid:**
1. Either: bump local devs to pnpm 10 BEFORE Phase 23 ships (add `engines.pnpm: ">=10"` to root package.json + `corepack` instructions to README).
2. Or: pin CI to pnpm 9 to match local. Decision belongs to the planner — but consistency is non-negotiable.
3. Verify by running `pnpm install --frozen-lockfile` locally with pnpm 10 (`corepack prepare pnpm@10 --activate`) before merging the workflow.
**Warning signs:** CI fails with `ERR_PNPM_LOCKFILE_BREAKING_CHANGE` on the install step.

## Code Examples

### Example 1: Drift detection script (verified Prisma 6.19 syntax)

```bash
# Source: pnpm --filter @sms-platform/api exec prisma migrate diff --help (run 2026-04-27)
# apps/api/package.json — db:check-drift script
prisma migrate diff \
  --from-migrations src/prisma/migrations \
  --to-schema-datamodel src/prisma/schema.prisma \
  --exit-code

# Exit codes: 0 = no drift, 1 = error, 2 = drift detected.
# CI treats 1 + 2 both as failure (any non-zero).
```

### Example 2: Branch protection enable via gh api

```bash
# Source: docs.github.com/en/rest/branches/branch-protection (verified 2026-04-27)
# After test.yml has run at least once on main:
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  /repos/<owner>/<repo>/branches/main/protection \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["test"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
EOF
```

The `"test"` string must match the **job name** in `.github/workflows/test.yml` (i.e., `jobs.test`). If the planner renames the job, update both locations.

### Example 3: BullMQ real-Redis integration test (clone target)

```typescript
// Source: apps/api/tests/integration/profile-restart-active-job.integration.test.ts (verified pattern)
// Adapted skeleton for stream-guard.integration.test.ts:
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { StreamProcessor } from '../../src/streams/processors/stream.processor';
import { StreamGuardMetricsService } from '../../src/streams/stream-guard-metrics.service';

function detectRedisSync(): boolean {
  try {
    execSync(
      `bash -c 'exec 3<>/dev/tcp/${process.env.REDIS_HOST || 'localhost'}/${process.env.REDIS_PORT || '6379'} && exec 3<&- && exec 3>&-' 2>/dev/null`,
      { timeout: 1_000, stdio: 'ignore' },
    );
    return true;
  } catch { return false; }
}
const isRedisAvailable = detectRedisSync();

describe.skipIf(!isRedisAvailable)('StreamGuard integration: empty job → metric incremented, no FFmpeg spawn', () => {
  // ... setup queue + worker pointing at the actual StreamProcessor with metrics injected
  // ... enqueue { cameraId: undefined, inputUrl: '' }
  // ... assert ffmpegService.startStream NOT called AND metrics.snapshot().refusals === 1
});
```

The `describe.skipIf(!isRedisAvailable)` MUST evaluate at module-load time (before any `beforeAll` async runs) — that is why detection uses synchronous `execSync` with a 1s timeout, exactly as the existing integration test does.

### Example 4: SRS config negative assertion (DEBT-03)

```typescript
// Source: apps/api/tests/cluster/config-generation.test.ts (existing pattern, extend)
// Add to the existing describe('Config Generation') block:
import { generateOriginSrsConfig } from '../../src/cluster/templates/srs-origin.conf';

describe('generateOriginSrsConfig — Phase 23 DEBT-03 cold-boot guard', () => {
  it('does NOT contain hls_use_fmp4 directive (SRS v6 cold-boot rejection)', () => {
    const cfg = generateOriginSrsConfig({
      hlsFragment: 2, hlsWindow: 10, hlsEncryption: false,
      rtmpPort: 1935, httpPort: 8080, apiPort: 1985,
    });
    expect(cfg).not.toContain('hls_use_fmp4');
  });
});

// Companion test for settings.service.ts (NEW file: tests/settings/srs-config.test.ts):
// Construct SettingsService with a mock tenantPrisma, call generateSrsConfig(...),
// assert the returned string does not contain 'hls_use_fmp4'.
```

## State of the Art

| Old Approach (this repo, today) | Current Approach (after Phase 23) | Why Changed |
|--------------|------------------|--------|
| `pnpm db:push` chains 4 raw `psql -f` calls + `prisma db push --accept-data-loss` (apps/api/package.json:18) | `pnpm db:reset` runs `prisma migrate reset --force --skip-seed` against the migration history | `db:push` cannot run on prod (no migration history); v1.3 ships pull-only deploy that uses `migrate deploy`. |
| 8 hand-rolled `migrations/<name>/migration.sql` files invoked by `db:push` | Single `0_init/migration.sql` produced by `prisma migrate diff --from-empty --to-schema-datamodel` + RLS appended | Prisma's standard layout enables `migrate deploy` on fresh prod DB; ARCHITECTURE.md flagged as Phase 0 blocker. |
| StreamProcessor guard logs but provides no observability signal | Guard emits a metric counter exposed via `/api/srs/callbacks/metrics → streamGuard` | Operator can see "the bug fired N times since boot" — closes the silent-stuck-camera bug open since 2026-04-21. |
| No CI gate; tests run "when remembered" | `.github/workflows/test.yml` runs on every push + PR; branch protection blocks merge on red | Pull-only deploy assumes "tagged commits = green tests"; Phase 23 establishes that invariant before Phase 28 ships the image build. |
| Recording playback page shows only camera name + site/project | Adds tag badge row + line-clamped description above the player | Closes Phase 22 ↔ Phase 17 audit gap (PITFALLS Pitfall 16). |
| `hls_use_fmp4` was emitted historically in SRS config (per CLAUDE.md memory `project_srs_v6_limits`) | Both emit paths verified clean during research; Phase 23 adds regression-lock test | Prevents accidental re-introduction; SRS v6 cold-boot remains stable. |

**Deprecated/outdated (mentioned in canonical refs but no longer accurate):**
- "23 test failures" (REQUIREMENTS.md DEBT-02 wording) — actual state: 0 failures, 121 todo placeholders. Wording in REQUIREMENTS retained for traceability; CONTEXT D-06 captures the truth.
- `host.docker.internal` callback URLs in `settings.service.ts:188-205` — that's a Phase 26 concern (compose service DNS). Phase 23 leaves them alone.

## Assumptions Log

> Claims tagged `[ASSUMED]` need user confirmation before becoming locked decisions. None below block the planner — all are recoverable mid-implementation if wrong.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Status thresholds for `StreamGuardMetricsService` (`<5 = degraded`, `≥5 = failing`) are an `[ASSUMED]` adaptation. ArchiveMetricsService divides successes vs failures; StreamGuard has no "success" denominator. | Pattern 1 | If wrong, planner can simplify to `idle | failing` (any refusal = failing). Cosmetic only — affects metrics JSON shape, not behavior. |
| A2 | `apps/web/src/app/admin/recordings/page.tsx` is the **list** page, NOT a per-recording detail page. (CONTEXT D-20 says both `/app/recordings/[id]` and `/admin/recordings/[id]` paths get the metadata header — but only the former exists today.) | User Constraints D-20 | If admin needs its own detail page, that is a much larger plan than D-04 implies. **Planner: confirm with user during PLAN review.** |
| A3 | `rls.policies.sql` (109 LOC standalone file at `apps/api/src/prisma/rls.policies.sql`) should be folded into `0_init/migration.sql` and `setup-test-db.sh:90` updated. | Pattern 3 | If user wants to keep it standalone (so it remains greppable separately), the plan still works — just an extra `psql -f` step in `setup-test-db.sh` survives. |
| A4 | `pnpm 10` lockfile compatibility with the current pnpm 9 lockfile is unverified. Most pnpm major bumps preserve lockfile read compatibility, but Phase 23 ships untested if the dev team is still on 9. | Pitfall 7 | If incompatible, CI fails on `--frozen-lockfile`; recoverable by either bumping devs to 10 or pinning CI to 9. |
| A5 | The "test" job-name is the right `contexts` string for branch protection. (`jobs.test` in `test.yml` produces a check named `test`.) | Example 2 | If GitHub renders the check as `Test / test` (workflow / job), the contexts string must match exactly. Verifiable from the first workflow run's check listing in the PR. |
| A6 | `camera_push_fields/migration.sql` (the `UPDATE "Camera" SET "ingestMode" = 'pull' WHERE "ingestMode" IS NULL` data backfill) is safe to fold into `0_init` even though it's a DML statement. On a fresh DB it's a no-op (zero rows); on a re-applied DB it's idempotent (only NULL rows). | Pattern 3 | If wrong, planner moves the UPDATE to a separate `1_seed_ingestmode` migration. |

## Open Questions

1. **Admin recording playback page (D-20).**
   - What we know: `apps/web/src/app/app/recordings/[id]/page.tsx` exists; `apps/web/src/app/admin/recordings/page.tsx` is the list view, not a detail view.
   - What's unclear: Does admin need its own per-recording detail page in v1.3, or does admin link out to the tenant-side `/app/recordings/[id]`?
   - Recommendation: Surface in PLAN-CHECK; if no admin detail page exists, scope D-20 to the single tenant page only, and note as a Phase 17 gap (not a Phase 23 concern).

2. **`rls.policies.sql` fate.**
   - What we know: Referenced by `setup-test-db.sh:90`; defines `app_user` role + grants.
   - What's unclear: Is keeping it standalone (separately greppable) more valuable than folding it into `0_init`?
   - Recommendation: Fold (single source of truth). Update setup-test-db.sh to use `migrate deploy`. Document the role grant explicitly in `0_init/migration.sql` header comment.

3. **pnpm major version alignment.**
   - What we know: Local devs on 9.9.0; CONTEXT D-22 specifies pnpm 10 in CI.
   - What's unclear: Does the dev team want to standardize on pnpm 10 NOW (root package.json `engines.pnpm: ">=10"` + corepack instructions) or pin CI back to 9?
   - Recommendation: Standardize on 10 — pnpm 10.x is the current line, and Phase 24+ Dockerfile work (per STACK.md) already assumes pnpm 10.

4. **CLAUDE.md edit scope.**
   - What we know: CLAUDE.md "Conventions" section documents the `db:push → build → restart → verify` workflow.
   - What's unclear: Should the edit be a minimal swap (replace `db:push` with `db:reset`) or a fuller rewrite explaining the new migration history concept?
   - Recommendation: Minimal swap + a 2-line note: "DEBT-05 replaced db:push with db:reset; the migration history is the source of truth — schema changes require `prisma migrate dev --name <change>` not `db:push`." Phase 23 PR description carries the full rationale.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All Phase 23 work | ✓ | v22.11.0 | — |
| pnpm | All Phase 23 work | ✓ | 9.9.0 (CI uses 10) | A5 above |
| Postgres 16 | DEBT-05 test, db:check-drift, integration tests | Available locally + as GH Actions service | 16.x | None — required |
| Redis | DEBT-01 integration test | Available locally; CI uses none for now (skipIf pattern) | 7.x | `describe.skipIf` pattern — integration test silently skips on CI without Redis. Unit test still runs. |
| Prisma CLI | DEBT-05 generation + drift | ✓ via `pnpm exec prisma` | 6.19.3 | — |
| `gh` CLI | D-23 branch protection | ✓ (user has admin) | latest | UI fallback documented |
| `psql` | Optional drift sanity-check | ✓ on dev macOS via brew | — | `prisma migrate diff` is sufficient; `psql` is for ad-hoc inspection only |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Redis on CI — Phase 23 explicitly does NOT add a Redis service to `test.yml` because the integration test uses `describe.skipIf(!isRedisAvailable)`. If Phase 23 wanted to enforce the integration test, planner would add `services.redis: image: redis:7` to the workflow.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x ([VERIFIED: apps/api/package.json:73] resolves 2.1.x at install) |
| Config file | `apps/api/vitest.config.ts` (verified existence implicit — `pnpm test` works today) |
| Quick run command | `pnpm --filter @sms-platform/api test` |
| Full suite command | `pnpm --filter @sms-platform/api test` (no separate "full" — the api package's vitest run is the suite) |
| Setup hook | `pretest` script runs `prisma generate && pnpm run db:test:setup` ([VERIFIED: package.json:14]) |
| Test DB bootstrap | `apps/api/scripts/setup-test-db.sh` ([VERIFIED] — drops public schema, applies `prisma db push`, applies RLS files) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEBT-01 | StreamProcessor guard refuses empty cameraId AND records metric | unit | `pnpm --filter @sms-platform/api test -- stream-processor-guard` | ✅ extend existing `apps/api/tests/streams/stream-processor-guard.test.ts` |
| DEBT-01 | StreamGuardMetricsService snapshot shape + status enum | unit | `pnpm --filter @sms-platform/api test -- stream-guard-metrics` | ❌ Wave 0 — `tests/streams/stream-guard-metrics.test.ts` |
| DEBT-01 | Real BullMQ worker with empty job → no FFmpeg spawn + metric incremented | integration | `pnpm --filter @sms-platform/api test -- stream-guard.integration` | ❌ Wave 0 — `tests/integration/stream-guard.integration.test.ts` |
| DEBT-02 | CI runs vitest on every push + PR | smoke (CI) | `gh run list --workflow=test.yml --limit 1 --json conclusion -q '.[0].conclusion' = success` | ❌ Wave 0 — `.github/workflows/test.yml` |
| DEBT-03 | `generateOriginSrsConfig` does not contain `hls_use_fmp4` | unit | `pnpm --filter @sms-platform/api test -- config-generation` | ✅ extend existing `apps/api/tests/cluster/config-generation.test.ts` |
| DEBT-03 | `SettingsService.generateSrsConfig` does not contain `hls_use_fmp4` | unit | `pnpm --filter @sms-platform/api test -- srs-config` | ❌ Wave 0 — `tests/settings/srs-config.test.ts` |
| DEBT-04 | `getRecording()` API response includes `camera.tags` + `camera.description` | unit | `pnpm --filter @sms-platform/api test -- get-recording` | ✅ extend existing `apps/api/tests/recordings/get-recording.test.ts` |
| DEBT-04 | Playback page renders TagsCell when tags non-empty + line-clamped description | unit (component) | `pnpm --filter @sms-platform/web test -- playback-page-header` | ❌ Wave 0 — `apps/web/src/app/app/recordings/[id]/components/__tests__/playback-page-header.test.tsx` (manual-only if web has no test runner) |
| DEBT-05 | `prisma migrate deploy` against fresh DB succeeds | integration | bash one-liner: `createdb sms_phase23_check && DATABASE_URL=... prisma migrate deploy && dropdb sms_phase23_check` | ❌ Wave 0 — manual verification step in PLAN; CI runs `db:check-drift` which is the steady-state equivalent |
| DEBT-05 | `db:check-drift` returns exit 0 against current schema.prisma | smoke | `pnpm --filter @sms-platform/api db:check-drift` | ✅ once D-04 ships, the script is the test |

### Sampling Rate

- **Per task commit:** `pnpm --filter @sms-platform/api test -- <pattern>` (run only the files touched).
- **Per wave merge:** `pnpm --filter @sms-platform/api test` (full api suite, ~108 passing today).
- **Phase gate:** `pnpm --filter @sms-platform/api test && pnpm --filter @sms-platform/api db:check-drift` BOTH green before `/gsd-verify-work`. CI workflow on `main` is the authoritative regression target.

### Wave 0 Gaps

- [ ] `apps/api/tests/streams/stream-guard-metrics.test.ts` — covers DEBT-01 unit (snapshot + recordRefusal)
- [ ] `apps/api/tests/integration/stream-guard.integration.test.ts` — covers DEBT-01 integration (real BullMQ + Redis, skipIf pattern)
- [ ] `apps/api/tests/settings/srs-config.test.ts` — covers DEBT-03 settings.service emit path
- [ ] `.github/workflows/test.yml` — Wave 0 task: workflow file itself is the artifact; first run produces the regression-gate signal
- [ ] `.planning/todos/v1.4-test-backfill.md` — D-07 backlog entry (single file, ~10 lines)
- [ ] **No new framework install needed** — Vitest 2.x already in repo (package.json:73)
- [ ] **Optional Wave 0:** `apps/web` test runner (Vitest config in `apps/web/`). If web doesn't currently run vitest, DEBT-04 component test becomes manual-only — note in plan.

## Sources

### Primary (HIGH confidence)

- `apps/api/src/streams/processors/stream.processor.ts` (read in full) — current guard at lines 72-77, optional DI pattern at 55-56
- `apps/api/src/recordings/archive-metrics.service.ts` (read in full, 60 LOC) — clone target for `StreamGuardMetricsService`
- `apps/api/src/srs/srs-callback.controller.ts` (lines 1-75 + 380-385) — current `/metrics` endpoint + optional metrics injection
- `apps/api/src/recordings/recordings.service.ts` (lines 425-548) — `getRecording` include path
- `apps/api/src/cluster/templates/srs-origin.conf.ts` (read in full, 84 LOC) — confirmed no `hls_use_fmp4`
- `apps/api/src/settings/settings.service.ts` (lines 120-218) — confirmed no `hls_use_fmp4` in emit path
- `apps/api/src/prisma/migrations/*` (all 8 directories listed; rls_apply_all read for IF NOT EXISTS confirmation; non-RLS files read in full)
- `apps/api/package.json` — `db:push` chain at line 18, current scripts surface
- `apps/api/scripts/setup-test-db.sh` (read in full, 99 LOC) — current test DB bootstrap referencing 3 specific RLS files
- `apps/api/tests/integration/profile-restart-active-job.integration.test.ts` (read in full) — canonical real-Redis test pattern
- `apps/api/tests/streams/stream-processor-guard.test.ts` (read in full) — extend pattern for DEBT-01 unit
- `apps/api/tests/recordings/archive-metrics.test.ts` (read 60 LOC) — clone pattern for new metrics test
- `apps/api/tests/cluster/config-generation.test.ts` (read 60 LOC) — extend pattern for DEBT-03 negative assertion
- `apps/web/src/app/app/recordings/[id]/page.tsx` (read in full, 240 LOC) — playback page composition
- `apps/web/src/app/app/recordings/[id]/components/playback-page-header.tsx` (read in full, 131 LOC) — header edit target
- `apps/web/src/app/admin/cameras/components/tags-cell.tsx` (read in full, 87 LOC) — reusable read-only badge row
- `apps/web/src/components/map/camera-popup.tsx` (lines 240-280 read) — Show more disclosure pattern
- `apps/web/src/hooks/use-recordings.ts` (lines 1-117 read) — type extension target
- `pnpm exec prisma migrate diff --help` (executed locally 2026-04-27) — confirmed CLI flags `--from-empty`, `--to-schema-datamodel`, `--from-migrations`, `--exit-code`
- `pnpm exec prisma migrate reset --help` (executed locally 2026-04-27) — confirmed `--force`, `--skip-seed`, `--skip-generate`
- [Prisma docs — Baselining workflow](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining) — `migrate diff --from-empty --to-schema --script` flow
- [Prisma docs — CLI Reference > migrate diff](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-diff) — exit-code semantics + RLS limitation note
- [GitHub Docs — Postgres service container](https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers) — service container YAML
- [GitHub Docs — Branch protection REST API](https://docs.github.com/en/rest/branches/branch-protection) — PUT endpoint + minimum JSON body
- [pnpm.io/continuous-integration](https://pnpm.io/continuous-integration) — pnpm/setup-node action ordering
- `.planning/research/STACK.md` — locked Prisma 6.19, Postgres 16, Node 22 versions
- `.planning/research/ARCHITECTURE.md:376-431` — migration baseline as Phase 0 prerequisite
- `.planning/research/PITFALLS.md:15-117` (Pitfalls 1, 2, 4) and lines 463-551 (Pitfalls 14, 15, 16) — failure modes Phase 23 closes

### Secondary (MEDIUM confidence)

- [GitHub Docs — Repository Rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets) — newer API form for branch protection (alternative to PUT `/branches/main/protection`)
- WebSearch result on `gh api branch protection` — corroborated minimum payload shape

### Tertiary (LOW confidence — flagged for re-verification during plan execution)

- A5 above (branch protection `contexts` string must match the actual rendered check name; verify from first CI run)
- A2 above (admin recording detail page existence; verify via codebase walk during plan)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified in repo files, every CLI flag verified locally
- Architecture (NestJS module wiring + DI patterns): HIGH — repo-internal patterns, sourced from existing code
- Pitfalls: HIGH — 4 of 7 verified by reading source; 3 (Pitfall 5, 6, 7) verified against authoritative external docs
- Open questions: MEDIUM — depends on user decisions outside Phase 23 scope (admin page, RLS file fate)

**Research date:** 2026-04-27
**Valid until:** 2026-06-27 (60 days; Prisma 7.x release timing is the only fast-moving variable, and CONTEXT pins 6.19)
