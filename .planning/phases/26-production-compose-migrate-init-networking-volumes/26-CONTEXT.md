# Phase 26: Production Compose + Migrate Init + Networking + Volumes - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

สร้าง `deploy/docker-compose.yml` ที่ pull GHCR images แล้ว boot prod stack ทั้งหมด (postgres + redis + minio + srs + sms-migrate + api + web) บน Linux host เปล่าๆ ใน <2 นาที. Two-network topology ซ่อน stateful services จาก host. Single init container รัน prisma migrate + create MinIO buckets + seed default Stream Profile แล้ว exit 0 ก่อน api boot. Named volumes รักษา data ข้าม `compose down/up`. `deploy/.env.production.example` + `deploy/scripts/init-secrets.sh` ให้ operator setup ครั้งแรกได้.

**Delivers:**
- `deploy/docker-compose.yml` — 7 services (postgres, redis, minio, sms-migrate, srs, api, web), 2 networks (`edge`, `internal: true`), 5 named volumes (`postgres_data`, `redis_data`, `minio_data`, `caddy_data`, `hls_data`)
- `deploy/.env.production.example` — template documenting 7 required vars (DOMAIN, DB_PASSWORD, NEXTAUTH_SECRET, BETTER_AUTH_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, IMAGE_TAG) + optional vars
- `deploy/scripts/init-secrets.sh` — idempotent secret generator (operator runs once, ภายหลัง edit ค่าได้เอง)
- Stream Profile seed script (เก็บใน api image — sms-migrate รันได้)

**Out of scope (belongs to other phases):**
- `deploy/Caddyfile`, auto-TLS, DOMAIN-SETUP.md — Phase 27
- GHCR push, CI workflow build-images.yml/release.yml, semver tags — Phase 28
- `deploy/scripts/{bootstrap,update,backup,restore}.sh` — Phase 29
- `deploy/README.md` quickstart rewrite (Phase 24 stub stays until then) — Phase 29
- Smoke test on clean Ubuntu VM, nmap port lockdown — Phase 30
- `deploy/docker-compose.override.yml` (dev/debug bind mounts) — defer

</domain>

<decisions>
## Implementation Decisions

### First-run init pipeline (DEPLOY-14, DEPLOY-15, DEPLOY-16)
- **D-01:** **1 combined init container** `sms-migrate` ทำ 3 jobs ในลำดับ: (1) `prisma migrate deploy` → (2) `mc mb --ignore-existing` สร้าง buckets `avatars`+`recordings` → (3) `node dist/scripts/seed-stream-profile.js` (idempotent insert default profile). เหตุผล: composability ง่าย (1 service `depends_on`), log รวมที่เดียว, image pull 1 ครั้ง. Trade-off: failure isolation ต่ำกว่า split — แต่ logs ระบุ step ชัดเจนพอให้ operator debug.
- **D-02:** init container **ใช้ api image** (`ghcr.io/${GHCR_ORG}/sms-api:${IMAGE_TAG:-latest}`) — มี `prisma client + migrations + node + minio-mc` (ติดตั้งใน Phase 25 Dockerfile builder/runtime stages) พร้อมแล้ว. Override `entrypoint: ["/usr/bin/tini","--","sh","-c"]` + `command: ["node node_modules/.bin/prisma migrate deploy && node dist/scripts/init-buckets.js && node dist/scripts/seed-stream-profile.js"]`. ไม่ build separate image (Phase 28 push 1 image แทน 2).
- **D-03:** **`restart: "no"` + exit non-zero** = api ไม่ boot. Operator เห็นจาก `docker compose ps` (api `Created`, sms-migrate `Exited(1)`) + `docker compose logs sms-migrate`. ชัดเจน, fail-fast, ไม่มี partial state. ตาม DEPLOY-14 spec.
- **D-04 (carry-forward note):** init scripts (`init-buckets.js`, `seed-stream-profile.js`) ต้อง **ship in api image** จาก Phase 25 — Phase 25 Dockerfile builder stage compile dist/scripts/ ด้วย SWC อยู่แล้ว (ทุก `.ts` ใน apps/api/src/scripts/* compile ออกมา). Phase 26 plan task เพิ่มเฉพาะ scripts (~50-100 LOC each) ไม่แก้ Phase 25 Dockerfile.

### Network topology (DEPLOY-11)
- **D-05:** Network names = **`edge` + `internal: true`** ตรงตาม DEPLOY-11 spec. Compose declaration:
  ```yaml
  networks:
    edge:
      driver: bridge
    internal:
      driver: bridge
      internal: true   # ห้าม container ใน internal เข้าถึง outside world
  ```
- **D-06:** Service-to-network membership:
  | Service | edge | internal |
  |---------|------|----------|
  | postgres | — | ✓ |
  | redis | — | ✓ |
  | minio | — | ✓ |
  | sms-migrate | — | ✓ |
  | srs | ✓ | — |
  | api | ✓ | ✓ |
  | web | ✓ | — |
  api อยู่ทั้ง 2 networks: edge → caddy reverse-proxy; internal → DNS resolution `postgres:5432`, `redis:6379`, `minio:9000`. NestJS active connections หลายแห่ง.
- **D-07:** **Port exposure:**
  | Service | Container ports | Host bindings |
  |---------|-----------------|---------------|
  | postgres | 5432 | (none — internal only) |
  | redis | 6379 | (none) |
  | minio | 9000, 9001 | (none — Caddy หน้า api proxy แทน) |
  | sms-migrate | — | (none) |
  | srs | 1935, 1985, 8000/udp, 8080, 10080/udp | `1935:1935`, `127.0.0.1:1985:1985`, `8000:8000/udp`, `8080:8080`, `10080:10080/udp` |
  | api | 3003 | (none — Caddy เข้าผ่าน edge) |
  | web | 3000 | (none — Caddy เข้าผ่าน edge) |
  SRS admin port 1985 bind `127.0.0.1` only (ROADMAP SC #3 + DEPLOY-11). Camera RTMP/SRT ports public-facing (1935 + 10080/udp + 8000/udp). HLS 8080 public แต่ Phase 27 Caddy จะ proxy ในที่สุด (ใน Phase 26 ยัง direct เข้ามาได้เพื่อ smoke).

### Volumes (DEPLOY-12)
- **D-08:** **5 named volumes** (no bind mount in prod compose):
  ```yaml
  volumes:
    postgres_data:
    redis_data:
    minio_data:
    caddy_data:    # Phase 27 ใช้
    hls_data:      # SRS write + api read-only
  ```
  ทุกตัว survive `docker compose down && docker compose up -d`. Operator backup ผ่าน Phase 29 backup.sh จะ docker volume export ทีละตัว.
- **D-09:** **HLS volume sharing strategy:**
  - SRS: `hls_data:/usr/local/srs/objs/nginx/html` (read-write — SRS เขียน segments)
  - api: `hls_data:/srs-hls:ro` (read-only — api อ่านเพื่อ archive ผ่าน `on_hls` callback, ไม่เขียน)
  api env: `SRS_HLS_PATH=/srs-hls` (เปลี่ยนจาก dev `./docker-data/srs-hls`). Read-only mount = defense-in-depth ป้องกัน api bug ลบ srs file (current code ไม่ write).

### MinIO bucket policy
- **D-10:** **`recordings` bucket = private** (default, no public policy). Browser ขอ signed URL จาก api ที่ verify session/JWT. ตาม v1.2 security model + Phase 27 same-origin Caddy. ป้องกัน recording leak ผ่าน reverse-proxy.
- **D-11:** **`avatars` bucket = public-read** (anonymous-read policy via mc anonymous set download). Avatars = profile picture, ไม่ sensitive, browser load ตรง `https://avatars.example.com/<uid>.webp`. CDN-friendly. ตาม v1.2 implementation — Phase 26 ไม่เปลี่ยน model.
- **D-12:** init script `init-buckets.js` ใช้ MinIO `Client.bucketExists()` ก่อน `makeBucket()` (idempotent — ไม่ throw on subsequent boots). Anonymous policy set ผ่าน `Client.setBucketPolicy(bucketName, JSON.stringify({...}))` for avatars; recordings ปล่อย default private.

### Default Stream Profile seed (DEPLOY-16)
- **D-13:** **1 generic profile** (ไม่ split Low/Med/High):
  ```typescript
  // seed-stream-profile.ts (apps/api/src/scripts/)
  const exists = await prisma.streamProfile.count() > 0;
  if (exists) return;  // idempotent
  await prisma.streamProfile.create({
    data: {
      name: 'default',
      videoCodec: 'h264',
      videoBitrate: 2500,         // kbps
      width: 1920,
      height: 1080,
      framerate: 25,
      audioCodec: 'aac',
      audioBitrate: 128,           // kbps
      gopSize: 2,                  // seconds
      isDefault: true,
    },
  });
  ```
  ตาม DEPLOY-16 spec ("a default Stream Profile" — singular). Operator ปรับผ่าน admin UI ภายหลัง. ค่าตรงกับ v1.2 default ที่ proven แล้ว.

### Secret generation (DEPLOY-22)
- **D-14:** **`init-secrets.sh` idempotent + base64**:
  - Read `deploy/.env` (created from `cp .env.production.example .env` ก่อน)
  - For each var ใน list `[DB_PASSWORD, NEXTAUTH_SECRET, BETTER_AUTH_SECRET, MINIO_ROOT_PASSWORD, JWT_PLAYBACK_SECRET]`:
    - ถ้าค่า empty หรือ matches placeholder pattern (`change-me-*`, `<generated>`, ``) → `openssl rand -base64 32` → `sed -i "s|^${VAR}=.*|${VAR}=${VALUE}|" deploy/.env`
    - ถ้ามีค่าจริงอยู่แล้ว → skip (ป้องกัน operator รัน 2 รอบ → wipe credentials)
  - Final: `chmod 600 deploy/.env`
  - Echo summary: "Generated N secrets, M already set"
- **D-15:** Algorithm = **`openssl rand -base64 32`** (43 base64 chars = 256 bits entropy). เพราะ:
  - DEPLOY-22 spec: "32-char random values" — base64 ของ 32 bytes ได้ 43 chars (เกินขั้นต่ำ); hex ของ 16 bytes = 32 chars แต่ entropy 128-bit เท่านั้น
  - NEXTAUTH_SECRET / BETTER_AUTH_SECRET expect ≥32 chars (Better Auth docs)
  - base64 padding `=` strip ทิ้งเพื่อหลีกเลี่ยง shell quoting issues

### Logging + restart policy (DEPLOY-13)
- **D-16:** **YAML anchor for shared logging config** ที่ top of compose:
  ```yaml
  x-logging: &default-logging
    driver: json-file
    options:
      max-size: "10m"
      max-file: "5"
  ```
  ทุก long-running service (postgres, redis, minio, srs, api, web) reference `logging: *default-logging`. **sms-migrate ไม่ใช้** (รันสั้น exit เร็ว, log ไป docker journal ก็พอ).
- **D-17:** **`restart: unless-stopped`** ทุก service ยกเว้น `sms-migrate: restart: "no"` (DEPLOY-14). `unless-stopped` ดีกว่า `always` — operator `docker compose stop` แล้วไม่ auto-restart on daemon restart (ตั้งใจหยุด).
- **D-18:** **`init: true`** ทุก long-running service (api, web, srs, postgres, redis, minio) — Pitfall 3 FFmpeg zombie reaping. api มี tini เป็น ENTRYPOINT จาก Phase 25 Dockerfile แล้ว แต่ compose `init: true` ก็ active ด้วย — ไม่ conflict (Docker daemon-injected init ทำงาน outside container PID namespace แทน tini PID 1; redundancy = harmless). Other services (postgres/redis/minio) ไม่มี tini ใน image — `init: true` reap zombies จาก orphan worker processes.
- **D-19:** **`stop_grace_period: 30s`** บน api (Pitfall 3 spec — FFmpeg graceful shutdown timeout). Other services ปล่อย default 10s. SRS อาจ extend เป็น 15s ภายหลังถ้าเจอ camera reconnect race.

### Healthchecks
- **D-20:** **Image-side HEALTHCHECK ของ api/web ไม่ override** (Phase 25 D-04 carry-forward — image self-contained). Compose ระบุเฉพาะ stateful services:
  ```yaml
  postgres: healthcheck: ["CMD-SHELL","pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
  redis:    healthcheck: ["CMD","redis-cli","ping"]
  minio:    healthcheck: ["CMD","mc","ready","local"]   # mc shipped in minio image
  srs:      healthcheck: bash /dev/tcp probe HTTP API   # ตาม dev compose pattern
  ```
- **D-21:** **`depends_on` chain**:
  ```yaml
  sms-migrate:
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }   # mc + seed อาจใช้ redis pub/sub trigger reload
      minio:    { condition: service_healthy }
  api:
    depends_on:
      sms-migrate: { condition: service_completed_successfully }
      postgres:    { condition: service_healthy }
      redis:       { condition: service_healthy }
      minio:       { condition: service_healthy }
      srs:         { condition: service_healthy }
  web:
    depends_on:
      api: { condition: service_healthy }   # api healthcheck ใน Dockerfile (Phase 25)
  ```
  api รอ migrate ESC successfully + ทุก data service healthy ก่อน boot. Per DEPLOY-14.

### Compose meta
- **D-22:** Compose v2 syntax — เริ่มจาก `name: sms-platform` top-level (project name override). ไม่ใช้ `version:` field (deprecated ใน Compose v2). ทดสอบกับ `docker compose` (subcommand), ไม่ใช้ legacy `docker-compose` (Python).
- **D-23:** Image references: `image: ghcr.io/${GHCR_ORG}/sms-api:${IMAGE_TAG:-latest}`. Operator ต้อง set `GHCR_ORG=<github-org-or-user>` ใน `deploy/.env`. Default `IMAGE_TAG=latest` แต่ Phase 28 จะแนะนำ pin semver tag (`v1.3.0`) แทน.
- **D-24:** **No `build:` context** anywhere (DEPLOY-10) — ป้องกัน operator build บน prod server. Phase 28 CI build images แล้ว push GHCR; operator `docker compose pull && docker compose up -d`.

### `.env.production.example` template structure
- **D-25:** Group เป็น 4 sections:
  1. **Required (no default)** — DOMAIN, DB_PASSWORD, NEXTAUTH_SECRET, BETTER_AUTH_SECRET, MINIO_ROOT_PASSWORD, JWT_PLAYBACK_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
  2. **Image refs** — GHCR_ORG, IMAGE_TAG (default `latest`)
  3. **Defaults (override-only)** — POSTGRES_USER=`sms`, POSTGRES_DB=`sms_platform`, MINIO_ROOT_USER=`minioadmin`, REDIS_PASSWORD=(optional)
  4. **Computed** — DATABASE_URL, REDIS_URL, MINIO_ENDPOINT (commented out, generated from above by api startup logic หรือ operator override)
  Comment per var อธิบาย "what it does" + "how to generate" (e.g., `# 32+ char random — run init-secrets.sh or use openssl rand -base64 32`).

### Claude's Discretion
- Exact YAML formatting (anchor placement, indentation 2 vs 4 spaces — เลือก 2 ตาม dev compose)
- Healthcheck timing tuning (`start_period` per service — postgres ~10s, minio ~5s, srs ~15s)
- `init-buckets.js` exact code (MinIO `Client` instantiation, error handling for `BucketAlreadyOwnedByYou`)
- `init-secrets.sh` shebang + portability (default `bash`, fall back if needed)
- Network MTU (default 1500 — ไม่แก้)
- DNS resolver inside compose (Docker default 127.0.0.11)
- Compose project name (`name: sms-platform` — affects `_edge`/`_internal` network prefix)
- Whether to add `extra_hosts` block for host gateway (Phase 27 อาจต้อง)
- IP address ranges for networks (Docker auto-assigns — ไม่ pin)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap (locked decisions)
- `.planning/ROADMAP.md` §Phase 26 (lines ~106-115) — Goal + Success Criteria #1-6
- `.planning/REQUIREMENTS.md` §DEPLOY-10 (line 36) — GHCR-only, no `build:` context
- `.planning/REQUIREMENTS.md` §DEPLOY-11 (line 37) — Two-network topology spec
- `.planning/REQUIREMENTS.md` §DEPLOY-12 (line 38) — Named volumes survive recycle
- `.planning/REQUIREMENTS.md` §DEPLOY-13 (line 39) — `init: true`, healthcheck+`start_period`, `restart: unless-stopped`, JSON-file 10m×5
- `.planning/REQUIREMENTS.md` §DEPLOY-14 (line 43) — `sms-migrate` `restart: "no"` + `service_completed_successfully`
- `.planning/REQUIREMENTS.md` §DEPLOY-15 (line 44) — MinIO bucket auto-create idempotent
- `.planning/REQUIREMENTS.md` §DEPLOY-16 (line 45) — Default Stream Profile seed idempotent
- `.planning/REQUIREMENTS.md` §DEPLOY-22 (line 57) — `.env.production.example` + `init-secrets.sh`

### Research artifacts
- `.planning/research/SUMMARY.md` §Locked Decisions — `edge`+`internal` topology, 5 named volumes, init container pattern, GHCR-only no build:
- `.planning/research/ARCHITECTURE.md` §Compose Strategy — service breakdown + ordering + healthcheck composition
- `.planning/research/PITFALLS.md` §Pitfall 3 — FFmpeg zombie reaping (`init: true` + tini), `stop_grace_period: 30s`
- `.planning/research/PITFALLS.md` §Pitfall 8 — `.env` in image layer (Phase 24 closed at root); Phase 26 `.env` MUST stay outside image (`deploy/.env` referenced via `--env-file`)

### Existing code patterns (must align with)
- `docker-compose.yml` (root, dev) — pattern reference: postgres pg_isready, redis ping, minio mc ready, srs bash /dev/tcp probe, named volume usage. **Phase 26 ไม่แก้ไขไฟล์นี้** (dev compose remains).
- `config/srs.conf` — SRS dev config; production จะ mount file นี้แบบ read-only (or generate variant). Listen ports + http_api raw_api block essential สำหรับ api reload.
- `apps/api/src/prisma/schema.prisma` — Prisma schema; `prisma migrate deploy` ใช้ migrations folder ที่ runtime image carry แล้ว (Phase 25 D-12)
- `apps/api/src/storage/storage.service.ts` (verify path during planning) — MinIO client config + bucket usage pattern; init script จะ mimic
- `apps/api/src/profiles/profiles.service.ts` (verify) — Stream Profile entity shape สำหรับ seed script
- `apps/api/src/main.ts:25` — CORS allowlist; production CORS adjustment ผ่าน env var (DOMAIN-driven)
- `apps/api/src/app.module.ts` — HealthModule registered (Phase 25); api health endpoint = compose healthcheck source
- `apps/web/next.config.ts` — `outputFileTracingRoot` set (Phase 25); `rewrites` ใน prod ผ่าน Caddy (Phase 27 จะปรับ)
- `apps/api/Dockerfile` — image carries `node_modules/.bin/prisma` + `src/prisma/migrations/` + dist/ (Phase 25 D-14); init container reuses ทันที
- `apps/web/Dockerfile` — Next.js standalone runtime (Phase 25 D-16)

### Phase 24 hand-off
- `.planning/phases/24-deploy-folder-structure-dev-workflow-guardrails/24-CONTEXT.md` §D-01..D-09 — `deploy/` placeholder structure, root `.dockerignore` baseline. Phase 26 fills in `deploy/docker-compose.yml`, `deploy/.env.production.example`, `deploy/scripts/init-secrets.sh`.
- `CLAUDE.md` §Deploy Folder Convention — locks `deploy/` = production only; `deploy/scripts/` = bash only (no JS/package.json — would pollute pnpm workspace)

### Phase 25 hand-off
- `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md` §D-04 — image-side HEALTHCHECK; compose ไม่ override
- `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md` §D-08 — `init: true` + `stop_grace_period: 30s` ปล่อย Phase 26 owns
- `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-VERIFICATION.md` — image digests for both arm64+amd64 (regression baseline; Phase 28 native amd64 build ภายใน ±5%)

### CLAUDE.md project conventions
- `CLAUDE.md` §Prisma schema change workflow — 4-step rule (db reset → build → restart → verify); init container `prisma migrate deploy` ตรวจสอบ migration consistency; ไม่กระทบ workflow
- `CLAUDE.md` §SRS Deep Dive — port + protocol + healthcheck + DVR config reference

### Phase 27+ forward references (informational, ไม่ block Phase 26)
- Phase 27 Caddyfile จะ mount `caddy_data` volume; Phase 26 declare volume แต่ยังไม่มี Caddy service
- Phase 28 CI workflow push tags `:latest` + `:v1.3.x` + `:sha`; Phase 26 default `IMAGE_TAG=latest`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Dev `docker-compose.yml`** patterns — postgres healthcheck (`pg_isready`), redis (`redis-cli ping`), minio (`mc ready local`), srs (bash /dev/tcp probe). Reuse with adjustments (no host port for stateful services in prod).
- **`config/srs.conf`** — SRS production config can mount existing file as `:ro`. Listen ports + `http_api { raw_api { allow_reload on } }` block essential. dev/prod parity = good.
- **MinIO Client init pattern** — `apps/api/src/storage/` already creates buckets if missing (verify exact location during planning); init script can extract that logic to `apps/api/src/scripts/init-buckets.ts`.
- **Stream Profile entity** — `apps/api/src/profiles/profiles.service.ts` (verify) defines schema; seed script imports same Prisma client + Profile model.
- **NestJS `@Injectable()` services** — bootstrap chain ใน `main.ts` already handles lazy connection retries; init container ไม่ต้องแก้ NestJS code, แค่ทาบ shell command.
- **`scripts/dev-smoke.sh`** (Phase 24) — pattern reference สำหรับ Phase 30 prod smoke (boot stack + curl health). Phase 26 ไม่สร้าง smoke script เอง.

### Established Patterns
- **Pnpm workspace + `--filter @sms-platform/api`** — init scripts compile ผ่าน api package's SWC build; `dist/scripts/init-buckets.js` available หลัง `pnpm build`.
- **Prisma migrations as source of truth** (Phase 23 DEBT-05) — `prisma migrate deploy` reads `apps/api/src/prisma/migrations/` (already in api image runtime stage per Phase 25 D-14). No `db:push` ใน prod ever.
- **Env-driven config** — NestJS `ConfigModule` reads from `process.env`; compose `--env-file deploy/.env` passes vars; `environment:` block ใน compose maps subset เป็น container env vars.
- **MinIO `mc` CLI** — Bookworm-slim doesn't ship `mc` by default. api image ติดตั้งผ่าน Phase 25 (verify — ถ้ายังไม่ได้ติดตั้ง, plan task เพิ่ม install ใน Phase 25 hotfix หรือ init container apt install). Alternative: use MinIO JavaScript SDK from api image's node_modules (no extra binary needed) — preferred path.

### Integration Points
- **Phase 27 Caddy** — Phase 26 expose api:3003 + web:3000 + srs:8080 บน edge network; Phase 27 Caddyfile reverse-proxy เข้าผ่าน DNS names. caddy service จะ join edge network. caddy_data volume Phase 26 declare ไว้แล้ว.
- **Phase 28 CI** — `docker compose pull && docker compose up -d` cycle on every release. Phase 26 file MUST tolerate fresh pull (no cached layers, no local images). Verification step uses `docker compose config --quiet` for syntax + `docker compose pull` (offline-tolerant) + minimal up.
- **Phase 29 backup.sh** — backup script จะ `docker compose exec postgres pg_dump` + tarball minio_data via `docker run --rm -v minio_data:/data -v $PWD:/backup alpine tar czf /backup/minio.tgz /data`. Phase 26 named volumes = prerequisite.
- **Phase 30 smoke** — `nmap -p 5432,6379,9000,9001,1985 localhost` ต้อง CLOSED externally; Phase 26 D-07 + D-05 (`internal: true` network) is what makes this true.

</code_context>

<specifics>
## Specific Ideas

- **เลียนแบบ existing dev compose pattern** — postgres image, healthcheck syntax, named volume usage. แต่เปลี่ยน: no host ports for stateful, GHCR images for api/web (dev runs api on host), production env vars instead of hardcoded.
- **`stop_grace_period: 30s` only on api** — ตาม Pitfall 3 (FFmpeg ResilienceService graceful shutdown). web/srs ปล่อย default 10s.
- **GHCR org placeholder pattern** — `ghcr.io/${GHCR_ORG}/sms-api:${IMAGE_TAG}` แทน hardcode org. Operator setup `.env` ใส่ org name.
- **Init container scripts compile via api Dockerfile** — Phase 26 plan task เพิ่ม `apps/api/src/scripts/init-buckets.ts` + `seed-stream-profile.ts`; SWC compile via `pnpm --filter @sms-platform/api build`; runtime stage ของ Phase 25 Dockerfile copy `dist/` already includes scripts.
- **`docker compose --env-file deploy/.env` pattern** — operator runs from repo root or `deploy/`; `--env-file` flag explicitly passes path. `.env` itself goes to `deploy/.env` (NOT root `.env` which dev workflow uses).

</specifics>

<deferred>
## Deferred Ideas

- **`docker-compose.override.yml`** — dev/debug bind mount overrides (e.g., HLS bind to `./debug-hls` for inspection). Defer ถ้า operators ต้องการจริง — Phase 30+ feedback driven.
- **Resource limits (`deploy.resources.limits`)** — CPU/memory caps. Defer to Phase 29 sizing guide หรือ v1.4 multi-tenant.
- **Compose profiles** (`profiles: ["debug"]`) — selectively enable/disable services. Not needed for v1.3 — single profile = full stack.
- **External database support** — `DATABASE_URL` ชี้ไป external Postgres (RDS/managed). v1.3 self-hosted only; defer to v1.4.
- **Multi-arch image pull** — Phase 26 references `${IMAGE_TAG}` only; Docker daemon resolves arch automatically (amd64 on prod Linux). ARM64 path defer to v1.4 (Hetzner CAX).
- **`secrets:` block (Docker Swarm secrets)** — ไม่ใช้ swarm; standalone compose มี `--env-file` พอ. Defer indefinitely.
- **Named network IP pinning** — Docker auto-assigns; ไม่ pin range. Defer ถ้าเกิด conflict.
- **Watchtower auto-update** — Phase 25 deferred (research SUMMARY.md anti-features). Phase 26 ไม่ touch.
- **Reading `init-secrets.sh` value from Vault / sops** — Defer to enterprise tier. v1.3 = `openssl rand` ก็พอ.
- **Compose `extends:` for env inheritance** — Operator-friendly compose layer; Defer to Phase 30 quickstart UX.

</deferred>

---

*Phase: 26-production-compose-migrate-init-networking-volumes*
*Context gathered: 2026-04-27*
