# Phase 29: Operator UX (bootstrap/update/backup/restore + super-admin CLI) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 29-operator-ux-bootstrap-update-backup-restore-super-admin-cli
**Areas discussed:** bin/sms CLI architecture, Bootstrap.sh contract, Update.sh recycle strategy, Backup + Restore design

---

## Gray Area Selection

User asked which areas of Phase 29 to deep-dive (multiSelect, no skip option per workflow).

| Option | Description | Selected |
|--------|-------------|----------|
| bin/sms CLI สถาปัตยกรรม | Runtime/path/scope/idempotency | ✓ |
| Bootstrap.sh contract | Pre-flight, secrets gen, admin creation, ACME wait | ✓ |
| Update.sh recycle strategy | Args, .env edit, migrate gate, health verify | ✓ |
| Backup + Restore design | Format, online/offline, contents, restore safety | ✓ |

**User's choice:** All 4 areas.
**Notes:** README quickstart explicitly bundled into the other 4 areas (will reflect from decisions made there).

---

## bin/sms CLI architecture

### Question 1: bin/sms รัน logic ไฟล์ไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| Node script + bash wrapper | apps/api/src/cli/sms.ts → dist/cli/sms.js + 5-line bash wrapper. Reuse PrismaClient + better-auth/crypto pattern from seed.ts | ✓ |
| nestjs-commander | Boot Nest factory + DI; +1-2s overhead per invocation | |
| Pure bash + raw SQL | Cannot hash password without spawning node | |

**User's choice:** Node script + bash wrapper (Recommended)
**Rationale:** Lightest path; reuses proven seed.ts pattern; extensible router for future subcommands without refactoring.

### Question 2: bin/sms ลงใน image ยังไง?

| Option | Description | Selected |
|--------|-------------|----------|
| apps/api/bin/sms + COPY in Dockerfile | Phase 25 final stage WORKDIR /app/apps/api → bin/sms resolves correctly per ROADMAP spec | ✓ |
| package.json bin field | Operator runs `pnpm exec sms` (not matching `bin/sms` spec) | |
| Embed shebang in dist | Operator runs `node dist/cli/sms.js` (not matching spec) | |

**User's choice:** apps/api/bin/sms + COPY in Dockerfile (Recommended)
**Rationale:** Matches ROADMAP `docker compose exec api bin/sms create-admin` literal. Single-line cross-phase touch on Phase 25 Dockerfile, locked here.

### Question 3: subcommand ของ bin/sms ใน v1.3 มีแค่อะไร?

| Option | Description | Selected |
|--------|-------------|----------|
| create-admin only + extensible router | switch-statement router scaffold; v1.4 add 1-line cases | ✓ |
| create-admin + reset-password + version | +50 LOC; nice but ROADMAP requires only create-admin | |
| Full CLI surface (doctor + create-admin + verify-backup) | +200-300 LOC; scope creep beyond ROADMAP | |

**User's choice:** create-admin only + extensible router (Recommended)
**Rationale:** ROADMAP SC #1 requires only create-admin; extensible router supports v1.4 additions without refactor.

### Question 4: idempotency เมื่อ user มีอยู่แล้ว?

| Option | Description | Selected |
|--------|-------------|----------|
| Error + require --force flag | exit 1 with hint; --force overrides for password rotation | ✓ |
| Silent upsert (overwrite password) | Friendly but typo on second run = lock-out | |
| Skip (existing user untouched) | Safe but no password rotation path | |

**User's choice:** Error + require --force flag (Recommended)
**Rationale:** Prevents accidental clobber, supports password rotation, auditable per ROADMAP SC #1.

---

## Bootstrap.sh contract

### Question 5: Pre-flight ตรวจอะไรก่อน pull image?

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: Docker + .env exists + DOMAIN set | Covers 90% misconfig; <10s | ✓ |
| Comprehensive: + DNS + ports + disk + Compose v2 | ~30s; false-positive risk on NAT/CDN | |
| Skip pre-flight, fail-naturally | KISS but operator debugs cryptic errors | |

**User's choice:** Minimal: Docker + .env exists + DOMAIN set (Recommended)
**Rationale:** 3 checks catch most misconfig; avoids brittle DNS/port checks that false-positive in cloud NAT environments.

### Question 6: bootstrap.sh จัดการ init-secrets.sh ยังไง?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-call init-secrets.sh ถ้ายังมี placeholder | Detects `change-me-*` patterns and runs Phase 26 idempotent generator | ✓ |
| Fail + instruct operator | Two-step UX violates SC #2 "single bootstrap.sh" | |
| Inline secrets gen | Duplicates Phase 26 logic; drift risk | |

**User's choice:** Auto-call init-secrets.sh ถ้ายังมี placeholder (Recommended)
**Rationale:** Keeps SC #2 "single bootstrap.sh" promise; reuses Phase 26 idempotent guarantee.

### Question 7: สร้าง super-admin อย่างไร?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto from ADMIN_EMAIL/PASSWORD env after migrate | .env already declares vars (Phase 26 D-25); single-command + idempotent re-run | ✓ |
| Interactive prompt mid-run | Breaks automation; cannot pipe input | |
| Manual: print 'next step' instruction | Two-step UX violates SC #2 | |

**User's choice:** Auto from ADMIN_EMAIL/PASSWORD env after migrate (Recommended)
**Rationale:** Phase 26 reserved env vars precisely for this. Single-command UX + idempotent re-run via `bin/sms create-admin || bin/sms create-admin --force`.

### Question 8: ACME cert wait strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Wait for HTTPS reachable + log next step | Poll curl 5s/120s; print URL only after green | ✓ |
| Don't wait — print URL + tail caddy logs hint | Operator may visit before cert → browser warning | |
| Wait + check cert serial via openssl s_client | Brittle Caddy retry; harder to read | |

**User's choice:** Wait for HTTPS reachable + log next step (Recommended)
**Rationale:** Prevents confused-operator path; matches <10-min claim in SC #2 (operator sees URL ready to login).

---

## Update.sh recycle strategy

### Question 9: update.sh รับ tag ยังไง?

| Option | Description | Selected |
|--------|-------------|----------|
| Positional `update.sh v1.3.1` | Matches ROADMAP SC #3 spec literal; semver regex validation | ✓ |
| Positional + optional --rollback flag | Helpful day-2 but not in ROADMAP scope | |
| Read IMAGE_TAG from .env (no arg) | Doesn't match ROADMAP spec | |

**User's choice:** Positional `update.sh v1.3.1` (Recommended)
**Rationale:** Literal ROADMAP match; --rollback deferred per scope guardrail.

### Question 10: Apply IMAGE_TAG ยังไง?

| Option | Description | Selected |
|--------|-------------|----------|
| Backup .env → sed in-place | `.env.backup-<ts>` + persistent IMAGE_TAG via single source of truth | ✓ |
| Override env per-call (.env untouched) | Server reboot → wrong tag (.env unchanged) | |
| sed .env ไม่สำรอง | Rollback hard | |

**User's choice:** Backup .env → sed in-place (Recommended)
**Rationale:** Persistent across reboots; manual rollback via `cp .env.backup-<ts> .env`.

### Question 11: ถ้า prisma migrate ฟีลผิดบน image ใหม่?

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-flight migrate ก่อน recycle stack | Atomic guard: env override migrate test, only edit .env if green | ✓ |
| Edit .env ก่อน, fail → manual rollback | Operator skill required after failure | |
| Auto-rollback on failure | Hides root cause; cron auto-update silent failure pile-up | |

**User's choice:** Pre-flight migrate ก่อน recycle stack (Recommended)
**Rationale:** Atomic safety: migrate fails → .env untouched → stack unchanged; predictable + auditable.

### Question 12: หลัง recycle ต้องยืนยัน health ไหม?

| Option | Description | Selected |
|--------|-------------|----------|
| Poll api + web /api/health via Caddy | Ground-truth probe through reverse proxy | ✓ |
| Poll docker compose ps healthy | Container health ≠ reverse-proxy reachable | |
| No health verify | Violates SC #3 "without dropping in-flight requests" intent | |

**User's choice:** Poll api + web /api/health via Caddy (Recommended)
**Rationale:** Ground-truth: same surface as user. Catches Caddy reload race conditions that container healthchecks miss.

---

## Backup + Restore design

### Question 13: Archive format + path?

| Option | Description | Selected |
|--------|-------------|----------|
| tar.gz + ./backups/sms-backup-<UTC>.tar.gz | gzip universal; matches ROADMAP SC #4 example | ✓ |
| tar.zst + configurable path | Better ratio + speed but apt install zstd not default Ubuntu 22.04 | |
| Plain tar (no compression) | 3-5x archive size; recordings GB-scale | |

**User's choice:** tar.gz + ./backups/sms-backup-<UTC>.tar.gz (Recommended)
**Rationale:** Universal gzip availability; SC #4 naming match; BACKUP_DIR env override for external mounts.

### Question 14: Online vs offline backup?

| Option | Description | Selected |
|--------|-------------|----------|
| Offline: stop api+web, keep postgres+minio+caddy | ~30-90s downtime; atomic snapshot guarantees byte-equivalent (SC #5) | ✓ |
| Online: live pg_dump + live mc mirror | Race window: DB row inserted, MinIO mirror after pg_dump completes → eventual inconsistency | |
| Hot snapshot via PG WAL + MinIO versioning | Out-of-scope v1.3 | |

**User's choice:** Offline: stop api+web, keep postgres+minio+caddy (Recommended)
**Rationale:** SC #5 byte-equivalent guarantee requires atomic snapshot; ~30-90s downtime acceptable in maintenance window.

### Question 15: Archive รวมอะไรบ้าง?

| Option | Description | Selected |
|--------|-------------|----------|
| postgres + minio + caddy_data (.env excluded) | SC #4 mandatory 3; .env excluded for security; redis_data + hls_data transient | ✓ |
| + redis_data + .env (full snapshot) | Single-file restore but secrets in plaintext at rest | |
| + .env, exclude caddy_data | Re-issue cert post-restore; LE rate limit risk | |

**User's choice:** postgres + minio + caddy_data (.env excluded) (Recommended)
**Rationale:** Security best practice: backup files leak frequently. Operator keeps .env separately in password manager + offsite encrypted.

### Question 16: restore.sh ปลอดภัยยังไง?

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm prompt + --yes flag + integrity verify | tar -tzf structure check before destroy; --yes for DR automation | ✓ |
| Confirm + integrity + schema compat | Adds complexity; prisma migrate deploy idempotent both directions | |
| Destructive --yes only (no integrity, no prompt) | Corrupted archive + good state destroyed = unrecoverable | |

**User's choice:** Confirm prompt + --yes flag + integrity verify (Recommended)
**Rationale:** Three-layer safety: integrity verify → confirm → destroy. Prevents the worst path (destroy good state with unreadable archive).

---

## Wrap-up

### Question 17: มีพื้นที่ไหนอยากคุยเพิ่มอีก หรือพร้อมเขียน CONTEXT.md?

| Option | Description | Selected |
|--------|-------------|----------|
| พร้อมเขียน CONTEXT.md | Decisions complete; downstream agents can act | ✓ |
| คุยเพิ่ม: image build / Dockerfile cross-touch | Bundled into Area 1 D-02 already | |
| คุยเพิ่ม: docs/Troubleshooting | BACKUP-RESTORE.md + TROUBLESHOOTING.md scope | |
| คุยเพิ่ม: logging + error UX | Bash conventions | |

**User's choice:** พร้อมเขียน CONTEXT.md
**Rationale:** All gray areas resolved with recommended defaults. Cross-touch (D-02) and docs scope (D-27, D-28) and bash conventions (D-29) captured as derived decisions in CONTEXT.md.

---

## Claude's Discretion

- **Bash script conventions (D-29):** set -euo pipefail + IFS, TTY-aware color via tput, stderr-only logging (no log file), exit codes 0/1/2, absolute path resolution.
- **README format:** 5-step quickstart at top + collapsed "Operations" section (update/backup/restore one-liners) below + links to Phase 27 DOMAIN-SETUP.md, Phase 29 BACKUP-RESTORE.md, Phase 29 TROUBLESHOOTING.md.
- **Subcommand router pattern:** switch-statement on argv[2] + printUsage() default; v1.4 additions = 1-line `case '<cmd>': await fn(rest); break;`.
- **Timing log proof:** Self-reported via bootstrap.sh elapsed seconds, no recorded video walkthrough. Phase 30 SMOKE-TEST-LOG.md captures real-world timing.

## Deferred Ideas

(See CONTEXT.md `<deferred>` section for full list — 17 deferred items spanning v1.4 CLI extensions, encryption, PITR, MinIO versioning, retention automation, multi-domain, recorded walkthroughs, etc.)
