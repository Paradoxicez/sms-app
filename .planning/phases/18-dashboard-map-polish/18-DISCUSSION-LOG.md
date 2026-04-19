# Phase 18: Dashboard & Map Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 18-dashboard-map-polish
**Areas discussed:** Tenant Dashboard composition, Super Admin Dashboard composition, Map marker design, Map popup polish

---

## Tenant Dashboard composition

### Q1: SystemMetrics card leak in `/app/dashboard`

| Option | Description | Selected |
|--------|-------------|----------|
| ลบออกจาก /app เลย | Super admin ดูใน /admin/dashboard ตามหลัก portal separation | ✓ |
| เก็บไว้ — ย้ายไปอยู่ใน /admin | /admin มีอยู่แล้ว = ลบจาก /app เฉย ๆ | |
| แสดงให้ทุก role ใน /app | Org admin = customer ไม่ควรเห็น CPU/infrastructure | |

**User's choice:** ลบออกจาก /app เลย
**Notes:** ขัด D-02 ของ Phase 16 (super admin ไม่ดู tenant data); /admin มี SystemMetrics เทียบเท่าอยู่แล้ว

### Q2: Stat cards บนสุด tenant dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| เพิ่ม Recording + Maintenance เป็น 6 ใบ | สะท้อน Phase 15 status ใหม่ | ✓ |
| เก็บ 4 ใบเดิม | ดู recording/maintenance ที่ /cameras | |
| จัดกลุ่มใหม่: Camera Health + Streams card | Composite cards ใช้ effort สูง | |

**User's choice:** เพิ่ม Recording + Maintenance เป็น 6 ใบ
**Notes:** Layout grid เลือกระหว่าง `lg:grid-cols-3` (2 แถว) หรือ `lg:grid-cols-6` (1 แถว) — Claude discretion

### Q3: BandwidthChart + ApiUsageChart

| Option | Description | Selected |
|--------|-------------|----------|
| เก็บไว้ทั้งคู่บน dashboard | Real-time trend ≠ quota view | ✓ |
| ลบทิ้ง ย้าย link ไป /account?tab=plan | Reduce redundancy แต่เพิ่ม click | |
| เก็บแค่ BandwidthChart | API usage = developer-only | |

**User's choice:** เก็บไว้ทั้งคู่บน dashboard
**Notes:** Dashboard = real-time operations view, /account Plan & Usage = quota view — คนละจุดประสงค์

### Q4: CameraStatusTable

User initially didn't answer the table-question because they questioned the entire purpose of having a camera table on dashboard. Discussion expanded to "what should actually be on dashboard?"

**Original options (rejected after user pushback):**
- Composite 3-icon status (เก็บตาราง)
- Migrate เป็น DataTable เต็ม
- Top 5 attention items

**User insight:** "ตารางกล้องบน dashboard ซ้ำกับ /cameras — ไม่รู้ดูทำไม"

Re-asked with purpose-driven options:

| Option | Description | Selected |
|--------|-------------|----------|
| Issues panel | เฉพาะกล้องผิดปกติ + actions; empty state = "All cameras healthy ✓" | ✓ |
| Live preview grid (4-6 thumbnails) | Visual situational awareness; bandwidth-heavy | |
| Recent activity feed | Temporal awareness; overlap กับ /audit | |
| Mini map embed | Spatial; duplicates /map | |

**User's choice:** Issues panel
**Notes:** Dashboard ≠ "everything page". Issues panel = attention trigger ที่แท้จริง — ถ้าว่าง = ระบบสบายดี (reward signal)

---

## Super Admin Dashboard composition

### Q5: Stat cards (เดิม 5 ใบ)

| Option | Description | Selected |
|--------|-------------|----------|
| เพิ่ม Active Streams + Recordings = 7 ใบ | Super admin เห็น load ปัจจุบัน | ✓ |
| เก็บ 5 ใบเดิม | Detail ใน /admin/streams, /admin/recordings | |
| เพิ่ม Storage Used + Active Streams = 7 ใบ | ไม่รวม Recordings count | |

**User's choice:** เพิ่ม Active Streams + Recordings = 7 ใบ
**Notes:** Stat cards ใหม่จะเรียก SRS API + recording status query

### Q6: Org Summary table

| Option | Description | Selected |
|--------|-------------|----------|
| เพิ่ม column: Storage, Bandwidth, Plan name, % usage | "Org Health Overview" | ✓ |
| เก็บตารางเดิม (online/offline/total) | Detail ที่ /admin/organizations | |
| 2 widget: Top 5 by usage + Recently created | สวยแต่ไม่ชนหน้า | |

**User's choice:** เพิ่ม columns เป็น Org Health Overview
**Notes:** Sort default = % usage desc (ใกล้เต็ม plan ขึ้นก่อน)

### Q7: Widget เพิ่มบน super admin dashboard (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Cluster/Edge nodes status panel | SRS cluster monitoring จาก Phase 6 | ✓ |
| Platform-wide Issues panel | Cross-org attention items | ✓ |
| Storage forecast | Capacity planning | ✓ |
| Recent platform audit highlights | Governance visibility | ✓ |

**User's choice:** ทุก widget
**Notes:** super admin dashboard มี 7 sections — ต้องวางแผน layout

### Q8: Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Vertical stack เรียงตาม priority | Stat → SystemMetrics → Issues → Cluster → Storage → Org → Audit | ✓ |
| Tab-based แยกตามหมวด | Overview / Operations / Organizations | |
| Grid 2-column | ปะหยัดพื้นที่บนจอใหญ่ | |
| Phase นี้ทำแค่ priority — เลื่อน widget ไป future | จำกัด scope | |

**User's choice:** Vertical stack
**Notes:** เหมือน tenant dashboard pattern; user scroll ตามลำดับสำคัญ

### Q9: Org Health Overview scaling

| Option | Description | Selected |
|--------|-------------|----------|
| Cap height + scroll + "View all" link | Inline scroll | |
| Top 10 + "View all" link | Predictable height | |
| Migrate เป็น DataTable เต็ม | Sort/filter/pagination | ✓ |

**User's choice:** DataTable เต็ม
**Notes:** Super admin มัก manage org บ่อย; DataTable Phase 14 pattern

---

## Map marker design

### Q10: Pin shape

| Option | Description | Selected |
|--------|-------------|----------|
| Teardrop pin มี camera icon ตรงกลาง | Google Maps mental model; readability สูง | ✓ |
| วงกลมขยายขึ้น | Dot 18px พร้อม inner dot สีขาว | |
| Square badge พร้อม icon | Modern; แต่ผิด map convention | |

**User's choice:** Teardrop pin (28×36px) + camera icon
**Notes:** Background = connection status color; anchor ที่ปลายล่าง

### Q11: Multi-status display

| Option | Description | Selected |
|--------|-------------|----------|
| จุดละมุมขวาบน + ล่าง | Recording = red dot top-right; Maintenance = wrench bottom-right | ✓ |
| Ring รอบ marker | Dashed gray ring = maintenance; pulsing red = recording | |
| เปลี่ยนสี marker ตาม dominant state | Sacrifices connection info | |

**User's choice:** Badges มุม
**Notes:** สี pin = connection (primary); badges = secondary state ชัดเจน

### Q12: Marker clustering

| Option | Description | Selected |
|--------|-------------|----------|
| Cluster + count + dominant status color | `react-leaflet-cluster` integration | ✓ |
| ไม่ cluster | ใช้ zoom เอง | |
| Spider effect | Default cluster + spread on max zoom | |

**User's choice:** Cluster (worst-status color)
**Notes:** ถ้ามี offline แม้ 1 ตัว → cluster เป็นสีแดง

---

## Map popup polish

### Q13: Preview

| Option | Description | Selected |
|--------|-------------|----------|
| ขยาย + สัดส่วน 16:9 (240×135) | มาตรฐาน video; status overlay มุม | ✓ |
| เก็บ 200×112 + fix overlay | Popup เล็กเดิม | |
| Thumbnail นิ่ง + ปุ่ม play | ประหยัด bandwidth (ต้องตรวจ SRS รองรับ) | |

**User's choice:** 240×135 + REC/maintenance overlay
**Notes:** อย่าแตะ memoization pattern ของ PreviewVideo

### Q14: ข้อมูลเพิ่มใน popup (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Recording status badge | "Recording" + retention | ✓ |
| Maintenance badge | + ผู้เปิด + เมื่อไร | ✓ |
| Last online timestamp | เฉพาะตอน offline | ✓ |
| Coordinates + tags | Admin info | |

**User's choice:** 3/4 (ไม่เลือก coordinates+tags)
**Notes:** รักษาขนาด popup ไม่ให้บวม

### Q15: Action buttons

| Option | Description | Selected |
|--------|-------------|----------|
| View Stream + View Recordings + ⋮ menu | Primary 2 + Secondary dropdown (Set Location, Toggle Maintenance, Detail) | ✓ |
| เก็บ 2 ปุ่มเดิม (View Stream, Set Location) | Minimal | |
| View Stream + View Detail + Set Location | ตัด View Recordings | |

**User's choice:** 2 primary + ⋮ dropdown
**Notes:** View Recordings ต่อยอด Phase 17; Toggle Maintenance call API จาก Phase 15-03

---

## Claude's Discretion

- Exact stat card grid layout (3-col vs 6-col)
- Issues panel polling interval fallback (default 30s)
- Issues threshold definitions (use existing status logic)
- Color/contrast tuning สำหรับ marker badges
- Mobile responsive behavior
- Storage forecast chart type
- Recent audit highlights filter
- Loading skeletons สำหรับ widget ใหม่
- Empty state wording และ illustrations
- Cluster bubble color thresholds (intermediate states)

## Deferred Ideas

- Live preview grid widget (tenant dashboard, future)
- Recent activity feed (tenant dashboard, future)
- Mini map embed (duplicates /map)
- Tab-based dashboard layout (super admin alternative)
- Coordinates + camera tags ใน popup
- Marker spider effect
- Issues panel auto-resolve / ack workflow
- Storage forecast multi-region / per-bucket
- Cluster nodes individual control
- Custom dashboard / widget arrangement per user
