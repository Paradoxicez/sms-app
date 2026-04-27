---
phase: 20
slug: cameras-ux-bulk-actions-maintenance-toggle-copy-id-expressiv
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-24
updated: 2026-04-24 (revision 1)
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

Populated during revision 1 (checker blocker B1). `wave_0_complete` flips to `true` once Plan 20-01 lands the stub files.

---

## Test Infrastructure

### Frontend (`apps/web`)

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3 + @testing-library/react 16.3.2 + @testing-library/jest-dom 6.9.1 |
| **Config file** | `apps/web/vitest.config.ts` |
| **Environment** | jsdom (configured in vitest.config.ts) |
| **Quick run command** | `cd apps/web && pnpm vitest run src/app/admin/cameras src/components/pages src/lib/bulk-actions.test.ts` |
| **Full suite command** | `cd apps/web && pnpm vitest run` |
| **Estimated runtime** | ~12s quick (Phase 20 files only) · ~60-90s full (~whole web suite) |

### Backend (`apps/api`)

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2 (no supertest — service/controller tests use the project's existing harness pattern in `apps/api/tests/cameras/*`) |
| **Config file** | `apps/api/vitest.config.ts` |
| **Environment** | node |
| **Quick run command** | `cd apps/api && pnpm vitest run tests/cameras/maintenance.test.ts tests/cameras/maintenance-dto.test.ts` |
| **Full suite command** | `cd apps/api && pnpm vitest run` |
| **Estimated runtime** | ~3s quick (maintenance + dto only) · ~45s full |

### Typecheck (gating)

| Property | Value |
|----------|-------|
| **Web** | `cd apps/web && pnpm tsc --noEmit` |
| **API** | `cd apps/api && pnpm tsc --noEmit` |
| **Estimated runtime** | ~10s web · ~8s api |

---

## Sampling Rate

- **After every task commit:** Run the relevant **Quick run command** (web or api depending on files touched).
- **After every plan wave:** Run both **Full suite commands** + both typechecks.
- **Before `/gsd-verify-work`:** Full web + api + typecheck all green; re-run Plan 20-01's Wave 0 stub scaffolding check to ensure no `it.todo` remain that should now be concrete.
- **Max feedback latency:** ~15 seconds for a task's quick command (fast enough for Nyquist-compliant sampling).

---

## Per-Task Verification Map

Legend: Decision IDs from CONTEXT.md (D-01..D-22) take the place of REQ-IDs. Threat IDs are sourced from each plan's `<threat_model>` block.

| Task ID | Plan | Wave | Decision(s) | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 0 | D-03, D-04, D-07 | T-20-01, T-20-04, T-20-06 | Reason dialog enforces 200-char client cap (defense-in-depth vs API DTO); React escapes reason text; focus returns to trigger after close | unit (component) | `cd apps/web && pnpm vitest run src/app/admin/cameras/components/__tests__/maintenance-reason-dialog.test.tsx` | ❌ W0 (Plan 20-01 creates) | ⬜ pending |
| 20-01-02 | 01 | 0 | D-07 | T-20-01, T-20-04, T-20-05, T-20-06, T-20-07 | Zod `.max(200).strict()` rejects oversized + unknown fields; AuditInterceptor auto-captures reason via request.body | unit (api) | `cd apps/api && pnpm vitest run tests/cameras/maintenance.test.ts tests/cameras/maintenance-dto.test.ts` | ❌ W0 (Plan 20-01 creates) | ⬜ pending |
| 20-01-03 | 01 | 0 | D-01..D-22 (all) | — (scaffold only) | N/A — scaffold files are `it.todo` stubs only; no code under test yet | unit (scaffold) | `cd apps/web && pnpm vitest run src/lib/bulk-actions.test.ts src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx src/app/admin/cameras/components/__tests__/cameras-data-table.test.tsx src/components/pages/__tests__/tenant-cameras-page.test.tsx` | ❌ W0 (Plan 20-01 creates) | ⬜ pending |
| 20-02-01 | 02 | 1 | D-12, D-13, D-14, D-15, D-16 | T-20-10 | StatusPills renders only enum fields, no user strings; React default escaping; motion-reduce pair on every pulse | unit (component) | `cd apps/web && pnpm vitest run src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx` | ✅ (Plan 20-01 stub) | ⬜ pending |
| 20-02-02 | 02 | 1 | D-07, D-08, D-09, D-10, D-11 | T-20-08, T-20-09, T-20-11, T-20-12 | cURL template contains LITERAL `<YOUR_API_KEY>` placeholder (never fetches real key); clipboard failure wrapped in try/catch → toast.error | unit (component + integration) | `cd apps/web && pnpm vitest run src/app/admin/cameras/components/cameras-columns.test.tsx` | ✅ (existing) | ⬜ pending |
| 20-03-01 | 03 | 2 | D-02, D-06a | T-20-14 | Concurrency limit 5 caps parallel API calls; pre-filter helpers avoid redundant "already on" 400s; error message extraction strips non-Error throws to "Unknown error" | unit (library) | `cd apps/web && pnpm vitest run src/lib/bulk-actions.test.ts` | ✅ (Plan 20-01 stub) | ⬜ pending |
| 20-03-02 | 03 | 2 | D-03, D-04 | T-20-14 | BulkToolbar renders `null` when selection empty (no DOM residue, no focus trap); processing state disables action buttons to prevent re-click floods | unit (component) | `cd apps/web && pnpm vitest run src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx` | ✅ (Plan 20-01 stub) | ⬜ pending |
| 20-03-03 | 03 | 2 | D-02, D-03, D-05, D-06a, D-06b, D-07 | T-20-13, T-20-15, T-20-16, T-20-17, T-20-18, T-20-19, T-20-20 | `getRowId` pins selection to UUID (prevents post-refetch drift to wrong cameras); RLS enforces org scoping per fan-out request; React escapes camera names in delete list; single-reason shared across bulk maintenance audit rows; CSRF protection inherited from session cookie | integration (page-level) | `cd apps/web && pnpm vitest run src/app/admin/cameras/components/cameras-columns.test.tsx src/app/admin/cameras/components/__tests__/cameras-data-table.test.tsx src/components/pages/__tests__/tenant-cameras-page.test.tsx && pnpm tsc --noEmit` | ✅ (Plan 20-01 stubs) | ⬜ pending |
| 20-04-01 | 04 | 2 | D-17, D-18 | T-20-21, T-20-22, T-20-26 | Clipboard failure toast; U+2026 unicode ellipsis (grep-verified); camera.id is server-generated UUID (not user-controlled, React escapes by default) | unit (component) | `cd apps/web && pnpm vitest run src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx -t "header"` | ✅ (Plan 20-01 stub) | ⬜ pending |
| 20-04-02 | 04 | 2 | D-19, D-20, D-21, D-22 | T-20-23, T-20-24, T-20-25 | motion-reduce:animate-none paired with every motion-safe:animate-pulse (WCAG 2.3.3); aria-pressed reflects toggle state; negative-assertion guard: no setInterval/Date.now/elapsed in Record button (D-22) | unit (component) | `cd apps/web && pnpm vitest run src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx && pnpm tsc --noEmit` | ✅ (Plan 20-01 stub) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Nyquist gate:** every row has an `<automated>` command pointing to a file that exists in Wave 0 (created by Plan 20-01) or in the current codebase today (existing test files like `cameras-columns.test.tsx`). No 3-consecutive-tasks gap without a quick command.

---

## Wave 0 Requirements

Plan 20-01 creates or extends all scaffolding needed for downstream waves to resolve to green:

- [ ] `apps/web/src/app/admin/cameras/components/maintenance-reason-dialog.tsx` — MaintenanceReasonDialog component consumed by Plan 20-03
- [ ] `apps/web/src/app/admin/cameras/components/__tests__/maintenance-reason-dialog.test.tsx` — 12 concrete tests (includes focus-return test from revision 1 / M5)
- [ ] `apps/api/src/cameras/dto/maintenance.dto.ts` — Zod `enterMaintenanceBodySchema` + `EnterMaintenanceBody` type
- [ ] `apps/api/tests/cameras/maintenance-dto.test.ts` — 7 concrete DTO tests
- [ ] Extended `apps/api/tests/cameras/maintenance.test.ts` — adds reason log-output tests
- [ ] `apps/web/src/lib/bulk-actions.test.ts` — it.todo stubs for chunkedAllSettled + bulkAction + VERB_COPY + pre-filters (≥20)
- [ ] `apps/web/src/app/admin/cameras/components/__tests__/camera-status-badge.test.tsx` — it.todo stubs for StatusPills (≥15)
- [ ] `apps/web/src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx` — it.todo stubs (≥20)
- [ ] `apps/web/src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx` — it.todo stubs (≥15)
- [ ] `apps/web/src/app/admin/cameras/components/__tests__/cameras-data-table.test.tsx` — it.todo stubs (≥10) — **added in revision 1 per checker B3 option (b)** so Plan 20-03 Task 3's verify command resolves
- [ ] `apps/web/src/components/pages/__tests__/tenant-cameras-page.test.tsx` — it.todo stubs (≥25)

Framework install: NOT required. Vitest 3 (web) + Vitest 2 (api) already declared in `apps/web/package.json` and `apps/api/package.json`; `@testing-library/react 16.3.2` + `@testing-library/jest-dom 6.9.1` present in web; existing test harnesses in `apps/api/tests/cameras/*` set the pattern for api tests.

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Pulse animation timing feels right on LIVE + REC pills | D-15 | Visual aesthetics / timing perception is subjective; automated tests lock classes (motion-safe:animate-pulse present + motion-reduce:animate-none paired) but cannot judge "does it feel like it's pulsing live" vs "distracting throb" | 1. `cd apps/web && pnpm dev`. 2. Visit `/app/cameras`. 3. Trigger a streaming camera + a recording camera. 4. Watch pills pulse for ~10 seconds — should read as "alive indicator", not flashing alert. 5. Enable OS "Reduce Motion" setting → pulses stop, pill state remains legible. |
| Width transition feels smooth on Stream/Record pill buttons | D-19 | 150ms ease-out timing perception is subjective; tests assert `transition-[width,background-color] duration-150` class present but not the feel | 1. Open View Stream sheet for a camera. 2. Click Start Stream → button expands to "Stop Stream" pill. 3. Click again → button collapses back to square. 4. Repeat 3× → no jank, neighboring tab-row elements do NOT reflow. |
| Tooltip delay on ID chip feels right | D-18 + UI-SPEC §Gap Notes 5 | Tooltip 500ms default delay is a subjective "hover intent" judgement | 1. Open View Stream sheet. 2. Hover ID chip → tooltip with full UUID appears after ~500ms. 3. Move mouse away → dismiss. |
| Sticky bulk toolbar z-index doesn't clip / doesn't overlap Sheet portal | D-04 + UI-SPEC §Interaction Contracts §2 | Z-index layering correctness is easier to eyeball than test | 1. Select 3 cameras → bulk toolbar appears at top. 2. Scroll table — toolbar stays pinned. 3. Click View Stream on a row → Sheet opens; toolbar is BEHIND the sheet overlay. 4. Close sheet → toolbar still pinned. |
| Failed-row AlertTriangle hover tooltip shows error reason verbatim | D-06a | Tooltip render timing + text wrap depends on viewport — automated tests assert the error string is in the DOM but not the visual popover | 1. In dev, mock `apiFetch` to reject 1 of 3 bulk start-stream calls. 2. Trigger bulk. 3. Verify failed row shows AlertTriangle icon in Status column. 4. Hover icon → tooltip shows exact API error message. |

*All OTHER phase behaviors (DTO validation, component rendering, bulk fan-out, copy actions, pre-filter semantics, error partitioning, ARIA labels, grep-verified tokens) have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify pointing to files that exist (in Wave 0 after Plan 20-01) or already today
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task row above has a concrete command)
- [x] Wave 0 (Plan 20-01) covers all MISSING references — including `cameras-data-table.test.tsx` added in revision 1
- [x] No watch-mode flags (all commands use `vitest run`, not `vitest watch`)
- [x] Feedback latency < ~15s for quick commands
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved for execution.
