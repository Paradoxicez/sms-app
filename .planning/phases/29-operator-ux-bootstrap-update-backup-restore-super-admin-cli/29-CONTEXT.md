# Phase 29: Operator UX (bootstrap/update/backup/restore + super-admin CLI) - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

ส่งมอบ operator UX ที่ครบจบ: developer ที่ไม่เคยเห็น codebase clone repo (หรือ sparse-checkout `deploy/`) → fill `.env` → run `bootstrap.sh` ครั้งเดียว → ได้ super-admin login URL ภายใน <10 นาที. Day-2 ops (update / backup / restore) เป็น 1-command ทั้งหมด, idempotent, auditable. Phase 26 (compose + sms-migrate init) + Phase 27 (Caddy auto-TLS) + Phase 28 (GHCR images) อยู่ครบแล้ว — Phase 29 wire ทุกอย่างเข้า operator workflow.

**Delivers:**
- `apps/api/src/cli/sms.ts` — Node CLI source (extensible router, สิ่งที่ ship จริงใน v1.3 = `create-admin` subcommand)
- `apps/api/bin/sms` — bash wrapper 5-line (`exec node /app/apps/api/dist/cli/sms.js "$@"`), executable
- `apps/api/Dockerfile` — เพิ่ม 1 บรรทัด `COPY --from=builder --chown=app:app /app/apps/api/bin ./bin` ใน final stage (cross-phase touch ของ Phase 25 product, locked here)
- `deploy/scripts/bootstrap.sh` — first-run orchestrator (auto-secrets → pull → up → wait migrate → create-admin → wait HTTPS → print URL + timing)
- `deploy/scripts/update.sh` — positional `update.sh v1.3.1` (pre-flight migrate test → backup .env → sed IMAGE_TAG → recycle → health verify)
- `deploy/scripts/backup.sh` — offline tar.gz archive (stop api+web → pg_dump + mc mirror + caddy_data tar → bundle → restart api+web)
- `deploy/scripts/restore.sh` — integrity verify → confirm/--yes → compose down -v → extract → up -d
- `deploy/README.md` — overwrite Phase 24 stub: 5-step quickstart proving <10-min cold deploy
- `deploy/BACKUP-RESTORE.md` — operator runbook สำหรับ backup/restore (Phase 24 README ระบุไว้ใน L9 อย่างชัดเจน)
- `deploy/TROUBLESHOOTING.md` — common-failure runbook (ACME pending, migrate failures, port conflicts)

**Out of scope (belongs to other phases or future milestones):**
- `bin/sms doctor` pre-flight env validation — DEPLOY-29 deferred v1.4 (extensible router รองรับ)
- `bin/sms reset-password` / `bin/sms version` / `bin/sms verify-backup` — defer v1.4 (extensible router)
- Smoke test on clean DigitalOcean/Hetzner VM (real provision + nmap port lockdown) — Phase 30 territory (DEPLOY-25, DEPLOY-26)
- Watchtower auto-update agent — anti-feature in v1.3 per research SUMMARY locked decisions
- Cosign keyless image signing — DEPLOY-27 defer v1.4
- SBOM generation — DEPLOY-28 defer v1.4
- Backup encryption / GPG sign — defer (operator responsibility, store archive offsite encrypted)
- PG WAL streaming / PITR — defer v1.4+ (offline pg_dump sufficient for v1.3)
- MinIO bucket versioning — defer v1.4 (mc mirror simple snapshot enough)
- Cron auto-schedule for backup.sh — operator concern (host crontab), defer
- update.sh --rollback flag — defer (manual sed of `.env.backup-<ts>` works for now)
- DOMAIN-SETUP.md content extension — Phase 27 ownership (link only, no rewrite)
- ARM64 multi-arch ops — DEPLOY-32 defer v1.4

</domain>

<decisions>
## Implementation Decisions

### bin/sms CLI architecture (DEPLOY-17)

- **D-01:** **Node script + bash wrapper** = canonical CLI delivery. Source: `apps/api/src/cli/sms.ts` (single TS file, ~150-200 LOC for v1.3 scope) compiles via existing SWC builder stage to `apps/api/dist/cli/sms.js`. Wrapper: `apps/api/bin/sms` = bash script (executable, +x in source tree):
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  exec node /app/apps/api/dist/cli/sms.js "$@"
  ```
  เหตุผล: light (no nest-commander/DI overhead, ~0ms boot vs ~1-2s for Nest factory), reuse PrismaClient + `better-auth/crypto` หลักการเดียวกับ `apps/api/src/scripts/seed-stream-profile.ts` + `apps/api/src/prisma/seed.ts` ที่ proven แล้ว. ขยาย subcommand อนาคต = แค่เพิ่ม case ใน switch — ไม่ต้อง refactor.

- **D-02:** **Ship via `COPY apps/api/bin` in Dockerfile final stage**. Phase 25 final stage WORKDIR = `/app/apps/api`. ROADMAP SC #1 เขียน `docker compose exec api bin/sms create-admin` (relative path) → resolve เป็น `/app/apps/api/bin/sms`. Phase 29 patch Phase 25 Dockerfile เพิ่ม 1 บรรทัด หลัง `COPY apps/api/dist`:
  ```dockerfile
  COPY --from=builder --chown=app:app /app/apps/api/bin ./apps/api/bin
  ```
  Dockerfile builder stage ไม่ต้องเปลี่ยน (apps/api/bin/sms เข้า COPY . . ของ builder อยู่แล้ว เพราะ source tree mount ผ่าน workspace). chmod +x ใน source tree (`git update-index --chmod=+x apps/api/bin/sms`) → preserved across COPY. Cross-phase touch = locked decision in Phase 29; ห้าม refactor Phase 25 Dockerfile โดยไม่ปรึกษา Phase 29 owner.

  **Correction during planning (Phase 29 revision):** WORKDIR at the insertion line is `/app` (apps/api/Dockerfile L94), so the destination is `./apps/api/bin` to match the existing COPY pattern at L102 (`./apps/api/dist`). The relative `bin/sms` invocation (ROADMAP SC #1) still works because L107 sets WORKDIR=`/app/apps/api`, making `/app/apps/api/bin/sms` resolve as `bin/sms` from the runtime CWD.

- **D-03:** **Subcommand scope = `create-admin` only** ใน v1.3. Router pattern (switch ใน src/cli/sms.ts):
  ```ts
  const [, , subcmd, ...rest] = process.argv;
  switch (subcmd) {
    case 'create-admin': await createAdmin(rest); break;
    default: printUsage(); process.exit(1);
  }
  ```
  อนาคต (v1.4) เพิ่ม `case 'doctor':` / `case 'reset-password':` / `case 'verify-backup':` ได้โดยไม่ refactor router. ROADMAP SC #1 ระบุเฉพาะ create-admin — ไม่ขยาย scope.

- **D-04:** **Idempotency = error + `--force` flag**. ถ้า user (matched by email) มีอยู่:
  - Default behavior: exit 1 + stderr `Error: User <email> already exists. Use --force to update password.`
  - `--force` present: update password (re-hash via `better-auth/crypto`), keep existing user.id / org membership / role; log `Updated password for <email>.`
  - ป้องกัน accidental clobber, รองรับ password rotation, auditable per ROADMAP SC #1.

- **D-05:** **Better Auth scrypt (NOT bcrypt)** — ROADMAP เขียน "bcrypt-hashed password" แต่ codebase implementation จริงใช้ Better Auth scrypt ผ่าน `better-auth/crypto` (`apps/api/src/prisma/seed.ts:23-26` + `apps/api/src/auth/`). create-admin จะใช้ scrypt ตรงตาม code-as-truth — ROADMAP language imprecise. Future doc update ของ ROADMAP จะแก้ ("scrypt-hashed" or "Better Auth-hashed") เมื่อ touch artifact นั้น.

- **D-06:** **Reuse seed.ts pattern**: super-admin upsert flow
  1. Upsert `Organization` (id=`system-org-id`, slug=`system`, metadata.isSystem=true)
  2. Upsert `User` (email, role=`admin`, emailVerified=true)
  3. Upsert `Account` (providerId=`credential`, password=scrypt-hash) — โดน RLS bypass ผ่าน `datasourceUrl: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL` (sms superuser DSN ที่ rolbypassrls=true) เพราะ Member/Account อยู่ใต้ FORCE ROW LEVEL SECURITY
  4. Upsert `Member` (organizationId=systemOrg.id, userId, role=`admin`)
  5. **ไม่สร้าง Developer Package** ใน production — seed.ts สร้างเฉพาะ dev. Phase 29 create-admin ละ step นี้ (org ไม่ต้องมี packageId เพื่อ login). Operator ตั้ง package ภายหลังผ่าน admin UI.

### Bootstrap.sh contract (DEPLOY-18)

- **D-07:** **Pre-flight = minimal 3 checks**:
  1. `docker info >/dev/null 2>&1` → fail message: "Docker daemon not running. Start Docker first."
  2. `[[ -f deploy/.env ]]` → fail message: "deploy/.env missing. Run: cp deploy/.env.production.example deploy/.env, edit, then re-run bootstrap.sh."
  3. `grep -E '^DOMAIN=.+' deploy/.env >/dev/null` → fail message: "DOMAIN= not set in deploy/.env. Edit it then re-run bootstrap.sh."
  
  ครอบคลุม 90% ของ misconfig common case. <10s. ไม่ check DNS/ports/disk (ลด false-positive จาก NAT/CDN/distro variance).

- **D-08:** **Auto-call init-secrets.sh on placeholder detection**. bootstrap.sh:
  ```bash
  if grep -qE '^[A-Z_]+=change-me-' deploy/.env || grep -qE '^[A-Z_]+=$' deploy/.env; then
    echo "[bootstrap] Generating secrets via init-secrets.sh..."
    bash deploy/scripts/init-secrets.sh
  fi
  ```
  Phase 26 D-14/D-15 init-secrets.sh idempotent (skip filled, fill empty/placeholder, chmod 600) — bootstrap call ครั้งเดียว, สอดคล้อง ROADMAP SC #2 "a single bootstrap.sh".

- **D-09:** **Auto-create super-admin from `ADMIN_EMAIL` + `ADMIN_PASSWORD` env after sms-migrate exit**:
  ```bash
  source deploy/.env
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --wait sms-migrate
  # sms-migrate exits successfully (DEPLOY-14 fail-fast model — Phase 26 D-03)
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api bin/sms create-admin \
    --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" || \
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api bin/sms create-admin \
    --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" --force
  ```
  - `up -d --wait sms-migrate` blocks until init container exits 0 (Phase 26 depends_on chain handles). Failure → migrate error printed, bootstrap exit 1 ทันที.
  - First run: create-admin sets up super-admin → exit 0
  - Re-run on same .env: D-04 default-error first, then `--force` overwrites password → idempotent re-run safe (rotates password if .env changed)
  - Operator มี ADMIN_PASSWORD ใน .env (Phase 26 D-25 declared) → ไม่ต้อง interactive prompt → automation-friendly

- **D-10:** **Wait HTTPS reachable (poll curl 5s/120s) before printing final URL**:
  ```bash
  echo "[bootstrap] Waiting for HTTPS endpoint (Caddy provisioning Let's Encrypt cert, ~30-60s)..."
  for i in $(seq 1 24); do
    if curl -fsS -o /dev/null --max-time 5 "https://${DOMAIN}/api/health" 2>/dev/null; then
      echo "[bootstrap] HTTPS ready."
      break
    fi
    sleep 5
  done
  if ! curl -fsS -o /dev/null --max-time 5 "https://${DOMAIN}/api/health" 2>/dev/null; then
    echo "[bootstrap] WARNING: HTTPS not reachable after 120s. Caddy may still be issuing cert."
    echo "[bootstrap] Check: docker compose -f deploy/docker-compose.yml logs caddy"
    echo "[bootstrap] DNS A-record correct? Port 80 reachable from Internet?"
  fi
  ```
  ลด confused-operator path เมื่อ visit URL ก่อน cert ออก. ROADMAP SC #2 "<10-minute claim" ตรงจุดนี้ — operator เห็น URL พร้อม login.

- **D-11:** **Idempotent re-run safety**: bootstrap.sh ปลอดภัยรัน N รอบเสมอ:
  - init-secrets.sh: skip filled (Phase 26 D-14)
  - compose pull: re-fetch image (idempotent docker layer cache)
  - compose up -d --wait sms-migrate: prisma migrate deploy idempotent (no-op if applied — Pitfall 6 mitigation)
  - create-admin: error → --force → idempotent
  - HTTPS poll: stateless probe
  
  Operator เจอ partial-failure (e.g., manual Ctrl-C ระหว่าง compose up) → re-run bootstrap.sh = no harm.

- **D-12:** **Print elapsed timing at end** (DEPLOY-23 SC #5 timing log):
  ```bash
  START=$(date +%s)
  # ... bootstrap steps ...
  ELAPSED=$(( $(date +%s) - START ))
  echo "[bootstrap] ✓ Stack live at https://${DOMAIN}"
  echo "[bootstrap]   Login: $ADMIN_EMAIL"
  echo "[bootstrap]   Bootstrap completed in ${ELAPSED}s"
  ```
  Phase 30 smoke test consume timing log ผ่าน `bootstrap.sh > deploy/SMOKE-TEST-LOG.md` redirect (or append).

### Update.sh recycle strategy (DEPLOY-19)

- **D-13:** **Positional argument: `update.sh v1.3.1`**. Validate via regex `^v[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9]+(\.[a-z0-9]+)*)?$|^latest$`. Missing arg → exit 1 + usage. ตรง ROADMAP SC #3 spec literal. Semver pattern lock อิง Phase 28 D-04 (`vX.Y.Z` + `vX.Y` + `latest` + `sha-<7>`); update.sh accept `vX.Y.Z` + prerelease (e.g., `v1.3.1-rc1`) + `latest`. ไม่รองรับ `vX.Y` (2-part) or `sha-<7>` ใน update.sh (encourage explicit semver).

- **D-14:** **Backup `.env` then sed in-place IMAGE_TAG**:
  ```bash
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  cp deploy/.env deploy/.env.backup-${TS}
  sed -i.tmp "s|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|" deploy/.env && rm deploy/.env.tmp
  echo "[update] IMAGE_TAG → ${TAG} (backup: deploy/.env.backup-${TS})"
  ```
  - Backup naming `.env.backup-<UTC-timestamp>` → multiple updates สะสม backups
  - sed `-i.tmp` portable across BSD/GNU sed (macOS dev + Ubuntu prod)
  - Persistent: server reboot → docker daemon restart → compose ใช้ tag จาก .env (รักษาตัว) — ตรงข้ามกับ env-override approach
  - Manual rollback: `cp deploy/.env.backup-<ts> deploy/.env && bash deploy/scripts/update.sh <old-tag>` (1-step revert)

- **D-15:** **Pre-flight migrate test BEFORE recycling stack** (atomic guard):
  ```bash
  # Step 1: pull new images
  IMAGE_TAG=${TAG} docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
  
  # Step 2: pre-flight migrate test (override env, .env unchanged)
  echo "[update] Pre-flight migrate test on image ${TAG}..."
  if ! IMAGE_TAG=${TAG} docker compose -f deploy/docker-compose.yml --env-file deploy/.env run --rm sms-migrate; then
    echo "[update] ✗ Migrate failed on image ${TAG}. Stack unchanged. Exiting."
    exit 1
  fi
  
  # Step 3: persist tag + recycle (only if migrate succeeded)
  cp deploy/.env deploy/.env.backup-${TS}
  sed -i.tmp "s|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|" deploy/.env && rm deploy/.env.tmp
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
  ```
  Atomic: migrate fails → .env untouched, services run old image, exit 1, operator triages. Migrate passes → atomic switch via sed + compose up -d. Phase 26 depends_on chain (postgres → redis → minio → sms-migrate completed → api → web → caddy) ensures recycle order ตาม ROADMAP SC #3 อัตโนมัติ — ไม่ต้อง manual per-service restart.

- **D-16:** **Health verify post-recycle (poll Caddy /api/health 5s/120s)**:
  ```bash
  echo "[update] Recycling stack on ${TAG}, waiting health..."
  for i in $(seq 1 24); do
    if curl -fsS -o /dev/null --max-time 5 "https://${DOMAIN}/api/health" 2>/dev/null; then
      echo "[update] ✓ Update complete: ${TAG} live."
      exit 0
    fi
    sleep 5
  done
  echo "[update] ✗ Services unhealthy after 120s. Check: docker compose logs"
  exit 1
  ```
  Ground-truth probe = Caddy reverse-proxy → api `/api/health` → ground-truth สำหรับ user-facing surface. ตอบ ROADMAP SC #3 "without dropping in-flight requests" — Caddy stays up ตลอด recycle (depends_on chain), api restart มี grace period 30s (Phase 26 D-19) — operator validation ผ่าน HTTP แทน internal compose ps.

### Backup.sh archive design (DEPLOY-20)

- **D-17:** **Format = tar.gz, naming = `sms-backup-$(date -u +%Y-%m-%dT%H%MZ).tar.gz`** (ROADMAP SC #4 example match), output path = `${BACKUP_DIR:-./backups}/`:
  ```bash
  TS=$(date -u +%Y-%m-%dT%H%MZ)
  ARCHIVE_DIR="${BACKUP_DIR:-./backups}"
  ARCHIVE="${ARCHIVE_DIR}/sms-backup-${TS}.tar.gz"
  mkdir -p "${ARCHIVE_DIR}"
  ```
  - tar.gz universal (apt install ไม่ต้อง — gzip ทุก distro มี)
  - Naming match ROADMAP SC #4 verbatim (`2026-04-27T1200`)
  - `BACKUP_DIR` env override สำหรับ operator ที่ต้องการ external mount (`BACKUP_DIR=/mnt/backups bash deploy/scripts/backup.sh`)

- **D-18:** **Offline backup**: stop api+web, keep postgres+minio+caddy running:
  ```bash
  echo "[backup] Stopping api + web for atomic snapshot..."
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env stop api web
  
  # Step 1: pg_dump
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/postgres.dump
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T postgres \
    cat /tmp/postgres.dump > "${TMP}/postgres.dump"
  
  # Step 2: MinIO mirror (avatars + recordings + snapshots)
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T minio \
    mc mirror local/avatars /tmp/backup/avatars
  # ... (recordings, snapshots)
  docker cp ...:/tmp/backup "${TMP}/minio"
  
  # Step 3: caddy_data tar
  docker run --rm -v sms-app_caddy_data:/data alpine tar czf - /data > "${TMP}/caddy_data.tar.gz"
  
  # Step 4: bundle
  tar czf "${ARCHIVE}" -C "${TMP}" postgres.dump minio caddy_data.tar.gz
  
  # Step 5: restart api + web
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env start api web
  ```
  ~30-90s downtime (size-dependent). DB rows + MinIO objects atomic ต่อกัน (api stopped = ไม่มี new uploads). ตรง ROADMAP SC #5 byte-equivalent guarantee.

- **D-19:** **Archive contents = postgres + minio + caddy_data; EXCLUDE .env + redis_data + hls_data**:
  | Component | Include? | Reason |
  |-----------|----------|--------|
  | postgres pg_dump (custom -Fc) | ✓ | Required SC #4. -Fc format = parallel restore + selective table restore + smaller |
  | MinIO buckets (avatars/recordings/snapshots) | ✓ | Required SC #4 |
  | caddy_data (cert + ACME state) | ✓ | Required SC #4. Re-issue cert บน restore = LE rate limit risk (5 fail/host/hr) |
  | redis_data | ✗ | Transient: sessions (users re-login), BullMQ jobs (replay on api boot — Phase 15 resilience). Loss acceptable |
  | hls_data | ✗ | Live segments self-delete via `hls_dispose 30s` (Phase 26 srs.conf) |
  | `.env` | ✗ | **Security**: secrets in plaintext. Archive อาจถูก git checkin / email / S3 leak. operator เก็บ .env แยกใน password manager + offsite encrypted |
  | docker-compose.yml + Caddyfile | ✗ | Source-controlled (deploy/ folder). Operator คาดหวังว่า cd deploy/ + git pull ก่อน restore |

- **D-20:** **pg_dump format = custom (`-Fc`)**. Pro: smaller file size (~30-50% vs plain), parallel restore (`pg_restore -j 4`), selective table restore. Con: ไม่ใช่ human-readable (ต้อง pg_restore เพื่อ inspect). v1.3 backup = machine-readable bundle ไม่ใช่ docs — custom เหมาะสม.

### Restore.sh safety contract (DEPLOY-21)

- **D-21:** **Integrity verify FIRST (before destroying state)**:
  ```bash
  ARCHIVE="$1"
  [[ -f "$ARCHIVE" ]] || { echo "Archive not found: $ARCHIVE"; exit 1; }
  
  # Verify structure (3 required entries)
  echo "[restore] Verifying archive structure..."
  CONTENT=$(tar -tzf "$ARCHIVE" 2>/dev/null) || { echo "Corrupt or non-tar.gz archive"; exit 1; }
  for required in postgres.dump minio caddy_data.tar.gz; do
    grep -q "^${required}" <<<"$CONTENT" || { echo "Missing: $required"; exit 1; }
  done
  ```
  Corrupted archive → exit 1 ก่อน touch volumes. ป้องกัน "destroy good state, archive unreadable, unrecoverable" path.

- **D-22:** **Confirmation prompt + `--yes` flag**:
  ```bash
  if [[ "${2:-}" != "--yes" ]]; then
    echo "[restore] WARNING: This DESTROYS all current data (postgres, MinIO, caddy)."
    echo "[restore] Archive: $ARCHIVE"
    read -p "Continue? [y/N]: " confirm
    [[ "${confirm,,}" == "y" || "${confirm,,}" == "yes" ]] || { echo "Aborted."; exit 0; }
  fi
  ```
  Interactive default safe. `--yes` flag สำหรับ disaster-recovery automation (`restore.sh archive.tar.gz --yes` ใน DR runbook).

- **D-23:** **Volume wipe via `compose down -v` + recreate**:
  ```bash
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env down -v   # drops named volumes
  TMP=$(mktemp -d)
  tar xzf "$ARCHIVE" -C "$TMP"
  
  # Boot postgres + minio fresh
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d postgres minio
  
  # Wait postgres healthy
  for i in $(seq 1 12); do
    docker compose ... exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" && break
    sleep 5
  done
  
  # Restore postgres
  docker compose ... exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists < "$TMP/postgres.dump"
  
  # Restore MinIO (mc mirror reverse direction)
  # ... mc mirror "$TMP/minio/avatars" local/avatars  (after boot + bucket creation by sms-migrate is unnecessary — restore handles)
  
  # Restore caddy_data
  docker run --rm -v sms-app_caddy_data:/data -v "$TMP":/backup alpine tar xzf /backup/caddy_data.tar.gz -C /data --strip-components=1
  
  # Final boot
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
  ```
  ตรง ROADMAP SC #4 "rebuilds all volumes". `--clean --if-exists` ทำ pg_restore idempotent (drop+recreate objects). **ไม่** run sms-migrate หลัง restore — pg_dump ของเราจับ `_prisma_migrations` table แล้ว → schema state ตรง backup time. หาก image ใหม่กว่า migrate จะ apply เพิ่มใน next compose up (idempotent).

- **D-24:** **Schema-version compat check = NOT enforced** (warn-only optional). Phase 23 D-05 prisma migrate deploy idempotent — image ใหม่กว่า archive → migrate apply ส่วนใหม่ได้. image เก่ากว่า archive → migrate `up to date` (no-op). ทั้งสองทิศทาง safe-by-design. ฉะนั้น restore.sh **ไม่** parse `_prisma_migrations` to refuse cross-version (ลด complexity, ลด false-block).

### Quickstart README narrative (DEPLOY-23)

- **D-25:** **5-step quickstart, overwrite Phase 24 stub**:
  1. **Clone** — `git clone <repo-url> sms-app && cd sms-app` (or sparse-checkout `deploy/` for production-only deploys: `git clone --filter=blob:none --no-checkout <repo>` + `git sparse-checkout set deploy` + `git checkout`)
  2. **Configure secrets + identity** — `cp deploy/.env.production.example deploy/.env`, edit `deploy/.env`: set `DOMAIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ACME_EMAIL`, `GHCR_ORG`. (init-secrets.sh จะ generate `change-me-*` ให้อัตโนมัติใน step 4)
  3. **Configure DNS** — Add A-record: `${DOMAIN}` → server public IP. Verify: `dig +short A ${DOMAIN}`. (link to `deploy/DOMAIN-SETUP.md` for provider-specific walkthrough)
  4. **Bootstrap** — `bash deploy/scripts/bootstrap.sh`. Auto-generates secrets, pulls images, runs migrate, seeds defaults, creates super-admin, waits HTTPS. <10 min wall-clock.
  5. **Login** — Visit `https://${DOMAIN}` and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

  Day-2 ops (collapsed under "Operations" section):
  - Update: `bash deploy/scripts/update.sh v1.3.1`
  - Backup: `bash deploy/scripts/backup.sh` → `./backups/sms-backup-<UTC>.tar.gz`
  - Restore: `bash deploy/scripts/restore.sh ./backups/sms-backup-<UTC>.tar.gz`

- **D-26:** **Timing claim proof method = self-reported by bootstrap.sh** (D-12) appended to `deploy/SMOKE-TEST-LOG.md` ใน Phase 30. README ระบุ "<10 minutes typical" + link to Phase 30 smoke log. ไม่ต้อง record video walkthrough (research note ให้ option แต่ overhead).

### BACKUP-RESTORE.md + TROUBLESHOOTING.md scope

- **D-27:** **`deploy/BACKUP-RESTORE.md`** ship in Phase 29 (Phase 24 deploy/README.md L9 listed it explicitly):
  - Cron auto-schedule example (`0 2 * * * cd /opt/sms-app && bash deploy/scripts/backup.sh`)
  - Offsite copy pattern (`rclone copy ./backups/ remote:sms-backups`)
  - Disaster recovery walkthrough (fresh VM → restore.sh → verify)
  - Backup retention recommendations (keep 7 daily + 4 weekly + 3 monthly minimum)
  - Restore RTO target (~5-15 min depending on archive size)

- **D-28:** **`deploy/TROUBLESHOOTING.md`** ship in Phase 29:
  - "Caddy still issuing cert" — ACME logs, DNS check, port 80 reachability, staging-CA toggle (Phase 27 D-09)
  - "sms-migrate exited 1" — schema drift, _prisma_migrations table inspection
  - "create-admin error: User exists" — --force flag usage
  - "compose pull denied" — `GHCR_ORG` mismatch with `${{ github.repository_owner }}` (Phase 28 D-04)
  - "Backup fails on disk full" — BACKUP_DIR override + free space check
  - "Restore fails on volume in use" — compose down -v requirement
  - Symptom → diagnosis → fix table format (operator skim-friendly)

### Bash script conventions (Claude's discretion)

- **D-29:** **Bash script standards** ที่ใช้ทั้ง 4 deploy scripts:
  - Shebang: `#!/usr/bin/env bash` (portable)
  - First lines: `set -euo pipefail` + `IFS=$'\n\t'`
  - Color output: TTY-aware (use `tput colors` ถ้า ≥8 → bold/red/green for warnings/errors/success; otherwise plain text — CI safety)
  - Logging: stderr only (no log file); operator pipes to file ถ้าต้องการ audit (`bash bootstrap.sh 2>&1 | tee bootstrap.log`)
  - Exit codes: 0 success, 1 generic failure, 2 misuse (unknown subcommand/flag)
  - All paths absolute or `realpath -m` resolved at script entry

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap (locked decisions)
- `.planning/ROADMAP.md` §Phase 29 (lines 177-188) — Goal + 5 Success Criteria
- `.planning/REQUIREMENTS.md` §DEPLOY-17 (line 46) — bin/sms create-admin spec (note: ROADMAP says bcrypt, code uses scrypt — D-05 disambiguation)
- `.planning/REQUIREMENTS.md` §DEPLOY-18 (line 50) — bootstrap.sh validates env, pulls, migrates, seeds, prints URL
- `.planning/REQUIREMENTS.md` §DEPLOY-19 (line 51) — update.sh pulls + migrate + recycle in dependency order
- `.planning/REQUIREMENTS.md` §DEPLOY-20 (line 52) — backup.sh: pg_dump + MinIO mirror + caddy_data tar
- `.planning/REQUIREMENTS.md` §DEPLOY-21 (line 53) — restore.sh idempotent overwrite from archive
- `.planning/REQUIREMENTS.md` §DEPLOY-23 (line 58) — README 5-step quickstart proving <10-min cold deploy
- `.planning/REQUIREMENTS.md` §DEPLOY-29 (research/FEATURES.md line 397) — bin/sms doctor **deferred v1.4**
- `.planning/REQUIREMENTS.md` §DEPLOY-31 (research/FEATURES.md line 398) — Watchtower **anti-feature in v1.3**
- `.planning/REQUIREMENTS.md` §DEPLOY-32 (research/FEATURES.md line 400) — bin/sms verify-backup **deferred v1.4**

### Research artifacts
- `.planning/research/ARCHITECTURE.md` §"Auto-generation on first run" lines 659-670 — bootstrap.sh 8-step recipe (matched in D-07..D-12)
- `.planning/research/ARCHITECTURE.md` §"Build Order Phase 5: OPERATOR EXPERIENCE" lines 770-775 — operator scripts manifest
- `.planning/research/ARCHITECTURE.md` §"Pattern 2: One-shot init service for migrations" lines 807-817 — migrate semantics (Phase 26 D-01..D-04 lock)
- `.planning/research/PITFALLS.md` §Pitfall 6 lines 150-180 — migration container race conditions (D-15 atomic guard mitigates)
- `.planning/research/PITFALLS.md` §"Recovery Strategies" lines 738-752 — backup tested + rollback documented checklist
- `.planning/research/FEATURES.md` lines 82-83, 159-171, 217-218, 262-277, 350-400 — bin/sms operator CLI scope, backup tooling reference, anti-features reasoning
- `.planning/research/SUMMARY.md` §"Locked Decisions" — operator UX MUST be CLI-first (no web first-run wizard)

### Phase 26 hand-off (compose + sms-migrate consumed by bootstrap/update/backup/restore)
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-01..D-04 — sms-migrate init pipeline (3-step: prisma migrate deploy → init-buckets → seed-stream-profile)
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-08 — 5 named volumes list (postgres_data, redis_data, minio_data, caddy_data, hls_data) — backup.sh selects 3
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-14, D-15 — init-secrets.sh idempotent + base64 + chmod 600
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-21 — depends_on chain (postgres → redis → minio → sms-migrate completed → api → web → caddy) — update.sh recycle order via D-15 inherit
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-25 — .env.production.example structure (ADMIN_EMAIL, ADMIN_PASSWORD declared but unconsumed pre-Phase-29)
- `deploy/docker-compose.yml` — 7 services, depends_on chain, image refs (`${GHCR_ORG}/sms-{api,web}:${IMAGE_TAG}`), volumes
- `deploy/.env.production.example` — env var template (Section 1 required, Section 2 image refs, Section 3 defaults)
- `deploy/scripts/init-secrets.sh` — Phase 26 idempotent generator that bootstrap.sh calls (D-08)

### Phase 27 hand-off (Caddy auto-TLS — bootstrap.sh waits for HTTPS reachable)
- `.planning/phases/27-caddy-reverse-proxy-auto-tls/27-CONTEXT.md` §D-08, D-09 — Caddy auto-HTTPS + ACME staging toggle (`ACME_CA` env)
- `.planning/phases/27-caddy-reverse-proxy-auto-tls/27-CONTEXT.md` §D-13 — caddy_data volume contents (cert + ACME account state — backup.sh captures)
- `deploy/Caddyfile` — handle blocks (api/socket.io/avatars/snapshots/web)
- `deploy/DOMAIN-SETUP.md` — DNS A-record + port 80 + propagation walkthrough (README D-25 step 3 links here)

### Phase 28 hand-off (image tag pattern — update.sh argument)
- `.planning/phases/28-github-actions-ci-cd-ghcr/28-CONTEXT.md` §D-04..D-06 — image tag pattern (`vX.Y.Z` + `vX.Y` + `latest` + `sha-<7>` + prerelease policy)
- `.planning/phases/28-github-actions-ci-cd-ghcr/28-CONTEXT.md` §D-09 — attest-build-provenance v2 (operator can verify via `gh attestation verify`)
- `.github/workflows/build-images.yml` — image artifact source for `compose pull`
- `.github/workflows/release.yml` — GitHub Release auto-generated notes that operator references for upgrade decisions

### Phase 23 hand-off (prisma migrate deploy + Better Auth crypto)
- `.planning/phases/23-tech-debt-cleanup-phase-0-prerequisites/23-CONTEXT.md` §D-05 — prisma migrate deploy idempotent (D-15 + D-24 inherit)
- `apps/api/src/prisma/seed.ts` — super-admin upsert pattern (D-06 reuse) + datasourceUrl pattern (RLS bypass via DATABASE_URL_MIGRATE)
- `apps/api/src/prisma/schema.prisma` — Organization, User, Account, Member models that create-admin upserts

### Phase 25 hand-off (Dockerfile cross-touch)
- `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md` — Phase 25 Dockerfile structure (4 stages, WORKDIR /app/apps/api final)
- `apps/api/Dockerfile` lines 99-117 — final stage COPY targets (Phase 29 inserts `COPY apps/api/bin ./bin` after dist COPY at L102)
- `apps/api/Dockerfile.dev` — dev image (NOT touched by Phase 29 — read-only reference per CLAUDE.md Deploy Folder Convention)

### Phase 24 hand-off (deploy/ folder convention)
- `CLAUDE.md` §"Deploy Folder Convention" — locked rules ห้าม dev tooling ใน deploy/, scripts ต้องเป็น bash/POSIX, ห้าม package.json
- `.planning/phases/24-deploy-folder-structure-dev-workflow-guardrails/24-CONTEXT.md` — deploy/ skeleton, .dockerignore baseline
- `deploy/README.md` (current Phase 24 stub) — Phase 29 D-25 overwrites entirely

### Better Auth + crypto pattern
- `apps/api/src/auth/` — Better Auth integration (admin role detection, session validation)
- `apps/api/node_modules/better-auth/crypto` — `hashPassword(password)` scrypt-based hashing (D-05 disambiguation vs ROADMAP "bcrypt")

### Existing scripts pattern reference
- `apps/api/src/scripts/seed-stream-profile.ts` — Phase 26 pattern: standalone Node script, PrismaClient, exit code, logged steps
- `apps/api/src/scripts/init-buckets.ts` — Phase 26 pattern: idempotent MinIO bucket creation
- `deploy/scripts/init-secrets.sh` — Phase 26 pattern: idempotent secret generator, sed-based, chmod 600
- `deploy/scripts/verify-phase-27.sh` — Phase 27 verification reference (NOT a Phase 29 deliverable; pre-existing tooling)

### External tooling docs (operator must understand)
- [pg_dump custom format `-Fc`](https://www.postgresql.org/docs/16/app-pgdump.html#PG-DUMP-OPT-FORMAT) — D-20 backup format choice
- [pg_restore `--clean --if-exists`](https://www.postgresql.org/docs/16/app-pgrestore.html) — D-23 idempotent restore
- [MinIO mc mirror](https://min.io/docs/minio/linux/reference/minio-mc/mc-mirror.html) — backup + restore bucket sync
- [Better Auth — credential providers](https://www.better-auth.com/docs/concepts/database) — Account.password storage convention
- [docker compose run --rm](https://docs.docker.com/reference/cli/docker/compose/run/) — D-15 pre-flight migrate test pattern
- [docker compose down -v](https://docs.docker.com/reference/cli/docker/compose/down/) — D-23 volume wipe semantics

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`apps/api/src/prisma/seed.ts`** — super-admin creation pattern complete: Organization upsert (id=`system-org-id`, slug=`system`, metadata.isSystem=true) → User upsert (role=`admin`) → Account upsert (providerId=`credential`, password via `better-auth/crypto` hashPassword) → Member upsert (role=`admin`). create-admin reuses 4 of 5 steps (skip Developer Package — dev-only).
- **`apps/api/src/scripts/seed-stream-profile.ts`** + **`apps/api/src/scripts/init-buckets.ts`** — Phase 26 standalone Node scripts. Same shape as create-admin: PrismaClient, exit code, console.log steps. SWC compiles all `apps/api/src/scripts/*.ts` and `apps/api/src/cli/*.ts` to `apps/api/dist/{scripts,cli}/*.js`.
- **`deploy/scripts/init-secrets.sh`** — Phase 26 idempotent secret generator. bootstrap.sh calls it (D-08). Pattern reusable for `.env.backup-<ts>` + sed in-place semantics in update.sh (D-14).
- **`deploy/scripts/verify-phase-27.sh`** — Phase 27 verification shell-script reference (set -euo pipefail, color output, exit codes, healthcheck pattern). Phase 29 4 deploy scripts inherit conventions (D-29).
- **Phase 26 sms-migrate init container** — bootstrap.sh waits via `compose up -d --wait sms-migrate` (no manual block-loop needed). update.sh pre-flight migrate test via `compose run --rm sms-migrate` (D-15).
- **Phase 26 depends_on chain** — update.sh `compose up -d` triggers correct recycle order naturally (postgres → redis → minio → sms-migrate completed → api → web → caddy). No manual per-service restarts needed.
- **`apps/api/Dockerfile` final stage** — WORKDIR `/app/apps/api`, USER `app` (non-root). Phase 29 patches single line `COPY --from=builder --chown=app:app /app/apps/api/bin ./bin` after L102 (after dist COPY). chmod +x preserved through git update-index.
- **DATABASE_URL_MIGRATE pattern** — seed.ts uses `datasourceUrl: process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL` to bypass RLS on Member/Account inserts (these tables FORCE ROW LEVEL SECURITY). create-admin must do the same (D-06).

### Established Patterns

- **Idempotent operator tooling** — All Phase 26-29 deploy scripts must be safe to re-run. Phase 26 init-secrets.sh (skip filled), Phase 26 sms-migrate (prisma migrate deploy idempotent), Phase 29 bootstrap.sh (D-11 documented re-run safety), Phase 29 update.sh (atomic guard via D-15), Phase 29 backup.sh (timestamped output, no overwrite), Phase 29 restore.sh (integrity verify before destroy + confirm).
- **`set -euo pipefail` + IFS** — All deploy/scripts/*.sh follow this convention (D-29).
- **`docker compose -f deploy/docker-compose.yml --env-file deploy/.env`** — verbose form everywhere (operator may run from any cwd; relative path safety).
- **Phase 23 prisma migrate deploy** — production-only, idempotent, exits non-zero on conflict (D-15 atomic guard, D-24 cross-version safe).
- **Phase 26 D-25 .env structure** — Section 1 (required-no-default: DOMAIN, DB_PASSWORD, NEXTAUTH_SECRET, BETTER_AUTH_SECRET, MINIO_ROOT_PASSWORD, JWT_PLAYBACK_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, ACME_EMAIL, MINIO_PUBLIC_URL); Section 2 (image refs: GHCR_ORG, IMAGE_TAG); Section 3 (defaults: POSTGRES_USER, POSTGRES_DB, MINIO_ROOT_USER, REDIS_PASSWORD, ACME_CA); Section 4 (computed). Phase 29 doesn't add new vars — consumes existing.
- **Better Auth scrypt via `better-auth/crypto`** — NOT bcrypt. import dynamic: `const { hashPassword } = await import('better-auth/crypto')`. Future password rotation in --force path uses same import.

### Integration Points

- **bootstrap.sh → init-secrets.sh** — D-08 chain. init-secrets idempotent guarantees safe re-call.
- **bootstrap.sh → bin/sms create-admin** — D-09 chain. Reads .env via `source`, pipes ADMIN_EMAIL/PASSWORD to compose exec.
- **bootstrap.sh / update.sh → Caddy /api/health** — D-10/D-16 health probe via reverse-proxy = ground truth for user-facing surface.
- **update.sh → sms-migrate run --rm** — D-15 atomic pre-flight test. Override IMAGE_TAG via env (no .env mutation).
- **backup.sh → docker compose stop api web** — D-18 atomic snapshot. postgres + minio + caddy keep serving for backup operations.
- **restore.sh → compose down -v** — D-23 destructive volume wipe before extract. Idempotent restore.
- **README.md → DOMAIN-SETUP.md** — Phase 27 link from D-25 step 3.
- **README.md → BACKUP-RESTORE.md / TROUBLESHOOTING.md** — D-27/D-28 supplementary docs.
- **Phase 30 SMOKE-TEST-LOG.md** — bootstrap.sh timing log (D-12) feeds into Phase 30 acceptance evidence.
- **Phase 25 Dockerfile** — D-02 single-line COPY addition. Cross-phase touch locked here.

</code_context>

<specifics>
## Specific Ideas

- **"docker compose exec api bin/sms create-admin" exact match** — ROADMAP SC #1 spec literal. Phase 29 honors path resolution: WORKDIR /app/apps/api → bin/sms → /app/apps/api/bin/sms (relative). NOT $PATH lookup; NOT pnpm exec. Operator types exactly the string in ROADMAP.
- **Better Auth scrypt — corrects ROADMAP language** — ROADMAP says "bcrypt-hashed password", actual code uses Better Auth scrypt. D-05 captures the discrepancy, code-as-truth. ROADMAP SC #1 will be amended in Phase 30 docs sweep (or sooner if touched).
- **Atomic update.sh = pre-flight migrate guard** — D-15 prevents the "edit .env, migrate fails, .env now points to broken image, manual rollback" trap. Run migrate FIRST against new image (no .env edit, env override only) → only on green light, persist tag + recycle. Inspired by Phase 23 D-05 prisma migrate deploy idempotent + Pitfall 6 mitigation.
- **Offline backup, not online** — D-18 chosen because SC #5 says "byte-equivalent" — online has the race window (DB row inserted, MinIO mirror runs after pg_dump completes, file backed up but row not — eventual consistency violation). Stop api+web for ~30-90s = clean atomic snapshot. Operator runs nightly during low-traffic window.
- **.env excluded from backup** — D-19 security choice. Backup files frequently leak via misconfigured S3 / accidental git commit / email forward. Operator MUST keep .env separately (password manager + encrypted offsite). Restore requires: cd to deploy/ + `git pull` (compose.yml + Caddyfile + scripts) + .env from password manager + `bash restore.sh archive.tar.gz`.
- **Custom format pg_dump (-Fc) over plain SQL** — D-20 trade smaller archive + parallel restore for non-human-readable. Backup is machine artifact; humans inspect via `pg_restore -l archive.dump | less` or load into staging DB.
- **redis_data exclusion = explicit acceptable loss** — Sessions = users re-login (5s annoyance). BullMQ jobs = Phase 15 boot resilience replays from camera state on api restart. Worth ~50-200MB archive size savings.
- **Single-file archive** — D-17. Operator scp / rclone / s3 cp ONE file; no directory tree to preserve permissions on. Easier to verify (sha256sum of one file vs many).
- **Dockerfile cross-touch acknowledged + locked** — D-02 modifies Phase 25 product. Phase 29 owns this single-line addition; no Phase 25 plan/PLAN.md modifications. Future Dockerfile refactors must consult Phase 29 owner.
- **`update.sh --rollback` deferred** — D-14 backup `.env.backup-<ts>` + manual `cp` works. Adding `--rollback` flag = + parsing + race conditions (which backup to revert?) — not worth complexity for v1.3 single-server self-hosted scope.
- **TROUBLESHOOTING.md as runbook table format** — D-28. Operator reads under stress (3 AM cert expired) — symptom column → diagnosis column → fix column. NOT prose. Skim-friendly.

</specifics>

<deferred>
## Deferred Ideas

- **bin/sms doctor pre-flight env check** (DEPLOY-29) — defer v1.4. Extensible router (D-03) accommodates 1-line addition: `case 'doctor': await runDoctor(); break;`. Doctor would validate: required env vars set (no `change-me-*` left), DOMAIN DNS resolves to host IP, ports 80/443/1935/8080/10080/8000 free, disk free ≥ 5GB, Docker Compose v2.20+. v1.3 ship without; bootstrap.sh D-07 minimal pre-flight covers 90% case.
- **bin/sms reset-password / version / verify-backup subcommands** — defer v1.4. Reset-password = duplicate of `create-admin --force` (already supported). Version = nice-to-have but read from package.json or env var. Verify-backup = test-restore to throwaway DB + prisma migrate status (DEPLOY-32 deferred).
- **Backup encryption (GPG / age / openssl enc)** — defer. Operator wraps backup.sh in encryption: `bash backup.sh && gpg -e ./backups/sms-backup-<ts>.tar.gz`. v1.4 may add `--encrypt` flag if demand exists.
- **PG WAL streaming + PITR** — defer v1.4+. Offline pg_dump sufficient for v1.3 single-server scope. PITR adds streaming replication + WAL archiving + significant disk overhead.
- **MinIO bucket versioning** — defer v1.4. mc mirror simple snapshot is enough for v1.3. Bucket versioning adds storage cost + restore complexity.
- **Cron auto-schedule for backup.sh** — defer (operator concern). BACKUP-RESTORE.md (D-27) shows example crontab line; operator wires into host crontab.
- **update.sh --rollback flag** — defer. Manual `cp .env.backup-<ts> .env && bash update.sh <old-tag>` works. `--rollback` adds: which backup? handle multiple? — complexity not worth for single-server.
- **Schema-version cross-restore enforcement** — defer (D-24 warn-only path). prisma migrate deploy is idempotent both directions; safer to allow + warn.
- **Watchtower / auto-update agent** (DEPLOY-31) — anti-feature in v1.3 per research SUMMARY locked decisions. Operator pulls manually = intentional control.
- **Cosign keyless image signing** (DEPLOY-27) — defer v1.4. Phase 28 attestation provides equivalent integrity for v1.3.
- **SBOM generation** (DEPLOY-28) — defer v1.4. attest-sbom action plug-in extension.
- **ARM64 multi-arch ops** (DEPLOY-32) — defer v1.4. v1.3 amd64-only.
- **Recorded video walkthrough for <10-min claim** — defer. D-26 self-reported timing log via bootstrap.sh + Phase 30 SMOKE-TEST-LOG.md is enough evidence.
- **bin/sms enabled $PATH alias** — defer. Operator types `bin/sms` (relative); $PATH alias adds Dockerfile complexity (chmod, symlink) without operator benefit.
- **Multi-domain quickstart variants** — defer. v1.3 single hostname per Phase 27. Multi-domain = future phase.
- **Backup retention auto-pruning** — defer. Operator configures host filesystem retention (logrotate / find -mtime).
- **Restore RTO benchmarking** — defer. BACKUP-RESTORE.md (D-27) provides rough estimate (~5-15 min); precise benchmarking is Phase 30 work.

</deferred>

---

*Phase: 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli*
*Context gathered: 2026-04-28*
