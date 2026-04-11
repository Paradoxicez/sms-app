---
created: 2026-04-11T12:31:32.198Z
title: Redesign camera detail page
area: ui
files:
  - apps/web/src/app/admin/cameras/[id]/page.tsx
  - apps/web/src/app/admin/cameras/page.tsx
---

## Problem

Camera detail page ปัจจุบันใช้ header + 5 tabs (Preview/Details/Stream Profile/Logs/Policy) ซึ่ง user ไม่ชอบ layout นี้ ต้องการเปลี่ยนเป็น table-based approach เหมือนหน้า Policies

## Solution

Redesign camera page ให้เป็น:

1. **Table view** — ตาราง cameras เหมือน Policies (Name, Status, Site, Stream URL, Resolution)
2. **Filters** — ค้นหาตาม name, status (online/offline), site, project, tags
3. **Row actions** — เมนู three-dot: Edit (dialog), Delete, Disable/Enable, View Stream, Record
4. **View toggle** — สลับ Table ↔ Card view
5. **Card view** — แต่ละ card แสดง live stream preview แบบ realtime + ชื่อ + status

ไม่ต้องมี camera detail page แยก — ทุกอย่างทำผ่าน list page + dialogs + card view

**Scope:** ควรเป็น phase เต็มรูปแบบ ไม่ใช่ quick fix
