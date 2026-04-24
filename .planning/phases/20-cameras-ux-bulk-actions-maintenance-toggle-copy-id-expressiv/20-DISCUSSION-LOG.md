# Phase 20: Cameras UX — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `20-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 20-cameras-ux-bulk-actions-maintenance-toggle-copy-id-expressiv
**Areas discussed:** Bulk actions — scope & toolbar · Row action menu — exit maintenance + copy ID · Status icon redesign · View Stream sheet — Camera ID + active buttons

---

## Gray area selection

**Question:** Which areas to discuss?
**User's choice:** All four areas (Bulk actions, Row action menu, Status icon redesign, View Stream sheet).

---

## Area 1 — Bulk actions: scope & toolbar

### Q: Which actions belong in the bulk toolbar?

| Option | Description | Selected |
|--------|-------------|----------|
| Start Stream | Start pull/push streaming | ✓ (implicitly, via "use original list") |
| Stop Stream | Counterpart to Start Stream | |
| Start / Stop Recording | Toggle recording state | ✓ (Start only, per original list) |
| Enter / Exit Maintenance + Delete | Toggle + delete | ✓ |

**User's choice:** "ใช้ตามที่ฉันบอกไปแต่แรก" — the literal original list: Start Stream, Start Recording, Maintenance (toggle), Delete. Stop variants NOT in initial bulk scope.

### Q: Toolbar shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Sticky top bar above table | Linear/Gmail-style bar with counter + actions + clear | ✓ |
| Floating pill bottom | YouTube/Gmail mobile style fixed-bottom | |
| Inline with filter toolbar | Replaces Status/Project/Site buttons | |

**User's choice:** Sticky top bar above table. Preview confirmed with ASCII mockup.

### Q: Partial failure handling?

| Option | Description | Selected |
|--------|-------------|----------|
| Row error badge + summary toast | Inline icons + "N succeeded, M failed" toast; keep failed selection | ✓ |
| Summary toast only + View errors modal | Count + optional modal with error list | |
| All-or-nothing | Rollback if any fails | |

**User's choice:** Row-level error badges + summary toast.

### Q: When to show confirm dialog?

| Option | Description | Selected |
|--------|-------------|----------|
| Delete + Stop actions | Confirm destructive + reversibility-affecting | ✓ |
| Delete only | Only irreversible deletion | (effectively this, since Stop not in scope) |
| Confirm all at ≥ 5 rows | Threshold-based | |

**User's choice:** "Delete + Stop actions" — but since Stop actions are NOT in bulk scope, this resolves to **Delete only**. Noted in CONTEXT.md D-06b.

---

## Area 2 — Row action menu: exit maintenance + copy ID

### Q: Maintenance menu item — shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic label swap Enter ↔ Exit | Single item, label flips based on state | |
| Two separate items (Enter + Exit) | Both visible, grey out the non-applicable one | |
| Enter opens dialog, Exit runs directly | Asymmetric — reason required only to enter | ✓ |

**User's choice:** Asymmetric. Enter still opens the reason dialog (audit trail); Exit runs instantly from the menu without a dialog. Implementation must swap the single item's label + click handler based on `camera.maintenanceMode`.

### Q: Copy Camera ID placement in menu?

| Option | Description | Selected |
|--------|-------------|----------|
| After View Stream | Group with view-related | |
| Right before Embed Code | Group identity/developer items together | ✓ |
| Top (under Edit) | Treat as primary info | |

**User's choice:** After Maintenance, immediately before Embed Code.

### Q: Copy Camera ID — format?

| Option | Description | Selected |
|--------|-------------|----------|
| Camera ID (UUID) only | Raw `camera.id` | ✓ (as one of two) |
| cURL snippet only | Prefilled curl template | ✓ (as one of two) |
| Both (two menu items) | User picks per need | ✓ |

**User's choice:** Both — two separate menu items: "Copy Camera ID" and "Copy cURL example".

### Q: Feedback after copy?

| Option | Description | Selected |
|--------|-------------|----------|
| Sonner toast | Success toast, reuse push-url-section pattern | ✓ |
| Toast + show copied ID | Toast includes a trimmed preview of the ID | |
| Inline checkmark, no toast | Quieter | |

**User's choice:** Sonner toast (existing pattern).

### Clarification: Is Camera ID the same as the id in the URL `/api/cameras/<uuid>/sessions`?

**Answered inline (not via AskUserQuestion):** Yes — confirmed via `apps/api/src/prisma/schema.prisma` (`Camera.id String @id @default(uuid())`) and `apps/api/src/playback/playback.controller.ts:42` (`@Post('cameras/:cameraId/sessions')`). Same UUID v4 used across sessions, retry-probe, and HLS playback endpoints. `cam_…` prefix mockup from the earlier preview was inaccurate and corrected to the raw UUID format.

---

## Area 3 — Status icon redesign

### Q: Badge primary shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Text pill with icon | LIVE/REC/MAINT/OFFLINE pills with icon + label | ✓ |
| Icon-only enlarged | Less text, tooltip-driven | |
| Pill for active + dot for offline | Hybrid | |

**User's choice:** Text pill with icon (mockup previewed and confirmed).

### Q: Colours per state?

| Option | Description | Selected |
|--------|-------------|----------|
| LIVE=red, REC=dark/red, MAINT=amber, OFFLINE=neutral | Matches reference images | ✓ |
| LIVE=green, REC=red, MAINT=amber, OFFLINE=gray | Semantic colour theory | |
| Use theme green for LIVE | Brand-consistent | |

**User's choice:** LIVE=red, REC=dark/red, MAINT=amber, OFFLINE=neutral.

### Q: Multiple badges — how to arrange?

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal row, adjacent | [LIVE] [REC] [MAINT] on one line | ✓ |
| Primary + secondary mini icons | One main pill + corner mini indicators | |
| Two rows stacked | Top: stream, bottom: recording/maintenance | |

**User's choice:** Horizontal adjacent row.

### Q: Animation?

| Option | Description | Selected |
|--------|-------------|----------|
| Pulse LIVE + REC | Broadcast/recording pulse; MAINT/OFFLINE static | ✓ |
| Static everywhere | No CPU cost | |
| Pulse reconnecting only | Only unstable states | |

**User's choice:** Pulse LIVE + REC; stronger pulse variant for reconnecting state.

---

## Area 4 — View Stream sheet: Camera ID + active buttons

### Q: Camera ID placement in header?

| Option | Description | Selected |
|--------|-------------|----------|
| Line 3 under breadcrumb | Three-line block: name / breadcrumb / ID chip | ✓ |
| Inline after breadcrumb | Single line: `NATABURI > Bedrock · 1dfaadd7…` | |
| Relocated to Camera Info section | Not in header, scroll to find | |

**User's choice:** Line 3 under breadcrumb (preview confirmed).

### Q: Camera ID display form? (UUID v4, 36 chars)

| Option | Description | Selected |
|--------|-------------|----------|
| Truncated monospace + copy icon | `1dfaadd7…402a8103` (8+8 chars), copy icon | ✓ |
| Full UUID monospace | All 36 chars visible | |
| Prefix only | First 8 chars, git-short-hash style | |
| Hidden behind a "Copy" button | No ID visible | |

**User's choice:** Truncated 8+8 monospace + copy icon. Click chip or icon copies FULL UUID (truncation is display-only). Preview confirmed.

### Q: Start Stream button — active state?

| Option | Description | Selected |
|--------|-------------|----------|
| Fill red + pulse icon + label swap | Outline → red fill with "Stop Stream" text | ✓ |
| Fill red + pulse (icon-only) | No label swap, tooltip carries state | |
| Toggle switch + colour | OBS-style switch | |

**User's choice:** Fill red + pulse + label swap. Preview confirmed.

### Q: Start Record button — active state?

| Option | Description | Selected |
|--------|-------------|----------|
| Fill dark + pulsing red dot + "REC" | Black pill with red dot + "REC" text | ✓ |
| Fill red + pulsing dot + timer | Active with elapsed time | |
| Fill red + pulse (icon-only) | No label | |

**User's choice:** Fill dark + pulsing red dot + "REC" (matches Image #25 reference). Preview confirmed.

---

## Claude's Discretion

Items left to planner/implementer judgement — recorded in `20-CONTEXT.md` `<decisions>` § Claude's Discretion:
- Pill radius/padding/font-size
- Exact "dark" shade for REC (near-black vs `zinc-900`)
- Concurrency limit for bulk fan-out (suggested 5)
- Tooltip delay timing
- Precise in-flight loading state during bulk operations
- Clear (×) button semantics re: error badge clearing

## Deferred Ideas

- REC button elapsed-time timer (considered, not selected)
- Stop Stream / Stop Recording as bulk actions
- Keyboard shortcuts for bulk selection
- Dedicated "Developer" tab / API docs modal
- OBS-style toggle switch for Start Stream
- Cross-page selection persistence
- Mobile responsive bulk toolbar
