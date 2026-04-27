# Phase 16: User Self-Service - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 16-user-self-service
**Areas discussed:** Account structure & portal scope, Avatar upload & storage, Password change UX, Plan page + contact admin

---

## Account structure & portal scope

### หน้า Account ควรมีใน portal ไหนบ้าง?

| Option | Description | Selected |
|--------|-------------|----------|
| Tenant (/app) เท่านั้น | USER-01/02/03 พูดถึง tenant users. Super admin ไม่มี plan/usage | |
| ทั้ง /app และ /admin | Super admin ก็เปลี่ยนชื่อ/password/avatar ตัวเองได้ แต่ Plan page มีเฉพาะฝั่ง /app | ✓ |
| Shared หน้าเดียว route กลาง | /account ร่วมทั้ง admin และ tenant, Plan page hide เมื่อ super admin | |

**User's choice:** ทั้ง /app และ /admin

### Navigation entry ไป Account?

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar footer dropdown | กดที่ user avatar มุมซ้ายล่าง → เอา Account settings กับ Sign out ไปไว้ด้วยกัน | ✓ |
| Sidebar link + footer dropdown | มีรายการใน sidebar ด้วย และมี shortcut ใน dropdown | |
| Top header user menu | ย้าย user menu ไปที่ header ด้านบน (เปลี่ยน layout) | |

**User's choice:** Sidebar footer dropdown

### Account page layout?

| Option | Description | Selected |
|--------|-------------|----------|
| Single page + sections | หน้าเดียว /app/account แบ่งเป็น sections: Profile, Security, Plan & Usage | ✓ |
| Tabs ในหน้าเดียว | /app/account มี tabs: Profile, Security, Plan | |
| Sub-pages แยก | /app/account, /app/account/security, /app/plan | |

**User's choice:** Single page + sections

### Email change ใน Phase 16?

| Option | Description | Selected |
|--------|-------------|----------|
| Defer — แค่ name+password | ตาม USER-01. Email change ต้อง SMTP + 2 templates + 2-step verify | ✓ |
| รวมใน Phase 16 (full flow) | Better Auth changeEmail ครบสูตร — รวม SMTP wiring | |
| Admin-only path | ให้ Org Admin/Super Admin เปลี่ยน email ให้ user ผ่าน backend | |

**User's choice:** Defer — แค่ name+password
**Notes:** User สอบถาม Better Auth flow ก่อนตัดสินใจ — ได้รับคำอธิบาย 2-step verification (current email confirmation → new email verify) และข้อจำกัดเรื่อง SMTP provider. ตัดสินใจ defer เพราะยังไม่มี SMTP พร้อม.

---

## Avatar upload & storage

### Storage backend ของ avatar?

| Option | Description | Selected |
|--------|-------------|----------|
| MinIO bucket ใหม่ 'avatars' | shared (ไม่ per-org), เก็บ URL ลง user.image, presigned URL | ✓ |
| Base64 data URL เก็บใน DB | เก็บตรงใน user.image. ไม่ต้องพึ่ง MinIO แต่ row ใหญ่ขึ้น | |
| MinIO bucket 'org-{orgId}' | reuse recordings bucket, key prefix avatars/ | |

**User's choice:** MinIO bucket ใหม่ 'avatars'

### Size & format limits?

| Option | Description | Selected |
|--------|-------------|----------|
| ≤ 2MB, JPEG/PNG/WebP | เพียงพอสำหรับ avatar. Server transcode เป็น WebP 256×256 | ✓ |
| ≤ 5MB, JPEG/PNG/WebP/GIF | รองรับ GIF ด้วย, ขนาดใหญ่ขึ้น | |
| ≤ 500KB, JPEG/PNG | เข้มงวด — เหมาะเก็บ base64 ใน DB | |

**User's choice:** ≤ 2MB, JPEG/PNG/WebP

### Crop UX?

| Option | Description | Selected |
|--------|-------------|----------|
| ไม่มี crop, server resize 256×256 | upload ตรง — backend resize/center-crop ด้วย sharp | ✓ |
| Client-side crop | modal zoom/crop ก่อน upload | |
| Upload ตรง ไม่แตะ ไม่ resize | ปล่อยไฟล์เดิม — display ด้วย CSS object-fit | |

**User's choice:** ไม่มี crop, server resize 256×256

### มีปุ่มลบ avatar (กลับไปเป็น initials)?

| Option | Description | Selected |
|--------|-------------|----------|
| มี | ปุ่ม 'Remove avatar' → ลบไฟล์ MinIO + user.image = null → initials | ✓ |
| ไม่มี | ต้อง upload ทับเท่านั้น | |

**User's choice:** มี

---

## Password change UX

### บังคับกรอก current password?

| Option | Description | Selected |
|--------|-------------|----------|
| บังคับ | ป้องกัน session hijack. Better Auth changePassword รองรับ field อยู่แล้ว | ✓ |
| ไม่บังคับ | เชื่อ session ล้วน — UX เร็วขึ้น แต่ลด security | |

**User's choice:** บังคับ

### Password policy ขั้นต่ำ?

| Option | Description | Selected |
|--------|-------------|----------|
| ≥ 8 ตัว ไม่บังคับ mixed case | Better Auth default. เรียบง่าย — เพียงพอสำหรับ B2B | ✓ |
| ≥ 12 ตัว + mixed case + ตัวเลข | เข้มงวดขึ้น — ต้อง custom validator | |
| ≥ 8 ตัว + check HIBP breach | เช็ค Have I Been Pwned — block รหัสที่รั่วไหล | |

**User's choice:** ≥ 8 ตัว ไม่บังคับ mixed case

### Strength indicator ระหว่างพิมพ์?

| Option | Description | Selected |
|--------|-------------|----------|
| มี (zxcvbn simple bar) | 3-level bar (weak/medium/strong) | ✓ |
| ไม่มี | validate rule ตอน submit อย่างเดียว | |
| Rule checklist | แสดง checkbox list ตาม rule | |

**User's choice:** มี (zxcvbn simple bar)

### หลังเปลี่ยนสำเร็จ ทำยังไงกับ session?

| Option | Description | Selected |
|--------|-------------|----------|
| Revoke session อื่นๆ คง current | Better Auth revokeOtherSessions. เครื่องอื่นถูก logout อัตโนมัติ | ✓ |
| ไม่แตะ session | ทุก session รวม current ใช้ได้ต่อ | |
| ถาม user (checkbox) | 'Sign out other devices' checkbox | |

**User's choice:** Revoke session อื่นๆ คง current

---

## Plan page + contact admin

### แสดง limit/usage ตัวไหนบ้าง?

| Option | Description | Selected |
|--------|-------------|----------|
| 4 limit ตาม Package (cameras/viewers/bandwidth/storage) | ตรง schema 100% แต่ไม่มี API calls (ขัด ROADMAP) | |
| เฉพาะที่ USER-03 (cameras/storage/API calls) | ตรง success criteria แต่ API calls ไม่มี max field | |
| ครบชุด (4 Package limit + API calls + features) | ตัวเลือกที่ Claude แนะนำหลัง user ขอให้อธิบาย — user เลือก | ✓ |

**User's choice:** ครบชุด (Claude recommendation หลังอธิบาย)
**Notes:** User สอบถามว่าแต่ละตัวเลือกต่างกันยังไง. Claude อธิบาย: ROADMAP success criteria พูดถึง "cameras, storage, API calls" แต่ Package schema ไม่มี maxApiCalls. แนะนำครบชุดเพื่อให้ user เห็นภาพรวม — API calls แสดง count ไม่มี max, features แสดง ✓/✗.

### Usage timeframe?

| Option | Description | Selected |
|--------|-------------|----------|
| Current (cameras/storage) + MTD (API calls) | cameras/storage = ค่าปัจจุบัน, API calls = month-to-date | ✓ |
| วันนี้ทั้งหมด | API calls today — ไม่สะท้อน quota billing cycle | |
| Total all-time | ยอดรวมตั้งแต่เริ่มใช้ | |

**User's choice:** Current + MTD

### Usage freshness?

| Option | Description | Selected |
|--------|-------------|----------|
| On-demand query ตอนโหลด | Query DB ตอน load. ไม่ cache | ✓ |
| Cached 5 min (Redis) | ลด DB load ถ้าเข้าหน้าบ่อย + invalidation complexity | |
| Real-time Socket.IO | live — overkill | |

**User's choice:** On-demand query

### Contact admin เพื่อ upgrade?

| Option | Description | Selected |
|--------|-------------|----------|
| Mailto link ไป support email | ปุ่ม Request upgrade → mailto prefilled | |
| ปุ่มเปิด support ticket | สร้าง ticket modal ใน DB — เกิน scope | |
| แค่ข้อความ info ไม่มีปุ่ม | แสดง 'Contact your admin' plain text | ✓ |

**User's choice:** แค่ข้อความ info ไม่มีปุ่ม

---

## Claude's Discretion

- Toast/notification wording
- Avatar upload component styling (dropzone vs button)
- Progress bar color thresholds (green/yellow/red at what %)
- Form spacing and section ordering within the page
- Error state designs

## Deferred Ideas

- Email change (defer out of phase — needs SMTP)
- Self-serve upgrade / checkout flow (out of scope per PROJECT.md)
- Support ticket system
- Active sessions list / individual revoke
- 2FA / passkey
- Client-side avatar crop UI
- maxApiCallsPerMonth field in Package schema
