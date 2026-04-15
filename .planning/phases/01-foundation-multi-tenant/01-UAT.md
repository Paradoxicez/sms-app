---
status: partial
phase: 01-foundation-multi-tenant
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md]
started: 2026-04-15T00:00:00Z
updated: 2026-04-15T19:15:00Z
---

## Current Test

[testing paused — 1 blocked, 1 skipped]

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
result: pass

### 5. จัดการแพคเกจ (Packages)
expected: ไปที่ /admin/packages เห็นตารางแพคเกจพร้อม limits (cameras/viewers/bandwidth/storage) สามารถสร้างแพคเกจใหม่และเปิด/ปิด feature toggles (recordings/webhooks/map/auditLog/apiKeys) ได้
result: pass

### 6. RLS Tenant Isolation
expected: ใช้ API เรียกข้อมูลด้วย user จาก org A ไม่เห็นข้อมูล Member/Invitation ของ org B — ข้อมูลแยกกันสมบูรณ์ระหว่าง tenant
result: pass

### 7. Feature Toggle — Backend Enforcement
expected: GET /api/features/check?key=recordings ตอบกลับ feature map ตามแพคเกจ endpoint ที่ใช้ @RequireFeature decorator จะตอบ 403 เมื่อ feature ปิด
result: pass

### 8. Feature Toggle — Frontend Gating
expected: Component ที่ใช้ useFeatures hook แสดง/ซ่อนส่วน UI ตามสถานะ feature ขององค์กร เช่น ถ้าปิด recordings จะไม่เห็นเมนู/ปุ่มที่เกี่ยวข้อง
result: pass
resolved: "2026-04-15 UAT Group B — portal shell 999.1 shipped. Flipped recordings=false on Test Org's package, Operator saw Recordings link disappear from TenantNav and /app/recordings render the feature-gate empty state."

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
