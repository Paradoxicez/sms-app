---
status: partial
phase: 01-foundation-multi-tenant
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md]
started: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold-Start Smoke Test
expected: ปิด server ทั้งหมด แล้วรัน `docker-compose up -d` และ `npm run dev` ใหม่จาก scratch เปิด http://localhost:3000 (frontend) และ http://localhost:3001/api (backend) ทั้งคู่ตอบสนองได้ Database migration/seed สำเร็จ ไม่มี error ใน console
result: pass

### 2. หน้า Sign-In แสดงและเข้าสู่ระบบได้
expected: เปิด http://localhost:3000/sign-in เห็นฟอร์มล็อกอินกับปุ่มสีเขียว "Sign In" กรอก email/password ที่ seed ไว้แล้วเข้าสู่ระบบสำเร็จ redirect ไปหน้า admin
result: pass

### 3. Admin Panel — Sidebar และ Layout
expected: เข้าสู่ระบบด้วย superadmin แล้วเปิด /admin เห็น sidebar สีเขียวกับเมนู Organizations, Packages, Users และเนื้อหาหลักแสดงถูกต้อง
result: pass

### 4. จัดการองค์กร (Organizations)
expected: ไปที่ /admin/organizations เห็นตารางรายการองค์กร สามารถสร้าง organization ใหม่ได้ (slug auto-generate) และสามารถ deactivate/activate ได้
result: issue
reported: "Failed to create organization"
severity: major

### 5. จัดการแพคเกจ (Packages)
expected: ไปที่ /admin/packages เห็นตารางแพคเกจพร้อม limits (cameras/viewers/bandwidth/storage) สามารถสร้างแพคเกจใหม่และเปิด/ปิด feature toggles (recordings/webhooks/map/auditLog/apiKeys) ได้
result: pass

### 6. RLS Tenant Isolation
expected: ใช้ API เรียกข้อมูลด้วย user จาก org A ไม่เห็นข้อมูล Member/Invitation ของ org B — ข้อมูลแยกกันสมบูรณ์ระหว่าง tenant
result: skipped
reason: สร้าง org ใหม่ไม่ได้ (ข้อ 4 fail) ไม่มี org B สำหรับทดสอบ — integration test ผ่านอยู่แล้ว

### 7. Feature Toggle — Backend Enforcement
expected: GET /api/organizations/:orgId/features ตอบกลับ feature map ตามแพคเกจ endpoint ที่ใช้ @RequireFeature decorator จะตอบ 403 เมื่อ feature ปิด
result: pass

### 8. Feature Toggle — Frontend Gating
expected: Component ที่ใช้ useFeatures hook แสดง/ซ่อนส่วน UI ตามสถานะ feature ขององค์กร เช่น ถ้าปิด recordings จะไม่เห็นเมนู/ปุ่มที่เกี่ยวข้อง
result: blocked
blocked_by: other
reason: "หน้า package ไม่มี UI สำหรับ edit package — ต้องปิด feature แล้วดูว่า UI ซ่อนหรือไม่ แต่แก้ package ไม่ได้"

## Summary

total: 8
passed: 5
issues: 1
pending: 0
skipped: 1
blocked: 1

## Gaps

- truth: "สามารถสร้าง organization ใหม่ได้จากหน้า /admin/organizations"
  status: failed
  reason: "User reported: Failed to create organization"
  severity: major
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
