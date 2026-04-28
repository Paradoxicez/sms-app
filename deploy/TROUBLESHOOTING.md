# Troubleshooting

Skim-friendly symptom→diagnosis→fix runbook for v1.3 deploy operations. Read this when something fails during `bootstrap.sh`, `update.sh`, `backup.sh`, or `restore.sh`. For in-depth architecture context (why we use SRS, why Caddy, why pg_dump -Fc) see `.planning/PROJECT.md` and `.planning/ROADMAP.md`; for the cert-issuance walkthrough see [`./DOMAIN-SETUP.md`](./DOMAIN-SETUP.md); for backup / restore recipes see [`./BACKUP-RESTORE.md`](./BACKUP-RESTORE.md).

## How to read this runbook

Scan the **Symptom** column for the line you're seeing in your terminal or `docker compose logs`. **Diagnosis** explains why it's happening; **Fix** is the exact command to run. Each row references the relevant script or doc for deeper context. If your symptom isn't in the table, jump to "Less common" below or to "Diagnostics" for the universal triage commands.

## Common failures

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `bootstrap.sh` hangs at "Waiting for HTTPS endpoint", warns after 120s | Caddy is still negotiating the Let's Encrypt cert. Common causes: DNS A-record not yet propagated; port 80 blocked at firewall / cloud security group; rate-limit hit (5 fails/host/hour). | Check Caddy logs: `docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs caddy --tail 50`. Verify DNS: `dig +short A "$DOMAIN"`. Verify port 80: `curl -I "http://$DOMAIN"`. If rate-limited, set `ACME_CA=https://acme-staging-v02.api.letsencrypt.org/directory` in `deploy/.env`, then `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d caddy` to debug with the staging cert; revert when ready. See [`./DOMAIN-SETUP.md`](./DOMAIN-SETUP.md) §"Staging-CA toggle". |
| `sms-migrate` exits 1; `api` stays at "Created"; bootstrap.sh dies with "Migrate failed" | Schema drift between the new image and an existing DB; OR DB credentials mismatch; OR postgres unhealthy. | Read the migrate logs: `docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs sms-migrate`. If you see `P3009 migration failed`, inspect the `_prisma_migrations` table for the failing migration name (`docker compose ... exec postgres psql -U sms -d sms_platform -c 'SELECT migration_name, finished_at, logs FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 5;'`), then check that migration directory inside `apps/api/src/prisma/migrations/`. If credentials: confirm `DB_PASSWORD` in `.env` matches the postgres volume contents — rotating `DB_PASSWORD` against an existing volume requires either resetting the volume (`docker compose down -v`) or `ALTER USER` from inside the running postgres container. |
| `bin/sms create-admin` exits 1 with "User already exists" | Default error path; the CLI refuses to clobber an existing user without explicit operator intent. | Re-run with `--force`: `docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api bin/sms create-admin --email "$ADMIN_EMAIL" --password '<new-password>' --force`. The existing `user.id`, organization `member.id`, and role assignments are preserved; only the credential account password is rotated (re-hashed via Better Auth scrypt). |
| `compose pull` exits with `denied: requested access to the resource is denied` | `GHCR_ORG` in `.env` does not match the GitHub org/user that owns the GHCR images, OR the images are private and you have not authenticated. | Verify `GHCR_ORG` matches `${{ github.repository_owner }}` from the `.github/workflows/build-images.yml` build (typically the repo owner — username for personal repos, org slug for org repos). For private images: `gh auth login --scopes read:packages` then `gh auth token \| docker login ghcr.io -u <gh-username> --password-stdin`. v1.3 default builds publish public images via Phase 28 — check the actual image visibility on `https://github.com/users/<owner>/packages/container/sms-api`. |
| `backup.sh` fails with "No space left on device" | `BACKUP_DIR` (default `./backups`) ran out of disk before the bundle was tarred. | Check free space: `df -h ./backups` (or your custom `BACKUP_DIR`). Move existing archives offsite via rclone (see [`./BACKUP-RESTORE.md`](./BACKUP-RESTORE.md) §"Offsite copy with rclone") and prune old ones, OR re-run with a different target: `BACKUP_DIR=/mnt/external bash deploy/scripts/backup.sh`. The script's EXIT trap automatically restarts api+web even on failure, so the stack is back online while you triage. |
| `restore.sh` fails with "Volume is in use" or `compose down -v` hangs | Some service still has a handle on a named volume — typically a zombie api process after a crash, or a stuck `mc` / `pg_restore` from a prior aborted restore. | Force the stack down with a short timeout: `docker compose -f deploy/docker-compose.yml --env-file deploy/.env down --timeout 30 -v`. If it still hangs: `docker compose -f deploy/docker-compose.yml --env-file deploy/.env kill && docker compose -f deploy/docker-compose.yml --env-file deploy/.env down -v`. As a last resort (back up `.env` first!): `docker volume rm sms-platform_postgres_data sms-platform_minio_data sms-platform_caddy_data` then re-run `bash deploy/scripts/restore.sh <archive> --yes`. |
| Restore interrupted (Ctrl-C mid-restore) — partial state, stack offline | `restore.sh` aborted between `compose down -v` and the post-extract `compose up -d`. Volumes were dropped; restore did not finish. Postgres / MinIO / caddy_data are empty; nothing is serving traffic. | Re-run the same archive: `bash deploy/scripts/restore.sh ./backups/sms-backup-<UTC-ts>.tar.gz --yes`. `restore.sh` is idempotent — it re-extracts to a fresh `mktemp -d`, re-issues `compose down -v` (no-op against already-empty volumes), and replays `pg_restore` + `mc mirror` + `caddy_data` extract + `compose up -d`. If the archive itself is corrupt, the integrity-verify gate exits 1 BEFORE touching anything, in which case recover from the previous backup file (or the offsite rclone mirror). |

## Less common

- **`update.sh` exits with "Invalid tag format"** — Tag must match `vX.Y.Z`, `vX.Y.Z-prerelease`, or `latest`. Two-part `vX.Y` tags and bare commit shas like `sha-14f638d` are rejected by design (D-13). Pin the full semver from your release notes.
- **`bootstrap.sh` exits with "Docker daemon not running"** — Start Docker: `sudo systemctl start docker` on systemd hosts; `colima start` on macOS dev. Verify with `docker info`.
- **`bootstrap.sh` complains "ADMIN_PASSWORD is empty"** — Re-run init-secrets to fill empty + placeholder values: `bash deploy/scripts/init-secrets.sh`. The script is idempotent and only fills missing values.
- **Health probe says 503 after `update.sh`** — The api may have failed boot. `docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs api --tail 100`. If `sms-migrate` ran clean but api crashes, check for env-var drift (e.g. `DATABASE_URL_MIGRATE` missing, or Better Auth secrets out of sync between `.env` and the DB).
- **Cert renewal failed silently** — `ACME_EMAIL` was empty so Caddy registered an anonymous account and cannot email warnings. Set `ACME_EMAIL` in `.env`, then `docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d caddy`. Future renewals will alert.

## Diagnostics

Quick-reference universal triage commands:

```bash
# Service health and exit codes
docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps

# Tail logs for a specific service
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs --tail 100 <service>

# Inspect Prisma migration history
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec postgres \
  psql -U sms -d sms_platform -c "SELECT migration_name, started_at, finished_at FROM \"_prisma_migrations\" ORDER BY started_at DESC LIMIT 5;"

# End-to-end HTTPS health probe via Caddy
curl -I "https://${DOMAIN}/api/health"

# DNS sanity
dig +short A "${DOMAIN}"

# Validate compose syntax + env interpolation without booting anything
docker compose -f deploy/docker-compose.yml --env-file deploy/.env config --quiet
```

## When to escalate

If the runbook does not resolve your issue, gather the following before opening a GitHub issue:

- `docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps` output.
- The last 200 lines of logs for the failing service.
- Output of `docker compose -f deploy/docker-compose.yml --env-file deploy/.env config --quiet` (validates compose syntax).
- Contents of `deploy/.env` with **secrets redacted** (replace every `*_PASSWORD`, `*_SECRET`, and `JWT_*` value with `***`).
- Output of `docker --version` and `docker compose version`.

Open the issue with these as attachments. Do NOT paste un-redacted `.env` into a public issue tracker — secrets in plaintext are an instant compromise.
