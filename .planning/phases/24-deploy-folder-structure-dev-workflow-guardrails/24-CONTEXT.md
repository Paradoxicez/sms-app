# Phase 24: Deploy Folder Structure + Dev Workflow Guardrails - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Preventive structural work — สร้าง `deploy/` directory ที่ repo root, rename `apps/api/Dockerfile` → `Dockerfile.dev`, เพิ่ม root `.dockerignore`, และ smoke-test ว่า `pnpm dev` ยังทำงานได้เหมือนเดิม byte-for-byte. Phase 24 ไม่ owns REQ-IDs ใดๆ — เป็นการเตรียม layout ให้ Phase 25-30 ไม่ contaminate dev experience.

**Delivers:**
- `deploy/scripts/.gitkeep` + `deploy/README.md` (stub) — โครงรอ Phase 26-29 มาเติมเนื้อ (compose, Caddyfile, scripts, .env.production.example)
- Rename `apps/api/Dockerfile` → `apps/api/Dockerfile.dev` (current file ไม่ถูก dev compose ใช้งานเลย แต่ rename เพื่อ lock convention และเตรียมพื้นที่ให้ prod Dockerfile ใน Phase 25)
- Root `.dockerignore` — comprehensive scope ป้องกัน `.env*` / `.git` / `node_modules` / `.planning/` / `docker-data/` / `.claude/` รั่วเข้า image build context (Pitfall 8 BLOCKER for GA)
- `scripts/dev-smoke.sh` — root-level monorepo smoke script: รัน `pnpm dev` background, รอ 15s, curl `:3003/api/health` (api) + `:3002` (web), kill pid
- CLAUDE.md เพิ่ม section `## Deploy Folder Convention` 5 บรรทัด lock convention `deploy/ = prod-only` ตั้งแต่ตอนนี้

**Out of scope (belongs to other phases):**
- Production multi-stage `apps/api/Dockerfile` + `apps/web/Dockerfile` (Phase 25)
- Per-app `apps/*/.dockerignore` (Phase 25)
- `deploy/docker-compose.yml`, `deploy/.env.production.example` (Phase 26)
- `deploy/Caddyfile`, `deploy/DOMAIN-SETUP.md` (Phase 27)
- GHA `build-images.yml` / `release.yml` (Phase 28)
- `deploy/scripts/{bootstrap,update,backup,restore,init-secrets}.sh` + `deploy/README.md` 5-step quickstart + `BACKUP-RESTORE.md` + `TROUBLESHOOTING.md` (Phase 29)
- Smoke test on clean Linux VM (Phase 30)
- เปลี่ยน dev `docker-compose.yml` หรือ `apps/api/.env` หรือ source code ใดๆ — Phase 24 เป็น structural-only

</domain>

<decisions>
## Implementation Decisions

### deploy/ skeleton
- **D-01:** สร้างเฉพาะ `deploy/scripts/.gitkeep` + `deploy/README.md` (stub) ใน Phase 24. ไม่สร้าง `deploy/docs/` subfolder — `*.md` files ที่จะมาในอนาคต (DOMAIN-SETUP.md จาก Phase 27, BACKUP-RESTORE.md / TROUBLESHOOTING.md จาก Phase 29) ล้วน land ที่ `deploy/` root ตาม spec ไม่ต้องมี docs/ ซับโฟลเดอร์.
- **D-02:** `deploy/README.md` (stub) เป็น 1-2 paragraph อธิบาย "Production deployment artifacts. Each phase 25-30 fills in specific files. See ROADMAP.md Phase 24-30 + REQUIREMENTS.md DEPLOY-* for what lands when." Phase 29 (DEPLOY-23) จะ overwrite ไฟล์นี้ด้วย 5-step quickstart จริงๆ.
- **D-03:** `deploy/scripts/.gitkeep` empty file — ไม่มี script จริงใน Phase 24. Phase 29 จะเติม `bootstrap.sh` / `update.sh` / `backup.sh` / `restore.sh` / `init-secrets.sh`.

### Dockerfile rename
- **D-04:** Rename `apps/api/Dockerfile` → `apps/api/Dockerfile.dev` ด้วย `git mv` เพื่อรักษา git history.
- **D-05:** ไม่ลบไฟล์ทิ้งแม้ว่า dev `docker-compose.yml` จะไม่ได้ reference (verified — dev compose มีแค่ postgres/redis/srs/minio; api+web รันบน host ผ่าน `pnpm dev`). เก็บ Dockerfile.dev ไว้เป็น future reference ถ้าต้องการ containerize dev workflow ภายหลัง — และ rename signal ชัดว่าไฟล์นี้ "dev only" ไม่สับสนกับ prod Dockerfile ที่ Phase 25 จะสร้าง.
- **D-06:** ห้ามแก้ไข Dockerfile.dev content ใน Phase 24 — เก็บไว้เป็น byte-identical (รวม `EXPOSE 3001` ที่ stale แม้ว่า actual dev port จะเป็น 3003 ตาม `.env`). การ cleanup stale config เป็น out-of-scope; ถ้า Phase 25 จะ refactor ก็เป็นเรื่องของ Phase 25.

### Root .dockerignore (comprehensive)
- **D-07:** Comprehensive scope — เกินกว่า roadmap success criterion #3 minimal list เพราะ Pitfall 8 จัด BLOCKER for GA และ `.dockerignore` แก้ครั้งเดียว missing patterns เสี่ยงรั่ว secrets ภายหลัง. รายการที่ต้อง exclude:
  - **Secrets:** `.env`, `.env.*`, `!.env.example` (negation whitelist เฉพาะ example file)
  - **VCS:** `.git`, `.gitignore`, `.gitattributes`
  - **Dependencies:** `node_modules/`, `**/node_modules/`
  - **Build artifacts:** `dist/`, `**/dist/`, `.next/`, `**/.next/`, `out/`, `**/out/`, `*.tsbuildinfo`, `**/*.tsbuildinfo`
  - **Test/coverage:** `coverage/`, `**/coverage/`
  - **Planning:** `.planning/`, `apps/*/.planning/`
  - **Local data:** `docker-data/` (HLS bind-mount จาก dev compose)
  - **IDE/OS:** `.vscode/`, `.idea/`, `*.swp`, `*.swo`, `.DS_Store`, `Thumbs.db`
  - **Claude/agent state:** `.claude/`
  - **Logs:** `*.log`, `**/*.log`
  - **Examples ที่อาจมี real creds:** `bulk-import-*-EXAMPLE.csv`, `bulk-import-*-EXAMPLE.xlsx`
- **D-08:** ใช้ comments group ตาม category (Secrets / VCS / Dependencies / Build / Coverage / Planning / Data / IDE / Logs / Examples) เพื่อ readability. Future Phase 25 per-app `.dockerignore` จะ inherit + extend (Docker BuildKit ใช้ closest `.dockerignore` ต่อ build context).
- **D-09:** ไม่ exclude `Dockerfile*`, `apps/api/Dockerfile.dev` หรือ `*.md` — ไม่ใช่ security issue และอาจถูก reference โดย future build steps.

### Dev smoke-test (scripts/dev-smoke.sh)
- **D-10:** สร้างใหม่ที่ root: `scripts/dev-smoke.sh` (ไม่ใช่ `deploy/scripts/` เพราะ deploy/ = prod only ตาม Pitfall 18; ไม่ใช่ `apps/api/scripts/` เพราะครอบทั้ง monorepo). เพิ่ม root `scripts/` folder เป็นที่ใหม่สำหรับ monorepo-level dev tooling.
- **D-11:** Script flow: `set -euo pipefail` → `pnpm dev &` ใน background, capture pid → `sleep 15` → `curl -fsS http://localhost:3003/api/health` (api) + `curl -fsS http://localhost:3002/` (web) → `kill $pid` + cleanup → exit 0 ถ้าทั้งคู่ผ่าน. เพิ่ม trap on EXIT เพื่อ kill background processes แม้ script fail.
- **D-12:** Verify dev ports จาก `.env`: api = `:3003` (`.env:8 PORT=3003`), web = `:3002` (Next.js default ของ project, confirmed in `apps/api/src/main.ts:25` CORS allowlist).
- **D-13:** Health endpoint: api มี `/api/health` แล้ว (per CLAUDE.md "Note: /health endpoint already exists in api"). Phase 24 ไม่เพิ่ม endpoint — ใช้ที่มีอยู่.
- **D-14:** ไม่เพิ่ม script เข้า CI Phase 23 (`.github/workflows/test.yml`) ใน Phase 24 — รัน manual ก่อน. ถ้าจะ wire เข้า CI ค่อยมาทำตอน Phase 30 (smoke test gate) หรือเป็น backlog item.
- **D-15:** Run script ด้วยตนเองอย่างน้อย 1 ครั้งใน execute-phase verification step ก่อน mark Phase 24 complete — ผลต้อง exit 0.

### CLAUDE.md guardrail
- **D-16:** เพิ่ม section ใหม่ `## Deploy Folder Convention` ที่ CLAUDE.md ระหว่าง section ที่มีอยู่ — ตำแหน่งที่ระหว่าง "## Conventions" / "## Architecture" หรือก่อน "## Project Skills". Planner เลือกตำแหน่งที่อ่านลื่นที่สุด.
- **D-17:** เนื้อหา 5 bullets:
  1. `deploy/` = production-only artifacts (compose, Caddyfile, scripts, env example, prod docs). ห้ามใส่ dev tooling
  2. `apps/` = dev workflow source (NestJS, Next.js, Prisma schema). ห้าม colocate prod-only configs
  3. `apps/api/Dockerfile.dev` = unused dev container reference. Production Dockerfile (Phase 25+) ลงที่ `apps/api/Dockerfile` (no suffix)
  4. `pnpm-workspace.yaml` มีแค่ `apps/api` + `apps/web` — `deploy/` ห้ามมี `package.json` (จะกลายเป็น workspace member โดยไม่ได้ตั้งใจ)
  5. ใช้ `scripts/dev-smoke.sh` ตรวจ regression เมื่อแก้ deploy structure / docker-compose.yml / Dockerfile.dev
- **D-18:** ไม่เพิ่ม "## Architecture" hint หรือ touch section อื่นๆ ใน Phase 24 — เปลี่ยนเฉพาะที่ relate กับ deploy convention.

### Pnpm workspace + dev compose protection
- **D-19:** `pnpm-workspace.yaml` stays as-is — `apps/api`, `apps/web` only. ห้ามเพิ่ม `deploy/*` หรือ `scripts/*` เป็น workspace members. Verified ก่อน commit.
- **D-20:** `docker-compose.yml` (root, dev) — ไม่แตะ. Phase 26 จะสร้าง `deploy/docker-compose.yml` แยกต่างหาก ไม่ rename หรือ migrate dev compose.
- **D-21:** Verify หลัง Phase 24 commit: `git ls-files deploy/` แสดง `.gitkeep` + `README.md`; `pnpm install` ที่ root ไม่ traverse `deploy/`; `docker compose up` (no -f) ยังใช้ root `docker-compose.yml` (dev) ตามเดิม.

### Verification (Success Criteria)
- **D-22:** Manual checklist ใน PLAN.md ก่อน mark complete:
  1. `pnpm dev` รันได้ — ports 3003 (api) + 3002 (web) ตอบสนอง
  2. `bash scripts/dev-smoke.sh` exit 0
  3. `git ls-files deploy/` แสดง 2 ไฟล์: `deploy/README.md` + `deploy/scripts/.gitkeep`
  4. `apps/api/Dockerfile` ไม่มี (rename แล้ว); `apps/api/Dockerfile.dev` มี
  5. `.dockerignore` ที่ root มี comprehensive list
  6. CLAUDE.md มี section `## Deploy Folder Convention`
  7. CI workflow ของ Phase 23 ยัง pass (ไม่มี regression)

### Claude's Discretion
- ถ้อยคำ exact ของ stub `deploy/README.md` (1-2 paragraph)
- ลำดับ comment groups ใน `.dockerignore`
- exact placement ของ `## Deploy Folder Convention` section ใน CLAUDE.md
- exact wait duration ใน smoke script (15s เป็น starting point — ถ้า slow machine อาจต้อง 20s)
- exact PR commit message format (Phase 24 มี ~5 commits น่าจะ: 1 ต่อ logical change)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + research (locked decisions)
- `.planning/ROADMAP.md` §Phase 24 (lines 90-99) — Goal + Success Criteria #1-4
- `.planning/REQUIREMENTS.md` §Coverage (line 155) — "Phase 24 owns no REQ-IDs (preventive structural work)"
- `.planning/research/SUMMARY.md` — Locked decisions: `deploy/` folder name (line 24), Dev Dockerfile rename (line 31)
- `.planning/research/SUMMARY.md` §"Recommended Phase Order" Phase 1 (lines 60-62) — Phase 24 spec mapping
- `.planning/research/PITFALLS.md` §Pitfall 8 (lines 230-266) — `.env` in image layer = BLOCKER for GA, comprehensive `.dockerignore` patterns
- `.planning/research/PITFALLS.md` §Pitfall 18 (lines 586-624) — Dev workflow contamination from `deploy/` folder, BLOCKER classification

### Existing dev workflow (must remain byte-identical)
- `apps/api/Dockerfile` — Current dev Dockerfile (target of rename to `Dockerfile.dev`); 24 lines, single-stage, FFmpeg + curl + npm ci + nest start:dev
- `docker-compose.yml` — Root dev compose; runs postgres/redis/srs/minio only (NOT api/web). Phase 24 ห้ามแตะ
- `package.json` §scripts (lines 5-8) — `dev`, `dev:api`, `dev:web` scripts; Phase 24 ห้ามแตะ
- `pnpm-workspace.yaml` — `apps/api` + `apps/web` only; Phase 24 ห้ามแตะ
- `.gitignore` — Existing patterns (`.env`, `node_modules`, `dist`, `.next`, `.claude`, etc.); .dockerignore เป็น superset
- `.env` (line 8) — `PORT=3003` (api dev port for smoke script)
- `apps/api/src/main.ts:25` — CORS allowlist `http://localhost:3002` (web dev port)

### Convention to lock in CLAUDE.md
- `CLAUDE.md` — Existing project instructions; เพิ่ม `## Deploy Folder Convention` section ใหม่
- `CLAUDE.md` §"Conventions" — Existing pattern of "## sub-section" headers; ตามรูปแบบเดียวกัน

### Health endpoint (smoke target)
- `apps/api/src/admin/admin.controller.ts:14` — `/api/health` endpoint (per Phase 23 CLAUDE.md note "/health endpoint already exists in api")

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`.gitignore` patterns** (lines 1-40) — แม่แบบสำหรับ `.dockerignore`. คัดลอก + เสริม patterns ที่ docker-specific (`.git`, `coverage`, `docker-data`, `*.tsbuildinfo`, `.claude`).
- **Pitfall 8 sample `.dockerignore`** (`.planning/research/PITFALLS.md:243-255`) — Research-validated baseline; expand เพิ่ม `.claude` + `bulk-import-*-EXAMPLE.csv` ที่ project มี.
- **`apps/api/scripts/`** — Existing api-specific scripts dir (setup-test-db.sh, etc.). Pattern reference สำหรับ `scripts/dev-smoke.sh` ใหม่ที่ root level.

### Established Patterns
- **Bash scripts ใช้ `set -euo pipefail`** — verified จาก `apps/api/scripts/setup-test-db.sh` pattern. Use เดียวกันใน `scripts/dev-smoke.sh`.
- **`pnpm dev` ใน root spawns 2 background processes** (`pnpm dev:api & pnpm dev:web & wait`). Smoke script ต้อง trap signals + kill children explicitly เพราะ `pnpm dev` ไม่ exit เอง.
- **Health endpoint convention** — api `/api/health` (existing). Web ไม่มี dedicated health route; `/` (homepage) returns 200 ก็พอ.
- **`.env`-based port config** — `.env:8 PORT=3003`; smoke script ห้าม hardcode 3001 (stale ใน Dockerfile.dev EXPOSE).

### Integration Points
- **CI workflow** (`.github/workflows/test.yml` จาก Phase 23) — Phase 24 ไม่ extend workflow file นี้; smoke script รัน manual เท่านั้น
- **CLAUDE.md** — Phase 24 เพิ่ม section ใหม่; ห้าม rewrite section ที่ Phase 23 เพิ่ม (Prisma schema change workflow)
- **Dev compose** (`docker-compose.yml` root) — Phase 24 ไม่ touch; Phase 26 สร้าง `deploy/docker-compose.yml` แยก
- **Phase 25 hand-off** — Phase 25 จะสร้าง `apps/api/Dockerfile` (multi-stage prod) + `apps/web/Dockerfile` + per-app `.dockerignore`. Phase 24 layout ต้องไม่ block Phase 25.

</code_context>

<specifics>
## Specific Ideas

- **Dev Dockerfile = unused legacy:** Verified — root dev `docker-compose.yml` ไม่ reference `apps/api/Dockerfile` (มีแค่ postgres/redis/srs/minio services). api+web รันบน host ผ่าน `pnpm dev`. การ rename เป็น `Dockerfile.dev` จึงไม่กระทบใครเลย — เป็นแค่ signal convention.
- **`.dockerignore` ลำดับสำคัญ:** negation pattern `!.env.example` ต้องวางหลัง `.env*` exclusion (เพราะ Docker apply ตามลำดับ). กลุ่ม "Secrets" ต้องอยู่บนสุด.
- **Smoke script ต้อง trap EXIT:** `pnpm dev` spawn lukewarm tsx-watch + Next.js dev server; ถ้า script fail (curl reject) ต้อง kill background pid อย่างเด็ดขาด ไม่งั้น dev port stuck.
- **README stub ตั้งใจสั้น:** 1-2 paragraph + "See ROADMAP/REQUIREMENTS for what lands when". Phase 29 จะ overwrite ด้วย 5-step quickstart จริง — ห้ามเขียน content ที่จะถูกลบทิ้ง.
- **CLAUDE.md guardrail สำคัญ:** ป้องกัน future subagents (Phase 25-30) เผลอวาง dev tooling ใน `deploy/` หรือ rename Dockerfile.dev กลับ. Convention lock ใน CLAUDE.md ทำให้ทุก context อ่านเจอ.
- **`apps/web/` ไม่มี Dockerfile วันนี้:** Phase 25 จะสร้าง `apps/web/Dockerfile` (Next.js standalone). Phase 24 ไม่ต้องเตรียมอะไรล่วงหน้าสำหรับ web — root `.dockerignore` ครอบ `apps/web/.next/` แล้ว.

</specifics>

<deferred>
## Deferred Ideas

- **Per-app `.dockerignore`** (`apps/api/.dockerignore`, `apps/web/.dockerignore`) — Phase 25 owns เมื่อ multi-stage prod Dockerfiles ลง
- **Wire smoke script เข้า CI workflow** — defer to Phase 30 (clean-VM smoke gate) หรือ v1.4 backlog. Phase 24 รัน manual เพียงพอเป็น regression check
- **Cleanup stale `EXPOSE 3001` ใน Dockerfile.dev** — ไม่จำเป็น เพราะไฟล์ unused. ถ้า Phase 25 ตัดสินใจลบ Dockerfile.dev ทั้งไฟล์ตอน rebuild ก็ได้
- **Add `/health` endpoint to web** — Next.js `/` homepage HTTP 200 ก็พอใช้สำหรับ smoke. ถ้าอยากได้ structured health check ค่อยทำตอน Phase 27 (Caddy routing) หรือ Phase 30
- **Documentation เกี่ยวกับ deploy workflow** — Phase 29 owns `deploy/README.md` + `BACKUP-RESTORE.md` + `TROUBLESHOOTING.md`
- **`.gitleaks.toml` / pre-commit hook สำหรับ secret scan** — Pitfall 8 #3 แนะนำ; defer to v1.4 (security hardening). Root `.dockerignore` + GitHub secret scanning เพียงพอสำหรับ v1.3 GA

</deferred>

---

*Phase: 24-deploy-folder-structure-dev-workflow-guardrails*
*Context gathered: 2026-04-27*
