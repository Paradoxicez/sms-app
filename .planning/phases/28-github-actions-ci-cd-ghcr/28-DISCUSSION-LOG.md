# Phase 28: GitHub Actions CI/CD → GHCR - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 28-github-actions-ci-cd-ghcr
**Areas discussed:** Trigger + concurrency, Pre-release tag policy, Pre-push smoke verification, Release notes + GHCR_ORG doc

---

## Trigger + Concurrency

### Q1 — events ไหนที่ build-images.yml ต้อง build + push?

| Option | Description | Selected |
|--------|-------------|----------|
| Tag + main (Recommended) | tag `v*.*.*` → build+push (semver tags), main push → build+push (`:latest` + `:main` + `:sha-7`) | ✓ |
| Tag-only (release-only) | build+push เฉพาะ tag push, ไม่มี :latest churn | |
| Tag + main + PR validation | เหมือน option แรก + PR build-only (no push) | |

**User's choice:** Tag + main (Recommended)
**Notes:** PR validation ถูกเลือกแยกใน Q2 → ผลคล้าย option 3 แต่ตอบเป็น 2 คำถามแยกเพื่อ clarity

### Q2 — PR validation (build-only, no push)?

| Option | Description | Selected |
|--------|-------------|----------|
| เพิ่ม (Recommended) | PR ที่แตะ Dockerfile/.dockerignore/workflows รัน build-only เป็น gate ก่อน merge | ✓ |
| ไม่เพิ่ม | เชื่อ Phase 25 manual + Phase 30 VM smoke + test.yml | |

**User's choice:** เพิ่ม (Recommended)

### Q3 — workflow_dispatch (manual rebuild)?

| Option | Description | Selected |
|--------|-------------|----------|
| เพิ่ม (Recommended) | operator escape hatch สำหรับ hotfix rebuild | ✓ |
| ไม่เพิ่ม | เฉพาะ push events | |

**User's choice:** เพิ่ม (Recommended)

### Q4 — concurrency cancel-in-progress?

| Option | Description | Selected |
|--------|-------------|----------|
| main+PR cancel, tag never (Recommended) | ป้องกัน CI minutes churn บน main/PR; tag ทุก release ต้อง complete | ✓ |
| ไม่มี concurrency rules | ปล่อยทุก build รัน parallel | |

**User's choice:** main+PR cancel, tag never (Recommended)

---

## Pre-release Tag Policy

### Q1 — pre-release tag → metadata-action emit `latest` ไหม?

| Option | Description | Selected |
|--------|-------------|----------|
| ไม่ emit latest (Recommended) | metadata-action `enable={{is_default_branch}}` skip prerelease อัตโนมัติ | ✓ |
| Emit latest ทุก tag | -test/-rc tag จะทับ :latest บน prod | |

**User's choice:** ไม่ emit latest (Recommended)

### Q2 — pre-release tag → emit `vX.Y` (major.minor)?

| Option | Description | Selected |
|--------|-------------|----------|
| ไม่ emit (Recommended) | semver pattern skip prerelease — `v1.3` shorthand ชี้ stable เท่านั้น | ✓ |
| Emit ทุก prerelease | `v1.3.0-test` → `:v1.3` (overwrite stable shorthand) | |

**User's choice:** ไม่ emit (Recommended)

### Q3 — release.yml สร้าง GH Release ตอนไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| ทุก v* tag — prerelease auto-flag (Recommended) | softprops/action-gh-release@v2 + `prerelease:` flag derived จาก tag regex | ✓ |
| เฉพาะ stable tag | skip Release สำหรับ -test/-rc | |
| ทุก v* tag (ไม่แยก prerelease) | -test ขึ้น latest banner ใน repo | |

**User's choice:** ทุก v* tag — prerelease auto-flag (Recommended)

### Q4 — Provenance attestation — ทุก image หรือเฉพาะ stable?

| Option | Description | Selected |
|--------|-------------|----------|
| ทุก image (Recommended) | attest-build-provenance ทุก build (main + tag + prerelease) | ✓ |
| เฉพาะ stable tag | skip attestation บน main + prerelease | |

**User's choice:** ทุก image (Recommended)

---

## Pre-push Smoke Verification

### Q1 — รัน smoke ต่อ build image ก่อน push ไป GHCR?

| Option | Description | Selected |
|--------|-------------|----------|
| รัน smoke (Recommended) | หลัง buildx, รัน `docker run` smoke checks; fail → ไม่ push | ✓ |
| ไม่รัน | เชื่อ Phase 25 manual + Phase 30 VM smoke | |

**User's choice:** รัน smoke (Recommended)

### Q2 — smoke รันตอนไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| ตอน PR + tag (Recommended) | PR build-only → smoke; main + tag push → build, smoke, push | ✓ |
| เฉพาะ main + tag | PR ไม่ smoke (build-only พอ) | |

**User's choice:** ตอน PR + tag (Recommended)
**Notes:** ตีความว่า "ทุก trigger" — main + tag + PR + dispatch รัน smoke ครบ (option label พิมพ์ชอร์ทแต่เจตนาคือ "ทุก build"); D-10 เขียนชัดเจนแล้ว

### Q3 — smoke สำหรับ api image ตรวจอะไรบ้าง?

| Option | Description | Selected |
|--------|-------------|----------|
| id + ffmpeg + tini (Recommended) | non-root uid=1001, ffmpeg 5.x, tini binary | ✓ |
| Boot probe (mock DB env + curl /api/health) | full boot test, costly + flaky | |
| `docker inspect` only | metadata-only, ไม่ boot | |

**User's choice:** id + ffmpeg + tini (Recommended)

### Q4 — smoke สำหรับ web image?

| Option | Description | Selected |
|--------|-------------|----------|
| id + boot + /api/health (Recommended) | non-root + actual boot + health probe | ✓ |
| id only | non-root verify, missed outputFileTracingRoot regression | |

**User's choice:** id + boot + /api/health (Recommended)

---

## Release Notes + GHCR_ORG Doc

### Q1 — release.yml body รูปไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| auto-notes + upgrade snippet (Recommended) | `generate_release_notes: true` + custom body มี image refs + `docker compose pull` snippet + link deploy/README.md | ✓ |
| auto-notes ล้วน | minimal, operator ต้องไปอ่าน deploy/README.md ต่างหาก | |
| custom body ล้วน | image refs + upgrade fixed body, no changelog | |

**User's choice:** auto-notes + upgrade snippet (Recommended)

### Q2 — doc GHCR_ORG ลงที่ไหน?

| Option | Description | Selected |
|--------|-------------|----------|
| .env.production.example พอ (Recommended) | comment line ในไฟล์เดิม | ✓ |
| .env.production.example + deploy/README.md section | ขยาย README (Phase 29 owns) | |
| build-images.yml header comment + Release body | comment ใน workflow + release body | |

**User's choice:** .env.production.example พอ (Recommended)

### Q3 — image visibility บน GHCR — public หรือ private?

| Option | Description | Selected |
|--------|-------------|----------|
| public (Recommended) | anonymous pull, ไม่ต้อง PAT, mitigate Pitfall 11 | ✓ |
| private | operator ต้อง PAT + docker login | |

**User's choice:** public (Recommended)

### Q4 — เพิ่ม OCI labels ผ่าน metadata-action หรือไม่?

| Option | Description | Selected |
|--------|-------------|----------|
| เพิ่ม (Recommended) | metadata-action `labels` output → build-push-action labels: → org.opencontainers.image.* อัตโนมัติ | ✓ |
| ไม่เพิ่ม | image ไม่มี provenance metadata ผ่าน docker inspect | |

**User's choice:** เพิ่ม (Recommended)

---

## Claude's Discretion

- Step name ภายใน workflow YAML
- Comment density ใน workflow files
- Error message wording ใน smoke scripts
- ลำดับ steps ภายใน job (research sample order คงไว้)
- timeout-minutes ต่อ job
- Concurrency group naming refinement
- การใช้ outputs สำหรับ attestation digest

## Deferred Ideas

- Cosign keyless image signing (DEPLOY-27 → v1.4)
- SBOM generation (DEPLOY-28 → v1.4)
- ARM64 multi-arch (DEPLOY-32 → v1.4)
- Image size assertion ใน CI
- Branch protection rule update (defer Phase 30)
- Image vulnerability scanning (Trivy/Grype)
- Watchtower auto-update (DEPLOY-31, anti-feature)
- `docker compose pull` test in CI (defer Phase 30)
- GHCR cleanup / retention policy
- Multi-registry replication (Docker Hub mirror)
- Secrets scan ใน CI (gitleaks/trufflehog)
- workflow YAML linting (actionlint)
- workflow_dispatch input parameters
- PR comment/check status enrichment
