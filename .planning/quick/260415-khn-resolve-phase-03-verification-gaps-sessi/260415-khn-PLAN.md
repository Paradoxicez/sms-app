---
phase: quick/260415-khn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/playback/playback.service.ts
  - apps/api/src/playback/playback.controller.ts
  - apps/api/src/policies/policies.service.ts
  - apps/api/tests/playback/playback.test.ts
  - apps/api/tests/policies/policies.test.ts
autonomous: true
requirements:
  - PHASE-03-VERIFICATION-GAP-1
  - PHASE-03-VERIFICATION-GAP-2

must_haves:
  truths:
    - "GET /api/playback/sessions?cameraId=X&limit=N returns an array of session summaries (id, createdAt, expiresAt) for that camera, scoped to the caller's org, ordered createdAt DESC"
    - "sessions-table.tsx now renders real sessions from the new endpoint instead of the empty state"
    - "GET /api/policies/resolve/:cameraId returns a sources object indicating which PolicyLevel (CAMERA/SITE/PROJECT/SYSTEM) each resolved field was inherited from"
    - "ResolvedPolicyCard displays source-level badges next to each field because data.sources.* is populated"
    - "Both gaps are covered by automated tests (pnpm --filter api test) that exercise the new behaviour"
  artifacts:
    - path: "apps/api/src/playback/playback.service.ts"
      provides: "listSessionsByCamera(cameraId, orgId, limit) method"
      contains: "listSessionsByCamera"
    - path: "apps/api/src/playback/playback.controller.ts"
      provides: "GET /playback/sessions?cameraId=X&limit=N route"
      contains: "@Get('playback/sessions')"
    - path: "apps/api/src/policies/policies.service.ts"
      provides: "resolve() returns sources field on ResolvedPolicy"
      contains: "sources"
    - path: "apps/api/tests/playback/playback.test.ts"
      provides: "Test for listSessionsByCamera behaviour (filter, limit, ordering, org scoping)"
    - path: "apps/api/tests/policies/policies.test.ts"
      provides: "Test for resolve() returning sources mapped to originating PolicyLevel per field"
  key_links:
    - from: "apps/web/src/app/admin/cameras/components/sessions-table.tsx"
      to: "GET /api/playback/sessions?cameraId=X&limit=N"
      via: "apiFetch in fetchSessions"
      pattern: "playback/sessions\\?cameraId"
    - from: "apps/web/src/app/admin/policies/components/resolved-policy-card.tsx"
      to: "PoliciesService.resolve() sources field"
      via: "data.sources.<field> -> PolicyLevelBadge"
      pattern: "sources\\?"
---

<objective>
Close the two remaining gaps from `.planning/phases/03-playback-security/03-VERIFICATION.md` by adding the backend endpoints/fields that existing frontend components already expect.

Purpose: The frontend for Phase 03 was completed correctly but is currently disconnected from the backend in two places — sessions list for a camera, and policy-source tracking on resolve. Both are small, backend-only additions. No schema changes, no frontend changes.

Output: A new list endpoint for playback sessions scoped to a camera, and a `sources` field on the resolved-policy response, both with automated tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/phases/03-playback-security/03-VERIFICATION.md
@apps/api/src/playback/playback.service.ts
@apps/api/src/playback/playback.controller.ts
@apps/api/src/policies/policies.service.ts
@apps/web/src/app/admin/cameras/components/sessions-table.tsx
@apps/web/src/app/admin/policies/components/resolved-policy-card.tsx

<interfaces>
<!-- Frontend contracts the backend must satisfy. Do not change these. -->

Frontend expects for gap #1 (sessions-table.tsx lines 24-28, 63-64):
```typescript
// Request:  GET /api/playback/sessions?cameraId=<uuid>&limit=<number>
// Response: PlaybackSession[]
interface PlaybackSession {
  id: string;
  createdAt: string;  // ISO
  expiresAt: string;  // ISO
}
// Frontend renders both Active and Expired rows (uses isExpired()),
// so backend should return ALL sessions (not filter by expiresAt), ordered by createdAt DESC.
```

Frontend expects for gap #2 (resolved-policy-card.tsx lines 12-19, 98-131):
```typescript
type PolicyLevel = 'SYSTEM' | 'PROJECT' | 'SITE' | 'CAMERA';
interface ResolvedPolicy {
  ttlSeconds: number;
  maxViewers: number;
  domains: string[];
  allowNoReferer: boolean;
  rateLimit: number;
  sources?: Record<string, PolicyLevel>;
  // Specifically read: sources.ttlSeconds, sources.maxViewers,
  // sources.domains, sources.allowNoReferer, sources.rateLimit
}
```

Existing backend types:
```typescript
// apps/api/src/policies/policies.service.ts
export interface ResolvedPolicy {
  ttlSeconds: number;
  maxViewers: number;
  domains: string[];
  allowNoReferer: boolean;
  rateLimit: number;
}
// LEVEL_PRIORITY: CAMERA=0, SITE=1, PROJECT=2, SYSTEM=3
```

Tenancy pattern: controllers pull orgId via `this.cls.get('ORG_ID')` and pass it to services; Prisma client is org-scoped via TENANCY_CLIENT extension, so `this.prisma.playbackSession.findMany({ where: { cameraId } })` is already limited to the active org.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add GET /api/playback/sessions list endpoint</name>
  <files>
    apps/api/src/playback/playback.service.ts,
    apps/api/src/playback/playback.controller.ts,
    apps/api/tests/playback/playback.test.ts
  </files>
  <behavior>
    - Test A: `listSessionsByCamera(cameraId, orgId, limit)` returns sessions for that camera only, ordered createdAt DESC.
    - Test B: Sessions from a different camera in the same org are excluded.
    - Test C: `limit` parameter caps result count; default applied when omitted (default 20).
    - Test D: Returned objects contain only `{ id, createdAt, expiresAt }` (not token, not hlsUrl) — shape matches frontend `PlaybackSession` interface.
    - Test E: Expired sessions ARE included (frontend renders Expired badge, relies on receiving them).
    - Test F: Cross-org isolation — a session in another org is NOT returned (relies on TENANCY_CLIENT filter; verify with two orgs).
  </behavior>
  <action>
    1. **Service method** — In `apps/api/src/playback/playback.service.ts`, add:
       ```typescript
       async listSessionsByCamera(cameraId: string, orgId: string, limit: number = 20) {
         // Verify camera belongs to org (defense in depth; tenancy client also filters)
         const camera = await this.prisma.camera.findUnique({ where: { id: cameraId } });
         if (!camera || camera.orgId !== orgId) {
           throw new NotFoundException(`Camera ${cameraId} not found`);
         }
         const safeLimit = Math.min(Math.max(limit, 1), 100);
         const sessions = await this.prisma.playbackSession.findMany({
           where: { cameraId },
           orderBy: { createdAt: 'desc' },
           take: safeLimit,
           select: { id: true, createdAt: true, expiresAt: true },
         });
         return sessions;
       }
       ```
       Do NOT filter by `expiresAt` — the frontend shows both Active and Expired badges and relies on receiving all.

    2. **Controller route** — In `apps/api/src/playback/playback.controller.ts`, add a new route. **CRITICAL ORDERING:** place it BEFORE `@Get('playback/sessions/:id')` so Nest does not match `sessions?cameraId=...` against the `:id` param route. Use `AuthOrApiKeyGuard` (same as other session endpoints):
       ```typescript
       @Get('playback/sessions')
       @UseGuards(AuthOrApiKeyGuard)
       @ApiOperation({ summary: 'List playback sessions for a camera' })
       @ApiResponse({ status: 200, description: 'Array of session summaries ordered createdAt DESC' })
       @ApiResponse({ status: 400, description: 'cameraId query param required' })
       @ApiResponse({ status: 404, description: 'Camera not found' })
       @ApiSecurity('api-key')
       async listSessions(
         @Query('cameraId') cameraId: string,
         @Query('limit') limit?: string,
       ) {
         if (!cameraId) {
           throw new BadRequestException('cameraId query parameter is required');
         }
         const parsedLimit = limit ? parseInt(limit, 10) : 20;
         const safe = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
         return this.playbackService.listSessionsByCamera(cameraId, this.getOrgId(), safe);
       }
       ```

    3. **Tests** — In `apps/api/tests/playback/playback.test.ts`, add a new `describe('GET /playback/sessions (listSessionsByCamera)', ...)` block that:
       - Creates two orgs, each with camera hierarchy via existing helpers
       - Seeds 3 sessions on cameraA (varied createdAt), 1 on cameraB (same org), 1 on otherOrg camera
       - Calls a small helper that invokes the same Prisma logic with tenancy scoping (follow the existing test style in this file — it stubs service logic with direct Prisma calls)
       - Asserts ordering, limit, cross-camera filter, cross-org isolation, shape is `{id, createdAt, expiresAt}`, expired sessions are returned
       Match the existing pattern in this file (direct Prisma + testPrisma), not full Nest e2e.

    **Why not filter expired:** `sessions-table.tsx` lines 52-53, 138-147 render an Expired badge via `isExpired(expiresAt)` — filtering would make the Expired state unreachable.
  </action>
  <verify>
    <automated>cd apps/api && pnpm test tests/playback/playback.test.ts && pnpm tsc --noEmit</automated>
  </verify>
  <done>
    - New route `GET /api/playback/sessions?cameraId=X&limit=N` returns `{id, createdAt, expiresAt}[]` ordered createdAt DESC
    - Route declared BEFORE `GET /playback/sessions/:id` so route matching works
    - `listSessionsByCamera` throws 404 if camera not in org
    - New test block passes, covering ordering/limit/filter/cross-org/shape/expired-included
    - `pnpm --filter api tsc --noEmit` clean
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add sources tracking to PoliciesService.resolve()</name>
  <files>
    apps/api/src/policies/policies.service.ts,
    apps/api/tests/policies/policies.test.ts
  </files>
  <behavior>
    - Test A: All 4 levels defined — `sources` reports CAMERA for every scalar field when a CAMERA-level policy supplies them (highest priority).
    - Test B: Partial override — CAMERA policy sets only `ttlSeconds`, leaves others null; `sources.ttlSeconds === 'CAMERA'` while `sources.maxViewers` etc. come from the next highest priority policy that provides the value (SITE/PROJECT/SYSTEM).
    - Test C: Only SYSTEM policy exists → every field in `sources` is `'SYSTEM'`.
    - Test D: `domains` — the policy that wins the domains assignment (highest priority policy in the list, since all have non-null arrays) is reflected in `sources.domains`.
    - Test E: When no policies at all exist, resolve falls back to hardcoded SYSTEM_DEFAULTS; in that case `sources` should still report `'SYSTEM'` for every field (defaults are conceptually SYSTEM).
  </behavior>
  <action>
    1. **Extend the type** at the top of `apps/api/src/policies/policies.service.ts`:
       ```typescript
       export type PolicyLevel = 'CAMERA' | 'SITE' | 'PROJECT' | 'SYSTEM';

       export interface ResolvedPolicy {
         ttlSeconds: number;
         maxViewers: number;
         domains: string[];
         allowNoReferer: boolean;
         rateLimit: number;
         sources: {
           ttlSeconds: PolicyLevel;
           maxViewers: PolicyLevel;
           domains: PolicyLevel;
           allowNoReferer: PolicyLevel;
           rateLimit: PolicyLevel;
         };
       }
       ```

    2. **Update `resolve()`** (lines 137-189). After sorting `policies` by LEVEL_PRIORITY, track the source during the merge loop:
       ```typescript
       const sources: ResolvedPolicy['sources'] = {
         ttlSeconds: 'SYSTEM',
         maxViewers: 'SYSTEM',
         domains: 'SYSTEM',
         allowNoReferer: 'SYSTEM',
         rateLimit: 'SYSTEM',
       };

       const scalarFields = ['ttlSeconds', 'maxViewers', 'allowNoReferer', 'rateLimit'] as const;
       for (const field of scalarFields) {
         for (const policy of policies) {
           const value = policy[field];
           if (value !== null && value !== undefined) {
             (resolved as any)[field] = value;
             sources[field] = policy.level as PolicyLevel;
             break;
           }
         }
       }

       if (policies.length > 0) {
         resolved.domains = policies[0].domains;
         sources.domains = policies[0].level as PolicyLevel;
       }

       return { ...resolved, sources };
       ```

       Notes:
       - Defaulting `sources[field] = 'SYSTEM'` handles the "no policies" fallback (Test E) and the case where no policy supplies that scalar.
       - `sources.domains` tracks the highest-priority policy's level (matches existing domains logic).

    3. **Update the `ResolvedPolicy` return type signature** of `resolve()` — `Promise<ResolvedPolicy>` — and ensure no callers break. Grep `resolve(` call sites: `playback.service.ts:59` uses `resolved.ttlSeconds`, `resolved.maxViewers`, `resolved.domains`, `resolved.allowNoReferer`. Adding `sources` is additive; existing usage remains compatible. `policies.controller.ts` resolve endpoint just returns the object, so `sources` will naturally flow to the frontend.

    4. **Tests** — In `apps/api/tests/policies/policies.test.ts`, extend the existing `describe('POL-01/POL-02')` block (or add a sibling `describe('POL-02: resolve returns sources')`). The file currently tests via a local `resolvePolicy()` helper — either:
       - (a) Update that helper to return `sources` too, OR
       - (b) Write new tests that import the real `PoliciesService` and exercise its `resolve()` via a direct instance with `testPrisma` injected.

       Option (a) is lighter but doesn't test the real service. Prefer option (b): instantiate `new PoliciesService(testPrisma as any)` and call `.resolve(camera.id)` for the new tests. Cover all 5 behavior cases (A-E).

    5. **Frontend type compatibility check** — `resolved-policy-card.tsx` line 18 already declares `sources?: Record<string, PolicyLevel>` — no frontend changes needed.
  </action>
  <verify>
    <automated>cd apps/api && pnpm test tests/policies/policies.test.ts && pnpm tsc --noEmit && cd ../web && pnpm tsc --noEmit</automated>
  </verify>
  <done>
    - `PoliciesService.resolve()` returns `sources` with a PolicyLevel for each of the 5 fields
    - Default is `'SYSTEM'` when no policy supplies a field
    - Domains source tracks the highest-priority policy's level
    - `ResolvedPolicy` interface exported with `sources` field
    - All new behavior tests pass
    - `pnpm --filter api tsc --noEmit` and `pnpm --filter web tsc --noEmit` both clean
  </done>
</task>

</tasks>

<verification>
Run from repo root:
```bash
pnpm --filter api test
pnpm --filter api tsc --noEmit
pnpm --filter web tsc --noEmit
```

All three must succeed. The web tsc check catches any type drift in `resolved-policy-card.tsx` or `sessions-table.tsx` consumers.

Manual spot-check (optional, not required for plan completion):
1. Start API + web, open `/admin/cameras/<id>` → Sessions tab shows real rows (if any sessions exist) or empty state.
2. Open `/admin/policies` → resolve panel shows level badges next to each field.
</verification>

<success_criteria>
- [ ] Both VERIFICATION gaps closed:
  - [ ] Gap 1: `GET /api/playback/sessions?cameraId=X&limit=N` returns `PlaybackSession[]` matching frontend shape
  - [ ] Gap 2: `resolve()` returns `sources` field with per-field PolicyLevel
- [ ] Automated tests cover both additions
- [ ] `pnpm --filter api test` passes
- [ ] `pnpm --filter api tsc --noEmit` passes
- [ ] `pnpm --filter web tsc --noEmit` passes
- [ ] No frontend files modified (frontend already expects these shapes)
- [ ] No Prisma schema changes
</success_criteria>

<output>
After completion, create `.planning/quick/260415-khn-resolve-phase-03-verification-gaps-sessi/260415-khn-SUMMARY.md` documenting:
- The list endpoint implementation (route ordering caveat, limit bounds, expired-included rationale)
- The sources-tracking implementation (default 'SYSTEM', domains behaviour)
- Test coverage added
- Any deviations from plan
</output>
