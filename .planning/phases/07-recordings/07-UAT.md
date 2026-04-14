---
status: complete
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
result: blocked
blocked_by: server
reason: "ยังไม่ทดลองบันทึกเพราะ stream ยังใช้ไม่ได้"

### 9. Feature Gate — แท็บ Recordings
expected: สำหรับ org ที่ปิด feature recordings แท็บ Recordings จะแสดงข้อความแนะนำอัปเกรดแทนที่จะแสดง UI บันทึกเต็ม
result: skipped
reason: "อยู่ใน super admin ไม่สามารถทดสอบ feature gate ได้"

## Summary

total: 9
passed: 5
issues: 2
pending: 0
skipped: 1
blocked: 1

## Gaps

- truth: "ปุ่ม Start Recording กดแล้วเริ่มบันทึก ปุ่มเปลี่ยนเป็น Stop"
  status: failed
  reason: "User reported: กดแล้วไม่มีอะไรเกิดขึ้น"
  severity: major
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "กด Save จะอัปเดตนโยบาย retention สำหรับกล้องนั้น"
  status: failed
  reason: "User reported: Failed to update retention policy."
  severity: major
  test: 7
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
