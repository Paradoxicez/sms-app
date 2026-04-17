# Phase 13: Hierarchy & Map - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 13-hierarchy-map
**Areas discussed:** Tree viewer, Split panel layout, Tree-to-table interaction, Map + tree integration

---

## Tree Viewer

### Tree Node Display

| Option | Description | Selected |
|--------|-------------|----------|
| ชื่อ + count (แนะนำ) | Project: ชื่อ + (N sites), Site: ชื่อ + (N cameras), Camera: ชื่อ + status dot | ✓ |
| ชื่ออย่างเดียว | Minimal — ไม่มี count/icon/status | |
| ชื่อ + count + status summary | Site แสดง online/offline summary | |

**User's choice:** ชื่อ + count — กระชับดี เห็นจำนวนทันที

### Tree Search

| Option | Description | Selected |
|--------|-------------|----------|
| มี search box (แนะนำ) | Search box ด้านบนของ tree panel — filter แสดงเฉพาะ node ที่ match | ✓ |
| ไม่ต้อง | ใช้ collapse/expand นำทางได้ | |

**User's choice:** มี search box

---

## Split Panel Layout

### Split Ratio

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 280px + flex (แนะนำ) | Tree panel คงที่, DataTable ใช้พื้นที่ที่เหลือ | |
| Resizable split | User ลาก divider ปรับขนาด tree vs table | ✓ |
| Collapsible tree panel | Tree panel หด/เปิดได้ด้วยปุ่ม toggle | |

**User's choice:** Resizable split — ลาก divider ปรับขนาดได้

### Responsive (Mobile/Tablet)

| Option | Description | Selected |
|--------|-------------|----------|
| Tree ซ่อนไว้ (แนะนำ) | Mobile: tree ซ่อน แสดงแค่ DataTable + breadcrumb + toggle เปิด tree เป็น drawer | ✓ |
| Tab layout | 2 tabs สลับ Tree/Table | |
| Claude ตัดสินใจ | ให้ Claude เลือก | |

**User's choice:** Tree ซ่อนไว้ — mobile แสดง DataTable + breadcrumb, toggle เปิด tree เป็น drawer

---

## Tree-to-Table Interaction

### Table Data

| Option | Description | Selected |
|--------|-------------|----------|
| แสดงลูกตรง (แนะนำ) | เลือก Project → Sites table, เลือก Site → Cameras table, เลือก Camera → View Stream sheet | ✓ |
| แสดง cameras เสมอ | ไม่ว่าเลือกระดับไหน table แสดง cameras ที่อยู่ใต้ node | |

**User's choice:** แสดงลูกตรง — table เปลี่ยน columns ตามระดับที่เลือก

### Default View

| Option | Description | Selected |
|--------|-------------|----------|
| Root + ตาราง Projects (แนะนำ) | Tree แสดง root ทั้งหมด collapsed, table แสดง Projects list | ✓ |
| เปิด project แรกทั้งหมด | Tree expand project แรก, table แสดง sites ของ project แรก | |

**User's choice:** Root + ตาราง Projects

---

## Map + Tree Integration

### Map Tree Position

| Option | Description | Selected |
|--------|-------------|----------|
| Panel ซ้ายเหมือน Projects (แนะนำ) | Resizable split panel เหมือนหน้า Projects | |
| Floating overlay | Tree เป็น floating panel ซ้อนทับบน map | ✓ |

**User's choice:** Floating overlay — map ใช้ full width, tree เป็น overlay เปิด/ปิดได้

### Drag-Drop Marker

| Option | Description | Selected |
|--------|-------------|----------|
| ลาก marker ได้เลย (แนะนำ) | Marker ลากได้ตลอดเวลา, บันทึก lat/lng ทันที | |
| กดปุ่ม Edit Location ก่อน | ต้องกด 'Set Location' ก่อน แล้วคลิกบน map เพื่อวางตำแหน่ง | ✓ |

**User's choice:** กดปุ่ม Edit Location ก่อน — ชัดเจนกว่าว่ากำลังตั้งตำแหน่งกล้องไหน

### Map Popup

| Option | Description | Selected |
|--------|-------------|----------|
| ใช้ตามที่มีอยู่ (แนะนำ) | CameraPopup ดีอยู่แล้ว — แค่เปลี่ยน link เป็น View Stream sheet | ✓ |
| เพิ่ม site/project info | เพิ่ม project name + site name ใน popup | |
| เพิ่ม quick actions | เพิ่มปุ่ม quick actions ใน popup | |

**User's choice:** ใช้ตามที่มีอยู่ — เปลี่ยนแค่ link

---

## Claude's Discretion

- Resizable panel implementation approach
- Tree component library choice
- Floating panel animation and positioning
- Placement mode visual feedback
- Tree expand/collapse animation
- Loading states and empty states

## Deferred Ideas

None
