# Roadmap: SMS Platform

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 + 999.1 (shipped 2026-04-16) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 UI Overhaul** — Phases 8-13 (shipped 2026-04-18) — [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Self-Service, Resilience & UI Polish** — Phases 14-22 (shipped 2026-04-27) — [archive](milestones/v1.2-ROADMAP.md)
- ✅ **v1.3 Production Ready** — Phases 23-30 (shipped 2026-04-29) — [archive](milestones/v1.3-ROADMAP.md)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-7 + 999.1) — SHIPPED 2026-04-16</summary>

- [x] Phase 1: Foundation & Multi-Tenant (6/6 plans)
- [x] Phase 2: Stream Engine & Camera Management (6/6 plans)
- [x] Phase 3: Playback & Security (3/3 plans)
- [x] Phase 4: Developer Experience (5/5 plans)
- [x] Phase 5: Dashboard & Monitoring (6/6 plans)
- [x] Phase 6: SRS Cluster & Scaling (3/3 plans)
- [x] Phase 7: Recordings (5/5 plans)
- [x] Phase 999.1: Role-based Sidebar Navigation (5/5 plans)

</details>

<details>
<summary>✅ v1.1 UI Overhaul (Phases 8-13) — SHIPPED 2026-04-18</summary>

- [x] Phase 8: Foundation Components (2/2 plans)
- [x] Phase 9: Layout & Login (3/3 plans)
- [x] Phase 10: Admin Table Migrations (3/3 plans)
- [x] Phase 11: Camera Management (3/3 plans)
- [x] Phase 12: Recordings (2/2 plans)
- [x] Phase 13: Hierarchy & Map (2/2 plans)

</details>

<details>
<summary>✅ v1.2 Self-Service, Resilience & UI Polish (Phases 14-22) — SHIPPED 2026-04-27</summary>

- [x] Phase 14: Bug Fixes & DataTable Migrations (3/3 plans) — completed 2026-04-18
- [x] Phase 15: FFmpeg Resilience & Camera Maintenance (4/4 plans) — completed 2026-04-19
- [x] Phase 16: User Self-Service (3/3 plans) — completed 2026-04-19
- [x] Phase 17: Recording Playback & Timeline (5/5 plans) — completed 2026-04-19
- [x] Phase 18: Dashboard & Map Polish (7/7 plans) — completed 2026-04-21
- [x] Phase 19: Camera input validation + multi-protocol (RTMP/RTMPS) (9/9 plans) — completed 2026-04-22
- [x] Phase 19.1: RTMP push ingest with platform-generated stream keys (8/8 plans, INSERTED) — completed 2026-04-23
- [x] Phase 20: Cameras UX bulk actions, maintenance toggle, copy ID, expressive status (4/4 plans) — completed 2026-04-25
- [x] Phase 21: Hot-reload Stream Profile changes to running cameras (6/6 plans) — completed 2026-04-25
- [x] Phase 21.1: Active-job collision fix for hot-reload restart (3/3 plans, INSERTED gap closure) — completed 2026-04-25
- [x] Phase 22: Camera metadata utilization — surface tags & description (12/12 plans) — completed 2026-04-26

</details>

<details>
<summary>✅ v1.3 Production Ready (Phases 23-30) — SHIPPED 2026-04-29</summary>

- [x] Phase 23: Tech Debt Cleanup + Phase 0 Prerequisites (6/6 plans) — completed 2026-04-27
- [x] Phase 24: Deploy Folder Structure + Dev Workflow Guardrails (5/5 plans) — completed 2026-04-27
- [x] Phase 25: Multi-Stage Dockerfiles + Image Hardening (6/6 plans) — completed 2026-04-27
- [x] Phase 26: Production Compose + Migrate Init + Networking + Volumes (4/4 plans) — completed 2026-04-28
- [x] Phase 27: Caddy Reverse Proxy + Auto-TLS (5/5 plans) — completed 2026-04-28
- [x] Phase 28: GitHub Actions CI/CD → GHCR (4/4 plans) — completed 2026-04-28
- [x] Phase 29: Operator UX (bootstrap/update/backup/restore + super-admin CLI) (6/6 plans) — completed 2026-04-28
- [x] Phase 30: Smoke Test on Clean VM (GA gate) (6/6 plans) — completed 2026-04-29

</details>

## Backlog

### Phase 999.2: Smart camera probe + brand detection — onboarding warning (BACKLOG)

**Goal:** Surface a soft warning at camera onboarding (Add Camera + Bulk Import) when probe detects PTS skew, VFR, or vendor signatures (Uniview/Hikvision/Dahua) that historically break SRS HLS muxer in passthrough mode — recommend transcode profile pre-emptively. Captured 2026-04-30 from debug session `saensuk-139-live-but-preview-broken` after a Uniview UNV `/media/video2` camera caused ~1hr investigation; user worked around by switching Stream Profile to transcode (no code change). Prevents repeat incidents for future quirky cameras.

**Requirements:** TBD

**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

**Scope hints (for /gsd-discuss-phase):**
- Tier 1 probe: parse `tags.encoder`, compare `r_frame_rate` vs `avg_frame_rate` (VFR), capture `profile`/`level`/`pix_fmt` from existing `-show_streams` (free, ~0s extra)
- Tier 2 probe: sample 100 packets via `-show_packets -read_intervals "%+10"` for PTS monotonicity + delta variance (+5-10s, optional async)
- Brand detection: URL path heuristic (`/media/videoN` → Uniview, `/Streaming/Channels/` → Hikvision, `/cam/realmonitor` → Dahua, `/profile1` → ONVIF generic, `/axis-media/media.amp` → Axis), `tags.encoder` parse (Hisilicon/Ambarella/Lavc), optional RTSP DESCRIBE Server header
- Schema: `Camera.streamWarnings: String[]`, `brandHint: String?`, `brandConfidence: String?`
- UI: extend existing `CodecMismatchBanner` (Phase 19.1 D-16) → `StreamWarningBanner` with severity + transcode recommendation CTA
- Soft warning ONLY — do NOT auto-force transcode (false-positive risk → user frustration)
- Effort estimate: ~3-4 hr quick task (Tier 1 + URL/encoder heuristic + UI), or ~1-2 day phase (+ Tier 2 packet sampling + RTSP DESCRIBE + retroactive audit)
- Cross-references: `.planning/debug/saensuk-139-live-but-preview-broken.md`, `.planning/debug/production-cameras-flapping.md` (sister bug, still unfixed), `apps/api/src/cameras/ffprobe.service.ts`, `git stash@{0}: tier-B-genpts-defense` (alternative fix on shelf)

## Progress

| Milestone | Phases | Plans | Status | Shipped |
| --------- | ------ | ----- | ------ | ------- |
| v1.0 MVP | 1-7 + 999.1 | 53 | Complete | 2026-04-16 |
| v1.1 UI Overhaul | 8-13 | 15 | Complete | 2026-04-18 |
| v1.2 Self-Service, Resilience & UI Polish | 14-22 | 64 | Complete | 2026-04-27 |
| v1.3 Production Ready | 23-30 | 42 | Complete | 2026-04-29 |
| Backlog | 999.2 | 0 | Pending | — |
