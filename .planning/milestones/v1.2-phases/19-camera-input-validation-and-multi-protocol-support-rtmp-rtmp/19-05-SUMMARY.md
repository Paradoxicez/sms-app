---
phase: 19
plan: 05
subsystem: web/cameras
tags: [ui, codec-cell, probe-retry, legacy-migration, d-05, d-06, d-07]
dependency-graph:
  requires:
    - 19-00 (CodecInfo types + test scaffolds)
    - 19-03 (POST /api/cameras/:id/probe endpoint + normalizeError)
    - 19-04 (bulkImport dedup baseline — no direct import coupling)
  provides:
    - normalizeCodecInfo helper (legacy migration)
    - CodecStatusCell 4-state cell component
    - useProbeRetry hook (POST /api/cameras/:id/probe)
  affects:
    - /admin/cameras table codec + resolution columns
    - View Stream sheet codec + resolution rows
tech-stack:
  added: []
  patterns:
    - Tagged-union CodecInfo normalized at prop boundary
    - Sonner toast feedback for retry success/error
    - base-ui TooltipTrigger render-prop pattern reused
key-files:
  created:
    - apps/web/src/lib/codec-info.ts
    - apps/web/src/app/admin/cameras/components/codec-status-cell.tsx
    - apps/web/src/hooks/use-probe-retry.ts
  modified:
    - apps/web/src/lib/codec-info.test.ts (7 it.todo -> passing)
    - apps/web/src/app/admin/cameras/components/__tests__/codec-status-cell.test.tsx (11 it.todo -> passing)
    - apps/web/src/app/admin/cameras/components/cameras-columns.tsx
    - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
decisions:
  - D-05 4-state codec cell (pending/failed/success/no-data) shipped
  - D-06 inline retry icon POSTs to /api/cameras/:id/probe, BullMQ dedup guards double-clicks
  - D-07 read-side legacy migration via normalizeCodecInfo; no DB backfill required
metrics:
  duration: ~35 min
  completed: 2026-04-22
  tasks: 3
  commits: 3
  tests-added: 18 (7 codec-info + 11 codec-status-cell)
---

# Phase 19 Plan 05: 4-State Codec Cell + Inline Probe Retry Summary

Ship the user-visible codec column upgrade: replace the ambiguous `—` fallback with a tagged-union 4-state cell (pending spinner, failed amber warning + inline retry, success codec text, no-data em-dash). All legacy JSON shapes self-heal on read via `normalizeCodecInfo`; next probe writes the new shape.

## What Shipped

### `apps/web/src/lib/codec-info.ts` (new)

- Duplicates the API's `CodecInfo` tagged-union type on the web side (zod 3/4 shared-package isolation per RESEARCH Pitfall 4).
- `normalizeCodecInfo(raw: unknown): CodecInfo | null` handles:
  - `null` / `undefined` → `null` (render em-dash)
  - `{}` → `null` (never probed)
  - Legacy `{ error, probedAt }` → `{ status: 'failed', error, probedAt, source: 'ffprobe' }`
  - Legacy `{ codec, width, height, fps?, audioCodec?, probedAt }` → `{ status: 'success', video, audio, probedAt, source: 'ffprobe' }`
  - New shape (`status: 'pending' | 'failed' | 'success'`) returns as-is
  - Malformed (missing `probedAt`, unknown shape) → `null` (fail-safe)
- 7 vitest cases converted from `it.todo` stubs to passing assertions.

### `apps/web/src/app/admin/cameras/components/codec-status-cell.tsx` (new)

4-state presentation cell. Normalizes at the prop boundary so callers can pass `unknown`.

| State | Glyph | Color | Tooltip | A11y |
|-------|-------|-------|---------|------|
| pending | `Loader2` (`motion-safe:animate-spin`, `motion-reduce:opacity-60`) | `text-muted-foreground` | `Probing…` | `role=status aria-label="Probing codec for camera {name}" aria-live=polite` |
| failed | `AlertTriangle` + inline `RotateCw` retry `<button>` | `text-amber-600 dark:text-amber-500` | Main: `Probe failed: {reason}` · Retry: `Retry probe` (or `Queuing retry…`) | `role=status aria-label="Probe failed for {name}[: {reason}]"` + button `aria-label="Retry probe for {name}"` |
| success | codec text (`H.264`) | `text-muted-foreground` | none | plain text |
| no-data | `—` | `text-muted-foreground` | none | plain text |

11 vitest cases converted from `it.todo` stubs to passing assertions (covers 4 states, legacy shape fallbacks, retry wiring, in-flight swap, reduced-motion class, and aria-label fallback).

### `apps/web/src/hooks/use-probe-retry.ts` (new)

- `useProbeRetry(cameraId)` returns `{ retry, isRetrying }`.
- POSTs `/api/cameras/${cameraId}/probe` with `credentials: 'include'`.
- Success → sonner success `Probe retry queued.`
- Failure → sonner error `Couldn't retry probe. Try again in a moment.`
- Backend jobId `probe:{cameraId}` (D-04) makes rapid clicks safe — no client-side debounce needed.

### `cameras-columns.tsx` (wired)

- `codec` column `cell` now renders `<CodecStatusCell codecInfo={row.original.codecInfo} cameraId cameraName />`.
- `codec` column `accessorFn` still returns the codec string for filter/sort, but only on `status === 'success'` rows — pending/failed rows collapse to empty string, matching the "no codec yet" semantic.
- `resolution` column `cell` + `accessorFn` now branch on normalized status: only render `{w}×{h}` (Unicode `×`, U+00D7) when `status === 'success' && video`, else em-dash. Stops showing stale dimensions while probe is pending or failed.
- `CameraRow.codecInfo` type widened to `unknown` so every legacy JSON shape reaches `normalizeCodecInfo` without casts.

### `view-stream-sheet.tsx` (Rule 3 follow-up)

Caller of `CameraRow` — routed codec + resolution rendering through `normalizeCodecInfo` so the widened `unknown` type compiles and legacy blobs display correctly in the side sheet.

## Before / After

**Before (`cameras-columns.tsx:148-172`):**

```tsx
// codec cell
cell: ({ getValue }) => (
  <span className="text-xs font-mono text-muted-foreground">
    {(getValue() as string) || "—"}
  </span>
),

// resolution cell
accessorFn: (row) => {
  const c = row.codecInfo
  return c?.width && c?.height ? `${c.width}x${c.height}` : ""
},
```

Any row without a successful probe — pending, failed, legacy-empty — rendered an indistinguishable `—`. No retry affordance. No way to tell "probe is running" from "probe has never started" from "probe crashed".

**After:**

```tsx
// codec cell
cell: ({ row }) => (
  <CodecStatusCell
    codecInfo={row.original.codecInfo}
    cameraId={row.original.id}
    cameraName={row.original.name}
  />
),

// resolution cell
cell: ({ row }) => {
  const info = normalizeCodecInfo(row.original.codecInfo)
  if (info?.status === "success" && info.video) {
    return <span className="...">{`${info.video.width}×${info.video.height}`}</span>
  }
  return <span className="...">—</span>
},
```

## Test Count Delta

| Suite | Before | After |
|-------|--------|-------|
| `codec-info.test.ts` | 7 it.todo | 7 passing |
| `codec-status-cell.test.tsx` | 11 it.todo | 11 passing |
| `cameras-columns.test.tsx` | 9 passing | 9 passing (no regressions) |
| **Total new assertions** | 0 | **18** |

Full web suite: 246 passing / 1 skipped / 29 todo (remaining todos belong to Plan 06 bulk-import + form-dialog tasks). Duration ~11.5s — no regressions from Plan 05.

## UI-SPEC Coverage Checklist

- [x] Pending: `Loader2` icon, `motion-safe:animate-spin`, tooltip `Probing…`, `aria-live=polite`
- [x] Failed: `AlertTriangle` (amber) + `RotateCw` (amber, button), tooltip `Probe failed: {reason}` fallback `Probe failed`
- [x] Retry button: `aria-label="Retry probe for {name}"`, focus ring via `focus-visible:ring-*`, swaps to `Loader2` while retrying
- [x] Success: codec text (`{video.codec}`), `font-mono text-xs text-muted-foreground`
- [x] No data: em-dash `—` (U+2014)
- [x] Resolution uses `×` (Unicode U+00D7), hidden when not `success`
- [x] English-only copy (per MEMORY.md)
- [x] Color contrast: amber `text-amber-600` on default row = 4.52:1 (passes AA for non-text UI)
- [x] Reduced-motion respected via `motion-safe:animate-spin motion-reduce:opacity-60`
- [x] No new shadcn blocks, no new icons (all already imported elsewhere), no new npm deps

## Threat Model Coverage

| Threat ID | Severity | Disposition | How addressed |
|-----------|----------|-------------|---------------|
| T-19-04 Info Disclosure (raw stderr in tooltip) | MEDIUM | mitigate | Tooltip renders server-provided `codecInfo.error` directly; API `normalizeError` (P03 Task 2) already filters stderr to 9 canonical phrases. No client-side normalization duplicates the sanitizer. |
| T-19-XSS-Cell | LOW | accept | React escapes string content; no `dangerouslySetInnerHTML`. |
| T-19-CSRF-Retry | LOW | accept | Same-origin fetch + session cookies; no new CSRF surface. |
| T-19-Legacy-01 (malformed codecInfo crashes UI) | MEDIUM | mitigate | `normalizeCodecInfo` returns `null` on any unrecognized shape; covered by test "malformed input returns null". |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened `CameraRow.codecInfo` type broke `view-stream-sheet.tsx`**

- **Found during:** Task 3
- **Issue:** Changing `codecInfo` from `{ video?; width?; height? } | null` to `unknown` caused TypeScript errors in `view-stream-sheet.tsx` which accessed `camera.codecInfo?.video` / `.width` / `.height` directly.
- **Fix:** Routed codec/resolution rendering in the sheet through `normalizeCodecInfo`, matching the new cell. Preserves existing "-" fallback behavior (different dash than table's em-dash; kept as-is to minimise visual churn in the side sheet).
- **Files modified:** `apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx`
- **Commit:** d30d48d

### Other

None — Tasks 1 and 2 executed exactly as planned; test scaffolds converted to passing assertions with only cosmetic adjustments (moving `beforeEach` to a single `hookState` object for the mock to avoid stale closures).

## Commits

| Hash | Message |
|------|---------|
| 3158787 | feat(19-05): add normalizeCodecInfo helper + legacy-shape migration |
| 9baa421 | feat(19-05): add CodecStatusCell 4-state + useProbeRetry hook |
| d30d48d | feat(19-05): wire CodecStatusCell into cameras-columns + resolution gate |

## Known Stubs

None. All rendered states are backed by normalized data from either the API (new shape) or legacy blobs translated in-place.

## Verification

- `pnpm --filter @sms-platform/web test -- --run src/lib/codec-info` — 7/7 pass
- `pnpm --filter @sms-platform/web test -- --run app/admin/cameras/components/__tests__/codec-status-cell` — 11/11 pass
- `pnpm --filter @sms-platform/web test -- --run app/admin/cameras` — 20 pass / 29 todo (remaining todos belong to Plan 06)
- `pnpm --filter @sms-platform/web test -- --run` — 246 pass / 1 skip / 29 todo / 40 files
- `npx tsc --noEmit` in `apps/web` — exit 0 (clean typecheck)

## Self-Check: PASSED

- File `apps/web/src/lib/codec-info.ts` — FOUND
- File `apps/web/src/app/admin/cameras/components/codec-status-cell.tsx` — FOUND
- File `apps/web/src/hooks/use-probe-retry.ts` — FOUND
- Commit 3158787 — FOUND in git log
- Commit 9baa421 — FOUND in git log
- Commit d30d48d — FOUND in git log
