---
phase: 22
slug: camera-metadata-utilization-surface-tags-description-across
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `22-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **API Framework** | Vitest 1.x (`apps/api/vitest.config.ts`) |
| **Web Framework** | Vitest 1.x + jsdom (`apps/web/vitest.config.ts`) |
| **API Test DB** | `sms_platform_test` (isolated per quick task `260421-dlg`) |
| **API quick run** | `pnpm --filter @sms-platform/api test -- <file> -x` |
| **API full suite** | `pnpm --filter @sms-platform/api test` |
| **Web quick run** | `pnpm --filter @sms-platform/web test -- <component> -x` |
| **Web full suite** | `pnpm --filter @sms-platform/web test` |
| **Estimated runtime** | ~45s API quick · ~30s Web quick · ~3min API full · ~2min Web full |

---

## Sampling Rate

- **After every task commit:** Quick run for the touched layer (`pnpm --filter <pkg> test -- <file> -x`)
- **After every plan wave:** Both full suites (`@sms-platform/api test` AND `@sms-platform/web test`) must be green
- **Before `/gsd-verify-work`:** Full suites green AND manual smoke through 4 UI surfaces (Tags column, Notes block, name tooltip, Map popup)
- **Max feedback latency:** ~45s per task commit; ~5min per wave merge

---

## Per-Decision Verification Map

> Phase 22 has no REQ-IDs from REQUIREMENTS.md. Decision codes (D-XX) from `22-CONTEXT.md` serve as the requirement anchors.

| Task ID | Plan | Wave | Decision | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-WAVE0-01 | 01 | 0 | D-04 / D-05 | — | Trim, length 50, count 20, case-insensitive dedup at write | unit | `pnpm --filter @sms-platform/api test -- tests/cameras/tag-normalize.test.ts -x` | ❌ W0 | ⬜ pending |
| 22-WAVE0-02 | 01 | 0 | D-06 (write) | — | Camera CREATE/UPDATE populates `tagsNormalized` via Prisma extension | integration | `pnpm --filter @sms-platform/api test -- tests/cameras/tag-normalization.test.ts -x` | ❌ W0 | ⬜ pending |
| 22-W1-FILTER | 02 | 1 | D-06 (filter) | — | `?tags[]=Lobby` returns rows tagged `lobby`/`LOBBY`/`Lobby` | integration (real DB) | `pnpm --filter @sms-platform/api test -- tests/cameras/tags-filter.test.ts -x` | ❌ W0 | ⬜ pending |
| 22-W1-FILTER-PERF | 02 | 1 | D-02 (GIN index) | — | `EXPLAIN ANALYZE` shows Bitmap Index Scan, not Seq Scan | integration | `pnpm --filter @sms-platform/api test -- tests/cameras/tags-filter-perf.test.ts -x` | ❌ W0 (advisory) | ⬜ pending |
| 22-W1-BULK | 03 | 1 | D-11 / D-12 | T-22-01 (RLS) | Bulk Add/Remove idempotent, single transaction, OrgAdminGuard | integration (real DB) | `pnpm --filter @sms-platform/api test -- tests/cameras/bulk-tags.test.ts -x` | ❌ W0 | ⬜ pending |
| 22-W1-BULK-AUDIT | 03 | 1 | D-26 | — | One audit row per affected camera with `details.diff.tags` | integration | (same `bulk-tags.test.ts`) | ❌ W0 | ⬜ pending |
| 22-W1-DISTINCT | 04 | 1 | D-28 | — | `GET /cameras/tags/distinct` returns alphabetized org tags; cache hit on 2nd call | integration | `pnpm --filter @sms-platform/api test -- tests/cameras/distinct-tags.test.ts -x` | ❌ W0 | ⬜ pending |
| 22-W1-DISTINCT-RLS | 04 | 1 | D-28 (isolation) | T-22-02 (cache leak) | Org A's distinct cache never returned to Org B | integration | (same `distinct-tags.test.ts`) | ❌ W0 | ⬜ pending |
| 22-W1-AUDIT | 05 | 1 | D-24 | — | UPDATE diff for tags+description in `details.diff` (changed fields only) | integration | `pnpm --filter @sms-platform/api test -- tests/cameras/audit-diff.test.ts -x` | ❌ W0 | ⬜ pending |
| 22-W1-SANITIZER | 05 | 1 | D-24 (sanitizer) | T-22-03 (info leak) | `sanitizeDetails` preserves `diff` key (not in SENSITIVE_KEYS_PATTERN) | unit | `pnpm --filter @sms-platform/api test -- tests/audit/sanitizer-diff.test.ts -x` | ❌ W0 | ⬜ pending |
| 22-W1-WEBHOOK | 06 | 1 | D-22 | — | `camera.online`/`camera.offline` payload contains `tags: string[]` | unit | `pnpm --filter @sms-platform/api test -- tests/status/notify-dispatch.test.ts -x` | ❌ W0 (extend) | ⬜ pending |
| 22-W2-COMBOBOX | 07 | 2 | D-08 / D-09 | — | Enter commits chip, Backspace removes last, dedup case-insensitive, +Add row visible only on no-match | component | `pnpm --filter @sms-platform/web test -- tag-input-combobox -x` | ❌ W0 | ⬜ pending |
| 22-W2-CELL | 08 | 2 | D-14 / D-15 | — | TagsCell ≤3 badges + overflow `+N` tooltip listing all; empty cell when zero | component | `pnpm --filter @sms-platform/web test -- tags-cell -x` | ❌ W0 | ⬜ pending |
| 22-W2-FILTER-UI | 08 | 2 | D-06 (UI) / D-07 | — | Selecting `Lobby` in MultiSelect filter narrows visible rows | component | `pnpm --filter @sms-platform/web test -- cameras-data-table -x` | ❌ W0 (extend) | ⬜ pending |
| 22-W2-NOTES | 09 | 2 | D-16 | — | view-stream-sheet "Notes" block renders only when description non-empty | component | `pnpm --filter @sms-platform/web test -- view-stream-sheet -x` | ✅ extend | ⬜ pending |
| 22-W2-TOOLTIP | 09 | 2 | D-17 / D-18 | — | Tooltip on camera name shows description; suppressed when empty; max-w-320 | component | `pnpm --filter @sms-platform/web test -- cameras-columns-tooltip -x` | ❌ W0 | ⬜ pending |
| 22-W2-MAP-POPUP | 10 | 2 | D-19 | — | Map popup tags row + description block render conditionally | component | `pnpm --filter @sms-platform/web test -- camera-popup -x` | ✅ extend | ⬜ pending |
| 22-W2-MAP-FILTER | 10 | 2 | D-20 / D-21 | — | Map toolbar tag MultiSelect narrows visible markers (OR semantics, independent state) | component | `pnpm --filter @sms-platform/web test -- tenant-map-page -x` | ❌ W0 | ⬜ pending |
| 22-W2-BULK-UI | 11 | 2 | D-11 (UI) / D-13 | — | Bulk toolbar shows "Add tag"/"Remove tag" buttons; popover opens; no confirm dialog | component | `pnpm --filter @sms-platform/web test -- bulk-toolbar -x` | ❌ W0 (extend) | ⬜ pending |
| 22-W3-DOCS | 12 | 3 | D-23 / D-27 | — | Dev Portal docs mention `tags[]` query param + webhook payload `tags` field | smoke (string match) | `grep -lE 'tags\[\]\|"tags":' apps/web/src/app/app/developer/docs/{api-workflow,webhooks}/page.tsx` | ❌ W0 (manual OK) | ⬜ pending |
| 22-W3-VISUAL | — | 3 | All UI surfaces | — | Tags column / Notes / name tooltip / map popup render without errors in dev server | manual smoke | `pnpm --filter @sms-platform/web dev` + manual click-through | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

These test files MUST exist (as stubs at minimum) before Wave 1 can begin executing.

### API tests (10 files)

- [ ] `apps/api/tests/cameras/tag-normalize.test.ts` — pure helpers (D-04/D-05)
- [ ] `apps/api/tests/cameras/tag-normalization.test.ts` — integration: extension populates `tagsNormalized` on every write path
- [ ] `apps/api/tests/cameras/tags-filter.test.ts` — integration: case-insensitive `?tags[]=` filter
- [ ] `apps/api/tests/cameras/tags-filter-perf.test.ts` — integration: `EXPLAIN ANALYZE` asserts GIN bitmap scan (advisory — skip if brittle on CI)
- [ ] `apps/api/tests/cameras/bulk-tags.test.ts` — integration: bulk Add/Remove + per-camera audit (D-26)
- [ ] `apps/api/tests/cameras/audit-diff.test.ts` — integration: D-24 diff shape
- [ ] `apps/api/tests/cameras/distinct-tags.test.ts` — integration: D-28 endpoint + RLS isolation + cache hit
- [ ] `apps/api/tests/audit/sanitizer-diff.test.ts` — unit: `sanitizeDetails` preserves diff values
- [ ] `apps/api/tests/status/notify-dispatch.test.ts` — extend if exists, create otherwise; assert webhook payload has `tags` field

### Web tests (4 new + 4 extend)

- [ ] `apps/web/src/app/admin/cameras/components/__tests__/tag-input-combobox.test.tsx` — component: chip behavior (D-08)
- [ ] `apps/web/src/app/admin/cameras/components/__tests__/tags-cell.test.tsx` — component: ≤3 + overflow tooltip (D-14)
- [ ] `apps/web/src/app/admin/cameras/components/__tests__/cameras-columns-tooltip.test.tsx` — component: name tooltip (D-17)
- [ ] `apps/web/src/components/pages/__tests__/tenant-map-page-tag-filter.test.tsx` — component: map toolbar filter (D-20)
- [ ] EXTEND `apps/web/src/app/admin/cameras/components/__tests__/view-stream-sheet.test.tsx` — Notes block (D-16)
- [ ] EXTEND `apps/web/src/components/map/camera-popup.test.tsx` — popup tags + description (D-19) — **sibling-pattern path; NOT under `__tests__/` (matches the project convention used by `camera-marker.test.tsx` and `camera-map-inner.test.tsx`)**
- [ ] EXTEND `apps/web/src/app/admin/cameras/components/__tests__/cameras-data-table.test.tsx` — tag filter (D-06 UI)
- [ ] EXTEND `apps/web/src/app/admin/cameras/components/__tests__/bulk-toolbar.test.tsx` — bulk tag buttons (D-11 UI)

**Framework status:** ✅ Vitest already installed for both `apps/api` and `apps/web`. No framework install required. **Critical:** Integration tests MUST connect to `sms_platform_test` (not dev DB) per quick task `260421-dlg` triple-safety guards.

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Visual smoke through all 4 UI surfaces | D-14, D-16, D-17, D-19 | Final visual confirmation against UI-SPEC mockups | Start `pnpm --filter @sms-platform/web dev`, navigate to `/admin/cameras`, verify Tags column renders; click camera → "View Stream" → Notes block; hover camera name → tooltip; navigate to `/dashboard` map → click marker → popup shows tags+description |
| GIN index performance under load | D-02 | EXPLAIN ANALYZE assertion can be brittle on CI | Run `psql sms_platform -c "EXPLAIN ANALYZE SELECT * FROM \"Camera\" WHERE \"tagsNormalized\" && ARRAY['lobby']"` after seeding 1k cameras |
| Webhook delivery to a real subscriber | D-22 | Requires external listener | Set up RequestBin or local webhook receiver, configure subscription, trigger `camera.online`, verify `tags` field in delivered payload |

---

## Validation Sign-Off

- [ ] All decisions have `<automated>` verify or Wave 0 dependencies — **20/20 mapped above**
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify — **OK (every task has a test command)**
- [ ] Wave 0 covers all MISSING references — **15 test files listed (10 API + 4 Web new + 4 Web extend)**
- [ ] No watch-mode flags — **`-x` flag (no watch) used in all commands**
- [ ] Feedback latency < 60s — **~45s per task commit**
- [ ] `nyquist_compliant: true` set in frontmatter — **PENDING (set after Wave 0 lands)**

**Approval:** pending — gsd-plan-checker will gate this
