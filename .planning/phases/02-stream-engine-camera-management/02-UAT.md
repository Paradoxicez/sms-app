---
status: partial
phase: 02-stream-engine-camera-management
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md, 02-06-SUMMARY.md]
started: 2026-04-15T19:20:00Z
updated: 2026-04-15T20:30:00Z
---

## Current Test

[testing paused — 3 issues need debug session]

## Tests

### 1. Camera CRUD
expected: สร้าง/แก้ไข/ลบ Project > Site > Camera hierarchy ได้
result: pass

### 2. Test Connection
expected: กดปุ่ม Test Connection เห็นผลลัพธ์ ffprobe แสดง codec, resolution, FPS
result: pass

### 3. Stream Start/Stop
expected: กดปุ่ม Start Stream สถานะเปลี่ยน offline → connecting → online กดปุ่ม Stop หยุด stream ได้
result: issue
reported: "Stream start API works, FFmpeg spawns, SRS receives stream, but status stuck at connecting — SRS callback not reaching API. Multiple issues: BullMQ jobId colon, hardcoded srs hostname, SRS callback URL pointing to Docker internal network, FFmpeg service await blocks job completion"
severity: major

### 4. Real-time Status Updates
expected: Camera list แสดง status badge อัพเดทแบบ real-time ผ่าน Socket.IO
result: issue
reported: "Depends on stream start working correctly — status stuck at connecting because SRS on_publish callback not reaching API"
severity: major

### 5. HLS Video Preview
expected: Camera detail เห็น video player แสดง live stream ผ่าน hls.js
result: issue
reported: "SRS receives stream data but HLS playback fails because stream never transitions to online status"
severity: major

### 6. Projects & Sites Management
expected: Projects CRUD พร้อม site hierarchy, breadcrumb navigation
result: pass

### 7. Stream Profiles CRUD
expected: สร้าง/แก้ไข stream profiles เลือก codec, resolution, FPS, bitrate
result: pass

### 8. Stream Engine Settings
expected: แก้ค่า HLS fragment/window, timeouts บันทึกแล้ว SRS config regenerate
result: pass

### 9. Bulk Camera Import
expected: อัพโหลด CSV/JSON/Excel เห็นตาราง preview แก้ไขได้ พร้อม validation
result: pass

### 10. Camera Status Filtering
expected: กรอง filter ตาม status (offline/online/degraded) ผ่าน popover dropdown
result: pass

### 11. Stream Profile Assignment
expected: เลือก assign stream profile ให้กล้องผ่าน dropdown ใน Profile tab
result: pass

## Summary

total: 11
passed: 8
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Stream transitions from connecting to online when SRS receives the RTMP push"
  status: failed
  reason: "SRS callback URL was hardcoded to Docker internal network (api:3001). Fixed to host.docker.internal:3003 but FFmpeg service await pattern blocks BullMQ job completion. Multiple fixes applied (jobId colon, SRS_HOST env, callback URL) but FFmpeg lifecycle needs redesign."
  severity: major
  test: 3
  root_cause: "1) BullMQ jobId contained colon (fixed). 2) FFmpeg pushed to rtmp://srs:1935 Docker hostname (fixed). 3) SRS callbacks pointed to api:3001 Docker network (fixed). 4) FFmpeg service startStream() awaits process end, blocking BullMQ job (needs redesign)"
  artifacts:
    - path: "apps/api/src/streams/ffmpeg/ffmpeg.service.ts"
      issue: "startStream() returns Promise that resolves on FFmpeg end, not start — blocks BullMQ job"
    - path: "apps/api/src/streams/processors/stream.processor.ts"
      issue: "await ffmpegService.startStream() blocks until FFmpeg exits"
  missing:
    - "Change FFmpeg service to resolve promise on 'start' event, not 'end' event"
    - "Add separate error/end handlers for reconnection logic"
  debug_session: ""
