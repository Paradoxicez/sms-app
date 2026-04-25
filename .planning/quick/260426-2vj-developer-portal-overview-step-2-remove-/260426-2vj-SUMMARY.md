---
phase: quick-260426-2vj
plan: 01
subsystem: web/developer-portal
tags: [refactor, ui, dead-code-removal, developer-portal]
requires: []
provides:
  - "Static Step 2 curl template (CAMERA_ID + sk_live_YOUR_API_KEY)"
  - "Synchronous QuickStartGuide render (no fetch, no skeleton)"
affects:
  - apps/web/src/components/quick-start-guide.tsx
tech-stack:
  added: []
  patterns:
    - "Static documentation templates over auto-populated examples"
key-files:
  created: []
  modified:
    - apps/web/src/components/quick-start-guide.tsx
decisions:
  - "Step 2 mirrors Step 1's literal-placeholder style (YOUR_PROJECT_ID/YOUR_SESSION → CAMERA_ID/sk_live_YOUR_API_KEY) so docs read as generic, copy-paste-friendly examples rather than personalized output."
metrics:
  duration: ~3 min
  completed: "2026-04-25"
  tasks: 1
  files-changed: 1
---

# Quick Task 260426-2vj: Developer Portal Overview Step 2 — Remove Dynamic Data Summary

Strip dynamic API key + camera ID interpolation from QuickStartGuide Step 2, making it a static template like Step 1, and remove the dead fetch/state/skeleton path that supported it.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Strip dynamic data from QuickStartGuide and make Step 2 static | 59561bc | apps/web/src/components/quick-start-guide.tsx |

## What Changed

**`apps/web/src/components/quick-start-guide.tsx`** — 1 file changed, 2 insertions(+), 82 deletions(-)

- `step2Curl` now uses literal tokens: `CAMERA_ID` in the URL and `sk_live_YOUR_API_KEY` in the `X-API-Key` header (no interpolation).
- Removed both hint `<p>` blocks under Step 2 (`activeKey ? ... : ...` and `firstCamera ? ... : ...`) that referenced the user's actual key/camera.
- Removed dead state and effects that no longer have any consumers:
  - `useState` for `apiKeys`, `cameras`, `loading`
  - `useEffect` calling `/api/api-keys` and `/api/cameras`
  - `ApiKeyInfo` and `CameraInfo` interfaces
  - `activeKey` / `apiKeyDisplay` / `apiKeyHint` derivations
  - `firstCamera` / `cameraIdDisplay` / `cameraHint` derivations
  - `if (loading) return <Skeleton />` branch
- Cleaned up unused imports: `useState`, `useEffect` (entire `react` import line removed), `Skeleton`, `apiFetch`.
- Step 1 and Step 3 markup is byte-identical to before.
- `"use client"` retained — `Tabs` requires client-side state and `typeof window` access.

## Verification

- `pnpm --filter @sms-platform/web exec tsc --noEmit` — exit 0, no diagnostics.
- `grep -nE "apiKeyHint|cameraHint|ApiKeyInfo|CameraInfo"` against the file — no matches.
- `grep -nE "CAMERA_ID/sessions"` — exactly one match (in `step2Curl`).
- `grep -nE "sk_live_YOUR_API_KEY"` — exactly one match (in `step2Curl`).
- `grep -nE "useState|useEffect|Skeleton|apiFetch"` — no matches.
- `/api/api-keys` and `/api/cameras` only remain as path literals inside Step 1's `step1Curl` and Step 2's `step2Curl` templates (URL strings that the docs themselves describe), not as fetch targets.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- File modified: apps/web/src/components/quick-start-guide.tsx — FOUND
- Commit 59561bc — FOUND on current branch
- TypeScript clean — VERIFIED (exit 0)
- All `<done>` grep assertions in PLAN.md — VERIFIED
