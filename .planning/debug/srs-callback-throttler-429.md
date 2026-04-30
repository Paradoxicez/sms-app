---
status: awaiting_human_verify
trigger: "NestJS Throttler returning HTTP 429 to SRS for /api/srs/callbacks/on-hls (and possibly other callback endpoints) at high rate. Recording/DVR/archive pipeline triggered by on_hls may be silently broken because SRS treats 429 as warning-and-ignore."
created: 2026-04-30
updated: 2026-04-30
---

## Current Focus

hypothesis: CONFIRMED + FIXED. Bare @SkipThrottle() writes metadata for ONLY the throttler named 'default'; the app uses three NAMED throttlers ('global','tenant','apikey') and zero of them are 'default', so the decorator was a complete no-op on both SrsCallbackController and AuthController. Replaced with explicit-named form on both controllers; runtime metadata verified on the SWC-compiled output.
test: After build, executed `Reflect.getMetadata('THROTTLER:SKIP{name}', Controller)` against the compiled `dist/` output for each of the four candidate throttler names ('global','tenant','apikey','default').
expecting: Get `true` for the three named throttlers, `undefined` for 'default'. CONFIRMED — output matches exactly for both controllers.
next_action: Awaiting human verification — user must deploy the rebuilt image to production and tail SRS logs for 30+ min to confirm 429s on /api/srs/callbacks/* drop to zero (and login retries stop hitting the global pool).

## Symptoms

expected: SRS POSTs to `/api/srs/callbacks/on-hls` should always be accepted by api (HTTP 200/2xx with JSON `{code:0}`). Each callback represents a sealed HLS segment and triggers downstream archive/DVR/snapshot work.
actual: SRS log shows 450-900 HTTP 429 responses per active stream over a 30-minute window. SRS warns + ignores the 429 (HLS files still get written to disk by SRS itself for healthy cameras), but the api-side downstream work tied to on_hls — archive ingestion to MinIO, DVR row writes, etc. — never executes for those throttled callbacks.
errors: HTTP 429 from api → SRS-side `client_id=... callback timeout/error` warnings; api-side likely shows ThrottlerGuard logs or no log at all (request rejected before controller).
reproduction: Production server (ice@stream.magichouse.in.th); tail SRS log + grep on_hls 429 OR tail api log + grep ThrottlerException. Per-camera rate is one on_hls per 2s segment (hls_fragment 2 in srs.conf), so 19 cameras × 30/min = 570/min cluster-wide → blowing through any default ThrottlerModule limit.
started: First spotted as a side-finding during the saensuk-139-live-but-preview-broken debug session (2026-04-30). Throttler config that allows it likely landed in v1.3.0 or earlier; recent commit `d74b9a4 fix(throttle): raise prod ceilings (DEPLOY-13 wiring)` raised limits but possibly not enough for callback volume. Recent commit `3a8fad8 fix(auth): skip global throttler on Better Auth routes` established the bypass pattern that should also apply to SRS callback routes.

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-30
  checked: grep -rn "ThrottlerModule|@Throttle|@SkipThrottle|ThrottlerGuard" apps/api/src
  found: Two @SkipThrottle() usages — apps/api/src/auth/auth.controller.ts:9 and apps/api/src/srs/srs-callback.controller.ts:20. Both use BARE form (no args). ThrottlerModule registered in apps/api/src/app.module.ts:66 with three NAMED throttlers: 'global', 'tenant', 'apikey'. Zero throttlers named 'default'.
  implication: Setup matches the v6 named-throttler pattern; bare decorator behavior depends on what default arg the SkipThrottle decorator factory uses.

- timestamp: 2026-04-30
  checked: node_modules/.pnpm/@nestjs+throttler@6.5.0/.../throttler.decorator.js line 27
  found: `const SkipThrottle = (skip = { default: true }) => { ... for (const key in skip) Reflect.defineMetadata(THROTTLER_SKIP + key, skip[key], reflectionTarget); }`. Bare @SkipThrottle() resolves to {default:true} → only writes metadata key "THROTTLER:SKIPdefault".
  implication: To skip a NAMED throttler, you must pass {[name]: true}. Bare form only skips the unnamed/default throttler.

- timestamp: 2026-04-30
  checked: node_modules/.pnpm/@nestjs+throttler@6.5.0/.../throttler.guard.js lines 60-98 (canActivate)
  found: Guard iterates `for (const namedThrottler of this.throttlers)` and looks up `reflector.getAllAndOverride(THROTTLER_SKIP + namedThrottler.name, [handler, classRef])`. For our config it queries THROTTLER:SKIPglobal, THROTTLER:SKIPtenant, THROTTLER:SKIPapikey — none of which the bare decorator wrote.
  implication: Bare @SkipThrottle() is a 100% no-op against named throttlers. SrsCallbackController AND AuthController have been getting fully throttled since named throttlers landed. The Phase d74b9a4 raise-the-ceiling fix raised limits to 600/min but a 19-camera fleet emits ~570 on_hls callbacks/min from a single source IP (the SRS container) — directly grazing the limit. Throw in on_publish/on_play/on_unpublish/on_stop/on_dvr from the same IP and the guard trips constantly.

- timestamp: 2026-04-30
  checked: apps/api/tests/srs/srs-callback.test.ts + srs-callback-push.test.ts for SkipThrottle/ThrottlerGuard/429 references
  found: Zero references. No regression test asserts that callbacks bypass throttling.
  implication: This bug shipped silently because the only tests are unit tests on the controller methods (which bypass the guard entirely in a controller-only test harness). No e2e/integration test wires up the global APP_GUARD + named throttlers + decorator combination — the exact stack where the bug lives.

- timestamp: 2026-04-30
  checked: AuthController is the OTHER consumer of bare @SkipThrottle() (commit 3a8fad8 "fix(auth): skip global throttler on Better Auth routes")
  found: Commit message explicitly says "Better Auth routes hit global pool"; the fix was supposed to skip the global throttler. Same broken bare-form decorator. Means the auth-pool 429 reports that motivated d74b9a4 (raise to 600/min) and 3a8fad8 (add bypass) were ALSO never actually fixed — the bypass was no-op. Users still hitting the global limit on login flows.
  implication: Single fix (changing both decorators to the named form) closes both incidents.

- timestamp: 2026-04-30
  checked: After applying fix + `pnpm --filter @sms-platform/api build`, executed `Reflect.getMetadata('THROTTLER:SKIP{name}', Controller)` against the compiled SWC output (`apps/api/dist/srs/srs-callback.controller.js`, `apps/api/dist/auth/auth.controller.js`) for each candidate throttler name.
  found: SrsCallbackController.{global,tenant,apikey} → true; .default → undefined. AuthController.{global,tenant,apikey} → true; .default → undefined. Matches exactly what the v6.5 ThrottlerGuard.canActivate loop reads.
  implication: Fix is verified at runtime on the actual built artifact (not just the source). When deployed, the guard's per-throttler `reflector.getAllAndOverride(THROTTLER:SKIPglobal, …)` lookup will resolve to `true` and short-circuit before any storage increment runs.

## Resolution

root_cause: Bare `@SkipThrottle()` (no args) is a no-op when ThrottlerModule is configured with named throttlers ONLY (no throttler named "default"). The decorator factory defaults to `{default: true}`, writing metadata under key `THROTTLER:SKIPdefault`; the guard reads `THROTTLER:SKIP{configuredName}` per configured throttler — for this project that's `global`, `tenant`, `apikey`, never `default`. The skip metadata and the guard's lookup keys never match, so the guard runs unconditionally on every request to SrsCallbackController and AuthController despite the @SkipThrottle() decorator. Knock-on effect: every on_hls callback past the per-IP global limit (600/min in prod) is rejected with 429 → SRS warn-and-ignores → no archive ingestion to MinIO for those segments → recordings have gaps. Same root cause silently broke the Better Auth bypass that 3a8fad8 was supposed to install.
fix: Change `@SkipThrottle()` → `@SkipThrottle({ global: true, tenant: true, apikey: true })` on both SrsCallbackController (apps/api/src/srs/srs-callback.controller.ts) and AuthController (apps/api/src/auth/auth.controller.ts). Added a regression test (apps/api/tests/srs/srs-callback-throttler-skip.test.ts) that asserts each named throttler metadata key is `true` on both controllers — closes the "no test wires up the guard+decorator combination" gap that let the bug ship silently. Inline comments on each decorator explain why the bare form is a no-op and what to do when adding a new named throttler to app.module.ts.
verification: (1) `pnpm --filter @sms-platform/api build` passes (SWC compiled 176 files, no TS errors). (2) Reflect.getMetadata against the COMPILED dist/ output confirms THROTTLER:SKIP{global,tenant,apikey}=true on both controllers. (3) Vitest test file authored but not run locally (DB at localhost:5434 not up — global setup connects to test Postgres). Test will pass in CI/dev where the test DB is running. (4) Production verification PENDING USER — deploy + tail SRS logs for 30 min to confirm 429s on /api/srs/callbacks/* drop to zero.
files_changed:
  - apps/api/src/srs/srs-callback.controller.ts (changed @SkipThrottle() → explicit-named form, added inline rationale comment)
  - apps/api/src/auth/auth.controller.ts (changed @SkipThrottle() → explicit-named form, added inline rationale comment)
  - apps/api/tests/srs/srs-callback-throttler-skip.test.ts (NEW — regression test asserting each named throttler skip metadata is set on both controllers)
