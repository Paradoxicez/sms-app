---
phase: 22-camera-metadata-utilization-surface-tags-description-across-
plan: 05
subsystem: api
tags: [cache, redis, distinct-tags, autocomplete, rls, vitest, ioredis, postgres]

# Dependency graph
requires:
  - phase: 22-01
    provides: Camera.tagsNormalized + Prisma extension auto-mirroring tags → tagsNormalized
  - phase: 22-02
    provides: cameras.service.ts + cameras.controller.ts already wired for tags filter
  - phase: 22-04
    provides: cameras.service.ts already imports auditService + arraysEqualCaseInsensitive helper
provides:
  - "TagCacheService — Redis-backed read-through cache (TTL=60s, key=`tags:distinct:{orgId}`) with in-memory Map fallback when Redis errors or is unavailable"
  - "CamerasService.findDistinctTags(orgId) — $queryRaw + set_config RLS + WHERE \"orgId\" = ${orgId} two-layer T-22-02 mitigation; DISTINCT ON (lower(tag)) + ORDER BY lower(tag), tag COLLATE \"C\" for deterministic first-seen casing"
  - "GET /cameras/tags/distinct controller route — declared BEFORE @Get('cameras/:id') so NestJS path-to-regexp picks the literal segment over a `:id` capture"
  - "10 integration tests covering cache contract (4) + findDistinctTags real-DB (4) + controller smoke (2) — all 10/10 passing"
affects: [22-07, 22-08, 22-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-through cache via @Optional() @Inject(REDIS_CLIENT) — service falls through to in-memory Map on Redis read/write errors; tests inject undefined Redis to exercise memory-only path without standing up an ioredis connection"
    - "Defense-in-depth tenancy: set_config + explicit WHERE clause both applied. set_config is the production T-22-02 primary defense (app_user role); explicit WHERE is the test-harness defense (sms superuser bypasses RLS) AND a future-proofing layer if a connection role ever drifts"
    - "Deterministic first-seen casing via COLLATE \"C\": ASCII byte-order forces uppercase < lowercase so 'Lobby' wins over 'lobby' regardless of Postgres locale (en_US.UTF-8 inverts this on some installs — would have been a flaky test otherwise)"
    - "@Optional 8th positional ctor arg pattern — adds tagCacheService without breaking the existing 7-arg test harness invocation shape (tags-filter.test.ts, audit-diff.test.ts, etc.); falls back to a local TagCacheService instance when DI is bypassed"
    - "Module-local REDIS_CLIENT factory mirrors StreamsModule + ApiKeysModule (each module owns its own connection — cheap, isolated shutdown via Redis().disconnect())"

key-files:
  created:
    - apps/api/src/cameras/tag-cache.service.ts
  modified:
    - apps/api/src/cameras/cameras.service.ts
    - apps/api/src/cameras/cameras.controller.ts
    - apps/api/src/cameras/cameras.module.ts
    - apps/api/tests/cameras/distinct-tags.test.ts

key-decisions:
  - "Defense-in-depth `WHERE \"orgId\" = ${orgId}` added alongside set_config — Plan 22-05 §<action> Step 1 said the unnest 'does NOT include WHERE orgId because RLS via set_config already scopes the query at row level'. That holds in production (app_user role) but FAILED in the test harness (sms superuser bypasses RLS). Adding the WHERE makes the integration test pin the correctness contract directly AND future-proofs against role-context drift. T-22-02 mitigation now has TWO layers."
  - "COLLATE \"C\" inside ORDER BY tag — without this, the `Camera` table's collation is whatever Postgres locale was used at initdb (commonly en_US.UTF-8) which sorts lowercase BEFORE uppercase ('lobby' < 'Lobby'), making the first-seen casing test flaky across Postgres installs. COLLATE \"C\" is ASCII byte-order ('A' < 'Z' < 'a' < 'z') so uppercase deterministically wins."
  - "TagCacheService injected as @Optional 8th positional ctor arg, NOT inserted between existing args — ALL existing test harnesses (tags-filter.test.ts, audit-diff.test.ts, hierarchy.test.ts, camera-crud.test.ts, etc.) construct CamerasService positionally with the 7-arg signature. Adding `tagCacheService` as the 8th @Optional arg keeps every prior call site working without edits. The findDistinctTags method falls back to `new TagCacheService()` when undefined so the cache wrapper still runs in harness mode."
  - "Module-local REDIS_CLIENT provider rather than importing ApiKeysModule — StreamsModule + ApiKeysModule each own their Redis connection via the same factory shape; cameras.module.ts mirrors that pattern. Pros: independent connection lifecycle, isolated shutdown, no transitive imports. Cons: 3rd Redis connection in the API process — acceptable at current scale (each connection is ~few KB)."
  - "10 tests across 3 layers (cache unit / service integration / controller smoke) instead of the plan's 6 — the plan suggested 6 cases but the cache-contract layer needed 4 separate cases to pin: (a) basic cache hit, (b) Redis error fallback, (c) cache key shape per orgId, (d) invalidate(). Splitting these makes failures localized. The 4 service integration cases (basic, empty, RLS, cache-hit) match the plan's <behavior> block 1:1; the 2 controller cases verify the response shape is `{ tags: string[] }`."

requirements-completed: [D-09, D-28]

# Metrics
duration: ~10min
completed: 2026-04-26
---

# Phase 22 Plan 05: Distinct-tags endpoint + Redis cache Summary

**`GET /cameras/tags/distinct` returns `{ tags: string[] }` alphabetized with deterministic first-seen casing per D-04, backed by a Redis-first / memory-fallback `TagCacheService` (TTL=60s, key=`tags:distinct:{orgId}`). T-22-02 cross-org leak mitigated by TWO defense layers: production `set_config('app.current_org_id', ...)` for app_user RLS + explicit `WHERE "orgId" = ${orgId}` clause for defense-in-depth (also makes the integration test pass against the test superuser). 10/10 integration tests pass, 187/187 full cameras suite green, zero regressions.**

## Performance

- **Duration:** ~10 min (Task 1 → Task 2 RED → Task 2 GREEN — 3 commits)
- **Started:** 2026-04-26T21:13Z (Task 1 first edit)
- **Completed:** 2026-04-26T21:30Z (Task 2 GREEN commit)
- **Tasks:** 2 (Task 1 fully autonomous, Task 2 TDD with RED + GREEN)
- **Files modified:** 5 (1 created + 4 modified)
- **Tests added:** 10 (cache-contract: 4, service-integration: 4, controller-smoke: 2)

## Accomplishments

- **TagCacheService created** at `apps/api/src/cameras/tag-cache.service.ts` — Redis-first read-through with `tags:distinct:{orgId}` key shape, 60s TTL, in-memory `Map<orgId, {value, expiresAt}>` fallback. `@Optional() @Inject(REDIS_CLIENT)` keeps unit-test harnesses working without standing up Redis. Public methods: `getOrCompute(orgId, compute)` and `invalidate(orgId)`.
- **CamerasService.findDistinctTags(orgId)** — goes through TagCacheService.getOrCompute; cache-miss runs `tx.$queryRaw` inside a tenancy transaction with manual `set_config('app.current_org_id', orgId, TRUE)` prologue + explicit `WHERE "orgId" = ${orgId}` clause for defense-in-depth. `DISTINCT ON (lower(tag)) tag ORDER BY lower(tag), tag COLLATE "C"` collapses case-insensitive duplicates with ASCII-byte-order winner ("Lobby" beats "lobby"). Application-level `.sort` re-sorts case-insensitively for stable alphabetical display.
- **`@Get('cameras/tags/distinct')` route** added to CamerasController declared at line 229, BEFORE `@Get('cameras/:id')` at line 286 — NestJS path-to-regexp picks the literal `cameras/tags/distinct` segment over a `:id` capture. Returns `{ tags: string[] }`.
- **CamerasModule wired** with `TagCacheService` in providers + exports + module-local REDIS_CLIENT factory (mirrors StreamsModule + ApiKeysModule pattern).
- **distinct-tags.test.ts implemented** — replaces the 6-stub from Plan 22-01 with 10 cases across 3 layers; all 10/10 pass.
- **API build clean** (`nest build` exits 0; 167 files compiled with swc).
- **Zero regressions** — full cameras suite still 187 passing / 19 todos / 0 failures.

## Task Commits

Each task committed atomically with `--no-verify` per parallel-executor protocol. TDD discipline on Task 2: RED → GREEN.

1. **Task 1 — TagCacheService + module wiring** — `6130549` (feat) — Redis-first cache with memory fallback, key=`tags:distinct:{orgId}`, TTL=60s, @Optional REDIS_CLIENT, module-local Redis factory
2. **Task 2 RED — failing tests for findDistinctTags + controller route** — `e2f06f6` (test) — 10 cases, 6 failing pre-implementation as expected (`findDistinctTags is not a function` × 4, `getDistinctTags is not a function` × 2)
3. **Task 2 GREEN — service method + controller route** — `5589251` (feat) — findDistinctTags via $queryRaw + set_config + defense-in-depth WHERE + COLLATE "C" + cache wrapper; controller route declared before :id; 10/10 tests pass, 187/187 suite green

**Plan metadata:** orchestrator owns final commit (SUMMARY only — STATE.md / ROADMAP.md updates deferred to orchestrator per parent prompt).

## Files Created/Modified

### New service (Task 1 — `6130549`)
- `apps/api/src/cameras/tag-cache.service.ts` — `TagCacheService` class with `getOrCompute(orgId, compute)` + `invalidate(orgId)`. Redis path checked first; on read failure or no Redis configured, falls through to in-memory Map. On compute, writes through to BOTH layers so a Redis outage immediately after the first call still serves a hit on the second.

### Module + service + controller (Tasks 1-2 GREEN)
- `apps/api/src/cameras/cameras.module.ts` — Added `TagCacheService` import + provider entry + exports list. Added module-local REDIS_CLIENT factory mirroring StreamsModule.
- `apps/api/src/cameras/cameras.service.ts` — Added `import { TagCacheService } from './tag-cache.service'`. Added `tagCacheService?: TagCacheService` as @Optional 8th positional ctor arg. Added `findDistinctTags(orgId)` method (~50 lines) that goes through cache.getOrCompute → $queryRaw with set_config + WHERE + DISTINCT ON + COLLATE "C" + application sort.
- `apps/api/src/cameras/cameras.controller.ts` — Added `@Get('cameras/tags/distinct')` route at line 229 (before line 286 `@Get('cameras/:id')`). Returns `{ tags: string[] }`.

### Tests (Task 2 RED — `e2f06f6`)
- `apps/api/tests/cameras/distinct-tags.test.ts` — Replaced 6-stub from Plan 22-01 with 10 implemented cases:
  1. Cache contract: first call computes + writes through, second call hits cache (compute called once)
  2. Cache contract: Redis read failure falls back to in-memory cache without crashing
  3. Cache contract: cache key includes orgId so Org A and Org B never collide
  4. Cache contract: invalidate() clears both Redis and in-memory entries
  5. findDistinctTags: alphabetized distinct tags with first-seen casing (D-04, D-09)
  6. findDistinctTags: empty org returns []
  7. findDistinctTags: RLS isolation — Org B request never sees Org A tags (T-22-02)
  8. findDistinctTags: cache hit — second call doesn't re-run DB query
  9. Controller: `getDistinctTags()` returns `{ tags: string[] }` and threads orgId from CLS
  10. Controller: empty result still returns `{ tags: [] }`

## Decisions Made

- **Defense-in-depth `WHERE "orgId" = ${orgId}` alongside set_config.** The plan §<action> Step 1 said the unnest "does NOT include WHERE orgId because RLS via set_config already scopes the query at row level." That holds in production (app_user role + RLS policy `tenant_isolation_camera`) but FAILED against the test harness (sms superuser with `rolbypassrls=true`). Adding the WHERE makes the integration test directly pin the cross-org isolation contract AND future-proofs against role-context drift (e.g., a future debug code path that uses systemPrisma). T-22-02 mitigation now has two layers: RLS in production, explicit WHERE everywhere. Pinned by Tests 5-7.
- **COLLATE "C" for deterministic first-seen casing.** Without an explicit collation, `ORDER BY tag` uses the column's default collation — typically `en_US.UTF-8` on most Postgres installs, which sorts lowercase BEFORE uppercase (`'lobby' < 'Lobby'`). The plan acknowledged this drift potential ("Postgres collation may differ — verify with the test"). COLLATE "C" forces ASCII byte-order so uppercase letters sort first (`'A' < 'Z' < 'a' < 'z'`), making "Lobby" deterministically win over "lobby" — matches the plan's expected D-04 semantics across Postgres versions and locales. Pinned by Test 5.
- **@Optional 8th positional ctor arg, not insertion in middle.** ALL existing test harnesses construct CamerasService positionally — tags-filter.test.ts:42, audit-diff.test.ts:54, hierarchy.test.ts, camera-crud.test.ts, etc. Inserting tagCacheService anywhere except the end would break every prior call site. Appending as @Optional arg #8 with a fallback `new TagCacheService()` inside `findDistinctTags` keeps every prior harness invocation working AND lets the cache wrapper still execute in harness mode (memory-only path).
- **Module-local REDIS_CLIENT factory rather than importing ApiKeysModule.** StreamsModule + ApiKeysModule each own their Redis connection via the same factory shape; cameras.module.ts now mirrors that pattern. Trade-off: 3rd Redis connection in the API process. Verdict: acceptable at current scale (each ioredis connection is a few KB; the connection pool overhead is negligible vs. the cleaner module boundary). Same precedent as the rest of the codebase.
- **TagCacheService unit tests vs. service integration tests.** The plan suggested 6 cases; this implementation uses 10 across 3 layers. The cache contract is its own concern (4 unit cases against the TagCacheService class directly with stubbed Redis), separate from findDistinctTags integration (4 cases against testPrisma). This means a future cache regression (e.g., key shape drift, TTL change, fallback bug) localizes to the cache layer and doesn't masquerade as a service-level failure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Plan SQL would leak across orgs in test harness (sms superuser bypasses RLS)**
- **Found during:** Task 2 GREEN verification (Test 6 + Test 7 failed with `expected [] to deeply equal ['Confidential', 'Entrance', 'lobby', 'Outdoor']`).
- **Issue:** The plan's `<action>` Step 1 SQL was `SELECT DISTINCT ON (lower(tag)) tag FROM "Camera", unnest(tags) AS tag ORDER BY lower(tag), tag` — relying solely on `set_config('app.current_org_id', ...)` for tenancy. In production with the `app_user` Postgres role, RLS policy `tenant_isolation_camera` would scope the query correctly. But the test harness uses the `sms` superuser role (rolbypassrls=true) so RLS is BYPASSED, leading to cross-org leak in tests.
- **Fix:** Added explicit `WHERE "orgId" = ${orgId}` clause to the SQL. This is defense-in-depth: production keeps RLS as the primary defense (orgId may differ from the cls context if app_user is in some unexpected state), tests get a deterministic same-result contract regardless of role. T-22-02 mitigation now has TWO layers.
- **Files modified:** apps/api/src/cameras/cameras.service.ts (one SQL line — `WHERE "orgId" = ${orgId}` added inside the `$queryRaw` template).
- **Verification:** Tests 5-7 all pass after the fix; Test 7 explicitly asserts `aTags.not.toContain('Confidential')` and `bTags.not.toContain('Lobby')`.
- **Committed in:** Folded into 5589251 (Task 2 GREEN commit).

**2. [Rule 1 — Bug] Plan SQL had non-deterministic first-seen casing across Postgres locales**
- **Found during:** Task 2 GREEN verification (Test 5 failed with `expected ['Entrance', 'Lobby', 'Outdoor'] but got ['Entrance', 'lobby', 'Outdoor']`).
- **Issue:** The plan's `<action>` Step 1 said `ORDER BY lower(tag), tag` would pick "the lexicographically-FIRST original casing for each lowercase key (e.g. 'Lobby' wins over 'lobby' because L < l in ASCII; Postgres collation may differ — verify with the test)." In en_US.UTF-8 locale (default on most installs), `tag` sorts case-insensitively as the secondary key, but with locale-specific tie-breaking that puts lowercase BEFORE uppercase ('lobby' < 'Lobby'). So "lobby" was being picked instead of "Lobby" — directly violating D-04 first-seen casing.
- **Fix:** Added `COLLATE "C"` to the inner ORDER BY: `ORDER BY lower(tag), tag COLLATE "C"`. The "C" collation forces ASCII byte-order ('A'=0x41 < 'Z'=0x5A < 'a'=0x61 < 'z'=0x7A), so uppercase always wins as the tie-breaker.
- **Files modified:** apps/api/src/cameras/cameras.service.ts (one SQL token — added `COLLATE "C"` after `tag` in ORDER BY).
- **Verification:** Test 5 asserts `expect(tags).toEqual(['Entrance', 'Lobby', 'Outdoor'])` — passes after the fix.
- **Committed in:** Folded into 5589251 (Task 2 GREEN commit).

**3. [Rule 3 — Blocking] Worktree had no node_modules / .env / .env.test (carryover from 22-02)**
- **Found during:** Task 1 build verification.
- **Issue:** Same as documented in 22-02-SUMMARY.md and 22-04-SUMMARY.md — fresh worktree at `.claude/worktrees/agent-a4a5a3463f2feb3bd/` has no `node_modules` or `.env*` files. `pnpm build` failed with `prisma: command not found`.
- **Fix:** Created symlinks pointing at the main-repo files (`node_modules`, `apps/api/node_modules`, `apps/web/node_modules`, `apps/api/.env.test`, etc.). The .gitignored files don't enter version control.
- **Files modified:** None tracked.
- **Committed in:** No commit — operational setup only.

**4. [Rule 3 — Documentation] Plan-prescribed `-x` flag is incompatible with vitest 2.x (carryover from 22-01)**
- **Found during:** Task 2 RED verification.
- **Issue:** Same `-x` typo as documented in prior phase 22 summaries. Vitest 2.1.9 rejects it as `Unknown option`.
- **Fix:** Ran the verify commands without `-x`. Both runs reported clean exit with the expected pass/fail counts.
- **Files modified:** None.
- **Committed in:** N/A — verification-only deviation.

---

**Total deviations:** 4 (2 plan-spec bugs caught by tests, 1 operational, 1 doc carryover)
**Impact on plan:** Zero scope creep. The 2 plan-spec SQL bugs (RLS test gap + collation drift) were caught by the failing tests and fixed in the same GREEN commit; both fixes strengthen the implementation (T-22-02 defense-in-depth, locale-deterministic first-seen casing) and don't expand scope.

## Issues Encountered

- **Worktree environment setup** — Same blocker as 22-02/22-04 (see Deviations §3).
- **Postgres collation drift** — `en_US.UTF-8` sorts `'lobby' < 'Lobby'` (lowercase first), opposite to ASCII byte-order. Without explicit `COLLATE "C"`, the first-seen casing test would have been a flaky cross-platform/cross-Postgres-version regression. Lesson: any Phase 22+ SQL that relies on case-tie-breaking should pin the collation explicitly.
- **testPrisma is the `sms` superuser** — The test harness explicitly uses the superuser role (rolbypassrls=true) so seed inserts bypass RLS naturally. This means RLS-only tenancy contracts can pass false-positively in tests. Plan 22-02's tags-filter integration sidestepped this by `SET ROLE app_user` inside the test transaction; Plan 22-05's distinct-tags wraps the SQL in a service method that doesn't take a role context, so the simpler fix was to add the explicit WHERE clause inside the SQL itself.

## Threat Flags

None — Plan 22-05 introduces ONE new endpoint (`GET /cameras/tags/distinct`) which sits behind the existing `AuthGuard` at the controller level (CLS-scoped orgId) and is in turn pinned by the explicit WHERE clause + RLS prologue inside the service. The plan's `<threat_model>` row T-22-02 (cross-org cache leak) is mitigated as designed:
- Cache key includes orgId — pinned by Test 3 (`tags:distinct:org-A` and `tags:distinct:org-B` confirmed in setex calls)
- RLS via set_config — production primary defense (app_user role)
- Defense-in-depth WHERE clause — works in tests (sms superuser) AND production
- Test 7 explicitly asserts cross-org isolation: `aTags.not.toContain('Confidential')` and `bTags.not.toContain('Lobby')`

T-22-05 (DoS) and T-22-06 (cache poisoning) are accepted/already mitigated per the plan's threat_model.

## Known Stubs

None introduced by this plan. The Wave 0 stub `distinct-tags.test.ts` from Plan 22-01 is now fully implemented (10/10 cases passing).

## User Setup Required

None — no schema changes, no migrations, no env vars. The `REDIS_HOST`/`REDIS_PORT` env vars (and their defaults `localhost:6379`) are already used by ApiKeysModule and StreamsModule; no new configuration surface.

## Next Phase Readiness

- **Plan 22-07 (Tag-input combobox autocomplete)** unblocked — the chip combobox can now hit `GET /cameras/tags/distinct` to populate its suggestion list. Response is `{ tags: string[] }` with stable alphabetical order.
- **Plan 22-08 (Cameras table tags filter MultiSelect)** unblocked — the table toolbar's tag filter can populate options from the same endpoint. The 60s TTL means the dropdown opens fast even when many users browse the table simultaneously.
- **Plan 22-10 (Map view tag filter)** unblocked — the map toolbar's MultiSelect uses the same endpoint as 22-08; both consume the cached payload.

## Self-Check: PASSED

Verified file presence:

```
EXISTS: apps/api/src/cameras/tag-cache.service.ts (created)
EXISTS: apps/api/src/cameras/cameras.service.ts (modified — findDistinctTags added)
EXISTS: apps/api/src/cameras/cameras.controller.ts (modified — getDistinctTags route added)
EXISTS: apps/api/src/cameras/cameras.module.ts (modified — TagCacheService + REDIS_CLIENT)
EXISTS: apps/api/tests/cameras/distinct-tags.test.ts (modified — 10 implemented cases)
```

Verified commit reachability (3 commits this plan):

```
FOUND: 6130549 (Task 1 — TagCacheService + module wiring)
FOUND: e2f06f6 (Task 2 RED — failing tests for distinct-tags)
FOUND: 5589251 (Task 2 GREEN — findDistinctTags + controller route)
```

Verified all tests pass:

```
api: tests/cameras/distinct-tags.test.ts → 10/10 passing (4 cache + 4 integration + 2 controller)
api: tests/cameras/                       → 187/187 passing (19 todos pre-existing, 3 skipped pre-existing)
api: build (nest build)                   → exit 0, 167 files compiled with swc
```

Verified acceptance grep contract from PLAN.md:

```
✓ "findDistinctTags" in cameras.service.ts — 1 method definition (line 391) + 1 doc reference
✓ "tags/distinct" / "getDistinctTags" in cameras.controller.ts — 2+ matches (route decorator + handler)
✓ "set_config.*current_org_id" in cameras.service.ts within findDistinctTags — 1 match (line 408)
✓ "DISTINCT ON" in cameras.service.ts — 1 SQL match (line 426) + 2 doc references
✓ Route ordering: cameras/tags/distinct (line 229) BEFORE cameras/:id (line 286)
✓ distinct-tags.test.ts contains 0 it.todo (10 it() cases)
✓ TagCacheService in cameras.module.ts — 4 matches (import + provider + export + doc)
```

---
*Phase: 22-camera-metadata-utilization-surface-tags-description-across-*
*Completed: 2026-04-26*
