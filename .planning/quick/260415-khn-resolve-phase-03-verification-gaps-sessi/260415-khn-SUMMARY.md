---
phase: quick/260415-khn
plan: 01
subsystem: playback, policies
tags: [backend, phase-03-verification, tdd]
requires: []
provides:
  - GET /api/playback/sessions?cameraId=X&limit=N
  - ResolvedPolicy.sources field with per-field PolicyLevel
affects:
  - apps/web/src/app/admin/cameras/components/sessions-table.tsx (now receives real data)
  - apps/web/src/app/admin/policies/components/resolved-policy-card.tsx (now renders level badges)
tech-stack:
  added: []
  patterns:
    - Route-ordering guard (/playback/sessions before /playback/sessions/:id)
    - Sources tracking via priority-sorted merge loop with defaulted-to-SYSTEM
key-files:
  created: []
  modified:
    - apps/api/src/playback/playback.service.ts
    - apps/api/src/playback/playback.controller.ts
    - apps/api/src/policies/policies.service.ts
    - apps/api/tests/playback/playback.test.ts
    - apps/api/tests/policies/policies.test.ts
decisions:
  - "[quick/260415-khn-01] Route /playback/sessions declared BEFORE /playback/sessions/:id so ?cameraId=... does not bind to :id param"
  - "[quick/260415-khn-01] listSessionsByCamera returns expired sessions too because the UI renders Expired badge via isExpired(expiresAt)"
  - "[quick/260415-khn-01] Limit clamped to [1, 100], default 20"
  - "[quick/260415-khn-02] Sources default to 'SYSTEM' up-front so no-policy fallback (Test E) and unset scalar fields naturally report 'SYSTEM'"
  - "[quick/260415-khn-02] sources.domains tracks policies[0].level (highest priority) matching existing domains merge logic"
metrics:
  duration: ~15min
  completed: 2026-04-15
---

# Quick Task 260415-khn: Resolve Phase 03 Verification Gaps Summary

Backend-only closure of the two Phase-03 VERIFICATION gaps: a playback-sessions list endpoint for a camera and per-field `sources` tracking on `PoliciesService.resolve()`. Both gaps were frontend components expecting shapes that the API did not yet produce.

## Gap 1 — `GET /api/playback/sessions?cameraId=X&limit=N`

**Service** (`apps/api/src/playback/playback.service.ts`)
`listSessionsByCamera(cameraId, orgId, limit = 20)`:
1. Looks up the camera and rejects with `NotFoundException` if missing or in another org (defense in depth on top of TENANCY_CLIENT).
2. Clamps `limit` to `[1, 100]`.
3. Returns `playbackSession.findMany` with `select: { id, createdAt, expiresAt }`, ordered `createdAt DESC`.

Deliberately does not filter by `expiresAt` — the UI renders an Expired badge via `isExpired(expiresAt)` (`sessions-table.tsx` lines 52-53, 138-147), so filtering would hide legitimate rows.

**Controller** (`apps/api/src/playback/playback.controller.ts`)
`@Get('playback/sessions')` guarded by `AuthOrApiKeyGuard`. Declared **before** `@Get('playback/sessions/:id')` so Nest does not bind `?cameraId=...` to the `:id` parameter route — this is the critical ordering gotcha for the feature. Parses `limit` defensively (falls back to 20 for non-numeric input).

## Gap 2 — `sources` field on `PoliciesService.resolve()`

**Type**
Exported `PolicyLevel` (`'CAMERA' | 'SITE' | 'PROJECT' | 'SYSTEM'`) and extended `ResolvedPolicy` with a required `sources: { ttlSeconds, maxViewers, domains, allowNoReferer, rateLimit }` each typed `PolicyLevel`.

**Logic**
`sources` initialized to `'SYSTEM'` for every field up front. This gives Test E (no policies at all → hardcoded defaults) and any scalar field that no policy supplies the correct default without any branching. During the priority-sorted merge, each scalar field's source is set to `policy.level` of the first policy with a non-null value. `sources.domains` tracks `policies[0].level` — the highest-priority policy — mirroring the existing domains merge (which already takes policies[0].domains since Prisma defaults domains to `[]`).

**Back-compat:** additive change. The sole backend caller (`playback.service.ts:59`) reads `ttlSeconds`, `maxViewers`, `domains`, `allowNoReferer` — all unchanged. Frontend already declared `sources?: Record<string, PolicyLevel>` so no web changes required.

## Tests Added

**tests/playback/playback.test.ts** — new `describe('GET /playback/sessions (listSessionsByCamera)')` with 6 cases:
- A. Filters by cameraId and orders createdAt DESC
- B. Limit caps result count; default 20 applied when omitted
- C. Returned shape is exactly `{ id, createdAt, expiresAt }` (no token/hlsUrl)
- D. Expired sessions included
- E. Cross-org isolation — camera in another org → NotFoundException
- F. Unknown camera id → NotFoundException

**tests/policies/policies.test.ts** — new `describe('POL-02: resolve returns sources ...')` with 5 cases (A-E from plan), instantiated via `new PoliciesService(testPrisma as any)` (option (b) from plan — exercises the real service).

## Verification

- `pnpm --filter api test tests/playback tests/policies`: **40 passed / 6 todo / 0 failed**
- `pnpm --filter api tsc --noEmit`: clean for modified files (3 pre-existing errors in `cluster.gateway.ts`, `minio.service.ts`, `status.gateway.ts` — unrelated, out of scope)
- `pnpm --filter web tsc --noEmit`: clean

## Deviations from Plan

None. Plan executed exactly as written.

## Pre-existing Issues Observed (Out of Scope)

- 12 test failures across `tests/auth/*`, `tests/admin/super-admin.test.ts`, `tests/cluster/*`, `tests/packages/*`, `tests/srs/config-generator.test.ts`, `tests/streams/*` — none touch playback or policies. Not fixed per scope boundary.
- 3 TS2564 errors in `cluster.gateway.ts`, `minio.service.ts`, `status.gateway.ts` — pre-existing property-initializer warnings unrelated to this task.

## Commits

| Commit | Message |
|--------|---------|
| c4ed318 | test(quick/260415-khn-01): add failing tests for listSessionsByCamera |
| 7bb8b7a | feat(quick/260415-khn-01): add GET /api/playback/sessions list endpoint |
| 9dd8aee | test(quick/260415-khn-02): add failing tests for sources tracking in resolve() |
| 671a2ad | feat(quick/260415-khn-02): add sources tracking to PoliciesService.resolve() |

## Self-Check: PASSED

- FOUND: apps/api/src/playback/playback.service.ts (listSessionsByCamera)
- FOUND: apps/api/src/playback/playback.controller.ts (GET /playback/sessions)
- FOUND: apps/api/src/policies/policies.service.ts (sources field)
- FOUND: apps/api/tests/playback/playback.test.ts (new describe block)
- FOUND: apps/api/tests/policies/policies.test.ts (POL-02 describe block)
- FOUND commit: c4ed318
- FOUND commit: 7bb8b7a
- FOUND commit: 9dd8aee
- FOUND commit: 671a2ad
