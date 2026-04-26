# Phase 22: Camera metadata utilization — surface tags & description across UI, search, and integrations - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Stop `Camera.tags` (`String[]`) and `Camera.description` (`String?`) from being write-only metadata. The phase surfaces both fields across:

1. **UI display** — Tags column in Cameras DataTable; Description in view-stream-sheet ("Notes" section); Description tooltip on camera-name hover (both table row and card view); Tags shown on Dashboard Map preview popup.
2. **Backend query** — `GET /cameras?tags[]=…` filter (case-insensitive, OR semantics); distinct-tag autocomplete endpoint for the form.
3. **Bulk operations** — Bulk "Add tag" and "Remove tag" actions that extend the Phase 20 bulk toolbar.
4. **Integration surface** — `tags: string[]` added to `camera.online` / `camera.offline` webhook payloads; before/after diff for `tags` and `description` recorded in `AuditLog.details` on camera UPDATE; Developer Portal API docs document the new filter param.

**Out of scope (deferred):**
- Tag entity refactor (`Tag` table + many-to-many) — denormalized `String[]` stays.
- Tag management page (rename/merge/recolor across all cameras) — would require the entity refactor; deferred.
- Adding `description` to webhook payload — only `tags` is included (per scope decision D-15).
- Per-tag color configuration — tag badges reuse Phase 20 status pill color tokens uniformly.
- Cross-page filter persistence (URL query params) — DataTable filter state is in-memory unless an existing pattern handles it.
- New audit log infra — leverages the existing `AuditService.log()` already wired into `cameras.service.ts`.

</domain>

<decisions>
## Implementation Decisions

### Tag data model

- **D-01:** Keep `Camera.tags` as denormalized `String[]` (Postgres array). Do **not** introduce a `Tag` entity or many-to-many table in this phase. Rationale: scope cap, no schema migration needed, supports current scale; if "Tag management page" is requested later it becomes its own phase with the refactor.
- **D-02:** Add a Postgres GIN index on `Camera.tags` to make `hasSome` filter performant. Migration: `CREATE INDEX camera_tags_gin_idx ON "Camera" USING GIN(tags)`. Planner adds this to the Prisma schema (`@@index([tags], type: Gin)`).

### Tag normalization

- **D-03:** **Case-insensitive query, preserve display capitalization.** User-entered tag strings are stored verbatim (e.g. `"Entrance Gate"` stays as-is). All query paths (filter, autocomplete, distinct lookup, dedup-on-add in bulk ops) normalize to lowercase for comparison only. Never write lowercase back to DB.
- **D-04:** **Tag uniqueness within a single camera is case-insensitive** — adding `"entrance"` to a camera that already has `"Entrance"` is a no-op (case-insensitive dedup at write time). The original casing is preserved.
- **D-05:** Trim leading/trailing whitespace on every tag string. Reject empty strings. Maximum tag length: 50 chars (enforced in DTO Zod schemas — both single and bulk paths). Maximum tags per camera: 20 (prevents accidental tag spam).

### Filter semantics

- **D-06:** **OR semantics (hasSome)** for multi-tag filter. `GET /cameras?tags[]=entrance&tags[]=lobby` returns cameras matching ANY of the given tags. Implementation: Prisma `where: { tags: { hasSome: normalizedTagsLower } }` — but since Postgres array operators are case-sensitive, the service must lowercase BOTH the query input AND wrap in a SQL `lower()`-array comparison via `$queryRaw` OR materialize a parallel lowercase array. **Planner picks the implementation** — recommended: store the original `tags` for display + add a computed/derived lowercase shadow column `tagsNormalized` populated by Prisma middleware on write, with the GIN index on the shadow column.
- **D-07:** No AND/Toggle UI in this phase — single MultiSelect with OR is the only filter behavior. AND can be added later if a use-case emerges (deferred).

### Form input UX (Add/Edit Camera)

- **D-08:** **Replace the current comma-separated `<Input>` with a chip-based combobox.** User types → autocomplete suggests existing tags from the org → Enter (or comma) commits the chip → Backspace deletes the last chip. Each chip is removable via × button. Reuse or extend an existing combobox primitive — check shadcn `<Command>` and any tag-input pattern already in the repo before building from scratch.
- **D-09:** Autocomplete data source: `GET /cameras/tags/distinct` (new endpoint) returns the org's distinct tags (case-folded for de-duplication, but original first-seen casing returned for display). Cached client-side per-form-open. Filter the suggestion list as the user types.
- **D-10:** Bulk Import dialog continues to accept comma/semicolon-separated strings in the CSV/JSON/XLSX import path (no chip UI inside the import dialog) — but the SAME write-time normalization (D-04, D-05) applies. Existing `bulkImport` parsing (`bulk-import-dialog.tsx:554-555`) stays.

### Bulk tag operations

- **D-11:** **Two modes — "Add tag" and "Remove tag"** (no Replace). Surface in the existing Phase 20 bulk toolbar (`recordings-data-table.tsx`-pattern sticky bar).
  - **Add tag**: opens a small popover with a single tag-combobox (autocomplete suggests existing org tags + allows freetext). On submit, runs `POST /cameras/bulk/tags { cameraIds: [...], action: 'add', tag: 'X' }` — server appends `X` to each camera's `tags` array, idempotent under D-04 dedup.
  - **Remove tag**: opens a popover that shows ONLY tags currently present on at least one of the selected cameras (computed from selection state on the client). User picks one → `POST /cameras/bulk/tags { cameraIds: [...], action: 'remove', tag: 'X' }`.
- **D-12:** Concurrency + failure handling: backend handles bulk in a single transaction (one Prisma `updateMany` per action). No client-side `Promise.allSettled` fan-out for tag bulk ops — different from Phase 20's stream/record bulk because the operation is atomic per-camera and cheap (no FFmpeg processes). Toast on success: `"Tag '{tag}' added to {N} cameras"` / `"Tag '{tag}' removed from {N} cameras"`. Toast on failure: standard error toast.
- **D-13:** No confirm dialog for bulk Add or Remove (non-destructive, easily reversible). This is an exception to the Phase 20 D-06b pattern, justified because tag changes are reversible in the same toolbar with one click.

### Tags column in DataTable

- **D-14:** Insert **Tags column** in the Cameras table after the Stream Profile column (position established by `quick-260425-uw0`). Cell renders up to 3 tag badges + `+N` overflow chip when more exist; hover the overflow chip to see the full list in a tooltip. Empty cell when `tags.length === 0` (no placeholder text).
- **D-15:** Tag badges reuse Phase 20 `Badge` color tokens (the same family used by Stream Profile badge per `quick-260425-uw0`). Single uniform color for tags — no per-tag color in this phase. Sort tags alphabetically within the cell for predictable order.

### Description display surfaces

- **D-16:** **view-stream-sheet "Notes" section** — render a new block under the existing camera info area (above tabs), rendered ONLY when `description` is non-empty. Plain text, line-breaks preserved. No edit affordance here (edit lives in the form).
- **D-17:** **Tooltip on the camera name** — both in the DataTable row and on the camera card-view tile. Hover the camera name → shadcn `Tooltip` shows the full `description`. Tooltip is suppressed when `description` is empty. Trigger is the name text itself (not the row), so users can hover other row elements without firing the tooltip.
- **D-18:** Description tooltip styling: max width ~320 px, line-clamp at 6 lines with ellipsis if longer (rare — DTO max is 500 chars). Default shadcn tooltip delay (no override).

### Map preview (Dashboard)

- **D-19:** **Marker popup expansion** — click on a camera marker on the Dashboard Map → existing popup gains:
  - Tag badges row (uses same Tags column rendering primitive — share component)
  - Description block (truncated at 2 lines with "Show more" expand if longer)
  Insertion point: between the existing camera-name/status block and the existing "View Stream" button.
- **D-20:** **Map toolbar tag filter** — add a MultiSelect "Filter by tag" control to the existing map toolbar (next to any existing filters). Selecting tags re-filters visible markers using the same OR semantics (D-06). Map filter state is local to the page — no URL persistence in this phase.
- **D-21:** Filter state syncing: the map page's tag filter is INDEPENDENT of the cameras-table tag filter (different page, different state). No cross-page sync.

### Webhook payload

- **D-22:** Extend `camera.online` and `camera.offline` payload to include `tags: string[]`. Final payload shape:
  ```ts
  { cameraId, status, previousStatus, timestamp, tags: string[] }
  ```
  Additive only. **Do not include `description`** — tags drive use-cases (tag-based alert subscriptions), description does not. `cameraName` also stays out (consumers can fetch by `cameraId` if needed). Source of `tags`: the camera record at dispatch time (read inside `notify-dispatch.processor.ts` before `emitEvent`).
- **D-23:** Document the new field in webhook delivery docs / Dev Portal under the `camera.*` event schema. Backwards-compatible: existing subscribers ignore unknown fields.

### Audit log

- **D-24:** When a camera UPDATE includes `tags` or `description` changes, the `AuditService.log()` call in `cameras.service.ts:571` must include a structured before/after diff in `details`:
  ```ts
  details: {
    ...sanitizedRequestBody,
    diff: {
      tags: { before: oldTags, after: newTags },
      description: { before: oldDescription, after: newDescription }
    }
  }
  ```
  Only include `diff` keys for fields that actually changed (skip unchanged fields). Diff is computed in the service after fetching the prior state inside the same transaction.
- **D-25:** Existing `AuditService.log()` in `cameras.service.ts:221` (camera CREATE) records the initial tags/description in the standard `details` blob — no diff needed (before is null/empty).
- **D-26:** Bulk tag ops (Add/Remove) emit ONE `AuditLog` entry per affected camera, with `action: 'update'`, `resource: 'camera'`, and `details.diff.tags` showing per-camera before/after. This makes bulk audit consistent with single-camera updates and makes the admin audit log queryable per-camera.

### Developer Portal API docs

- **D-27:** Update Dev Portal API reference (the static-template page per `quick-260426-2vj`) to document the new query params: `tags[]` (filter, OR semantics), and the `tags` field added to webhook event payloads. Use static placeholders only — never inject the user's account data (per `feedback_api_docs_static_templates`). Keep copy English (per `feedback_language_english_default`).

### Distinct tags endpoint

- **D-28:** New endpoint: `GET /cameras/tags/distinct` returns `{ tags: string[] }` — the alphabetized list of distinct tags across the requesting org's cameras (case-folded for de-duplication, original casing returned for display). Auth: standard Org Admin auth (existing camera read permissions). Response is cacheable (Redis or in-memory, planner picks). Used by both the form chip combobox (D-09) and the table/map MultiSelect filters.

### Folded Todos

None — `gsd-tools todo match-phase 22` returned 0 matches.

### Claude's Discretion

- Exact chip combobox component: reuse shadcn `<Command>` if a tag-input variant already exists in the repo, otherwise build a minimal one. **Show mockup before committing if building from scratch** (per `feedback_ui_pro_minimal`).
- Caching strategy for `/cameras/tags/distinct` (Redis vs in-process LRU vs none + DB-side index reliance).
- Exact Prisma migration approach for the lowercase-shadow strategy (D-06): middleware vs trigger vs computed column.
- Tooltip delay tuning (use shadcn defaults unless they feel sluggish in QA).
- Map popup truncation threshold for description (2 lines by default; planner adjusts if cramped).
- Bulk tag popover layout (horizontal vs stacked, exact width).
- Whether `Camera.tags` should also gain a `tagsLowercase` materialized column or be solved purely via `$queryRaw` — planner decides based on Prisma 6 capabilities.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing audit context (this phase's discovery)
- `.planning/phases/22-camera-metadata-utilization-surface-tags-description-across-/22-AUDIT.md` — Full coverage matrix of where tags/description are currently written/read; lists every file:line currently touching either field.

### Prior phase decisions that still apply
- `.planning/phases/20-cameras-ux-bulk-actions-maintenance-toggle-copy-id-expressiv/20-CONTEXT.md` §D-04/D-05/D-06a — Bulk toolbar pattern (sticky top, `recordings-data-table.tsx` reference, partial-failure UX). Phase 22 bulk tag ops slot into this exact toolbar.
- `.planning/phases/20-cameras-ux-bulk-actions-maintenance-toggle-copy-id-expressiv/20-CONTEXT.md` §D-13 — Status pill color tokens; Phase 22 tag badges reuse the same color family for visual consistency.
- `.planning/phases/19-camera-input-validation-and-multi-protocol-support-rtmp-rtmp/19-CONTEXT.md` — Camera input validation patterns (DTO Zod, normalization rules); Phase 22 tag length/uniqueness validation follows the same patterns.
- `.planning/phases/18-dashboard-map-polish/18-CONTEXT.md` — Dashboard Map structure (markers, popup, toolbar); Phase 22 D-19/D-20 extend these.

### Existing code (read before modifying)

**Backend (cameras):**
- `apps/api/src/cameras/cameras.service.ts:185-190` — Camera CREATE assigns description + tags
- `apps/api/src/cameras/cameras.service.ts:221` — Existing `auditService.log()` call on CREATE (D-25)
- `apps/api/src/cameras/cameras.service.ts:261-278` — `findAllCameras()` — add `tags` filter param here
- `apps/api/src/cameras/cameras.service.ts:280-294` — `findCameraById()`
- `apps/api/src/cameras/cameras.service.ts:320-322` — UPDATE applies via `data: safe` — needs prior-state fetch for diff (D-24)
- `apps/api/src/cameras/cameras.service.ts:571` — Existing `auditService.log()` call on UPDATE (D-24)
- `apps/api/src/cameras/cameras.service.ts:842-846` — Bulk import loop
- `apps/api/src/cameras/cameras.controller.ts:201-217` — GET endpoints (add `?tags[]=` query param) + serializeCamera
- `apps/api/src/cameras/dto/create-camera.dto.ts:13,20` — tag/description DTOs (add length+count limits per D-05)
- `apps/api/src/cameras/dto/update-camera.dto.ts:20,28`
- `apps/api/src/cameras/dto/bulk-import.dto.ts:11,18`

**Backend (audit + webhooks):**
- `apps/api/src/audit/audit.service.ts:44-54` — `AuditService.log()` writes via systemPrisma; `details` is sanitized before write — confirm sanitizer doesn't strip the `diff` key
- `apps/api/src/prisma/schema.prisma:432-449` — `AuditLog` model (no schema change needed; `details: Json?` accommodates the new diff)
- `apps/api/src/webhooks/webhooks.service.ts:102-144` — `emitEvent(orgId, eventType, payload)` — generic `Record<string, any>` accepts additive fields
- `apps/api/src/status/processors/notify-dispatch.processor.ts:51-58` — Where `camera.online`/`camera.offline` payload is composed; D-22 extends this
- `apps/api/src/webhooks/dto/create-webhook.dto.ts:4-7` — Subscribed event types list (no change — events stay the same, only payload changes)

**Backend (Prisma + indexes):**
- `apps/api/src/prisma/schema.prisma:199-240` — Camera model (add `@@index([tags], type: Gin)` per D-02)

**Frontend (cameras):**
- `apps/web/src/app/admin/cameras/components/cameras-data-table.tsx` — DataTable with `enableRowSelection`; add Tags column + filter MultiSelect here
- `apps/web/src/app/admin/cameras/components/cameras-columns.tsx:49-50,71-126,226-251` — Column defs (add Tags column after Stream Profile per D-14); row actions menu
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx:74-75,114-117,225-233` — Replace comma-string tag input with chip combobox (D-08)
- `apps/web/src/app/admin/cameras/components/bulk-import-dialog.tsx:554-555,564` — CSV tag parsing stays unchanged (D-10)
- `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx` — Add Notes section (D-16)
- `apps/web/src/app/admin/cameras/components/CameraStatusPill.tsx` (extracted in `quick-260425-vrl`) — Reuse Badge styling pattern for tag badges
- `apps/web/src/components/pages/tenant-cameras-page.tsx` — Page host; bulk-toolbar tag actions plug in alongside Phase 20 actions

**Frontend (dashboard map):**
- Find map components under `apps/web/src/app/dashboard/**` or wherever Phase 18 landed — agents must locate via grep before planning. Map popup component + toolbar are the two attach points (D-19/D-20).

**Frontend (DataTable primitives):**
- `apps/web/src/components/ui/data-table/data-table.tsx` — Filter bar primitives; check whether existing siteId-filter pattern can be generalized for tags
- shadcn `<Command>` and `<Popover>` — primitives for chip combobox + bulk popover
- shadcn `<Tooltip>` — for D-17

**Developer Portal:**
- Static-template Overview pages from `quick-260426-2vj` — reference for placeholder convention. Find webhook event docs in the same area.

### User preferences (auto-memory)
- `~/.claude/projects/.../memory/feedback_language_english_default.md` — All UI strings (button labels, tooltips, toast text, badge text) in English.
- `~/.claude/projects/.../memory/feedback_ui_pro_minimal.md` — Pro-minimal aesthetic; show mockup before committing the chip combobox if built from scratch.
- `~/.claude/projects/.../memory/feedback_api_docs_static_templates.md` — Dev Portal docs use static placeholders; no auto-injection of account data.
- `~/.claude/projects/.../memory/feedback_prisma_regenerate.md` — Schema edits (the GIN index in D-02) require `db:push` + rebuild + restart workflow.
- `~/.claude/projects/.../memory/saas_role_architecture.md` — Tags/description live in the Org Admin (tenant) surface; Super Admin pages don't need parity in this phase unless components are shared.

### ROADMAP
- `.planning/ROADMAP.md` Phase 22 entry — Goal/Depends-on. Update with the resolved goal during planning.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Audit infrastructure is already wired.** `AuditService.log({ action, resource, resourceId, details })` is functional and called from `cameras.service.ts:221` (CREATE) and `:571` (UPDATE). `details: Json?` accepts arbitrary structure, so the before/after diff (D-24) is purely additive. Sanitizer in `audit.service.ts:8-12` recursively redacts sensitive keys but should leave `diff` untouched (verify in planning).
- **Webhook event dispatch is generic.** `WebhooksService.emitEvent(orgId, eventType, payload: Record<string, any>)` accepts any payload shape. Adding `tags` to the camera-event payload is a localized change in `notify-dispatch.processor.ts:52-57`.
- **Bulk toolbar already exists** from Phase 20. Phase 22 adds two new actions (Add tag, Remove tag) to the same toolbar — no new toolbar primitive.
- **Phase 20 status pills** establish the badge color/style language. Tag badges adopt the same family.
- **`AuditLog` model has `@@index([orgId, resource])`** — already efficient for "show me all camera audit entries" queries the admin page uses.

### Established Patterns

- **DataTable filter pattern** — siteId filter (per Phase 14/20 pattern) uses a single-select; Phase 22 introduces the FIRST MultiSelect filter. The primitive may need a small generalization. Recommended: read `data-table.tsx` filter contract first, build a `MultiSelectFilter` adjacent to existing `Filter` if needed.
- **Form normalization happens in the service, not the DTO** — DTOs do shape/length validation; cameras.service.ts applies trimming and other normalization. Tag normalization (D-04/D-05) follows this convention.
- **Prisma `hasSome` for array filtering** — already used elsewhere in the codebase (verify in planning); confirm Postgres GIN index is needed or whether `hasSome` is fast enough at current scale without indexing.
- **`navigator.clipboard.writeText` + Sonner toast** — pattern from `quick-260426-29p` and Phase 20 D-09; used for any user-facing async feedback.
- **Phase 20 `Promise.allSettled` fan-out** does NOT apply here — tag bulk ops use single-transaction `updateMany`, not per-camera HTTP calls (D-12).

### Integration Points

- **Cameras DataTable** — Tags column (D-14), MultiSelect filter (D-06), bulk toolbar Add/Remove tag actions (D-11), description tooltip on name cell (D-17).
- **Camera form (Add/Edit)** — replace tag input with chip combobox (D-08); fetch distinct tags from the new endpoint on form open (D-09).
- **view-stream-sheet** — Notes block (D-16).
- **Camera card view** — Tooltip on name (D-17).
- **Dashboard Map page** — popup expansion (D-19), toolbar tag filter (D-20).
- **`notify-dispatch.processor.ts`** — augment payload (D-22) — read camera tags before `emitEvent`.
- **`cameras.service.ts` UPDATE** — fetch prior-state inside the same transaction, compute diff, pass into `auditService.log()` (D-24).
- **Bulk endpoints** — new controller routes `POST /cameras/bulk/tags` for Add/Remove (D-11/D-26).
- **Distinct tags endpoint** — new `GET /cameras/tags/distinct` (D-28).
- **Dev Portal docs** — update tags filter param section + webhook payload schema (D-27).

</code_context>

<specifics>
## Specific Ideas

- "ดูแบบ Linear's filter chips" / Gmail-style multi-select — both established as the visual reference in Phase 20 selection toolbar context. Tag MultiSelect filter should match that hierarchy: chip per active tag, click × to remove, "Clear all" affordance.
- The user explicitly added two scope items beyond the audit's 9: **table-row tooltip on camera name** (not just card view) and **map preview gets tags**. Both signal the user wants tag/description visibility wherever a camera surfaces in the product, not just on the cameras-table page.
- Description never auto-injects on the API/webhook side — only `tags` does. The `description` field is a HUMAN-FACING annotation, not machine-actionable metadata. Keep it out of payloads where it has no use case (D-22).

</specifics>

<deferred>
## Deferred Ideas

- **Tag entity refactor** (`Tag` table + many-to-many) — required for tag rename/merge/recolor across cameras. Becomes its own phase if the user requests tag management.
- **Tag management page** (`/admin/tags`) — list all tags across the org, rename, merge, delete-cascade. Depends on the entity refactor above.
- **Per-tag color** — currently all tags use the same Phase 20 color token. Per-tag color requires either a Tag entity (with a `color` field) or a hash-based color function — deferred.
- **AND filter semantics + UI toggle** for multi-tag filter (D-07) — only OR ships in this phase; AND can be added later.
- **`description` in webhook payload** — kept out per D-22; revisit if a use-case emerges.
- **`cameraName` in webhook payload** — kept out per D-22; consumers can fetch by `cameraId`.
- **Cross-page filter URL persistence** — table tag filter and map tag filter are independent and in-memory only. URL persistence and cross-page sync are deferred.
- **Tag-based webhook subscription routing** — current proposal includes tags in the payload, but does NOT add server-side subscription filters like "only deliver `camera.offline` events for cameras tagged 'perimeter'". Subscribers do client-side filtering. Server-side filter routing is deferred.
- **Audit log per-page UI for tag/description history** — the diff lands in `AuditLog.details`, but this phase doesn't add a new admin UI to surface per-camera tag history. The existing audit log admin page (if any) shows it via the `details` JSON. Dedicated UI deferred.
- **Tag autocomplete with frequency hints** — show "(used in 12 cameras)" next to suggestions. Nice-to-have, deferred.
- **Bulk Replace-all-tags mode** — only Add and Remove ship; Replace can be added later if a normalization workflow needs it (D-11).
- **Inline bulk tag confirmation dialog** — No confirm dialog (D-13). If user feedback flags accidental bulk changes, revisit.

### Reviewed Todos (not folded)

None reviewed — `gsd-tools todo match-phase 22` returned 0 matches.

</deferred>

---

*Phase: 22-camera-metadata-utilization-surface-tags-description-across-*
*Context gathered: 2026-04-26*
