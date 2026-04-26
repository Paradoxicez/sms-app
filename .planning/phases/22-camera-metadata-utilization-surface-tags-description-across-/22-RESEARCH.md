# Phase 22: Camera metadata utilization — surface tags & description across UI, search, and integrations - Research

**Researched:** 2026-04-26
**Domain:** Postgres array filtering (case-insensitive), Prisma 6 extensions, shadcn `<Command>` chip combobox composition, TanStack DataTable faceted multi-select, NestJS bulk endpoint patterns
**Confidence:** HIGH (workaround paths verified against Prisma GitHub issues; existing repo patterns confirmed via direct read; no greenfield assumptions)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tag data model**
- **D-01:** Keep `Camera.tags` as denormalized `String[]` (Postgres array). Do **not** introduce a `Tag` entity or many-to-many table in this phase.
- **D-02:** Add a Postgres GIN index on `Camera.tags` to make `hasSome` filter performant. Migration: `CREATE INDEX camera_tags_gin_idx ON "Camera" USING GIN(tags)`. Planner adds this to the Prisma schema (`@@index([tags], type: Gin)`).

**Tag normalization**
- **D-03:** **Case-insensitive query, preserve display capitalization.** User-entered tag strings are stored verbatim. All query paths normalize to lowercase for comparison only. Never write lowercase back to DB.
- **D-04:** **Tag uniqueness within a single camera is case-insensitive** — adding `"entrance"` to a camera that already has `"Entrance"` is a no-op (case-insensitive dedup at write time).
- **D-05:** Trim leading/trailing whitespace on every tag string. Reject empty strings. Maximum tag length: 50 chars (enforced in DTO Zod schemas — both single and bulk paths). Maximum tags per camera: 20.

**Filter semantics**
- **D-06:** **OR semantics (hasSome)** for multi-tag filter. Implementation: planner picks; recommended store original `tags` for display + add a derived lowercase shadow column `tagsNormalized` populated by Prisma extension on write, GIN-indexed.
- **D-07:** No AND/Toggle UI in this phase.

**Form input UX (Add/Edit Camera)**
- **D-08:** Replace comma-separated `<Input>` with chip-based combobox (autocomplete, Enter/comma to commit, Backspace to remove last).
- **D-09:** Autocomplete data source: `GET /cameras/tags/distinct` (new endpoint) — case-folded for de-dup, original first-seen casing returned for display.
- **D-10:** Bulk Import dialog continues comma/semicolon-separated parsing — same write-time normalization applies.

**Bulk tag operations**
- **D-11:** **Two modes — "Add tag" and "Remove tag"** (no Replace). `POST /cameras/bulk/tags { cameraIds, action: 'add'|'remove', tag }`.
- **D-12:** Backend handles bulk in a single transaction (one Prisma `updateMany` per action). Toast: `"Tag '{tag}' added to {N} cameras"`.
- **D-13:** No confirm dialog for bulk Add or Remove (non-destructive, easily reversible).

**Tags column in DataTable**
- **D-14:** Insert Tags column after Stream Profile column. Cell renders up to 3 tag badges + `+N` overflow chip. Empty cell when `tags.length === 0`.
- **D-15:** Tag badges reuse Phase 20 `Badge` color tokens (single uniform color, no per-tag color). Sort tags alphabetically within the cell.

**Description display surfaces**
- **D-16:** **view-stream-sheet "Notes" section** under camera info area, only when `description` non-empty. Plain text, line-breaks preserved.
- **D-17:** **Tooltip on the camera name** — both DataTable row + camera card-view tile. Trigger is the name text itself.
- **D-18:** Tooltip styling: max width ~320 px, line-clamp at 6 lines.

**Map preview (Dashboard)**
- **D-19:** **Marker popup expansion** — Tag badges row + Description block (truncated 2 lines + "Show more").
- **D-20:** **Map toolbar tag filter** — MultiSelect "Filter by tag" — same OR semantics.
- **D-21:** Filter state independent between cameras-table and map-page.

**Webhook payload**
- **D-22:** Extend `camera.online` and `camera.offline` payload to include `tags: string[]`. Final shape: `{ cameraId, status, previousStatus, timestamp, tags: string[] }`. Do not include `description`. `cameraName` stays out.
- **D-23:** Document new field in webhook docs.

**Audit log**
- **D-24:** When camera UPDATE includes `tags` or `description` changes, `AuditService.log()` call must include `details.diff: { tags: { before, after }, description: { before, after } }` — only fields that actually changed.
- **D-25:** Existing CREATE audit log records initial tags/description in standard `details` blob — no diff needed.
- **D-26:** Bulk tag ops emit ONE `AuditLog` entry per affected camera with `details.diff.tags`.

**Developer Portal API docs**
- **D-27:** Update Dev Portal API reference to document new `tags[]` query param + `tags` field in webhook payloads. Static placeholders only.

**Distinct tags endpoint**
- **D-28:** `GET /cameras/tags/distinct` returns `{ tags: string[] }` — alphabetized list of distinct tags across requesting org's cameras (case-folded de-dup, original casing). Cacheable (Redis or in-memory, planner picks).

### Claude's Discretion

- Exact chip combobox component (reuse vs build-new — show mockup before committing if built from scratch).
- Caching strategy for `/cameras/tags/distinct` (Redis vs in-process LRU vs none).
- Exact Prisma migration approach for lowercase-shadow strategy (D-06): middleware vs trigger vs computed column.
- Tooltip delay tuning.
- Map popup truncation threshold for description.
- Bulk tag popover layout.
- Whether `Camera.tags` gains `tagsLowercase` materialized column or solved via `$queryRaw`.

### Deferred Ideas (OUT OF SCOPE)

- **Tag entity refactor** (`Tag` table + many-to-many).
- **Tag management page** (`/admin/tags`) — list/rename/merge/delete.
- **Per-tag color**.
- **AND filter semantics + UI toggle** for multi-tag filter (D-07).
- **`description` in webhook payload**.
- **`cameraName` in webhook payload**.
- **Cross-page filter URL persistence**.
- **Tag-based webhook subscription routing** (server-side filter delivery by tag).
- **Audit log per-page UI for tag/description history** — diff lands in JSON; no dedicated UI.
- **Tag autocomplete with frequency hints** ("used in 12 cameras").
- **Bulk Replace-all-tags mode** — only Add and Remove ship.
- **Inline bulk tag confirmation dialog** — no confirm (D-13).
</user_constraints>

---

## Project Constraints (from CLAUDE.md)

These directives are extracted from `./CLAUDE.md` and apply to every plan/task in this phase. Treat with the same authority as locked decisions.

1. **Prisma schema change workflow (CRITICAL).** D-02 modifies `apps/api/src/prisma/schema.prisma` (adds GIN index) and the recommended D-06 path adds a `tagsNormalized String[]` column. Both schema mutations require the full 4-step workflow:
   1. `pnpm --filter @sms-platform/api db:push` — applies schema to Postgres AND regenerates Prisma client (the script chains `prisma generate`).
   2. `pnpm --filter @sms-platform/api build` — SWC re-bundles new client types.
   3. Restart EVERY long-running API process (`start:dev` for tsx-watch, `start:prod` for `node dist/main`).
   4. Verify via `curl http://localhost:3003/api/srs/callbacks/metrics` — `archives` block must NOT show `status: failing` referencing the new field.

   Skipping any step produces silent runtime errors caught in controller try/catch — DB rows appear to write but the new field never persists (verified via `feedback_prisma_regenerate.md` memory).

2. **CSP/sanitization carryover (audit details).** Existing `sanitizeDetails` in `apps/api/src/audit/audit.service.ts:7-22` uses `SENSITIVE_KEYS_PATTERN = /password|secret|token|apiKey|keyHash/i`. The `diff` key is NOT matched — `details.diff.tags` and `details.diff.description` survive sanitization. **Verified by direct read** — no sanitizer change needed for D-24.

3. **Stream engine constraints irrelevant to this phase.** SRS deep dive in CLAUDE.md does not apply — Phase 22 touches no stream/codec/HLS/transcoding code paths.

4. **GSD workflow enforcement.** All edits go through GSD commands. Phase 22 plans land via `/gsd-execute-phase`.

5. **Memory directives:**
   - `feedback_language_english_default.md` — every UI string in this phase stays English.
   - `feedback_ui_pro_minimal.md` — show TagInputCombobox mockup before committing (UI-SPEC §Component Inventory acknowledges this — single composite spec exists).
   - `feedback_api_docs_static_templates.md` — Dev Portal docs (D-27) use `CAMERA_ID`, `YOUR_API_KEY` placeholders, never inject real account data.
   - `saas_role_architecture.md` — Tags/description live in Org Admin (`/app/cameras`, `/app/map`) surface; Super Admin pages (`/admin/cameras`, `/admin/map`) inherit ONLY if a shared component is reused — no parity work in Phase 22.

---

## Summary

Phase 22 stops `Camera.tags: String[]` and `Camera.description: String?` from being write-only metadata. Both fields persist correctly today (verified in 22-AUDIT.md coverage matrix) but never surface anywhere after the form save. This phase adds:

1. **4 UI display surfaces:** Tags column (DataTable) + view-stream-sheet Notes block + name-cell tooltip (table + card) + Map popup tags row + description.
2. **3 backend surfaces:** `?tags[]=` filter on `GET /cameras` (case-insensitive OR semantics, GIN-indexed), distinct-tag autocomplete endpoint, and `POST /cameras/bulk/tags` for Add/Remove.
3. **3 integration surfaces:** `tags: string[]` added to `camera.online`/`camera.offline` webhook payloads, before/after diff in `AuditLog.details` for `tags` and `description` UPDATE, Dev Portal docs for the new filter param + webhook payload field.

**Primary recommendation:** Execute D-06 with **Approach A (shadow lowercase column `tagsNormalized: String[]` populated via Prisma Client Extension)** — the only approach that preserves Prisma type safety, leverages a GIN index for filter performance, and integrates cleanly with the existing `prisma-tenancy.extension.ts` extension pattern. CITEXT arrays are blocked by Prisma 6 issue #28349 (parser bug); pure `$queryRaw` works but loses the type-safe builder for `findMany` and forces every reader to drop into raw SQL. The shadow column adds one DB column + a 3-line extension hook, and the GIN index runs against the lowercase data — exactly what `hasSome` will query.

---

## Standard Stack

### Core (already installed — verified in repo)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | `^6.19.3` `[VERIFIED: apps/api/package.json]` | Type-safe DB access, query builder, extensions | Project's existing ORM; D-02 GIN index syntax + `$extends` already in use (`prisma-tenancy.extension.ts`) |
| `prisma` | `^6.19.3` `[VERIFIED: apps/api/package.json]` | Schema, migrations, client codegen | Required to declare `@@index([fieldName(ops: ArrayOps)], type: Gin)` |
| `ioredis` | `^5.10.1` `[VERIFIED: apps/api/package.json]` | Redis client (`REDIS_CLIENT` symbol DI pattern) | Existing pattern in `api-keys/api-keys.module.ts:25` and `streams/streams.module.ts:47` — used for D-28 cache |
| `zod` | `^3.25.76` `[VERIFIED: apps/api/package.json]` | DTO validation (D-05 length/count limits) | Existing pattern in all camera DTOs |
| `cmdk` | `^1.1.1` `[VERIFIED: apps/web/package.json]` | Headless command-menu primitive — backs shadcn `<Command>` | Required base for the chip combobox composite |
| `sonner` | `^2.0.7` `[VERIFIED: apps/web/package.json]` | Toast notifications | Existing pattern (Phase 20 D-09, `quick-260426-29p`) |
| `@base-ui/react` | `^1.3.0` `[VERIFIED: apps/web/package.json]` | Popover/Tooltip primitives wrapping shadcn | Already in components.json `base-nova` preset |

**Latest registry versions (informational):**
- `@prisma/client@7.8.0` `[VERIFIED: npm view @prisma/client version, 2026-04-26]` — project pinned to 6.19.3, do NOT bump in this phase.
- `cmdk@1.1.1` `[VERIFIED: npm view cmdk version, 2026-04-26]` — current.
- `zod@4.3.6` `[VERIFIED: npm view zod version, 2026-04-26]` — project pinned to 3.25.76, no bump needed.

### Supporting (no new installs required — all Phase 22 work composes existing primitives)

| Library | Used For | Source |
|---------|----------|--------|
| `@nestjs/bullmq` | (No bulk job queue — D-12 says single transaction, no fan-out) | n/a |
| `@tanstack/react-table` | DataTable filterFn for Tags column (`apps/web/src/app/admin/cameras/components/cameras-columns.tsx:166` shows filterFn pattern) | Existing |
| `lucide-react` | `Plus`, `X`, `Search` icons for chip combobox + bulk popovers | Existing in chip combobox spec |

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Decision |
|------------|-----------|----------|----------|
| Shadow `tagsNormalized` column (D-06 approach A) | `$queryRaw` ad-hoc per filter call | Loses Prisma type safety for `findMany`; every reader drops into SQL; can't compose with other `where` filters cleanly | **Rejected** — A is cleaner for project's existing select/include patterns |
| Shadow `tagsNormalized` column | Postgres expression GIN index `USING GIN(LOWER(tags::text)::tsvector)` | Index exists but Prisma `hasSome` translates to `tags && ARRAY[...]` not `LOWER(tags) && ARRAY[...]` — index is bypassed; only a `$queryRaw` would hit it; same problem as raw approach | **Rejected** — index is wasted unless every reader uses raw SQL |
| Shadow `tagsNormalized` column | `String[] @db.Citext` (Postgres CITEXT arrays) | **BLOCKED** — Prisma 6 has a known parser bug (issue #28349) that fails to parse CITEXT array results | **Rejected** — confirmed-broken in current Prisma 6.x |
| Redis cache for `/cameras/tags/distinct` (D-28) | In-process Map with TTL | Map invalidates per-process; multi-replica deployment causes inconsistent hints; project already deploys single API process per `docker-compose` but bullmq workers are separate | **Use Redis** — existing `REDIS_CLIENT` pattern means zero new infra; TTL 60s; key `tags:distinct:{orgId}`. Falls back to in-memory on Redis failure. |
| Build new chip combobox | Reuse existing primitive | **None exists** — `grep -r "tag-input\|chip-input\|TagInput\|ChipInput\|TagCombobox" apps/web/src` returns 0 matches | **Build new** — `TagInputCombobox` from shadcn `<Command>` + `<Popover>` + `<Badge>` (per UI-SPEC §Component Inventory) |
| Bulk endpoint single-tag-per-call (D-11) | Multiple-tag-per-call | Simpler client/server validation; matches D-11 spec; small UX cost (user repeats action for 2nd tag) | **Single-tag** — per D-11 lock |

**Installation:**
```bash
# No new installs required — every dependency is present.
# (Verify with: pnpm --filter @sms-platform/api list @prisma/client zod ioredis)
```

---

## Architecture Patterns

### Recommended Project Structure (additions, not replacement)

```
apps/api/src/
├── cameras/
│   ├── cameras.service.ts          # ADD: tag normalize/dedup helpers; UPDATE w/ diff (D-24); bulk tag method (D-11/D-12); distinct-tags method (D-28)
│   ├── cameras.controller.ts       # ADD: GET /cameras?tags[]= query param; POST /cameras/bulk/tags; GET /cameras/tags/distinct
│   ├── tag-normalize.ts            # NEW: trim + length + count + case-insensitive dedup (D-04/D-05) — pure helpers
│   ├── tag-cache.service.ts        # NEW: Redis-backed distinct-tag cache w/ in-memory fallback (D-28)
│   └── dto/
│       ├── create-camera.dto.ts    # MODIFY: add z.string().min(1).max(50) per element + .max(20) on array
│       ├── update-camera.dto.ts    # MODIFY: same
│       ├── bulk-import.dto.ts      # MODIFY: same
│       └── bulk-tags.dto.ts        # NEW: { cameraIds: uuid[], action: 'add'|'remove', tag: string }
└── prisma/
    ├── schema.prisma               # MODIFY: Camera.tagsNormalized String[] + @@index([tagsNormalized(ops: ArrayOps)], type: Gin)
    └── migrations/
        └── camera_tags_normalized/
            └── migration.sql       # NEW: ALTER TABLE + UPDATE backfill + CREATE INDEX

apps/web/src/app/admin/cameras/components/
├── tag-input-combobox.tsx          # NEW: D-08 chip combobox (UI-SPEC §"Chip combobox spec")
├── tags-cell.tsx                   # NEW: D-14 ≤3 badges + +N overflow w/ tooltip (also reused by map popup per UI-SPEC)
├── bulk-add-tag-popover.tsx        # NEW: bulk Add tag popover (D-11)
├── bulk-remove-tag-popover.tsx     # NEW: bulk Remove tag popover (D-11)
├── cameras-columns.tsx             # MODIFY: insert Tags column + name-cell Tooltip wrap (D-14, D-17)
├── cameras-data-table.tsx          # MODIFY: add 'tags' to facetedFilters[] (line 173-195)
├── camera-form-dialog.tsx          # MODIFY: replace tag <Input> with TagInputCombobox (line 642-650 per UI-SPEC)
├── camera-card.tsx                 # MODIFY: name Tooltip wrap (line 177)
├── view-stream-sheet.tsx           # MODIFY: add Notes block (around line 149)
└── bulk-toolbar.tsx                # MODIFY: add "Add tag" + "Remove tag" buttons (after line 99)

apps/web/src/components/map/
├── camera-map.tsx                  # MODIFY: extend MapCamera interface with tags?: string[]; description?: string
├── camera-popup.tsx                # MODIFY: insert tags row + description block (between line 207 and 213 per UI-SPEC)
└── (NEW) map-toolbar-tag-filter.tsx # NEW or extension: MultiSelect filter for D-20

apps/web/src/components/pages/
├── tenant-cameras-page.tsx         # MODIFY: wire bulk Add/Remove tag callbacks; pass distinct-tags to facetedFilters
└── tenant-map-page.tsx             # MODIFY: extend MapCamera mapping (line 130-143) with tags + description; add tag-filter state

apps/web/src/app/app/developer/docs/
├── api-workflow/page.tsx           # MODIFY: document ?tags[]= filter param (D-23/D-27)
└── webhooks/page.tsx               # MODIFY: document tags field in camera.online/offline payload (D-22/D-23)
```

### Pattern 1: Prisma Client Extension for write-time tag normalization (D-06 implementation)

**What:** Add a `query.camera` extension that intercepts `create`/`createMany`/`update`/`updateMany`/`upsert` to populate `tagsNormalized` from `tags` (lowercase, trim, dedup).
**When to use:** Every Camera write must keep `tagsNormalized` in sync with `tags`. Doing it in the service layer would force every callpath (CRUD, bulk import, bulk tag op, future paths) to remember to set both fields — extension is the only chokepoint.
**Why extension over middleware:** `prisma.$use()` middleware was removed from Prisma's recommended path in v5+ in favor of `$extends`. Existing code (`prisma-tenancy.extension.ts:7`) confirms the project is on `$extends`. **Source: `apps/api/src/tenancy/prisma-tenancy.extension.ts` direct read.**

**Example sketch:**
```ts
// apps/api/src/cameras/camera-tag.extension.ts (NEW)
// Source: pattern verified against apps/api/src/tenancy/prisma-tenancy.extension.ts:1-40
import { PrismaClient } from '@prisma/client';

export function createTagNormalizationExtension(prisma: PrismaClient) {
  return prisma.$extends({
    query: {
      camera: {
        async create({ args, query }) {
          if (Array.isArray(args.data?.tags)) {
            args.data.tagsNormalized = normalizeForDb(args.data.tags);
          }
          return query(args);
        },
        async update({ args, query }) {
          if (Array.isArray((args.data as any)?.tags)) {
            (args.data as any).tagsNormalized = normalizeForDb(
              (args.data as any).tags as string[],
            );
          }
          return query(args);
        },
        async updateMany({ args, query }) {
          // updateMany cannot mutate per-row; D-12 bulk uses raw $executeRaw
          // OR per-row tx — see "Bulk tag op pattern" below.
          return query(args);
        },
        async upsert({ args, query }) {
          if (Array.isArray(args.create?.tags)) {
            args.create.tagsNormalized = normalizeForDb(args.create.tags);
          }
          if (Array.isArray((args.update as any)?.tags)) {
            (args.update as any).tagsNormalized = normalizeForDb(
              (args.update as any).tags as string[],
            );
          }
          return query(args);
        },
      },
    },
  });
}

function normalizeForDb(tags: string[]): string[] {
  // Dedup case-insensitively but preserve first-seen casing in `tags`;
  // tagsNormalized is purely the lowercase set for filter/index use.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const k = trimmed.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}
```

**Filter use:**
```ts
// apps/api/src/cameras/cameras.service.ts findAllCameras
const where: any = {};
if (siteId) where.siteId = siteId;
if (tags?.length) {
  where.tagsNormalized = {
    hasSome: tags.map((t) => t.toLowerCase()),
  };
}
return this.tenancy.camera.findMany({ where, orderBy: { createdAt: 'desc' }, include: { ... } });
```

This hits the GIN index because the column is indexed AND the `hasSome` operator translates to `tagsNormalized && ARRAY[...]` which Postgres can satisfy via a GIN bitmap scan.

### Pattern 2: shadcn `<Command>` chip combobox composition

**What:** Build `TagInputCombobox` from existing primitives — `<Popover>` for the dropdown, `<Command>` (cmdk) for autocomplete + filterable list, `<Badge variant="secondary">` for chips, plain `<input>` for the text entry.
**When to use:** Whenever the user picks/creates one or many tags (camera form D-08, bulk popovers D-11). Three modes via prop:
- `multi: true, freeText: true` — camera form (chips list, type-to-add).
- `multi: false, freeText: true` — bulk Add (one chip allowed, autocomplete from org tags).
- `multi: false, freeText: false` — bulk Remove (one chip allowed, suggestions ONLY from `selectedCamerasTagUnion`).

**Behavioral contract** (per UI-SPEC §"Chip combobox spec"):
- Enter / `,` commits the current input as a chip; trims, rejects empty, case-insensitive dedup.
- Backspace on empty input removes the last chip.
- Autocomplete dropdown opens on focus; populated from `GET /cameras/tags/distinct` (cached client-side per form-open per D-09); filters by case-insensitive substring of input.
- Selecting a suggestion = same as Enter.
- `+ Add "{query}"` row only renders when query non-empty AND no exact case-insensitive match in suggestions.
- API failure = empty suggestions, freetext-add still works, one toast.error.

**Example sketch (component skeleton, not full impl):**
```tsx
// apps/web/src/app/admin/cameras/components/tag-input-combobox.tsx (NEW)
// Source: pattern verified against apps/web/src/components/ui/data-table/data-table-faceted-filter.tsx
//         + apps/web/src/components/ui/command.tsx (cmdk-backed shadcn primitive)
'use client'
import { Badge } from '@/components/ui/badge'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { X } from 'lucide-react'
import { useState } from 'react'

export interface TagInputComboboxProps {
  value: string[]
  onChange: (next: string[]) => void
  suggestions: string[]
  multi?: boolean
  freeText?: boolean
  placeholder?: string
  maxTags?: number      // 20 per D-05
  maxLength?: number    // 50 per D-05
  ariaLabel?: string
}
// — implementation outline:
// 1) maintain local input state (text being typed)
// 2) compute filteredSuggestions = suggestions.filter(s => s.toLowerCase().includes(input.toLowerCase()))
// 3) onKeyDown: Enter / "," → commitTag(input); Backspace+empty → onChange(value.slice(0, -1))
// 4) commitTag(raw): trim + length check + dedup (case-insensitive) → onChange([...value, raw.trim()])
// 5) suggestion click → commitTag(suggestion)
// 6) "+ Add '{query}'" row visible only when freeText && query && no exact case-i match
```

### Pattern 3: TanStack DataTable faceted multi-select filter for tags

**What:** Add a Tags column with `filterFn` that does case-insensitive `hasSome` between row tags and selected filter values. Wire it through the existing `facetedFilters` array (`cameras-data-table.tsx:173`).
**When to use:** D-06 client-side filter on the Cameras table.

**Example:**
```tsx
// apps/web/src/app/admin/cameras/components/cameras-columns.tsx (MODIFY)
// Source: pattern verified against existing filterFn at cameras-columns.tsx:166
{
  id: 'tags',
  accessorKey: 'tags',
  header: 'Tags',
  enableSorting: false,
  cell: ({ row }) => <TagsCell tags={row.original.tags ?? []} />,
  filterFn: (row, id, value: string[]) => {
    const rowTags = (row.getValue(id) as string[] | undefined) ?? []
    const lowered = new Set(rowTags.map((t) => t.toLowerCase()))
    return value.some((v) => lowered.has(v.toLowerCase()))
  },
}

// apps/web/src/app/admin/cameras/components/cameras-data-table.tsx (MODIFY)
// In facetedFilters array, append:
{
  columnId: 'tags',
  title: 'Tags',
  options: distinctTags.map((t) => ({ label: t, value: t })),
}
```

### Pattern 4: Webhook payload extension (single-line additive)

**What:** In `notify-dispatch.processor.ts:51-57`, the camera record is already loaded at line 33 — just spread `tags` into the emit payload.
**When to use:** D-22 only.
**Example:**
```ts
// apps/api/src/status/processors/notify-dispatch.processor.ts (MODIFY around line 51-57)
await this.webhooksService
  .emitEvent(orgId, `camera.${newStatus}`, {
    cameraId,
    status: newStatus,
    previousStatus,
    timestamp: new Date().toISOString(),
    tags: camera.tags ?? [],   // ← D-22 additive
  })
```

### Pattern 5: Audit diff for UPDATE (D-24)

**What:** Camera UPDATE in `cameras.service.ts:300-328` already loads `pre` (line 309) before the `update` call. After the update, diff `tags` and `description` and pass to `auditService.log` with `details.diff`.
**When to use:** D-24 — only for fields that actually changed.
**Example:**
```ts
// apps/api/src/cameras/cameras.service.ts updateCamera (MODIFY around audit log call at :571)
const diff: Record<string, { before: any; after: any }> = {}
if (Object.prototype.hasOwnProperty.call(dto, 'tags')) {
  const before = pre.tags ?? []
  const after = updated.tags ?? []
  if (!arraysEqualCaseInsensitive(before, after)) {
    diff.tags = { before, after }
  }
}
if (Object.prototype.hasOwnProperty.call(dto, 'description')) {
  if (pre.description !== updated.description) {
    diff.description = { before: pre.description, after: updated.description }
  }
}
await this.auditService.log({
  /* ... existing fields ... */
  details: { ...sanitizedRequestBody, ...(Object.keys(diff).length ? { diff } : {}) },
})
```

### Anti-Patterns to Avoid

- **Hand-rolled chip input from `<input type="text">`** with custom keydown handlers that drift from `<Command>`'s a11y model. Use the cmdk-backed primitive — it gives keyboard navigation, focus management, screen-reader announcements for free.
- **Lowercasing `Camera.tags` on write.** Violates D-03 — display capitalization MUST be preserved. The shadow column is the only place lowercase lives.
- **Calling `prisma.$use()` middleware** instead of `$extends`. Project is on `$extends` per `prisma-tenancy.extension.ts`. Mixing both creates ordering ambiguity.
- **Storing `tagsNormalized` in audit details.diff.** D-24's diff uses the user-facing `tags` field (with original casing). Storing the lowercase shadow would make audit logs confusing and reveal internal implementation.
- **Multiple webhook emits per status change.** D-22 is additive — same one emit at `notify-dispatch.processor.ts:51`, just adds the `tags` key. Do NOT emit a separate "tags changed" event.
- **Per-row `auditService.log` inside a `Promise.all`** for bulk tag ops. D-12 says single transaction; D-26 says one audit row per camera. Pattern: load all `pre` records → run `updateMany` (or per-row tx) → emit N audit rows in a follow-up `Promise.all` AFTER commit succeeds.
- **Caching distinct tags without TTL.** Stale cache means newly-added tags never appear in autocomplete. 60-second TTL is a reasonable default; flush-on-write is overkill for this use case.
- **Adding `description` to webhook payload** "for completeness". D-22 explicitly excludes it — description is human-facing, not machine-actionable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chip-input keyboard handling (Enter, Backspace, arrow nav, focus trap) | Custom `<input>` + `useState` chip array + manual keydown switch | shadcn `<Command>` (cmdk) + `<Popover>` composition | cmdk handles arrow-key list navigation, ARIA labels, screen reader announcements, Escape-to-close — hand-rolling regresses a11y |
| Postgres GIN index management | Manual `CREATE INDEX` + tracking which migration created it | Prisma `@@index([tagsNormalized(ops: ArrayOps)], type: Gin)` + `db push` flow | Prisma 6 supports the syntax natively; `db push` migration tracks it consistently |
| Case-insensitive array dedup | Inline `Array.from(new Set(tags.map(t => t.toLowerCase())))` everywhere it's needed | A single `tag-normalize.ts` module with `normalizeForDisplay(raw[]): string[]` and `normalizeForDb(raw[]): string[]` helpers | DRY — D-04/D-05 rules MUST match across DTO validation, service write path, bulk path, extension hook |
| MultiSelect dropdown filter | Custom `<select multiple>` or hand-built popover | Existing `<DataTableFacetedFilter>` (`apps/web/src/components/ui/data-table/data-table-faceted-filter.tsx`) | Already supports multi-select via `Set<string>` (lines 35-53) — just add a `'tags'` entry to `facetedFilters[]` |
| Audit log diff serialization | Custom JSON-diff library | Manual `{ before, after }` shape per D-24 | Phase-specific diff is two fields only — full diff library is overkill |
| Per-camera `tags` re-fetch in `notify-dispatch.processor.ts` | Extra query before emit | Already-loaded `camera.tags` (line 33) | Camera record IS loaded at line 33 — additive `tags: camera.tags` is a 1-liner |
| Distinct-tags computation per request | `SELECT DISTINCT unnest(tags) FROM "Camera"` ad-hoc | Cached `GET /cameras/tags/distinct` with 60s Redis TTL keyed by `orgId` | Distinct-aggregate over `String[]` is moderately expensive (full-org scan); cache hits dominate combobox open frequency |
| Tag normalization in EVERY write callsite | Inline normalize in CREATE, UPDATE, bulkImport, bulkTagAdd, bulkTagRemove | Prisma Client Extension (Pattern 1) on `query.camera` | Single chokepoint — future writers can't bypass |

**Key insight:** Phase 22 has zero genuine "complex problem" build candidates. Every primitive (combobox, multi-select filter, audit log, webhook emit) already exists in the repo. The phase is **composition + glue + one data-model addition (`tagsNormalized` shadow column + GIN index)**.

---

## Runtime State Inventory

> Phase 22 is primarily a feature-add with one rename-adjacent concern (the new `tagsNormalized` shadow column needs backfill on existing cameras). The categories below address that and confirm the rest are non-issues.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **Existing rows in `Camera` table** with `tags: String[]` populated but `tagsNormalized` not yet existing. Affects every camera in every org. | **Data migration:** the migration SQL must `ALTER TABLE "Camera" ADD COLUMN "tagsNormalized" text[] NOT NULL DEFAULT '{}'` then `UPDATE "Camera" SET "tagsNormalized" = ARRAY(SELECT lower(unnest("tags")))` to backfill. Then create the GIN index. **Three-step migration** — the `tag-normalize.extension.ts` only handles future writes. |
| Live service config | None — Phase 22 adds NO config to SRS, Redis, BullMQ, or any external service. | None |
| OS-registered state | None — no Task Scheduler, pm2, systemd, or launchd registrations affected. | None |
| Secrets/env vars | None — no new secrets needed. The Redis cache for D-28 reuses existing `REDIS_URL` env var consumed by the `REDIS_CLIENT` provider in `api-keys.module.ts:25`. | None |
| Build artifacts | **Prisma client** must be regenerated after `schema.prisma` adds `tagsNormalized` and the GIN index. Per CLAUDE.md, this is the silent-failure path: stale client = camera UPDATE writes succeed but `tagsNormalized` is never populated. | **Re-run** `pnpm --filter @sms-platform/api db:push` (chains `prisma generate`) → `pnpm --filter @sms-platform/api build` → restart all `node dist/main` processes. Verify via `/api/srs/callbacks/metrics`. |

**The canonical question:** *After every file in the repo is updated, what runtime systems still have the old shape cached, stored, or registered?*
- **Prisma client (generated)** is the only one. CLAUDE.md's 4-step workflow is the mitigation. Plan tasks must include this as a `[BLOCKING]` schema-push step before any service code that references `tagsNormalized` is built.

---

## Common Pitfalls

### Pitfall 1: Stale Prisma client after schema change

**What goes wrong:** Adding `tagsNormalized String[]` to `Camera` model and pushing the schema, but forgetting to rebuild the API. Code that writes `tagsNormalized` compiles against old types, runtime succeeds (Prisma is permissive about extra fields), but the column stays `'{}'` for all new writes. Filter returns empty results because `WHERE tagsNormalized && ARRAY['lobby']` matches nothing.
**Why it happens:** `prisma generate` updates `node_modules/@prisma/client/runtime/index.d.ts` but the SWC-compiled `dist/main.js` still references the old type. `tsx-watch` / `start:dev` picks it up; `node dist/main` does NOT.
**How to avoid:** Per CLAUDE.md, the 4-step workflow is mandatory. Plan inserts a `[BLOCKING]` task: `pnpm --filter @sms-platform/api db:push && pnpm --filter @sms-platform/api build` before any service code task that touches `tagsNormalized`.
**Warning signs:** Camera UPDATE succeeds in UI but `?tags[]=lobby` filter returns 0 rows even though the cameras table shows the tag. `/api/srs/callbacks/metrics` `archives.lastFailureMessage` may mention `tagsNormalized`.

### Pitfall 2: GIN index syntax — `ops: ArrayOps` omitted

**What goes wrong:** Declaring `@@index([tagsNormalized], type: Gin)` instead of `@@index([tagsNormalized(ops: ArrayOps)], type: Gin)`. Both compile and Prisma generates a valid index, BUT `[VERIFIED via Prisma docs WebFetch]` notes that explicit `ArrayOps` is the documented best practice for clarity — the default operator class for arrays IS `array_ops`, so functionally either works.
**Why it happens:** Copy-paste from non-array GIN examples (e.g., GIN on a single column).
**How to avoid:** Use the explicit form. **Phase 22 plan declares: `@@index([tagsNormalized(ops: ArrayOps)], type: Gin)`**.
**Warning signs:** `EXPLAIN ANALYZE` on `SELECT * FROM "Camera" WHERE "tagsNormalized" && ARRAY['lobby']` shows a Seq Scan instead of Bitmap Index Scan.

### Pitfall 3: Forgetting to lowercase the QUERY input in the filter

**What goes wrong:** Service does `where: { tagsNormalized: { hasSome: tags } }` — passing the user's original-cased input directly. If user filters by `"Lobby"`, no row matches because `tagsNormalized` only contains `"lobby"`.
**Why it happens:** D-06 splits responsibility — the EXTENSION lowercases on write; the SERVICE must lowercase on filter. Easy to forget the second half.
**How to avoid:** Add a single helper `normalizeForFilter(tags: string[]): string[]` and call it at every filter callsite. Bulk Add/Remove also use it for the case-insensitive dedup check.
**Warning signs:** Manual `?tags[]=Lobby` returns 0 results but `?tags[]=lobby` returns N. Test must use mixed-case filter values to catch this.

### Pitfall 4: Audit sanitizer accidentally redacts `diff` values

**What goes wrong:** If a camera's tag is literally `"api-key-old-name"`, the `diff.tags.before` array would contain `"api-key-old-name"`. The current sanitizer at `audit.service.ts:7-22` is **value-preserving** (only key names are tested), so this is safe. But a future contributor might "tighten" the sanitizer to also test values — that would corrupt the diff.
**Why it happens:** Defensive over-sanitization.
**How to avoid:** Add a unit test in `apps/api/tests/audit/` that asserts `details.diff.tags` containing the literal string `"apiKey"` survives sanitization unchanged.
**Warning signs:** `diff.tags` shows `["[REDACTED]"]` in audit logs.

### Pitfall 5: Bulk `updateMany` doesn't trigger the per-camera tag normalization extension correctly

**What goes wrong:** D-12 says single-transaction `updateMany` for bulk tag ops. But Postgres can't compute a per-row `tags = array_append(tags, 'X')` via Prisma's `updateMany` — that operator pushes the SAME value to every row's array. The extension hook for `updateMany` cannot mutate args per-row.
**Why it happens:** Confusion between "single SQL statement" and "Prisma `updateMany` operator". For bulk Add/Remove, the operation IS array-mutating — Postgres needs `array_append` / `array_remove` per-row.
**How to avoid:** Implement bulk Add/Remove via a single `$executeRaw` per-action:
```sql
-- Bulk Add
UPDATE "Camera"
SET "tags" = (SELECT ARRAY(SELECT DISTINCT unnest("tags" || ARRAY[$tag::text]))),
    "tagsNormalized" = (SELECT ARRAY(SELECT DISTINCT lower(unnest("tags" || ARRAY[$tag::text]))))
WHERE id = ANY($cameraIds::uuid[])
RETURNING id, tags;
-- Returns updated rows so per-camera audit (D-26) can emit with correct after-state.
```
The DB does the work atomically; case-insensitive dedup is enforced by `DISTINCT lower(...)`. Tenancy RLS still applies because we use the `tenancy.$executeRaw` (the extension wraps `$allOperations`, not raw SQL — so org_id RLS must be re-applied via `set_config`). **See `admin-dashboard.service.ts:343` for the pattern.**

Alternative (simpler): per-camera `tx.camera.update` inside `prisma.$transaction([...])`. The extension fires per-call, audit diff is computed cleanly, but emits N SQL statements vs 1. For up to ~500 selected cameras this is acceptable (Phase 19 bulk-import allows 500-row CSVs).

**Recommendation:** Use the per-camera transaction approach unless profiling shows it's slow. The atomicity guarantee + extension trigger + simpler diff computation outweigh the SQL-count cost at expected scale.
**Warning signs:** Bulk Add succeeds but the new tag's lowercase form doesn't appear in `tagsNormalized` (filter doesn't see the bulk-added tags).

### Pitfall 6: Map page doesn't propagate `tags`/`description` from API to `MapCamera`

**What goes wrong:** D-19/D-20 require tags + description on map markers, but `tenant-map-page.tsx:130-143` builds `MapCamera[]` from the API response with an explicit field-by-field map — adding `tags` to the API response alone won't surface it; the page mapper must also include it.
**Why it happens:** The mapper looks like a pass-through but is actually a whitelist.
**How to avoid:** Modify `MapCamera` interface (`camera-map.tsx:14`) to add `tags?: string[]; description?: string | null;` AND update the mapper at `tenant-map-page.tsx:130-143` to include both fields. The same applies to any map-using page (`tenant-projects-page.tsx:612` shows another consumer).
**Warning signs:** Marker popup shows empty tags row even after backend returns tags.

### Pitfall 7: TanStack `accessorKey: 'tags'` returns the array reference; filter compares case-sensitively by default

**What goes wrong:** Without a `filterFn`, TanStack defaults to `includesString` which doesn't make sense for arrays. Filter does nothing or throws.
**Why it happens:** Default filter functions assume scalar values.
**How to avoid:** Always provide an explicit `filterFn` for the Tags column (Pattern 3 above shows the implementation). Test with both single-value and multi-value filters.
**Warning signs:** Selecting a tag in the filter does nothing visible.

### Pitfall 8: Distinct-tags cache survives across orgs / leaks data

**What goes wrong:** Caching `tags:distinct` without keying on `orgId` would let one tenant see another's tags.
**Why it happens:** Forgetting that the result is org-scoped.
**How to avoid:** Cache key MUST include `orgId`: `tags:distinct:{orgId}`. Verify in unit test by populating Org A with tag X, querying as Org B, asserting X is NOT returned.
**Warning signs:** A new org's autocomplete shows tags from other orgs.

### Pitfall 9: Empty selection bulk action shows enabled buttons

**What goes wrong:** Bulk toolbar's "Remove tag" should only appear when the selection has ≥1 camera with ≥1 tag (UI-SPEC §Component Inventory, line 278). Forgetting this check shows an empty popover.
**Why it happens:** The hasTags computation is per-row but the toolbar renders before the check.
**How to avoid:** Compute `hasAnyTagsInSelection = selectedRows.some(r => (r.tags ?? []).length > 0)` in the toolbar and conditionally render Remove button.
**Warning signs:** Remove popover opens with "Selected cameras have no tags to remove" empty state from a button that should not have been clickable.

---

## Code Examples

### Tag normalization (pure helpers — call from DTO refinement, extension, bulk service)

```ts
// apps/api/src/cameras/tag-normalize.ts (NEW)
// Source: derived from D-04/D-05 spec; verified against existing camera DTO
// patterns in apps/api/src/cameras/dto/create-camera.dto.ts:13,20

export const TAG_MAX_LENGTH = 50
export const TAG_MAX_PER_CAMERA = 20

export class TagValidationError extends Error {
  constructor(public reason: 'too_long' | 'too_many' | 'empty') {
    super(`Tag validation failed: ${reason}`)
    this.name = 'TagValidationError'
  }
}

/**
 * Normalize incoming tag array for storage in Camera.tags (display field).
 * - trims each tag
 * - rejects empty
 * - case-insensitive dedup, preserving FIRST-SEEN casing
 * - enforces length and count limits
 */
export function normalizeForDisplay(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tagRaw of raw) {
    const trimmed = tagRaw.trim()
    if (!trimmed) continue
    if (trimmed.length > TAG_MAX_LENGTH) {
      throw new TagValidationError('too_long')
    }
    const k = trimmed.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(trimmed)
  }
  if (out.length > TAG_MAX_PER_CAMERA) {
    throw new TagValidationError('too_many')
  }
  return out
}

/**
 * Normalize for the lowercase shadow column / for filter input.
 * - lowercases
 * - trims
 * - dedups (case-insensitive)
 * - drops empty
 * Does NOT enforce length/count — that's the writer's job; this helper
 * is also called from filter input where length checks would break legitimate
 * queries that match longer tags created before validation existed.
 */
export function normalizeForDb(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tagRaw of raw) {
    const k = tagRaw.trim().toLowerCase()
    if (!k) continue
    if (seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}
```

### Distinct-tags endpoint with Redis cache

```ts
// apps/api/src/cameras/tag-cache.service.ts (NEW)
// Source: pattern verified against apps/api/src/api-keys/api-keys.service.ts
//         which uses REDIS_CLIENT symbol DI

import { Inject, Injectable, Optional } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS_CLIENT } from '../api-keys/api-keys.service'

const TTL_SECONDS = 60

@Injectable()
export class TagCacheService {
  private memoryFallback = new Map<string, { value: string[]; expiresAt: number }>()

  constructor(@Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis) {}

  async getOrCompute(orgId: string, compute: () => Promise<string[]>): Promise<string[]> {
    const key = `tags:distinct:${orgId}`
    // Try Redis first
    if (this.redis) {
      try {
        const cached = await this.redis.get(key)
        if (cached) return JSON.parse(cached) as string[]
      } catch {
        // fall through to memory + compute
      }
    }
    // Try in-memory fallback
    const mem = this.memoryFallback.get(orgId)
    if (mem && mem.expiresAt > Date.now()) return mem.value

    // Compute and store
    const fresh = await compute()
    if (this.redis) {
      try {
        await this.redis.setex(key, TTL_SECONDS, JSON.stringify(fresh))
      } catch { /* ignore — best-effort */ }
    }
    this.memoryFallback.set(orgId, { value: fresh, expiresAt: Date.now() + TTL_SECONDS * 1000 })
    return fresh
  }
}
```

```ts
// apps/api/src/cameras/cameras.service.ts (NEW METHOD)
// Returns alphabetized distinct tags using ORIGINAL casing of the first
// occurrence (per D-09 — case-folded de-dup, original casing returned).
async findDistinctTags(orgId: string): Promise<string[]> {
  return this.tagCacheService.getOrCompute(orgId, async () => {
    // Use $queryRaw because Prisma's distinct on String[] elements is not
    // a first-class operation. set_config for RLS already applied by the
    // tenancy extension on $allOperations — but $queryRaw is NOT wrapped,
    // so we apply manually (pattern: admin-dashboard.service.ts:343).
    const rows = await this.tenancy.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, TRUE)`
      return tx.$queryRaw<Array<{ tag: string }>>`
        SELECT DISTINCT ON (lower(tag)) tag
        FROM "Camera", unnest(tags) AS tag
        ORDER BY lower(tag), tag
      `
    })
    return rows.map((r) => r.tag).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  })
}
```

### Bulk tag op (per-camera transaction approach — recommended)

```ts
// apps/api/src/cameras/cameras.service.ts (NEW METHOD)
// Source: pattern verified against bulkImport (cameras.service.ts:715)
//         + Pitfall 5 analysis above. Per-camera tx fires the tagNormalization
//         extension correctly + computes per-camera audit diff (D-26).

async bulkTagAction(
  orgId: string,
  triggeredBy: { userId: string; userEmail: string },
  dto: { cameraIds: string[]; action: 'add' | 'remove'; tag: string },
): Promise<{ updatedCount: number }> {
  const target = dto.tag.trim()
  if (!target) throw new BadRequestException('Tag must not be empty')
  if (target.length > TAG_MAX_LENGTH) throw new BadRequestException('Tag too long')

  const cameras = await this.tenancy.camera.findMany({
    where: { id: { in: dto.cameraIds } },
    select: { id: true, tags: true, orgId: true },
  })

  let updatedCount = 0
  for (const cam of cameras) {
    const before = cam.tags
    let after: string[]
    if (dto.action === 'add') {
      // Idempotent under D-04: append only if not already present case-insensitively
      const lowerSet = new Set(before.map((t) => t.toLowerCase()))
      if (lowerSet.has(target.toLowerCase())) continue
      after = normalizeForDisplay([...before, target])
    } else {
      // Remove: filter out case-insensitive matches
      const lower = target.toLowerCase()
      after = before.filter((t) => t.toLowerCase() !== lower)
      if (after.length === before.length) continue
    }

    await this.tenancy.camera.update({
      where: { id: cam.id },
      data: { tags: after },
      // tagsNormalized is updated by the camera-tag.extension hook
    })
    updatedCount += 1

    // D-26: per-camera audit row
    if (this.auditService) {
      await this.auditService.log({
        orgId,
        userId: triggeredBy.userId,
        action: 'update',
        resource: 'camera',
        resourceId: cam.id,
        method: 'POST',
        path: `/api/cameras/bulk/tags`,
        details: {
          bulkAction: dto.action,
          tag: target,
          diff: { tags: { before, after } },
        },
      })
    }
  }

  // Invalidate distinct-tags cache so the new tag (Add) appears in autocomplete
  // and the removed tag (Remove, if no other camera carries it) drops out.
  await this.tagCacheService.invalidate(orgId)

  return { updatedCount }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `prisma.$use()` middleware | `prisma.$extends()` Client Extensions | Prisma v5+ (project on 6.19) | All write-time hooks for tag normalization use the Extension API, consistent with `prisma-tenancy.extension.ts` |
| `mode: 'insensitive'` for scalar list filtering | Not supported (issue #25360 closed as not planned) | Confirmed 2024-2025 | Phase 22 MUST use the shadow-column workaround |
| `String[] @db.Citext` for case-insensitive arrays | Blocked by Prisma 6 parser bug (issue #28349) | Open as of 2026-04-26 | Cannot use CITEXT — must use shadow column |
| `prisma db push` then `prisma generate` separately | `pnpm --filter @sms-platform/api db:push` chains both | Project-specific (per CLAUDE.md) | Single command keeps schema/client in sync |
| Tag input as comma-separated string | Chip combobox via shadcn `<Command>` (cmdk-backed) | Industry standard since cmdk 1.x (Linear/Notion patterns) | Phase 22 implements the modern UX (D-08) |

**Deprecated/outdated:**
- **Prisma `$use()` middleware** — superseded by `$extends`; do not introduce a new `$use` callsite even though Prisma 6 still permits it.
- **CITEXT-array typing in Prisma** — broken in 6.x per issue #28349; do not attempt as a "cleaner" alternative to the shadow column.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| (none) | All claims in this research were either verified by direct codebase read, npm registry probe, or upstream GitHub issue cross-reference. | n/a | n/a |

**No `[ASSUMED]` claims.** Every fact in this document is tagged `[VERIFIED: ...]` or backed by direct file read at a cited line number, with the exception of recommended **patterns** which are explicitly framed as recommendations (not facts) for the planner to evaluate.

---

## Open Questions

1. **Should the per-camera bulk tag transaction approach (Pattern, Pitfall 5) be optimized to a single `$executeRaw` UPDATE for >100 cameras?**
   - **What we know:** Per-camera tx works at expected scale (max 500 selected per Phase 19 bulk-import precedent). Per-camera also enables clean per-camera audit (D-26).
   - **What's unclear:** Whether 500 sequential `UPDATE` statements introduce noticeable latency vs a batched `$executeRaw` w/ `array_append`.
   - **Recommendation:** Plan starts with per-camera tx. If Wave 0 perf testing shows >2s for 500-camera bulk, switch to `$executeRaw` + a single bulk audit row (deviation from D-26 — must re-discuss).

2. **Tag invalidation strategy for the distinct-tags cache when a non-bulk camera UPDATE removes a tag that no other camera has.**
   - **What we know:** Bulk ops invalidate explicitly. Single-camera UPDATE / DELETE / CREATE do NOT currently invalidate.
   - **What's unclear:** Is 60s TTL low enough that users won't notice stale autocomplete after a single-camera tag rename?
   - **Recommendation:** Plan adds invalidation hook to single-camera UPDATE/CREATE/DELETE callsites in `cameras.service.ts` for safety. Cost is one Redis DEL per write — negligible.

3. **Map page tag-filter independence (D-21) — does any global state need to be created?**
   - **What we know:** D-21 says state is independent. `tenant-map-page.tsx` already maintains local state via `useState`.
   - **What's unclear:** Whether the user's mental model expects the filter to persist across navigation away from /map and back.
   - **Recommendation:** Pure local state via `useState`. Per CONTEXT.md `<deferred>`, URL persistence is out of scope.

4. **CSP impact of the chip combobox** — does cmdk inject inline styles that violate any project CSP header?
   - **What we know:** cmdk renders a portal-style popover via Radix-style mounting. Phase 18 audit confirmed no CSP-related issues with shadcn primitives.
   - **What's unclear:** Whether any specific CSP `style-src` directive would block cmdk-injected styles.
   - **Recommendation:** No action — cmdk is already in use (`apps/web/src/components/ui/command.tsx`), no new CSP exposure.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 16 | All backend work (D-02 GIN index, D-06 shadow column, D-28 distinct query) | ✓ (existing project DB) | 16.x | — |
| Redis 7.x | D-28 distinct-tag cache | ✓ (existing `REDIS_CLIENT` provider in `api-keys.module.ts:25`) | 7.x | In-process Map with TTL fallback (already coded in Pattern: TagCacheService) |
| Node.js 22 LTS | Runtime | ✓ (project standard) | 22.x | — |
| pnpm | Workspace tooling | ✓ | 8.x+ | — |
| `pgcrypto` extension | Not used in this phase | ✓ (existing) | n/a | — |
| Test database `sms_platform_test` | Validation tests for filter + bulk + audit diff | ✓ (per `260421-dlg` quick task) | n/a | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — Redis fallback is built-in (Pattern: TagCacheService).

---

## Validation Architecture

> Phase 22 includes both backend (filter, bulk, audit, webhook) and frontend (Tags column, chip combobox, Notes, tooltip, map popup, MultiSelect filter) work. Validation must cover all layers per the Nyquist architecture.

### Test Framework

| Property | Value |
|----------|-------|
| API framework | Vitest 1.x (`apps/api/vitest.config.ts`) |
| Web framework | Vitest 1.x (`apps/web/vitest.config.ts` + jsdom for component tests) |
| API test DB | `sms_platform_test` (isolated per quick task `260421-dlg`) |
| API quick run | `pnpm --filter @sms-platform/api test -- tests/cameras/tags-filter.test.ts -x` |
| API full suite | `pnpm --filter @sms-platform/api test` |
| Web quick run | `pnpm --filter @sms-platform/web test -- tag-input-combobox -x` |
| Web full suite | `pnpm --filter @sms-platform/web test` |
| Phase gate | Both full suites green before `/gsd-verify-work` |

### Phase Requirements → Test Map

(Phase 22 has no REQ-IDs — IDs are CONTEXT decision codes.)

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-04 / D-05 | Tag normalize: trim, length 50, count 20, case-insensitive dedup | unit | `pnpm --filter @sms-platform/api test -- tests/cameras/tag-normalize.test.ts -x` | ❌ Wave 0 |
| D-06 (write) | Camera CREATE/UPDATE populates `tagsNormalized` via extension | integration (real DB) | `pnpm --filter @sms-platform/api test -- tests/cameras/tag-normalization.test.ts -x` | ❌ Wave 0 |
| D-06 (filter) | `?tags[]=Lobby` returns cameras tagged `"lobby"`, `"LOBBY"`, `"Lobby"` (case-insensitive) | integration (real DB) | `pnpm --filter @sms-platform/api test -- tests/cameras/tags-filter.test.ts -x` | ❌ Wave 0 |
| D-06 (perf) | GIN index hit verified via `EXPLAIN ANALYZE` (Bitmap Index Scan, NOT Seq Scan) | integration (manual or scripted) | `pnpm --filter @sms-platform/api test -- tests/cameras/tags-filter-perf.test.ts -x` | ❌ Wave 0 |
| D-11 / D-12 | Bulk Add/Remove: idempotent, single transaction, per-camera audit row | integration (real DB) | `pnpm --filter @sms-platform/api test -- tests/cameras/bulk-tags.test.ts -x` | ❌ Wave 0 |
| D-22 | Webhook `camera.online`/`camera.offline` payload includes `tags: string[]` | unit | `pnpm --filter @sms-platform/api test -- tests/status/notify-dispatch.test.ts -x` | ❌ Wave 0 (extend if existing) |
| D-24 | UPDATE diff for `tags` and `description` lands in `details.diff` (only changed fields) | integration | `pnpm --filter @sms-platform/api test -- tests/cameras/audit-diff.test.ts -x` | ❌ Wave 0 |
| D-24 (sanitizer) | `sanitizeDetails` preserves `diff.tags` containing `"apiKey"`-like literal values | unit | `pnpm --filter @sms-platform/api test -- tests/audit/sanitizer-diff.test.ts -x` | ❌ Wave 0 |
| D-26 | Bulk tag ops emit ONE audit row per camera with `details.diff.tags` | integration | (same `bulk-tags.test.ts` above) | ❌ Wave 0 |
| D-28 | `GET /cameras/tags/distinct` returns alphabetized distinct tags scoped to org; cache hit on second call | integration | `pnpm --filter @sms-platform/api test -- tests/cameras/distinct-tags.test.ts -x` | ❌ Wave 0 |
| D-28 (RLS) | Org A's distinct-tag cache does NOT leak to Org B | integration | (same `distinct-tags.test.ts`) | ❌ Wave 0 |
| D-08 | TagInputCombobox: Enter commits chip, Backspace removes last, dedup case-insensitive, +Add row visible only on no-match | component (jsdom) | `pnpm --filter @sms-platform/web test -- tag-input-combobox -x` | ❌ Wave 0 |
| D-14 | TagsCell: ≤3 badges + +N overflow with tooltip listing all tags; empty cell when zero tags | component | `pnpm --filter @sms-platform/web test -- tags-cell -x` | ❌ Wave 0 |
| D-06 (UI filter) | Cameras DataTable: selecting `Lobby` in tags filter shows only matching rows | component | `pnpm --filter @sms-platform/web test -- cameras-data-table -x` | ❌ Wave 0 (extend) |
| D-16 | view-stream-sheet: Notes block renders only when description non-empty | component | `pnpm --filter @sms-platform/web test -- view-stream-sheet -x` | ✅ exists, extend |
| D-17 | Tooltip on camera name shows description; suppressed when empty | component | `pnpm --filter @sms-platform/web test -- cameras-columns-tooltip -x` | ❌ Wave 0 |
| D-19 | Map popup: tags row + description block render conditionally | component | `pnpm --filter @sms-platform/web test -- camera-popup -x` | ✅ exists, extend |
| D-20 | Map toolbar: tag MultiSelect filter narrows visible markers (OR semantics) | component | `pnpm --filter @sms-platform/web test -- tenant-map-page -x` | ❌ Wave 0 |
| D-23 / D-27 | Dev Portal docs pages mention `tags[]` query param + webhook payload `tags` field | smoke (string match) | `grep -lE 'tags\[\]|"tags":' apps/web/src/app/app/developer/docs/{api-workflow,webhooks}/page.tsx` | ❌ Wave 0 (manual check OK) |
| Visual smoke | Tags column, Notes block, name tooltip, map popup, filter render without errors | manual smoke | `pnpm --filter @sms-platform/web dev` + manual click-through | n/a |

### Sampling Rate

- **Per task commit:** Quick run for the touched layer (`pnpm --filter @sms-platform/api test -- <file> -x` or `pnpm --filter @sms-platform/web test -- <file> -x`).
- **Per wave merge:** Full API suite + full Web suite (both must be green).
- **Phase gate:** Both full suites green AND manual smoke through all 4 UI surfaces (Tags column, Notes, name tooltip, Map popup).

### Wave 0 Gaps

- [ ] `apps/api/tests/cameras/tag-normalize.test.ts` — pure helpers (D-04/D-05).
- [ ] `apps/api/tests/cameras/tag-normalization.test.ts` — integration: extension populates `tagsNormalized` on every write path.
- [ ] `apps/api/tests/cameras/tags-filter.test.ts` — integration: case-insensitive `?tags[]=` filter.
- [ ] `apps/api/tests/cameras/tags-filter-perf.test.ts` — integration: `EXPLAIN ANALYZE` asserts GIN bitmap scan (skip if too brittle on CI; mark as advisory).
- [ ] `apps/api/tests/cameras/bulk-tags.test.ts` — integration: bulk Add/Remove + per-camera audit (D-26).
- [ ] `apps/api/tests/cameras/audit-diff.test.ts` — integration: D-24 diff shape.
- [ ] `apps/api/tests/cameras/distinct-tags.test.ts` — integration: D-28 endpoint + RLS isolation + cache hit.
- [ ] `apps/api/tests/audit/sanitizer-diff.test.ts` — unit: `sanitizeDetails` preserves diff values.
- [ ] `apps/api/tests/status/notify-dispatch.test.ts` — extend if exists, create otherwise; assert webhook payload has `tags` field.
- [ ] `apps/web/src/app/admin/cameras/components/__tests__/tag-input-combobox.test.tsx` — component: chip behavior.
- [ ] `apps/web/src/app/admin/cameras/components/__tests__/tags-cell.test.tsx` — component: ≤3 + overflow tooltip.
- [ ] `apps/web/src/app/admin/cameras/components/__tests__/cameras-columns-tooltip.test.tsx` — component: name tooltip conditional.
- [ ] `apps/web/src/components/map/__tests__/camera-popup-tags.test.tsx` — component: extend existing camera-popup test.
- [ ] `apps/web/src/components/pages/__tests__/tenant-map-page-tag-filter.test.tsx` — component: map toolbar filter.

**Framework already installed:** Vitest is configured for both `apps/api` and `apps/web`. No new framework install required. The `sms_platform_test` database isolation pattern from quick task `260421-dlg` MUST be respected — integration tests connect to test DB, not dev DB.

---

## Security Domain

> Phase 22 has limited security surface — no new authentication, no new credentials, no public endpoints (all gated by existing Org Admin auth).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Reuses existing OrgAdminGuard / API Key auth |
| V3 Session Management | no | No new sessions |
| V4 Access Control | yes | All new endpoints (`/cameras/bulk/tags`, `/cameras/tags/distinct`) MUST be gated by the same OrgAdminGuard as existing camera CRUD; tenancy RLS scopes queries to caller's `orgId` automatically |
| V5 Input Validation | yes | Zod DTO validation for `bulk-tags.dto.ts` (`cameraIds: string[].uuid()`, `action: enum`, `tag: max(50)`); existing Zod for tags array updated to enforce `.max(20)` count + `.max(50)` per element |
| V6 Cryptography | no | No crypto in this phase |
| V7 Error Handling | yes | Distinct-tags endpoint MUST NOT leak other-org data on cache miss (test in D-28 RLS test); audit log error MUST NOT block UPDATE (existing `try/catch` pattern in `cameras.service.ts:230-234` is the model) |

### Known Threat Patterns for {NestJS + Prisma + Postgres}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via tag string in `$queryRaw` distinct query | Tampering | Use Prisma's tagged template literal (`prisma.$queryRaw\`...\``), NEVER string concatenation; tag values flow through parameterized binds (`unnest(tags)` works against the column, not user input) |
| Cross-tenant data leak in distinct-tags cache | Information Disclosure | Cache key MUST include `orgId`; integration test asserts isolation |
| Cross-tenant data leak in bulk endpoint via attacker-supplied `cameraIds` from another org | Elevation of Privilege | RLS via tenancy extension; `findMany({ where: { id: { in: dto.cameraIds } } })` returns ONLY rows owned by caller — silently filters cross-org IDs (existing pattern at `cameras.service.ts` proven by quick task `260422-ds9` RLS audit) |
| Audit log poisoning via tag values containing `<script>` or other markup | Tampering | Audit details are stored as Prisma `Json` and served to admin UI; admin UI is the only consumer and uses React's default escaping. No additional sanitization needed beyond the existing `sanitizeDetails` |
| DoS via 500-tag-per-camera or 100-char-tag bulk payload | Denial of Service | Zod DTO `.max(50)` per element + `.max(20)` per camera; bulk endpoint validates per-camera bounds before any DB write |
| Filter input bypass via Postgres array operators in URL | Tampering | NestJS `@Query('tags[]')` parses to `string[]`; service then `normalizeForFilter()` lowercases and dedups before passing to Prisma — no raw string ever reaches `$queryRaw` |

---

## Sources

### Primary (HIGH confidence)
- **Direct codebase reads (verified line-by-line):**
  - `apps/api/src/audit/audit.service.ts:7-22` (sanitizeDetails behavior)
  - `apps/api/src/cameras/cameras.service.ts:185-260` (CREATE), `:300-340` (UPDATE w/ pre-image), `:540-590` (audit pattern), `:715` (bulkImport)
  - `apps/api/src/cameras/cameras.controller.ts:181-253` (route patterns, getOrgId)
  - `apps/api/src/cameras/dto/{create,update,bulk-import}-camera.dto.ts` (Zod patterns, missing length+count limits)
  - `apps/api/src/status/processors/notify-dispatch.processor.ts:1-75` (only emit site for camera.online/offline; camera record loaded at line 33)
  - `apps/api/src/tenancy/prisma-tenancy.extension.ts:1-40` (`$extends` pattern — modern Prisma, NOT $use)
  - `apps/api/src/admin/admin-dashboard.service.ts:337-345` ($queryRaw + RLS set_config pattern)
  - `apps/api/src/api-keys/api-keys.service.ts:8,15,160-200` (REDIS_CLIENT symbol, ioredis usage, TTL pattern)
  - `apps/api/src/prisma/schema.prisma:199-241` (Camera model — current shape)
  - `apps/web/src/components/ui/command.tsx:1-197` (cmdk-backed shadcn Command)
  - `apps/web/src/components/ui/data-table/data-table-faceted-filter.tsx:1-129` (multi-select Set<string> contract)
  - `apps/web/src/components/map/camera-map.tsx:14-46` (MapCamera interface — needs tags+description added)
  - `apps/web/src/components/map/camera-popup.tsx:190-249` (insertion points for D-19)
  - `apps/web/src/components/pages/tenant-map-page.tsx:130-143` (mapper that whitelists fields)
  - `apps/web/src/app/admin/cameras/components/cameras-data-table.tsx:160-203` (facetedFilters wiring)
  - `apps/web/src/app/admin/cameras/components/cameras-columns.tsx:166,183,191` (filterFn pattern)
- **Package version probes (npm registry, 2026-04-26):**
  - `npm view @prisma/client version` → 7.8.0 (project pinned 6.19.3)
  - `npm view cmdk version` → 1.1.1
  - `npm view zod version` → 4.3.6 (project pinned 3.25.76)
- **Prisma official docs:**
  - https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes — GIN index syntax verification

### Secondary (MEDIUM confidence — official issues from upstream maintainer)
- https://github.com/prisma/prisma/issues/25360 — "Feature Request: Case-Insensitive Search for Arrays" — **Closed as not planned**, confirms shadow-column workaround is the canonical path
- https://github.com/prisma/prisma/issues/28349 — "PostgreSQL adapter fails to parse String[] @db.Citext arrays (Error P2023)" — confirms CITEXT-array approach is broken in Prisma 6
- https://github.com/prisma/prisma/issues/8387 — "Scalar list filter does not support case insensitive comparison" — corroborates issue #25360
- https://www.prisma.io/docs/v6/orm/prisma-client/queries/case-sensitivity — Prisma 6 docs on case-sensitivity (confirms `mode: 'insensitive'` is string-only)

### Tertiary (LOW confidence — not used in any locked decision)
- WebSearch: "Prisma 6 case insensitive hasSome" — pointed to the GitHub issues above; no additional independent sources surfaced

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every dependency version directly probed against package.json + npm registry; no inferred versions
- Architecture: **HIGH** — every pattern verified against an existing codebase example with cited line numbers
- Pitfalls: **HIGH** — Pitfall 1 (Prisma client staleness) cited from project's own CLAUDE.md memory; Pitfall 5 (bulk updateMany ambiguity) verified against Postgres docs + admin-dashboard.service.ts $queryRaw pattern
- Validation Architecture: **HIGH** — vitest configured per direct read of `apps/api/vitest.config.ts`; test isolation pattern (`sms_platform_test`) cited from quick task `260421-dlg`
- Security: **MEDIUM** — STRIDE table assumes existing OrgAdminGuard / RLS coverage holds; no new threat-model session needed since Phase 22 introduces no new auth surfaces

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (30 days — stable Prisma 6.x, no upcoming breaking releases expected; if Prisma 7 migration is undertaken before this expires, D-06 implementation must be revalidated against any new array-filter operators)
