# SMS Platform — Production Deployment

Single-server, self-hosted Docker Compose deployment of the SMS Platform: pull-only images from GitHub Container Registry, Caddy auto-TLS via Let's Encrypt, atomic image-tag upgrades, and offline backup / restore — designed to take a fresh Linux VM to a logged-in HTTPS endpoint in under 10 minutes via a single `bootstrap.sh` invocation.

## Prerequisites

- Linux server (Ubuntu 22.04 LTS or newer; Debian 12 also tested).
- Docker Engine 24+ and Docker Compose v2.20+ (`docker --version`, `docker compose version`).
- Public hostname with an A-record pointing at the server's public IPv4.
- Inbound TCP/80 + TCP/443 reachable from the public Internet (Let's Encrypt HTTP-01 challenge runs on :80; user traffic on :443).
- ~10 GB free disk for images + named volumes (postgres, redis, minio, caddy_data, hls_data).
- Outbound HTTPS to `ghcr.io` (image pull) and `acme-v02.api.letsencrypt.org` (cert issuance).

## Quickstart

The whole bring-up is five steps. Steps 1-3 are operator setup; step 4 is a single command that orchestrates everything else; step 5 is the login URL.

### 1. Clone (or sparse-checkout deploy/)

Full clone (recommended for first-time operators — gives you the source for inspection):

```bash
git clone https://github.com/<owner>/sms-app.git
cd sms-app
```

Sparse-checkout (production-only — pulls only `deploy/` so you never have application source on the prod box):

```bash
git clone --filter=blob:none --no-checkout https://github.com/<owner>/sms-app.git
cd sms-app
git sparse-checkout set deploy
git checkout
```

Either way, the `deploy/` directory is the only thing the rest of this guide needs.

### 2. Configure secrets + identity

Copy the env template and edit it:

```bash
cp deploy/.env.production.example deploy/.env
$EDITOR deploy/.env
```

Fill in the four operator-supplied identifiers (the rest are auto-generated in step 4):

- `DOMAIN` — Public hostname for the deploy (e.g. `streams.example.com`). Must match the A-record from §3 below.
- `ADMIN_EMAIL` — Email for the first super-admin account (you log in with this).
- `ACME_EMAIL` — Email Let's Encrypt registers on the ACME account; receives expiry warnings if cert renewal ever fails. Empty value works (anonymous account) but you forfeit the warning emails.
- `GHCR_ORG` — GitHub owner where the images are published. Must equal `${{ github.repository_owner }}` from the build workflow (the repo owner — typically a username or org slug).

Every other `change-me-*` placeholder (`DB_PASSWORD`, `NEXTAUTH_SECRET`, `BETTER_AUTH_SECRET`, `MINIO_ROOT_PASSWORD`, `JWT_PLAYBACK_SECRET`, `ADMIN_PASSWORD`) is auto-filled by `deploy/scripts/init-secrets.sh`, which `bootstrap.sh` invokes for you in step 4. Empty values are also detected and filled.

### 3. Configure DNS

Point an A-record at the server's public IPv4 address:

```
A    streams.example.com    →    1.2.3.4    TTL 300
```

**Verify against PUBLIC resolvers BEFORE running bootstrap.** Local dig may
hit your laptop's DNS cache or your registrar's authoritative server before
propagation completes — Let's Encrypt's ACME challenge resolves through
public resolvers, so the cert request can fail even when local dig looks
fine. Always pin to `@8.8.8.8` (Google) for the precheck, and ideally
double-check with `@1.1.1.1` (Cloudflare):

```bash
DOMAIN=$(grep ^DOMAIN= deploy/.env | cut -d= -f2)
dig @8.8.8.8 +short A "$DOMAIN"
# → expected: the server's public IP, exactly one line
dig @1.1.1.1 +short A "$DOMAIN"  # cross-check
```

If either returns nothing or the wrong IP, **stop here** — fix the DNS
record at your registrar and wait for propagation (typically 60s-15min for
fresh records, longer for `.in.th`/`.co.th` and other ccTLDs). Re-run the
two `dig` commands until both show your VM's public IP. Only then proceed
to step 4. The Phase 30 fresh-VM smoke run lost ~30 minutes to a missed
DNS-propagation step that this check would have caught.

See [`./DOMAIN-SETUP.md`](./DOMAIN-SETUP.md) for provider-specific
walkthroughs (Cloudflare gray-cloud requirement, propagation expectations,
port 80 reachability checks, and the staging-CA toggle for
debug-without-rate-limit).

### 4. Bootstrap

One command brings up the entire stack:

```bash
bash deploy/scripts/bootstrap.sh
```

The script auto-generates the remaining secrets (idempotent; safe to re-run), pulls every image from GHCR, runs `prisma migrate deploy` via the `sms-migrate` init container, seeds the default stream profile, creates the super-admin account from `ADMIN_EMAIL` + `ADMIN_PASSWORD`, then polls `https://${DOMAIN}/api/health` while Caddy provisions the Let's Encrypt cert. Wall-clock target: 5-10 minutes typical (mostly cert issuance + image pull). The script self-reports elapsed seconds at the end so you can confirm.

If you Ctrl-C mid-bootstrap or hit a transient error, just re-run it — every step is idempotent (init-secrets skips filled values, compose pull is layer-cache safe, migrate-deploy is a no-op on already-applied state, create-admin retries with `--force`, the HTTPS poll is stateless).

### 5. Login

Visit the printed URL:

```
https://${DOMAIN}
```

Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you set in step 2. You're now in the super-admin portal — create organizations, packages, and tenant accounts from the UI.

## Day-2 Operations

### Update to a new image tag

```bash
bash deploy/scripts/update.sh v1.3.1
```

Pulls the new images, runs a pre-flight migrate test against the new `sms-migrate` image with `.env` unchanged, and only on green light rewrites `IMAGE_TAG=` in `deploy/.env` and recycles the stack via the compose `depends_on` chain. Atomic: a broken migration cannot leave you with a wrong-tag `.env`. Manual rollback is `cp deploy/.env.backup-<UTC-ts> deploy/.env && bash deploy/scripts/update.sh <old-tag>`.

### Backup

```bash
bash deploy/scripts/backup.sh
```

Stops `api` + `web` for the snapshot window (30-90s typical), dumps Postgres (`pg_dump -Fc`), mirrors the MinIO buckets, captures `caddy_data` (so a restore does NOT trigger a Let's Encrypt rate-limit hit), bundles into `./backups/sms-backup-<UTC-ts>.tar.gz`, and restarts `api` + `web`. Override the destination with `BACKUP_DIR=/mnt/external bash deploy/scripts/backup.sh`. See [`./BACKUP-RESTORE.md`](./BACKUP-RESTORE.md) for the cron schedule, offsite copy with rclone, and DR walkthrough.

### Restore

```bash
bash deploy/scripts/restore.sh ./backups/sms-backup-<UTC-ts>.tar.gz
```

Verifies archive integrity (3-entry contract: `postgres.dump`, `minio/`, `caddy_data.tar.gz`) before any destructive action, prompts to confirm, then `compose down -v` (drops volumes) → extract → boot postgres + minio → `pg_restore --clean --if-exists` → `mc mirror` reverse → `caddy_data` extract → full `compose up -d`. Add `--yes` to skip the confirmation prompt for DR automation. See [`./BACKUP-RESTORE.md`](./BACKUP-RESTORE.md) for the full disaster-recovery walkthrough.

### Super-admin password rotation

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api \
  bin/sms create-admin --email "$ADMIN_EMAIL" --password '<new-password>' --force
```

> v1.3 supports a single super-admin (matched by email). Multiple super-admin accounts will land in v1.4 (DEPLOY-29). To rotate the password, re-run with the SAME `$ADMIN_EMAIL` and `--force` — re-running with a different email will be refused with a clear error.

The CLI updates the credential account password in place (re-hashed via Better Auth scrypt); `user.id`, organization membership, and role assignments are unchanged.

## Troubleshooting

If anything goes wrong (cert pending, migrate fails, create-admin refuses, image pull denied, backup disk full, restore volume in use), the symptom→diagnosis→fix runbook lives at [`./TROUBLESHOOTING.md`](./TROUBLESHOOTING.md). It covers the six most common failures plus diagnostics commands and an escalation checklist.

## Layout

| Path | Purpose |
|------|---------|
| `deploy/docker-compose.yml` | 7-service stack (postgres + redis + minio + sms-migrate + srs + api + web + caddy), 2 networks (edge + internal), 5 named volumes. Phase 26 product. |
| `deploy/Caddyfile` | Reverse-proxy site config: `/api/*` + `/socket.io/*` → api:3003, `/avatars/*` + `/snapshots/*` → minio:9000, catch-all → web:3000. Phase 27 product. |
| `deploy/.env.production.example` | Env template — copy to `deploy/.env`, fill `DOMAIN` / `ADMIN_EMAIL` / `ACME_EMAIL` / `GHCR_ORG`, then run `bootstrap.sh`. |
| `deploy/scripts/bootstrap.sh` | First-run orchestrator: pre-flight → auto-secrets → pull → migrate → create-admin → HTTPS poll → print URL + ELAPSED seconds. |
| `deploy/scripts/update.sh` | Atomic image-tag upgrade with pre-flight migrate guard. |
| `deploy/scripts/backup.sh` | Offline atomic backup (pg_dump -Fc + mc mirror + caddy_data tar) → `./backups/sms-backup-<UTC-ts>.tar.gz`. |
| `deploy/scripts/restore.sh` | Verify-first DR restore from a backup archive. |
| `deploy/scripts/init-secrets.sh` | Idempotent secret generator (`openssl rand -base64 32` + `chmod 600`). bootstrap.sh calls this automatically. |
| `deploy/DOMAIN-SETUP.md` | DNS + ACME prerequisites + provider-specific walkthroughs + staging-CA toggle. |
| `deploy/BACKUP-RESTORE.md` | Operator runbook: cron schedule, offsite copy with rclone, DR walkthrough, retention guidance, RTO target. |
| `deploy/TROUBLESHOOTING.md` | Symptom→diagnosis→fix table for the six most common failures + diagnostics + escalation. |
| `deploy/SMOKE-TEST-LOG.md` | Cold-deploy timings recorded by `bootstrap.sh` (Phase 30 will populate the first real entry from a fresh-VM provision). |

`deploy/` is production-only by **Deploy Folder Convention** (see CLAUDE.md §"Deploy Folder Convention"). No dev tooling, no `package.json`, no JavaScript packages — every script under `deploy/scripts/` is bash. Application source lives under `apps/`; CI under `.github/`. Keeping this separation is what lets you sparse-checkout `deploy/` for a production-only deploy.

## <10-minute proof

`bootstrap.sh` records its own wall-clock duration via `START=$(date +%s)` at entry and `ELAPSED=$(( $(date +%s) - START ))` at exit, and prints the result in the final summary block. Pipe stdout to a timing log if you want a permanent record:

```bash
bash deploy/scripts/bootstrap.sh 2>&1 | tee deploy/SMOKE-TEST-LOG.md
```

For the v1.3 GA timing log captured against a real fresh DigitalOcean / Hetzner VM, see [`./SMOKE-TEST-LOG.md`](./SMOKE-TEST-LOG.md). Phase 30 (DEPLOY-25) is responsible for populating the first real entry; Phase 29 ships the timing-log mechanism (this script's elapsed-seconds output) and the placeholder file.

## Reference

- `.planning/ROADMAP.md` — Phase-by-phase plan for v1.3 (Phases 23-30: tech-debt cleanup, Dockerfile hardening, compose, Caddy, CI/CD, operator UX, smoke test).
- `.planning/REQUIREMENTS.md` — DEPLOY-01..30 + DEBT-01..05 traceability.
- `.planning/research/ARCHITECTURE.md` — Auto-generation on first run (bootstrap.sh 8-step recipe), Pattern 2 (one-shot init service for migrations), build order Phase 5 (operator experience).
- `.planning/research/PITFALLS.md` — Pitfall 6 (migration container race conditions), Pitfall 8 (`.env` in image layer), Pitfall 13 (SRS API exposure).
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) and [Let's Encrypt rate limits](https://letsencrypt.org/docs/rate-limits/) — external cert-issuance reference.
