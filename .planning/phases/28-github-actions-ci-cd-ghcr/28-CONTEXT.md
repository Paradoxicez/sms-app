# Phase 28: GitHub Actions CI/CD → GHCR - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

สร้าง GitHub Actions pipeline ที่ทำงานเมื่อ tag `vX.Y.Z` ถูก push (หรือ commit ลง main) → build production images ของ api + web (linux/amd64, multi-stage Dockerfiles ที่ Phase 25 ส่งมอบ) → push ไป `ghcr.io/<owner>/sms-{api,web}` พร้อม semver+`latest`+sha tags + OCI labels + build provenance attestation. operator บน prod box ทำ `docker compose pull && docker compose up -d` ได้กับ image ที่ stable, signed-by-attestation, public-pullable

**Delivers:**
- `.github/workflows/build-images.yml` — matrix `app: [api, web]`, triggers main+tag+PR+dispatch, build/smoke/push, attestation, OCI labels
- `.github/workflows/release.yml` — สร้าง GitHub Release บน v* tag push (auto-generated notes + custom body มี image refs + upgrade snippet); auto-flag prerelease
- `deploy/.env.production.example` patch — เพิ่ม comment ขยาย `GHCR_ORG` (ตัวแปรนี้ Phase 26 declare ไว้แล้ว Phase 28 อธิบายแหล่งที่มาให้ operator)

**Out of scope (belongs to other phases):**
- การแก้ไข Dockerfile หรือ image build configuration — Phase 25 ownership
- การแก้ไข `deploy/docker-compose.yml` หรือ image reference — Phase 26 ownership (Phase 26 ใช้ `${GHCR_ORG}/sms-{api,web}` แล้ว)
- Cosign keyless image signing — DEPLOY-27 (defer v1.4)
- ARM64 multi-arch build matrix — DEPLOY-32 (defer v1.4)
- `bin/sms doctor` pre-flight check — Phase 29
- `bootstrap.sh`/`update.sh`/operator scripts — Phase 29 (จะ consume image refs ที่ Phase 28 publish)
- Smoke test on clean Linux VM (real cold-deploy) — Phase 30
- Image retention / pruning policies — defer (GHCR default retention)
- SBOM generation (DEPLOY-28) — defer
- Watchtower / auto-update agent (DEPLOY-31) — defer
- Branch protection rule changes — Phase 23 DEBT-02 ตั้ง test gate ไว้แล้ว, Phase 28 จะแยก path-trigger เพื่อไม่ stomp
- ใช้ผลลัพธ์ของ Phase 28 ใน Phase 23 test.yml — `test.yml` คงเดิม ไม่ merge

</domain>

<decisions>
## Implementation Decisions

### Trigger matrix (build-images.yml)
- **D-01:** **4 triggers** สำหรับ `build-images.yml`:
  ```yaml
  on:
    push:
      branches: [main]
      tags: ['v*.*.*']
    pull_request:
    workflow_dispatch:
  ```
  - `push: tags` → versioned release build (semver tags + provenance + GH Release)
  - `push: main` → bleeding-edge (`:latest` + `:main` + `:sha-7`) — DEPLOY-04 SC ระบุ "`latest` on main"
  - `pull_request` → **build-only** (no push, no GHCR pollution) — protect main จาก Dockerfile regression
  - `workflow_dispatch` → operator escape hatch (hotfix rebuild ไม่ต้องปั่น dummy tag)

- **D-02:** **Push คือ conditional ตาม trigger event** — ใน `docker/build-push-action@v6` ใช้ `push: ${{ github.event_name != 'pull_request' }}`. PR runs build cache + smoke แต่ skip registry push. main + tag + dispatch → push.

- **D-03:** **Concurrency cancel-in-progress** บน PR + main, **ไม่** cancel บน tag:
  ```yaml
  concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: ${{ github.event_name != 'push' || !startsWith(github.ref, 'refs/tags/') }}
  ```
  เหตุผล: main commit ติดต่อกัน → cancel build เก่า ประหยัด CI minutes. tag push → ทุก release ต้อง complete (artifact + attestation), ห้าม cancel.

### Image namespace + tagging (DEPLOY-03, DEPLOY-04)
- **D-04:** **Image registry + namespace**:
  ```yaml
  env:
    REGISTRY: ghcr.io
    IMAGE_NAMESPACE: ${{ github.repository_owner }}/sms
  ```
  Image ชื่อเต็ม = `ghcr.io/<owner>/sms-${{ matrix.app }}` → `sms-api`, `sms-web` ตรงกับ Phase 26 `deploy/docker-compose.yml` L147/L183/L234 ที่ใช้ `${GHCR_ORG}/sms-api` และ `${GHCR_ORG}/sms-web` (Phase 26 D-25 lock). operator set `GHCR_ORG` ใน prod `.env` ให้ตรงกับ `github.repository_owner` (ปกติคือ GitHub username/org เจ้าของ repo).

- **D-05:** **metadata-action@v5 tag list**:
  ```yaml
  - id: meta
    uses: docker/metadata-action@v5
    with:
      images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAMESPACE }}-${{ matrix.app }}
      tags: |
        type=ref,event=branch
        type=ref,event=pr
        type=sha,format=short,prefix=sha-
        type=semver,pattern={{version}}
        type=semver,pattern={{major}}.{{minor}}
        type=raw,value=latest,enable={{is_default_branch}}
  ```
  - `type=sha,format=short,prefix=sha-` → `sha-<7-char>` ทุก build (DEPLOY-04 SC #2)
  - `type=semver,pattern={{version}}` → `v1.3.0` (เฉพาะ stable tag — metadata-action skip prerelease โดยอัตโนมัติ)
  - `type=semver,pattern={{major}}.{{minor}}` → `v1.3` (เฉพาะ stable)
  - `type=raw,value=latest,enable={{is_default_branch}}` → `latest` เฉพาะ commit บน default branch (main) — pre-release tag ไม่ทับ `latest`
  - `type=ref,event=branch` → `main` tag สำหรับ main pushes
  - `type=ref,event=pr` → `pr-<num>` (PR build-only, เก็บ tag list complete แม้ไม่ push)

- **D-06:** **Pre-release tag policy** — `v1.3.0-test`, `v1.3.0-rc1`, `*-beta*`, `*-alpha*` ตามมาตรฐาน semver มี prerelease segment:
  - **ได้ tag**: `v1.3.0-test` + `sha-<7>` (เฉพาะ specific version)
  - **ไม่ได้ tag**: `latest`, `v1.3` (major.minor) — `metadata-action` enforce ผ่าน `pattern={{version}}` + `pattern={{major}}.{{minor}}` ที่ skip prerelease semver tags อัตโนมัติ
  - operator ที่ pull `:latest` → ไม่ติด prerelease accidentally

- **D-07:** **OCI labels** — metadata-action emit `labels` output → ผ่านเข้า build-push-action `labels:` directly:
  ```yaml
  - uses: docker/build-push-action@v6
    with:
      labels: ${{ steps.meta.outputs.labels }}
  ```
  metadata-action จะใส่ `org.opencontainers.image.{title,description,url,source,revision,version,created,licenses}` อัตโนมัติ (อิง git context). ตอบ Phase 25 D-09 deferred-to-Phase-28 + ทำให้ `docker inspect <image>` แสดง provenance metadata + GHCR UI link source.

### Permissions + auth (DEPLOY-03 SC #4)
- **D-08:** **Workflow permissions** สำหรับ build-images.yml job:
  ```yaml
  permissions:
    contents: read           # checkout
    packages: write          # GHCR push
    id-token: write          # OIDC for attestation
    attestations: write      # attest-build-provenance
  ```
  - ไม่ใช้ PAT — `${{ secrets.GITHUB_TOKEN }}` (built-in) ให้ทุกอย่าง (Pitfall 11 mitigated)
  - `id-token: write` + `attestations: write` REQUIRED สำหรับ `actions/attest-build-provenance@v2` (sigstore OIDC)

### Provenance attestation (DEPLOY-05)
- **D-09:** **`actions/attest-build-provenance@v2` ทุก image, ทุก trigger**:
  ```yaml
  - uses: actions/attest-build-provenance@v2
    if: github.event_name != 'pull_request'
    with:
      subject-name: ${{ env.REGISTRY }}/${{ env.IMAGE_NAMESPACE }}-${{ matrix.app }}
      subject-digest: ${{ steps.build.outputs.digest }}
      push-to-registry: true
  ```
  - `if:` skip บน PR (PR ไม่ push image → ไม่มี digest ใน registry ให้ attest)
  - main, tag (รวม prerelease), dispatch → attest
  - `push-to-registry: true` → attestation อยู่กับ image ใน GHCR; operator verify ด้วย `gh attestation verify oci://ghcr.io/<owner>/sms-api:v1.3.0 --owner <owner>` (DEPLOY-05 SC #3)

### Smoke verification (pre-push gate)
- **D-10:** **Smoke ทุก build (PR + main + tag + dispatch)** — ถ้า smoke fail → fail job → ไม่ push image:
  ```yaml
  - name: Build image (load to local docker)
    id: build
    uses: docker/build-push-action@v6
    with:
      context: .
      file: apps/${{ matrix.app }}/Dockerfile
      platforms: linux/amd64
      load: true                    # load to local docker daemon for smoke
      tags: smoke-${{ matrix.app }}:latest
      cache-from: type=gha,scope=${{ matrix.app }}
      cache-to: type=gha,mode=max,scope=${{ matrix.app }}

  - name: Smoke test
    run: bash .github/scripts/smoke-${{ matrix.app }}.sh smoke-${{ matrix.app }}:latest

  - name: Build & push (with full tag set)
    id: push
    if: github.event_name != 'pull_request'
    uses: docker/build-push-action@v6
    with:
      context: .
      file: apps/${{ matrix.app }}/Dockerfile
      platforms: linux/amd64
      push: true
      tags: ${{ steps.meta.outputs.tags }}
      labels: ${{ steps.meta.outputs.labels }}
      cache-from: type=gha,scope=${{ matrix.app }}
      cache-to: type=gha,mode=max,scope=${{ matrix.app }}
  ```
  - 2-step pattern: build+load → smoke → build+push (cache hit ทำให้ step 2 เร็ว ~30s)
  - ทางเลือก: build เดียว `load: true` + manual `docker push` post-smoke — planner เลือกแบบ minimal-blast-radius

- **D-11:** **API smoke checks** (`.github/scripts/smoke-api.sh`):
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  IMAGE=$1
  # 1. Non-root user check (Phase 25 D-19 #3)
  test "$(docker run --rm "$IMAGE" id -u)" = "1001"
  # 2. FFmpeg version (Phase 25 D-19 #4)
  docker run --rm "$IMAGE" ffmpeg -version | grep -qE 'ffmpeg version 5\.'
  # 3. tini installed (Phase 25 D-19 #5)
  docker run --rm --entrypoint /bin/sh "$IMAGE" -c 'which tini && /usr/bin/tini --version'
  ```
  ไม่ boot full server (avoid mock env complexity); ตรวจ runtime invariants ที่ Phase 25 lock ไว้แล้ว

- **D-12:** **Web smoke checks** (`.github/scripts/smoke-web.sh`):
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  IMAGE=$1
  # 1. Non-root user check
  test "$(docker run --rm "$IMAGE" id -u)" = "1001"
  # 2. Boot + /api/health probe (Phase 25 D-19 #8 — verifies outputFileTracingRoot working)
  CID=$(docker run -d -p 3000:3000 "$IMAGE")
  trap "docker rm -f $CID >/dev/null 2>&1 || true" EXIT
  for i in {1..30}; do
    if curl -fsS http://localhost:3000/api/health 2>/dev/null | grep -q '"ok":true'; then
      echo "Health check passed"
      exit 0
    fi
    sleep 1
  done
  echo "Health check failed after 30s"; docker logs $CID; exit 1
  ```
  Web ไม่ depend external services → boot ได้จริง → catch `outputFileTracingRoot` regression ที่ Phase 25 D-18 lock ไว้

- **D-13:** **Smoke scripts ที่ `.github/scripts/`** ไม่ใช่ `scripts/` (root) — ผูกกับ workflow ownership; ไม่ปะปนกับ dev tooling (`scripts/dev-smoke.sh` เป็น Phase 24 ของ dev workflow). README header ในแต่ละ script อธิบายว่าใช้โดย `build-images.yml` เท่านั้น

### Caching strategy
- **D-14:** **GH Cache v2 ต่อ matrix app** (research sample):
  ```yaml
  cache-from: type=gha,scope=${{ matrix.app }}
  cache-to: type=gha,mode=max,scope=${{ matrix.app }}
  ```
  - `scope=api` กับ `scope=web` แยกกัน → cache ของ api (FFmpeg apt layers) ไม่ทับ cache ของ web (Next.js build)
  - `mode=max` → cache ทุก stage รวม intermediate (multi-stage Dockerfiles ของ Phase 25 ใช้ deps + builder + prod-deps + runtime stages — cache hit ลด build time จาก ~8min → ~2min)
  - หมายเหตุ: GitHub Actions cache จำกัด 10GB ต่อ repo; matrix scope แยกช่วยให้ eviction policy fair

### release.yml workflow (DEPLOY-04 SC #4)
- **D-15:** **Trigger เฉพาะ tag push**:
  ```yaml
  on:
    push:
      tags: ['v*.*.*']
  ```
  ไม่ trigger บน main / PR / dispatch — release.yml job เดียวเท่านั้นคือ "create GitHub Release on tag"

- **D-16:** **Job permissions + steps**:
  ```yaml
  permissions:
    contents: write   # create release
  jobs:
    release:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - id: prerelease_check
          run: |
            if [[ "${{ github.ref_name }}" =~ -(alpha|beta|rc|test) ]]; then
              echo "is_prerelease=true" >> "$GITHUB_OUTPUT"
            else
              echo "is_prerelease=false" >> "$GITHUB_OUTPUT"
            fi
        - uses: softprops/action-gh-release@v2
          with:
            generate_release_notes: true
            prerelease: ${{ steps.prerelease_check.outputs.is_prerelease }}
            body: |
              ## Container Images
              
              - `ghcr.io/${{ github.repository_owner }}/sms-api:${{ github.ref_name }}`
              - `ghcr.io/${{ github.repository_owner }}/sms-web:${{ github.ref_name }}`
              
              Provenance verified via build attestation:
              ```sh
              gh attestation verify oci://ghcr.io/${{ github.repository_owner }}/sms-api:${{ github.ref_name }} --owner ${{ github.repository_owner }}
              ```
              
              ## Upgrade an existing deployment
              
              ```sh
              cd /opt/sms-platform/deploy   # or wherever you cloned `deploy/`
              export IMAGE_TAG=${{ github.ref_name }}
              docker compose pull
              docker compose up -d
              ```
              
              See [deploy/README.md](https://github.com/${{ github.repository }}/blob/main/deploy/README.md) for full operator guide (lands in Phase 29).
  ```
  - `generate_release_notes: true` → GitHub auto-generate changelog (commits since previous tag, grouped by labels)
  - custom `body:` ต่อท้าย → image refs + upgrade snippet + provenance verify command + link to deploy/README.md
  - `prerelease:` flag derived จาก tag name regex — `v1.3.0-test`, `v1.3.0-rc1` → marked prerelease ใน UI

- **D-17:** **Pre-release detection regex** — `*-(alpha|beta|rc|test)*` enough; future suffixes (e.g., `-dev`) → expand list หรือ rely on default semver parsing

### `.env.production.example` patch (DEPLOY-22 carry-over)
- **D-18:** **Phase 26 ตั้ง `GHCR_ORG` ไว้แล้ว ใน `deploy/.env.production.example`** — Phase 28 ขยาย comment เพื่ออธิบายแหล่งที่มาให้ operator:
  ```
  # GitHub owner ที่ build-images.yml workflow publish image ไป.
  # ตรงกับ ${{ github.repository_owner }} ใน CI (เจ้าของ repo).
  # ตัวอย่าง: ถ้า repo อยู่ที่ github.com/acme-corp/sms-platform → GHCR_ORG=acme-corp
  GHCR_ORG=
  ```
  - ไม่สร้าง doc แยก (deploy/README.md เป็นของ Phase 29) — comment ในไฟล์ env example เพียงพอ
  - operator copy `.env.production.example` → `.env` ครั้งเดียวตอน first setup, อ่าน comment พร้อมตั้งค่า

### Image visibility on GHCR
- **D-19:** **Public images** — operator ไม่ต้อง `docker login ghcr.io` (Pitfall 11 mitigated). visibility setting ทำผ่าน GHCR UI หลัง first publish (default จะ inherit repo visibility, แต่ user ต้อง verify):
  - ครั้งแรกที่ image ถูก publish — owner ต้อง toggle "Change package visibility" → Public ใน GHCR UI (one-time)
  - operator manual step นี้จะถูกอ้างใน Phase 29 deploy/README.md prerequisites
  - Phase 28 verification: หลัง first publish (`v1.3.0-test`), test `docker pull ghcr.io/<owner>/sms-api:v1.3.0-test` จาก machine ที่ไม่มี docker login → success

### test.yml co-existence (Phase 23 DEBT-02)
- **D-20:** **build-images.yml ไม่ duplicate test.yml** — `test.yml` (Phase 23) รัน vitest + drift check; `build-images.yml` รัน build + smoke เท่านั้น. ถ้า test.yml fail บน main → build-images.yml จะรันต่อแต่ไม่ pollute GHCR เพราะ smoke เป็น runtime check (ไม่ทดแทน unit tests).
- **D-21:** **Branch protection ไม่แก้ใน Phase 28** — Phase 23 ตั้ง required check `test` ไว้แล้ว. Phase 28 เพิ่ม checks `build-images / build (api)`, `build-images / build (web)` แต่ไม่ enforce required (operator ตัดสินใจเอง — บางทีต้องการ ship hotfix ที่ Dockerfile-affecting แม้ tests ยัง flaky). Phase 30 จะ revisit.

### Verification gates (Phase 28 success criteria)
- **D-22:** **Verification checkpoints** ก่อน mark Phase 28 complete (planner เพิ่มใน PLAN.md):
  1. Push test tag `v1.3.0-test` → ทั้ง 2 jobs (`build (api)`, `build (web)`) ของ `build-images.yml` complete สำเร็จภายใน 10 นาที
  2. `docker pull ghcr.io/<owner>/sms-api:v1.3.0-test` + `docker pull ghcr.io/<owner>/sms-web:v1.3.0-test` ดึงสำเร็จจาก machine ที่ไม่มี docker login (verify D-19 public visibility)
  3. `docker inspect ghcr.io/<owner>/sms-api:v1.3.0-test` แสดง:
     - `RepoTags` รวม `v1.3.0-test` + `sha-<7>` (ไม่มี `latest`, ไม่มี `v1.3` — D-06 prerelease policy)
     - `Labels` มี `org.opencontainers.image.{source,version,revision,created}` (D-07 OCI labels)
  4. `gh attestation verify oci://ghcr.io/<owner>/sms-api:v1.3.0-test --owner <owner>` exit 0 (DEPLOY-05 SC #3 + D-09)
  5. GitHub Release `v1.3.0-test` ปรากฏใน repo Releases page, มี:
     - "Pre-release" badge (D-16/D-17 prerelease regex match)
     - Body มี image refs ของทั้ง api + web + `docker compose pull` snippet (D-16)
     - Auto-generated section (commits since previous tag)
  6. PR ที่แตะ `apps/{api,web}/Dockerfile` → trigger `build-images.yml` build-only run, smoke pass, ไม่มี image ใหม่ใน GHCR (D-02 PR conditional push)
  7. push commit ลง main → trigger build → tag set ที่ pushed คือ `main` + `latest` + `sha-<7>` (D-05); GHCR tag list verify ด้วย `gh api /users/<owner>/packages/container/sms-api/versions`
  8. Phase 23 test.yml ยัง pass บน same commit (D-20 — no test breakage)
  9. push stable tag `v1.3.0` (จริง, post-test) → tag set ที่ pushed คือ `v1.3.0` + `v1.3` + `latest` + `sha-<7>` (D-05 stable semver — `v1.3` + `latest` คืนกลับมาเทียบ prerelease)

### Claude's Discretion
- Step name ภายใน workflow YAML (ไม่กระทบ semantics)
- Comment density ใน workflow files (research sample เป็น minimal — ตามนั้น)
- Error message wording ใน smoke-api.sh / smoke-web.sh
- ลำดับ steps ภายใน job (checkout → setup-buildx → login → meta → build → smoke → push → attest — research sample order คงไว้)
- timeout-minutes ของ job (default 360 พอ — Dockerfile ที่ Phase 25 build ~5-8 นาที + smoke 1-2 นาที + push 1-2 นาที)
- Concurrency group naming refinement (group + ref pattern reasonable)
- การใช้ outputs (`steps.build.outputs.digest` สำหรับ attestation) — research sample correct, ใช้ตาม

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap (locked decisions)
- `.planning/ROADMAP.md` §Phase 28 (lines 161-170) — Goal + Success Criteria #1-4
- `.planning/REQUIREMENTS.md` §DEPLOY-03 — GHA workflow build+push GHCR on tag push, single-arch linux/amd64
- `.planning/REQUIREMENTS.md` §DEPLOY-04 — Tag pattern `vX.Y.Z` + `vX.Y` + `latest` + `sha-<7>` via `docker/metadata-action@v5`
- `.planning/REQUIREMENTS.md` §DEPLOY-05 — Build provenance attestation via `actions/attest-build-provenance`
- `.planning/REQUIREMENTS.md` §DEPLOY-27 — Cosign signing **deferred** (Phase 28 ไม่ทำ)
- `.planning/REQUIREMENTS.md` §DEPLOY-32 — Multi-arch ARM64 **deferred** (Phase 28 amd64 only)

### Research artifacts (full templates)
- `.planning/research/ARCHITECTURE.md` §"CI/CD Architecture" L496-598 — full sample `build-images.yml` + `release.yml`
- `.planning/research/ARCHITECTURE.md` §"Trigger matrix" L556-563 — push/tag/PR/dispatch semantics table
- `.planning/research/ARCHITECTURE.md` §"Architecture: amd64 only for v1.3" L565-569 — single-arch rationale
- `.planning/research/PITFALLS.md` §Pitfall 11 L355-374 — GHCR auth flow, public vs private (D-19 public chosen → no PAT trap)
- `.planning/research/PITFALLS.md` §Pitfall 8 L230-266 — `.env` in image layer (Phase 24 .dockerignore + Phase 25 multi-stage already mitigate; Phase 28 inherits)
- `.planning/research/SUMMARY.md` §Locked Decisions — `linux/amd64` only for v1.3; ARM64 → v1.4

### Phase 25 hand-off (Dockerfiles ที่ CI build)
- `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md` §D-09 — image size ≤450MB (api) / ≤220MB (web); Phase 28 verification ไม่ enforce ใน workflow (Phase 25 manual ตรวจแล้ว); future Phase 28 enhancement = `docker images --format` assertion
- `.planning/phases/25-multi-stage-dockerfiles-image-hardening/25-CONTEXT.md` §D-19 (manual checklist) — Phase 28 smoke (D-11/D-12) automate steps #3, #4, #5, #8 จาก list (non-root, ffmpeg, tini, web boot+health)
- `apps/api/Dockerfile` (Phase 25 product) — multi-stage build target Phase 28 อ้าง `apps/${{ matrix.app }}/Dockerfile` ใน `build-push-action`
- `apps/web/Dockerfile` (Phase 25 product) — เช่นเดียวกัน
- `apps/api/.dockerignore` + `apps/web/.dockerignore` (Phase 25 product) — comprehensive scope; CI build context ต้องสะอาด
- `.dockerignore` (root, Phase 24 product) — baseline Pitfall 8 mitigation

### Phase 26 hand-off (compose ที่ pull image จาก GHCR)
- `.planning/phases/26-production-compose-migrate-init-networking-volumes/26-CONTEXT.md` §D-25 — `.env.production.example` 4-section structure; Phase 28 D-18 ขยาย `GHCR_ORG` comment ในไฟล์เดิม
- `deploy/docker-compose.yml` L147 — `image: ghcr.io/${GHCR_ORG}/sms-api:${IMAGE_TAG:-latest}` (api service)
- `deploy/docker-compose.yml` L183 — `image: ghcr.io/${GHCR_ORG}/sms-api:${IMAGE_TAG:-latest}` (sms-migrate init service — ใช้ image เดียวกับ api per Phase 26 D-04)
- `deploy/docker-compose.yml` L234 — `image: ghcr.io/${GHCR_ORG}/sms-web:${IMAGE_TAG:-latest}` (web service)
- `deploy/.env.production.example` — Phase 28 ขยาย comment block ของ `GHCR_ORG` (Phase 26 declared) + อาจเพิ่มหมายเหตุเรื่อง `IMAGE_TAG` semver vs latest

### Phase 23 hand-off (existing CI ที่ห้าม break)
- `.github/workflows/test.yml` — vitest + drift check on push:main + PR; Phase 28 ห้าม merge logic เข้ากัน (D-20)
- `.github/workflows/test.yml` L8-9 — comment ระบุ "Image build / release workflows are owned by Phase 28" — ตามนั้น

### GitHub Actions upstream documentation
- [docker/build-push-action@v6 README](https://github.com/docker/build-push-action) — push conditional, cache-from/to, load+push 2-step pattern
- [docker/metadata-action@v5 tag patterns](https://github.com/docker/metadata-action#tags-input) — `type=semver`, `type=raw`, `type=sha`, prerelease handling
- [actions/attest-build-provenance@v2](https://github.com/actions/attest-build-provenance) — OIDC requirements (`id-token: write`), `subject-digest`, `push-to-registry`
- [softprops/action-gh-release@v2](https://github.com/softprops/action-gh-release) — `generate_release_notes`, `prerelease`, `body` interpolation
- [GitHub Actions concurrency docs](https://docs.github.com/en/actions/using-jobs/using-concurrency) — `cancel-in-progress` conditional
- [GHCR public images](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#changing-package-visibility) — visibility toggle UI
- [GitHub Actions cache (gha) backend](https://docs.docker.com/build/cache/backends/gha/) — `type=gha` scope semantics
- [Sigstore attestation verify with gh CLI](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/verifying-attestations) — `gh attestation verify oci://...`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 25 Dockerfiles** — `apps/api/Dockerfile` + `apps/web/Dockerfile` build ผ่าน `docker buildx build --platform linux/amd64 -f apps/${app}/Dockerfile . -t <tag>` แบบไม่มี platform-specific shenanigans; CI matrix consume ได้ทันที
- **Phase 25 D-19 manual checklist** → automate ผ่าน smoke scripts: D-11 (api: id+ffmpeg+tini) covers #3+#4+#5; D-12 (web: id+boot+/api/health) covers #1+#7+#8 ของ Phase 25 manual list
- **Phase 26 `${GHCR_ORG}/sms-api`/`sms-web` image refs** — naming locked แล้ว → CI `IMAGE_NAMESPACE: ${{ github.repository_owner }}/sms` + `${IMAGE_NAMESPACE}-${matrix.app}` ตรงกัน
- **`.dockerignore` (root + per-app)** — Phase 24 + 25 ครอบคลุม Pitfall 8 secrets/state แล้ว → CI build context ปลอดภัย
- **Phase 23 `.github/workflows/test.yml`** — pattern reference สำหรับ workflow YAML structure (job-level env, postgres service, pnpm action setup) — Phase 28 workflow แยกไฟล์ ไม่ merge

### Established Patterns
- **`pnpm/action-setup@v6` + `actions/setup-node@v4` order** — test.yml lock pattern (pnpm before setup-node เพื่อ `cache: pnpm` resolve) — Phase 28 ไม่ใช้ pnpm cache (build context มี lockfile แต่ build process internal ใน Dockerfile)
- **`actions/checkout@v4`** — pinned version ทุก workflow
- **multi-stage Dockerfile cache layering** — Phase 25 D-12 strategy (`pnpm install --frozen-lockfile --ignore-scripts` ใน deps stage, `pnpm prisma generate && pnpm build` ใน builder) — GH Cache v2 `mode=max` cache ทั้ง intermediate stages

### Integration Points
- **Phase 26 compose** — Phase 28 publish image ที่ตรงกับ `${GHCR_ORG}/sms-{api,web}:${IMAGE_TAG}`. operator workflow: set `GHCR_ORG` + `IMAGE_TAG=v1.3.0` ใน `.env` → `docker compose pull` → up
- **Phase 29 operator scripts** — `bootstrap.sh` + `update.sh v1.3.1` จะเรียก `docker compose pull` (สรุปคือ `docker pull ghcr.io/<owner>/sms-{api,web}:<tag>`) → Phase 28 image artifact คือ input ของ Phase 29
- **Phase 30 VM smoke test** — `gh attestation verify oci://ghcr.io/<owner>/sms-api:v1.3.0` คือหนึ่งใน 26 smoke checks; Phase 28 D-22 #4 รัน checkpoint เดียวกันใน lab
- **Phase 23 test.yml** — รัน parallel กับ Phase 28 build-images.yml ใน trigger เดียว (push: main + pull_request); ไม่มี dependency ระหว่างกัน (D-20)
- **Future Phase 28+ enhancements** — DEPLOY-27 (Cosign keyless), DEPLOY-28 (SBOM), DEPLOY-32 (ARM64) จะต่อยอดบน build-images.yml — โครงสร้าง matrix + permissions ปัจจุบันรองรับ extension ได้

</code_context>

<specifics>
## Specific Ideas

- **Public GHCR images = OSS-friendly self-hostable** — operator clone repo + run bootstrap.sh ไม่ต้อง create PAT, ไม่ต้อง `docker login ghcr.io`. ตรงกับ project vision "deploy ใน <10min". Pitfall 11 ของ research mitigated ทันที.
- **2-step build pattern (load → smoke → push)** — research sample ใช้ build เดียว+push; Phase 28 deviates เป็น load+smoke+push เพื่อ "ป้องกัน :latest broken บน prod". cost +30s ต่อ matrix job (cache hit ทำให้ step 2 เร็ว) — คุ้มกับการป้องกัน operator pull broken image
- **OCI labels via metadata-action** — Phase 25 เลื่อนเรื่อง labels ไป Phase 28 (D-09 deferred). metadata-action v5 emit labels จาก git context อัตโนมัติ → ไม่ต้องเขียน Dockerfile LABEL directives
- **Pre-release semver auto-detection** — `metadata-action@v5` ใน semver pattern skip prerelease tags โดยไม่ต้อง config เพิ่ม. operator pull `:latest` ปลอดภัยจาก -test/-rc accident
- **release.yml prerelease regex `(alpha|beta|rc|test)`** — `*-test` รวมในรายการเพราะ Phase 28 SC #1 ระบุ `v1.3.0-test` เป็น test tag pattern. future suffixes (-dev, -nightly) → expand list ตาม need
- **GHCR_ORG comment ใน .env เพียงพอ** — Phase 29 จะสร้าง deploy/README.md operator quickstart; ใน Phase 28 doc setup ครั้งเดียวที่ comment ในไฟล์ env example. operator ที่ copy `.env.production.example → .env` จะอ่าน comment ทันที — ergonomic > duplicate doc maintenance
- **Concurrency conditional ตาม trigger event** — `cancel-in-progress: ${{ github.event_name != 'push' || !startsWith(github.ref, 'refs/tags/') }}` — main + PR cancel, tag never. ป้องกัน accidental release loss
- **Smoke scripts ที่ `.github/scripts/`** ไม่ที่ root `scripts/` — ผูกกับ workflow ownership. ตรงกับ CLAUDE.md "Deploy Folder Convention" pattern (separation of concerns)

</specifics>

<deferred>
## Deferred Ideas

- **Cosign keyless image signing (DEPLOY-27)** — defer v1.4. Phase 28 build provenance attestation (DEPLOY-05) ทำหน้าที่หลัก: image integrity + supply chain transparency. Cosign signing เพิ่ม cryptographic signature layer (ไม่ใช่ attestation) — ต้องการ `cosign sign --yes` step + `cosign verify` ใน Phase 30 bootstrap. revisit ถ้า v1.4 มี supply-chain audit requirement
- **SBOM generation (DEPLOY-28)** — defer. `actions/attest-sbom` มี action — เพิ่มใน build-images.yml ทีหลังได้โดยไม่ refactor (extension-only)
- **ARM64 multi-arch build (DEPLOY-32)** — defer v1.4. Hetzner CAX series + Apple Silicon dev parity = real demand แต่ Phase 25 Dockerfile ทดสอบเฉพาะ amd64. matrix expansion ทำได้ภายหลัง: `arch: [amd64, arm64]` + native ARM runner (`ubuntu-24.04-arm`) GA ปลายปี 2025
- **Image size assertion ใน CI** (Phase 25 D-09 deferred) — defer. Phase 28 smoke ไม่ enforce size limit (450MB / 220MB) เพราะ Phase 25 manual ตรวจแล้ว + size regression rare. เพิ่มทีหลังถ้า Phase 30 ratify limits
- **Branch protection rule update** — Phase 28 ไม่แก้ ruleset. Phase 23 test gate ยังเป็น only required check. Phase 30 ratify ว่าจะเพิ่ม `build-images / build (api)` + `build-images / build (web)` ใน required checks หรือไม่
- **Image vulnerability scanning** (Trivy / Grype / GH Dependabot for Docker) — defer v1.4. cost: +2-3 minutes/build, requires registry permissions tweak. Phase 28 base = `node:22-bookworm-slim` + Caddy `2.11` — Debian + Caddy team patch surfaces เป็นหลัก
- **Watchtower auto-update agent (DEPLOY-31)** — anti-feature ใน v1.3 (research SUMMARY locked). operator pull manually = ตั้งใจ
- **`docker compose pull` test in CI** — defer Phase 30 (clean VM smoke). Phase 28 verification ใช้ `docker pull` (manual) ใน lab
- **GHCR cleanup / retention policy** — defer. GHCR default ไม่มี auto-cleanup; image versions accumulate. revisit ถ้า v1.4 มี cost concern
- **Multi-registry replication (Docker Hub mirror)** — defer indefinitely. v1.3 OSS-friendly = GHCR public (free, anonymous pull) เพียงพอ
- **Secrets scan ใน CI** (gitleaks / trufflehog) — defer. Phase 24 .dockerignore + Phase 25 multi-stage build context ไม่ leak `.env`. CI workflow ไม่อ่าน secrets ที่ไม่ใช่ `GITHUB_TOKEN`
- **Build matrix validation (lint workflow YAML)** — defer. `actionlint` หรือ `gh actions-lint` (community tool) — เพิ่มใน v1.4 ถ้า workflow file ขยาย
- **`workflow_dispatch` input parameters** (เช่น override tag, force rebuild without cache) — defer. Phase 28 keep dispatch simple (no inputs); operator ที่ต้องการ override ใช้ git tag manipulation
- **PR comment/check status enrichment** (post smoke result) — defer. GitHub default workflow status check เพียงพอ; ไม่ต้อง custom comment

</deferred>

---

*Phase: 28-github-actions-ci-cd-ghcr*
*Context gathered: 2026-04-28*
