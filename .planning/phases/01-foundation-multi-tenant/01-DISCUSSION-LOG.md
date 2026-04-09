# Phase 1: Foundation & Multi-Tenant - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 01-foundation-multi-tenant
**Areas discussed:** Role & Permission Design, Package & Limits Model, Super Admin, User Onboarding & Org Membership

---

## Role & Permission Design

### Role Responsibilities

| Option | Description | Selected |
|--------|-------------|----------|
| แบ่งตามหน้าที่ (แนะนำ) | Admin = จัดการทุกอย่างใน Org, Operator = จัดการกล้อง/สตรีม, Developer = API key/เชื่อมต่อ, Viewer = ดู stream | ✓ |
| แบ่งเองแบบอื่น | มีไอเดียเรื่องการแบ่ง Role ที่ต่างออกไป | |
| Claude ตัดสินใจ | ให้ Claude ออกแบบ permission ตาม best practice | |

**User's choice:** แบ่งตามหน้าที่

### Permission Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| แบ่งตาม Role เท่านั้น | สิทธิ์ติดกับ Role ตายตัว — ง่ายและชัดเจน | |
| แบ่งละเอียด (granular) | Permission แต่ละตัว เช่น camera.create, camera.delete — ยืดหยุ่นแต่ซับซ้อน | |
| Role + custom override | Role เป็น template สิทธิ์เริ่มต้น + Admin ปรับเพิ่ม/ถอนสิทธิ์เฉพาะคนได้ | ✓ |

**User's choice:** Role + custom override

---

## Package & Limits Model

### Data Storage

| Option | Description | Selected |
|--------|-------------|----------|
| ตารางแยก (แนะนำ) | ตาราง packages แยก มีลิมิตเป็น column ชัดเจน | ✓ |
| JSONB ใน Org | เก็บลิมิตเป็น JSONB field ใน organizations — ยืดหยุ่นแต่เพิ่มลิมิตใหม่ง่าย | |
| ตาราง + JSONB ผสม | ลิมิตหลักเป็น column, feature toggles เป็น JSONB | |

**User's choice:** ตารางแยก

### Feature Toggle

| Option | Description | Selected |
|--------|-------------|----------|
| JSONB ใน Package (แนะนำ) | features: {recordings: true, webhooks: true, map: false} — เพิ่ม feature ใหม่ได้โดยไม่ต้อง migrate | ✓ |
| ตารางแยก | ตาราง feature_toggles แยกออก (package_id, feature_name, enabled) | |
| Claude ตัดสินใจ | ให้ Claude เลือกแบบที่เหมาะสม | |

**User's choice:** JSONB ใน Package

### Package Presets

| Option | Description | Selected |
|--------|-------------|----------|
| 3 แพ็คเกจ (แนะนำ) | Basic / Pro / Enterprise — ครอบคลุม use case | |
| Custom เท่านั้น | Super admin สร้าง package เองได้อิสระ ไม่มี preset | ✓ |
| Preset + Custom | 3 preset เป็นค่าเริ่มต้น + Super admin สร้างเพิ่มได้ | |

**User's choice:** Custom เท่านั้น

---

## Super Admin

### Capabilities

| Option | Description | Selected |
|--------|-------------|----------|
| จัดการทั้งหมด (แนะนำ) | CRUD Org, กำหนด Package, สร้าง/ลบผู้ใช้ทุก Org, ดู Org ไหนก็ได้, ตั้งค่าระบบ | |
| แค่ Org + Package | CRUD Org และ Package เท่านั้น ไม่เข้าไปยุ่งข้อมูลภายใน Org | ✓ |
| แบ่งเองแบบอื่น | อยากอธิบายแบบอื่น | |

**User's choice:** แค่ Org + Package

### Structure

| Option | Description | Selected |
|--------|-------------|----------|
| แยกออกจาก Org (แนะนำ) | Super admin ไม่อยู่ใน Org ไหน เข้าระบบแยกต่างหาก | |
| อยู่ใน Org พิเศษ | Super admin อยู่ใน Org ที่ชื่อ "System" และสามารถ impersonate เข้า Org อื่นได้ | ✓ |

**User's choice:** อยู่ใน Org พิเศษ

### UI

| Option | Description | Selected |
|--------|-------------|----------|
| หน้าแยกต่างหาก (แนะนำ) | Super admin เข้า URL /admin เฉพาะ เห็นรายการ Org/Package/User ทั้งหมด | ✓ |
| ใช้หน้าเดียวกัน | Super admin ใช้ sidebar เดียวกับ user ทั่วไป แต่มีเมนูเพิ่ม | |
| Claude ตัดสินใจ | ให้ Claude ออกแบบ UI ที่เหมาะสม | |

**User's choice:** หน้าแยกต่างหาก

---

## User Onboarding & Org Membership

### Joining Method

| Option | Description | Selected |
|--------|-------------|----------|
| Invitation ทาง email (แนะนำ) | Admin ส่ง email เชิญ ผู้รับคลิกลิงก์แล้วสมัคร/ล็อกอินเข้า Org | |
| Admin สร้างให้ | Admin สร้าง account ให้เลย แล้วส่งรหัสผ่านทางอื่น | |
| ทั้งสองแบบ | Invitation + Admin สร้างให้ได้ทั้งสองแบบ | ✓ |

**User's choice:** ทั้งสองแบบ

### Self-Registration

| Option | Description | Selected |
|--------|-------------|----------|
| ไม่เปิด (แนะนำ) | ต้องได้รับเชิญเท่านั้น — ปลอดภัยกว่า เหมาะกับ SaaS แบบ B2B | ✓ |
| เปิดสมัครเอง | ใครก็สมัครได้ แล้วสร้าง Org ใหม่หรือขอเข้า Org ที่มีอยู่ | |

**User's choice:** ไม่เปิด

---

## Claude's Discretion

- Exact Prisma schema design
- Better Auth plugin configuration
- RLS policy implementation
- Session management approach
- Password requirements
- Error handling patterns

## Deferred Ideas

None — discussion stayed within phase scope
