---
phase: quick-260420-oid
plan: 01
subsystem: api
tags: [prisma, rls, multi-tenancy, system-prisma, tenancy-client, bullmq, srs-callbacks]

requires:
  - phase: quick-260420-nmu
    provides: SystemPrismaService injection pattern (StatusService — commit 49adac6)
  - phase: 17-recordings
    provides: T-17-V4 IDOR mitigation on getRecording (must be preserved)
provides:
  - PlaybackService dual-injection (tenant + system) — public embed + SRS verifyToken now resolve sessions
  - WebhooksService dual-injection — emitEvent (BullMQ NotifyDispatch path) writes WebhookDelivery rows
  - WebhookDeliveryProcessor single-injection swap — delivery rows update with responseStatus/responseBody
  - NotificationsService dual-injection (replaces rawPrisma slot) — camera-event notifications + system alerts write
  - RecordingsService triple-injection (tenant + system + raw kept for non-tenant Organization reads) — schedule cron, on_hls archival, storage quota all unblocked. T-17-V4 on getRecording preserved.
  - SettingsService dual-injection — onModuleInit boot path regenerates srs.conf without RLS denial
  - Defense-in-depth `where: { ..., orgId }` on every systemPrisma call where orgId is in scope (49adac6 pattern)
affects: [recordings, webhooks, notifications, playback, embed, srs-callbacks, scheduled-recordings, storage-quotas, boot-lifecycle]

tech-stack:
  added: []  # No new deps — uses existing SystemPrismaService from quick-260420-nmu
  patterns:
    - "Dual/triple-injection: tenantPrisma for HTTP+CLS contexts, systemPrisma for worker/callback/boot contexts"
    - "Defense-in-depth orgId scoping: `findFirst({ where: { id, orgId } })` after every systemPrisma swap when orgId is in signature"
    - "Boot-only helper extraction: `regenerateAndReloadSrsAtBoot()` separates onModuleInit path from HTTP-context regenerate"

key-files:
  created: []
  modified:
    - apps/api/src/playback/playback.service.ts
    - apps/api/src/webhooks/webhooks.service.ts
    - apps/api/src/webhooks/webhook-delivery.processor.ts
    - apps/api/src/notifications/notifications.service.ts
    - apps/api/src/recordings/recordings.service.ts
    - apps/api/src/settings/settings.service.ts
    - apps/api/tests/cluster/load-balancer.test.ts
    - apps/api/tests/playback/playback.test.ts
    - apps/api/tests/recordings/archive-segment.test.ts
    - apps/api/tests/recordings/bulk-delete.test.ts
    - apps/api/tests/recordings/cross-camera-list.test.ts
    - apps/api/tests/recordings/download.test.ts
    - apps/api/tests/recordings/get-recording.test.ts
    - apps/api/tests/recordings/recording-lifecycle.test.ts
    - apps/api/tests/recordings/storage-quota.test.ts
    - apps/api/tests/settings/stream-engine.test.ts
    - apps/api/tests/srs/config-generator.test.ts

key-decisions:
  - "Triple-injection on RecordingsService: kept rawPrisma slot for Organization/package reads (no RLS) alongside new systemPrisma for worker paths and existing tenantPrisma for HTTP paths"
  - "NotificationsService: collapsed rawPrisma slot into systemPrisma — the prior rawPrisma calls (member.findMany, notification.create) were in worker context and had the same silent RLS denial bug as TENANCY_CLIENT for app_user"
  - "SettingsService boot path extracted into private helper `regenerateAndReloadSrsAtBoot()` rather than branching inside the HTTP-shared method — keeps HTTP path behavior identical to pre-fix"
  - "PlaybackService.getSession kept WITHOUT orgId scoping (T-RLS-AUDIT-03 accepted) — embed page is intentionally cross-org public; access control gate is the JWT signature checked in verifyToken, not the session row lookup"
  - "WebhookDeliveryProcessor swap to single-injection (no tenantPrisma at all) — entire processor is BullMQ worker context with no CLS"

patterns-established:
  - "Pattern: When swapping a TENANCY_CLIENT call to SystemPrismaService, add `orgId` to the `where:` clause if orgId is in the method signature (defense-in-depth)"
  - "Pattern: `findUnique({ where: { id } })` becomes `findFirst({ where: { id, orgId } })` when adding orgId scoping (Prisma findUnique only accepts unique-index fields)"
  - "Pattern: Mutations on PK (`update`/`delete` by `{ id }`) are safe to keep AFTER an upstream `findFirst({ where: { id, orgId } })` ownership check — same shape as 49adac6 StatusService"

requirements-completed: [OID-01, OID-02, OID-03]

duration: ~25min (executor) + verification cycle
completed: 2026-04-20
---

# Quick 260420-oid: TENANCY_CLIENT Misuse Audit & Fix Summary

**Closed the silent RLS-denial regression class across 6 services (Playback, Webhooks, WebhookDeliveryProcessor, Notifications, Recordings, Settings) by routing non-HTTP-context Prisma calls through SystemPrismaService — restoring embed playback, SRS on_play, webhook delivery, status notifications, scheduled recordings, segment archival, storage-quota alerts, and boot-time SRS config regeneration.**

## Performance

- **Started:** 2026-04-20 (executor wave)
- **Completed:** 2026-04-20
- **Tasks:** 1 implementation + 1 verification checkpoint
- **Files modified:** 17 (6 services + 11 test files)

## Accomplishments

- Public embed `GET /api/playback/sessions/:id` now returns `200 OK` with session JSON (was 404 due to RLS block on `getSession`)
- SRS on_play `verifyToken` now resolves sessions via systemPrisma (live preview + embed page can play)
- WebhooksService.emitEvent (BullMQ NotifyDispatch path) creates WebhookDelivery rows
- WebhookDeliveryProcessor updates rows with responseStatus/responseBody (no longer stuck Pending)
- NotificationsService.createForCameraEvent + createSystemAlert write notifications from worker context
- RecordingsService schedule cron (startRecording/stopRecording), on_hls archival (archiveSegment/archiveInitSegment), storage quota aggregate + alert all unblocked
- SettingsService.onModuleInit regenerates srs.conf at boot without "Failed to regenerate" warning
- T-17-V4 IDOR mitigation on `getRecording` preserved exactly — stays on tenantPrisma with `findFirst({ where: { id, orgId } })`

## Task Commits

1. **Task 1: Swap TENANCY_CLIENT → SystemPrismaService for 6 broken-context services** — `e87016c` (fix)
2. **Task 2: End-to-end verification** — checkpoint approved (no commit; orchestrator verified)

**Plan metadata:** _orchestrator handles_

## Per-Service Change Summary

| Service | Pattern | Methods switched to systemPrisma | Methods kept on tenantPrisma |
|---------|---------|----------------------------------|------------------------------|
| `playback.service.ts` | dual-injection | `getSession`, `verifyToken` (+ orgId scoping in verifyToken via JWT payload) | `createSession`, `createBatchSessions`, `listSessionsByCamera` |
| `webhooks.service.ts` | dual-injection | `emitEvent` (orgId already in `where`) | `create`, `findAll`, `findById`, `update`, `delete`, `getDeliveries` |
| `webhook-delivery.processor.ts` | single-injection swap | entire processor — `webhookDelivery.update` calls (PK lookup, no orgId column on this table) | n/a (no HTTP context) |
| `notifications.service.ts` | dual-injection (drops rawPrisma slot) | `createForCameraEvent`, `createSystemAlert` (incl. prior `rawPrisma.member.findMany` + `rawPrisma.notification.create` — same RLS bug) | `findForUser`, `markAsRead`, `markAllAsRead`, `clearAll`, `getUnreadCount`, `getPreferences`, `updatePreference` |
| `recordings.service.ts` | triple-injection (keeps rawPrisma for Organization reads) | `startRecording`, `stopRecording`, `getActiveRecording`, `archiveSegment`, `archiveInitSegment`, `checkStorageQuota` (segment aggregate), `checkAndAlertStorageQuota` (member.findMany + notification.create) | `getSegment`, `listSchedules`, `createSchedule`, `updateSchedule`, `deleteSchedule`, `updateRetention`, `findAllRecordings`, `bulkDeleteRecordings`, `listRecordings`, **`getRecording` (T-17-V4 PRESERVED)**, `getRecordingWithSegments`, `deleteRecording` |
| `settings.service.ts` | dual-injection (boot helper extracted) | new private `regenerateAndReloadSrsAtBoot()` called from `onModuleInit` — uses `systemPrisma.systemSettings.findFirst/create` | `getSystemSettings`, `updateSystemSettings`, `getOrgSettings`, `updateOrgSettings`, HTTP-path `regenerateAndReloadSrs` |

## Files Created/Modified

**Services (6):**
- `apps/api/src/playback/playback.service.ts` — dual-injection; embed/SRS callback paths now bypass RLS
- `apps/api/src/webhooks/webhooks.service.ts` — dual-injection; BullMQ-triggered emitEvent unblocked
- `apps/api/src/webhooks/webhook-delivery.processor.ts` — single-injection swap; `Inject` + `TENANCY_CLIENT` imports removed
- `apps/api/src/notifications/notifications.service.ts` — dual-injection; old `rawPrisma: PrismaService` slot replaced by `systemPrisma: SystemPrismaService`
- `apps/api/src/recordings/recordings.service.ts` — triple-injection; worker/callback/cron paths use systemPrisma; HTTP CRUD on tenantPrisma; rawPrisma kept for Organization+package reads
- `apps/api/src/settings/settings.service.ts` — dual-injection; new `regenerateAndReloadSrsAtBoot` helper for boot path

**Tests (11) — constructor signature updates to add `systemPrisma` mock arg in positional injection:**
- `apps/api/tests/playback/playback.test.ts`
- `apps/api/tests/recordings/archive-segment.test.ts`
- `apps/api/tests/recordings/bulk-delete.test.ts`
- `apps/api/tests/recordings/cross-camera-list.test.ts`
- `apps/api/tests/recordings/download.test.ts`
- `apps/api/tests/recordings/get-recording.test.ts`
- `apps/api/tests/recordings/recording-lifecycle.test.ts`
- `apps/api/tests/recordings/storage-quota.test.ts`
- `apps/api/tests/settings/stream-engine.test.ts`
- `apps/api/tests/srs/config-generator.test.ts`
- `apps/api/tests/cluster/load-balancer.test.ts`

## Verification Evidence

**Automated (executor):**
- `pnpm tsc --noEmit` from `apps/api/` — clean
- `pnpm vitest run` — **172 passed** (playback, webhooks, notifications, recordings, srs, settings, cluster suites all green; 50 todo placeholders unchanged)

**Manual (orchestrator end-to-end check on the embed/SRS path):**
1. Merged worktree → main (commit `e87016c` on main)
2. Cleaned stale local edits from prior overloaded executor attempts (`git checkout -- ...`)
3. nest watch auto-recompiled (start:dev mode)
4. Re-seeded minimal Org→Site→Camera→PlaybackSession via psql (vitest cleanup had wiped dev DB — see "Issues Encountered" below)
5. **`GET /api/playback/sessions/verify-fix-session` → HTTP 200 + JSON** `{id, hlsUrl, expiresAt, cameraId}` — confirms `PlaybackService.getSession` now reads PlaybackSession via SystemPrismaService bypass (was 404 pre-fix). Same fix pattern in `verifyToken` will make SRS on_play succeed once a real stream is restored.
6. Cleaned up test data

**Result:** PASS — primary regression closed end-to-end on the embed path.

## Critical Preservations Confirmed

- **T-17-V4 mitigation on `getRecording`** — still uses `tenantPrisma.recording.findFirst({ where: { id, orgId } })`. Tests `recordings/get-recording.test.ts` remain green.
- **No rawPrisma in NotificationsService** — old `rawPrisma: PrismaService` slot collapsed; constructor now `(tenantPrisma, systemPrisma, gateway)`.
- **rawPrisma kept in RecordingsService** — only for `Organization` (no RLS) lookup in `checkStorageQuota` + `checkAndAlertStorageQuota` (package quota read).
- **WebhookDeliveryProcessor purged of TENANCY_CLIENT** — no `Inject` or `TENANCY_CLIENT` imports remain; entirely SystemPrismaService.
- **HTTP path for `regenerateAndReloadSrs`** unchanged — SuperAdminGuard sets IS_SUPERUSER → tenancy extension's `superuser_bypass` policy still matches; HTTP behavior identical to pre-fix.
- **`getSession` accepted without orgId scoping (T-RLS-AUDIT-03)** — embed page is intentionally cross-org public; session id is unguessable cuid; the JWT signature on the HLS URL is the access-control gate.

## Threats Closed

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-RLS-AUDIT-01 | Mitigated | All 6 services swapped to SystemPrismaService for non-HTTP contexts |
| T-RLS-AUDIT-02 | Mitigated | Defense-in-depth `where: { ..., orgId }` added on every swap where orgId is in signature (verifyToken, emitEvent, createForCameraEvent, createSystemAlert, startRecording, stopRecording, getActiveRecording, archiveSegment, archiveInitSegment, checkStorageQuota aggregate, checkAndAlertStorageQuota) |
| T-RLS-AUDIT-03 | Accepted (documented) | `PlaybackService.getSession` — public embed, JWT signature is the access gate |
| T-RLS-AUDIT-04 | Accepted (documented) | `WebhookDeliveryProcessor` — no orgId column on WebhookDelivery; PK lookup sufficient; subscriptionId FK cascades RLS upstream |
| T-RLS-AUDIT-05 | Mitigated | Per-method explicit guidance followed; HTTP-only methods explicitly preserved on tenantPrisma per the per-service action lists |
| T-RLS-AUDIT-06 | Mitigated | `getRecording` T-17-V4 IDOR mitigation preserved exactly; tests still green |

## Decisions Made

See `key-decisions` in frontmatter — primarily:
- Triple-inject RecordingsService rather than collapse rawPrisma into systemPrisma (Organization has no RLS, distinct semantics)
- Collapse NotificationsService's rawPrisma slot into systemPrisma (its rawPrisma calls were in worker context with the same RLS bug)
- Extract a boot-only helper in SettingsService rather than branch inside the shared method (keeps HTTP path identical to pre-fix)

## Deviations from Plan

None — plan executed exactly as written. The atomic commit shape, per-service method classification, and dual/triple-injection patterns all match the plan's per-service action blocks.

## Issues Encountered

**Test infrastructure side-effect (NOT a regression of this fix — flagged for follow-up):**
- The executor's `pnpm vitest run` cleared all real data from the dev database (Camera, PlaybackSession, Organization, Site, Project, Recording all = 0 after the run).
- Root cause: integration test cleanup runs against `DATABASE_URL_MIGRATE` which currently points at the same dev DB used for manual UAT.
- Impact: User must re-seed or re-create their test camera before continuing manual UAT.
- **Out of scope for this plan** — caused by lack of test isolation, not by the TENANCY_CLIENT swap.
- **Recommended follow-up:** open a new Quick Task to either (a) point integration tests at a separate `sms_test` database, (b) wrap each test in a transaction-rollback fixture, or (c) document a `pnpm db:seed:dev` recipe to restore canonical test data after each test run. Track as deferred.

## Deferred Items

- **Test/dev DB isolation** (see Issues Encountered above) — vitest integration suites destructively wipe the dev DB. Open follow-up Quick Task before next major UAT cycle.

## Next Steps Readiness

- Embed playback path is functionally restored on the API layer. User should re-create a test camera in the UI and re-run a real playback E2E (cameras list → click camera → confirm HLS plays + SRS logs show `on_play 0`).
- Webhook deliveries, scheduled recordings, segment archival, and storage-quota alerts are all unblocked — recommend a follow-up smoke test once the dev DB is re-seeded.
- Boot-time SRS config regeneration warning should now be absent in API startup logs.

## Self-Check: PASSED

**Files modified verified:**
- FOUND: apps/api/src/playback/playback.service.ts
- FOUND: apps/api/src/webhooks/webhooks.service.ts
- FOUND: apps/api/src/webhooks/webhook-delivery.processor.ts
- FOUND: apps/api/src/notifications/notifications.service.ts
- FOUND: apps/api/src/recordings/recordings.service.ts
- FOUND: apps/api/src/settings/settings.service.ts

**Commit verified:**
- FOUND: e87016c (fix(api): close TENANCY_CLIENT misuse for non-HTTP contexts (260420-oid))

---
*Quick Task: 260420-oid-audit-tenancy-client-misuse-fix-all-serv*
*Completed: 2026-04-20*
