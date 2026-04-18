# Requirements: SMS Platform

**Defined:** 2026-04-18
**Core Value:** Developers can get a secure HLS playback URL for any registered camera via a single API call, and embed it on their website immediately.

## v1.2 Requirements

Requirements for v1.2 milestone. Each maps to roadmap phases.

### FFmpeg Resilience

- [ ] **RESIL-01**: System auto-reconnects all FFmpeg streams when SRS container restarts
- [ ] **RESIL-02**: Health check loop ตรวจสอบ FFmpeg process + SRS streams ทุก 60 วินาที
- [ ] **RESIL-03**: User ได้รับ notification + webhook เมื่อ camera status เปลี่ยน
- [ ] **RESIL-04**: FFmpeg processes ถูก shutdown อย่าง graceful เมื่อ server restart และ re-enqueue ตอน boot

### Camera Management

- [ ] **CAM-01**: User สามารถสลับ camera เป็น maintenance mode ได้ (suppress notifications/webhooks)
- [ ] **CAM-02**: Camera table แสดง 3 status icons: online/offline, recording, maintenance
- [ ] **CAM-03**: Camera quick actions menu มีตัวเลือก Maintenance

### Recording

- [ ] **REC-01**: User สามารถเล่น recording ผ่าน HLS player ในหน้า playback ได้
- [ ] **REC-02**: หน้า playback มี timeline scrubber (24h bar) สำหรับ click-to-seek
- [ ] **REC-03**: Timeline แสดง hour availability heatmap (ช่วงที่มี/ไม่มี footage)

### User Self-Service

- [ ] **USER-01**: User เปลี่ยนชื่อและ password ได้เองในหน้า Account
- [ ] **USER-02**: User upload avatar ได้
- [ ] **USER-03**: User ดู plan ปัจจุบัน, usage/limits ได้ในหน้า Plan (view-only)

### UI Polish

- [ ] **UI-01**: DataTable migration: Admin org > Team page
- [ ] **UI-02**: DataTable migration: Super admin > Organizations page
- [ ] **UI-03**: DataTable migration: Super admin > Cluster Nodes page
- [ ] **UI-04**: DataTable migration: Super admin > Platform Audit page
- [ ] **UI-05**: Dashboard org admin + super admin ปรับข้อมูลให้เหมาะสม
- [ ] **UI-06**: Map thumbnail popup + pin design ปรับให้สวยขึ้น

### Bug Fixes

- [ ] **FIX-01**: Super admin สามารถสร้าง user ให้ system org ได้
- [ ] **FIX-02**: API Key copy ได้ key จริง (ไม่ใช่ masked version)
- [ ] **FIX-03**: API Key delete ทำงานได้

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### User Self-Service

- **USER-04**: User เปลี่ยน email ได้ (ต้อง verify ใหม่)

### FFmpeg Resilience

- **RESIL-05**: FFmpeg stderr parsing สำหรับ proactive degradation detection

### Recording

- **REC-04**: Timeline zoom levels (6h, 1h views)
- **REC-05**: Cross-camera timeline view สำหรับ incident investigation

### Camera Management

- **CAM-04**: Scheduled maintenance windows (auto-enter/exit maintenance)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Frame-level seeking with thumbnail sprites | Significant infrastructure (sprite sheet generation), defer to v2+ |
| ABR multi-rendition streaming | Requires transcoding pipeline redesign, SRS limitation |
| Self-service plan upgrade/billing | Billing explicitly out of scope per PROJECT.md |
| User self-registration | B2B model requires admin-creates-user |
| Real-time frame-by-frame seeking | Over-engineering for v1.2, 2s HLS segment granularity sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIX-01 | Phase 14 | Pending |
| FIX-02 | Phase 14 | Pending |
| FIX-03 | Phase 14 | Pending |
| UI-01 | Phase 14 | Pending |
| UI-02 | Phase 14 | Pending |
| UI-03 | Phase 14 | Pending |
| UI-04 | Phase 14 | Pending |
| RESIL-01 | Phase 15 | Pending |
| RESIL-02 | Phase 15 | Pending |
| RESIL-03 | Phase 15 | Pending |
| RESIL-04 | Phase 15 | Pending |
| CAM-01 | Phase 15 | Pending |
| CAM-02 | Phase 15 | Pending |
| CAM-03 | Phase 15 | Pending |
| USER-01 | Phase 16 | Pending |
| USER-02 | Phase 16 | Pending |
| USER-03 | Phase 16 | Pending |
| REC-01 | Phase 17 | Pending |
| REC-02 | Phase 17 | Pending |
| REC-03 | Phase 17 | Pending |
| UI-05 | Phase 18 | Pending |
| UI-06 | Phase 18 | Pending |

**Coverage:**
- v1.2 requirements: 22 total
- Mapped to phases: 22/22
- Unmapped: 0

---
*Requirements defined: 2026-04-18*
*Last updated: 2026-04-18 after roadmap creation*
