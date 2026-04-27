# Phase 25: Multi-Stage Dockerfiles + Image Hardening - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

สร้าง production Docker images (api + web) ที่ build ได้จาก clean checkout, รัน non-root, ครอบคลุม runtime dependencies ที่จำเป็น (FFmpeg + tini สำหรับ api; Next.js standalone สำหรับ web), และอยู่ใน image size budget (≤450MB api / ≤220MB web). Output: image artifact ที่ Phase 26 (compose) + Phase 28 (CI/GHCR push) จะ consume.

**Delivers:**
- `apps/api/Dockerfile` — production multi-stage (4 stages: deps → builder → prod-deps → runtime), `node:22-bookworm-slim` base, FFmpeg 5.1.x + tini + curl + openssl/ca-certificates, non-root `app:app` uid 1001, `HEALTHCHECK` curl `/api/health`, `ENTRYPOINT [/usr/bin/tini, --]`, `CMD [node, dist/main]`
- `apps/web/Dockerfile` — Next.js 15 standalone (3 stages: deps → builder → runtime), `node:22-bookworm-slim` base, curl, non-root, `HEALTHCHECK` curl `/api/health`, `CMD [node, apps/web/server.js]`
- `apps/api/.dockerignore` + `apps/web/.dockerignore` — comprehensive per-app exclusions (test files, vitest config, dev scripts) layered on root `.dockerignore` (Phase 24)
- `apps/web/src/app/api/health/route.ts` — Next.js App Router health route returning `{ok:true}` (~10 LOC)
- New api `HealthController` + `HealthModule` (separate from `AdminController` ที่ guarded) — `GET /api/health` returning `{ok:true}` (~30 LOC)
- `apps/web/next.config.ts` — เพิ่ม `outputFileTracingRoot` สำหรับ pnpm monorepo standalone output (REQUIRED)
- Manual verification ใน PLAN.md: `docker build`, `docker images <tag> --format`, `docker run --rm <api-image> id` (non-root check), `docker run --rm <api-image> ffmpeg -version`, `docker run --rm <web-image>` (boots port 3000)

**Out of scope (belongs to other phases):**
- `deploy/docker-compose.yml` — Phase 26 (image references only, no `build:` context)
- Networking, named volumes, MinIO bucket auto-create, default Stream Profile seed — Phase 26
- `init: true` flag, `stop_grace_period: 30s` setting — Phase 26 compose-level
- `deploy/Caddyfile`, auto-TLS, same-origin routing — Phase 27
- GHCR push, GitHub Actions workflows, semver tags, build provenance attestation, OCI labels via `metadata-action@v5` — Phase 28
- `bin/sms create-admin` CLI binary — Phase 29
- Operator scripts (bootstrap.sh, update.sh, backup.sh, restore.sh, init-secrets.sh) — Phase 29
- Smoke test on clean Linux VM, nmap port lockdown — Phase 30
- Wire image-build smoke test เข้า CI — Phase 28 owns CI workflow (Phase 25 verification = manual local build)

</domain>

<decisions>
## Implementation Decisions

### Health endpoint strategy
- **D-01:** สร้าง public `GET /api/health` ใหม่ใน api ด้วย `HealthController` + `HealthModule` แยกออกจาก `AdminController` (ที่ guarded by `SuperAdminGuard`). Path `/api/health` ตรงกับ `audit.interceptor.ts:12 SKIP_PATHS` ที่มี slot รออยู่แล้ว — ไม่ต้องแก้ skip list. Response: `{ ok: true }` plain. ไม่มี dependency check (no DB ping, no Redis ping) — pure liveness signal. Phase 27 Caddy health route + Phase 30 nmap test ใช้ endpoint เดียวกัน
- **D-02:** สร้าง `apps/web/src/app/api/health/route.ts` (Next.js App Router pattern) export `GET` handler return `NextResponse.json({ ok: true })`. ~10 LOC. Path `/api/health` (web own, ไม่ใช่ rewrite ไป api เพราะ Docker network resolution ต่างจาก browser — `apps/web/next.config.ts` rewrite `'/api/:path*' → ${API_URL}/api/:path*` คือ browser-side; Dockerfile HEALTHCHECK รันใน container ไม่ผ่าน rewrite chain)
- **D-03:** Response shape = minimal `{ ok: true }` ทั้ง api และ web — liveness บริสุทธิ์ ไม่ตรวจ dependency. ป้องกัน false-fail (เช่น Postgres restart 5s → api unhealthy → Caddy ถอน traffic). ถ้าต้องการ readiness check ลึก ค่อยเพิ่ม `/api/health/ready` ใน Phase 30 หรือ v1.4
- **D-04:** `HEALTHCHECK` ประกาศใน Dockerfile ทั้ง api และ web เท่านั้น — image self-contained, `docker run` standalone test ก็ healthy. Phase 26 compose ไม่ override healthcheck, ไม่ duplicate config. Settings: `--interval=30s --timeout=5s --start-period=20s --retries=3` ตรงตาม ARCHITECTURE.md sample

### FFmpeg version
- **D-05:** ใช้ `apt-get install -y --no-install-recommends ffmpeg` จาก Debian Bookworm-slim base (FFmpeg 5.1.x) — ตรงกับ `Dockerfile.dev` ปัจจุบัน, proven ผ่าน v1.2 UAT (H.265, AAC, libx264, RTSP→RTMP pipeline ทั้งหมด). ไม่ pin specific version (apt cache rotates with security updates). อัพเป็น 7.x ค่อยเปิด ticket ใน v1.4+ เมื่อมี business need (4K AV1, HEVC encoder fix, hardware encoder)

### PID 1 + signal handling
- **D-06:** ติดตั้ง `tini` ใน api Dockerfile runtime stage (`apt-get install -y tini`) + ใช้ `ENTRYPOINT ["/usr/bin/tini", "--"]` ก่อน `CMD ["node", "dist/main"]`. เหตุผล: image self-contained (Phase 25 success criterion #2 ต้องการ `docker run --rm <api-image> id` standalone — ไม่ผ่าน compose), ARCHITECTURE.md sample pattern, ~600KB cost ไม่กระทบ 450MB budget. tini reaps FFmpeg zombies + forwards SIGTERM ให้ NestJS ResilienceService graceful shutdown ทำงานครบ
- **D-07:** web Dockerfile **ไม่** install tini — Next.js server ไม่ spawn child processes. Single Node process pattern, ไม่มี zombie risk. Save ~600KB
- **D-08 (carry-forward note):** `init: true` ใน compose + `stop_grace_period: 30s` ปล่อย Phase 26 owns. Phase 25 ไม่ declare ใน Dockerfile

### Image size verification
- **D-09:** Verify ขนาด image ด้วย `docker images <tag> --format '{{.Size}}'` หลัง build เสร็จ — record ผลใน PLAN.md verification step. Plan task ต้องมีคำสั่ง `docker build -f apps/api/Dockerfile . -t sms-api:phase25-test` + assert size ≤ 450MB; ทำเดียวกันกับ web ≤ 220MB. ไม่สร้าง `scripts/check-image-sizes.sh` ในเฟสนี้ — manual verification เพียงพอสำหรับ "local build" success criterion. Phase 28 CI workflow จะเอา assertion นี้ไปทำเป็น automated gate

### Per-app .dockerignore
- **D-10:** `apps/api/.dockerignore` — comprehensive scope แยกจาก root .dockerignore:
  - Tests: `tests/`, `**/*.test.ts`, `**/*.spec.ts`, `**/*.e2e-spec.ts`
  - Test config: `vitest.config.ts`, `tests/setup.ts` (ถ้ามี)
  - Dev scripts: `scripts/setup-test-db.sh`, `scripts/sample-data.ts` (ถ้ามี — verify during planning)
  - Build artifacts: `dist/` (rebuilt ใน builder stage), `tsconfig.tsbuildinfo`
  - **Keep:** `src/prisma/migrations/` (REQUIRED — runtime stage ต้องการสำหรับ `prisma migrate deploy` ใน Phase 26 init service)
  - **Keep:** `prisma/schema.prisma`
- **D-11:** `apps/web/.dockerignore` — comprehensive:
  - Tests: `tests/`, `**/*.test.ts`, `**/*.spec.ts`, `**/*.test.tsx`, `**/*.spec.tsx`
  - Test config: `vitest.config.ts`
  - Build artifacts: `.next/cache/` (build cache, not standalone output), `tsconfig.tsbuildinfo`, `next-env.d.ts`
  - **Keep:** `.next/standalone/`, `.next/static/`, `public/` (REQUIRED for runtime COPY)

### Prisma generate strategy (multi-stage)
- **D-12:** ใน Dockerfile multi-stage:
  - **deps stage:** `pnpm install --frozen-lockfile --ignore-scripts` (skip postinstall ที่จะรัน `prisma generate` โดยอัตโนมัติ — ตอนนี้ schema ยังไม่ copy เข้า stage)
  - **builder stage:** copy `apps/api/` content (รวม schema.prisma) → `pnpm prisma generate` (explicit, schema พร้อม) → `pnpm build` (SWC)
  - **prod-deps stage:** `pnpm install --prod --frozen-lockfile --ignore-scripts` (skip postinstall — ไม่จำเป็นต้อง regenerate)
  - **runtime stage:** copy `node_modules` from prod-deps + copy generated Prisma client + dist + schema/migrations from builder
- **D-13:** ไม่แก้ `apps/api/package.json` postinstall script — dev workflow (CLAUDE.md "Prisma schema change workflow" 4-step rule) ยัง depend `prisma generate` ตอน install. `--ignore-scripts` ใช้เฉพาะใน Dockerfile build context, ไม่กระทบ `pnpm install` บน host

### Image structure (api Dockerfile)
- **D-14:** 4 stages ตรงตาม ARCHITECTURE.md L139-199 sample:
  - Stage 1 `deps`: `node:22-bookworm-slim` + openssl/ca-certificates → copy lockfile + workspace + apps/api/package.json → `pnpm install --frozen-lockfile --ignore-scripts`
  - Stage 2 `builder`: extend deps → copy `apps/api/` → `pnpm prisma generate && pnpm build`
  - Stage 3 `prod-deps`: fresh `node:22-bookworm-slim` → openssl/ca-certificates → copy lockfile + apps/api/package.json → `pnpm install --frozen-lockfile --prod --ignore-scripts`
  - Stage 4 `runtime`: fresh `node:22-bookworm-slim` → install ffmpeg + tini + curl + openssl + ca-certificates + groupadd/useradd app:app uid 1001 → copy node_modules from prod-deps + dist + src/prisma + package.json from builder (chown app:app) → `USER app` → `WORKDIR /app/apps/api` → `EXPOSE 3003` → HEALTHCHECK + ENTRYPOINT tini + CMD node dist/main
- **D-15:** **Drop** `COPY packages/ ./packages/` line จาก ARCHITECTURE.md sample — monorepo นี้ไม่มี `packages/` directory (verified — pnpm-workspace.yaml มีแค่ `apps/api` + `apps/web`). ARCHITECTURE.md sample เขียนสำหรับ generic monorepo

### Image structure (web Dockerfile)
- **D-16:** 3 stages (web ไม่ต้อง prod-deps stage แยก เพราะ Next.js standalone output รวม minimal node_modules แล้ว):
  - Stage 1 `deps`: `node:22-bookworm-slim` → copy lockfile + workspace + apps/web/package.json → `pnpm install --frozen-lockfile`
  - Stage 2 `builder`: extend deps → copy `apps/web/` → `ENV NEXT_TELEMETRY_DISABLED=1` → `pnpm build` (Next.js produces `.next/standalone` + `.next/static`)
  - Stage 3 `runtime`: fresh `node:22-bookworm-slim` → install curl + groupadd/useradd app:app uid 1001 → copy `.next/standalone` + `.next/static` + `public/` (chown app:app) → `USER app` → `EXPOSE 3000` → `ENV PORT=3000 HOSTNAME=0.0.0.0` → HEALTHCHECK + CMD node apps/web/server.js (ไม่มี ENTRYPOINT tini เพราะ D-07)
- **D-17:** **Drop** `COPY packages/` line (เหมือน D-15)

### next.config.ts standalone output
- **D-18:** แก้ `apps/web/next.config.ts` เพิ่ม `outputFileTracingRoot` — REQUIRED สำหรับ pnpm monorepo Next.js standalone (มิฉะนั้น `.next/standalone/server.js` จะ miss workspace symlinks → "Cannot find module" runtime crash). Code:
  ```ts
  import path from 'node:path';
  import { fileURLToPath } from 'node:url';
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // ...
  const nextConfig: NextConfig = {
    output: 'standalone',
    outputFileTracingRoot: path.join(__dirname, '../../'),
    skipTrailingSlashRedirect: true,
    rewrites: [...] // unchanged
  };
  ```
  เก็บ existing `output: 'standalone'`, `skipTrailingSlashRedirect: true`, `rewrites` ทั้งหมด — Phase 25 เพิ่ม `outputFileTracingRoot` เท่านั้น

### Verification (Success Criteria)
- **D-19:** Manual checklist ใน PLAN.md ก่อน mark complete:
  1. `docker build -f apps/api/Dockerfile . -t sms-api:phase25-test` build สำเร็จ
  2. `docker images sms-api:phase25-test --format '{{.Size}}'` ≤ 450 MB
  3. `docker run --rm sms-api:phase25-test id` แสดง `uid=1001(app) gid=1001(app)` (non-root)
  4. `docker run --rm sms-api:phase25-test ffmpeg -version` แสดง FFmpeg 5.1.x output
  5. `docker run --rm --entrypoint /bin/sh sms-api:phase25-test -c 'which tini && /usr/bin/tini --version'` แสดง tini installed
  6. `docker build -f apps/web/Dockerfile . -t sms-web:phase25-test` build สำเร็จ
  7. `docker images sms-web:phase25-test --format '{{.Size}}'` ≤ 220 MB
  8. `docker run --rm -d -p 3000:3000 --name sms-web-smoke sms-web:phase25-test` รันได้, `curl -fsS http://localhost:3000/api/health` คืน 200 + `{ok:true}`, `docker rm -f sms-web-smoke`
  9. `docker run --rm -d -p 3003:3003 --name sms-api-smoke sms-api:phase25-test` (ต้อง mock DATABASE_URL/REDIS_URL หรือ accept boot-time error — verify เฉพาะ Node start + health route reachable แม้ DB unhealthy เพราะ D-03 minimal)
  10. `bash scripts/dev-smoke.sh` ยังผ่าน (no regression on dev workflow)
  11. CI workflow Phase 23 ยัง pass (no test breakage)

### Claude's Discretion
- ถ้อยคำ exact ของ HealthController route descriptor และ Swagger annotations
- exact placement ของ HealthModule import ใน `app.module.ts` (top-level vs nested)
- ลำดับ COPY layer + apt install layer optimization สำหรับ build cache hit rate
- HEALTHCHECK timing tuning — `--start-period=20s` เริ่มต้น, ถ้า api boot ช้ากว่านี้ปรับเป็น 30s
- exact wording ของ comment headers ใน Dockerfile (block comments แต่ละ stage)
- Multi-line `apt-get install` formatting (single line vs continuation)
- `apps/api/.dockerignore` exact pattern list — Claude verify scripts/ content ตอน planning
- Test boot sequence — ถ้า api smoke (D-19 step 9) ต้องใช้ env vars dummy, planner เลือก strategy
- exact PR commit message format (Phase 25 น่าจะ ~6 commits: 1 health api, 1 health web, 1 next.config update, 1 api Dockerfile + .dockerignore, 1 web Dockerfile + .dockerignore, 1 verification record)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + research (locked decisions)
- `.planning/ROADMAP.md` §Phase 25 (lines 100-104) — Goal + Success Criteria #1-4
- `.planning/REQUIREMENTS.md` §DEPLOY-01, DEPLOY-02 — Multi-stage api ≤450MB / Next.js standalone web ≤220MB
- `.planning/research/SUMMARY.md` §Locked Decisions (lines 17-34) — `node:22-bookworm-slim`, `linux/amd64` only, dev Dockerfile rename pattern, image budgets, `init: true` for FFmpeg zombies
- `.planning/research/SUMMARY.md` §Phase 2 (lines 64-66) — multi-stage Dockerfile spec mapping
- `.planning/research/ARCHITECTURE.md` §Dockerfile Strategy (lines 137-275) — full sample api Dockerfile (4-stage), full sample web Dockerfile (3-stage), `outputFileTracingRoot` requirement, choice rationale table
- `.planning/research/ARCHITECTURE.md` §"Why Dockerfiles stay co-located" (lines 277-285) — convention for `apps/{api,web}/Dockerfile` placement
- `.planning/research/PITFALLS.md` §Pitfall 3 (lines 65-92) — FFmpeg zombie reaping, tini vs init:true tradeoffs, `stop_grace_period: 30s`
- `.planning/research/PITFALLS.md` §Pitfall 8 (lines 230-266) — `.env` in image layer = BLOCKER for GA, .dockerignore comprehensive scope
- `.planning/research/PITFALLS.md` §Pitfall 12 — multi-stage Dockerfile small image rationale
- `.planning/research/PITFALLS.md` §Pitfall 18 (lines 586-624) — dev workflow contamination risks (Phase 25 ห้ามเขียน prod Dockerfile ทับ Dockerfile.dev)

### Existing code patterns (must align with)
- `apps/api/Dockerfile.dev` (lines 1-23) — Current dev Dockerfile pattern (FFmpeg + curl + npm ci + nest start:dev). Phase 25 prod Dockerfile **ต้อง** ใช้ pnpm + multi-stage + `node dist/main`. ห้ามแก้ Dockerfile.dev (Phase 24 D-06)
- `apps/api/package.json` — `engines.node >=22`, `engines.pnpm >=10`, scripts `build`, `prebuild` (prisma generate), `postinstall` (prisma generate), `start:prod` (`node dist/main`). Phase 25 Dockerfile **ต้อง** เคารพ `--ignore-scripts` เพื่อไม่ run postinstall โดยอัตโนมัติใน multi-stage
- `apps/api/src/admin/admin.controller.ts:14` — `/api/admin/health` endpoint guarded by `SuperAdminGuard` (NOT usable for HEALTHCHECK). Phase 25 สร้าง separate `HealthController` — ห้ามแก้ admin.controller
- `apps/api/src/audit/audit.interceptor.ts:12` — `SKIP_PATHS = ['/api/srs/callbacks', '/api/health']`. New `/api/health` endpoint slot ready, ไม่ต้องแก้
- `apps/api/src/main.ts:25` — CORS allowlist + global prefix configuration; HealthController อยู่ภายใต้ `api/health` ตาม global prefix
- `apps/web/next.config.ts` — Existing `output: 'standalone'`, `skipTrailingSlashRedirect`, `rewrites`. Phase 25 เพิ่ม `outputFileTracingRoot` เท่านั้น — ห้ามแก้ rewrites หรือ skip flag
- `apps/web/package.json` — `next dev --turbopack --port 3000`. Production runs `node apps/web/server.js` from standalone output
- `pnpm-workspace.yaml` — `apps/api`, `apps/web` only (NO `packages/` — drop sample's `COPY packages/` line)
- `package.json` (root) — `engines.node >=22.0.0`, `engines.pnpm >=10`. corepack-enabled pnpm via Node 22 base
- `.dockerignore` (root, Phase 24) — comprehensive baseline (Secrets, VCS, Dependencies, Build, Coverage, Planning, Data, IDE, Logs, Examples). Phase 25 per-app .dockerignore extends this
- `CLAUDE.md` §Deploy Folder Convention (Phase 24) — locks `apps/api/Dockerfile` placement (no suffix), per-app `.dockerignore` Phase 25 ownership
- `CLAUDE.md` §Prisma schema change workflow — 4-step rule (db reset → build → restart → verify); Phase 25 Dockerfile builder stage ต้อง run `prisma generate` explicit (ไม่พึ่ง postinstall เมื่อ `--ignore-scripts`)

### Phase 24 hand-off
- `.planning/phases/24-deploy-folder-structure-dev-workflow-guardrails/24-CONTEXT.md` §D-06 — Dockerfile.dev byte-identical lock; Phase 25 prod Dockerfile co-locate `apps/api/Dockerfile` (no suffix)
- `.planning/phases/24-deploy-folder-structure-dev-workflow-guardrails/24-CONTEXT.md` §D-07-09 — root .dockerignore baseline; Phase 25 per-app .dockerignore inherit + extend (BuildKit closest-wins resolution)
- `scripts/dev-smoke.sh` — Phase 24 dev regression check; Phase 25 verification step ต้องรัน + ผ่าน

### Phase 23 hand-off (Prisma migration baseline)
- `apps/api/src/prisma/migrations/0_init/migration.sql` (DEBT-05 deliverable) — Squashed init migration; Phase 25 runtime stage **ต้อง** copy `src/prisma/` directory เพื่อ `prisma migrate deploy` ทำงานใน Phase 26 init service
- `apps/api/src/prisma/schema.prisma` — Schema source for Prisma client generation in builder stage

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`apps/api/Dockerfile.dev` apt install pattern** — `apt-get update && apt-get install -y --no-install-recommends ffmpeg curl && rm -rf /var/lib/apt/lists/*`. Reuse pattern + เพิ่ม `tini`, `openssl`, `ca-certificates` ใน prod runtime stage
- **NestJS module structure** — `apps/api/src/admin/admin.module.ts` + `admin.controller.ts` pattern เป็น template สำหรับ `HealthModule` + `HealthController` ใหม่. Single controller per module, register ใน `app.module.ts` imports
- **Next.js App Router API route pattern** — `apps/api/src/app/api/srs/callbacks/...` (api side) ไม่ตรงกับ web. Web ไม่มี existing `app/api/*` route ที่ใช้งานอยู่ — สร้างใหม่ `apps/web/src/app/api/health/route.ts` เป็น first instance
- **`audit.interceptor.ts` SKIP_PATHS** — pre-configured `/api/health` slot — Phase 25 implementation matches expected path

### Established Patterns
- **`pnpm install --frozen-lockfile`** — Lockfile is source of truth (verified in `package.json` `engines.pnpm`). Dockerfile multi-stage **ต้อง** ใช้ flag นี้ — ไม่อนุญาต lockfile drift ใน build
- **Single-stage dev Dockerfile uses `npm ci`** — Phase 25 prod **เปลี่ยนเป็น pnpm** (corepack-enabled). Reason: workspace dependencies require pnpm
- **NestJS swagger annotations** — `@ApiTags`, `@ApiOperation`, `@ApiResponse` — HealthController follows same pattern (verified ใน `admin.controller.ts:14-19`)
- **Health response shape** — `admin.controller.ts:18` returns `{ status: 'ok', role: 'super-admin' }`. Phase 25 HealthController returns `{ ok: true }` ตาม D-03 minimal preference
- **Non-root user creation** — Debian Bookworm pattern: `groupadd -r app && useradd -r -g app -u 1001 app`. Use ใน runtime stage ของทั้ง api และ web
- **Workspace dependency resolution** — `apps/api` + `apps/web` ใช้ shared lockfile root `pnpm-lock.yaml`. Multi-stage `COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./` + per-app package.json copy ก่อน install เพื่อ cache deps separately

### Integration Points
- **Phase 26 compose hand-off** — Phase 25 image references (`ghcr.io/<org>/sms-api:<tag>`, `ghcr.io/<org>/sms-web:<tag>`) จะถูก consumed โดย `deploy/docker-compose.yml`. Phase 25 ต้อง emit valid `EXPOSE 3003` (api) + `EXPOSE 3000` (web) ให้ compose port-mapping ใช้ได้ (ไม่ public ports — Caddy reverse-proxy เท่านั้น)
- **Phase 28 CI hand-off** — Phase 25 Dockerfile **ต้อง** build ผ่าน `docker buildx build --platform linux/amd64 -f apps/api/Dockerfile . -t <tag>` แบบไม่มี platform-specific shenanigans. GH Cache v2 (`type=gha`) จะ cache deps stage แยกจาก builder stage — ลำดับ COPY/RUN ต้อง maximize layer reuse
- **Phase 30 smoke test hand-off** — Phase 25 image **ต้อง** boot บน fresh Ubuntu 22.04 LTS without manual intervention. tini PID 1 + non-root + healthcheck ทั้งหมดเป็น precondition สำหรับ Phase 30
- **Existing audit interceptor** — `/api/health` ถูก skip จาก audit log แล้ว (Phase 23 work). HealthController endpoint จะไม่ pollute audit table

</code_context>

<specifics>
## Specific Ideas

- **Bookworm > Alpine:** Research SUMMARY.md ระบุชัด — Alpine's musl ทำ FFmpeg/Sharp/Prisma surprises. Bookworm-slim เป็นทางสายกลาง: glibc + slim apt — ไม่ต้อง wrestle musl บั๊กแบบ Alpine แต่ขนาดเล็กกว่า full Bookworm ~40%
- **tini เฉพาะ api, ไม่เอา web:** เก็บ web image เล็กที่สุดเท่าที่ทำได้ — Next.js single-process ไม่มี FFmpeg child. ARCHITECTURE.md sample web Dockerfile install tini ด้วย แต่ unnecessary cost. Phase 25 deviates ตรงนี้ — D-07 conscious choice
- **`outputFileTracingRoot` คือ deal-breaker:** Without it, Next.js standalone จะ "ทำงาน" ใน dev แต่ crash ใน Docker container ด้วย "Cannot find module '@some/workspace-pkg'" — silent in dev เพราะ symlinks resolve ตอน runtime; loud in container เพราะ trace miss workspace files
- **Health endpoint แยกจาก admin:** เลือก separate `HealthController` ไม่เปิด `admin/health` public เพราะ semantic clarity — `/api/admin/*` คือ super-admin operations, `/api/health` คือ liveness probe. mix สอง concerns ใน controller เดียวจะมีปัญหา authorization audit ตอน security review
- **Manual size verification > script:** `scripts/check-image-sizes.sh` overhead เกินสำหรับ "verify ครั้งเดียวต่อ phase". Phase 28 CI จะ encode logic นี้ใน workflow YAML — ไม่ต้องการ script intermediate
- **`COPY packages/` ห้ามคงไว้:** ARCHITECTURE.md sample Dockerfile เขียนสำหรับ generic pnpm monorepo. SMS Platform monorepo ไม่มี `packages/` — pnpm-workspace.yaml มีแค่ `apps/api` + `apps/web`. ถ้า COPY ไม่มี directory จะ build error "no such file or directory"
- **`--ignore-scripts` ไม่ break dev:** `pnpm install --ignore-scripts` ใช้เฉพาะ Dockerfile build context. Host `pnpm install` (developer machine) ยังรัน postinstall ตามปกติ → `prisma generate` ทำงาน. dev workflow ไม่กระทบ
- **`prisma migrate deploy` ใน runtime image:** Runtime stage copy `src/prisma/` directory (schema + migrations) จาก builder. Phase 26 จะรัน `prisma migrate deploy` ผ่าน sms-migrate init service ที่ใช้ image เดียวกับ api. Phase 25 ต้อง ensure `npx prisma` available — เพราะ `@prisma/client` deps install แล้ว, `pnpm prisma migrate deploy` จะทำงานได้
- **NestJS swagger ภายใน HealthController:** `@ApiExcludeController()` หรือ `@ApiTags('Health')`? เลือก include เพราะ Phase 28 Caddy/operator monitoring tools (Prometheus exporter ใน v1.4) จะอ้าง endpoint นี้

</specifics>

<deferred>
## Deferred Ideas

- **Image size automation script (`scripts/check-image-sizes.sh`)** — Defer to Phase 28 CI workflow. Manual verification ใน Phase 25 เพียงพอ
- **OCI image labels (`org.opencontainers.image.*`)** — Phase 28 `docker/metadata-action@v5` จะ inject ด้วย CI metadata (source, version, revision, created). Phase 25 ไม่ใส่ static labels เพราะจะถูก overwrite
- **Cosign keyless signing** — Defer to v1.3.x per research SUMMARY.md anti-features. Phase 28 ทำ build provenance attestation พอ
- **Readiness/deep health check (DB+Redis ping)** — Defer to Phase 30 (smoke test) หรือ v1.4 (production observability). Phase 25 ใช้ liveness only
- **Hardware FFmpeg (h264_nvenc, vaapi)** — SRS limitation already (CLAUDE.md "SRS Limitations" table) — และ project ใช้ libx264 software encoding. Defer indefinitely unless GPU host requirement landed
- **ARM64 image builds** — Research SUMMARY.md locked `linux/amd64` only for v1.3. ARM64 Multi-arch defer to v1.4+ (Hetzner CAX has ARM)
- **Bookworm-backports for FFmpeg 7.x** — Defer to v1.4 unless 5.1.x bug surface in production. Pinning backports adds apt complexity ไม่คุ้มในเฟสนี้
- **Distroless or scratch base** — Defer indefinitely. Bookworm-slim ตอบโจทย์ + bash/curl + apt — distroless ตัด debug capability
- **Watchtower auto-update** — Per research SUMMARY.md anti-features (out of scope v1.3). Defer
- **Dev container (docker-compose dev profile)** — Defer to v1.4. Dockerfile.dev ยังเป็น future reference ที่ไม่ได้ใช้งานจริง — ถ้า containerize dev ค่อยกลับมาเปิด
- **Prisma engine binary minimization** — `@prisma/client` ส่ง all engines มา (linux-arm64-openssl-3.0.x, linux-musl-arm64-openssl-3.0.x, ฯลฯ). Image size optimization through `binaryTargets` ใน schema.prisma — defer ถ้า image ขนาดเกิน 450MB ค่อยเปิด

</deferred>

---

*Phase: 25-multi-stage-dockerfiles-image-hardening*
*Context gathered: 2026-04-27*
