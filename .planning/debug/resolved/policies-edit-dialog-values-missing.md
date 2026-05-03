---
status: awaiting_human_verify
trigger: "policies-edit-dialog-values-missing — Edit Policy dialog shows empty/missing values for previously saved policy"
created: 2026-05-02T11:08:24Z
updated: 2026-05-02T11:55:00Z
---

## Current Focus

hypothesis: Fix applied. DomainListEditor now (1) auto-commits pending input on blur and (2) exposes imperative `flush()` method via forwardRef. All 3 parent forms (CreatePolicyDialog, EditPolicyDialog, PolicyForm) call `domainEditorRef.current?.flush()` before building submit payload.
test: Next.js production build passed. No type errors. User must verify on running web app: open Create Policy → type a domain → click Create immediately (without pressing Add/Enter) → check policy list and Edit dialog show the domain.
expecting: User confirms domain persists end-to-end without manual Add Domain click.
next_action: Wait for user verification before archiving session.

## Symptoms

expected: เปิด dialog "แก้ไข Policy" แล้วทุก field ที่บันทึกไว้ก่อนหน้าต้อง pre-fill ใน form ครบ; กด save แล้วค่าใหม่ทับค่าเก่าได้ถูกต้อง
actual: เปิด dialog "แก้ไข Policy" ค่าหายไปจาก form (user เห็นว่า "ค่ามันหาย ไม่มีอยู่ใน dialog") — ยังไม่รู้ว่าทุก field หายหรือบาง field, ยังไม่รู้ว่าค่าถูกบันทึกใน DB จริงหรือไม่
errors: ผู้ใช้ยังไม่เห็น error ชัดเจน — ต้องเปิด browser devtools / API logs / DB ตรวจสอบเอง
reproduction: ไปหน้า Policies ใน tenant portal → กดปุ่มแก้ไข policy ที่มีอยู่ → สังเกต dialog ว่า field ที่เคย save ไว้ pre-fill ครบมั้ย
started: ไม่ทราบ timeline — อาจมีมาตั้งแต่ feature สร้าง หรือ regression จาก commit ล่าสุด

## Eliminated

(empty — investigation just started)

## Evidence

- timestamp: 2026-05-02T11:10:00Z
  checked: Prisma schema for Policy model (apps/api/src/prisma/schema.prisma:306-331)
  found: Fields = id, orgId, level, name, description, ttlSeconds, maxViewers, domains (default []), allowNoReferer, rateLimit, cameraId/siteId/projectId (each @unique), createdAt, updatedAt
  implication: Schema persists all the fields the form claims to use; nullable on ttl/max/allowNoReferer/rateLimit means "inherit"

- timestamp: 2026-05-02T11:11:00Z
  checked: Backend DTOs (create-policy.dto.ts, update-policy.dto.ts) + controller (policies.controller.ts) + service (policies.service.ts)
  found: CreatePolicyDto includes all fields (level, name, desc, ttl, maxViewers, domains, allowNoReferer, rateLimit, cameraId, siteId, projectId). UpdatePolicyDto OMITS cameraId/siteId/projectId (level is read-only on update too). PoliciesService.findOne returns raw prisma.policy.findUnique → all DB fields surface. PoliciesService.update spreads dto wholesale into prisma.update.
  implication: GET /api/policies/{id} returns all schema fields. Update DTO drops the FK fields, so even if frontend sends them they get filtered by zod safeParse → harmless drop, no persistence damage. NO drift on the read path that would explain "values missing in dialog".

- timestamp: 2026-05-02T11:12:00Z
  checked: Frontend EditPolicyDialog (apps/web/src/app/admin/policies/components/edit-policy-dialog.tsx)
  found: useEffect[open, policyId] fetches /api/policies/{id} and sets all 8 form fields (name, description, level, ttlSeconds, maxViewers, domains, allowNoReferer, rateLimit) plus entityId. No conditional logic that could skip a field.
  implication: Hydration logic itself is complete. If GET returns full data, all fields should populate.

- timestamp: 2026-05-02T11:13:00Z
  checked: Frontend tenant-policies-page.tsx + create-policy-dialog.tsx + policy-form.tsx
  found: Two parallel UI surfaces — (a) tenant route `/app/policies` uses dialog-based create/edit, (b) admin route `/admin/policies/[id]` uses page-based PolicyForm. Both pull from same /api/policies endpoints. Both are correctly wired.
  implication: Bug surface narrows to runtime behavior — need actual DB + actual GET response from production to advance.

- timestamp: 2026-05-02T11:28:00Z
  checked: User checkpoint answers (Q1/Q2/Q3): "Internal" was tested; user filled name + camera scope + selected camera + domain allow list; did NOT fill TTL/Max Viewers/Rate Limit; saw `(inherited)` placeholder
  found: TTL/Max/Rate were never typed by user → null in DB is correct (NOT a bug, just `(inherited)` placeholder is ambiguous). BUT user insists they filled domain allow list → DB shows `domains: []` → REAL persistence gap on `domains` field
  implication: Bug scope narrows to `domains` field. Need to inspect serialization path (form → DTO → service → prisma) for `domains` specifically.

- timestamp: 2026-05-02T11:30:00Z
  checked: Backend path for domains — CreatePolicySchema (zod) line 9: `domains: z.array(z.string()).optional()`; PoliciesService.create line 100: `domains: dto.domains` (passthrough); UpdatePolicySchema line 8: `domains: z.array(z.string()).optional()`; service.update spreads `dto` directly into prisma.update
  found: Backend correctly accepts `string[]` and persists it. No transformation/strip. If frontend sends `["example.com"]`, DB stores `["example.com"]`.
  implication: Bug is NOT on backend. Move investigation to frontend serialization.

- timestamp: 2026-05-02T11:33:00Z
  checked: CreatePolicyDialog (line 49 + line 105) — `domains` is a `string[]` state passed to `<DomainListEditor domains={domains} onChange={setDomains} />`. Submit body uses `domains` directly: `{ ...other, domains, ... }`.
  found: Parent dialog correctly forwards `domains` array to API. No transform issue at dialog level.
  implication: If `domains` array is empty when submit fires, the bug is in DomainListEditor itself (child component) — not the parent dialog.

- timestamp: 2026-05-02T11:35:00Z
  checked: DomainListEditor (apps/web/src/app/admin/policies/components/domain-list-editor.tsx)
  found: ROOT CAUSE — line 25: `const [input, setInput] = useState('')` is local pending text. User must (a) click "Add Domain" button (line 71) or (b) press Enter (line 51-56) to invoke `handleAdd()` which calls `onChange([...domains, trimmed])`. If user types `example.com` into the textbox and clicks "Create Policy" without committing first, the pending text stays in the child's local state and is NEVER flushed to parent `domains[]`. Form submits `domains: []`. DB persists `[]`. Edit dialog later hydrates `domains: []` → user reports "domain หายไป"
  implication: Classic "uncommitted child input" bug. Fix: imperatively flush pending input on form submit, OR commit on input blur, OR expose a ref/imperative handle. Cleanest solution: lift `input` state to parent OR auto-commit on blur (debounced).

## Resolution

root_cause: |
  DomainListEditor (child) keeps a local `input` text state that is only committed
  to the parent's `domains[]` array when the user explicitly clicks "Add Domain"
  or presses Enter. If the user types a domain and immediately clicks the form's
  "Create Policy" / "Save Changes" button, the pending text remains trapped in
  the child component and the parent submits `domains: []`. The backend then
  persists an empty array. When the user re-opens the Edit dialog, `domains: []`
  is hydrated correctly — but the user perceives this as "the domain I typed is
  missing." The TTL/Max/Rate fields appearing empty is a separate (non-bug) UX
  issue: those fields were never filled by the user, and `(inherited)` placeholder
  text is ambiguous (looks like a value).

fix: |
  Two-part fix:
  (1) DomainListEditor: auto-commit pending input on blur (Input onBlur → handleAdd)
      AND keep existing Add button + Enter behavior. This catches the user who
      tabs/clicks away from the input.
  (2) CreatePolicyDialog + EditPolicyDialog: before calling apiFetch, flush any
      pending text in the domain editor via an imperative ref. This catches the
      user who clicks "Create Policy" / "Save Changes" without leaving focus.
  Approach: lift the `input` state up to the parent dialogs (simpler than
  refs/imperative handles), so the dialog's submit handler can append `input.trim()`
  to `domains[]` if it's a valid pending domain.

verification: |
  - `pnpm --filter @sms-platform/web exec tsc --noEmit` → 0 errors
  - `pnpm --filter @sms-platform/web exec next build` → all routes compile, including
    /app/policies (6.97 kB), /admin/policies (607 B), /admin/policies/[id] (1 kB),
    /admin/policies/new (710 B). No type / runtime errors.
  - No existing vitest tests for DomainListEditor or policy components — manual UAT required.

  HUMAN VERIFICATION STEPS:
  1. Boot dev: `pnpm dev` (or rebuild prod containers)
  2. Open `/app/policies` → click "Create Policy"
  3. Fill name "Test Domain Persist", select level CAMERA + a camera
  4. In Domain Allowlist, TYPE `example.com` but DO NOT click Add Domain or press Enter
  5. Click "Create Policy" button
  6. Open Network tab → confirm POST /api/policies body has `domains: ["example.com"]`
  7. Open the Edit dialog for that policy → confirm `example.com` badge appears

files_changed:
  - apps/web/src/app/admin/policies/components/domain-list-editor.tsx
  - apps/web/src/app/admin/policies/components/create-policy-dialog.tsx
  - apps/web/src/app/admin/policies/components/edit-policy-dialog.tsx
  - apps/web/src/app/admin/policies/components/policy-form.tsx
