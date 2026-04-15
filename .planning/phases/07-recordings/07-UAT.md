---
status: diagnosed
phase: 07-recordings
source: [07-00-SUMMARY.md, 07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md]
started: 2026-04-14T10:00:00Z
updated: 2026-04-14T11:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: ปิด server/service ทั้งหมด แล้วรัน `docker compose up` และ `pnpm dev` ใหม่ตั้งแต่ต้น Server บูทได้ไม่มี error, Prisma migration รันผ่าน (รวม model Recording ใหม่), MinIO service ขึ้นที่ port 9000/9001, และ web app โหลด dashboard ได้ปกติ
result: pass

### 2. Sidebar Navigation — รายการ Recordings
expected: ที่ sidebar ใต้กลุ่ม "Monitoring" มีรายการ "Recordings" พร้อมไอคอน Film ปรากฏ กดแล้วไปหน้า /admin/recordings
result: pass

### 3. แท็บ Recordings ในหน้ารายละเอียดกล้อง
expected: เปิดหน้ารายละเอียดกล้องใดก็ได้ มีแท็บที่ 6 ชื่อ "Recordings" กดแล้วแสดงแผง recordings ที่มีปฏิทิน, timeline bar, พื้นที่ HLS player, และปุ่มควบคุมการบันทึก
result: pass

### 4. ปุ่มควบคุมการบันทึก — Start/Stop
expected: ในแท็บ Recordings มีปุ่ม Start Recording กดแล้วเริ่มบันทึก (ปุ่มเปลี่ยนเป็น Stop) มี progress bar แสดงการใช้พื้นที่จัดเก็บ กด Stop จะหยุดบันทึก
result: issue
reported: "กดแล้วไม่มีอะไรเกิดขึ้น"
severity: major

### 5. Timeline Bar — แถบเวลา 24 ชั่วโมง
expected: Timeline bar แสดงแถบแนวนอน 24 ชั่วโมง ช่วงที่มีการบันทึกแสดงเป็นบล็อกสี ลากเมาส์บน timeline เพื่อเลือกช่วงเวลาสำหรับเล่นย้อนหลัง
result: pass

### 6. Schedule Dialog — ตั้งตารางบันทึก
expected: กดปุ่มตั้งตารางจะเปิด dialog ที่มีตัวเลือก daily/weekly/custom พร้อมช่องกรอกเวลา กด Save จะสร้างตารางบันทึกอัตโนมัติ
result: pass

### 7. Retention Settings — ตั้งค่าการเก็บรักษา
expected: ส่วนตั้งค่า retention สามารถกำหนดจำนวนวันเก็บรักษาต่อกล้อง กด Save จะอัปเดตนโยบาย retention สำหรับกล้องนั้น
result: issue
reported: "Failed to update retention policy."
severity: major

### 8. หน้า Recordings Admin
expected: ไปที่ /admin/recordings แสดงตารางรายการบันทึกที่มีคอลัมน์ชื่อกล้อง, วันที่, สถานะ, ความยาว มีตัวกรองกล้อง/ช่วงวันที่/สถานะ และมีปุ่มลบแบบ bulk
result: pass
resolved: "2026-04-16 UAT Group C+ — after full stream pipeline fixes (SRS conf, FFmpeg lifecycle, HLS preview, BigInt serializer, host bind mount for srs_hls), Start Recording → Stop Recording produces a row with correct size (MB) and duration (seconds formatted). Filters + bulk delete present per UI-SPEC."
reason: "ยังไม่ทดลองบันทึกเพราะ stream ยังใช้ไม่ได้"

### 9. Feature Gate — แท็บ Recordings
expected: สำหรับ org ที่ปิด feature recordings แท็บ Recordings จะแสดงข้อความแนะนำอัปเกรดแทนที่จะแสดง UI บันทึกเต็ม
result: pass
resolved: "2026-04-15 UAT Group B — tested from Operator in tenant portal (/app/recordings) after flipping recordings=false on Test Org's package. Feature-gate empty state rendered, no crash."

## Summary

total: 9
passed: 7
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "ปุ่ม Start Recording กดแล้วเริ่มบันทึก ปุ่มเปลี่ยนเป็น Stop"
  status: failed
  reason: "User reported: กดแล้วไม่มีอะไรเกิดขึ้น"
  severity: major
  test: 4
  root_cause: "FeatureGuard blocks all RecordingsController endpoints (403) because org has no Package assigned. Frontend useFeatureCheck calls non-existent /api/features/check endpoint, defaults to enabled:true on error, so UI renders but API calls fail silently — catch block in handleStart swallows errors without user feedback."
  artifacts:
    - path: "apps/web/src/app/admin/cameras/components/recording-controls.tsx"
      issue: "handleStart/handleStop catch blocks silently discard errors (lines 57, 72)"
    - path: "apps/web/src/hooks/use-feature-check.ts"
      issue: "Calls non-existent /api/features/check endpoint, defaults to enabled:true (line 24, 33)"
    - path: "apps/api/src/features/features.controller.ts"
      issue: "Missing /api/features/check endpoint — only has /api/organizations/:orgId/features"
  missing:
    - "Add error feedback to recording-controls.tsx catch blocks (toast or error state)"
    - "Create /api/features/check endpoint OR fix useFeatureCheck to use existing endpoint"
    - "Seed a Package with recordings:true for dev environment"
    - "Fix storage quota response field name mismatch (usageBytes vs usedBytes)"
  debug_session: ""

- truth: "กด Save จะอัปเดตนโยบาย retention สำหรับกล้องนั้น"
  status: failed
  reason: "User reported: Failed to update retention policy."
  severity: major
  test: 7
  root_cause: "Same FeatureGuard issue as test 4 — @RequireFeature(FeatureKey.RECORDINGS) at class level on RecordingsController blocks PUT /api/recordings/camera/:cameraId/retention with 403 because org has no Package with recordings feature enabled."
  artifacts:
    - path: "apps/api/src/recordings/recordings.controller.ts"
      issue: "Class-level @RequireFeature(FeatureKey.RECORDINGS) gates all endpoints (line 31)"
    - path: "apps/api/src/features/features.guard.ts"
      issue: "Throws ForbiddenException when feature not enabled (lines 50-58)"
  missing:
    - "Seed a Package with recordings:true and assign to org"
    - "Fix useFeatureCheck to accurately reflect feature state"
  debug_session: ""
