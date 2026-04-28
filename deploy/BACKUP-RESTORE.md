# Backup & Restore

Operator runbook for the offline atomic backup model implemented by `deploy/scripts/backup.sh` and the verify-first restore implemented by `deploy/scripts/restore.sh`. The backup is a single `tar.gz` archive containing exactly three top-level entries (`postgres.dump`, `minio/`, `caddy_data.tar.gz`); the restore drops volumes via `compose down -v`, extracts the archive, replays `pg_restore`, mirrors the MinIO buckets back, extracts `caddy_data` (preserving the Let's Encrypt account state so you do NOT trigger a fresh issuance and rate-limit), and then `compose up -d` brings the full stack back. Round-trip is byte-equivalent for everything in the archive.

## Quick Reference

```bash
# Backup (writes to ./backups/sms-backup-<UTC-ts>.tar.gz by default)
bash deploy/scripts/backup.sh

# Backup to a non-default destination (external mount, network share, etc.)
BACKUP_DIR=/mnt/backups bash deploy/scripts/backup.sh

# Restore (interactive — prompts for confirmation before destroying state)
bash deploy/scripts/restore.sh ./backups/sms-backup-<UTC-ts>.tar.gz

# Restore for DR automation (cron, ansible, runbook scripts)
bash deploy/scripts/restore.sh ./backups/sms-backup-<UTC-ts>.tar.gz --yes
```

The archive name pattern is `sms-backup-<UTC-ts>.tar.gz` where the timestamp is `$(date -u +%Y-%m-%dT%H%MZ)` (e.g. `sms-backup-2026-04-28T0930Z.tar.gz`). UTC ensures sortability across timezones; the `Z` suffix removes any operator ambiguity.

## What's in the archive

| Component                                    | Included? | Reason                                                                      |
| --------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| postgres pg_dump (custom -Fc)                 | yes       | Schema + data; smaller archive + parallel restore via `pg_restore -j`        |
| MinIO buckets (avatars/recordings/snapshots)  | yes       | All persistent objects (user avatars, recorded HLS, camera snapshots)        |
| caddy_data (TLS cert + ACME account state)    | yes       | Avoids Let's Encrypt rate-limit re-issue (5 fails/host/hour) on restore     |
| redis_data                                    | no        | Sessions are re-established on next login; BullMQ jobs replay on api boot   |
| hls_data                                      | no        | Live HLS segments self-delete via `hls_dispose` (Phase 26 srs.conf)         |
| `.env`                                        | no        | Secrets MUST live in your password manager — archives leak via S3 / email   |
| `docker-compose.yml` + `Caddyfile`            | no        | Source-controlled — `cd deploy/` and `git pull` before restore              |

What you MUST keep separately, outside this archive:

- **`deploy/.env`** — store in a password manager (1Password, Bitwarden) or sealed-secrets vault. Restoring without `.env` leaves the stack unable to start (no DB credentials, no auth secrets, no admin identity). The DR walkthrough below assumes you can pull `.env` from the operator's secret store.
- **The repository itself** — `git clone` (or sparse-checkout `deploy/`) before restore. The archive intentionally does NOT bundle `docker-compose.yml` or `Caddyfile` so that a forward upgrade can replace them without conflict.

## Cron auto-schedule

A daily backup at 02:00 UTC, with output captured for audit:

```
0 2 * * * cd /opt/sms-app && bash deploy/scripts/backup.sh > /var/log/sms-backup.log 2>&1
```

Adjust `/opt/sms-app` to wherever you cloned the repo on the production host. The log destination (`/var/log/sms-backup.log`) is operator preference — pair with `logrotate` if you want size-bounded rotation. Edit your operator's crontab with `crontab -e`. The 02:00 UTC slot is conventional for low-traffic batch operations; choose a window where the 30-90s api+web stop is acceptable for your users.

## Offsite copy with rclone

`backup.sh` writes to local disk only — pair it with [rclone](https://rclone.org/docs/) to mirror archives offsite:

```bash
rclone copy ./backups/ remote:sms-backups/ --include "sms-backup-*.tar.gz"
```

Replace `remote:` with whatever rclone remote you configured (`rclone config` walks you through Backblaze B2, AWS S3, Google Drive, etc.). Pair this command with the cron entry above by adding a second line:

```
30 2 * * * cd /opt/sms-app && rclone copy ./backups/ remote:sms-backups/ --include "sms-backup-*.tar.gz" >> /var/log/sms-backup.log 2>&1
```

Encrypt the remote bucket — most providers support server-side encryption (S3 SSE-S3 / SSE-KMS, B2 SSE-B2). Since the archive itself is unencrypted in v1.3 (see Encryption section below), provider-level encryption is the operator's primary at-rest defense for offsite copies.

## Encryption (v1.3 — operator-side)

`deploy/scripts/backup.sh` does **not** encrypt the archive in v1.3. The archive contains scrypt-hashed credentials, ACME private key + cert, and all MinIO objects (avatars + recordings + snapshots) — protect it accordingly.

Recommended wrap (operator chooses one):

```bash
# Option A: gpg symmetric (passphrase prompt; simple, reversible)
gpg --symmetric --cipher-algo AES256 ./backups/sms-backup-<ts>.tar.gz
# → produces ./backups/sms-backup-<ts>.tar.gz.gpg

# Option B: age (modern, scriptable, no GPG keyring required)
age -p ./backups/sms-backup-<ts>.tar.gz > ./backups/sms-backup-<ts>.tar.gz.age
```

Decrypt before invoking `restore.sh`:

```bash
gpg --decrypt ./backups/sms-backup-<ts>.tar.gz.gpg > ./backups/sms-backup-<ts>.tar.gz
# OR
age --decrypt -o ./backups/sms-backup-<ts>.tar.gz ./backups/sms-backup-<ts>.tar.gz.age

bash deploy/scripts/restore.sh ./backups/sms-backup-<ts>.tar.gz --yes
```

v1.4 may add an `--encrypt` flag to `backup.sh` to automate this wrap; for v1.3 the operator owns it.

## Disaster recovery walkthrough

Full DR scenario: production VM is gone (hardware failure, hostile delete, region outage), you have an archive offsite. Recovery target is RTO 5-15 min depending on archive size.

1. Provision a fresh Linux VM (Ubuntu 22.04 LTS or matching your previous OS). Ensure a public IPv4, root or sudo access, and the same outbound network reachability (ghcr.io, acme-v02.api.letsencrypt.org).
2. Install Docker Engine + Docker Compose v2 (`curl -fsSL https://get.docker.com | sh && systemctl enable --now docker`). Verify with `docker compose version` (need ≥2.20).
3. Sparse-checkout the deploy/ folder so the new VM has no application source on it:
   ```bash
   git clone --filter=blob:none --no-checkout https://github.com/<owner>/sms-app.git
   cd sms-app
   git sparse-checkout set deploy
   git checkout
   ```
4. Restore `deploy/.env` from your password manager (NEVER re-fill `change-me-*` values — restoring postgres against a different `DB_PASSWORD` than what the dump expects fails authentication). `chmod 600 deploy/.env` is required (init-secrets.sh enforces this on first run; restoring manually does not).
5. Copy or download your archive onto the VM and restore it:
   ```bash
   bash deploy/scripts/restore.sh /path/to/sms-backup-<ts>.tar.gz --yes
   ```
6. Confirm the DNS A-record points at the new VM's public IP. Caddy will reuse the cert + ACME account from the restored `caddy_data` — you should NOT see a fresh `certificate obtained successfully` line in `docker compose logs caddy`. If you do, the cert was missing from the archive; check rate-limit risk before retrying.
7. Verify end-to-end:
   ```bash
   curl -I "https://${DOMAIN}/api/health"
   # → HTTP/2 200
   ```
   Log in with the super-admin credentials, click around, and confirm orgs / users / cameras / recordings / snapshots are all present and identical to the source VM.

## Retention recommendations

A simple grandfather-father-son retention covers most operator needs without bloating offsite storage:

- **daily:** keep the 7 most recent (1 week of point-in-time recovery)
- **weekly:** keep the 4 most recent (1 month of regression rollback)
- **monthly:** keep the 3 most recent (1 quarter of compliance windows)

Total: ~14 archives at any time. Size budget = 14 × max-archive-size; for a deploy with 10 GB of MinIO content you're looking at ~140 GB of offsite storage, which is fine for B2 / Wasabi pricing.

Implement on the host filesystem with `find`:

```
0 3 * * * find /opt/sms-app/backups -name 'sms-backup-*.tar.gz' -mtime +7 -delete
```

Or rely on rclone retention policies if your offsite bucket supports lifecycle rules (S3, B2). Either approach works; do not implement retention inside `backup.sh` itself — keep the script concerned only with creating archives.

## Restore RTO target

Restore wall-clock is dominated by archive extraction + `pg_restore` + `mc mirror` + `caddy_data` extract. Archive size is in turn dominated by MinIO content (recordings + snapshots; the postgres dump and caddy_data tarball are typically <100 MB combined).

| Archive size | RTO target | Notes |
|--------------|-----------|-------|
| ~1 GB        | ~5 min    | Small deploy, 1-2 weeks of recordings |
| ~10 GB       | ~15 min   | Medium deploy, 1-2 months of recordings |
| ~100 GB      | 1-2 hours | Large deploy — consider sharding the archive across multiple offsite buckets |

For the v1.3 GA timing log measured against a real fresh-VM provision, see [`./SMOKE-TEST-LOG.md`](./SMOKE-TEST-LOG.md). Phase 30 (DEPLOY-25) populates the first real entry.

## Troubleshooting

Common backup / restore failures (disk full, volume in use, integrity verify failure, restore interrupted) are documented as symptom→diagnosis→fix entries in [`./TROUBLESHOOTING.md`](./TROUBLESHOOTING.md). If `restore.sh` aborts mid-flight via Ctrl-C or transient error, re-run it with the same archive — it is idempotent (re-extracts to a fresh `mktemp -d`, re-issues `compose down -v` against already-empty volumes as a no-op, and replays the entire restore chain).
