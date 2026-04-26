---
phase: 22-camera-metadata-utilization-surface-tags-description-across-
plan: 12
subsystem: developer-docs
tags: [docs, api-workflow, webhooks, tags, static-templates, d-23, d-27]

# Dependency graph
requires:
  - phase: 22-02
    provides: GET /cameras?tags[]= query parameter (case-insensitive OR filter, display-casing preserved in response)
  - phase: 22-03
    provides: tags: string[] field on camera.online / camera.offline webhook payloads (D-22 explicit exclusion of description and cameraName)
provides:
  - apps/web/src/app/admin/developer/docs/api-workflow/page.tsx — "Filter cameras by tags" section documenting ?tags[]= with static placeholders
  - apps/web/src/app/admin/developer/docs/webhooks/page.tsx — payload example extended with tags array; cameraName removed per D-22
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Edit-the-source-not-the-re-export: apps/web/src/app/app/developer/docs/<topic>/page.tsx are 1-line re-exports of apps/web/src/app/admin/developer/docs/<topic>/page.tsx; modifying admin updates both routes simultaneously"
    - "Static placeholders only (CAMERA_ID, YOUR_API_KEY) per feedback_api_docs_static_templates memory — no useUser/useSession/currentApiKey injection of real account data"
    - "JSX prose + CodeBlock pattern matching existing docs sections (Authentication, Step 1..4, Error Handling) — consistent tone, English-only copy per feedback_language_english_default"

key-files:
  created: []
  modified:
    - apps/web/src/app/admin/developer/docs/api-workflow/page.tsx
    - apps/web/src/app/admin/developer/docs/webhooks/page.tsx

key-decisions:
  - "Edit admin source files, not tenant re-exports — apps/web/src/app/app/developer/docs/<topic>/page.tsx are 1-line `export { default } from \"@/app/admin/...\"` re-exports. The plan's <files_modified> listed the tenant paths but the actual content lives in admin. Editing admin updates both routes via TS module resolution; the alternative (turning tenant paths into independent copies) would create a 2-place-edit hazard for future docs maintenance."
  - "Removed cameraName from webhook payload example — D-22 acceptance criterion required `grep -nE 'description.*camera\\.|cameraName'` to return 0 matches, but the existing webhook docs example included `\"cameraName\": \"Front Entrance\"`. Plan 22-03 SUMMARY confirms the actual webhook payload does NOT include cameraName (the negative-invariant 'name' in payload === false test pins this). The pre-existing docs were stale/wrong; treating as Rule 1 bug fix to align docs with shipped behavior."
  - "Replaced cam_abc123 with CAMERA_ID in webhook example for consistency with feedback_api_docs_static_templates — the api-workflow page uses cam_abc123 in older sections (out of this plan's scope) but new content + the webhook payload example now use the canonical CAMERA_ID placeholder so future audits can grep for a single naming convention."
  - "Did NOT extend `?siteId=` filter docs — the api-workflow page does not currently document `?siteId=` either; adding tags[] documentation as a new top-level section keeps the change surgical and avoids retrofitting filter docs that pre-date this plan."
  - "Kept `${baseUrl}` template string usage — useBaseUrl() returns the page-host base URL (the embed URL the developer is reading docs at), not user account data. This matches the existing pattern across all 5 doc pages and is not real-user injection."

requirements-completed: [D-23, D-27]

# Metrics
duration: ~6min
completed: 2026-04-26
---

# Phase 22 Plan 12: Developer-Docs Tags Surface Summary

**Documents the `?tags[]=` filter on `GET /api/cameras` (Plan 22-02) and the `tags: string[]` field on `camera.online` / `camera.offline` webhook payloads (Plan 22-03) in the in-app developer-docs pages — single TASK-1 commit modifying the admin source files (which the tenant `/app/developer/docs/...` routes re-export). Static placeholders only (CAMERA_ID, YOUR_API_KEY); D-22 exclusions enforced by removing the stale `cameraName` field from the existing webhook payload example; web build clean.**

## Performance

- **Duration:** ~6 min (read-and-locate → 2 edits → build verify → commit)
- **Started:** 2026-04-26T13:55Z
- **Completed:** 2026-04-26T14:01Z
- **Tasks:** 1 (auto, no TDD — pure docs surface, no test surface to touch)
- **Files modified:** 2 (both admin source pages; tenant routes re-export and update for free)

## Accomplishments

- **api-workflow page** — Added a new "Filter cameras by tags" `<section>` between "Step 4: Embed the Stream" and "Error Handling". Contents: prose paragraph explaining `?tags[]=` semantics (multiple values combine OR, case-insensitive matching), bash CodeBlock with curl example using `?tags[]=lobby&tags[]=entrance` and `YOUR_API_KEY` placeholder, JSON CodeBlock showing example response with `CAMERA_ID` and a real-cased `"Lobby"` tag echoed back, and a follow-up paragraph documenting display-casing preservation (D-04 contract — `?tags[]=lobby` matches a `"Lobby"`-tagged camera and the response returns `"Lobby"` verbatim) plus empty-value behavior (`?tags[]=` is ignored, mirroring Plan 22-02's `.filter(t => t.length > 0)` service-side guard).
- **webhooks page** — Extended the existing "Payload Format" CodeBlock JSON example to include `"tags": ["Outdoor", "Perimeter"]` between `timestamp` and `metadata`, removed the stale `"cameraName": "Front Entrance"` field (D-22 explicit exclusion), and replaced `"cameraId": "cam_abc123"` with `"cameraId": "CAMERA_ID"`. Added a follow-up paragraph documenting: (a) tags reflect the camera's tags at dispatch time with display-casing preserved, (b) client-side filtering use case (alert only when a `"perimeter"`-tagged camera goes offline), (c) empty-tags behavior (`"tags": []` always present — never omitted), and (d) which events carry the field (`camera.online` and `camera.offline`).
- Web build (`pnpm --filter @sms-platform/web build`) exits 0 with all developer-docs routes prerendered as static (`/app/developer/docs/api-workflow`, `/app/developer/docs/webhooks`, etc.) — confirms the JSX changes type-check cleanly under Next.js 15 + React 19.

## Task Commits

1. **Task 1 — docs surface for tags[] filter + tags webhook field** — `d93616a` (docs): 2 files / 43 insertions / 2 deletions; api-workflow gains a new section; webhooks payload example gets tags + loses cameraName per D-22; both via the admin-source single-edit pattern.

**Plan metadata:** orchestrator owns final commit (SUMMARY only — STATE.md / ROADMAP.md updates deferred to orchestrator per parent prompt).

## Files Created/Modified

### Source (Task 1 — d93616a)
- `apps/web/src/app/admin/developer/docs/api-workflow/page.tsx` — New `<section>` "Filter cameras by tags" inserted before "Error Handling". Uses existing `<CodeBlock language="bash">` and `<CodeBlock language="json">` components and the same `useBaseUrl()` template-string pattern as surrounding sections. Static placeholders: `CAMERA_ID`, `YOUR_API_KEY`. Prose covers OR semantics, case-insensitive matching, display-casing preservation, and empty-value handling.
- `apps/web/src/app/admin/developer/docs/webhooks/page.tsx` — In-place edit of the "Payload Format" CodeBlock and follow-up prose. JSON example now: `cameraId: CAMERA_ID`, no `cameraName`, includes `tags: ["Outdoor", "Perimeter"]`. New paragraph documents client-side filtering pattern, empty-tags shape (`tags: []` always present), and event coverage scope (online + offline only).

### Tenant re-exports (unchanged, route via TS module resolution)
- `apps/web/src/app/app/developer/docs/api-workflow/page.tsx` — 1-line `export { default } from "@/app/admin/developer/docs/api-workflow/page";` — picks up the new section automatically.
- `apps/web/src/app/app/developer/docs/webhooks/page.tsx` — 1-line `export { default } from "@/app/admin/developer/docs/webhooks/page";` — picks up the updated payload + prose automatically.

## Decisions Made

- **Edit admin, not tenant re-exports.** The tenant docs paths (`apps/web/src/app/app/developer/docs/<topic>/page.tsx`) listed in the plan's `files_modified` block are 1-line re-exports of the admin source. Editing admin updates both routes simultaneously and avoids creating a 2-place-edit hazard. Confirmed via `cat` of all 5 tenant doc files (each is a single `export { default } from "@/app/admin/..."` line). Documented in deviations §1.
- **Removed `cameraName` from webhook payload example.** D-22 acceptance grep `grep -nE 'description.*camera\.|cameraName'` must return 0 matches in the webhooks docs page. The pre-existing example contained `"cameraName": "Front Entrance"`, contradicting the actual `notify-dispatch.processor.ts` payload (Plan 22-03 explicitly excludes both `description` and `cameraName` and pins the exclusion with negative-invariant tests `'cameraName' in payload === false` and `'name' in payload === false`). Aligning docs with shipped behavior is a Rule 1 bug fix, not scope creep.
- **`CAMERA_ID` over `cam_abc123` in new content.** The webhook payload example originally used `cam_abc123`; new content uses `CAMERA_ID` per `feedback_api_docs_static_templates`. Older sections of api-workflow still use `cam_abc123` in iframe/hls.js examples — those pre-date this plan and are out of scope for a docs-only Phase 22 closure (rewriting the entire api-workflow page would risk introducing copy-edit regressions and is not what D-23/D-27 ask for).
- **Did not document `?siteId=` filter.** The api-workflow page does not currently document `?siteId=` filtering at all. Adding `?tags[]=` as a new top-level section is surgical; introducing a "Filtering" umbrella section that retroactively documents siteId would be scope expansion outside this plan.
- **Kept `${baseUrl}` template-string usage.** `useBaseUrl()` returns the page's host URL (where the developer is reading these docs), not user account data. This is consistent with all 5 existing doc pages and not a violation of `feedback_api_docs_static_templates` (which forbids injecting real API keys / real camera IDs / org-specific data).
- **No new prose about the `description` field anywhere in webhooks docs.** The plan's must_haves explicitly state "Docs do NOT mention description field for webhooks (D-22 explicit)". Verified by `grep -nE 'description'` against the webhooks page returning only the existing `disconnectReason` mention (not a `description` field reference).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Stale `cameraName` field in pre-existing webhook payload example**
- **Found during:** Task 1 (initial Read of `apps/web/src/app/admin/developer/docs/webhooks/page.tsx`)
- **Issue:** The docs page's JSON payload example at line 78 included `"cameraName": "Front Entrance"`, but the actual production webhook payload (Plan 22-03 GREEN commit `e9aa4f6`) does NOT include this field. The plan's D-22 acceptance criterion `grep -nE "description.*camera\\.|cameraName" returns 0 matches` would have failed against the unmodified file. Aligning docs with shipped behavior is a Rule 1 bug fix.
- **Fix:** Removed the `cameraName` line from the JSON example as part of the same edit that added `tags`.
- **Files modified:** `apps/web/src/app/admin/developer/docs/webhooks/page.tsx` (folded into Task 1 commit).
- **Committed in:** `d93616a` (Task 1).

**2. [Rule 3 — Blocking] Plan's `<files_modified>` references re-export paths**
- **Found during:** Task 1 (initial Read of `apps/web/src/app/app/developer/docs/api-workflow/page.tsx`)
- **Issue:** The plan listed `apps/web/src/app/app/developer/docs/api-workflow/page.tsx` and `apps/web/src/app/app/developer/docs/webhooks/page.tsx` as files to modify, but both are 1-line `export { default } from "@/app/admin/..."` re-exports. Editing the re-export line would convert it into independent content (creating a 2-place-edit hazard for future docs maintenance) without any benefit. Editing the admin source updates both routes via TS module resolution.
- **Fix:** Edited the admin source files instead. Verified via `pnpm --filter @sms-platform/web build` that both `/app/developer/docs/api-workflow` and `/app/developer/docs/webhooks` routes prerender successfully with the new content.
- **Files modified:** Substituted admin source paths for the listed tenant paths.
- **Committed in:** `d93616a` (Task 1) — the admin file paths are recorded in the commit.
- **Acceptance grep impact:** Plan's literal greps (e.g. `grep -nE "tags\\[\\]" apps/web/src/app/app/developer/docs/api-workflow/page.tsx`) would return 0 matches against the re-export file, but they return the expected matches against the admin source where the content lives. The intent (documentation discoverable at the tenant URL) is fully met.

**3. [Rule 3 — Blocking] Worktree had no `node_modules` for web build**
- **Found during:** Task 1 verification (`pnpm --filter @sms-platform/web build` failed with `next: command not found`).
- **Issue:** The git worktree at `.claude/worktrees/agent-a64d9f6d95c189244/` is a fresh checkout with no installed `node_modules`. This matches the documented worktree-setup deviation pattern from Plan 22-02 SUMMARY §1 and Plan 22-03 SUMMARY §1.
- **Fix:** Symlinked `worktree/node_modules → /Users/suraboonsung/.../sms-app/node_modules` and `worktree/apps/web/node_modules → /Users/suraboonsung/.../sms-app/apps/web/node_modules`.
- **Files modified:** None tracked (symlinks are .gitignored entries).
- **Verification:** `pnpm --filter @sms-platform/web build` then ran successfully end-to-end with all 50+ routes prerendered.
- **Committed in:** No commit — operational env fix, not a code change.

---

**Total deviations:** 3 (1 stale-doc bug fix folded into Task 1, 2 environmental). Zero scope creep — all production content tracks the plan's must_haves exactly.

## Issues Encountered

- **Worktree environment setup** — see Deviations §3. Standard parallel-executor pattern.
- **Pre-existing `cameraName` in docs** — see Deviations §1. Plan-author-time stale documentation; aligned with shipped behavior in this commit.
- **Build warnings:** Next.js prints `Critical dependency: the request of a dependency is an expression` from `@opentelemetry/instrumentation` in 3 routes — unrelated to this plan, pre-existing build noise across the repo.

## Threat Flags

None. Plan 22-12 introduces no new auth surface, no new data surface, and no new schema. The threat_model's only entry (T-22-16: Information Disclosure on docs page rendering) is mitigated as designed:
- Static placeholders only (`CAMERA_ID`, `YOUR_API_KEY`) — verified by the negative grep `grep -nE "useUser|useSession|currentApiKey"` returning 0 matches.
- No template-string interpolation of any user-account-derived value — only `useBaseUrl()` (the page's host URL) is interpolated, matching the existing pattern in all 5 pre-existing doc pages.
- Removed `cameraName: "Front Entrance"` placeholder (D-22 alignment) eliminates one piece of pre-existing example data.

## Known Stubs

None. The plan resolves Phase 22's developer-docs surface entirely; no follow-up plan is required for D-23 or D-27.

## User Setup Required

None — pure JSX edit, no schema mutation, no Prisma client regeneration, no API restart. The change ships as part of the next web build / Next.js page-cache refresh; existing developer-portal viewers see the new sections on next page load.

## Next Phase Readiness

- **D-23 closed** — `?tags[]=` filter is documented at `/app/developer/docs/api-workflow` (and the equivalent `/admin/developer/docs/api-workflow` admin route via the shared admin source).
- **D-27 closed** — `tags` webhook payload field is documented at `/app/developer/docs/webhooks` (and the admin equivalent).
- **Phase 22 documentation surface complete** — all decision IDs assigned to docs-surface plans (D-22, D-23, D-27) are now reflected in shipped docs pages.

## Self-Check: PASSED

Verified file presence (modified):

```
EXISTS: apps/web/src/app/admin/developer/docs/api-workflow/page.tsx
EXISTS: apps/web/src/app/admin/developer/docs/webhooks/page.tsx
```

Verified commit reachability:

```
FOUND: d93616a (Task 1 — docs surface)
```

Verified acceptance-criteria greps (against admin source where content lives):

```
✓ tags\[\] in api-workflow page                        → 4 matches (line 126, 131, 147, 149)
✓ "tags": in webhooks page (payload example)         → 1 match (line 80)
✓ OR semantics | case-insensitive in api-workflow    → 2 matches (line 128, 129)
✓ CAMERA_ID | YOUR_API_KEY in api-workflow           → 2 matches (line 132, 138)
✗ description.*camera\. | cameraName in webhooks     → 0 matches (D-22 enforced)
✗ useUser | useSession | currentApiKey in api-workflow → 0 matches (no real-user injection)
```

Verified build:

```
pnpm --filter @sms-platform/web build → exit 0
/app/developer/docs/api-workflow      → prerendered static (172 B + 124 kB)
/app/developer/docs/webhooks          → prerendered static (174 B + 124 kB)
/admin/developer/docs/api-workflow    → prerendered static (8.07 kB + 116 kB equivalent)
/admin/developer/docs/webhooks        → prerendered static (4.96 kB + 113 kB equivalent)
```

---
*Phase: 22-camera-metadata-utilization-surface-tags-description-across-*
*Completed: 2026-04-26*
