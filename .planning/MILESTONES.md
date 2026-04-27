# Milestones

## v1.2 Self-Service, Resilience & UI Polish (Shipped: 2026-04-27)

**Phases completed:** 11 phases, 64 plans, 115 tasks

**Key accomplishments:**

- RLS-context transaction for system org user creation, API key hard-delete with separate revoke endpoint, and Stripe-pattern key reveal dialog
- Migrated Team and Organizations pages from manual Table to unified DataTable with sorting, faceted filters, pagination, and row actions
- Cluster Nodes DataTable with MetricBar/role/status filters, Platform Audit with Organization column and dynamic org filter, 307 lines of manual table code deleted
- เพิ่ม maintenance columns ลงใน Camera schema พร้อม wire `camera-notify` BullMQ queue + `NotifyDispatchProcessor` และ refactor `StatusService.transition` ให้เป็น single chokepoint ที่ทั้ง gate maintenance และ debounce outbound notify/webhook 30 วินาทีแบบ replacement.
- Landed every server-side resilience primitive for Phase 15: the `camera-health` repeatable tick (RESIL-02), SRS-restart detection + bulk re-enqueue with jitter (RESIL-01), graceful shutdown + boot re-enqueue (RESIL-04), and the jobId unification that makes four BullMQ enqueue paths dedup correctly. Combined with 15-01's maintenance gate + 30s debounce, the phase now delivers RESIL-03 end-to-end.
- ส่งมอบ API surface สำหรับ maintenance-mode ที่ UI ของ 15-04 จะเรียกใช้: POST/DELETE `/api/cameras/:id/maintenance` endpoints + service methods + 9 vitest cases. พึ่ง 15-01 chokepoint สำหรับ notify suppression, AuditInterceptor สำหรับ audit trail, และ tenancy client สำหรับ org scoping.
- ส่งมอบ UI surface ตาม 15-UI-SPEC verbatim: composite 3-icon Status column (CameraStatusDot + recording Circle + amber Wrench) พร้อม per-icon Thai tooltips, และ maintenance row-action toggle พร้อม AlertDialog confirmation ที่มี destructive/default variant แยกตามทิศทาง enter/exit. Consume 15-03 API โดย fetch POST/DELETE `/api/cameras/:id/maintenance` + refresh camera list + Thai toast feedback. ครอบ 9 vitest + RTL tests ที่ผ่านทั้งหมด.
- Shared MinIO avatars bucket, sharp-backed 256x256 WebP transcode pipeline, `/api/users/me/avatar` POST+DELETE and `/api/organizations/:orgId/plan-usage` endpoints with org-isolated MTD aggregation, plus 36 new vitest assertions covering T-16-01 through T-16-09.
- Tenant `/app/account` page ships Profile + Security + Plan & Usage; shared SidebarFooterContent exposes 'Account settings' in both portals; zxcvbn password meter lazy-loads to keep bundle lean; 52 new vitest assertions across 6 files GREEN; `pnpm --filter @sms-platform/web build` succeeds.
- Super admin `/admin/account` page ships — identical to `/app/account` minus Plan & Usage; reuses AccountProfileSection + AccountSecuritySection from Plan 16-02 unchanged; 7 new vitest assertions GREEN; full web build compiles with the route listed at 765 B.
- Six test scaffolds (5 new + 1 extended) wired with mocks and `it.todo` placeholders so plans 17-01..17-04 can drive RED→GREEN by un-`todo`ing during implementation
- DataTable now accepts an optional `onRowClick(row)` handler that wires cursor-pointer, tabIndex=0, and Enter/Space key handling in a single switch; recordings table uses it to `router.push('/app/recordings/' + row.id)` while Checkbox + actions cells stop propagation so they keep their own behavior — implements D-02, the entry point for REC-01.
- RecordingsService.getRecording switched to findFirst({id, orgId}) closing T-17-V4 cross-org enumeration, expanded include to camera/site/project, and a new useRecording(id) hook with three-state error API now powers the playback page header.
- 1. [Rule 2 — Critical Functionality] Updated second consumer `view-stream-sheet.tsx` not enumerated in plan
- `/app/recordings/[id]` route delivers REC-01/02/03 by composing feature gate, useRecording (3-state error), HlsPlayer (mode=vod, key={id}), TimelineBar (click-to-seek + range), Calendar popover date nav, and a plain-Table day-recordings list — replacing 9 it.todo stubs with GREEN tests.
- Nyquist-gate test scaffolds: 14 vitest files + 1 shared camera-fixtures module with 88 total `it.todo` stubs covering every UI-05/UI-06 verifiable behavior, plus regression-guard and security-threat stubs that downstream executors must flip to real assertions.
- Extends tenant DashboardService with 2 stat counters + 5 per-camera fields and adds 7 super-admin endpoints (active-streams, recordings-active, platform-issues, cluster-nodes, storage-forecast, recent-audit, org-health), all guarded by SuperAdminGuard with Prisma.sql-parameterized forecast queries and zod-validated range/limit params — flipping 20 Plan 00 it.todo stubs to green assertions and unblocking Plans 02/03/05.
- Refactors the tenant dashboard to D-01..D-04: drops SystemMetrics (moved to /admin in a future plan), expands the stat strip from 4 to 6 cards (adds Recording + In Maintenance fed by Plan 01 counters), keeps BandwidthChart + ApiUsageChart, and replaces the CameraStatusTable with a severity-sorted IssuesPanel backed by a new useDashboardIssues composition hook — flipping 11 Plan 00 it.todo stubs to green assertions and closing the UI-05 tenant surface.
- Teardrop SVG marker (28×36) + recording/maintenance badges + cluster worst-status coloring + HTML-escaped camera names shipped; Plan 00 stubs flipped to 15 passing assertions + 1 documented manual-only skip.
- Camera-popup body rewritten for D-17..D-22 — 16:9 preview with status overlay, badge stack with retention + maintainer + offline timestamp, 2 primary buttons + ⋮ dropdown, Thai+English maintenance AlertDialog — PreviewVideo memoization preserved verbatim with passing regression-guard.
- Four new platform-dashboard widgets — PlatformIssuesPanel (D-09 reward-state + 5 issue-type rows), ClusterNodesPanel (D-08 5-column table consuming the existing useClusterNodes Socket.IO hook), StorageForecastCard (D-10 Recharts LineChart + 7d/30d ToggleGroup + destructive-styled caption), RecentAuditHighlights (D-11 7-entry feed + /admin/audit link), plus a shadcn-like ToggleGroup primitive over @base-ui/react and a usePlatformDashboard hook with 3 polling sub-hooks — flipping all 13 Plan 00 it.todo stubs to green via TDD RED→GREEN.
- Wire-up plan that closes UI-05 by composing 7 stat cards + SystemMetrics + 4 Plan-05 widgets + a new DataTable-migrated Organization Health table + Recent Activity into the refactored super-admin dashboard in D-07 priority order, extending the DataTable wrapper with declarative `initialState` support and adding a hidden-computed-column trick to drive max-usage-desc default sort without mutating the data array — flipping 10 Plan 00 it.todo stubs to green and unblocking the v1.2 super-admin surface.
- Before (all 3 DTOs):
- One-liner:
- Prisma `@@unique([orgId, streamUrl])` + pre-constraint keep-oldest dedup SQL + P2002 → DuplicateStreamUrlError translation + bulkImport 3-layer dedup with extended `{imported, skipped, errors}` response
- Before (`cameras-columns.tsx:148-172`):
- Live 4-protocol prefix validation + WHATWG URL host check + inline 409 DUPLICATE_STREAM_URL branch wired into the Add/Edit Camera dialog, gated by a shared `validateStreamUrl` helper that is also already consumed by P07 bulk-import.
- Extended bulk-import-dialog with shared 4-protocol validator, within-file duplicate detection (amber Copy icon), 3-way footer counter, Import-button rule that allows duplicates, and post-import toast cascade — closes audit gap "Bulk Import duplicate detection: ไม่มีเลยทั้งสองฝั่ง".
- Mechanical field rename across 3 source + 4 test files making StreamJobData carry a protocol-neutral name (`inputUrl`) instead of the misleading `rtspUrl`, with a static D-03 audit confirming no scheduled re-probe or hybrid pre-check was silently added.
- PushUrlSection
- Plan 20-03: Bulk Actions System + Partial-Failure Badges
- Before (2 lines):
- 10 it.todo test scaffold files (9 backend + 1 frontend) plus a fully-filled 21-VALIDATION.md per-task verification map giving plans 02-06 a Nyquist-compliant automated-verify command for every code-producing task.
- Built the D-01 fingerprint helper, the StreamsService.enqueueProfileRestart chokepoint (per-camera audit-then-enqueue with 0-30s jitter and corrected jobId), and wired StreamProfileService.update so any FFmpeg-affecting field change fans out a 'restart' BullMQ job for every running, non-maintenance camera using that profile. PATCH /api/stream-profiles/:id now returns an additive `affectedCameras: number` field — Plan 05 surfaces it as a toast.
- Mirrored Plan 02's profile-side trigger on the camera-side path: PATCH /api/cameras/:id detects a streamProfileId change, computes pre/post fingerprints over the resolved profile rows, and — when the fingerprints differ AND the camera is restart-eligible — enqueues exactly ONE restart for that single camera via StreamsService.enqueueProfileRestart's new single-camera mode. The PATCH response now carries an additive `restartTriggered: boolean` field — Plan 05 will surface it as a toast.
- Implemented the runtime side of the Phase 21 hot-reload contract: a new `FfmpegService.gracefulRestart` helper (SIGTERM → poll → SIGKILL with 5s grace), a `StreamProcessor.process` extension that runs `gracefulRestart` BEFORE the normal start sequence whenever `job.name === 'restart'`, and a `CameraHealthService.enqueueStart` collision guard that prevents the 60s health tick from silently demoting an in-flight 'restart' job to a 'start' job carrying a stale camera-health snapshot.
- Closed the user-facing surface for Phase 21: PATCH responses now reach the user as informative toasts ("Profile updated · 3 camera(s) restarting with new settings", "Stream restarting with new profile"), and the destructive DELETE flow on `stream-profiles` now refuses to silently null-set referencing cameras — instead returning HTTP 409 with `usedBy: [{ cameraId, name }]` rendered inline in the confirmation AlertDialog as "Reassign before deleting · {N} camera(s) still using this profile:".
- Branch enqueueProfileRestart on `existingJob.isActive()` and publish `{ profile, inputUrl, needsTranscode, fingerprint }` to `camera:{cameraId}:restart` Redis pub/sub channel when active+locked, falling through to unchanged remove-then-add for every other state.
- Wire a Redis subscriber on `camera:{cameraId}:restart` into `StreamProcessor.process()` with `try/finally` lifecycle (Mitigation 1), DB-vs-job fingerprint safety net on subscribe-ready (Mitigation 2), and a `restartingCameras: Set<string>` dedup guard (Mitigation 3). Plan 01's publisher branch now has a listener; the publisher→subscriber round-trip closes the active+locked-job defect.
- Add 3 mock-based unit tests + 1 real-Redis integration test that pin Plan 01's publisher branch, Plan 02's subscriber + 3 mitigations, and the BKR06 11-PATCH UAT scenario as a runnable assertion. Closes Mitigation 4 (D-14) — the hybrid test strategy that Phase 21 was missing, which is precisely why the active-job collision defect was discovered only at manual UAT.
- Camera.tagsNormalized shadow column with GIN index camera_tagsnormalized_idx, Prisma Client Extension auto-mirroring tags lowercased on every write path, DTO Zod bounds (50 chars × 20 tags) uniform across create/update/bulk-import, and 14 Wave 0 test files ready for Wave 1+ population.
- Wires the case-insensitive OR filter for `GET /cameras?tags[]=Lobby` through the GIN-indexed `tagsNormalized` shadow column from Plan 22-01 — service applies `where.tagsNormalized = { hasSome: input.map(lowercase) }`, controller parses both single-value and array query shapes via Zod, and an advisory perf test pins the GIN index name + bitmap-scan path.
- `tags: camera.tags ?? []` added to `camera.online` and `camera.offline` webhook payloads via a single 7-line change in `notify-dispatch.processor.ts` plus 5 concrete vitest assertions replacing the Plan 22-01 `it.todo` stub — full TDD RED→GREEN with 5/5 webhook tests green and 33/33 status-suite no-regression.
- Camera UPDATE in `cameras.service.ts` now emits `auditService.log({ action: 'camera.metadata.update', details: { diff } })` carrying a structured `{ before, after }` diff for `tags` and `description` — only when at least one of those fields actually changed. CREATE path is byte-identical (D-25). The audit sanitizer's `diff` key preservation is now pinned by 4 unit tests so future contributors can't accidentally redact tag/description history.
- `GET /cameras/tags/distinct` returns `{ tags: string[] }` alphabetized with deterministic first-seen casing per D-04, backed by a Redis-first / memory-fallback `TagCacheService` (TTL=60s, key=`tags:distinct:{orgId}`). T-22-02 cross-org leak mitigated by TWO defense layers: production `set_config('app.current_org_id', ...)` for app_user RLS + explicit `WHERE "orgId" = ${orgId}` clause for defense-in-depth (also makes the integration test pass against the test superuser). 10/10 integration tests pass, 187/187 full cameras suite green, zero regressions.
- `POST /cameras/bulk/tags` accepts `{ cameraIds, action: 'add'|'remove', tag }` and applies the action across N cameras (≤500) via per-camera transactional update — fires the Plan 22-01 Prisma extension so `tagsNormalized` stays in sync (Pitfall 5), emits ONE audit row per mutated camera with `details.diff.tags = { before, after }` per D-26, invalidates the org's distinct-tags cache so autocomplete + table/map MultiSelect reflect the new state immediately. Defense-in-depth `orgId` filter on the candidate-set findMany mirrors Plan 22-05 — T-22-01 mitigation has TWO layers (RLS in production, explicit WHERE in tests). 10/10 tests pass (8 service-layer + 2 controller-smoke), full cameras suite 197/197 with zero regressions.
- `TagInputCombobox` chip combobox composite ships in `apps/web/src/app/admin/cameras/components/tag-input-combobox.tsx` with full UI-SPEC §"Chip combobox spec" parity (modes: multi/single, freeText/suggestions-only). Camera Add/Edit form's Tags field replaces the historical comma-separated `<Input>` with the new composite — tags state migrates from `string` (comma-joined) to `string[]` end-to-end across all 5 touchpoints (state declaration, initial-values snapshot type, edit pre-fill, edit diff, create body). Distinct-tags fetch wired to `/api/cameras/tags/distinct` (Plan 22-05 endpoint) on dialog open per D-09; toast.error fallback on failure. 13/13 component tests pass; 30/30 camera-form tests pass; Next.js build clean. Bulk-import-dialog NOT modified per D-10. UI-SPEC Negative Assertion #2 honored: `grep -c text-destructive tag-input-combobox.tsx` returns 0.
- Inserts the Tags column (D-14 with up to 3 alphabetized neutral-tone badges + `+N` overflow tooltip per D-15), the Tags MultiSelect filter populated from `GET /cameras/tags/distinct` (D-06 / D-07 OR semantics), and the conditional camera-name description tooltip across both DataTable rows AND camera-card tiles (D-17 + D-18 — `max-w-[320px]` + `line-clamp-6` + Radix-default delay, mounted only when `description.trim()` is non-empty). Three TDD task pairs, 6 atomic commits with `--no-verify`, 38 new test cases pass + zero regressions across 36 pre-existing cameras-columns cases.
- Surfaced `Camera.tags` and `Camera.description` on the Dashboard Map. Camera popup renders a tags row (TagsCell ≤3 + overflow) and a description block (line-clamp-2 with Show more / Show less). Map toolbar gains a Tags MultiSelect filter (D-20) that narrows visible markers via case-insensitive OR semantics; filter state is local to the map page (D-21 — independent from /admin/cameras filter).
- 1. [Rule 3 — Project convention] Plan example used Radix `asChild` but project uses base-ui `render` prop
- Documents the `?tags[]=` filter on `GET /api/cameras` (Plan 22-02) and the `tags: string[]` field on `camera.online` / `camera.offline` webhook payloads (Plan 22-03) in the in-app developer-docs pages — single TASK-1 commit modifying the admin source files (which the tenant `/app/developer/docs/...` routes re-export). Static placeholders only (CAMERA_ID, YOUR_API_KEY); D-22 exclusions enforced by removing the stale `cameraName` field from the existing webhook payload example; web build clean.

---

## v1.1 UI Overhaul (Shipped: 2026-04-18)

**Phases completed:** 6 phases, 15 plans, 25 tasks

**Key accomplishments:**

- Generic DataTable with @tanstack/react-table: sorting, search, faceted filters, numbered pagination, row selection, and row action menus -- consumed by 13+ pages
- DatePicker and DateRangePicker wrapper components using base-ui Popover + react-day-picker Calendar, replacing all 6 native date inputs across 3 pages
- 1. [Rule 1 - Bug] React hooks rules violation in tenant layout
- Split-screen login with branding panel, remember me checkbox wired to better-auth rememberMe param, and 30-day session config
- One-liner:
- Audit log migrated from cursor-based Load More to DataTable with server-side offset pagination, search, Action filter, DateRangePicker, and View Details dialog
- Users and API Keys tables migrated to DataTable with sortable columns, faceted filters, search, and contextual quick actions
- Webhooks and Stream Profiles migrated to DataTable with sortable columns, faceted filters, search, and quick action menus replacing manual table and card grid layouts
- 1. [Rule 1 - Bug] Fixed useRef TypeScript strict mode error
- Task 3 (checkpoint:human-verify)
- Commit:
- Commit:
- Shared HierarchyTree component with collapsible search and resizable split-panel projects page showing context-sensitive DataTable for projects, sites, and cameras

---

## v1.0 MVP (Shipped: 2026-04-16)

**Phases completed:** 9 phases, 39 plans, 79 tasks

**Key accomplishments:**

- NestJS + Next.js monorepo with Prisma 6 schema (9 models including Package and UserPermissionOverride), Docker Compose (PostgreSQL 16 + Redis 7), and Vitest test infrastructure
- Better Auth with organization/admin/RBAC plugins, 4-role permission system with per-user override support (D-02), RLS tenant isolation via Prisma Client Extension + nestjs-cls, and 26 tests across 5 suites
- Package CRUD with JSONB feature toggles, organization management with System org protection, and user invitation/creation with last-admin guard -- 21 new tests, all 47 total tests passing
- PostgreSQL RLS policies on Member, Invitation, UserPermissionOverride with superuser bypass, SuperAdminGuard on UsersController, and integration tests proving org-level row filtering
- FeaturesService + FeatureGuard for backend enforcement, GET /api/organizations/:orgId/features endpoint, useFeatures React hook for frontend UI gating
- 1. [Rule 2 - Missing Critical] Created AuthGuard
- Camera management UI with projects hierarchy, camera list with real-time status, camera detail with HLS preview player, Start/Stop stream controls, and Socket.IO live status updates.
- Policy CRUD with per-field merge resolution and JWT-signed playback session creation via jose library
- SRS on_play JWT/domain verification, token-protected HLS key serving with m3u8 proxy rewrite, and three-tier rate limiting via ThrottlerModule
- Policy management dialogs, camera embed code generation, and public embed player page
- API key CRUD with sk_live_ prefix, SHA-256 hash storage, X-API-Key guard, combined auth guard, and Redis usage tracking with daily BullMQ aggregation
- Swagger UI at /api/docs with all 6 controllers documented, batch playback sessions endpoint with max-50 Zod validation, and dual AuthOrApiKeyGuard on session creation endpoints
- Webhook subscription CRUD with BullMQ delivery, HMAC-SHA256 signing, SSRF-safe URL validation, and StatusService integration for camera event emission
- Developer Portal with sidebar nav, D-07 dynamic Quick Start curl examples, API key management UI with one-time reveal, and webhook management pages with delivery log viewer
- 5 in-app documentation guides (API Workflow, Policies, Stream Profiles, Webhooks, Streaming Basics) with docs index page and GuideCard/DocPage components
- 6 test stub files with 55 todo tests covering dashboard, map, metrics, audit, notifications, and SRS log gateway
- Audit interceptor, notification system with Socket.IO delivery, and dashboard aggregation endpoints with RLS-protected Prisma models
- Leaflet map page at /admin/map with status-colored camera markers, MarkerClusterGroup clustering, HLS popup preview via hls.js, and Monitoring sidebar navigation section
- Dashboard page with stat cards, bandwidth/API usage area charts with time range toggles, status-sorted camera table, and super admin system metrics -- all with 30s polling and Socket.IO real-time updates
- Audit log page with filtered table and detail dialog, plus SRS real-time log streaming gateway and viewer on Stream Engine page
- Notification bell with real-time Socket.IO delivery, popover dropdown with mark-as-read, per-event preferences, and camera detail Activity tab with audit log
- SrsNode data model with CRUD API, nginx HLS caching proxy config generation, and multi-node SrsApiService refactor
- BullMQ health polling with 3-miss OFFLINE threshold, auto-recovery, edge-routed playback sessions with origin fallback, and Socket.IO status broadcasting
- Admin cluster management page with node table, add/remove/detail dialogs, real-time Socket.IO health updates, and sidebar navigation
- 34 Vitest it.todo() stubs across 6 files covering segment archival, manifest generation, lifecycle, retention, quota, and schedules
- MinIO object storage, Recording Prisma models, start/stop API, and on_hls callback segment archival pipeline with path traversal protection
- Dynamic m3u8 manifest generation, hourly retention cleanup, scheduled recording via BullMQ, and storage quota alerts at 80%/90% thresholds
- Recordings UI with camera detail tab (calendar, timeline bar, HLS player, start/stop controls), schedule dialog, retention settings, and admin recordings list page
- Dev Package seed with feature check endpoint, error toasts on recording actions, and correct storage quota field mapping
- 1. [Rule 3 — Blocking issue] Missing vitest infrastructure in web app
- 1. [Rule 3 - Blocking] Wave 0 test files not present in worktree
- Nav primitives (Task 1)
- Shared tenant components (Task 1a).
- One-liner:

---
