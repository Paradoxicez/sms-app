# Pitfalls Research

**Domain:** Production Docker Compose deployment for NestJS + Next.js + Postgres + Redis + MinIO + SRS + FFmpeg stack — pull-only model via GHCR with auto-TLS reverse proxy
**Researched:** 2026-04-27
**Confidence:** HIGH (most pitfalls verified against official docs — Prisma, Next.js, Caddy, SRS — and the project's own RETROSPECTIVE.md / CLAUDE.md / current-state files)

> **Scope reminder.** Every pitfall below is specific to *adding production deployment surface* to the existing v1.2 codebase. Generic web-app advice (HTTPS, password hashing, OWASP) is omitted unless it intersects this stack. Carry-over tech debt from v1.2 (StreamProcessor undefined cameraId, hls_use_fmp4 cold-boot, ~23 API test failures) is folded in as Critical Pitfalls 14–16.

> **Reading guide for the roadmapper.** Each pitfall ends with a **Phase to address** anchor and an explicit **BLOCKER / DOCUMENT / FIXED-BY-TOOL-CHOICE** classification. The "Pitfall-to-Phase Mapping" table at the bottom is the single source of truth for what becomes phase verification criteria.

---

## Critical Pitfalls

### Pitfall 1: Prisma `db:push` running on production database

**What goes wrong:**
The current `apps/api/package.json` exposes a `db:push` script that chains `prisma db push --accept-data-loss` plus several raw `psql` migration files. `--accept-data-loss` will drop columns / tables that the schema no longer references. If the production entrypoint (or any operator) runs `pnpm --filter @sms-platform/api db:push` against the prod DATABASE_URL — e.g. because that's what the dev workflow trains muscle memory on, and CLAUDE.md elevates it as the canonical schema-change command — production data is gone.

**Why it happens:**
- Project's own CLAUDE.md "Prisma schema change workflow" section mandates `db:push` for the dev loop. New operators copy that into the deploy runbook by reflex.
- `db:push` is faster than `migrate dev` so it became the everyday command; nobody added a guard.
- `--accept-data-loss` is the *actual* flag in the script (`apps/api/package.json:18`), not a hypothetical.

**How to avoid:**
1. **Production must use `prisma migrate deploy` only** — it applies committed `prisma/migrations/*` SQL files in order, never drops, never prompts.
2. **Generate the first baseline migration before v1.3 ships.** The repo currently has hand-rolled SQL under `apps/api/src/prisma/migrations/<name>/migration.sql` invoked by `db:push`, NOT a real Prisma migration history. Convert to standard Prisma format (`prisma migrate diff` against an empty DB, then `prisma migrate resolve --applied` for the dev DB).
3. **Production image entrypoint runs only `prisma migrate deploy`** in a separate one-shot `migrate` service (or as a `depends_on` migrate-once container), then exits. The api container starts only after migrate exits 0. See Pitfall 6 for race-condition prevention.
4. **Strip `db:push` and `db:push:skip-rls` from the production image's package.json** OR run prod from `node dist/main` only (already the `start:prod` script — never invoke pnpm scripts in prod).
5. Add an explicit guard: `prisma migrate deploy` exits non-zero if migrations are out of order or missing — let it fail loudly.

**Warning signs:**
- Operator runbook draft says "run db:push to deploy schema changes" — STOP and rewrite.
- Container startup logs show `Datasource "db": ... pushing schema` — that's `db push`, not `migrate deploy` (which says `Applying migration ...`).
- `prisma migrate status` against prod shows "Database schema is out of sync with the migration history."

**Phase to address:** Migration baseline + `migrate deploy` entrypoint phase. **Classification: BLOCKER** — must be fixed before first prod boot.

---

### Pitfall 2: Stale Prisma client at runtime (the documented foot-gun, now in production)

**What goes wrong:**
CLAUDE.md already documents this: "stale client causes silent archive failures." The api container builds Prisma client at image-build time via `npx prisma generate`. If migrations are added to a running container without rebuilding the image, the client doesn't know about new fields — writes silently no-op (Prisma drops unknown keys, then SRS callbacks return `{code:0}` and look successful). `ArchiveMetricsService` was added in v1.2 explicitly to surface this. In production the symptom is recordings appearing to succeed but rows missing fields.

**Why it happens:**
- Production deploy = pull new image + restart compose. If the migrate sidecar pushes a new schema version but the api image was built against an *older* schema (lockfile drift, cached builder layer, manual hot-fix to schema.prisma without rebuild), client and DB diverge.
- Multi-arch builds with caching can re-use a stale `RUN npx prisma generate` layer if the upstream `COPY` didn't actually change.

**How to avoid:**
1. **Pin migration version to image build:** api image MUST contain a Prisma client generated against the same schema version that `migrate deploy` will apply. Mismatch = fail-fast on boot.
2. **Boot-time client/schema assertion:** API on startup queries `_prisma_migrations` table and compares the latest migration name against an env var `EXPECTED_MIGRATION` baked into the image at build time. If mismatch → exit 1.
3. **Bust the build cache when schema.prisma changes:** in the Dockerfile, `COPY apps/api/src/prisma/schema.prisma` BEFORE `RUN npx prisma generate` so the layer invalidates correctly. Don't just `COPY . .` and hope.
4. **Keep ArchiveMetricsService probe alive in prod** — the `/api/srs/callbacks/metrics` endpoint with `archives.status: failing` is the canary. Wire it to monitoring.

**Warning signs:**
- `/api/srs/callbacks/metrics` returns `archives.status: failing` with `lastFailureMessage` referencing a field name.
- SRS callbacks all return `{code:0}` but recordings table rows are missing newly-added columns.
- `prisma migrate status` and the runtime client disagree about schema state.

**Phase to address:** Same migration phase as Pitfall 1, plus monitoring/observability. **Classification: BLOCKER** — same failure mode the project already hit in dev.

---

### Pitfall 3: FFmpeg child-process zombies + signal propagation under PID 1

**What goes wrong:**
Container PID 1 will be `node dist/main`. NestJS spawns FFmpeg via fluent-ffmpeg / `child_process.spawn`. When `docker compose down` (or `restart api`) sends SIGTERM, two things break:
1. **Zombie children.** Node-as-PID-1 doesn't reap zombies the way init does, so FFmpeg processes that exit before being awaited become defunct entries (`<defunct>` in `ps`). Over a long-running deploy this leaks PIDs and eventually breaks `fork()`.
2. **Signal not forwarded.** SIGTERM arrives at node, but FFmpeg children don't receive it unless the application explicitly forwards. Result: docker waits 10s then SIGKILLs, orphaning FFmpeg → SRS keeps receiving RTMP from a dead origin → recordings corrupt.

**Why it happens:**
- Current dev Dockerfile uses `CMD ["npm", "run", "start:dev"]` (line 23). Production switches to `node dist/main`, inheriting the same PID-1 problem.
- v1.2 Phase 15 ResilienceService graceful shutdown covers application logic but relies on the container giving it enough time AND signals being forwarded — neither guaranteed under naked `node` as PID 1.
- macOS dev (Docker Desktop) is more forgiving than production Linux on this — won't surface in dev.

**How to avoid:**
1. **Use `tini` or `dumb-init` as PID 1.** Either:
   - `apt-get install -y tini` then `ENTRYPOINT ["/usr/bin/tini", "--"]` and `CMD ["node", "dist/main"]`, OR
   - **Set `init: true` on the api service in docker-compose.yml** (Docker injects its own tini). Strongly prefer this — simpler, no Dockerfile change.
2. **Set `stop_grace_period: 30s` on api service** — default 10s is too short for ResilienceService's graceful FFmpeg drain.
3. **Application-level signal forwarding:** ResilienceService.onModuleDestroy must call `child.kill('SIGTERM')` on every tracked FFmpeg PID, then `await Promise.race([waitExit, sleep(15000)])`, then `child.kill('SIGKILL')`. v1.2 Phase 15 implemented this for SRS-restart; verify it triggers on container shutdown too (process-level SIGTERM, not just SRS callback).
4. **Volume-write integrity UAT:** kill api container mid-recording, verify SRS's `on_unpublish` cleanup runs and the in-flight `.ts` is either complete or absent (not partial).

**Warning signs:**
- `ps -ef` inside container shows `<defunct>` FFmpeg entries.
- After `docker compose restart api`, SRS logs `client connection_lost` for cameras — FFmpeg orphaned and got killed by RTMP timeout instead of clean SIGTERM.
- Recordings have truncated/corrupt final segments after each api restart.
- StreamProcessor BullMQ jobs appear "active" but actual FFmpeg PIDs from the previous container generation are gone (matches the existing StreamProcessor undefined cameraId bug — see Pitfall 14).

**Phase to address:** Container hardening (Dockerfile + compose). **Classification: BLOCKER** — interacts with carry-over tech debt (Pitfall 14).

---

### Pitfall 4: SRS `hls_use_fmp4` cold-boot rejection (carry-over from v1.2)

**What goes wrong:**
Project's own documented bug (CLAUDE.md > "fMP4 HLS over MPEG-TS" decision row, RETROSPECTIVE > "What Was Inefficient"). `settings.service.ts:127` and `srs-origin.conf.ts:46` emit `hls_use_fmp4 on;` into the SRS config file. SRS v6.0.184 rejects this directive on cold start (parse error → SRS exits) but accepts it on hot reload via `/api/v1/raw?rpc=reload`. In dev this was masked — operators hot-reloaded after first boot. In a clean prod deploy with `docker compose up -d`, **SRS will fail to start on first boot** because no api is alive yet to push the reload, so the cold config has the rejected directive, and SRS crashes in a restart loop.

**Why it happens:**
- v1.2 deferred the fix because it wasn't blocking a v1.2 phase — only blocked Phase 15 Test 1 UAT and was worked around.
- Prod is a "true cold boot" scenario every time — there's no prior running SRS to reload.
- The bug is in *generated config*, not static config — operators editing `config/srs.conf` directly won't notice.

**How to avoid:**
1. **Strip `hls_use_fmp4 on` from the cold-boot template.** Keep MPEG-TS as the cold-start default; leave fMP4 as a settings-driven hot-reload override only. Consistent with the v1.2 finding that "SRS v6 falls back to MPEG-TS" anyway.
2. **OR upgrade to SRS v7** when stable — v7 supports fMP4 cold-boot. Per project memory `project_srs_v6_limits`, the upgrade path is documented but not yet executed. v1.3 production-readiness is a reasonable forcing function.
3. **Add a smoke test to v1.3 CI:** spin up SRS with the generated config in a fresh container, assert exit code 0 + `/api/v1/versions` 200 within 10s. Catches any future cold-boot regression.
4. **The Docker image cannot save us here** — bug is in the *config emission code* in NestJS, not in the SRS image. Must fix in api source.

**Warning signs:**
- `docker compose logs srs` on first boot shows `parse hls_use_fmp4` error followed by exit 1, then docker restarts the container in a loop.
- SRS healthcheck never passes on initial deploy.
- HLS playback URL returns 404 because no segments are written (SRS never finished booting).

**Phase to address:** SRS production-readiness phase OR pre-v1.3 fix-up phase. **Classification: BLOCKER** — without this fix, v1.3 cannot perform a single-command cold deploy.

---

### Pitfall 5: SRS `on_publish` / `on_play` HTTP callbacks pointing to `host.docker.internal`

**What goes wrong:**
Current `config/srs.conf` (lines 36-44) hardcodes `http://host.docker.internal:3003/api/srs/callbacks/...`. This works because the api currently runs on the host (not in compose) and `host.docker.internal` resolves from inside the SRS container to the host gateway. In v1.3 production, **api will be a sibling container** in the same compose network. `host.docker.internal` becomes unreliable:
- On Linux (production) it requires explicit `extra_hosts: host.docker.internal:host-gateway` — does NOT exist by default the way it does on Docker Desktop.
- Even if it resolves, it routes via the Docker gateway → host → back into the api container. Wasteful and breaks if the host has firewall rules.
- On a single-server deploy with api in compose, the correct address is the service DNS name: `http://api:3003/...`.

If callbacks fail, SRS rejects all publishes (since `on_publish` returning non-200 = deny) — **no streams will work**.

**Why it happens:**
- Dev convenience: api runs on host while SRS runs in compose. CLAUDE.md SRS section confirms the on-host pattern.
- Operators won't realize the URL needs to change for prod; the config file looks "static."
- Failure mode is silent then total — first publish attempt rejected, but operator doesn't see the error in api logs (callback never reached).

**How to avoid:**
1. **Templatize the SRS config.** settings.service.ts already generates srs.conf from a template — make the api callback host an env var: `SRS_CALLBACK_HOST` defaulting to `http://api:3003` in compose, `http://host.docker.internal:3003` only in dev override.
2. **Add `extra_hosts: host.docker.internal:host-gateway`** to the SRS service in docker-compose.yml *only* if the prod compose still uses host.docker.internal (it shouldn't).
3. **Verify with a synthetic publish at boot:** post-deploy script does `ffmpeg -re -f lavfi -i testsrc=size=320x240:rate=10 -c:v libx264 -t 5 -f flv rtmp://<host>:1935/live/healthcheck` and checks api logs for `on_publish` callback received.
4. **Don't expose port 1985 (SRS admin API) externally.** Currently exposed in docker-compose.yml line 37 — strip in prod compose. (See Pitfall 13.)

**Warning signs:**
- All cameras stuck "connecting" or immediately offline after deploy.
- SRS logs show `http_hooks on_publish failed, ret=...` with HTTP timeout or DNS error.
- api logs show no `on_publish` requests received.

**Phase to address:** Compose-networking + config-templating phase. **Classification: BLOCKER** — without this, no streams work.

---

### Pitfall 6: Migration container race conditions on horizontal restart

**What goes wrong:**
Even at single-server scale, `docker compose up -d` may restart api + migrate sidecar simultaneously, OR the migrate sidecar runs every boot. Two scenarios bite:
1. **Concurrent migrate runs.** If two migrate containers start (e.g. operator runs `up -d` twice quickly, or restart_policy is wrong), both try to acquire the Prisma migration advisory lock; one wins, the other times out and exits non-zero; depending on healthcheck logic, api might fail to start.
2. **api boots before migrate finishes.** Without `depends_on: condition: service_completed_successfully`, api may start, hit DB with stale schema, and 500 every request until migrate finishes.

**Why it happens:**
- Intuitive `depends_on: postgres` only waits for postgres to be running, not for migrations applied.
- Compose v3 dropped some `depends_on` conditions; v3.x and Compose Spec v2 differ in healthcheck-condition support.

**How to avoid:**
1. **One-shot migrate service:**
   ```yaml
   migrate:
     image: ghcr.io/<org>/sms-api:<tag>
     command: ["sh", "-c", "prisma migrate deploy"]
     restart: "no"
     depends_on:
       postgres:
         condition: service_healthy
   api:
     image: ghcr.io/<org>/sms-api:<tag>
     command: ["node", "dist/main"]
     depends_on:
       migrate:
         condition: service_completed_successfully
       postgres:
         condition: service_healthy
   ```
2. **Confirm Compose Spec version.** `service_completed_successfully` requires Compose Spec (no `version:` field) or compose v2.17+. Lock the runbook to "Docker Compose plugin >= 2.20."
3. **Don't run migrate in api's own entrypoint** — that re-runs every restart and re-applies the advisory-lock dance unnecessarily.
4. **Migration idempotency:** `prisma migrate deploy` IS idempotent (no-op if all applied), so re-run is safe but slow. Advisory lock is short.

**Warning signs:**
- api logs `PrismaClientInitializationError: P1000` or `Migration ... is locked` on first deploy.
- Operator sees 502 on / for 30+ seconds after deploy because api crashed before migrate finished.
- `_prisma_migrations` has rows in mid-state (`finished_at: null`).

**Phase to address:** Compose orchestration. **Classification: BLOCKER** for first deploy, **DOCUMENT** for steady-state restarts.

---

### Pitfall 7: Caddy data volume not persisted → Let's Encrypt rate limit lockout

**What goes wrong:**
Caddy's `/data` directory holds account keys, issued certificates, OCSP staples, and ACME state. If this directory is on an ephemeral container layer (no volume), every container restart triggers fresh Let's Encrypt issuance. **LE rate limits: 50 certs per registered domain per week, 5 duplicate certs per week, 5 failed validations per hour per account+hostname.** Hit 5 failures and the operator is locked out for 1 hour; hit 50 successes and locked out for a full week. A misconfigured prod can burn the weekly quota in one bad deploy session.

**Why it happens:**
- Default Caddy Docker example often shows ephemeral install. People copy it.
- Confirmed by Caddy docs: "On a production Docker swarm cluster, it's very important to store Caddy folder on persistent storage. Otherwise Caddy will re-issue certificates every time it is restarted, exceeding Let's Encrypt's quota."
- Operators iterating on Caddyfile may restart Caddy 10 times in an hour while debugging.

**How to avoid:**
1. **Persist `/data` and `/config`:**
   ```yaml
   caddy:
     image: caddy:2-alpine
     volumes:
       - caddy_data:/data
       - caddy_config:/config
       - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
   volumes:
     caddy_data:
     caddy_config:
   ```
2. **Use Let's Encrypt staging during initial debugging:** add `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` to Caddyfile global options block while iterating. Staging has 30,000 certs/account/week and untrusted certs (fine for testing). Switch to prod CA only when Caddyfile is stable.
3. **Caddyfile change ≠ cert reissue.** Caddy reuses cached certs unless the hostname changes.
4. **DO NOT use a bind mount on Linux without correct UID** — Caddy in Docker runs as root by default; bind mount permission errors cause silent fallback to in-memory. Named volume avoids this.
5. **Document the "I burned the rate limit" recovery:** wait 168h, OR use a different ACME account email, OR switch to ZeroSSL via Caddy `acme_ca` global option.

**Warning signs:**
- Caddy logs `error obtaining certificate ... rate limit exceeded`.
- Browser shows "your connection is not private" with `RATE_LIMITED` cert.
- Caddy issues a new cert on every restart (visible in `/data/caddy/certificates/...` directory mtime).

**Phase to address:** TLS / reverse-proxy phase. **Classification: BLOCKER** — lockout is multi-day to recover from.

---

### Pitfall 8: `.env` file copied into image OR committed to git

**What goes wrong:**
Two adjacent traps:
1. **`COPY . .` in Dockerfile copies `.env`** (current dev Dockerfile does exactly this — line 16). Even if `.env` is gitignored, it's still in the docker build context. The secret ends up in an image layer, visible via `docker history` or by extracting the layer tarball. Anyone who pulls the image from GHCR gets the secrets.
2. **`.env` checked into git history** — `.env.example` is fine, but if a developer ever `git add .` without checking, the actual `.env` is in history forever. `git rm` doesn't remove from history.

**Why it happens:**
- Dev Dockerfile has zero `.dockerignore` exclusions; everything in working dir goes into the build context. (No `.dockerignore` exists at repo root — verified.)
- `.gitignore` has `.env` at line 5 — but that doesn't prevent docker from copying it.
- pnpm workspace symlinks: `apps/web/.env` is a symlink to `../../.env` (verified — `ls apps/web/`). Copying `apps/web` into the image dereferences the symlink and pulls in the root `.env`.

**How to avoid:**
1. **Add `.dockerignore` at repo root:**
   ```
   .env
   .env.*
   !.env.example
   .git
   node_modules
   .next
   dist
   coverage
   .planning
   docker-data
   ```
2. **Multi-stage Dockerfile** never `COPY .env`. Secrets come at *runtime* via `env_file:` or `environment:` in compose. Image must be secret-free so it's safe to push to GHCR (even private GHCR — image hash leaks if compromised).
3. **CI pre-commit hook** (gitleaks or truffleHog) scans for AWS keys, JWT secrets, etc. before push. Backed by repo-level GitHub secret scanning.
4. **Scan built images:** `docker history <image>` should not show `.env` ADD/COPY; `dive` can inspect each layer to confirm no `.env` artifact.
5. **Rotate secrets before v1.3 GA.** Treat any pre-production `.env` as compromised — generate new BETTER_AUTH_SECRET, JWT_PLAYBACK_SECRET, MinIO root creds for prod.

**Warning signs:**
- `docker history ghcr.io/<org>/sms-api:tag` shows a layer with size matching `.env` plus `COPY` instruction.
- `git log --all --full-history -- .env` returns commits.
- Image tarball extracted via `docker save | tar` contains `app/.env`.

**Phase to address:** Image-build hardening + pre-merge CI lint. **Classification: BLOCKER for GA**, easy to verify mechanically.

---

### Pitfall 9: HLS segment volume + on_hls callback file path mismatch

**What goes wrong:**
Current docker-compose uses a bind mount for HLS: `./docker-data/srs-hls:/usr/local/srs/objs/nginx/html` (line 47, with the comment "A named volume here was invisible to the host process"). The api reads `.ts` segments from the host path when archiving recordings. In production:
1. **Bind mount path differs across environments** — dev uses `./docker-data/srs-hls`; prod might use `/var/lib/sms/hls`. The api's `SRS_HLS_PATH` env var (`.env.example:22`) is `/srs-hls` — neither dev nor prod.
2. **api is now a container**, not a host process. The bind mount needs to be mounted into BOTH SRS and api containers at the same path, OR use a named volume shared between them.
3. **on_hls callback delivers a *container-local* file path** (e.g. `/usr/local/srs/objs/nginx/html/live/cam1.ts`) to api. If api's mount path doesn't match SRS's, file reads 404.
4. **Permissions** — SRS writes as `srs` UID, api reads as `node` UID; if UIDs differ, EACCES.

**Why it happens:**
- The host-process pattern in dev hid the cross-container mount complexity.
- The `SRS_HLS_PATH` env var exists but is inconsistent with the actual compose mount.
- Named volumes don't show up at the host filesystem path the user expects (per the comment in compose).

**How to avoid:**
1. **Use a named volume shared between SRS and api in prod:**
   ```yaml
   srs:
     volumes:
       - hls_data:/usr/local/srs/objs/nginx/html
   api:
     volumes:
       - hls_data:/srs-hls:ro  # read-only — api only reads
     environment:
       SRS_HLS_PATH: /srs-hls
   ```
2. **Translate on_hls callback paths** in the api's SRS callback handler: strip the SRS-internal prefix and rewrite to api-internal path. Logic likely already exists for v1.2 — verify it's path-portable.
3. **Match UIDs OR use group-shared permissions** — easiest: run both containers as the same numeric UID (e.g. `user: "1000:1000"` in compose for both services).
4. **Backup strategy** — named volume contents must be in the backup runbook. Bind mounts are easier to back up but harder to share between containers.
5. **Document HLS retention** — `hls_dispose 30` in srs.conf means segments self-delete 30s after stream ends. Long-form recordings need DVR which writes to a different volume — confirm both volumes are mounted correctly.

**Warning signs:**
- api logs `ENOENT: no such file or directory, open '/srs-hls/live/...ts'` on every recording archive.
- ArchiveMetricsService shows `archives.status: failing` (the canary, again).
- Recordings are created in DB but the linked .mp4/.ts file is missing on disk.

**Phase to address:** Compose-volumes + recording-pipeline phase. **Classification: BLOCKER** — same path issue caused the bind-mount comment in the existing compose.

---

### Pitfall 10: WebSocket / Socket.IO reverse-proxy upgrade headers + trailing-slash trap

**What goes wrong:**
The project has multiple websocket gateways (NotificationsGateway, StatusGateway, SrsLogGateway). Next.js 15 already trips on Socket.IO's trailing-slash requirement — proven by the explicit comment in `apps/web/next.config.ts:11` (`skipTrailingSlashRedirect: true`) and the dual-rewrite-rule comment in lines 26-33 referencing `debug/resolved/notifications-srs-log-gateways-reject-browser-cookies.md`. In production, Caddy must:
1. Forward `/socket.io/` (with trailing slash) → api:3003 without rewriting.
2. Pass `Upgrade` and `Connection: Upgrade` headers (Caddy does this by default for WS, but only if upstream returns `101 Switching Protocols`).
3. Preserve the Better Auth session cookie (same-origin: must proxy `/socket.io/` AND `/api/*` AND `/` from the SAME hostname).
4. NOT terminate idle connections too aggressively (default proxy timeouts can drop long-lived WS).

**Why it happens:**
- Caddy's default `reverse_proxy` does support WS transparently, BUT:
  - If the operator splits the deploy into multiple hostnames (api on api.example.com, web on app.example.com), the cookie won't cross-origin and gateways reject the connection (this is exactly what the resolved-debug doc references).
  - Some operators put nginx in front of Caddy for "extra hardening" — nginx default DOES NOT pass WS upgrade headers without explicit `proxy_set_header Upgrade $http_upgrade;`. This breaks WS silently.
- Caddy reload behavior: per Caddy docs "WebSocket connections are forcibly closed when the config is reloaded." Acceptable but worth documenting.

**How to avoid:**
1. **Same-origin deploy:** put web AND api behind ONE hostname (e.g. `app.example.com`), with Caddy routing `/api/*` and `/socket.io/*` to api, everything else to web. The Next.js rewrites in `next.config.ts` already assume this pattern.
2. **Caddyfile pattern:**
   ```caddyfile
   app.example.com {
     handle /api/* {
       reverse_proxy api:3003
     }
     handle /socket.io/* {
       reverse_proxy api:3003
     }
     handle {
       reverse_proxy web:3000
     }
   }
   ```
   Caddy's default WS handling JustWorks™ here — no explicit upgrade header config needed.
3. **DO NOT use nginx in front of Caddy.** Caddy is sufficient. Adding a layer breaks WS unless every layer is configured.
4. **Bump WS proxy timeouts:** if cameras are idle for >2 min, dashboard WS can disconnect. Tune Caddy's `flush_interval -1` if needed (default fine for most cases).
5. **HLS .m3u8 playlist must not be cached** by Caddy or any intermediate. Caddy doesn't cache by default (good). If operator adds `cache` directive, exclude `.m3u8`. `.ts` segments can be cached for short TTL (30s).

**Warning signs:**
- NotificationBell stays empty even though api logs show events being broadcast.
- Browser devtools shows WS connection upgrade failed (101 not received).
- Camera status pills don't update in real time (StatusGateway broken).

**Phase to address:** Reverse-proxy phase. **Classification: FIXED-BY-TOOL-CHOICE** for Caddy if same-origin pattern is enforced; otherwise BLOCKER.

---

### Pitfall 11: GHCR private image pull on prod server requires login

**What goes wrong:**
Public images on GHCR pull anonymously. Private images do not. If v1.3 makes images private (correct default for closed-source SaaS), the prod server must authenticate before `docker compose pull` works. First-time deploy fails with `unauthorized: authentication required`. CI builds work because GitHub Actions has `GITHUB_TOKEN` injected automatically — operators don't.

**Why it happens:**
- GHCR private images are gated by GitHub PAT (Personal Access Token) with `read:packages` scope. CI uses `GITHUB_TOKEN` which has `packages: write` (or `read`) scoped automatically.
- New operators don't know GHCR uses a different auth flow than Docker Hub.
- PATs expire (default 30/60/90 days) — silent failure on next deploy.

**How to avoid:**
1. **Document the prod-server bootstrap one-liner:**
   ```bash
   echo "$GITHUB_PAT" | docker login ghcr.io -u <github-username> --password-stdin
   ```
   in `deploy/README.md`.
2. **Use a fine-grained PAT scoped to `read:packages` only**, NOT a classic PAT with full repo access. Fine-grained PATs can also be scoped to specific orgs.
3. **Set PAT to no-expiration if the prod server is stable**, OR set up monitoring that pings `ghcr.io/v2/<org>/sms-api/manifests/latest` weekly and alerts on 401.
4. **OR consider deploy keys / GitHub Apps** for production — App-installation tokens auto-rotate.
5. **CI publish workflow needs `permissions: packages: write`** in the job declaration. Without it, `docker push ghcr.io/...` fails with 403 even though `GITHUB_TOKEN` exists.

**Warning signs:**
- `docker compose pull` on prod returns `denied: requested access to the resource is denied` or `401 Unauthorized`.
- CI workflow run logs show push step failing with `403 Forbidden`.
- Operator can pull manually via `docker pull` but compose can't (different docker config; rare but happens).

**Phase to address:** CI/CD pipeline + deploy runbook phase. **Classification: DOCUMENT** — easy fix once known, but blocks first deploy if undocumented.

---

### Pitfall 12: Multi-arch build produces broken sharp / Prisma binaries

**What goes wrong:**
The api stack uses `sharp` (image transcoding for avatars — Phase 16) and `@prisma/client` (with native query engine). Both ship platform-specific binaries:
- sharp uses libvips bindings — `linux-x64-musl` vs `linux-x64-glibc` vs `linux-arm64-glibc`.
- Prisma's query engine is `linux-musl-arm64-openssl-3.0.x`, `linux-musl-openssl-3.0.x`, `linux-debian-openssl-3.0.x`, etc.

If CI builds AMD64 only but the prod server is ARM64 (e.g. Hetzner ARM, AWS Graviton, an M-series Mac mini), the image runs but sharp/Prisma crash at runtime with cryptic "module not found" or "incompatible architecture" errors. If CI builds *both* arches via buildx but `prisma generate` ran only for the build-host arch, the resulting fat manifest has a broken binary in one arch.

**Why it happens:**
- `node:22-slim` is multi-arch — buildx happily produces both manifests, but native modules need explicit `npm install --target_arch=arm64` or platform-aware install.
- `prisma generate` defaults to the runtime platform; running it inside a buildx emulated arm64 stage works but is 5-10× slower. Operators disable cross-arch builds out of impatience.
- Switching to alpine (musl) without telling Prisma → wrong query engine downloaded.

**How to avoid:**
1. **Decide on AMD64-only or AMD64+ARM64 explicitly.** If unsure, ship AMD64 only (matches most VPS providers). Add ARM64 later if needed.
2. **Use `node:22-slim` (Debian glibc), NOT `node:22-alpine` (musl).** sharp + Prisma + ffmpeg all have better support on glibc. Image is ~80MB larger but worth it.
3. **For multi-arch builds:** use buildx with `--platform linux/amd64,linux/arm64` and ensure Prisma's `binaryTargets` in schema.prisma includes:
   ```prisma
   generator client {
     provider = "prisma-client-js"
     binaryTargets = ["native", "linux-musl-openssl-3.0.x", "debian-openssl-3.0.x", "linux-arm64-openssl-3.0.x"]
   }
   ```
4. **Test the produced image** — pull on a non-build-host arch and run `node -e "require('sharp')"` and `node -e "require('@prisma/client')"` in CI before tagging release.
5. **Pin sharp version** — sharp 0.34.x is in package.json (`apps/api/package.json:49`); follow its compatibility matrix.

**Warning signs:**
- api crashes at boot with `Error: Cannot find module '@prisma/client/runtime/library'` or `dlopen ... incompatible architecture`.
- sharp throws `something went wrong installing the "sharp" module` at first avatar upload.
- CI builds succeed but operator reports "image won't start" after pull.

**Phase to address:** Image-build phase + CI release phase. **Classification: DOCUMENT** unless ARM target confirmed; **BLOCKER** if multi-arch is a stated v1.3 goal.

---

### Pitfall 13: MinIO console + admin port leak

**What goes wrong:**
Current docker-compose (lines 62-63) exposes BOTH MinIO ports:
- `9000` — S3 API (must be reachable by api container, NOT by internet)
- `9001` — MinIO Console UI with default creds `minioadmin:minioadmin` (lines 65-66)

In production, exposing 9001 to the internet with default creds is an immediate compromise — the console allows anyone to read/write all buckets. Even rotating creds, exposing the console adds attack surface.

Likewise, **SRS port 1985 (admin API)** is exposed in dev compose (line 37). The admin API allows DELETE /api/v1/clients/{id} (kick viewers), config reload, etc. Must NOT be reachable externally.

**Why it happens:**
- Dev convenience: operator wants to see the bucket UI from their laptop.
- Default-deny mindset isn't natural with compose; you have to explicitly REMOVE port mappings.
- Lots of "MinIO production setup" tutorials show 9001 exposed.

**How to avoid:**
1. **Strip both port mappings from prod compose:**
   ```yaml
   minio:
     image: minio/minio:latest
     # NO ports: section in prod
     environment:
       MINIO_ROOT_USER: ${MINIO_ROOT_USER}
       MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
     command: server /data --console-address ":9001"
   ```
   Other containers reach minio via `http://minio:9000` on the compose network.
2. **Strip SRS port 1985** from prod compose — admin API only needs to be reachable by api on internal network. (1935/RTMP, 8080/HLS, 8000/UDP-WebRTC, 10080/UDP-SRT remain exposed since they serve external clients.)
3. **Rotate MinIO creds** — `.env.example:19-20` has `minioadmin:minioadmin`; prod must generate a 32+ char password.
4. **If console access is needed:** SSH-tunnel to the prod server (`ssh -L 9001:localhost:9001 prod`) instead of public exposure.
5. **MinIO upgrade caveat:** the deprecation of MinIO Community Edition's standalone console (mid-2025) means operators may need to migrate to MinIO Enterprise's mc CLI for admin tasks. Worth verifying before v1.3 ships.

**Warning signs:**
- `nmap -p 9000,9001,1985 <prod-host>` returns open.
- Browser at `http://<prod-host>:9001` returns MinIO login.
- Audit log shows MinIO reads/writes from unexpected source IPs.

**Phase to address:** Compose hardening phase. **Classification: BLOCKER for GA** — security-critical.

---

### Pitfall 14 (CARRY-OVER): StreamProcessor undefined cameraId silent enqueue

**What goes wrong:**
Per project memory `project_streamprocessor_undefined_bug` and PROJECT.md "Tech debt carried into v1.3": workers occasionally enqueue jobs with empty data, causing cameras to stick. In production this manifests as:
- Cameras report "online" in the UI but stream is dead.
- BullMQ shows jobs in `active` state with `data: {}`.
- StreamProcessor.process tries to look up the camera by undefined ID, swallows the error, never reschedules.

In dev this is annoying. In production with 24/7 monitored cameras, it's a silent outage — cameras don't recover until manual intervention.

**Why it happens:**
- Multiple enqueue paths (CLAUDE.md mentions 4 sources, unified to single jobId in Phase 15-02).
- One of those paths still occasionally passes a job whose `data` field hasn't been populated when the producer races with the consumer.
- No defensive guard at consumption time → undefined cascades through the lookup logic.

**How to avoid:**
1. **Add defensive guard to StreamProcessor.process:**
   ```typescript
   async process(job: Job<StreamJobData>) {
     const cameraId = job.data?.cameraId;
     if (!cameraId) {
       this.logger.error(`StreamProcessor received job ${job.id} with empty cameraId; failing fast`, { jobData: job.data });
       throw new Error(`StreamProcessor: missing cameraId for job ${job.id}`);
     }
     // ... existing logic
   }
   ```
   Failing fast triggers BullMQ's retry logic; better than silent stuck.
2. **Audit all 4 enqueue paths** to find the producer that emits empty data. Most likely candidates per Phase 15 unification work: srs callback retry path, hot-reload publisher, boot-recovery enqueue, StatusService transition.
3. **Add a vitest unit test** that asserts every enqueue site populates `data.cameraId` before calling `queue.add`.
4. **Add a metric:** `bullmq_jobs_with_empty_cameraId_total` — alert when > 0.
5. **Cleanup script** in deploy/scripts: `cleanup-stuck-jobs.sh` finds active jobs with empty data, force-fails them, lets the StatusService re-enqueue from current camera state.

**Warning signs:**
- ArchiveMetricsService or BullMQ admin UI shows active jobs older than 60s — the camera-health tick should have reconciled by then.
- Camera "Online" pill but no recent SRS on_hls callback for that camera.
- This bug has existed since 2026-04-21 and has appeared across multiple phases without being root-caused.

**Phase to address:** Tech-debt cleanup phase (must be in v1.3). **Classification: BLOCKER for v1.3 GA** — production outage risk; not a deployment-surface issue per se, but going to prod without a fix is irresponsible.

---

### Pitfall 15 (CARRY-OVER): Pre-existing API test failures (~23) blocking CI green-on-tag

**What goes wrong:**
Per PROJECT.md: ~23 failing tests in apps/api — auth/crypto ESM imports, recording manifest fMP4, srs callback mocks, cluster service tests. v1.3 wants `git tag v1.3.0` → CI builds + pushes images. If CI runs `pnpm test` before image push (it should), it fails forever. Operators learn to ignore CI red, which defeats the purpose of CI gating.

**Why it happens:**
- Tests broke during v1.2 phases (or earlier) and were never tackled because shipping features felt more urgent.
- ESM/CJS interop bites Node 22 — some packages publish dual bundles, others don't, vitest's mocking layer trips on resolution.
- fMP4 manifest tests are entangled with the same SRS v6 limitation as Pitfall 4.

**How to avoid:**
1. **Triage the 23 failures into 3 buckets:**
   - **Fix-now (blocks v1.3 GA):** anything testing logic on the deployment hot path (auth, srs callbacks).
   - **Skip-with-issue (defer to v1.4):** anything testing v1.2-deprecated paths (fMP4 manifest, if SRS stays on v6 + MPEG-TS). Mark `it.skip` with a `// TODO(GH-issue-NNN)` reference.
   - **Delete (truly stale):** tests for features that no longer exist.
2. **Lock CI to fail on red.** Once triaged, `pnpm test` must exit 0 on main. Add a GitHub Actions required check.
3. **DO NOT skip the entire test suite via `--passWithNoTests` or `vitest run --reporter=silent`** — that's the visible anti-pattern.
4. **Set up coverage floor** — once green, lock at the current line%/branch% so regressions are visible.
5. **Pre-existing failures are partly an artifact of methodology drift** (RETROSPECTIVE: "Wave-0 / Nyquist drift across 6/11 phases"). Wave-0 compliance for v1.3 phases prevents accumulating new debt.

**Warning signs:**
- CI README says "expect ~23 failures, that's fine" — DELETE this README.
- New developers can't tell real failures from chronic ones.
- A real bug ships because a relevant test was assumed to be in the "ignored 23."

**Phase to address:** Test-cleanup phase (consider parallel with image-build phase). **Classification: BLOCKER for CI gating model** — if you want green-on-tag, you need green tests.

---

### Pitfall 16 (CARRY-OVER): Phase 22 ↔ Phase 17 metadata gap

**What goes wrong:**
Per PROJECT.md and RETROSPECTIVE: Phase 22 surfaced camera tags + description across DataTable, view-stream-sheet, map popup, webhook, audit, Dev Portal — but Phase 17's `/app/recordings/[id]` playback page does NOT render that metadata. Operators reviewing footage cannot see parent camera context.

**Why it happens:**
- Phase 22's surface scope didn't include Phase 17's page (cross-phase integration gap).
- Per-phase verification checks each surface in isolation; only the milestone-audit cross-check catches gaps like this.

**How to avoid:**
1. **Treat as v1.3 enhancement, not blocker.** It's a UX gap, not a production outage risk. Roadmap should include it but not gate v1.3 GA on it.
2. **Add a small phase or single plan:** wire `camera.tags` and `camera.description` into the recording detail loader + render in the page header. Probably <100 LOC.
3. **Establish a cross-phase integration check** in v1.3 phase verification template — for each surface added, list which other surfaces should also receive the metadata, and verify.

**Warning signs:**
- Operator screenshot of `/app/recordings/<id>` shows no tags / description (the page already exists; just verify the gap).

**Phase to address:** UI polish phase or tagged onto the metadata-utilization tail. **Classification: DOCUMENT** — explicit non-blocker; ship even if deferred.

---

### Pitfall 17: HTTP-01 challenge port 80 firewall closed

**What goes wrong:**
Caddy uses HTTP-01 challenge by default: LE hits `http://<domain>/.well-known/acme-challenge/<token>`. If the prod server's firewall blocks port 80 (because operator only opened 443 thinking "we're HTTPS-only"), Caddy can't issue certs. Compounded by Pitfall 7 (rate limit) — 5 failures locks the account for 1 hour.

**Why it happens:**
- "Modern" config advice = "redirect HTTP to HTTPS" — operators implement that as "block 80 entirely."
- Cloud provider security groups default-deny.
- DNS hasn't propagated yet at deploy time (NXDOMAIN → cert fails → operator panics → 5 retries → rate limit).

**How to avoid:**
1. **Open both 80 and 443 to the world.** Caddy auto-redirects 80 → 443 except for ACME challenges.
2. **Use DNS-01 challenge if you must lock down 80.** Requires Caddy DNS plugin (e.g. `caddy-dns/cloudflare`) and a DNS API token. More complex but immune to firewall-port issues.
3. **Pre-flight check before first deploy:**
   ```bash
   curl -I http://<your-domain>  # should succeed before docker compose up
   dig <your-domain> +short      # confirm A record points at the prod IP
   ```
   Add to deploy README.
4. **Verify DNS propagation** — `dig @8.8.8.8 <domain>` and `dig @1.1.1.1 <domain>` both return the right A record. TTL of new domains can be 48h.
5. **Use Caddy's staging endpoint first** to debug without burning rate limit (see Pitfall 7).

**Warning signs:**
- Caddy logs `validation failed` or `unauthorized` from acme-v02.api.letsencrypt.org.
- `curl http://<domain>/.well-known/acme-challenge/test` returns connection refused or timeout.
- Browser says "your connection is not private" with a self-signed Caddy fallback cert.

**Phase to address:** Deploy README + pre-flight checklist. **Classification: DOCUMENT**.

---

### Pitfall 18: Dev workflow contamination from `deploy/` folder

**What goes wrong:**
Adding a `deploy/` folder at repo root sounds harmless. But:
1. If `deploy/` contains its own `package.json` (e.g. for a deploy script), pnpm workspace globs (`pnpm-workspace.yaml` currently has `apps/*`) might pick it up if changed loosely.
2. If `deploy/Dockerfile` exists at root, `docker build` without `-f` picks it up instead of `apps/api/Dockerfile`.
3. If `deploy/docker-compose.prod.yml` is referenced by a script that overrides COMPOSE_FILE env, dev's `docker compose up` might accidentally use prod compose.
4. If the api's existing dev `Dockerfile` is modified in-place to support multi-stage prod builds, `pnpm dev` workflow (which doesn't currently use Docker for api — it runs `nest start --watch` on host per `dev:api` script) shouldn't break, but a careless rewrite that drops the dev `CMD ["npm", "run", "start:dev"]` would.

**Why it happens:**
- Refactor pressure: "let's clean up the Dockerfile while we're here."
- Convention drift: pnpm workspace globs are not strict about what they match.

**How to avoid:**
1. **Leave existing `apps/api/Dockerfile` for dev.** Create a NEW `apps/api/Dockerfile.prod` (multi-stage). Never overwrite the dev one.
2. **All prod artifacts in `deploy/`:**
   - `deploy/docker-compose.prod.yml` (or `compose.yml`)
   - `deploy/Caddyfile`
   - `deploy/.env.production.example`
   - `deploy/scripts/*.sh`
   - `deploy/README.md`
3. **`pnpm-workspace.yaml` stays as-is** — `apps/*` only. `deploy/` is not a workspace member.
4. **No `package.json` in `deploy/`.** If you need scripts, use shell or Makefile.
5. **Dev workflow regression test (in CI):**
   ```bash
   pnpm install
   pnpm --filter @sms-platform/api build
   pnpm --filter @sms-platform/web build
   pnpm dev &  # smoke test that this still works
   sleep 10 && curl http://localhost:3001/health || exit 1
   ```
6. **Document in CLAUDE.md** that `deploy/` is prod-only, separate from dev; existing `apps/api/Dockerfile` remains the dev Dockerfile.

**Warning signs:**
- `pnpm install` in repo root traverses `deploy/` looking for package.json.
- `docker compose up` (without explicit `-f`) suddenly fails with "service not found" — it picked up the wrong compose file.
- Dev's `pnpm --filter @sms-platform/api start:dev` fails because someone replaced the entire Dockerfile with multi-stage prod.

**Phase to address:** Deploy-folder structure phase (early in v1.3, before Dockerfile changes). **Classification: BLOCKER** for clean v1.3 — easy to prevent, easy to wreck.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Run migrations in api entrypoint instead of separate migrate service | One less compose service to define | Race conditions on multi-instance deploy; harder to debug failed migrations | Single-replica only AND idempotent migrations (`migrate deploy` is idempotent — but advisory-lock contention still possible) |
| Skip multi-stage Dockerfile, ship dev Dockerfile to prod | Faster initial dockerization | Image is 1.5GB+ (vs ~300MB), includes dev deps and tooling, slower pulls, larger attack surface | Never for GA |
| Use `latest` tag instead of pinned `v1.3.0` | Operator types less | Cannot rollback by pulling old tag; cache-poisoning risk; non-deterministic deploys | Pre-production only |
| Bind-mount source into prod container | Easy hotfixes without rebuild | Image becomes meaningless; security boundary gone; can't roll back | Never for prod |
| Defer multi-arch build to "later" | Halves CI time | Locks platform choice; ARM users blocked | Always until ARM target confirmed |
| Skip the StreamProcessor undefined cameraId guard | Saves 30 lines of code now | Production cameras silently stick; manual intervention; user trust loss | Never for GA |
| Hardcode `BETTER_AUTH_URL=https://app.example.com` in image | One less env var | Image not portable; operator can't run staging from same image | Never |
| Run as root in container | One less Dockerfile line | Container escape = host escape; node_modules writable; volumes owned by 0 | Dev only, NOT prod |
| Don't persist Caddy /data | Compose YAML 2 lines shorter | LE rate limit lockout (Pitfall 7) | Never for prod |
| Embed Prisma migrations as `prisma db push --accept-data-loss` | Same dev script for prod | Prod data loss on first wrong run | Never (Pitfall 1) |
| Skip the 23 failing tests via `--passWithNoTests` | Green CI right now | Real regressions hide; trust in CI eroded | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SRS ↔ api callbacks | Use `host.docker.internal` in prod compose | Use service DNS name `http://api:3003`; templated via env var |
| Postgres ↔ Prisma migrate | api owns migrations and applies on startup | Separate `migrate` one-shot service with `service_completed_successfully` dependency |
| Redis ↔ BullMQ | Single Redis used for BullMQ AND ioredis app cache without keyspace separation | Use Redis logical DB 0 for app cache, DB 1 for BullMQ; OR namespace prefix `bullmq:` (BullMQ default) |
| MinIO ↔ api | Hardcode `localhost:9000` from .env.example into prod | Use `http://minio:9000` via env var; default-deny external port |
| FFmpeg ↔ SRS | Use `host.docker.internal` for SRS RTMP push | Use `rtmp://srs:1935/live/<key>` on compose network |
| Caddy ↔ api WebSocket | Add explicit `Upgrade` headers thinking they're missing | Trust Caddy's transparent WS support; add nothing; verify via browser devtools |
| GitHub Actions ↔ GHCR | Use a personal PAT in CI workflow | Use built-in `GITHUB_TOKEN` with `permissions: packages: write` |
| HLS volume ↔ api | Bind-mount a host path that only SRS sees | Named volume mounted to BOTH SRS (write) AND api (read-only) at the same internal path |
| sharp ↔ Alpine | Use `node:22-alpine` to save 80MB | Use `node:22-slim` (Debian); sharp + Prisma + ffmpeg all play nicer with glibc |
| Better Auth ↔ Caddy | Different origin for api vs web | Same-origin via Caddy `handle` blocks, OR explicit CORS + cookie SameSite=None+Secure |
| Compose `depends_on` | Use bare `depends_on: [postgres]` | Use `depends_on: postgres: condition: service_healthy` (requires Compose Spec, no `version:` field) |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Connection pool exhaustion (Prisma → Postgres) | api intermittent `Timed out fetching a new connection from the connection pool` | Set Prisma `connection_limit` (e.g. `?connection_limit=10`); pgBouncer if scaling api | ~50 concurrent api requests with default pool |
| FFmpeg PID flood | Kernel `fork: resource temporarily unavailable`; api can't spawn new procs | Cap concurrent FFmpeg via BullMQ concurrency setting (already in v1.0); monitor via cgroup pid limit; `pids_limit` in compose | ~500 cameras on a single host without limits |
| HLS segment disk fill | Disk full → SRS hangs writes → cameras drop | `hls_dispose 30` already set; live HLS auto-cleans; DVR retention enforced by api scheduled job; alert at 80% disk | DVR retention not enforced + 100+ cameras |
| BullMQ stalled jobs from killed FFmpeg | Active jobs accumulate; new jobs queue forever | StreamProcessor undefined cameraId guard (Pitfall 14); BullMQ stalledInterval = 30s; max stalled count = 1 | After every container restart without graceful shutdown |
| Caddy single-instance bottleneck | TLS handshakes serialize on cold cache | Caddy is async — rarely a bottleneck below 1k req/s; if needed, two-instance setup with shared `/data` | ~5k concurrent HLS clients on one Caddy |
| Postgres lock contention on RLS sessions | `set_config('app.current_org_id', ...)` per request slows under load | Connection-pool per-tenant or per-request; verify Prisma transaction wrapping doesn't create N+1 set_configs | ~200 req/s with current pattern |
| Recording manifest .ts file count explosion | DVR file listing in api takes >5s | Index by date prefix; periodic compaction script in deploy/scripts | 10k+ segments per camera (DVR with hls_window 6, retention 7d) |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `.env` in image layer | GHCR pull leaks DB password, JWT secret, MinIO creds | `.dockerignore` + multi-stage build; secrets only via runtime env (Pitfall 8) |
| Default MinIO creds in prod | Any 9001-reachable attacker reads all buckets | Strip 9001 port; rotate `MINIO_ROOT_PASSWORD` to 32+ chars (Pitfall 13) |
| SRS port 1985 (admin API) exposed | Anyone can `DELETE /api/v1/clients/{id}` to disconnect viewers; reload config | Strip 1985 port from prod compose (Pitfall 13) |
| `JWT_PLAYBACK_SECRET` shared across environments | Dev token works in prod | Generate distinct 64-char random secret per env at first deploy |
| Caddy access logs disabled | No audit trail of inbound requests | Caddy logs to stdout by default — pipe to log aggregator |
| HTTPS only on app domain, api on plain HTTP | MITM steal session cookies | Same-origin Caddy pattern (Pitfall 10); both routes via TLS |
| Container runs as root | Container escape escalates to host root | `USER 1000:1000` in Dockerfile final stage; chown app dir to 1000 |
| FFmpeg consumes attacker-controlled URL | RTSP URL as SSRF vector → internal network scan | Validate camera URL against allowlist of public IPs / camera registries; FFmpeg already in DTO allowlist (Phase 19) |
| Better Auth secret rotated mid-deploy | All sessions invalidated; users logged out | Rotate at maintenance window; document procedure |
| Logging full request body | Logs contain auth tokens, passwords, API keys | NestJS interceptor strips known-sensitive fields; configure Pino redaction |
| No rate limit on `/api/playback/sessions` | Attacker mints unlimited playback URLs | NestJS `@nestjs/throttler` (already in package.json:30) — verify per-IP and per-API-key limits applied |
| Webhook delivery without HMAC signature | Attacker forges webhooks to consumer | HMAC SHA-256 over body using subscriber's secret; consumer verifies |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Long deploy outage during migration | Users see 502 for 30s+ | Rolling restart pattern: api is stateless so a fresh container can come up before the old dies (zero-downtime requires reverse-proxy health check + grace) |
| Cache invalidation on deploy | Users see stale UI for 5min after deploy | Next.js standalone `BUILD_ID` is unique per build; static asset hashes invalidate browser cache automatically |
| WS reconnect storm after deploy | All dashboards reconnect at once → api spike | Client-side exponential backoff with jitter; verify NotificationsGateway client lib has it |
| Recording playback breaks for 24h after schema change | Recording listing returns 500 because old client | See Pitfall 2 (stale Prisma client) |
| TLS cert renewal mid-stream drops viewers | HLS playback hiccup at hour-90 | Caddy renews 30 days before expiry; renewal is hot — no proxy restart needed |
| First-deploy DNS not propagated | Operator sees site down for 30 min | Pre-flight DNS check in deploy README (Pitfall 17) |
| Operator can't tell if deploy succeeded | Manual `curl /health` per service | Single deploy script that polls all healthchecks and reports status |

---

## "Looks Done But Isn't" Checklist

- [ ] **Multi-stage Dockerfile:** Often missing `USER` directive — verify final image runs as non-root (`docker run --rm <image> id` returns uid != 0).
- [ ] **`.dockerignore`:** Often missing `.env`, `.git`, `.planning` — verify with `tar -czf ctx.tar.gz $(docker buildx build --no-cache --output=- .)` and inspect.
- [ ] **Migration on boot:** Often skipped for "v1, will fix later" — verify a fresh DB volume + `docker compose up` produces a queryable schema before api starts.
- [ ] **Healthchecks:** Often runs immediately and fails first 3 retries — verify `start_period: 30s` is set on api/web/srs healthcheck.
- [ ] **Prisma client regen:** Often the schema.prisma COPY is after node_modules COPY — verify schema.prisma changes invalidate the `prisma generate` layer.
- [ ] **Caddy data volume:** Often forgotten — verify `docker volume inspect caddy_data` exists and contains `caddy/certificates/...`.
- [ ] **Stop grace period:** Often default 10s — verify api has `stop_grace_period: 30s` for ResilienceService drain.
- [ ] **PID 1 is init:** Often raw `node` — verify `init: true` in compose service or tini ENTRYPOINT.
- [ ] **HLS volume shared across SRS+api:** Often only SRS has it — verify api can read a known segment file via container exec.
- [ ] **on_publish callback reachable:** Often using host.docker.internal — verify SRS-internal `curl http://api:3003/api/srs/callbacks/on-publish` works.
- [ ] **GHCR private pull configured:** Often forgotten — verify `docker pull ghcr.io/...` works on a fresh prod server before first deploy.
- [ ] **DNS A record propagated:** Often "should be done by now" — verify with `dig +short` from multiple resolvers.
- [ ] **Port 80 reachable:** Often closed for "security" — verify `curl -I http://<domain>` returns Caddy redirect, not connection refused.
- [ ] **MinIO console port stripped:** Often left in by accident — verify `nmap -p 9001 <host>` returns closed.
- [ ] **SRS admin port stripped:** Often left in by accident — verify `nmap -p 1985 <host>` returns closed.
- [ ] **StreamProcessor guard:** Often "v1.4 problem" — verify a job with empty data fails fast (not silent stick).
- [ ] **Test suite green:** Often "we know about those 23" — verify CI fails on red and main is green.
- [ ] **fMP4 cold-boot fix:** Often deferred — verify `docker compose up -d` from clean volumes makes SRS healthy without manual reload.
- [ ] **Rollback documented:** Often "just pull old tag" — verify rollback tested at least once with real data shape change.
- [ ] **Backup tested:** Often "we have postgres dumps" — verify a restore from backup produces a working system.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| `db:push` ran on prod, data lost | HIGH | Restore from latest postgres dump; replay write-ahead-log if PITR enabled; warn users of session loss |
| Stale Prisma client crashes api on startup | MEDIUM | Pull previous image tag (`docker compose pull && up -d` with old tag); investigate; rebuild image with regenerated client |
| FFmpeg zombies leak PIDs | LOW | `docker compose restart api`; add `init: true` for next deploy |
| `hls_use_fmp4` cold-boot crash loop | LOW (after fix) | Edit `config/srs.conf` on host to remove directive; `docker compose restart srs`; ship api fix |
| host.docker.internal callbacks failing | LOW | Update SRS config to use service DNS; reload SRS; api logs should show callbacks within seconds |
| Migration race on first deploy | LOW | `docker compose down`; `docker compose up -d` (idempotent migrate will reconcile); check `_prisma_migrations` table |
| LE rate limit hit | HIGH (time-only) | Switch to LE staging for 168h while debugging; switch to ZeroSSL via Caddy `acme_ca` global option as workaround |
| `.env` leaked into image | HIGH (security) | Rotate ALL secrets immediately (DB password, BETTER_AUTH_SECRET, MinIO creds, JWT_PLAYBACK_SECRET); rebuild image; force-pull on all consumers; consider image deletion from GHCR |
| GHCR auth expired | LOW | Refresh PAT; `docker login ghcr.io`; retry pull |
| sharp/Prisma binary mismatch | MEDIUM | Add correct `binaryTargets` to schema.prisma; rebuild; consider single-arch only |
| MinIO console exposed publicly | MEDIUM | Strip port mapping; rotate creds; audit access logs for unauthorized writes |
| StreamProcessor undefined cameraId stuck cameras | LOW | Force-fail stuck BullMQ jobs via cleanup script; restart api; (until guard ships, this is recurring) |
| 23 test failures shipped to GA | LOW | Triage + fix or skip-with-issue; lock CI; communicate to team that "23 known failures" is no longer accepted |
| Phase 22→17 metadata gap | LOW | Single PR adds 4 lines to recording detail page loader |
| Caddy data volume gone (rebuilt without volume) | HIGH (1 week) | Wait out LE rate limit OR switch to ZeroSSL; persist volume going forward |
| DNS not propagated | LOW (time-only) | Wait for TTL expiry; verify with multiple resolvers; consider lower TTL on next change |
| MinIO default creds compromise | HIGH | Rotate creds; audit bucket access logs; assume all uploaded avatars/recordings exfiltrated; notify users if sensitive |

---

## Pitfall-to-Phase Mapping

How v1.3 roadmap phases should address each pitfall. Phase names are illustrative — roadmapper will finalize.

| Pitfall | Suggested Phase | Verification |
|---------|------------------|--------------|
| 1. Prisma `db:push` on prod | Migration baseline + `migrate deploy` entrypoint | Prod compose has zero references to `db:push`; CI lint rejects PRs adding it to deploy paths; UAT: fresh DB → `docker compose up -d` → api boots with schema applied |
| 2. Stale Prisma client | Same as 1 + monitoring | Boot-time `EXPECTED_MIGRATION` assertion exists; ArchiveMetricsService alerting wired |
| 3. FFmpeg zombies + signal propagation | Container hardening (Dockerfile + compose) | `init: true` set; UAT: kill api mid-recording → no orphans, no corrupted segments |
| 4. SRS hls_use_fmp4 cold-boot | Pre-v1.3 fix-up phase OR SRS production-readiness | UAT: `docker compose down -v && up -d` → SRS healthy in <30s without manual reload |
| 5. SRS callbacks → host.docker.internal | Compose networking + config templating | UAT: synthetic publish triggers on_publish in api logs |
| 6. Migration race conditions | Compose orchestration | `migrate` service exists; `service_completed_successfully` dependency declared; verified Compose plugin >= 2.20 |
| 7. Caddy data volume | TLS / reverse-proxy phase | Named volume present in prod compose; staging CA used during initial debug |
| 8. `.env` leak | Image build hardening + CI lint | `.dockerignore` exists; `dive` scan shows no `.env` in any layer |
| 9. HLS volume + on_hls path mismatch | Compose volumes + recording pipeline | UAT: end-to-end recording → archive → playback works post-deploy |
| 10. WebSocket / Caddy + same-origin | Reverse-proxy phase | Single hostname; UAT: NotificationBell receives event end-to-end |
| 11. GHCR private pull | CI/CD + deploy runbook | Runbook has `docker login ghcr.io` step; PAT scope documented |
| 12. Multi-arch sharp/Prisma | Image build phase | Decision logged: AMD64-only (or multi-arch); CI runs `node -e "require('sharp')"` post-build |
| 13. MinIO/SRS port leak | Compose hardening | `nmap` scan in deploy verification; ports 9001 + 1985 closed |
| 14. StreamProcessor undefined cameraId | Tech-debt cleanup phase (must ship in v1.3) | Defensive guard merged; vitest unit covers empty-data case; metric `bullmq_jobs_with_empty_cameraId_total` zero |
| 15. ~23 API test failures | Test cleanup phase (parallel with image build) | `pnpm test` exits 0; CI required check enabled |
| 16. Phase 22→17 metadata gap | UI polish (small phase) | Recording detail page renders tags + description |
| 17. HTTP-01 port 80 firewall | Deploy README pre-flight | Runbook includes DNS + port 80 verification step |
| 18. Dev workflow contamination | Deploy folder structure phase (early) | `pnpm dev` smoke test in CI passes; `apps/api/Dockerfile` unchanged for dev |

### Classification Summary (for roadmapper)

**BLOCKERS for v1.3 GA (must fix or ship):**
1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15, 18

**FIXED-BY-TOOL-CHOICE (Caddy + same-origin pattern eliminates):**
10 (with same-origin enforced), most of 17 (Caddy auto-handles HTTP→HTTPS)

**DOCUMENT (operator runbook handles):**
11, 12 (single-arch), 16, 17 (port 80 + DNS), parts of 7 (rate-limit recovery)

### Phases this drives (suggestion to roadmapper)

1. **Tech-debt cleanup** — Pitfalls 14, 15, 16, 4 (could fold 4 here since it's fix-in-source)
2. **Deploy folder structure + dev-workflow guardrails** — Pitfall 18
3. **Multi-stage Dockerfile + image hardening** — Pitfalls 2, 3, 8, 12
4. **Prisma migrate baseline + `migrate deploy` entrypoint + observability** — Pitfalls 1, 2, 6
5. **Compose orchestration + networking + volumes** — Pitfalls 5, 6, 9, 13
6. **Caddy reverse proxy + auto-TLS** — Pitfalls 7, 10, 17
7. **GHCR CI/CD pipeline** — Pitfalls 11, 12 (release tagging)
8. **Deploy runbook + pre-flight checklist + UAT** — Pitfalls 11, 17, "Looks Done But Isn't" checklist as runbook gates

The "decimal-phase gap closure" pattern from v1.2 is likely to recur — flag any phase where an integration gap might surface only at milestone audit.

---

## Sources

- **CLAUDE.md** (this repo) — SRS deep dive (HIGH), Prisma schema change workflow (HIGH), v6 codec limits including hls_use_fmp4 cold-boot bug (HIGH)
- **PROJECT.md** (this repo) — v1.3 milestone goal, carry-over tech debt list (HIGH)
- **RETROSPECTIVE.md** (this repo) — v1.2 lessons, methodology drift, Phase 22→17 gap, hls_use_fmp4 deferral (HIGH)
- **apps/api/package.json** — `db:push` script with `--accept-data-loss` flag (HIGH — direct evidence)
- **apps/api/Dockerfile** — current dev Dockerfile is single-stage, copies all source, runs npm start:dev (HIGH — direct evidence)
- **docker-compose.yml** — current dev compose with exposed MinIO console + SRS admin ports + host.docker.internal callbacks (HIGH — direct evidence)
- **config/srs.conf** — host.docker.internal callbacks confirmed (HIGH — direct evidence)
- **apps/web/next.config.ts** — Socket.IO trailing-slash workaround already in code, references debug/resolved/notifications-srs-log-gateways-reject-browser-cookies.md (HIGH)
- **Project memory: project_streamprocessor_undefined_bug** — open since 2026-04-21, 4 enqueue paths, defensive guard recommended (HIGH)
- **Project memory: project_srs_v6_limits** — SRS v6 has no fMP4 cold-boot support; v7 upgrade path (HIGH)
- **Project memory: feedback_prisma_regenerate** — schema edits require db push + generate + rebuild + restart; stale client = silent archive failures (HIGH)
- [Prisma Migrate deployment docs](https://www.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate) — recommends separate migration job; race conditions explicit (HIGH, official 2026)
- [Prisma in Docker guide](https://www.prisma.io/docs/guides/deployment/docker) — production guidance (HIGH, official)
- [notiz.dev: Prisma Migrate Deploy with Docker](https://notiz.dev/blog/prisma-migrate-deploy-with-docker/) — entrypoint patterns (MEDIUM)
- [Next.js Standalone Dockerfile guide (Vercel)](https://nextjs.org/docs/app/building-your-application/deploying) — public folder + .next/standalone + .next/static copy pattern (HIGH, official)
- [DEV: How to Dockerize a Next.js App (2025)](https://dev.to/flrndml/how-to-dockerize-a-nextjs-app-2025-5dlh) — multi-stage best practices including non-root user (MEDIUM)
- [Caddy reverse_proxy directive docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) — transparent WebSocket support, header behavior (HIGH, official)
- [Caddy quick-start reverse proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy) — automatic HTTPS, persistent /data critical (HIGH, official)
- [GitHub: lucaslorentz/caddy-docker-proxy](https://github.com/lucaslorentz/caddy-docker-proxy) — production Docker patterns including persistent /data warning (MEDIUM)
- [Let's Encrypt rate limits docs](https://letsencrypt.org/docs/rate-limits/) — 50 certs/week, 5 failures/hour (HIGH, official)
- [GitHub Actions GHCR docs](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) — `permissions: packages: write`, `GITHUB_TOKEN` flow (HIGH, official)
- [Docker init flag docs](https://docs.docker.com/reference/compose-file/services/#init) — PID 1 init wrapper (HIGH, official)
- [SRS HTTP callback docs](https://ossrs.net/lts/en-us/docs/v5/doc/http-callback) — on_publish/on_play return code semantics (HIGH, official, referenced in CLAUDE.md)
- [MinIO production deployment notes](https://min.io/docs/minio/linux/operations/install-deploy-manage/deploy-minio-single-node-single-drive.html) — credential rotation, console port (HIGH, official)
- [Compose Spec depends_on conditions](https://github.com/compose-spec/compose-spec/blob/main/spec.md#depends_on) — `service_completed_successfully` requirements (HIGH, official)

---
*Pitfalls research for: SMS Platform v1.3 Production Ready (Docker Compose pull-only deploy with auto-TLS)*
*Researched: 2026-04-27*
