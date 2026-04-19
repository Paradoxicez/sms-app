---
status: partial
phase: 15-ffmpeg-resilience-camera-maintenance
source: [15-VERIFICATION.md]
started: 2026-04-19T09:10:00Z
updated: 2026-04-19T09:10:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. SRS Docker restart → all cameras auto-reconnect within ~60s
expected: `docker compose restart srs` → within 60s all online/connecting/reconnecting/degraded cameras (maintenanceMode=false) return to status=online after staggered 0-30s jitter; log shows `SrsRestartDetector: SRS restart detected: pid X -> Y` followed by N × `enqueued {cam} (delay=Nms)`
result: [pending]

### 2. Server SIGTERM → clean FFmpeg shutdown within 10s grace
expected: `docker compose stop api` → logs show `Shutting down N FFmpeg processes (signal=SIGTERM)` → either `All FFmpegs exited cleanly within grace` OR `SIGKILLed stragglers: ...` → container exits in ≤10s → `docker compose start api` → `Boot recovery: re-enqueuing N streams` → cameras reconnect within ~60s
result: [pending]

### 3. Webhook + notification fires on camera status change (with 30s debounce)
expected: Force an online→offline transition (kill FFmpeg or block RTSP source) on a non-maintenance camera → wait 30s → in-app notification appears + webhook subscribers receive `camera.offline` POST body with cameraId/status/previousStatus/timestamp. During the 30s window, additional status flaps REPLACE (not duplicate) the pending dispatch.
result: [pending]

### 4. Composite 3-icon Status column visual alignment
expected: Cameras page shows CameraStatusDot + recording Circle + Wrench. Row in maintenance has amber wrench visible; row NOT in maintenance has wrench slot reserved (invisible) — recording dots remain horizontally aligned. Tooltip on hover shows Thai copy per UI-SPEC (ออนไลน์/ออฟไลน์/สัญญาณไม่เสถียร/กำลังเชื่อมต่อ/กำลังเชื่อมต่อใหม่/กำลังบันทึก/ไม่ได้บันทึก/อยู่ในโหมดซ่อมบำรุง — ไม่แจ้งเตือน).
result: [pending]

### 5. Enter maintenance on a running camera → stream stops, webhook NOT dispatched
expected: Row-actions → `เข้าโหมดซ่อมบำรุง` → AlertDialog with destructive-variant button + bold `หยุดสตรีม` body → confirm → stream stops; status=offline; wrench turns amber; toast `กล้อง "..." อยู่ในโหมดซ่อมบำรุงแล้ว`; NO webhook delivered. AuditLog row with action=create, resource=camera, path=/api/cameras/{id}/maintenance is persisted.
result: [pending]

### 6. Exit maintenance → status stays offline, no auto-restart
expected: `ออกจากโหมดซ่อมบำรุง` → dialog default-variant button + bold `สตรีมจะยังไม่เริ่มใหม่โดยอัตโนมัติ` body → confirm → wrench invisible; `maintenanceEnteredAt/By` remain populated in DB (historical); status stays offline; no FFmpeg spawned. Operator must click Start Stream manually.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
