---
phase: 26-production-compose-migrate-init-networking-volumes
plan: 01
subsystem: infra
tags: [minio, prisma, init-container, idempotent, deploy, sms-migrate]

requires:
  - phase: 25-multi-stage-dockerfiles-image-hardening
    provides: "apps/api Dockerfile builder stage runs `pnpm build` (SWC) so apps/api/src/scripts/*.ts compiles to apps/api/dist/scripts/*.js inside the runtime image"

provides:
  - "apps/api/src/scripts/init-buckets.ts — MinIO bootstrap (avatars public-read, recordings private), idempotent via bucketExists guard"
  - "apps/api/src/scripts/seed-stream-profile.ts — per-org default StreamProfile seed, idempotent via per-org count guard, fresh-VM no-orgs case handled"
  - "Two compiled entry scripts at dist/scripts/init-buckets.js and dist/scripts/seed-stream-profile.js ready for sms-migrate to chain after `prisma migrate deploy`"

affects:
  - 26-03 (compose YAML — sms-migrate command chain consumes these scripts)
  - 26-02 (env-secrets layout — these scripts define the MinIO env-var contract: MINIO_ENDPOINT, MINIO_PORT, MINIO_USE_SSL, plus root/access cred fallback pairs)
  - 29-deploy-scripts (bin/sms create-admin path — populates Organization rows, after which subsequent compose `up -d` re-runs seed-stream-profile and back-fills the default profile)

tech-stack:
  added: []
  patterns:
    - "Standalone Node entry script (no NestJS DI / no app bootstrap) for init-container workloads — bypasses module loader cost and matches D-04 contract"
    - "Idempotent guard pattern: existence-check via SDK (bucketExists / count) BEFORE mutating call (makeBucket / create) so re-runs are no-ops"
    - "Fail-fast contract: process.exit(1) inside .catch(...) ensures non-zero exit even with pending event-loop sockets, so sms-migrate halts the chain and api stays at Created state (D-03)"
    - "PrismaClient with explicit datasourceUrl: DATABASE_URL_MIGRATE ?? DATABASE_URL to pin seeds to the migrate role (rolbypassrls=true) — mirrors apps/api/src/prisma/seed.ts:19-21"

key-files:
  created:
    - apps/api/src/scripts/init-buckets.ts
    - apps/api/src/scripts/seed-stream-profile.ts
  modified: []

key-decisions:
  - "Schema correction vs CONTEXT D-13: actual StreamProfile model uses codec/resolution/fps/videoBitrate/audioCodec/audioBitrate (NOT D-13 sample's videoCodec/width/height/framerate/gopSize). Used real schema fields with the same 1080p H.264 / 2500kbps / 25fps intent."
  - "Per-org count guard vs global count guard: DEPLOY-16 says 'default Stream Profile if no profiles exist'. Because StreamProfile.orgId is REQUIRED (NOT NULL), 'no profiles' must be evaluated PER organization — a global count > 0 early-return would never seed for org N once org 1 has profiles."
  - "Fresh-VM (zero orgs) graceful path: log + exit 0 instead of throw. The fresh deploy boot sequence is compose up → sms-migrate → api up → operator runs bin/sms create-admin (Phase 29) → operator restarts compose. Throwing would block the api boot before create-admin can run."
  - "MinIO env var fallback chain: MINIO_ACCESS_KEY → MINIO_ROOT_USER → 'minioadmin' literal (and same for secret). Lets the same image work in init-container mode (compose env passes MINIO_ROOT_USER/MINIO_ROOT_PASSWORD) AND api runtime mode (existing MINIO_ACCESS_KEY/MINIO_SECRET_KEY in apps/api/src/recordings/minio.service.ts)."
  - "No setBucketPolicy on recordings bucket: D-10 keeps recordings private (default). Future flows use signed URLs from the api. An explicit deny-all policy would interfere with SDK-level signed-URL auth."

patterns-established:
  - "src/scripts/ is the home for SWC-compiled standalone Node entry scripts intended for one-shot container execution (not NestJS modules). Future init/migration/admin scripts should land here."
  - "Init scripts read ALL config from process.env with documented fallbacks — no @nestjs/config, no .env.local discovery — because init containers run pre-NestJS"

requirements-completed:
  - DEPLOY-15
  - DEPLOY-16

duration: ~2min
completed: 2026-04-28
---

# Phase 26 Plan 01: Migrate-init Bootstrap Scripts (MinIO Buckets + Default Stream Profile) Summary

**Two idempotent standalone Node entry scripts that the sms-migrate init container chains after `prisma migrate deploy` — `init-buckets.ts` creates `avatars` (public-read) and `recordings` (private) MinIO buckets, `seed-stream-profile.ts` seeds a default 1080p H.264 / 2500kbps / 25fps StreamProfile for every org with zero profiles.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-28T00:06:00Z (approximate, post-install)
- **Completed:** 2026-04-28T00:08:30Z
- **Tasks:** 2 / 2
- **Files modified:** 2 (both created — no existing files mutated)

## Accomplishments

- Closed DEPLOY-15: `init-buckets.ts` creates `avatars` (public-read s3:GetObject policy, D-11) and `recordings` (private, D-10) buckets; idempotent on every re-run via `Client.bucketExists()` guard before `makeBucket()`.
- Closed DEPLOY-16: `seed-stream-profile.ts` iterates every Organization, inserts one default profile (`isDefault: true`) for any org with zero profiles; idempotent per-org via `prisma.streamProfile.count()`; gracefully exits 0 on a fresh VM with zero orgs (pre-`bin/sms create-admin`).
- Verified Phase 25's SWC pipeline already compiles `apps/api/src/scripts/*.ts` to `apps/api/dist/scripts/*.js` (no `nest-cli.json` exclusion, no `tsconfig` change needed) — `pnpm --filter @sms-platform/api build` produces both compiled entry points.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create apps/api/src/scripts/init-buckets.ts** — `141068c` (feat)
2. **Task 2: Create apps/api/src/scripts/seed-stream-profile.ts** — `2f0a3c8` (feat)

(Plan metadata commit owned by orchestrator after wave completion.)

## Files Created/Modified

- `apps/api/src/scripts/init-buckets.ts` (80 LOC) — MinIO bootstrap. Reads `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` / (`MINIO_ACCESS_KEY` ?? `MINIO_ROOT_USER`) / (`MINIO_SECRET_KEY` ?? `MINIO_ROOT_PASSWORD`) from `process.env`. Calls `ensureBucket(client, 'avatars', true)` and `ensureBucket(client, 'recordings', false)`. Fail-fast `process.exit(1)` in `.catch`.
- `apps/api/src/scripts/seed-stream-profile.ts` (77 LOC) — Default StreamProfile seed. Constructs PrismaClient with `datasourceUrl: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL`. Iterates `prisma.organization.findMany`, gates on `prisma.streamProfile.count` per org, inserts default with `name: 'default'`, `codec: 'h264'`, `preset: 'veryfast'`, `resolution: '1920x1080'`, `fps: 25`, `videoBitrate: '2500k'`, `audioCodec: 'aac'`, `audioBitrate: '128k'`, `isDefault: true`. Empty-orgs path logs friendly message and returns. Fail-fast `process.exit(1)` in `.catch`, `$disconnect` in `.finally`.

## Env-Var Contracts (for Plan 03 compose wiring)

`init-buckets.ts`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `MINIO_ENDPOINT` | `minio` | Internal compose service name |
| `MINIO_PORT` | `9000` | Internal MinIO port |
| `MINIO_USE_SSL` | `false` | TLS toggle (false on internal network) |
| `MINIO_ACCESS_KEY` ?? `MINIO_ROOT_USER` | `minioadmin` | Auth — first non-empty wins; fallback to literal default ONLY if both env vars missing (logged loudly) |
| `MINIO_SECRET_KEY` ?? `MINIO_ROOT_PASSWORD` | `minioadmin` | Auth — same fallback chain |

`seed-stream-profile.ts`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL_MIGRATE` ?? `DATABASE_URL` | (none — required) | PrismaClient connection string. Migrate role (`rolbypassrls=true`) preferred so writes bypass RLS naturally. |

## Decisions Made

- **Schema-divergence handling (corrected D-13 in plan, applied at execution):** CONTEXT.md D-13 sample used field names that DO NOT exist on the actual `StreamProfile` model (`videoCodec`, `width`, `height`, `framerate`, `gopSize`). The plan author already documented the divergence and prescribed the actual schema fields; the executor confirmed by reading `apps/api/src/prisma/schema.prisma:253-271` and used the real fields. Intent (1080p H.264 / 2500kbps / 25fps) preserved.
- **Per-org seed loop:** Plan called this out as a deliberate correction over CONTEXT D-13's global `count() > 0` early-return. Implemented as written — for each org, count its profiles, insert if zero. Idempotent on re-runs.
- **No mutation to existing files:** `apps/api/src/recordings/minio.service.ts` (per-tenant `org-{orgId}` buckets — separate concern from these two platform buckets) and `apps/api/src/prisma/seed.ts` (dev-only seed) were left untouched, as required by `<success_criteria>`.

## Deviations from Plan

None — plan executed exactly as written. The executor's only judgment call (which the plan already anticipated explicitly) was using the actual `StreamProfile` schema field names instead of the CONTEXT D-13 sample's stale names; the plan's `<interfaces>` block prescribed the corrected fields verbatim, so this is a planned correction rather than a deviation.

## Issues Encountered

- **Worktree had no `node_modules`** — first build failed with `prisma: command not found`. Resolved by running `pnpm install --frozen-lockfile` once. Not a code issue; expected for a fresh worktree before its first build.

## User Setup Required

None — these scripts are infrastructure code only. No external service configuration required at plan-completion time. Plan 03 (compose YAML) and Plan 02 (`init-secrets.sh` + `.env.production.example`) will surface any required operator setup.

## Next Phase Readiness

- **Plan 03 ready:** Both compiled entry scripts (`apps/api/dist/scripts/init-buckets.js`, `apps/api/dist/scripts/seed-stream-profile.js`) ship inside the api image (Phase 25 builder stage). Plan 03's sms-migrate service can call:
  ```
  command: >-
    sh -c "pnpm prisma migrate deploy
    && node dist/scripts/init-buckets.js
    && node dist/scripts/seed-stream-profile.js"
  ```
  with `restart: "no"` (D-03) and the env-var contract documented above.
- **Plan 02 ready:** `.env.production.example` should document `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `DATABASE_URL` (and optional `DATABASE_URL_MIGRATE`). Phase 26 D-04 secret hygiene applies.
- **No blockers carried forward.**

## Self-Check: PASSED

- `apps/api/src/scripts/init-buckets.ts` — FOUND (committed in `141068c`)
- `apps/api/src/scripts/seed-stream-profile.ts` — FOUND (committed in `2f0a3c8`)
- `apps/api/dist/scripts/init-buckets.js` — FOUND (post-build artifact)
- `apps/api/dist/scripts/seed-stream-profile.js` — FOUND (post-build artifact)
- Commit `141068c` — FOUND in `git log`
- Commit `2f0a3c8` — FOUND in `git log`
- All acceptance criteria pass (idempotency guards, fail-fast, schema field names, env-var fallbacks, no mutation to existing services)

---
*Phase: 26-production-compose-migrate-init-networking-volumes*
*Plan: 01*
*Completed: 2026-04-28*
