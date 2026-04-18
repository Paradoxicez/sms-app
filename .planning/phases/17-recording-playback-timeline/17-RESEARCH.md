# Phase 17: Recording Playback & Timeline - Research

**Researched:** 2026-04-18
**Domain:** Next.js 15 App Router dynamic route + composition of existing HLS player / 24h timeline / recordings list
**Confidence:** HIGH (codebase-grounded; all referenced files were Read directly)

## Summary

Phase 17 is **almost entirely a composition / wiring task** on top of components and hooks that already ship and are battle-tested in `RecordingsTab` (camera-detail sheet). Decisions are locked: `/app/recordings/[id]` page, full-row click entry, stacked layout, no stitched manifest, reuse `TimelineBar` + `HlsPlayer` + `useRecordingTimeline/Calendar/RecordingsList` verbatim. There is no library/version uncertainty — the entire stack is already in production use in this repo.

The implementation-level questions worth researching are:
1. Whether `DataTable` already supports a row-click handler, and if not, the cleanest extension path (verified: it does NOT — no `onRowClick`, no row-level event prop, base implementation is `<TableRow>` with no `onClick`).
2. The page-level state machine: how `recordings-tab.tsx` derives `cameraId+date` and orchestrates calendar/timeline/list — whether the new page can mirror it or needs to derive `cameraId+date` from the recording entity.
3. Component move strategy (D-13): what import sites exist today and what breaks on a move.
4. URL ↔ state sync: `router.push` vs `router.replace` for date changes and timeline-induced recording switches — back-button behavior is the key constraint.
5. Edge cases: 404 (recording deleted/wrong-org), camera deleted, feature gate disabled, recording on a date with no other recordings.
6. Validation strategy: this repo uses Vitest only (jsdom for web, node for api) — **no Playwright** — so "E2E-like" coverage is approximated with React Testing Library + jsdom + mocked `apiFetch`/`useRouter`.

**Primary recommendation:** Mirror the `recordings-tab.tsx` composition almost verbatim, but **invert the data-flow root**: instead of holding `selectedDate` in state and deriving everything from it, hold the **URL recording id** as the source of truth and derive `selectedDate` + `cameraId` from `GET /api/recordings/:id`. The page becomes a **thin URL adapter** around the same Calendar+TimelineBar+HlsPlayer+List composition.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**URL & Entry Point**
- **D-01:** Playback page lives at `/app/recordings/[id]` — entity-based URL keyed by recording id. Page fetches the recording, derives `cameraId` + `date` from it, then loads the rest (timeline, daily recordings list) for that camera+date.
- **D-02:** Entry point is full-row click in the existing `/app/recordings` DataTable — `router.push('/app/recordings/' + recording.id)`. No new row action; row click takes priority over checkbox selection (checkbox remains in its own column cell). Existing Download/Delete row actions stay unchanged.
- **D-03:** No shareable deep-link query params (no `?focus=HH:MM`). Can be added later if a real use case emerges.

**Date Navigation**
- **D-04:** Combined Prev/Next day buttons + Calendar popover. Layout: `[<] [Apr 18, 2026 ▼] [>]`. The date label button opens a `shadcn Calendar` popover with dots under days that have recordings (reuse `useRecordingCalendar` hook).
- **D-05:** Changing the date keeps the same `cameraId` and reloads timeline + recordings list for the new date. If the new date has recordings, auto-select the first one and update URL to that recording id (keeps URL canonical). If no recordings, show empty state on the player and keep current URL.

**Layout**
- **D-06:** Stacked layout — same pattern as `recordings-tab.tsx`:
  - Top: HLS player (aspect-video, `max-w-[1024px]`, centered)
  - Middle: TimelineBar (24h heatmap + click-to-seek + drag-select)
  - Bottom: Recordings list (table of recordings for the current date)
- **D-07:** Page header shows camera name + date navigation controls. Back button returns to `/app/recordings` with preserved filter state (browser back works natively because we only use `router.push` for entry).
- **D-08:** No sidebar/split layout, no immersive/full-bleed video — preserves the app's sidebar-nav + main-content style.

**Multi-Recording Day Behavior**
- **D-09:** Click on a timeline hour loads the recording that contains that hour (reuse existing `handleSeek` logic from `recordings-tab.tsx:119-134`). When the clicked hour has no recording, do nothing (heatmap already shows which hours are empty).
- **D-10:** No stitched 24-hour manifest. Each recording plays as its own HLS source via `GET /api/recordings/:id/manifest`. Cross-boundary continuous playback is out of scope for this phase — deferred to future if demanded.
- **D-11:** Clicking a row in the bottom recordings list navigates to `/app/recordings/[that-id]` (same page, different recording) — URL always reflects the currently-playing recording.

**Component Reuse**
- **D-12:** Reuse existing components verbatim: `TimelineBar`, `HlsPlayer` (`mode="vod"`), `Calendar`, hooks `useRecordingTimeline`, `useRecordingsList`, `useRecordingCalendar` from `apps/web/src/hooks/use-recordings.ts`.
- **D-13:** If a component needs to move to a shared location, move it to `apps/web/src/components/recordings/` and update the one existing import. Don't duplicate.

**Existing RecordingsTab**
- **D-14:** Keep `RecordingsTab` (in admin/cameras camera detail sheet) as-is for this phase. It serves a different workflow (managing recordings from camera context). The new playback page is the primary viewing surface; the tab stays for management.

### Claude's Discretion
- Loading skeleton design for player + timeline + list
- Empty state copy and illustrations (no recordings, no date selected, permission denied)
- Error state handling (recording deleted while viewing, camera deleted, network error)
- Exact spacing, typography, and breadcrumb design
- Whether to add a small "Open in camera detail" link on the playback page (nice-to-have)
- Auto-play behavior on page load (default: pause; user clicks play — same as existing HlsPlayer `autoPlay={false}` in recordings-tab)

### Deferred Ideas (OUT OF SCOPE)
- **Stitched 24h manifest with discontinuity tags** — best-UX cross-recording seek, but requires new `ManifestService.generateDailyManifest()` + HLS discontinuity handling. Revisit if user feedback shows frequent cross-boundary playback needs.
- **Shareable deep-link `?focus=HH:MM`** — for incident investigation links. Add when a use case emerges.
- **Timeline zoom levels (6h, 1h)** — already tracked as REC-04 future requirement.
- **Cross-camera timeline view** — already tracked as REC-05 future requirement.
- **Frame-level seeking with thumbnail sprites** — explicitly out of scope per REQUIREMENTS.md.
- **Split layout (player + sidebar list)** — considered, deferred to keep scope tight; revisit if desktop users ask.
- **Back button preserves exact filter state via URL** — browser back handles it for now; explicit state preservation can be added later if `router.replace` ever breaks this.

## Project Constraints (from CLAUDE.md)

| Directive | How it bears on Phase 17 |
|-----------|--------------------------|
| Next.js 15.x App Router (not Pages) | Use `app/` directory, `useParams()` from `next/navigation`, `'use client'` on dynamic page |
| hls.js 1.5.x for browser playback | `HlsPlayer` already wraps `hls.js@1.6.15` (per `package.json`) — reuse, do not introduce a new player |
| Cookie-based auth via `apiFetch` | All API calls go through `apiFetch<T>()` which sets `credentials: 'include'`. HLS XHR sets `xhr.withCredentials = true` — already done in `HlsPlayer` |
| Vitest for testing | Use `vitest` + `@testing-library/react` for web; `vitest` + `nestjs` test patterns for api. **No Playwright/Cypress in this repo** |
| Sonner for toasts | `toast()`, `toast.error()` — already imported wherever needed |
| `shadcn` UI primitives | Use `Button`, `Calendar`, `Popover`, `Table`, `Skeleton` — all already installed |
| GSD workflow | This research consumed by `gsd-planner`; downstream `gsd-execute-phase` enforces task atomicity |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **REC-01** | User สามารถเล่น recording ผ่าน HLS player ในหน้า playback ได้ | Reuse `HlsPlayer` with `src={`/api/recordings/${id}/manifest`}` and `mode="vod"`. Endpoint already exists at `apps/api/src/recordings/recordings.controller.ts:314`. |
| **REC-02** | หน้า playback มี timeline scrubber (24h bar) สำหรับ click-to-seek | Reuse `TimelineBar` (24h, drag-select, click-to-seek, keyboard nav already implemented). Click-to-seek navigates to the recording containing the clicked hour via `router.push`. |
| **REC-03** | Timeline แสดง hour availability heatmap (ช่วงที่มี/ไม่มี footage) | `useRecordingTimeline(cameraId, dateStr)` returns `{ hours: [{ hour, hasData }] }`; `TimelineBar` renders filled `bg-chart-1` cells for `hasData=true`, empty for `false`. Endpoint: `GET /api/recordings/camera/:cameraId/timeline?date=YYYY-MM-DD` (controller line 156). |

## Standard Stack

This phase introduces **zero new dependencies**. The full stack is in `apps/web/package.json` already.

### Core (already installed, verified versions in `apps/web/package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | ^15.0.0 | Routing (App Router dynamic `[id]`) | Repo standard since v1.1 [VERIFIED: `apps/web/package.json:26`] |
| React | ^19.0.0 | UI runtime | Repo standard [VERIFIED: same] |
| hls.js | ^1.6.15 | HLS playback in browser | Wrapped by `HlsPlayer`; supports VOD mode + Safari native fallback [VERIFIED: same] |
| react-day-picker | ^9.14.0 | Calendar primitive | Backs `shadcn Calendar` with `modifiers` API [VERIFIED: same] |
| @tanstack/react-table | ^8.21.3 | Already used by `DataTable`; touched only if we extend `onRowClick` [VERIFIED: same] |
| date-fns | ^4.1.0 | Date formatting `format(d, "MMM d, yyyy")`, `addDays`, `subDays`, `startOfDay` | Used everywhere for date math [VERIFIED: `recordings-columns.tsx:97`] |
| sonner | ^2.0.7 | Toasts for non-fatal errors (network) | Repo standard [VERIFIED: `apps/web/package.json:39`] |
| lucide-react | ^1.8.0 | `ChevronLeft`, `ChevronRight`, `ChevronDown`, `ArrowLeft`, `Play`, `Loader2`, `RotateCw` | Repo standard [VERIFIED: `apps/web/package.json:25`] |

### Reused In-Repo Modules (no install — these are existing files)

| Module | Path | What it gives us |
|--------|------|------------------|
| `HlsPlayer` | `apps/web/src/app/admin/cameras/components/hls-player.tsx` | VOD HLS playback w/ retry, cookie-auth XHR |
| `TimelineBar` | `apps/web/src/app/admin/cameras/components/timeline-bar.tsx` | 24h scrubber, heatmap, click-to-seek, drag-select, ARIA slider |
| `Calendar` | `apps/web/src/components/ui/calendar.tsx` | shadcn calendar primitive with `modifiers` |
| `Popover` | `apps/web/src/components/ui/popover.tsx` | Wraps Calendar |
| `Skeleton` | `apps/web/src/components/ui/skeleton.tsx` | Loading states |
| `Table*` | `apps/web/src/components/ui/table.tsx` | Bottom recordings list (NOT DataTable — simple table per UI-SPEC §Recordings List) |
| `Button` | `apps/web/src/components/ui/button.tsx` | Back/Prev/Next/Date label |
| `RecordingStatusBadge` | `apps/web/src/components/recording-status-badge.tsx` | Status column |
| `FeatureGateEmptyState` | `apps/web/src/components/feature-gate-empty-state.tsx` | 403 fallback |
| `useFeatures` + `useCurrentRole` | `apps/web/src/hooks/use-features.ts`, `use-current-role.ts` | Page-level feature gate (matches `app/recordings/page.tsx:11-20`) |
| `useRecordingTimeline` | `apps/web/src/hooks/use-recordings.ts:65` | Timeline hours |
| `useRecordingsList` | `apps/web/src/hooks/use-recordings.ts:132` | Bottom list |
| `useRecordingCalendar` | `apps/web/src/hooks/use-recordings.ts:98` | Calendar dot modifier |
| `apiFetch<T>` | `apps/web/src/lib/api.ts` | Cookie-auth fetch wrapper |

### Alternatives Considered

| Instead of | Could Use | Why we don't |
|------------|-----------|--------------|
| Reuse `HlsPlayer` from admin/cameras | Build a new player | Violates D-12; reinvents retry/XHR-credentials logic |
| Stitched daily manifest | Per-recording manifest + URL switch on hour click | D-10 explicitly defers stitched manifest |
| `DataTable` for bottom recordings list | Plain `Table` (no toolbar/pagination/filters) | UI-SPEC §Recordings List uses plain `Table` (matches `recordings-tab.tsx:271-330`); a single date's recordings is small, no pagination needed |
| New `useRecording(id)` hook | Inline `apiFetch` in the page | A dedicated hook is cleaner and testable in isolation; recommend creating one (~15 LOC) — see Architecture Patterns |

**Installation:** None. Verify with:
```bash
cd /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app/apps/web && cat package.json | grep -E 'hls.js|react-day-picker|date-fns|sonner'
```

## Architecture Patterns

### Recommended File Structure

```
apps/web/src/app/app/recordings/
├── page.tsx                              # existing — list page (entry point)
├── components/
│   ├── recordings-data-table.tsx         # MODIFY — wire row-click navigation
│   └── recordings-columns.tsx            # unchanged
└── [id]/                                 # NEW — dynamic playback route
    ├── page.tsx                          # NEW — feature-gate + composition
    └── components/
        ├── playback-page-header.tsx      # NEW — Back + camera name + date nav
        └── recordings-list.tsx           # NEW — bottom day-list table

apps/web/src/hooks/
└── use-recordings.ts                     # ADD `useRecording(id)` hook

apps/web/src/components/recordings/       # NEW DIR (per D-13, only if move triggered)
├── timeline-bar.tsx                      # MOVED from admin/cameras/components/ if shared
└── hls-player.tsx                        # MOVED from admin/cameras/components/ if shared
```

### Pattern 1: URL as source of truth, derive everything else

**What:** The `[id]` page reads `params.id`, fetches the recording, then derives `cameraId` and `dateStr`. All sub-components consume those derived values via existing hooks. Date and recording-id changes flow back through `router.push('/app/recordings/' + newId)` so URL always matches what's playing.

**When to use:** Whenever a deep-linked entity drives the page state (vs. local UI state).

**Example (synthesized from existing patterns):**
```typescript
// Source: apps/web/src/app/admin/policies/[id]/page.tsx:38-69 (useParams pattern)
//        + apps/web/src/app/admin/cameras/components/recordings-tab.tsx:119-134 (handleSeek)
'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import {
  useRecordingTimeline,
  useRecordingsList,
  useRecordingCalendar,
  type Recording,
} from '@/hooks/use-recordings';

export default function PlaybackPage() {
  const params = useParams();
  const router = useRouter();
  const recordingId = params.id as string;

  const [recording, setRecording] = useState<RecordingWithCamera | null>(null);
  const [loadError, setLoadError] = useState<'not-found' | 'forbidden' | 'network' | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Fetch recording — derives cameraId + initial date
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    apiFetch<RecordingWithCamera>(`/api/recordings/${recordingId}`)
      .then((r) => {
        if (cancelled) return;
        setRecording(r);
        setSelectedDate(new Date(r.startedAt));  // derive day from recording
      })
      .catch((err: Error) => {
        if (cancelled) return;
        if (err.message.includes('404')) setLoadError('not-found');
        else if (err.message.includes('403')) setLoadError('forbidden');
        else setLoadError('network');
      });
    return () => { cancelled = true; };
  }, [recordingId]);

  const cameraId = recording?.cameraId;
  const dateStr = selectedDate ? formatDate(selectedDate) : undefined;

  const { hours } = useRecordingTimeline(cameraId, dateStr);
  const { recordings } = useRecordingsList(cameraId, dateStr);
  const { days } = useRecordingCalendar(
    cameraId,
    selectedDate?.getFullYear() ?? 0,
    (selectedDate?.getMonth() ?? 0) + 1,
  );

  // Date change → keep cameraId, swap to first recording on new date (D-05)
  const handleDateChange = useCallback((d: Date) => {
    setSelectedDate(d);
  }, []);

  // When recordings list arrives for the new date, navigate to first one if URL doesn't match
  useEffect(() => {
    if (!recordings.length || !dateStr) return;
    const currentDate = recording ? formatDate(new Date(recording.startedAt)) : null;
    if (dateStr !== currentDate && recordings[0].id !== recordingId) {
      router.push(`/app/recordings/${recordings[0].id}`);
    }
  }, [recordings, dateStr, recording, recordingId, router]);

  // Timeline click → find recording for hour → navigate
  const handleSeek = useCallback((hour: number) => {
    const target = recordings.find((r) => {
      const sH = new Date(r.startedAt).getUTCHours();
      const eH = r.stoppedAt ? new Date(r.stoppedAt).getUTCHours() + 1 : 24;
      return hour >= sH && hour < eH;
    });
    if (target && target.id !== recordingId) {
      router.push(`/app/recordings/${target.id}`);
    }
  }, [recordings, recordingId, router]);

  // ...HlsPlayer src = `/api/recordings/${recordingId}/manifest`
}
```

### Pattern 2: Add `onRowClick` to base `DataTable` (preferred per UI-SPEC)

**What:** Extend `apps/web/src/components/ui/data-table/data-table.tsx` with an optional `onRowClick?: (row: TData) => void`. Wire it on `<TableRow>` and add `cursor-pointer` when set. Stop event propagation on cells that contain interactive children (checkbox, dropdown menu).

**When to use:** Phase 17 wires entry navigation; future tables (cameras, projects, etc.) will benefit from the same prop.

**Verified status:** `DataTable` does NOT have `onRowClick` today [VERIFIED: `apps/web/src/components/ui/data-table/data-table.tsx:38-55`]. The `<TableRow>` rendering at line 183-195 has no `onClick`, no `cursor-pointer`, no `tabIndex`.

**Example (proposed change to `data-table.tsx`):**
```typescript
// Add to DataTableProps:
onRowClick?: (row: TData) => void;

// In TableBody render (line ~183), replace existing TableRow with:
{table.getRowModel().rows.map((row) => (
  <TableRow
    key={row.id}
    data-state={row.getIsSelected() ? "selected" : undefined}
    className={onRowClick ? "cursor-pointer" : undefined}
    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
    tabIndex={onRowClick ? 0 : undefined}
    onKeyDown={onRowClick ? (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onRowClick(row.original);
      }
    } : undefined}
  >
    {row.getVisibleCells().map((cell) => (
      <TableCell key={cell.id}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </TableCell>
    ))}
  </TableRow>
))}
```

**Critical caveat:** the existing `select` and `actions` columns use `Checkbox` and `DataTableRowActions` (a DropdownMenu trigger). Their click handlers will bubble to the row's `onClick`. Two options:

1. **Cell-level `stopPropagation`:** Modify `recordings-columns.tsx` (and any other column files using row-click tables) to wrap the `Checkbox` and `DataTableRowActions` cells in a `<div onClick={(e) => e.stopPropagation()}>`. Verified-safe, scoped.
2. **Library-level guard:** In `DataTable`, detect if the click target is inside a `[data-row-click-stop]` element. Cleaner but requires the column author to add the marker.

**Recommendation:** Option 1 — explicit `stopPropagation` in `recordings-columns.tsx` only. Document the convention so future row-click tables follow the same pattern. Existing `Checkbox` cell at `recordings-columns.tsx:53-59` and the actions cell at `recordings-columns.tsx:136-153` are the only two that need wrapping.

### Pattern 3: Date change without losing camera context

**Implementation rule (per D-05):** Date change is a date-only mutation. The `cameraId` is derived from the *recording*, which doesn't change until the user picks a new recording. Two flows:

**Flow A — date has recordings:** Effect fires when `recordings` (from `useRecordingsList(cameraId, newDate)`) populates → `router.push('/app/recordings/' + recordings[0].id)`. The new id triggers a fresh `apiFetch`, which sets a new `selectedDate` matching that recording's date — but the user already chose the date, so this is consistent (no oscillation, because `recordings[0]` is on the requested date).

**Flow B — date has no recordings:** `recordings` is empty after fetch. URL stays the same (still pointing to the previously-playing recording). `useRecordingTimeline` returns all `hasData: false`. Player still has the old `src` — **decision needed:** keep the old recording playing in the player but show empty timeline + empty list? Or pause/clear the player and show "No recordings on this date"?

**Recommended:** Keep the old recording's player intact (D-05 says "show empty state on the player and keep current URL" — interpret as keep URL, keep player at last valid state, but the new date's timeline + list both show empty). Alternative: gray out the player or show an overlay "Viewing recording from {old date}; no recordings on {new date}." Defer exact UX to discretion (CONTEXT.md Claude's Discretion).

### Pattern 4: `useRecording(id)` hook (NEW — recommended addition)

Add a small hook to `use-recordings.ts` to keep the page declarative and testable. Mirrors existing hook signatures.

```typescript
// Add to apps/web/src/hooks/use-recordings.ts
export interface RecordingWithCamera extends Recording {
  camera?: {
    id: string;
    name: string;
    site?: { id: string; name: string; project?: { id: string; name: string } };
  };
}

export function useRecording(id: string | undefined) {
  const [recording, setRecording] = useState<RecordingWithCamera | null>(null);
  const [error, setError] = useState<'not-found' | 'forbidden' | 'network' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<RecordingWithCamera>(`/api/recordings/${id}`)
      .then((r) => { if (!cancelled) setRecording(r); })
      .catch((err: Error) => {
        if (cancelled) return;
        const msg = err.message;
        if (msg.includes('404')) setError('not-found');
        else if (msg.includes('403')) setError('forbidden');
        else setError('network');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  return { recording, loading, error };
}
```

### Pattern 5: Backend — expand `GET /api/recordings/:id` to include camera relation

**Verified gap:** `RecordingsService.getRecording(id, orgId)` at `apps/api/src/recordings/recordings.service.ts:463-472` only includes `_count.segments`. The UI-SPEC requires camera name + site + project for the page header.

**Option A (preferred — minimal change):** Modify `getRecording` to add the camera include. Same shape as `getRecordingWithSegments` (line 474), minus segments:
```typescript
async getRecording(id: string, orgId: string) {
  const recording = await this.prisma.recording.findUnique({
    where: { id },
    include: {
      _count: { select: { segments: true } },
      camera: {
        select: {
          id: true,
          name: true,
          site: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!recording) throw new NotFoundException(`Recording ${id} not found`);
  return recording;
}
```

**Option B:** Add a dedicated `GET /api/recordings/:id/with-camera` endpoint. Avoids changing existing payload shape but doubles trip count. **Don't do this** — Option A is cleaner.

**Org isolation note:** `getRecording` currently does `findUnique({ where: { id } })` and ignores `orgId` in the where. The TENANCY_CLIENT extension applies RLS automatically via `prisma` (verified pattern in this file — see `findFirst({ where: { id, orgId } })` in `getRecordingWithSegments`). For Option A, **also tighten to `findFirst({ where: { id, orgId } })`** to match `getRecordingWithSegments`. This converts cross-org access from a leak to a clean 404 — a small but important security improvement that the new playback page makes user-visible. Treat as a separate task in the plan ("API: add camera include + cross-org 404 to GET /api/recordings/:id").

### Anti-Patterns to Avoid

- **Holding both `selectedRecordingId` in state AND in URL:** double source of truth. Pick URL.
- **`router.replace` for date changes:** would break browser back. Use `router.push`.
- **`router.push` for filter state on the parent `/app/recordings` table:** that already uses `router.replace` for filters [VERIFIED: `recordings-data-table.tsx:114`] — DO NOT change it; we want filters to NOT push history entries.
- **Adding `onRowClick` only at the `recordings-data-table` wrapper level:** the UI-SPEC's preferred path is base `DataTable` extension (reusable). Wrapper-level handling is the explicit fallback.
- **Auto-playing on page mount:** UI-SPEC §Autoplay locks `autoPlay={false}`.
- **Skipping `e.stopPropagation()` on checkbox/actions cells:** clicking checkbox would also navigate.
- **Fetching the recording inside `HlsPlayer`:** the player must stay a dumb consumer of `src`. The page derives the manifest URL.
- **Using `useFeatureCheck` in the new page:** `app/recordings/page.tsx` uses the page-level pattern `useFeatures + isEnabled('recordings')` with `FeatureGateEmptyState`. Mirror that — don't introduce a second pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HLS playback in browser | Custom `<video>` + manual MediaSource | `HlsPlayer` (already wraps `hls.js@1.6.15`) | Retry logic, Safari fallback, cookie-auth XHR all solved |
| 24h timeline scrubber + heatmap | Custom canvas/SVG | `TimelineBar` | ARIA slider, drag-select, keyboard nav, hour formatting all done |
| Calendar with day decorations | Custom calendar grid | `Calendar` w/ `modifiers={{ hasRecording: dates }}` | shadcn primitive backed by `react-day-picker@9` |
| Date math (`addDays`, `subDays`, `format`, `startOfDay`) | Manual `Date` arithmetic | `date-fns` | Already a dep; consistent with existing code |
| Cookie-auth `fetch` | Manual `credentials: 'include'` everywhere | `apiFetch<T>(path, options)` | Single helper, throws on non-2xx |
| Toast notifications | Custom toaster | `sonner`'s `toast()` / `toast.error()` | Already wired in app shell |
| Feature gating | Inline `enabled` check | `useFeatures(orgId).isEnabled('recordings')` + `FeatureGateEmptyState` | Page-level pattern, locked by `app/recordings/page.tsx:11-20` |
| Manifest generation (server) | New endpoint | `GET /api/recordings/:id/manifest` (already exists, line 314) | Returns ready-to-load HLS manifest with proxy URLs |

**Key insight:** Phase 17 has near-zero "hand-roll risk" because the entire stack is repo-native. The only truly new code is the `[id]/page.tsx` orchestrator (~120 LOC) plus the small `onRowClick` extension in `DataTable`.

## Runtime State Inventory

> Phase 17 is greenfield (new files only) + minor extension of `DataTable` and `RecordingsService.getRecording`. There are no renames, refactors, or migrations. Per template guidance, this section is included to verify nothing is missed.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no DB schema changes. Same `recording`, `recording_segment` tables. | None |
| Live service config | None — no SRS config changes, no FFmpeg pipeline changes. Same HLS manifest endpoint. | None |
| OS-registered state | None — no new processes, schedulers, or daemons. | None |
| Secrets/env vars | None — no new secrets. Continues using existing `DATABASE_URL`, MinIO credentials, session cookies. | None |
| Build artifacts | None — no `pyproject.toml` / npm package rename. New `.tsx` files compiled via Next.js Turbopack. | None |

**Net runtime impact:** zero. The phase adds files and one prop. No data migration, no service restart required beyond a normal app deploy.

## Common Pitfalls

### Pitfall 1: `selectedDate` and `recording.startedAt` drift apart

**What goes wrong:** User clicks a recording on date A → page mounts, derives `selectedDate=A`. User picks date B in the calendar → `selectedDate=B`. Effect fires `router.push(firstRecordingOnB.id)`. New recording loads, but if you're not careful, an effect re-derives `selectedDate` from the new `recording.startedAt` and you can get oscillation or stale-fetch races.

**Why it happens:** Two state holders for the same logical concept (current date).

**How to avoid:** Treat `selectedDate` as user input, derived initially from the *first* recording fetch and then driven only by user actions (date picker, prev/next). Don't re-derive it on subsequent recording fetches. Use a ref or a `didInit` flag for the first-time-only derivation.

**Warning signs:** Date picker appears to "snap back" after navigating; player loads the same recording twice on date change.

### Pitfall 2: Stale closure in `handleSeek` / `handleDateChange`

**What goes wrong:** `useCallback(handleSeek, [recordings])` gets called with stale `recordings` because `recordings` is updated asynchronously after `dateStr` changes.

**Why it happens:** `recordings` lags one render behind `dateStr` because `useRecordingsList` re-fetches on `dateStr` change.

**How to avoid:** In `handleSeek`, **don't** decide what to do based on `recordings` directly if a date change just happened. Either (a) wait for the new `recordings` to arrive before allowing seek, or (b) re-fetch on demand. Existing `recordings-tab.tsx:119-134` uses approach (a) — `recordings` is always the current date's list because `dateStr` is stable when the user clicks the timeline.

**Warning signs:** Clicking timeline hour after switching date does nothing or navigates to wrong recording.

### Pitfall 3: Browser back button after date change

**What goes wrong:** User on `/app/recordings/abc` (date A) → picks date B → page auto-navigates to `/app/recordings/xyz` (first recording on B) → user hits browser Back → expects to return to date A but instead returns to date A's recording (correct), but if we used `router.replace` for the auto-navigation, Back would skip to the parent `/app/recordings` list.

**Why it happens:** `router.replace` does not push a history entry; `router.push` does.

**How to avoid:** Use `router.push` for the auto-navigate-to-first-recording-on-new-date flow. Each recording-id change is one history entry. Browser back: returns through each recording in reverse, then exits the playback page back to `/app/recordings`. Verified clean.

**Warning signs:** Back button skips multiple steps or lands in unexpected place.

### Pitfall 4: HLS player keeps last source after URL change without `key` reset

**What goes wrong:** When `recordingId` changes, `HlsPlayer` receives a new `src` prop. The `useEffect` in `HlsPlayer` watches `[src, autoPlay, mode]` (verified: `hls-player.tsx:97`) and tears down old hls + mounts new one. **Should work**, but be aware that the cleanup happens after the new effect setup is queued — so if `src` flips rapidly (e.g., user clicks two timeline hours fast), there can be a brief race.

**Why it happens:** React's effect cleanup is asynchronous relative to state updates.

**How to avoid:** The existing `cancelled` flag in `HlsPlayer` (line 23) handles this — old retry timers are cancelled. **No code change needed**, but if you observe playback flickers, add a `key={recordingId}` to `<HlsPlayer key={recordingId} ... />` to force a clean remount.

**Warning signs:** Player shows previous recording briefly, or audio overlaps.

### Pitfall 5: Cross-org recording id leakage

**What goes wrong:** User crafts a URL `/app/recordings/<some-id-from-another-org>` — currently `getRecording` does `findUnique({ where: { id } })` with no `orgId` check (verified at `recordings.service.ts:464`). Even if the controller is wrapped in `AuthGuard`, the service can return another org's recording.

**Why it happens:** The TENANCY_CLIENT extension applies RLS, but `findUnique` may bypass the RLS where clause depending on Prisma extension behavior. The pattern in this codebase always uses `findFirst({ where: { id, orgId } })` for safety (see `recordings.service.ts:475`, `:493`).

**How to avoid:** When expanding `getRecording` for camera include (Pattern 5), **also switch to `findFirst({ where: { id, orgId } })`**. Cross-org access becomes a 404 (not a 403 — we don't want to leak existence).

**Warning signs:** Test with two orgs and confirm a 404 (not the recording payload) on cross-org access.

### Pitfall 6: Calendar month change doesn't refetch days

**What goes wrong:** User opens calendar in April, sees April dots, clicks `>` to go to May — no dots appear because `useRecordingCalendar(cameraId, year, month)` was called with April's values.

**Why it happens:** The hook depends on `[cameraId, year, month]`. We need to capture the calendar's currently-displayed month and re-pass it.

**How to avoid:** shadcn `Calendar` (backed by `react-day-picker`) emits `onMonthChange(date)` on month nav. Wire it: track displayed month in state, pass to `useRecordingCalendar`. `recordings-tab.tsx:96-100` doesn't do this (only uses the `selectedDate`'s month) — which is a *latent bug in the existing tab*. **For the new playback page, do better:** track `displayedMonth` separately so the calendar dots refresh as the user navigates months without selecting a date.

**Warning signs:** Calendar shows dots for one month only; navigating months shows blank dots.

### Pitfall 7: HLS init segment 401/403 on cookie-less requests

**What goes wrong:** HLS manifest references `/api/recordings/:id/init-segment` and `/api/recordings/segments/:id/proxy`. These are protected by `AuthGuard`. If `xhr.withCredentials = true` is not set, hls.js sends them without cookies and gets 401.

**Why it happens:** Default fetch/XHR doesn't include cross-origin cookies. Even same-origin sometimes drops cookies for media requests.

**How to avoid:** Already handled — `HlsPlayer` sets `xhrSetup: (xhr) => { xhr.withCredentials = true }` at line 37. Verify this stays in place after any move (D-13).

**Warning signs:** Player shows "Recording playback error" immediately; network tab shows 401 on segments.

## Code Examples

### Example 1: Page-level composition (the new `[id]/page.tsx`)

```typescript
// Source: synthesized from
//   apps/web/src/app/admin/policies/[id]/page.tsx (useParams + apiFetch + error states)
//   apps/web/src/app/admin/cameras/components/recordings-tab.tsx (composition + handleSeek)
//   apps/web/src/app/app/recordings/page.tsx (feature gate)
'use client';

import { useEffect, useMemo, useCallback, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentRole } from '@/hooks/use-current-role';
import { useFeatures } from '@/hooks/use-features';
import {
  useRecording,             // NEW
  useRecordingTimeline,
  useRecordingsList,
  useRecordingCalendar,
} from '@/hooks/use-recordings';
import { FeatureGateEmptyState } from '@/components/feature-gate-empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { HlsPlayer } from '@/app/admin/cameras/components/hls-player'; // or moved path per D-13
import { TimelineBar } from '@/app/admin/cameras/components/timeline-bar'; // or moved path
import { PlaybackPageHeader } from './components/playback-page-header';
import { RecordingsList } from './components/recordings-list';

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PlaybackPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { activeOrgId, loading: roleLoading } = useCurrentRole();
  const { isEnabled, loading: featuresLoading } = useFeatures(activeOrgId);
  const { recording, loading: recordingLoading, error: recordingError } = useRecording(id);

  // selectedDate: user-driven, initialized from the recording on first load only
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [didInitDate, setDidInitDate] = useState(false);
  useEffect(() => {
    if (!recording || didInitDate) return;
    setSelectedDate(new Date(recording.startedAt));
    setDidInitDate(true);
  }, [recording, didInitDate]);

  // Track displayed calendar month separately (Pitfall 6)
  const [displayedMonth, setDisplayedMonth] = useState<Date | null>(null);
  useEffect(() => {
    if (selectedDate && !displayedMonth) setDisplayedMonth(selectedDate);
  }, [selectedDate, displayedMonth]);

  const cameraId = recording?.cameraId;
  const dateStr = selectedDate ? formatDate(selectedDate) : undefined;

  const { hours, loading: timelineLoading } = useRecordingTimeline(cameraId, dateStr);
  const { recordings, loading: listLoading } = useRecordingsList(cameraId, dateStr);
  const { days } = useRecordingCalendar(
    cameraId,
    displayedMonth?.getFullYear() ?? 0,
    (displayedMonth?.getMonth() ?? 0) + 1,
  );

  // After date change, navigate to first recording on the new date (D-05)
  useEffect(() => {
    if (!recordings.length || !dateStr || !recording) return;
    const currentRecordingDate = formatDate(new Date(recording.startedAt));
    if (dateStr !== currentRecordingDate && !recordings.some((r) => r.id === id)) {
      router.push(`/app/recordings/${recordings[0].id}`);
    }
  }, [recordings, dateStr, recording, id, router]);

  // Timeline click → navigate to recording at that hour (D-09)
  const handleSeek = useCallback((hour: number) => {
    const target = recordings.find((r) => {
      const sH = new Date(r.startedAt).getUTCHours();
      const eH = r.stoppedAt ? new Date(r.stoppedAt).getUTCHours() + 1 : 24;
      return hour >= sH && hour < eH;
    });
    if (target && target.id !== id) router.push(`/app/recordings/${target.id}`);
  }, [recordings, id, router]);

  // Memoized HLS source — switches when id changes
  const hlsSrc = useMemo(() => `/api/recordings/${id}/manifest`, [id]);

  // --- Render ---
  if (roleLoading || featuresLoading) return <Skeleton className="h-8 w-32" />;
  if (!isEnabled('recordings')) return <FeatureGateEmptyState featureName="Recordings" featureSlug="recordings" />;
  if (recordingError === 'not-found') return <NotFoundState />;
  if (recordingError === 'forbidden') return <FeatureGateEmptyState featureName="Recordings" featureSlug="recordings" />;
  if (recordingError === 'network') return <NetworkErrorState onRetry={() => location.reload()} />;
  if (recordingLoading || !recording || !selectedDate) return <PlaybackSkeleton />;

  return (
    <div className="container mx-auto space-y-6 py-6">
      <PlaybackPageHeader
        cameraName={recording.camera?.name ?? 'Recording'}
        siteName={recording.camera?.site?.name}
        projectName={recording.camera?.site?.project?.name}
        selectedDate={selectedDate}
        displayedMonth={displayedMonth ?? selectedDate}
        daysWithRecordings={days}
        onDateChange={setSelectedDate}
        onMonthChange={setDisplayedMonth}
        onBack={() => router.back()}
      />
      <div className="mx-auto max-w-[1024px]">
        <HlsPlayer key={id} src={hlsSrc} autoPlay={false} mode="vod" />
      </div>
      {timelineLoading
        ? <Skeleton className="h-24 w-full rounded-lg" />
        : <TimelineBar hours={hours} selectedRange={null} onRangeSelect={() => {}} onSeek={handleSeek} />}
      <RecordingsList
        recordings={recordings}
        loading={listLoading}
        currentRecordingId={id}
        selectedDate={selectedDate}
      />
    </div>
  );
}
```

### Example 2: Wiring `onRowClick` from the table to navigation

```typescript
// Source: extending apps/web/src/app/app/recordings/components/recordings-data-table.tsx
// Inside RecordingsDataTable function, add:

const handleRowClick = React.useCallback((row: RecordingRow) => {
  router.push(`/app/recordings/${row.id}`);
}, [router]);

// In the <DataTable> JSX, add the new prop:
<DataTable
  columns={columns}
  data={data}
  facetedFilters={facetedFilters}
  enableRowSelection
  onRowClick={handleRowClick}    // NEW
  onRowSelectionChange={setSelectedRows}
  onColumnFiltersChange={handleColumnFiltersChange}
  pageCount={Math.ceil(total / pageSize) || 1}
  onPaginationChange={handlePaginationChange}
  loading={loading}
  emptyState={emptyState}
  toolbar={/* ... unchanged */}
/>
```

```typescript
// Source: modifying apps/web/src/app/app/recordings/components/recordings-columns.tsx
// Wrap interactive cells to stop click propagation:

// select column, line ~53:
cell: ({ row }) => (
  <div onClick={(e) => e.stopPropagation()}>
    <Checkbox ... />
  </div>
),

// actions column, line ~136:
{
  id: "actions",
  cell: ({ row }) => {
    const recording = row.original
    const rowActions: RowAction<RecordingRow>[] = [...]
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <DataTableRowActions row={row} actions={rowActions} />
      </div>
    )
  },
},
```

### Example 3: Component move (D-13)

```bash
# 1. Move files
git mv apps/web/src/app/admin/cameras/components/hls-player.tsx apps/web/src/components/recordings/hls-player.tsx
git mv apps/web/src/app/admin/cameras/components/timeline-bar.tsx apps/web/src/components/recordings/timeline-bar.tsx
```

```typescript
// 2. Update the ONE consumer of each in admin/cameras/components/recordings-tab.tsx:
// Change:
import { HlsPlayer } from './hls-player';
import { TimelineBar } from './timeline-bar';
// To:
import { HlsPlayer } from '@/components/recordings/hls-player';
import { TimelineBar } from '@/components/recordings/timeline-bar';
```

**Verified:** Grep for `from './hls-player'` and `from './timeline-bar'` in the codebase shows only `recordings-tab.tsx` as a consumer of the relative paths. The new playback page uses the alias path. **Net result:** one consumer changes, both components live in shared location, zero duplication.

### Example 4: API change for camera include + cross-org safety

```typescript
// apps/api/src/recordings/recordings.service.ts
// Replace getRecording (line 463-472) with:
async getRecording(id: string, orgId: string) {
  const recording = await this.prisma.recording.findFirst({
    where: { id, orgId },                                // tightened from findUnique
    include: {
      _count: { select: { segments: true } },
      camera: {                                          // NEW include
        select: {
          id: true,
          name: true,
          site: {
            select: {
              id: true,
              name: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!recording) throw new NotFoundException(`Recording ${id} not found`);
  return recording;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recording playback only inside admin/cameras `RecordingsTab` (sheet UI) | Dedicated `/app/recordings/[id]` page | This phase | First first-class playback surface in the app; sheet stays for camera-context management |
| `DataTable` rows non-clickable (only checkbox + dropdown actions) | `DataTable` accepts optional `onRowClick` | This phase | Enables row-as-link pattern across the app; future tables benefit |
| `getRecording(id, orgId)` returns minimal payload, ignores orgId in where | Returns camera+site+project; uses `findFirst({id, orgId})` | This phase | Tightens cross-org isolation; supplies header data without N+1 |

**Deprecated/outdated:** None. This phase only adds.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `findUnique` in current `getRecording` may bypass RLS depending on Prisma TENANCY_CLIENT extension behavior | Pitfall 5, Example 4 | If RLS *does* apply to `findUnique`, the `findFirst` switch is harmless but unnecessary. Worth verifying by reading `apps/api/src/tenancy/prisma-tenancy.extension.ts` during planning. **[ASSUMED]** based on observed pattern (every other query in the file uses `findFirst({id, orgId})`). |
| A2 | `react-day-picker@9` Calendar component supports `onMonthChange` callback as documented | Pitfall 6 | If the prop doesn't exist on the wrapped shadcn `Calendar`, we'd need to either add it or skip the displayed-month tracking and accept the latent bug. **[ASSUMED]** — verify against `apps/web/src/components/ui/calendar.tsx` exports during planning. |
| A3 | Pure-Vitest validation (jsdom + RTL + mocked router/apiFetch) is sufficient to verify row-click navigation, URL sync, and seek behavior | Validation Architecture | If team prefers true browser-level E2E, we'd need to introduce Playwright (new dep, new CI job, ~1 day). **[ASSUMED]** — repo currently has no Playwright/Cypress; existing validation pattern is jsdom + RTL. |
| A4 | The minimal `useRecording(id)` hook is preferable to inline fetch in the page | Pattern 4 | If the team prefers no new hooks, inline `apiFetch` in the page is also acceptable (~10 LOC inlined vs. ~25 LOC in a separate file). **[ASSUMED]** based on existing hook-per-resource convention in `use-recordings.ts`. |

## Open Questions (RESOLVED)

1. **Should the page handle a recording with `status: "recording"` (still in progress)?**
   - What we know: Manifest endpoint serves whatever segments exist. HLS VOD playback of an active recording will play current segments and stop at the live edge.
   - What's unclear: Should the player auto-refresh manifest? Show a "Live recording" badge? Or treat it as VOD and let the user re-navigate to refresh?
   - **RESOLVED:** Recommendation: Treat as VOD for this phase (per D-10 — no special handling for recording-in-progress). Future enhancement: a "recording in progress" badge if `recording.status === 'recording'` with manual refresh button.

2. **What happens when a user lands on `/app/recordings/[id]` for a recording they have no access to?**
   - What we know: API returns 403 (FeatureGuard) or 404 (RLS / not found).
   - What's unclear: UI-SPEC §Page-Level Error / Edge States covers 403 → `FeatureGateEmptyState` and 404 → "Recording not available" but is the 403 path correct? FeatureGuard rejects the entire request when `recordings` feature is off, but cross-org access (correct feature, wrong org) is a 404, not 403.
   - **RESOLVED:** Recommendation: Use the `useRecording` hook's three-state error (`'not-found' | 'forbidden' | 'network'`) to render distinct copy. Don't conflate 404 (recording deleted or wrong org) with 403 (feature gate disabled at org level).

3. **Should the bottom recordings list show only complete recordings, or all (including in-progress, errored)?**
   - What we know: `useRecordingsList` returns all statuses; `recordings-tab.tsx` shows all.
   - What's unclear: Whether to filter on the new page.
   - **RESOLVED:** Recommendation: Mirror `recordings-tab.tsx` — show all, with `RecordingStatusBadge` indicating state. Users can choose what to play.

4. **`recording-controls.tsx` and `retention-settings.tsx` are NOT mounted on the new page — confirmed?**
   - What we know: UI-SPEC scope is playback only; D-14 keeps RecordingsTab as the management surface.
   - What's unclear: Nothing — this is locked. Calling out for the planner: do NOT mount RecordingControls / RetentionSettings / ScheduleDialog on the playback page.
   - **RESOLVED:** Confirmed locked by D-14. RecordingControls / RetentionSettings / ScheduleDialog stay in the admin/cameras RecordingsTab and are NOT mounted on `/app/recordings/[id]`.

## Environment Availability

This phase is pure code. The runtime environment requirement is the existing dev stack:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Both apps | ✓ | ≥22 (per root `package.json:engines`) | — |
| Next.js | Web app | ✓ | 15.x [VERIFIED: `apps/web/package.json:26`] | — |
| hls.js | Browser HLS playback | ✓ | 1.6.15 [VERIFIED: `apps/web/package.json:22`] | Safari native HLS already handled by `HlsPlayer` |
| react-day-picker | Calendar component | ✓ | 9.14.0 [VERIFIED: `apps/web/package.json:31`] | — |
| date-fns | Date math | ✓ | 4.1.0 [VERIFIED: `apps/web/package.json:21`] | — |
| Vitest + jsdom + @testing-library/react | Web tests | ✓ | vitest 3, jsdom 25 [VERIFIED: `apps/web/package.json:53-58`] | — |
| Vitest (node) + Prisma | API tests | ✓ | [VERIFIED: `apps/api/vitest.config.ts`, `apps/api/tests/setup.ts`] | — |
| Playwright / Cypress | E2E browser tests | ✗ | — | Use Vitest + jsdom + RTL with mocked router and `apiFetch` (existing repo pattern, see `apps/web/src/__tests__/recordings-feature-gate.test.tsx`) |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Playwright is not installed; we use jsdom-based testing per existing convention. This is a deliberate project choice — see Validation Architecture for the testing strategy this enables.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (web) | Vitest 3 + @testing-library/react 16 + jsdom 25 [VERIFIED: `apps/web/package.json`] |
| Framework (api) | Vitest 3 + Prisma test client (real PG via `DATABASE_URL`) [VERIFIED: `apps/api/vitest.config.ts`, `apps/api/tests/setup.ts`] |
| Web config file | `apps/web/vitest.config.ts` (`include: ["src/**/*.test.{ts,tsx}"]`) |
| API config file | `apps/api/vitest.config.ts` (`include: ["tests/**/*.test.ts"]`) |
| Quick run command (web) | `cd apps/web && pnpm test src/__tests__/playback-page.test.tsx -t "REC-01"` |
| Quick run command (api) | `cd apps/api && pnpm vitest run tests/recordings/get-recording.test.ts` |
| Full suite command | `pnpm test` (root) — runs both via vitest workspaces / direct invocation |
| Phase gate | Full suite green before `/gsd-verify-work` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REC-01 | HLS player renders for `/app/recordings/[id]` and loads `/api/recordings/:id/manifest` | component (web) | `cd apps/web && pnpm test src/__tests__/playback-page.test.tsx -t "REC-01"` | Wave 0 |
| REC-01 | `GET /api/recordings/:id` returns recording with camera+site+project for a valid org | unit (api) | `cd apps/api && pnpm vitest run tests/recordings/get-recording.test.ts -t "returns camera include"` | Wave 0 |
| REC-01 | `GET /api/recordings/:id` returns 404 for cross-org recording id | unit (api) | `cd apps/api && pnpm vitest run tests/recordings/get-recording.test.ts -t "cross-org 404"` | Wave 0 |
| REC-02 | Timeline scrubber click triggers `router.push` to recording containing the clicked hour | component (web) | `cd apps/web && pnpm test src/__tests__/playback-page.test.tsx -t "REC-02 click-to-seek"` | Wave 0 |
| REC-02 | Timeline scrubber click on empty hour does NOT navigate | component (web) | `cd apps/web && pnpm test src/__tests__/playback-page.test.tsx -t "REC-02 empty hour no-op"` | Wave 0 |
| REC-03 | Timeline renders heatmap with `bg-chart-1` for hours where `hasData=true` | component (web) | `cd apps/web && pnpm test src/__tests__/timeline-bar.test.tsx -t "REC-03 heatmap"` | Wave 0 |
| REC-03 | `GET /api/recordings/camera/:id/timeline?date=` returns 24-hour array with correct `hasData` flags | unit (api, EXISTS) | `cd apps/api && pnpm vitest run tests/recordings/manifest.test.ts -t "getSegmentsForDate"` | ✅ exists in `manifest.test.ts` |
| supporting | DataTable `onRowClick` invokes handler when row clicked, NOT when checkbox or actions menu clicked | component (web) | `cd apps/web && pnpm test src/__tests__/data-table.test.tsx -t "FOUND-01f onRowClick"` | Wave 0 (extend existing file) |
| supporting | Date picker change navigates to first recording on new date | component (web) | `cd apps/web && pnpm test src/__tests__/playback-page.test.tsx -t "date-change navigation"` | Wave 0 |
| supporting | Recording 404 / 403 / network errors render correct empty states | component (web) | `cd apps/web && pnpm test src/__tests__/playback-page.test.tsx -t "error states"` | Wave 0 |
| supporting | Feature gate (`recordings: false`) renders `FeatureGateEmptyState` | component (web) | mirror existing `recordings-feature-gate.test.tsx` for `[id]` route | Wave 0 |

### Sampling Rate

- **Per task commit:** Run only the file(s) touched. Example: after editing `data-table.tsx`, run `cd apps/web && pnpm test src/__tests__/data-table.test.tsx`. Target < 5 s.
- **Per wave merge:** `cd apps/web && pnpm test` (full web suite, ~30-60s) + `cd apps/api && pnpm test tests/recordings/` (recordings-only API suite, faster than full DB suite).
- **Phase gate:** Root `pnpm test` (full both-app suite). Must be 100% green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `apps/web/src/__tests__/playback-page.test.tsx` — covers REC-01, REC-02, date-change, error states. Uses pattern from `recordings-feature-gate.test.tsx` (mock `useFeatures`, mock `useRouter` from `next/navigation`, mock `apiFetch` via `vi.mock('@/lib/api')`).
- [ ] `apps/web/src/__tests__/timeline-bar.test.tsx` — covers REC-03 heatmap render. Pure component test, no router needed.
- [ ] `apps/api/tests/recordings/get-recording.test.ts` — covers camera include + cross-org 404. Mock Prisma client following existing pattern in `cross-camera-list.test.ts:46-83`.
- [ ] Extend `apps/web/src/__tests__/data-table.test.tsx` with `FOUND-01f` test for `onRowClick` (does not need a new file — append to existing test suite).
- [ ] No new framework install needed; Vitest + RTL + jsdom already configured.

### Why pure-Vitest is enough (no Playwright in this phase)

- The interactive flows under test are: row click → router.push, timeline click → router.push, date pick → state change → effect → router.push, page mount → fetch → render. All four are pure React + DOM events, fully exercisable in jsdom with mocked `useRouter` (returns `{ push: vi.fn() }`) and mocked `apiFetch`.
- HLS playback itself is **not** testable in jsdom (jsdom has no MediaSource). We assert that `HlsPlayer` is mounted with the correct `src` prop, and trust the upstream `HlsPlayer` component's existing tests (or manual UAT) for actual video playback.
- Manual UAT (UI-SPEC §Checker Sign-Off and the human-UAT phase document, if generated) covers actual video rendering, scrubbing UX, and visual heatmap correctness.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing `AuthGuard` on `/api/recordings/*` (cookie session, better-auth). No new auth surface introduced. |
| V3 Session Management | yes | Better-auth session cookies. `apiFetch` sets `credentials: 'include'`; `HlsPlayer` sets `xhr.withCredentials = true`. No change. |
| V4 Access Control | **yes — primary risk** | Cross-org recording access via crafted URL. Mitigation: tighten `getRecording` to `findFirst({id, orgId})`. Tracked in Pitfall 5 + Example 4. |
| V5 Input Validation | yes | `:id` is a UUID string used as Prisma `where: { id }`. Prisma escapes; no custom SQL. No URL query params introduced (D-03). |
| V6 Cryptography | no | No new crypto. HLS segments are not encrypted in this phase (project-wide decision). |
| V7 Error Handling & Logging | yes | 404 vs 403 distinction matters — leaking "this id exists in another org" via 403 (instead of 404) is an enumeration vulnerability. Use 404 for cross-org. |
| V12 Files & Resources | yes | Manifest URLs proxy through API (not direct presigned MinIO URLs) — correct existing pattern at `manifest.service.ts:42-49`. No new file-handling code. |

### Known Threat Patterns for {Next.js + NestJS + Prisma + cookie session}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-org recording id enumeration via crafted `/app/recordings/[id]` URL | Information Disclosure | `findFirst({where: {id, orgId}})` in `getRecording` returns 404 (not 403, not the recording) |
| HLS segment URL leak (presigned MinIO URLs in manifest) | Information Disclosure | Existing pattern proxies through `/api/recordings/segments/:id/proxy` — keep as-is. Do not switch to direct presigned URLs in this phase |
| CSRF on row-click navigation | Tampering | Navigation is `router.push` (client-side), not a state-changing request. No CSRF surface. Delete still requires `DELETE /api/recordings/:id` with cookie auth (existing) |
| XSS via camera name in page header | Tampering | React auto-escapes JSX text. Camera name comes from DB, set by org admin. Do not use `dangerouslySetInnerHTML` |
| Open redirect via crafted recording id triggering `router.push` | Tampering | URL is constructed as `'/app/recordings/' + recording.id` — `id` is always a UUID from the API; not user-controllable as a path-traversal vector. Safe |
| Recording playback timing oracle (does this recording exist in another org?) | Information Disclosure | 404 vs 200 timing is observable. Acceptable for this app's threat model — auth is required for any access. Do not add artificial delays |

## Sources

### Primary (HIGH confidence) — codebase reads
- `apps/web/src/app/admin/cameras/components/recordings-tab.tsx` — reference composition (lines 70-376)
- `apps/web/src/app/admin/cameras/components/timeline-bar.tsx` — reusable scrubber (full file)
- `apps/web/src/app/admin/cameras/components/hls-player.tsx` — reusable VOD player (full file)
- `apps/web/src/app/app/recordings/page.tsx` — feature-gate pattern
- `apps/web/src/app/app/recordings/components/recordings-data-table.tsx` — entry point to modify (full file)
- `apps/web/src/app/app/recordings/components/recordings-columns.tsx` — column factory pattern (full file)
- `apps/web/src/components/ui/data-table/data-table.tsx` — base DataTable, NO `onRowClick` today (full file)
- `apps/web/src/components/ui/data-table/index.ts` — public exports
- `apps/web/src/hooks/use-recordings.ts` — all recording hooks (full file)
- `apps/web/src/hooks/use-features.ts` — feature gate hook
- `apps/web/src/lib/api.ts` — `apiFetch` helper
- `apps/web/src/components/feature-gate-empty-state.tsx` — 403 fallback
- `apps/web/src/components/ui/calendar.tsx` — shadcn Calendar (lines 1-60)
- `apps/web/src/app/admin/policies/[id]/page.tsx` — `useParams + apiFetch` pattern reference (full file)
- `apps/web/src/app/admin/developer/webhooks/[id]/page.tsx` — alt `useParams` pattern
- `apps/web/src/__tests__/data-table.test.tsx` — test patterns for DataTable
- `apps/web/src/__tests__/recordings-feature-gate.test.tsx` — test pattern for feature gate + mocked router
- `apps/web/vitest.config.ts`, `apps/web/package.json` — verified versions, Vitest config
- `apps/api/src/recordings/recordings.controller.ts` — endpoints (full file)
- `apps/api/src/recordings/recordings.service.ts` — `getRecording` + RLS pattern (lines 463-490)
- `apps/api/src/recordings/manifest.service.ts` — manifest generation (full file)
- `apps/api/tests/recordings/cross-camera-list.test.ts` — API test mock pattern (lines 1-80)
- `apps/api/tests/recordings/manifest.test.ts` — existing REC-02/03 server-side tests
- `apps/api/vitest.config.ts`, `apps/api/tests/setup.ts` — API test config
- `package.json` (root) — confirms no Playwright/Cypress installed
- `.planning/config.json` — `nyquist_validation: true`
- `CLAUDE.md` — stack constraints
- `.planning/phases/17-recording-playback-timeline/17-CONTEXT.md` — locked decisions
- `.planning/phases/17-recording-playback-timeline/17-UI-SPEC.md` — visual contract

### Secondary (MEDIUM confidence)
- None — all claims are codebase-verified.

### Tertiary (LOW confidence)
- A1, A2 in Assumptions Log — flagged for verification during planning.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries and versions verified in `package.json`
- Architecture: HIGH — patterns derived directly from existing `recordings-tab.tsx` and other dynamic pages
- Pitfalls: HIGH for #1-4 (state management, history, HLS lifecycle); HIGH for #5 (verified gap in `getRecording`); MEDIUM for #6 (Calendar `onMonthChange` API depends on react-day-picker version exposed by shadcn wrapper — A2)
- Validation: HIGH — Vitest patterns verified against existing `data-table.test.tsx` and `recordings-feature-gate.test.tsx`
- Security: HIGH — V4 risk verified by reading `getRecording` source

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days — stable Next.js 15 / hls.js 1.6.x stack; revisit if hls.js or react-day-picker majors land)
