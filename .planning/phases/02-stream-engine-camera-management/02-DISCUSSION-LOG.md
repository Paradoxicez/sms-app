# Phase 2: Stream Engine & Camera Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 02-stream-engine-camera-management
**Areas discussed:** Camera hierarchy & CRUD, FFmpeg process management, SRS integration & HLS delivery, Stream engine UI settings

---

## Camera Hierarchy & CRUD

| Option | Description | Selected |
|--------|-------------|----------|
| บังคับ hierarchy เต็ม | ต้องสร้าง Project > Site ก่อน แล้วค่อยเพิ่มกล้องใน Site | ✓ |
| Site เป็น optional | กล้องอยู่ใน Project ได้เลย ถ้ามี Site ก็จัดกลุ่มเพิ่มได้ | |
| Flat + tags | ไม่มี hierarchy — กล้องทั้งหมดอยู่ใน org, ใช้ tags จัดกลุ่มแทน | |

**User's choice:** บังคับ hierarchy เต็ม
**Notes:** เหมาะกับการจัดระเบียบ CCTV ตาม location จริง

### Bulk Import

| Option | Description | Selected |
|--------|-------------|----------|
| CSV + JSON upload | Upload ไฟล์ CSV หรือ JSON, preview ผลก่อน import, แสดง validation errors ต่อแถว | ✓ |
| CSV only | รองรับแค่ CSV | |
| API batch endpoint | POST array of cameras via API — ไม่มี file upload UI | |

**User's choice:** CSV + JSON upload
**Notes:** แสดง dialog ขนาดกลางเป็นตารางกล้อง พร้อมแก้ไขรายละเอียดเพิ่มเติมได้ก่อน confirm. Import ก่อนแล้ว test connection ทีหลังเป็น background job

### Test Connection

| Option | Description | Selected |
|--------|-------------|----------|
| บังคับก่อน save | ffprobe ต้อง pass ก่อนถึงจะ save ได้ | |
| Optional — ปุ่มแยก | มีปุ่ม 'Test Connection' แยกจาก Save | ✓ |
| Test แล้ว warn | ทดสอบอัตโนมัติ ถ้าไม่ผ่านแสดง warning แต่ยัง save ได้ | |

**User's choice:** Optional — ปุ่มแยก

### Camera Fields

| Option | Description | Selected |
|--------|-------------|----------|
| ตาม requirement เดิม | Required: name, stream URL. Optional: location, tags, description | ✓ |
| เพิ่ม model/brand | เพิ่มฟิลด์ manufacturer, model | |
| Claude ตัดสินใจ | ให้ Claude ออกแบบ schema | |

**User's choice:** ตาม requirement เดิม (CAM-01)

### Camera Status

| Option | Description | Selected |
|--------|-------------|----------|
| 5 states ตาม CAM-04 | online, offline, degraded, connecting, reconnecting | ✓ |
| เพิ่ม error state | เพิ่ม 'error' สำหรับกรณี auth failed, codec incompatible | |
| เพิ่ม disabled state | เพิ่ม 'disabled' สำหรับกล้องที่ปิดใช้งานชั่วคราว | |

**User's choice:** 5 states ตาม CAM-04

---

## FFmpeg Process Management

| Option | Description | Selected |
|--------|-------------|----------|
| BullMQ job queue | แต่ละกล้องเป็น job ใน Redis queue — persist across restart, retry, status tracking | ✓ |
| In-process (Map + child_process) | เก็บ FFmpeg PID ใน Map ใน memory — ง่ายกว่า แต่หายหมดเมื่อ restart | |
| PM2/systemd per camera | แต่ละ FFmpeg เป็น managed process แยกจาก NestJS | |

**User's choice:** BullMQ job queue

### Auto-reconnect

| Option | Description | Selected |
|--------|-------------|----------|
| Exponential backoff + max retries | 1s, 2s, 4s, 8s... จนถึง max แล้วหยุด, เปลี่ยน status เป็น offline | ✓ |
| Exponential ไม่จำกัด retry | พยายาม reconnect ไปเรื่อยๆ ไม่หยุด | |
| Claude ตัดสินใจ | | |

**User's choice:** Exponential backoff + max retries

### H.265 Handling

**User's choice:** Auto-detect + transcode (Claude recommended)
**Notes:** ffprobe ตรวจ codec ตอน register → เก็บ flag needsTranscode → ตอน start stream ถ้าเป็น H.265 ใช้ -c:v libx264 แทน -c:v copy อัตโนมัติ. เหตุผล: browser compatibility (H.265 HLS เล่นได้แค่บาง browser), ตรง STREAM-06, developer ไม่ต้องคิดเรื่อง codec

---

## SRS Integration & HLS Delivery

### Stream Profiles

**User's choice:** Custom ได้หมด แต่กำกับ validation ว่าอะไรทำได้/ไม่ได้
**Notes:** ถ้า user custom settings ที่ไม่สอดคล้องกับระบบ (e.g., unsupported codec, resolution สูงกว่า source) ให้แสดง warning

### SRS Callbacks

**User's choice:** ใช้ทั้ง 6 ตัวตั้งแต่แรก (Claude recommended)
**Notes:** Config SRS ครั้งเดียว — on_publish/on_unpublish ใช้จริงทันที, on_play/on_stop นับ viewers, on_hls/on_dvr แค่ log ไว้ก่อน (ใช้จริง Phase 7)

### WebRTC (WHEP)

**User's choice:** Implement ใน Phase 2 (Claude recommended)
**Notes:** Effort น้อย — แค่เปิด port 8000/udp + expose WHEP endpoint URL

### Internal Preview vs External API

**User's choice:** แยกกัน — internal ใช้ session auth + backend proxy, external (Phase 3) ใช้ JWT token (Claude recommended)
**Notes:** User ถามว่า preview ใน platform กับ API ภายนอกจัดการเหมือนกันหรือไม่ — ตอบว่าแยก security layer

---

## Stream Engine UI Settings

### Settings UI

**User's choice:** Form-based settings page
**Notes:** UI ใช้คำว่า "Stream Engine" ไม่เอ่ยถึง "SRS" โดยตรง — abstract implementation detail

### Access Level

**User's choice:** Two-tier settings model
**Notes:** User ถามเรื่องผลกระทบของ Admin per org → อธิบายว่า SRS เป็น shared resource (1 srs.conf) จึงแยกเป็น:
- System-level (super admin): HLS config, ports, timeouts
- Per-org (org admin): default stream profile, max reconnect, auto-start, recording mode, webhook preferences

### Camera Status UI

| Option | Description | Selected |
|--------|-------------|----------|
| WebSocket real-time | Socket.IO push status change ทันที | ✓ |
| Polling ทุก 10s | ง่ายกว่า แต่ไม่ real-time | |
| SSE (Server-Sent Events) | ง่ายกว่า WebSocket, one-way push | |

**User's choice:** WebSocket real-time

---

## Claude's Discretion

- Prisma schema design for Project, Site, Camera, StreamProfile, OrgSettings tables
- BullMQ queue naming and job structure
- FFmpeg command construction
- Socket.IO room strategy
- SRS srs.conf template structure
- Backend proxy for internal HLS preview
- Error handling patterns

## Deferred Ideas

None — discussion stayed within phase scope
