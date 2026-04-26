---
phase: quick-260426-sjz
plan: 01
subsystem: web/developer-docs
tags: [docs, push-mode, rtmp, encoder-setup, broken-links]
requires: []
provides:
  - "/app/developer/docs/encoder-setup route (admin master + app re-export)"
  - "Push & Encoder Setup Guide as 6th tenant developer docs entry"
affects:
  - "Camera form Push-mode info card (Setup guide → link)"
  - "Camera detail push URL section (Setup guide → link)"
  - "Just-created camera URL reveal dialog (Setup guide → link)"
  - "Waiting-for-first-publish empty state (See full guide → link)"
tech-stack:
  added: []
  patterns:
    - "Admin master + app re-export wrapper (matches 5 existing guide pages)"
    - "DocPage + CodeBlock components for prose + copyable snippets"
    - "Static placeholders (stream.example.com, {streamKey}) — no real tenant data"
key-files:
  created:
    - apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx
    - apps/web/src/app/app/developer/docs/encoder-setup/page.tsx
  modified:
    - apps/web/src/components/pages/tenant-developer-docs-page.tsx
    - apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx
    - apps/web/src/app/admin/cameras/components/push-url-section.tsx
    - apps/web/src/app/admin/cameras/components/created-url-reveal.tsx
    - apps/web/src/app/admin/cameras/components/waiting-for-first-publish.tsx
decisions:
  - "Used Upload icon from lucide-react for the new guide card (no collision with existing 5 icons: Workflow, ShieldCheck, SlidersHorizontal, Bell, Play)"
  - "Followed admin/app dual-page pattern instead of single-page — preserves existing 5-guide convention exactly"
  - "Used stream.example.com + {streamKey} placeholders verbatim per global memory (API docs use static placeholders, never real account data)"
  - "Hikvision and Dahua sections lead with caveats recommending Pull mode fallback when RTMP push menu is missing — many entry-level NVRs are RTSP-only"
metrics:
  duration_seconds: 549
  duration_human: "~9 minutes"
  completed: 2026-04-26T13:50:28Z
  tasks_completed: 3
  files_modified: 7
  commits: 3
requirements_closed:
  - QUICK-SJZ-01
  - QUICK-SJZ-02
  - QUICK-SJZ-03
---

# Quick Task 260426-sjz: Push & Encoder Setup Docs Guide + Broken-Link Fix Summary

Shipped a new tenant-facing "Push & Encoder Setup Guide" page covering OBS/FFmpeg/Wirecast/vMix/Hikvision/Dahua and replaced 4 broken `/docs/push-setup` hrefs (Phase 19.1 leftover) with the working `/app/developer/docs/encoder-setup` route — all behind the existing admin/app dual-page docs convention.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create encoder-setup docs page (admin master + app re-export) | `9b2b40b` | `apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx`, `apps/web/src/app/app/developer/docs/encoder-setup/page.tsx` |
| 2 | Register Push & Encoder Setup as 6th guide in tenant docs menu | `51d5546` | `apps/web/src/components/pages/tenant-developer-docs-page.tsx` |
| 3 | Fix 4 broken /docs/push-setup hrefs + run build verification | `0a4d597` | `camera-form-dialog.tsx`, `push-url-section.tsx`, `created-url-reveal.tsx`, `waiting-for-first-publish.tsx` |

## Files Modified

7 files total (2 created, 5 modified). Plan called out 6 — the 7th (`waiting-for-first-publish.tsx`) surfaced under deviation Rule 2 (see below).

**Created**

- `apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx` — 9-section guide (Overview, Before-you-start caveats, OBS, FFmpeg, Wirecast, vMix, Hikvision, Dahua, Troubleshooting)
- `apps/web/src/app/app/developer/docs/encoder-setup/page.tsx` — 1-line re-export wrapper

**Modified**

- `apps/web/src/components/pages/tenant-developer-docs-page.tsx` — added `Upload` icon import + 6th `guides[]` entry
- `apps/web/src/app/admin/cameras/components/camera-form-dialog.tsx` — `Setup guide →` href fix
- `apps/web/src/app/admin/cameras/components/push-url-section.tsx` — `Setup guide →` href fix
- `apps/web/src/app/admin/cameras/components/created-url-reveal.tsx` — `Setup guide →` href fix
- `apps/web/src/app/admin/cameras/components/waiting-for-first-publish.tsx` — `See full guide →` href fix [deviation]

## Admin/App Dual-Page Pattern

Confirmed preserved. The admin master page holds the full content; the `/app/...` mirror is a 1-line `export { default } from "@/app/admin/developer/docs/encoder-setup/page";` re-export — identical to the 5 existing guide pairs (api-workflow, policies, stream-profiles, webhooks, streaming-basics).

## Verification Method

Used **`next build`** (not `typecheck`) since `apps/web` only exposes `dev`, `build`, `start`, `test` scripts (no separate `typecheck`). Per plan's fallback instruction, `next build` runs typecheck inline.

Worktree had no `node_modules` installed, so I temporarily symlinked the parent repo's `node_modules` into `apps/web/node_modules`, ran `next build`, then removed the symlink before committing. Build output:

```
✓ Compiled successfully in 23.5s
   Linting and checking validity of types ...
 ✓ Generating static pages (52/52)

├ ○ /admin/developer/docs/encoder-setup       174 B         123 kB
├ ○ /app/developer/docs/encoder-setup         174 B         123 kB
```

Both new routes prerender as static pages. No type errors, no lint errors, no warnings introduced by the changes (the only warning is the pre-existing multiple-lockfile workspace-root inference, unrelated to this task).

Final repo grep confirmed `grep -rn "/docs/push-setup" apps/web/src` returns zero matches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical link fix] Fixed 4th `/docs/push-setup` href in waiting-for-first-publish.tsx**

- **Found during:** Task 3 final repo grep (the verify clause requires zero remaining `/docs/push-setup` occurrences anywhere under `apps/web/src`)
- **Issue:** Plan listed 3 files (`camera-form-dialog.tsx`, `push-url-section.tsx`, `created-url-reveal.tsx`) but `waiting-for-first-publish.tsx` line 66 also contained `href="/docs/push-setup"` on a `See full guide →` anchor, which would have remained broken
- **Fix:** Replaced with `/app/developer/docs/encoder-setup` (same pattern as the other 3)
- **Files modified:** `apps/web/src/app/admin/cameras/components/waiting-for-first-publish.tsx`
- **Commit:** `0a4d597` (folded into the Task 3 commit)
- **Justification:** Without this fix the verify clause `! grep -rn "/docs/push-setup" apps/web/src` would have failed, and the plan's stated success criterion ("zero remaining references to `/docs/push-setup`") would have been violated. Pure string-replacement, same pattern, no behavioral risk.

## Self-Check

**Files claimed to exist:**

- `apps/web/src/app/admin/developer/docs/encoder-setup/page.tsx` — FOUND (9.6 KB)
- `apps/web/src/app/app/developer/docs/encoder-setup/page.tsx` — FOUND (73 B re-export)

**Commits claimed to exist:**

- `9b2b40b` (feat: add Push & Encoder Setup docs guide) — FOUND in `git log`
- `51d5546` (feat: register 6th tenant docs guide) — FOUND in `git log`
- `0a4d597` (fix: point Setup guide links to encoder-setup docs) — FOUND in `git log`

## Self-Check: PASSED
