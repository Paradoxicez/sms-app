# Quick Task 260426-ox9: Add Download + Delete row actions to per-camera Recordings detail table - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Task Boundary

Add Download + Delete row actions to the **per-camera Recordings detail page** (`/app/recordings/[id]`) — specifically the "Recordings on {date}" table rendered by `apps/web/src/app/app/recordings/[id]/components/recordings-list.tsx`.

This page is distinct from the main Recordings listings page (`/app/recordings`) which already uses the shared DataTable with Download + Delete row actions wired up via `DataTableRowActions` in `apps/web/src/app/app/recordings/components/recordings-columns.tsx`.

Backend endpoints already exist on `apps/api/src/recordings/recordings.controller.ts`:
- `@Get(':id/download')` — line 249
- `@Delete(':id')` — line 403

The detail-page table currently uses raw shadcn `<Table>` primitives (NOT migrated to shared DataTable). Columns: blank-icon · Time Range · Duration · Size · Status. Row click navigates to a different recording (changes `currentRecordingId`).

Out of scope: Timeline-vs-time-range mismatch bug (deferred to a separate `/gsd-debug` session per user choice).
</domain>

<decisions>
## Implementation Decisions

### Migration Scope
- **Decision:** Migrate `recordings-list.tsx` to use the shared `DataTable` and reuse `DataTableRowActions` so the detail-page table behaves consistently with the main listings page.
- **Reuse:** Pull column definitions and `rowActions` shape from existing `recordings-columns.tsx` if possible; otherwise replicate the same pattern locally and keep the components colocated under `[id]/components/`.
- **Preserve existing UX:** keep row-click → `onRowClick(rec.id)` navigation, the leading "now playing" `Play` icon for the current recording, the date-range header, and skeleton/empty states.

### Delete Confirmation
- **Decision:** Use shadcn `AlertDialog` (modal confirm) — same pattern Cameras page already uses for destructive single-row actions. No toast-undo, no inline confirm.
- **Copy:** English-only per project convention. Title and body should be specific (e.g. "Delete recording?" / "This recording (HH:mm – HH:mm, NN MB) will be permanently removed."). Confirm button uses destructive variant.
- **After delete:** invalidate the recordings query (use existing `use-recordings.ts` hook's queryKey) so the row disappears. If the deleted recording was the `currentRecordingId`, fall back to the next available recording or clear playback (mirror what main listings does — verify in code).

### Claude's Discretion
- **Action UI placement:** Use the same kebab `DataTableRowActions` pattern as the main listings page (single trailing actions column; Download + Delete inside dropdown). Consistent with main listings + memory's "single primary CTA + inline hierarchy" preference (delete is hidden behind dropdown — destructive is not a primary CTA).
- **Loading/error states for actions:** Disable the action while a request is in flight; surface failures via existing toast system (whatever the main listings uses).
- **DataTable feature toggles:** sorting/filtering/pagination on this detail-page table is NOT required for this quick task — keep it simple (one day's recordings, usually short list). Inherit DataTable defaults but don't add toolbar unless trivial.
</decisions>

<specifics>
## Specific Ideas

- Main listings reference (already wired): `apps/web/src/app/app/recordings/components/recordings-columns.tsx:138-156` — has `rowActions` with Download + Delete using `DataTableRowActions`.
- Backend endpoints (verified):
  - `GET /api/recordings/:id/download` — `recordings.controller.ts:249`
  - `DELETE /api/recordings/:id` — `recordings.controller.ts:403`
- Existing AlertDialog usage: check Cameras page delete dialog for the canonical destructive-confirm pattern in this codebase before creating a new one.
- React Query invalidation: `use-recordings.ts` exposes `useRecordings(cameraId, date)` — invalidate that queryKey after successful delete.

</specifics>

<canonical_refs>
## Canonical References

- `apps/web/src/app/app/recordings/components/recordings-columns.tsx` — canonical rowActions / DataTableRowActions wiring to mirror
- `apps/web/src/app/app/recordings/components/recordings-data-table.tsx` — DataTable usage example for the recordings domain
- `apps/api/src/recordings/recordings.controller.ts:249,403` — download + delete endpoints
- Memory: `feedback_language_english_default.md` (English-only UI copy)
- Memory: `feedback_ui_pro_minimal.md` (single primary CTA + inline hierarchy — destructive actions belong inside dropdown, not as standalone column)

</canonical_refs>
