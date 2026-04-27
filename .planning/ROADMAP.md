# Roadmap: SMS Platform

## Milestones

- ✅ **v1.0 MVP** — Phases 1-7 + 999.1 (shipped 2026-04-16) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 UI Overhaul** — Phases 8-13 (shipped 2026-04-18) — [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Self-Service, Resilience & UI Polish** — Phases 14-22 (shipped 2026-04-27) — [archive](milestones/v1.2-ROADMAP.md)
- 📋 **v1.3 Production Ready** — Phases 23+ (planned)

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

### 📋 v1.3 Production Ready (Planned)

Goal: Take v1.2's feature-complete platform and ship it to production. Multi-stage Docker images, compose overrides, reverse proxy + TLS, secret management, DB migration strategy, health checks/restart policies, logging/monitoring, and tech-debt cleanup from v1.2 (StreamProcessor undefined cameraId guard + pre-existing API test fixes).

Phases TBD via `/gsd-new-milestone`.

## Phase Details

(No active phases — milestone v1.2 archived. Run `/gsd-new-milestone` to scope v1.3.)

## Progress

| Milestone | Phases | Status | Shipped |
| --------- | ------ | ------ | ------- |
| v1.0 MVP | 1-7 + 999.1 | Complete | 2026-04-16 |
| v1.1 UI Overhaul | 8-13 | Complete | 2026-04-18 |
| v1.2 Self-Service, Resilience & UI Polish | 14-22 | Complete | 2026-04-27 |
| v1.3 Production Ready | 23+ | Planned | — |
