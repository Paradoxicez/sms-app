---
status: resolved
trigger: "View Stream sheet Activity tab never shows audit log entries — empty since testing began for every camera"
created: 2026-04-26T00:00:00Z
updated: 2026-04-26T13:55:00Z
---

## Current Focus

hypothesis: TWO independent bugs cause the empty Activity tab:
  (1) Backend `search` filter only matches `resource` and `ip` columns, never `resourceId` or `path` — so no camera-scoped query can ever return rows.
  (2) Frontend builds `${apiUrl}?${params}` where `apiUrl` already contains `?...`, producing `...?resource=camera&search=ID?page=1&pageSize=25` — corrupting the search value with `?page=1` suffix.
test: Confirmed via DB simulation — even using a clean camera id (no URL bug) against the OR-clause returns 0 rows for a camera that has 2 update + 1 delete audit rows.
expecting: Camera-scoped audit log will always be empty until backend gains a `cameraId`/`resourceId` filter (or `search` extends to `resourceId`/`path`) AND frontend stops mangling the URL.
next_action: Return diagnose-only report; user picks fix strategy.

## Symptoms

expected: Activity tab in View Stream sheet shows audit log rows (timestamp, actor, action, resource, IP) for actions like view/edit/start/stop recording
actual: Always empty "No audit log entries / Activity will be recorded here as users interact with the platform" / "Showing 0-0 of 0" — for every camera, since testing began
errors: None visible in UI; DevTools network/backend logs not yet checked
reproduction: Open admin/cameras → click camera (e.g. BKR07) → click Activity tab → empty
started: Always broken (since testing began per user)

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-26
  checked: apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx (Activity tab)
  found: Line 320-322 — `<AuditLogDataTable apiUrl={`/api/audit-log?resource=camera&search=${camera.id}`} />`. Frontend passes camera UUID via `search` param to scope to one camera.
  implication: Read path expects backend `search` to match camera UUID somewhere; verify backend honors this.

- timestamp: 2026-04-26
  checked: apps/web/src/components/audit/audit-log-data-table.tsx (lines 109-131)
  found: Builds `URLSearchParams` from scratch (page, pageSize, search, action, dateFrom, dateTo) then composes URL as `${apiUrl}?${params.toString()}`. When `apiUrl` already contains `?...` (this case: `?resource=camera&search=<uuid>`), the resulting URL has TWO `?` separators: `/api/audit-log?resource=camera&search=<uuid>?page=1&pageSize=25`.
  implication: Standard URL parsers split on first `?`. Query string becomes `resource=camera&search=<uuid>?page=1&pageSize=25`. The `search` value gets mangled to `<uuid>?page=1` (everything until next `&`). `pageSize=25` survives; `page=1` is consumed into search. Even if backend search worked, the value would be corrupted.

- timestamp: 2026-04-26
  checked: apps/api/src/audit/audit.service.ts (findAll, lines 62-94)
  found: `search` param OR-clause: `[ { resource: { contains: query.search, mode: 'insensitive' } }, { ip: { contains: query.search, mode: 'insensitive' } } ]`. There is NO filter on `resourceId` or `path`. The schema (apps/api/src/prisma/schema.prisma:431-448) confirms `resourceId String?` and `path String` exist as separate columns.
  implication: Even with a clean `search=<cameraUuid>`, the backend cannot return camera-scoped rows. `resource` is always a literal type ("camera", "project", etc.) and `ip` is always an IPv4/IPv6 — neither can ever contain a UUID.

- timestamp: 2026-04-26
  checked: apps/api/src/audit/audit.interceptor.ts
  found: Audit writes only happen for POST/PUT/PATCH/DELETE (line 13: `AUDITED_METHODS`). GET routes — including the camera read path that "View Stream" uses — never produce audit entries. `resourceId` IS set correctly from `responseData?.id || request.params?.id` (line 102).
  implication: Writes work, and `resourceId` is the right column to filter on. View-only interactions (opening stream, watching playlist) will never appear in audit log.

- timestamp: 2026-04-26
  checked: apps/api/src/audit/dto/audit-query.dto.ts
  found: `auditQuerySchema` accepts only: userId, action, resource, dateFrom, dateTo, search, page, pageSize. No `cameraId`, no `resourceId`, no `path`.
  implication: Backend has no contract for camera-scoped filtering today.

- timestamp: 2026-04-26
  checked: PostgreSQL `AuditLog` table — total counts and BKR07 specifically
  found: 588 rows total across 9 orgs, 22 distinct resource types. BKR07 org `15cd7c74-10bf-4ffb-8ea6-7ac7c9012a76` has 286 audit rows including 251 camera rows (create/update/delete/profile_hot_reload). BKR07 itself (`dd5cfd27-de9a-4ad1-a0ba-08b5c969a756`) has ZERO audit rows — it's a freshly-created push camera that hasn't been edited/deleted yet, so the interceptor (POST/PUT/PATCH/DELETE only) never fired for it.
  implication: Writes work end-to-end. The user picked the worst-case camera to test (no audit rows exist for it AT ALL). But even on cameras WITH audit rows, the read filter would still return empty (see next evidence).

- timestamp: 2026-04-26
  checked: Direct SQL — simulate broken-search query for a camera that DOES have rows
  found: `SELECT COUNT(*) FROM "AuditLog" WHERE "orgId" = '<bkr07-org>' AND resource = 'camera' AND (resource ILIKE '%b5d44762-e9a2-412f-99a3-abacf56e2fd3%' OR ip ILIKE '%b5d44762-e9a2-412f-99a3-abacf56e2fd3%')` → **0 rows** even though that camera has 2 update + 1 delete audit row.
  implication: Definitive proof — the backend's `search` OR-clause structurally cannot match any camera id. Bug #1 (backend) is independently fatal regardless of bug #2 (URL composition).

- timestamp: 2026-04-26
  checked: Feature gating (apps/api/src/features/feature-key.enum.ts, features.guard.ts, prisma/seed.ts)
  found: `AUDIT_LOG = 'auditLog'`. Endpoint `@RequireFeature(FeatureKey.AUDIT_LOG)`. Feature is enabled (`auditLog: true`) on the seeded "Developer" package assigned to system org. If user tested as super-admin / system org, gate passes. (For BKR07's org `15cd7c74-...` need to verify the org has a package with auditLog=true; if not, all queries 403 silently — but UI shows generic empty state, so worth confirming.)
  implication: Possible secondary contributor: if BKR07's org has no package or package without auditLog, the GET would 403, the frontend `catch` block would set `data=[]`, and the user sees "Showing 0-0 of 0" identical to the bug above. However, the catch doesn't surface the error — both 403 and empty-success look identical. User should check Network tab to confirm 200 vs 403.

- timestamp: 2026-04-26
  checked: apps/api/tests/audit/audit-interceptor.test.ts
  found: All cases are `it.todo` — no executing tests for audit log read or interceptor.
  implication: No regression coverage; both bugs could have shipped without notice.

## Resolution

root_cause: |
  TWO independent bugs prevent the camera-scoped Activity tab from ever showing rows:

  PRIMARY (backend, sufficient on its own):
  apps/api/src/audit/audit.service.ts findAll() implements `search` as
    `{ OR: [ { resource: { contains } }, { ip: { contains } } ] }`
  but `resource` always holds a type literal ("camera", "project", …) and `ip`
  always holds an IP address. The camera UUID lives in `resourceId` and `path`,
  neither of which is searched. There is no `cameraId`/`resourceId` query
  parameter either. So `?resource=camera&search=<cameraUuid>` can never match a row.
  Confirmed via direct SQL: simulating the OR-clause for a camera that actually
  HAS audit rows returns 0.

  SECONDARY (frontend, also fatal):
  apps/web/src/components/audit/audit-log-data-table.tsx line 130 composes the
  URL as `${apiUrl}?${params.toString()}`. When the caller passes
  `apiUrl="/api/audit-log?resource=camera&search=<uuid>"`, the result is
  `/api/audit-log?resource=camera&search=<uuid>?page=1&pageSize=25` — two `?`
  separators. Query parsers split on the first one; the `search` value gets
  appended with `?page=1`. So the user-supplied UUID is corrupted before it
  reaches the backend.

  Tertiary suspicion (worth verifying but not blocking): the test camera BKR07
  is a freshly-created push camera with zero modifications; the interceptor
  only logs POST/PUT/PATCH/DELETE, so it would have had zero audit rows
  regardless. The user picked the worst possible test subject. But even with a
  long-lived camera, both bugs above guarantee 0 results.

fix: |
  Bug #1 (backend):
    - Added `resourceId: z.string().optional()` to `auditQuerySchema`
      (apps/api/src/audit/dto/audit-query.dto.ts).
    - In `AuditService.findAll` (apps/api/src/audit/audit.service.ts), apply
      `where.resourceId = query.resourceId` BEFORE the `search` OR-clause so a
      camera-scoped query is AND-merged (not widened) by free-text search.
    - Extended the `search` OR-clause to also match `resourceId` and `path`
      (was: only `resource` + `ip`). Lets users paste a UUID into the global
      Audit Log search box.
    - The controller already passes `parsed.data` straight through, so no
      controller change was needed.

  Bug #2 (frontend):
    - apps/web/src/components/audit/audit-log-data-table.tsx — replaced
      `${apiUrl}?${params.toString()}` with `new URL(apiUrl, window.location.origin)`
      then `url.searchParams.set(...)` for every runtime param. Hands
      `${url.pathname}${url.search}` to apiFetch. Result: single `?`
      separator, preset params from caller preserved intact.

  Caller change:
    - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx — Activity
      tab now passes `?resource=camera&resourceId=${camera.id}` instead of
      `&search=${camera.id}`. Kept the `resource=camera` filter so we don't
      accidentally surface non-camera audit rows that happen to mention the id.

verification: |
  - apps/api/tests/audit/audit-interceptor.test.ts — promoted 7 todos to
    real tests covering: (a) resourceId narrowing across two cameras, (b) empty
    result for a camera with no history, (c) cross-tenant isolation, (d) AND
    semantics when combining resourceId + search, (e) legacy IP search still
    works, (f) new path-column search works, (g) new resourceId-substring
    search works.
  - apps/web/src/components/audit/__tests__/audit-log-data-table.test.tsx —
    new file. 3 tests asserting the merged URL contains exactly one `?` and
    preserves both preset and runtime params for: (a) apiUrl with preset
    query, (b) apiUrl without preset query, (c) default apiUrl.
  - All 20 audit-related backend tests pass (`pnpm --filter @sms-platform/api
    test -- audit`).
  - All 3 web URL-composition tests pass (`pnpm --filter @sms-platform/web
    test -- --run audit-log-data-table`).
  - `pnpm --filter @sms-platform/api build` clean (162 SWC files).
  - `pnpm --filter @sms-platform/web build` clean (Next.js production build).

  Manual verification (pending user confirmation in real workflow):
    1. Edit any existing camera (rename, change profile, etc.).
    2. Open View Stream sheet → Activity tab → expect ≥1 `update` row with
       actor info and timestamp.
    3. The fresh push camera BKR07 will still show empty until it's edited
       — that is expected behavior (interceptor only logs write methods).

files_changed:
  - apps/api/src/audit/dto/audit-query.dto.ts
  - apps/api/src/audit/audit.service.ts
  - apps/api/tests/audit/audit-interceptor.test.ts
  - apps/web/src/components/audit/audit-log-data-table.tsx
  - apps/web/src/app/admin/cameras/components/view-stream-sheet.tsx
  - apps/web/src/components/audit/__tests__/audit-log-data-table.test.tsx
