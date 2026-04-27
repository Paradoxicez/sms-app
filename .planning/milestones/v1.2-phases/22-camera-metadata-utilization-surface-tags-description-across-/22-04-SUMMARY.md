---
phase: 22-camera-metadata-utilization-surface-tags-description-across-
plan: 04
subsystem: api
tags: [audit, camera, diff, sanitizer, tags, description, vitest]

# Dependency graph
requires:
  - phase: 22-01
    provides: Camera.tagsNormalized shadow column + DTO bounds (TAG_MAX_LENGTH × TAG_MAX_PER_CAMERA)
  - phase: 22-02
    provides: findAllCameras tags filter (no functional dependency, but cameras.service.ts already touched by 22-02 — diff implementation layers on top)
provides:
  - "Camera UPDATE writes structured details.diff = { tags?: {before, after}, description?: {before, after} } via auditService.log({ action: 'camera.metadata.update' })"
  - "Sanitizer contract pinned by tests: sanitizeDetails preserves the `diff` key and key-based redaction continues to apply recursively"
  - "arraysEqualCaseInsensitive helper colocated in cameras.service.ts (kept inline rather than re-exported from tag-normalize.ts to keep diff logic greppable from the audit call)"
affects: [22-05, 22-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service-layer audit emission alongside AuditInterceptor — interceptor records the request body snapshot, service emits a complementary `camera.metadata.update` row carrying structured diff (matches push-audit pattern at cameras.service.ts:240, 619)"
    - "Object.prototype.hasOwnProperty.call(dto, key) discriminator for absent vs explicit-null fields — null is a real PATCH value (description cleared); absent means field-not-touched"
    - "Hybrid integration test: real testPrisma drives camera lifecycle so tags + tagsNormalized stay in sync via the Plan 22-01 extension; auditService is mocked to capture log payloads (no supertest infra in this repo)"

key-files:
  created: []
  modified:
    - apps/api/src/cameras/cameras.service.ts
    - apps/api/src/audit/audit.service.ts
    - apps/api/tests/cameras/audit-diff.test.ts
    - apps/api/tests/audit/sanitizer-diff.test.ts

key-decisions:
  - "Diff emitted as a SEPARATE audit row (action='camera.metadata.update') rather than mutating the AuditInterceptor's auto-row — interceptor runs at the controller boundary with no access to pre-image, and merging would require either tunneling pre into the request scope (intrusive) or a second update on the AuditLog row (race-prone). Two rows is cleaner: interceptor row for the WHO/WHAT-WAS-SENT and service row for the WHAT-CHANGED."
  - "arraysEqualCaseInsensitive kept INLINE in cameras.service.ts rather than re-exported from tag-normalize.ts — Plan 22-01's normalizeForDb deduplicates and lowercases for the shadow column; tag diff equality is a different operation (case-insensitive multiset match) and conflating them would obscure the contract. Phase 22 spec text in 22-04-PLAN.md §<action> Step 1 explicitly proposes either approach and defers to project preference."
  - "Description equality uses ?? null on BOTH sides so undefined and null are equivalent — the schema allows description to be null (cleared) and Prisma normalizes undefined writes to no-op. Without the coalesce, a never-set description (undefined in pre) compared to a freshly-set one (null in updated) would falsely register as a change."
  - "sanitizeDetails exported with NO logic change — the test file pins current behavior (key-based, NOT value-based redaction) so a future contributor 'tightening' the sanitizer to also match values trips the regression test rather than silently breaking Phase 22's diff."

requirements-completed: [D-24, D-25]

# Metrics
duration: ~12min
completed: 2026-04-26
---

# Phase 22 Plan 04: Camera UPDATE audit diff Summary

**Camera UPDATE in `cameras.service.ts` now emits `auditService.log({ action: 'camera.metadata.update', details: { diff } })` carrying a structured `{ before, after }` diff for `tags` and `description` — only when at least one of those fields actually changed. CREATE path is byte-identical (D-25). The audit sanitizer's `diff` key preservation is now pinned by 4 unit tests so future contributors can't accidentally redact tag/description history.**

## Performance

- **Duration:** ~12 min (Task 1 RED → Task 1 GREEN → Task 2 RED → Task 2 GREEN)
- **Started:** 2026-04-26T13:55:00Z (approximate — Task 1 RED commit)
- **Completed:** 2026-04-26T14:04:32Z (Task 2 GREEN commit)
- **Tasks:** 2 (both TDD, RED + GREEN per task — 4 commits total)
- **Files modified:** 4 (2 source + 2 tests; no new files — both stubs from Plan 22-01 filled in)

## Accomplishments

- `cameras.service.ts updateCamera` computes pre/post diff for `tags` + `description` after the row update commits and emits `auditService.log` with `details: { diff }` ONLY when at least one field actually changed. The diff key is omitted entirely (no empty `diff: {}`) when nothing relevant changed — Test 4 pins this.
- `arraysEqualCaseInsensitive` helper handles D-04's case-insensitivity rule: editing `'Lobby'` to `'LOBBY'` is a no-op for both the indexed `tagsNormalized` column AND the audit diff. Test 5 pins this.
- `sanitizeDetails` exported (no logic change) so tests can directly import and pin its key-based redaction contract. The 4 sanitizer tests document the behavior and catch any future regression where someone "tightens" the sanitizer to match values OR adds `diff` to the redaction list.
- CREATE path (`cameras.service.ts:240`) is byte-identical — D-25's "no diff in CREATE audit" is preserved by NOT touching the createCamera method at all. Test 7 pins this with a positive-control assertion: after createCamera, no auditService.log call carries `details.diff`.
- 7/7 audit-diff integration tests pass (hybrid pattern: real `testPrisma` for lifecycle, mocked `auditService` for capture).
- 4/4 sanitizer-diff unit tests pass.
- Full cameras + audit test suites: 188 passing / 44 todos / 0 failures.
- API build clean (`nest build` exits 0; 166 files compiled with swc).

## Task Commits

Each task committed atomically with `--no-verify` per parallel-executor protocol. TDD discipline: RED commit precedes GREEN commit per task.

1. **Task 1 RED — failing tests for sanitizeDetails preserving diff key** — `4c10cce` (test) — 4 cases, all failing pre-implementation with `TypeError: sanitizeDetails is not a function` (function not yet exported)
2. **Task 1 GREEN — export sanitizeDetails (no logic change)** — `965f44f` (feat) — single-keyword diff (`function` → `export function`); 4/4 sanitizer tests pass
3. **Task 2 RED — failing tests for camera UPDATE audit diff** — `4edc2a4` (test) — 7 cases, 4 failing (Tests 1, 2, 3, 6 require diff emission); 3 already passing (Tests 4, 5, 7 are negative assertions)
4. **Task 2 GREEN — emit details.diff for tag/description changes in updateCamera** — `723e4a9` (feat) — adds `arraysEqualCaseInsensitive` helper and the diff-computation block before `return { ...updated, restartTriggered }`; 7/7 audit-diff tests pass

**Plan metadata:** orchestrator owns final commit (SUMMARY only — STATE.md / ROADMAP.md updates deferred to orchestrator per parent prompt).

## Files Created/Modified

### Source (Tasks 1-2 GREEN)

- `apps/api/src/audit/audit.service.ts` — Added `export` keyword to `sanitizeDetails`. Comment explains the test-pinning rationale (key-based, NOT value-based redaction). NO logic change to the sanitizer.
- `apps/api/src/cameras/cameras.service.ts` — Added `arraysEqualCaseInsensitive` helper above the class (with explanatory comment about D-04 case-insensitivity). Added a 40-line block inside `updateCamera` after the profile-reassign logic and before `return`: computes diff, emits audit row with `action: 'camera.metadata.update'` only when the diff is non-empty, swallows audit errors via try/catch + logger.warn (matches push-audit pattern at cameras.service.ts:230, 636 — audit must never block the user-facing PATCH).

### Tests (Tasks 1-2 RED)

- `apps/api/tests/audit/sanitizer-diff.test.ts` — Replaced 4-stub from Plan 22-01 with 4 implemented cases:
  1. diff key preserved at top level
  2. values that LOOK like sensitive key NAMES (as strings) are NOT redacted (sanitizer matches keys, not values)
  3. sibling redaction of password still works alongside diff
  4. recursive redaction inside diff: a key matching the pattern IS still redacted even when nested under `diff` (Phase 22 doesn't store such keys, but documents the intentional behavior)
- `apps/api/tests/cameras/audit-diff.test.ts` — Replaced 5-stub from Plan 22-01 with 7 implemented cases:
  1. tag change → diff.tags = {before, after}; description absent
  2. description change → diff.description = {before, after}; tags absent
  3. both fields changed → both keys present in diff
  4. PATCH name only → no diff-bearing audit row
  5. case-only tag change → no diff (D-04 case-insensitivity)
  6. empty → tags change → diff.tags with before:[], after:[...]
  7. CREATE has no diff (D-25 positive-control)

## Decisions Made

- **Two-row audit model (NOT mutating the interceptor row).** The AuditInterceptor at `audit.interceptor.ts:99-117` runs in the controller's RxJS pipeline with no access to the camera's pre-image. Tunneling pre into request scope OR running a second update on the AuditLog row would either be intrusive (request mutation) or race-prone (concurrent reads). Cleanly emitting a SEPARATE row from the service with `action: 'camera.metadata.update'` matches the existing pattern (push-audit at `cameras.service.ts:240, 619` does the same thing) and the AuditLog table can index/query both rows by `resourceId` to assemble a full edit history.
- **`arraysEqualCaseInsensitive` colocated, not re-exported.** Plan 22-01's `normalizeForDb` lowercases AND deduplicates for the shadow column. The diff-equality check is a DIFFERENT operation (case-insensitive multiset comparison without dedup mutation) and conflating them would obscure the contract. The plan's `<action>` Step 1 explicitly says "or in `tag-normalize.ts` if the project prefers" — keeping inline matches the existing precedent of helpers being defined where they're used (e.g., `cameras.service.ts:33` imports `fingerprintProfile` for the same single-call-site pattern). The grep contract in `<acceptance_criteria>` requires 2+ matches (definition + 1+ call site) which holds at lines 47 and 462.
- **Description coalesce on both sides.** `pre.description ?? null` and `updated.description ?? null` ensures undefined and null compare as equivalent. Without the coalesce, a never-set description (undefined → null in DB) compared to a freshly-set one (null in updated) could register as a spurious change. The schema allows description to be nullable, so null IS a real PATCH value (clearing the field) — the diff machinery just shouldn't treat the absence-of-value sentinel and the explicit-null clear as different.
- **Audit failure non-blocking.** The diff emission lives inside a try/catch + logger.warn — if AuditLog insert fails (DB hiccup, RLS unexpected denial, sanitizer throws), the user's PATCH still succeeds and returns the updated camera. This matches the existing push-audit pattern at `cameras.service.ts:230, 636` and the `auditService.log` itself (which catches errors internally at `audit.service.ts:57`). Audit is a record-of-record, not a write-block.
- **Negative-control test for CREATE.** Test 7 doesn't just check that no diff is emitted by createCamera — it positively asserts that `auditService.log.mock.calls.find(c => c[0]?.details?.diff !== undefined)` returns undefined. This catches any future regression where someone adds diff to a CREATE branch. The test seeds tags + description so the input is non-trivial.

## Deviations from Plan

### None substantively — all auto-fixed deviations were verification-level

**1. [Rule 3 — Documentation] Plan-prescribed `-x` flag is incompatible with vitest 2.x (carryover from 22-01 / 22-02 / 22-03)**
- **Found during:** Task 1 RED verification.
- **Issue:** Same `-x` flag typo as documented in 22-01-SUMMARY.md and 22-02-SUMMARY.md. Vitest 2.1.9 rejects it as `Unknown option`.
- **Fix:** Ran the verify commands without `-x`. Both test files reported clean exit with all expected pass counts.
- **Files modified:** None.
- **Committed in:** N/A — verification-only deviation.

**2. [Rule 1 — Bug] Plan's <interfaces> block referenced "audit call at line 571" — that line does NOT contain an existing audit call**
- **Found during:** Task 2 implementation planning (re-reading cameras.service.ts).
- **Issue:** The plan's `<interfaces>` block says "Calls `auditService.log({ ..., details: sanitizedRequestBody })` at line 571" and proposes "Update the existing audit call at line 571 to include diff". But cameras.service.ts has no `auditService.log` call inside `updateCamera` — the AuditInterceptor handles the auto-emitted row at the controller boundary. The plan was written against an imagined "merged" world where the interceptor row carries the diff.
- **Fix:** Re-interpreted the contract as adding a NEW service-level audit row (action=`camera.metadata.update`) rather than modifying a non-existent existing call. This matches how push-audit events work today (cameras.service.ts:240, 619 fire `auditService.log` from the service alongside the interceptor's row). The behavioral contract in `<behavior>` is preserved: the AuditLog table grows by one row per UPDATE-with-tag/description-change, that row carries `details.diff`, and the field-only-name change case (Test 4) emits no diff-bearing row.
- **Files modified:** None — the implementation just lives in a new branch of code rather than modifying a pre-existing call.
- **Verification:** Test 4 explicitly asserts `auditService.log.mock.calls.find(c => c[0]?.details?.diff !== undefined)` is undefined when only `name` changed — passes.
- **Committed in:** Folded into 723e4a9 (Task 2 GREEN).

---

**Total deviations:** 2 (1 doc carryover, 1 plan-spec interpretation — both auto-resolved without scope change)
**Impact on plan:** Zero functional drift. All 7 integration test cases match the plan's `<behavior>` block exactly. The "two-row" interpretation is the only sound implementation given the current AuditInterceptor architecture.

## Issues Encountered

- **Vitest `-x` flag** (carryover from 22-01).
- **Worktree HEAD ahead of expected base** — The orchestrator's worktree-branch-check showed `ACTUAL_BASE=25c5c50c...` matching expected, but `git log` showed the HEAD already had several commits beyond that base from prior parallel plans (22-01, 22-02, 22-03, 22-09). My commits landed naturally on top of those — no rebase needed.
- **No supertest infrastructure** — The plan's test recipe used PATCH-via-supertest but the apps/api test suite has no HTTP harness. Resolved by switching to direct service-level invocation with mocked `auditService` (matches push-audit.test.ts pattern). Behavioral contract preserved.

## Threat Flags

None — Plan 22-04 introduces no new auth surface or trust boundary. The plan's `<threat_model>` row T-22-03 (Information Disclosure on AuditLog.details.diff) is mitigated as designed: the sanitizer's `diff` key preservation is now pinned by 4 unit tests, and the only data flowing through `diff` is `tags` + `description` — both fields the user can already see in their dashboard.

The new `camera.metadata.update` audit action does NOT widen any existing surface — it writes to the same AuditLog table with the same RLS scoping (`orgId = pre.orgId`) as every other audit row. AuditLog org isolation is enforced by the policy `audit_log_org_isolation` (rls.policies.sql:84).

## Known Stubs

None introduced by this plan. All Wave 0 stubs touched by this plan (audit-diff.test.ts, sanitizer-diff.test.ts) are now fully implemented.

## User Setup Required

None — no schema changes, no migrations, no env vars. Pure code change against the existing schema.

## Next Phase Readiness

- **Plan 22-05 (D-26 bulk tag operations)** unblocked — `arraysEqualCaseInsensitive` is now available in cameras.service.ts for the bulk-tag-change diff path, and the sanitizer's `diff` key preservation is pinned by tests so the bulk audit emissions can rely on it.
- **Plan 22-08 (UI: tag chip column + edit)** unblocked indirectly — the audit trail surfaced in the Activity tab of a camera will now show structured before/after diffs that the UI can render natively (no JSON-string parsing needed).
- **Audit consumers (admin audit log page)** — The `camera.metadata.update` action is a NEW value in the AuditLog.action column; if any UI filter has a hardcoded allowlist of action names, it should be extended to include this. The existing AuditLog page renders `details` as JSON unconditionally, so no UI change is required for visibility.

## Self-Check: PASSED

Verified file presence (modified):

```
EXISTS: apps/api/src/cameras/cameras.service.ts
EXISTS: apps/api/src/audit/audit.service.ts
EXISTS: apps/api/tests/cameras/audit-diff.test.ts
EXISTS: apps/api/tests/audit/sanitizer-diff.test.ts
```

Verified commit reachability (4 commits this plan):

```
FOUND: 4c10cce (Task 1 RED — sanitizer-diff failing tests)
FOUND: 965f44f (Task 1 GREEN — export sanitizeDetails)
FOUND: 4edc2a4 (Task 2 RED — audit-diff failing tests)
FOUND: 723e4a9 (Task 2 GREEN — updateCamera emits diff)
```

Verified all tests pass:

```
api: tests/audit/sanitizer-diff.test.ts  → 4/4 passing
api: tests/cameras/audit-diff.test.ts    → 7/7 passing
api: tests/audit/ + tests/cameras/        → 188/188 passing (44 todos, 0 failures)
api: build (nest build)                   → exit 0, 166 files compiled with swc
```

Verified acceptance grep contract from PLAN.md:

```
✓ "const diff: Record<string, ..." in cameras.service.ts updateCamera body — 1 match (line 458)
✓ "arraysEqualCaseInsensitive" — 2 matches (definition line 47 + call site line 462)
✓ "details: { diff }" composition includes diff conditionally — 1 match (line 485)
✓ Negative check — Camera CREATE path at cameras.service.ts:240-250 unchanged (still emits {streamKeyPrefix} only, no diff)
✓ audit-diff.test.ts contains 0 it.todo — 7 it() cases
✓ sanitizer-diff.test.ts contains 0 it.todo — 4 it() cases
✓ "export function sanitizeDetails" in audit.service.ts — 1 match (line 12)
```

---
*Phase: 22-camera-metadata-utilization-surface-tags-description-across-*
*Completed: 2026-04-26*
