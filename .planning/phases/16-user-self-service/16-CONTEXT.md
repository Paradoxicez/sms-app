# Phase 16: User Self-Service - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Users จัดการบัญชีของตัวเอง (display name, password, avatar) และดู plan + usage ขององค์กรแบบ read-only ผ่านหน้า Account. ครอบคลุม USER-01 (name+password), USER-02 (avatar upload), USER-03 (Plan/usage viewer). Email change, self-serve upgrade, ticket system ไม่อยู่ใน scope.

</domain>

<decisions>
## Implementation Decisions

### Account Page Structure & Portal Scope
- **D-01:** หน้า Account มีใน **ทั้ง 2 portal** — `/app/account` (tenant) และ `/admin/account` (super admin). Super admin ก็มี display name/password/avatar ของตัวเองที่ต้องจัดการ.
- **D-02:** Plan & Usage section **แสดงเฉพาะใน `/app/account`** (tenant). Super admin ไม่เห็น section นี้เพราะไม่ได้สังกัด package — เป็น platform operator. เก็บ boundary นี้ตาม SaaS role architecture: 2 portal แยกจากกัน.
- **D-03:** Navigation entry = **sidebar footer dropdown** (ต่อยอดจาก `sidebar-footer.tsx` ที่มีอยู่). เพิ่ม menu item "Account settings" เหนือ "Sign out".
- **D-04:** Layout = **single page + sections** (scroll ลง). Sections: Profile (name + avatar), Security (password), Plan & Usage (tenant-only).
- **D-05:** Email change **defer ออกจาก Phase 16** — ต้อง SMTP provider + 2 email templates + 2-step Better Auth verify flow. แยกออกเป็น phase ของตัวเองเมื่อ SMTP พร้อม.

### Profile — Name & Avatar
- **D-06:** Display name ใช้ `authClient.updateUser({ name })` ของ Better Auth — input text ธรรมดา, save button, toast success.
- **D-07:** Avatar storage = **MinIO bucket ใหม่ชื่อ `avatars`** (shared, ไม่ใช่ per-org). Key pattern: `{userId}.webp`. เก็บ URL ลง `user.image` ผ่าน `authClient.updateUser({ image: url })`.
- **D-08:** Upload constraints: **≤ 2MB**, format **JPEG/PNG/WebP** เท่านั้น. Server-side transcode → **WebP 256×256** (center-crop) ด้วย `sharp`.
- **D-09:** **ไม่มี client-side crop UI** — user upload ไฟล์เดิม, backend resize/crop อัตโนมัติ. ลด scope, พอสำหรับ use case.
- **D-10:** **มีปุ่ม "Remove avatar"** → ลบไฟล์จาก MinIO + set `user.image = null` → UI fallback ไปใช้ initials เหมือน `sidebar-footer.tsx` ทำอยู่แล้ว.

### Security — Password Change
- **D-11:** **บังคับกรอก current password** — ใช้ `authClient.changePassword({ currentPassword, newPassword })` ของ Better Auth. ป้องกันกรณี session โดน hijack.
- **D-12:** Password policy = **≥ 8 ตัวอักษร** (Better Auth default). ไม่บังคับ mixed case / symbols / HIBP — เหมาะกับ B2B internal users.
- **D-13:** แสดง **strength indicator แบบ simple bar** (3 ระดับ weak/medium/strong) ด้วย `zxcvbn`. Real-time ระหว่าง user พิมพ์.
- **D-14:** หลัง change สำเร็จ → **revoke session อื่นทั้งหมด คง current session** ใช้ `authClient.revokeOtherSessions()`. แสดงข้อความ success + "Signed out from other devices".

### Plan & Usage (tenant-only section)
- **D-15:** แสดง **ครบทั้ง 4 Package limit + API calls + feature flags**:
  - Cameras: `used / maxCameras` + progress bar
  - Concurrent viewers: `used / maxViewers` + progress bar (current จาก SRS)
  - Bandwidth: `today Mbps / maxBandwidthMbps` + progress bar
  - Storage: `used GB / maxStorageGb` + progress bar
  - API calls (MTD): count only (ไม่มี max) — แสดงเป็นตัวเลข
  - Features: list จาก `Package.features` JSON — recordings/webhooks/map เป็น ✓/✗
- **D-16:** Usage timeframe:
  - cameras, storage, viewers → **current snapshot** (ค่าปัจจุบัน)
  - API calls, bandwidth → **month-to-date** (ตั้งแต่วันที่ 1 ของเดือนถึงวันนี้)
- **D-17:** Usage freshness = **on-demand query ตอนโหลดหน้า** — ไม่ cache, ไม่ Socket.IO. เพราะ quota ไม่ได้เปลี่ยนถี่. ใช้ endpoint เดียว `GET /api/organizations/:orgId/plan-usage` รวม aggregate.
- **D-18:** Contact/upgrade UI = **แค่ข้อความ info ไม่มีปุ่ม** — เช่น "To upgrade your plan, contact your system administrator." แสดง plan name + description ด้านบน. ไม่มี mailto, ไม่มี ticket.

### Read-only Guarantees
- **D-19:** หน้า Plan & Usage เป็น **read-only 100%** — ไม่มี edit, approve, request button. Super admin แก้ package/limits ใน `/admin/organizations` และ `/admin/packages` ตามเดิม (Phase 01).

### Claude's Discretion
- Exact toast/notification wording
- Avatar upload component styling (dropzone vs button)
- Progress bar color thresholds (green/yellow/red at what %)
- Exact form layout and spacing within sections
- Error state designs (upload failure, network error, etc.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Better Auth — Account management
- `apps/api/src/auth/auth.config.ts` — Better Auth server config (plugins, session, invitation)
- `apps/web/src/lib/auth-client.ts` — Client with `organizationClient` + `adminClient` plugins
- Better Auth docs: `authClient.updateUser({ name, image })`, `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions })`

### MinIO — File storage (pattern to follow)
- `apps/api/src/recordings/minio.service.ts` — Existing MinioService (bucket per org). Avatar will add new method: `ensureAvatarsBucket()`, `uploadAvatar(userId, buffer)`, `removeAvatar(userId)`. Bucket = `avatars` (shared, not per-org).

### User schema
- `apps/api/src/prisma/schema.prisma` §`model User` — `image String?` field available for avatar URL. No schema change needed.

### Navigation & Sidebar
- `apps/web/src/components/nav/sidebar-footer.tsx` — Existing dropdown. Add "Account settings" menu item above Sign out, wire `<Link href="/app/account">` (tenant) or `/admin/account` (super admin) based on layout.
- `apps/web/src/components/nav/nav-config.ts` — Nav config (not directly touched; footer handles it).
- `apps/web/src/app/app/layout.tsx` + `apps/web/src/app/admin/layout.tsx` — Portal layouts (Account page uses same layout).

### Avatar display (reuse)
- `apps/web/src/components/ui/avatar.tsx` — `Avatar`, `AvatarImage`, `AvatarFallback`. Show `AvatarImage src={user.image}` with `AvatarFallback` = initials when null.

### Package & Plan data
- `apps/api/src/prisma/schema.prisma` §`model Package` — `maxCameras`, `maxViewers`, `maxBandwidthMbps`, `maxStorageGb`, `features Json`
- `apps/api/src/prisma/schema.prisma` §`model Organization` — `packageId` → `package` relation
- `apps/api/src/packages/packages.service.ts` — Package CRUD (super admin only). New tenant-scoped endpoint needs own service/controller.
- `apps/api/src/dashboard/dashboard.service.ts` §`getStats` — Reference pattern for cameras/bandwidth aggregation per org. Reuse aggregation logic for plan-usage endpoint.
- `apps/api/src/status/status.service.ts` — `getViewerCount(cameraId)` for concurrent viewers.
- `apps/api/src/api-keys/api-key-usage.processor.ts` — API key usage rollup pattern (for MTD API calls query).

### Existing form patterns (reference)
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` — Form dialog pattern (react-hook-form + zod + Button + Input).
- `apps/web/src/components/ui/form.tsx` — Form primitives if present.

### Requirements
- `.planning/REQUIREMENTS.md` §User Self-Service — USER-01 (name+password), USER-02 (avatar), USER-03 (Plan viewer)
- `.planning/ROADMAP.md` §Phase 16 — Success criteria (3 items)

### Project constraints
- `.planning/PROJECT.md` §Active — "User account self-service" and "Plan/usage viewer" (PROJECT.md lists email change in active but this phase defers it)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Better Auth client** with `updateUser`, `changePassword`, `revokeOtherSessions` already wired — no new auth library needed
- **MinioService** (recordings) — proven pattern; add avatars bucket alongside
- **Avatar UI component** (`components/ui/avatar.tsx`) — already handles image + fallback initials
- **SidebarFooterContent** — existing dropdown can extend with "Account settings" link
- **DashboardService.getStats** — aggregation patterns (cameras, bandwidth, viewers) ready to reuse in plan-usage endpoint
- **Form primitives** (react-hook-form + zod + shadcn ui) — established throughout v1.0/v1.1

### Established Patterns
- Super admin pages use `PrismaService` directly (no RLS); tenant pages use `TENANCY_CLIENT` with org_id scope
- Tenant API endpoints pattern: `/api/organizations/:orgId/...` — new plan-usage endpoint follows same
- Controllers use `ApiExcludeController` for non-dev-portal internal endpoints
- Zod DTOs with `safeParse` + `BadRequestException` for validation
- Password hashing via dynamic import `better-auth/crypto` (ESM-only workaround in `users.service.ts`)

### Integration Points
- **Account page routes:**
  - Tenant: `/app/account` (new) — consumes `/api/users/me`, `/api/organizations/:orgId/plan-usage`
  - Super admin: `/admin/account` (new) — consumes `/api/users/me` only (no plan section)
- **Avatar upload endpoint:** new `POST /api/users/me/avatar` (multipart) + `DELETE /api/users/me/avatar`
- **Plan-usage endpoint:** new `GET /api/organizations/:orgId/plan-usage` — returns `{ package, usage: { cameras, viewers, bandwidthMtd, storage, apiCallsMtd }, features }`
- **Sidebar footer:** wire "Account settings" link based on portal context (app vs admin)

</code_context>

<specifics>
## Specific Ideas

- หน้า Account แบบ single page scroll — pattern คล้าย GitHub Settings ส่วน Account (Profile → Password → เลื่อนลง)
- Avatar upload ควร "one-click simple" — drag/drop หรือ click to upload, แล้ว backend จัดการ resize ให้
- Plan section ให้ความรู้สึก informational ไม่ใช่ transactional — user ไม่ควรกด "upgrade" เองใน v1 (super admin manages manually)
- Password strength bar แบบ basic ก็พอ (3 ระดับ) ไม่ต้องโชว์ feedback ละเอียดเหมือน Dropbox

</specifics>

<deferred>
## Deferred Ideas

- **Email change** — ต้อง SMTP provider + 2 email templates + Better Auth 2-step verify flow (`sendChangeEmailConfirmation` + `emailVerification.sendVerificationEmail`). แยก phase เมื่อ SMTP พร้อม
- **Self-serve upgrade / checkout flow** — Stripe integration ถูก mark out-of-scope ใน PROJECT.md แล้ว
- **Support ticket system** — ถ้าอยากมีต้องออกแบบ table + workflow แยก phase
- **Active sessions list / revoke individual sessions** — Better Auth รองรับแต่ยังไม่อยู่ใน USER-01/02/03
- **2FA / passkey** — security feature ที่ยังไม่อยู่ใน requirement
- **Client-side avatar crop UI** — ถ้ามี feedback ว่า server center-crop ไม่พอ
- **API calls quota/limit field ใน Package** — ถ้าอนาคตต้องการ rate limit per package, เพิ่ม `maxApiCallsPerMonth` field แล้วเติม progress bar

</deferred>

---

*Phase: 16-user-self-service*
*Context gathered: 2026-04-18*
