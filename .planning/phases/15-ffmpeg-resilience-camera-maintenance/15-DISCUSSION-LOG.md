# Phase 15: FFmpeg Resilience & Camera Maintenance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 15-ffmpeg-resilience-camera-maintenance
**Areas discussed:** Health check + dedup, SRS restart recovery, Graceful shutdown + boot re-enqueue, Maintenance mode + UI icons

---

## Health check + dedup (RESIL-02, RESIL-03)

### Scheduler

| Option | Description | Selected |
|--------|-------------|----------|
| BullMQ repeatable job | Matches existing cluster-health/stream-ffmpeg, Redis lock for multi-instance, built-in retry | ✓ |
| NestJS @Cron | Simple but duplicates in scaled API instances | |
| @Interval + Redis lock | Lighter than BullMQ but more custom code | |

### Check scope

| Option | Description | Selected |
|--------|-------------|----------|
| FFmpeg map + SRS /streams (exclude maintenance) | Detect mismatch directly, covers both sides | ✓ |
| FFmpeg only | Cheap but misses SRS-side drops | |
| FFmpeg + SRS + RTSP reachability | Thorough but slow and load-heavy | |

### Recovery action

| Option | Description | Selected |
|--------|-------------|----------|
| Kill + re-enqueue via stream-ffmpeg | Reuses BullMQ backoff | ✓ |
| 2 consecutive failed checks | Slower but reduces false positives | |
| Transition only (let retry handle) | Simplest but slowest | |

### Flapping dedup

| Option | Description | Selected |
|--------|-------------|----------|
| Debounce 30s stable window | Prevent notify spam on rapid drop/recover | ✓ |
| No dedup | Current behavior, simple but noisy | |
| Flap counter + camera.flapping event | Smarter but adds a new event type | |

---

## SRS restart recovery (RESIL-01)

### Detect SRS restart

| Option | Description | Selected |
|--------|-------------|----------|
| SRS uptime/start_time delta | One API call per tick, reliable | ✓ |
| Infer from on_unpublish burst | Unreliable (crashes skip callbacks) | |
| Dedicated heartbeat 10s | Redundant with cluster-health | |

### Recover action

| Option | Description | Selected |
|--------|-------------|----------|
| Bulk re-enqueue active cameras | Fast recovery with controlled rate | ✓ |
| Let health check handle it | Simpler but up to 60s lag | |
| Trigger on first on_publish failure | Slow and per-stream serial | |

### Stagger strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Jitter delay 0–30s per camera | Spreads load, uses BullMQ delay option | ✓ |
| Batch 10 per 5s | Explicit but more code | |
| No stagger | Risk of thundering herd | |

---

## Graceful shutdown + boot re-enqueue (RESIL-04)

### Shutdown sequence

| Option | Description | Selected |
|--------|-------------|----------|
| SIGTERM all + 10s grace + SIGKILL | Clean HLS close, bounded shutdown time | ✓ |
| SIGKILL immediately | Abrupt, risks corrupt HLS segments | |
| SIGTERM + wait forever | Deploy can stall on FFmpeg hang | |

### "Was running" source of truth

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse camera.status field | No schema change, camera.status already captures intent | ✓ |
| New lastDesiredState column | Explicit but redundant | |
| Redis key per camera | Redis-dependent, not durable | |

### Boot re-enqueue owner

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated BootRecoveryService onApplicationBootstrap | Clear separation of concerns | ✓ |
| StreamsService.onModuleInit | Conflates concerns | |
| Pre-shutdown delayed job | Doesn't survive crashes | |

### Crash re-run protection

| Option | Description | Selected |
|--------|-------------|----------|
| Idempotent via BullMQ jobId dedup | Simple, already a pattern here | ✓ |
| Redis lock boot-recovery-in-progress | Risks stuck locks | |
| Instance marker in DB | Extra write path | |

---

## Maintenance mode + UI icons (CAM-01, CAM-02, CAM-03)

### Stream/recording behavior in maintenance

| Option | Description | Selected |
|--------|-------------|----------|
| Stop stream + recording when entering maintenance | Clear, saves resources | ✓ |
| Keep stream running, suppress notifications only | Operator confusion (online camera no alerts) | |
| Stop stream, keep recording running | Recording with no live input is a no-op | |

### Suppress scope

| Option | Description | Selected |
|--------|-------------|----------|
| Suppress notification + webhook, keep log + audit | Compliance-friendly | ✓ |
| Suppress everything | Loses audit trail | |
| Suppress webhook only, keep in-app notification | Half measure | |

### Icons layout

| Option | Description | Selected |
|--------|-------------|----------|
| Single Status column, 3 horizontal icons + tooltip | Compact, reuses CameraStatusDot | ✓ |
| 3 separate columns (Status, Recording, Maintenance) | Table gets wide | |
| Badge stack with labels | Visually heavier | |

### Maintenance quick action placement

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown row action + confirm dialog (toggle label) | Satisfies CAM-03, matches Phase 14 pattern | ✓ |
| Detail page switch only | Fails CAM-03 | |
| Bulk select + multi-toggle | Extra scope | |

---

## Claude's Discretion

- Exact icon choice for maintenance (wrench/tool/pause) — defer to UI-SPEC.
- Tooltip wording.
- Debounce implementation (setTimeout map vs BullMQ delayed job) — researcher recommends.
- Health check job concurrency (serial vs parallel per-camera sub-jobs).
- Confirmation dialog copy.

## Deferred Ideas

- RESIL-05 stderr parsing for degradation (already deferred in REQUIREMENTS.md)
- CAM-04 scheduled maintenance windows (already deferred)
- Observability / Prometheus metrics for resilience
- Formal testing strategy for SRS restart simulation
- Bulk maintenance UX (multi-select + toggle)
