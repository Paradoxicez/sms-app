# Phase 20: Cameras UX — bulk actions, maintenance toggle, copy ID, expressive status and stream controls — Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Frontend-only UX polish for the tenant (Org Admin) Cameras page — reached at `/app/cameras` and backed by the shared components in `apps/web/src/app/admin/cameras/components/*`. The phase delivers five improvements:

1. Multi-select + bulk actions on the cameras table (Start Stream, Start Recording, Maintenance toggle, Delete).
2. Row action menu behaviour: Exit Maintenance acts directly from the menu (asymmetric with Enter); add Copy Camera ID + Copy cURL example entries.
3. Camera ID exposure + copy affordance in the View Stream sheet header.
4. Active-state redesign for Start Stream / Start Record buttons inside the View Stream sheet.
5. Replace the current two-dot + wrench status column with expressive pill badges (LIVE / REC / MAINT / OFFLINE).

Out of scope: backend schema changes, API contract changes (bulk endpoints may be added only as a thin orchestrator over existing per-camera endpoints if needed — see D-02), new capabilities (filters, saved views, realtime presence), Super Admin `/admin/cameras` page parity (will inherit if the shared component is used, but is not a goal).

</domain>

<decisions>
## Implementation Decisions

### Bulk actions — scope

- **D-01:** Bulk toolbar exposes exactly four actions — **Start Stream, Start Recording, Maintenance (enter + exit toggle), Delete** — matching the user's original request. Stop Stream and Stop Recording are NOT bulk actions in this phase (can be added later if needed). Rationale: bulk is optimised for "apply this state to a batch"; stopping individual cameras is the per-row-menu job.
- **D-02:** Bulk actions call the existing per-camera endpoints in a client-side `Promise.allSettled` loop with a concurrency limit (planner picks the limit, suggested 5). No new bulk REST endpoints in this phase. If backend aggregate endpoints already exist, prefer them; otherwise do not invent them.
- **D-03:** Maintenance bulk: if the selected set contains mixed states (some in maintenance, some not), the toolbar shows a single "Maintenance" button that opens the **enter-maintenance reason dialog** (applied to the cameras currently NOT in maintenance) AND a separate **"Exit Maintenance"** button which, if clicked, runs instantly on the cameras currently in maintenance. This preserves the asymmetric-UX established in D-07 at bulk scale.

### Bulk actions — toolbar UI

- **D-04:** Sticky top bar above the DataTable. When `rowSelection` is non-empty, the bar slides in above the column header row (same pattern as `apps/web/src/app/app/recordings/components/recordings-data-table.tsx`). Bar content (left→right): `{N} selected` chip, action buttons (Start Stream, Start Recording, Maintenance, Exit Maintenance [conditional], Delete), flexible gap, Clear (×) icon button that resets `rowSelection`.
- **D-05:** Checkbox column is the first column of the table (left of Status). Uses the existing `data-table` primitive's `enableRowSelection` — do not hand-roll. Header checkbox = select-all-on-current-page tri-state. Standard TanStack behaviour.

### Bulk actions — failure handling & confirmation

- **D-06a:** Partial failure UX = **row-level error badge + summary toast**. On completion:
  - Toast: "`{succeeded}` succeeded, `{failed}` failed." (Sonner, default 3s)
  - Failed rows keep an inline error icon (AlertTriangle, amber) in the Status column or at the end of the row; hover → tooltip with the error reason from the API.
  - `rowSelection` is reduced to only the failed rows so the user can immediately retry.
- **D-06b:** Confirm dialog fires **only for Delete**. Start Stream / Start Recording / Maintenance toggle run immediately. Delete confirm dialog shows the count and lists up to 5 camera names (then "+N more"), requires a single click on the destructive button (no type-to-confirm).

### Row action menu

- **D-07:** Maintenance menu item is **asymmetric and dynamic**:
  - When `camera.maintenanceMode === false` → item label "Maintenance", wrench icon, click opens the existing `MaintenanceReasonDialog` to capture an audit reason.
  - When `camera.maintenanceMode === true` → item label "Exit Maintenance", same wrench icon with a slash/check accent, click runs the exit action directly (no dialog). Toast on success: "Exited maintenance mode".
- **D-08:** Final row action menu order (top→bottom): `Edit · View Stream · Start Stream · Start Recording · Maintenance | Exit Maintenance · Copy Camera ID · Copy cURL example · Embed Code · ── separator ── · Delete`. Delete remains the only destructive item, separated and red.
- **D-09:** "Copy Camera ID" copies the raw `camera.id` string (UUID v4, 36 chars — e.g. `1dfaadd7-c5f9-49b8-b26e-7a6c402a8103`). Same `id` used by `GET /api/cameras/:cameraId/sessions`, `GET /playback/stream/:orgId/:cameraId.m3u8`, and every other playback endpoint.
- **D-10:** "Copy cURL example" copies a prefilled snippet. **Planner decision:** pick ONE representative endpoint that an API consumer is most likely to call first — recommended: `POST /api/cameras/:cameraId/sessions` (the playback session creation endpoint). Template:
  ```
  curl -X POST \
    -H "X-API-Key: <YOUR_API_KEY>" \
    http://<host>/api/cameras/<camera.id>/sessions
  ```
  The `<host>` token uses `window.location.origin`; `<YOUR_API_KEY>` stays as a literal placeholder (the UI does NOT fetch/inject the user's key).
- **D-11:** Both copy actions use the existing `navigator.clipboard.writeText` + Sonner toast pattern from `apps/web/src/app/admin/cameras/components/push-url-section.tsx`. Toast copy: "Camera ID copied" / "cURL example copied" on success; "Couldn't copy to clipboard" on failure.

### Status badge redesign (Cameras table)

- **D-12:** Replace the current trio (CameraStatusDot + recording dot + wrench icon) with **horizontally-stacked text pills** in the Status column. One row can display up to three pills side by side with a 4px gap.
- **D-13:** Badge inventory:
  | State | Pill | Colour | Icon | Text |
  |-------|------|--------|------|------|
  | Streaming (online) | `LIVE` | red background, white text | broadcast `((•))` | `LIVE` |
  | Recording active | `REC` | dark (near-black) background, white text | red pulsing dot | `REC` |
  | Maintenance mode | `MAINT` | amber background, dark text | wrench | `MAINT` |
  | Offline | `OFFLINE` | neutral/muted (gray), muted text | hollow dot | `OFFLINE` |
  | Degraded / Reconnecting | `LIVE` variant | amber outline LIVE pill (pulsing) | broadcast `((•))` | `LIVE` (pulse) |
- **D-14:** A row can have multiple pills simultaneously (e.g. streaming + recording → `LIVE  REC`; streaming + maintenance is not a valid combination — maintenance suppresses LIVE). Ordering is always: stream-state first, then REC, then MAINT.
- **D-15:** Animation: LIVE and REC pills pulse (subtle opacity + scale). MAINT and OFFLINE are static. Reconnecting state gets a stronger pulse on the LIVE variant. Respect `prefers-reduced-motion` — disable pulse entirely when set.
- **D-16:** UI copy stays English (per user preference for English-only UI strings); do NOT translate pill labels.

### View Stream sheet — header

- **D-17:** Header becomes a three-line block:
  - Line 1: Camera name (existing, `text-xl font-semibold`)
  - Line 2: Breadcrumb `{siteName} > {projectName}` (existing)
  - Line 3 (new): Monospace ID chip + copy icon button. No label "Camera ID:" prefix — the monospace chip is self-describing.
- **D-18:** ID chip displays truncated form `1dfaadd7…402a8103` (8 chars prefix + ellipsis + 8 chars suffix, `font-mono text-xs`). Full UUID available in a tooltip on hover. Clicking the chip (or the copy icon beside it) copies the FULL UUID — not the truncated form. Same Sonner toast as row-menu copy.

### View Stream sheet — Start Stream / Start Record buttons

- **D-19:** Both buttons expand from icon-only squares (current state, `Button size="icon-sm"`) to variable-width pills that grow when active to fit a text label. Container layout reserves enough width for the active-state label (≈160 px each) so toggling doesn't reflow surrounding content.
- **D-20:** **Start Stream button**:
  - Idle: outline variant, gray broadcast icon `((•))`, no label. Tooltip "Start Stream".
  - Active: red solid fill, white broadcast icon with pulse, visible label "Stop Stream". Tooltip "Stop Stream".
  - Transition: 150 ms ease on background + width.
- **D-21:** **Start Record button**:
  - Idle: outline variant, gray empty circle `○`, no label. Tooltip "Start Recording".
  - Active: dark (near-black) solid fill, pulsing red dot, white label "REC". Tooltip "Stop Recording".
  - Transition: 150 ms ease on background + width.
- **D-22:** No elapsed timer on the Record button in this phase (considered but deferred — see `<deferred>`). Keeps the button minimalist and avoids a second render path synced to a ticking clock.

### Claude's Discretion

- Exact pill border-radius, padding, font-size (keep within Tailwind + shadcn conventions already in the codebase).
- Exact shade of "dark" for the REC pill/button (near-black vs `zinc-900`).
- Concurrency limit for bulk fan-out (suggested 5, planner may adjust).
- Tooltip delay timing.
- Precise skeleton/loading states for the bulk operation in-flight indicator (e.g. disable toolbar, show spinner on affected rows).
- Whether the Clear (×) button in the bulk toolbar also clears visible error badges, or errors clear only on next action. Recommended: errors clear on next bulk action against the same row; Clear (×) only clears selection.

### Folded Todos

None — no pending todos matched Phase 20 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing shared components to modify
- `apps/web/src/components/pages/tenant-cameras-page.tsx` — tenant-side page host that composes the shared table + sheet.
- `apps/web/src/app/admin/cameras/components/cameras-data-table.tsx` — DataTable wrapper; where the bulk toolbar hooks in.
- `apps/web/src/app/admin/cameras/components/cameras-columns.tsx` — column definitions; Status column (lines 71–126) + row actions menu (lines 226–251) are rewritten here.
- `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx` — sheet header + the two stream/record buttons (lines 93–113).
- `apps/web/src/app/admin/cameras/components/camera-status-badge.tsx` — existing status dot component; this phase replaces its render output, not its prop contract.

### Patterns to reuse
- `apps/web/src/components/ui/data-table/data-table.tsx` — primitive with `enableRowSelection` + `onRowSelectionChange`; do not hand-roll selection.
- `apps/web/src/components/ui/data-table/data-table-row-actions.tsx` — existing row-actions dropdown component that hosts the seven menu items.
- `apps/web/src/app/app/recordings/components/recordings-data-table.tsx` — reference implementation for bulk toolbar, `rowSelection` state management, and confirm-dialog-before-bulk-delete flow. **Study this file before writing new bulk code.**
- `apps/web/src/app/admin/cameras/components/push-url-section.tsx` — reference implementation for `navigator.clipboard.writeText` + Sonner toast error handling.

### Prior phase decisions that still apply
- Phase 14 `.planning/phases/14-bug-fixes-datatable-migrations/14-CONTEXT.md` — DataTable migration pattern (row selection, columns, pagination conventions).
- Phase 18 `.planning/phases/18-dashboard-map-polish/18-CONTEXT.md` §D-13/D-14/D-15 — semantics of the three status signals (stream, recording, maintenance) and colour choices on the map; this phase keeps the semantics but changes the table rendering only.
- Phase 19.1 `.planning/phases/19.1-rtmp-push-ingest-with-platform-generated-stream-keys/19.1-CONTEXT.md` — view-stream-sheet edits already landed; Phase 20 does not conflict with push-URL section added there.

### User preferences (auto-memory)
- `~/.claude/.../memory/feedback_language_english_default.md` — UI copy stays English; pill labels, toast strings, tooltips all English.
- `~/.claude/.../memory/feedback_ui_pro_minimal.md` — pro-minimal aesthetic; single primary CTA, strip optional controls, show mockups before committing.

### API endpoints referenced by "Copy cURL example"
- `apps/api/src/playback/playback.controller.ts:42` — `POST /api/cameras/:cameraId/sessions` — the chosen template target.
- `apps/api/src/playback/playback.controller.ts:162` — `GET /playback/stream/:orgId/:cameraId.m3u8` — alternative (not chosen for the snippet because it requires orgId + valid session token).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DataTable` primitive already supports `enableRowSelection` + `onRowSelectionChange` (see `data-table.tsx` lines 88, 106, 110, 142–148). Bulk work is a composition task, not a primitive-extension task.
- `DataTableRowActions` (`data-table-row-actions.tsx` lines 16–77) hosts the action menu; the seven camera actions register through its action config array in `cameras-columns.tsx` lines 226–251. Adding two items and mutating one label is an array edit, not a component rewrite.
- Sonner toast + `navigator.clipboard.writeText` pattern is in three places already — zero new plumbing.
- `MaintenanceReasonDialog` (exists in the cameras components folder) — reused verbatim for the asymmetric Enter flow.

### Established Patterns
- Recording table (`recordings-data-table.tsx`) is the canonical bulk-toolbar reference. Copy its `bulkDeleteOpen` state machine, its `Promise.allSettled` fan-out, its toast summary. Do NOT invent a new pattern.
- Tenant Cameras page and Admin Cameras page share components — changes land in one file and benefit both surfaces.
- Status column currently renders three distinct visual primitives; replacing them as one `<StatusBadges camera={camera} />` component (co-located under `camera-status-badge.tsx` or a new `status-badges.tsx`) keeps the column cell simple.

### Integration Points
- Sticky bulk toolbar attaches above `<CamerasDataTable>` inside `tenant-cameras-page.tsx` — component exposes `rowSelection` via `onRowSelectionChange`, parent renders the bar.
- View Stream sheet header is rendered inside `view-stream-sheet.tsx`; the new ID chip slots between the existing breadcrumb and the first tab row (`Preview | Activity`).
- Start/Record buttons already exist in `view-stream-sheet.tsx` lines 93–113 — active/idle variants are prop-driven, not structural changes.

</code_context>

<specifics>
## Specific Ideas

- Badge reference images from the user: LIVE pill = broadcast-icon style red pill with white `LIVE` text; REC pill = black pill with red pulsing dot and white `REC` text. These are the north stars for visual output — keep pills visibly in that family, not reinvented.
- Selection toolbar reference: user picked the Linear/Gmail pattern (sticky top, counter on left, actions in the middle, clear × on the right). Match that spacing and hierarchy.
- User emphasised that the current Start Stream / Start Record buttons "feel flat" — the active state MUST be visually unmistakable. If in doubt, pick the more expressive option (fill + label swap beats subtle outline change).
- Camera ID exposure was driven by a concrete pain point: API consumers need the UUID, but the UI provided no surface to read or copy it. The fix is pragmatic copy affordance in two places (row menu + sheet header), not a dedicated "API" tab.

</specifics>

<deferred>
## Deferred Ideas

- **Elapsed-time timer on the REC button** (`REC · 0:12`). Useful for long recordings but adds a second render path and clock sync. Revisit when a dedicated "recording session" surface is scoped.
- **Stop Stream / Stop Recording as bulk actions.** Only Start variants are in scope now per user's original list. Stop-bulk can be added in a follow-up if the pain case emerges (e.g. end-of-day bulk stop).
- **Keyboard shortcuts for bulk actions** (e.g. `Cmd+A` select all, `Delete` to delete selection). Nice-to-have but not requested.
- **Per-camera API docs modal / "Developer" tab.** If Copy cURL becomes heavily used, a dedicated modal showing all endpoints + full examples (not just playback/sessions) could graduate here.
- **Toggle switch + OBS-style control** for Start Stream (considered as option 3). Not selected — inconsistent with the row-menu pattern, adds a third visual metaphor.
- **Selection persistence across pagination.** Current assumption: selection scopes to the visible page and clears on page change. Cross-page selection is deferred.
- **Mobile responsive layout for the bulk toolbar.** Desktop-first in this phase; if the bar becomes cramped under `md:`, fold action labels into a "⋯" overflow menu.

### Reviewed Todos (not folded)

None reviewed — no pending todos matched Phase 20.

</deferred>

---

*Phase: 20-cameras-ux-bulk-actions-maintenance-toggle-copy-id-expressiv*
*Context gathered: 2026-04-24*
