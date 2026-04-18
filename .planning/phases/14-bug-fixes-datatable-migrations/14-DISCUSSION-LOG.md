# Phase 14: Bug Fixes & DataTable Migrations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 14-bug-fixes-datatable-migrations
**Areas discussed:** API Key behavior, DataTable scope, System org user creation, Platform Audit migration

---

## API Key Copy

| Option | Description | Selected |
|--------|-------------|----------|
| Fix create dialog only | ตอนสร้างแสดง key จริงให้ copy + เตือน และตัด copy button ออกจากตาราง | ✓ |
| Keep copy as identifier | เก็บ copy button ไว้แต่เปลี่ยน label เป็น 'Copy ID' ให้ชัดเจน | |

**User's choice:** Fix create dialog only
**Notes:** User initially thought the masked key copy was a bug. After explaining that the real key is SHA-256 hashed and can't be retrieved, user agreed to Stripe pattern (show once on create).

## API Key Delete

| Option | Description | Selected |
|--------|-------------|----------|
| Soft delete (revoke) | Key หายจากตาราง แต่ยังอยู่ใน DB สำหรับ audit trail | |
| Hard delete | Key ลบจาก DB ถาวร ไม่เหลือ record | ✓ |

**User's choice:** Hard delete
**Notes:** None

## DataTable Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Same pattern as v1.1 | ใช้ pattern เดิม: columns factory + data-table wrapper + faceted filters | ✓ |
| Adjust some pages | บางหน้าอยากปรับแต่งจาก pattern ปกติ | |

**User's choice:** Same pattern as v1.1
**Notes:** None

## System Org User Creation

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add super admins | Super admin สร้าง super admin คนอื่นได้ใน system org | ✓ |
| No, system org is special | System org มีแค่ seed user คนเดียว ไม่ต้องเพิ่ม | |

**User's choice:** Yes, add super admins
**Notes:** None

## Platform Audit Migration

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing component | ใช้ audit-log-data-table.tsx ที่มีอยู่แล้ว เพิ่ม org filter column | ✓ |
| Build new component | สร้าง platform-audit-data-table.tsx ใหม่แยกจาก tenant version | |

**User's choice:** Reuse existing component
**Notes:** None

## Claude's Discretion

- Column ordering and widths
- Exact filter option labels and styling
- Empty state messages
- Loading skeleton design per table

## Deferred Ideas

None
