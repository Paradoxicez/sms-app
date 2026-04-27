# Phase 25: Multi-Stage Dockerfiles + Image Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 25-multi-stage-dockerfiles-image-hardening
**Areas discussed:** Health endpoint strategy, FFmpeg version, PID 1 (tini vs init:true), Image size + per-app .dockerignore + Prisma generate

---

## Health endpoint strategy

### Q1: api จะมี public health endpoint ได้อย่างไร?
| Option | Description | Selected |
|--------|-------------|----------|
| สร้าง GET /api/health ใหม่ | HealthController + HealthModule แยก, audit.interceptor SKIP_PATHS พร้อม | ✓ (Recommended) |
| เปิด public /api/admin/health | ลบ SuperAdminGuard — semantic mismatch | |
| Skip Dockerfile HEALTHCHECK | compose-only, image ไม่มี self-check signal | |

**Notes:** Reason for picking new endpoint — `audit.interceptor.ts:12 SKIP_PATHS` มี `/api/health` slot รออยู่แล้ว, separation of concerns กับ admin operations, Phase 27 Caddy + Phase 30 nmap test ใช้ endpoint เดียวกัน

### Q2: web (Next.js) จะมี health ได้อย่างไร?
| Option | Description | Selected |
|--------|-------------|----------|
| สร้าง app/api/health/route.ts | App Router pattern, ~10 LOC | ✓ (Recommended) |
| ใช้ / homepage 200 OK | Payload ใหญ่, false-positive risk | |
| Skip web HEALTHCHECK | Caddy upstream check แทน | |

**Notes:** Container HEALTHCHECK รัน internally — Next.js rewrite chain `/api/* → ${API_URL}/*` คือ browser-side, Docker network resolution ต่างกัน → web ต้อง own endpoint ตัวเอง

### Q3: HEALTHCHECK ประกาศที่ไหน?
| Option | Description | Selected |
|--------|-------------|----------|
| Dockerfile เท่านั้น | Image self-contained, `docker run` standalone healthy | ✓ (Recommended) |
| Dockerfile + compose override | Belt-and-suspenders, redundant | |
| compose-only | Image ไม่ self-check ถ้า deploy นอก compose | |

**Notes:** Phase 26 service_healthy condition จะอ่าน Dockerfile HC ตรง — ไม่ต้อง redeclare

### Q4: Health endpoint return อะไร?
| Option | Description | Selected |
|--------|-------------|----------|
| Minimal `{ok:true}` | Liveness บริสุทธิ์, never-flaky | ✓ (Recommended) |
| `{ok, version, uptime, timestamp}` | Metadata 5 LOC, debug help | |
| Deep check (db+redis ping) | False-fail risk บน single-server | |

**Notes:** Postgres restart 5s → api unhealthy → Caddy ถอน traffic = bad. Liveness vs readiness แยกกันเป็น Kubernetes pattern — ไม่จำเป็นกับ Docker Compose single-server

---

## FFmpeg version

### Q1: ใช้ FFmpeg เวอร์ชันไหนใน production api image?
| Option | Description | Selected |
|--------|-------------|----------|
| apt 5.1.x จาก Bookworm | Proven ใน v1.2, smaller image, ไม่ต้อง multi-stage extra | ✓ (Recommended) |
| Multi-stage copy from jrottenberg/ffmpeg:7.1-ubuntu2204 | 7.x latest, +30-50MB cost | |
| Pin specific apt version | Reproducible build แต่ apt cache rotates | |

**Notes:** Project ใช้ FFmpeg 5.x มาตลอด v1.0-v1.2 ผ่าน UAT (H.265, AAC, libx264, RTSP→RTMP, recording archive). อัพเป็น 7.x ค่อย v1.4+ เมื่อ business need (4K AV1, hardware encoder)

---

## PID 1 (tini vs init:true)

### Q1: FFmpeg child reaping + signal forwarding — จัดการที่ไหน?
| Option | Description | Selected |
|--------|-------------|----------|
| tini ใน Dockerfile (api only) | Image self-contained, standalone test PID-1-safe, +~600KB | ✓ (Recommended) |
| init:true ใน compose (Phase 26 owns) | Image เล็กลง, แต่ Phase 25 standalone test เสี่ยง false-success | |
| Both (Dockerfile + compose init:true) | Defense-in-depth แต่ redundant | |

**Notes:** Phase 25 success criterion #2 ต้องการ `docker run --rm <api-image> id` standalone — ไม่ผ่าน compose. tini ใน image รับประกัน graceful shutdown ทำงานเสมอ

### Q2: ResilienceService graceful shutdown ต้องการเวลา — ตั้ง stop_grace_period ไว้ที่ไหน?
| Option | Description | Selected |
|--------|-------------|----------|
| Phase 26 owns | compose-level setting, Phase 25 ไม่ declare | ✓ (Recommended) |
| Phase 25 hint ใน Dockerfile comment | Self-document downstream phase | |

**Notes:** Pitfall 3 แนะ 30s. Phase 26 plan จะ set ใน docker-compose.yml service definition

---

## Image size + per-app .dockerignore + Prisma generate

### Q1: Verify image budget ≤450MB (api) / ≤220MB (web) — ทำอย่างไร?
| Option | Description | Selected |
|--------|-------------|----------|
| Manual `docker images` + record ใน PLAN.md | ตรงกับ "local build" success criterion | ✓ (Recommended) |
| scripts/check-image-sizes.sh | Reusable, Phase 28 CI ใช้ซ้ำ | |
| defer ไป Phase 28 CI gate | ไม่ผ่าน Phase 25 acceptance | |

**Notes:** Roadmap success criteria #1+3 ระบุ "verified via docker images" → must verify ใน Phase 25. Script overhead ไม่คุ้มสำหรับครั้งเดียวต่อ phase

### Q2: apps/{api,web}/.dockerignore เพิ่ม pattern ไหนบ้างจาก root .dockerignore?
| Option | Description | Selected |
|--------|-------------|----------|
| Comprehensive | tests/, *.spec.ts, vitest.config.ts, scripts/ — keep migrations/ | ✓ (Recommended) |
| Minimal (แค่ test files) | Trust root, dev tooling อาจหลุด | |
| Skip per-app (รอ root อย่างเดียว) | ขัด Phase 24 CLAUDE.md guardrail | |

**Notes:** Phase 24 CLAUDE.md guardrail #5 ระบุ "Per-app `.dockerignore` files (Phase 25)..."

### Q3: Prisma generate ใน multi-stage — จัดยังไง?
| Option | Description | Selected |
|--------|-------------|----------|
| --ignore-scripts + explicit prisma generate ใน builder stage | Clean, 1 generate per build | ✓ (Recommended) |
| Trust postinstall (ไม่แก้ package.json) | 3 generate per build, +~10s | |
| Patch package.json (ลบ postinstall) | Affects dev workflow CLAUDE.md rule | |

**Notes:** `--ignore-scripts` ใช้เฉพาะ Dockerfile build context — host `pnpm install` ยังรัน postinstall ตามปกติ → dev workflow ไม่กระทบ

---

## Claude's Discretion

- ถ้อยคำ exact ของ HealthController route descriptor + Swagger annotations
- exact placement ของ HealthModule import ใน app.module.ts
- ลำดับ COPY layer + apt install layer optimization สำหรับ build cache
- HEALTHCHECK timing tuning (start_period 20s vs 30s)
- Multi-line apt-get install formatting
- apps/api/.dockerignore exact pattern list (planner verifies scripts/ content)
- Test boot sequence ถ้า api smoke ต้องใช้ env vars dummy
- exact PR commit message format

## Deferred Ideas

- Image size automation script (`scripts/check-image-sizes.sh`) — defer Phase 28
- OCI image labels — defer Phase 28 metadata-action
- Cosign keyless signing — defer v1.3.x
- Readiness/deep health check — defer Phase 30 / v1.4
- Hardware FFmpeg encoders — defer indefinitely (SRS limitation)
- ARM64 image builds — defer v1.4+
- Bookworm-backports for FFmpeg 7.x — defer v1.4
- Distroless/scratch base — defer indefinitely
- Watchtower auto-update — out of v1.3 scope
- Dev container — defer v1.4
- Prisma engine binary minimization — defer if size budget exceeded
