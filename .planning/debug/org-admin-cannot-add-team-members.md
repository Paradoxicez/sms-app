---
status: resolved
trigger: "Org Admin in Test Org clicks Create user in Add Team Member dialog and receives toast 'You do not have permission to add team members.' User form is filled correctly. No team member is created."
created: 2026-04-22T00:00:00Z
updated: 2026-04-22T13:10:00Z
---

## Current Focus

hypothesis: CONFIRMED — OrgAdminGuard's membership lookup uses raw PrismaService (DATABASE_URL=app_user, RLS-enforced) without setting CLS/set_config signals before the query. Post-migration rls_superuser_bypass_positive_signal, Member table bypass requires app.is_superuser='true'; tenant_isolation requires app.current_org_id=organizationId. Neither is set by the guard for its OWN query — so findFirst returns null → ForbiddenException → 403 → frontend toast.
test: Trace request path end-to-end (controller → guard → RLS policies → DB role). Completed.
expecting: See Evidence.
next_action: Return ROOT CAUSE FOUND to caller; do not apply a fix (goal=find_root_cause_only).

## Symptoms

expected: Org Admin can create a new user (team member) in their own org via /app/team "Add Team Member" dialog. Valid form submission creates user and row appears.

actual: Red toast "You do not have permission to add team members." No user created. Dialog stays open.

errors: Client-side toast: "You do not have permission to add team members." Origin (frontend gate vs backend 403) unverified.

reproduction:
  1. Sign in as Org Admin in Test Org
  2. Navigate to /app/team
  3. Click "Add Team Member"
  4. Fill valid form (email, name, 8+ char password, role=Org Admin)
  5. Click "Create user"
  6. Toast shows permission error

started: Unknown; user discovered after Phase 18 UI polish. Recent quick task 260422-cnv touched team UI files but should be UI-only.

## Eliminated

- hypothesis: Frontend pre-flight RBAC gate blocks the submit
  evidence: apps/web/src/app/app/team/components/add-team-member-dialog.tsx:100-121 shows the form always POSTs to /api/organizations/:orgId/users and only shows the "You do not have permission…" toast when res.status === 403. No client-side role check.
  timestamp: 2026-04-22

- hypothesis: Role string casing mismatch ("Org Admin" vs "admin" vs "ORG_ADMIN")
  evidence: Member.role is consistently stored and checked as lowercase 'admin' across schema (schema.prisma:109), guard (org-admin.guard.ts:74), service (users.service.ts:132-134), and dialog form (add-team-member-dialog.tsx:49 value="admin"). No mismatch.
  timestamp: 2026-04-22

- hypothesis: Recent quick task 260422-cnv broke team UI permissions
  evidence: That task only touched apps/web/src/app/app/team/page.tsx and team-data-table.tsx (empty-state alignment). The error origin is the backend OrgAdminGuard + RLS — unrelated to frontend.
  timestamp: 2026-04-22

## Evidence

- timestamp: 2026-04-22
  checked: Location of toast message "You do not have permission to add team members."
  found: Exactly ONE source file: apps/web/src/app/app/team/components/add-team-member-dialog.tsx:111, gated by `if (res.status === 403)` on line 110.
  implication: Error originates from backend 403 response on POST /api/organizations/:orgId/users, not from frontend pre-flight gate.

- timestamp: 2026-04-22
  checked: Backend controller for POST /api/organizations/:orgId/users
  found: apps/api/src/users/users.controller.ts:25-27 applies `@UseGuards(OrgAdminGuard)` to the entire controller. Handler createUser at line 61-71 only runs AFTER the guard allows the request.
  implication: 403 must be thrown by OrgAdminGuard or later.

- timestamp: 2026-04-22
  checked: OrgAdminGuard implementation (apps/api/src/auth/guards/org-admin.guard.ts)
  found: Line 70-76: guard calls `this.prisma.member.findFirst({ where: { userId, organizationId: orgId, role: 'admin' } })` on the injected PrismaService. If `member` is null, line 79 throws `ForbiddenException('Org admin access required')` → HTTP 403. Super-admin path at line 62-68 is separate and only handles `session.user.role === 'admin'` (platform super admin, not Org Admin).
  implication: For Org Admins (session.user.role === 'user', Member.role === 'admin'), the guard depends ENTIRELY on this findFirst returning the matching row.

- timestamp: 2026-04-22
  checked: PrismaService connection role and RLS posture
  found:
    • .env: DATABASE_URL=postgresql://app_user:...@localhost:5434/sms_platform (regular app_user, NOT BYPASSRLS)
    • .env: DATABASE_URL_MIGRATE=postgresql://sms:... (the `sms` superuser, rolbypassrls=true — used only by SystemPrismaService and better-auth)
    • apps/api/src/prisma/prisma.service.ts: PrismaService is a plain PrismaClient with NO extension; it uses DATABASE_URL → connects as app_user.
    • apps/api/src/prisma/rls.policies.sql:11-20 confirms app_user is a regular LOGIN role with only CRUD grants — no rolbypassrls.
  implication: Any query via `this.prisma` on a table that has `FORCE ROW LEVEL SECURITY` is RLS-scoped by Postgres policies.

- timestamp: 2026-04-22
  checked: RLS policies on Member table
  found:
    • apps/api/src/prisma/migrations/rls_policies/migration.sql:7,12: `ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;`
    • tenant_isolation_member USING/WITH CHECK requires `"organizationId" = current_setting('app.current_org_id', true)::text`
    • superuser_bypass_member (after migration rls_superuser_bypass_positive_signal/migration.sql:97-100) USING `current_setting('app.is_superuser', true) = 'true'`.
  implication: For the guard's findFirst on Member to return ANY row, the Postgres session must have either app.current_org_id set to the target org OR app.is_superuser='true'. Neither is set by OrgAdminGuard before its query.

- timestamp: 2026-04-22
  checked: How/when CLS signals become Postgres set_config calls
  found: apps/api/src/tenancy/prisma-tenancy.extension.ts wraps each query in a transaction that emits `SELECT set_config('app.current_org_id', …, TRUE)` and/or `SELECT set_config('app.is_superuser', 'true', TRUE)` from CLS.set('ORG_ID' / 'IS_SUPERUSER'). This extension is applied ONLY to the TENANCY_CLIENT provider (used by UsersService), NOT to PrismaService.
  implication: The guard's direct `this.prisma.member.findFirst` bypasses the extension. Even though the guard calls `this.cls.set('ORG_ID', orgId)` and `this.cls.set('IS_SUPERUSER', 'true')` (lines 63, 85), those CLS values only take effect for LATER TENANCY_CLIENT queries — never for the guard's own PrismaService query. At the time of the findFirst call, no set_config has been issued in the Postgres session.

- timestamp: 2026-04-22
  checked: Git history of guard + RLS changes
  found:
    • 1bc7e51 "fix(auth,rls): close tenancy bypass with positive-signal superuser flag…" — introduced the rls_superuser_bypass_positive_signal migration. BEFORE this commit, `superuser_bypass_member` matched when `current_setting('app.current_org_id', true) IS NULL OR = ''`. The guard's direct PrismaService query never set app.current_org_id, so the bypass matched and the query worked by accident.
    • 76005c2 "fix(auth,rls): OrgAdminGuard sets CLS signals + UsersService uses TENANCY_CLIENT" — moved UsersService to TENANCY_CLIENT and added CLS.set(ORG_ID/IS_SUPERUSER) in OrgAdminGuard. But the guard's OWN membership query was not refactored to use TENANCY_CLIENT or to emit set_config inline. The fix covered the service layer, not the guard.
  implication: The regression was introduced by 1bc7e51 and only partially fixed by 76005c2. The guard's raw query has been silently broken since ~2026-04-19 for all Org Admin (non-super-admin) users.

- timestamp: 2026-04-22
  checked: Test coverage for the guard — apps/api/tests/users/org-admin-guard.test.ts
  found: Test "allows org admin of :orgId to access own org" (line 120-128) calls `new OrgAdminGuard(testPrisma as any, cls as any)` with testPrisma — which per tests/setup.ts:17 and helpers/tenancy.ts:59-61 connects as the `sms` superuser (rolbypassrls=true). RLS is completely bypassed at the connection level, so the guard's findFirst returns the member row regardless of missing set_config. The unit test never exercises the production code path.
  implication: The tests give false confidence. They prove the guard's TypeScript logic but not its interaction with app_user + FORCE RLS in production.

## Resolution

root_cause: |
  OrgAdminGuard.canActivate (apps/api/src/auth/guards/org-admin.guard.ts:70-76) queries `Member`
  via the raw PrismaService (injected as `this.prisma`). PrismaService connects to Postgres as
  `app_user` (DATABASE_URL), which does NOT have `rolbypassrls`. The `Member` table has
  `FORCE ROW LEVEL SECURITY` with two policies:
    • tenant_isolation_member: matches when app.current_org_id = organizationId
    • superuser_bypass_member:  matches when app.is_superuser = 'true'
  The guard does not emit `set_config('app.current_org_id', …)` or `set_config('app.is_superuser','true')`
  before running its findFirst. Neither policy matches → the query returns zero rows for EVERY
  non-super-admin caller → `!member` → `throw new ForbiddenException('Org admin access required')` → 403.
  The AddTeamMemberDialog's 403 handler (add-team-member-dialog.tsx:110-113) then renders the
  "You do not have permission to add team members." toast.

  The bug affects ALL OrgAdminGuard-protected routes for Org Admin users (create user, list members,
  invite, update role, delete member). It was introduced on 2026-04-19 by commit 1bc7e51 which
  replaced the negative-signal superuser_bypass with a positive-signal flag. Commit 76005c2 fixed
  the downstream service layer (TENANCY_CLIENT) but did not refactor the guard's own membership
  lookup, so the regression persisted. Test suite did not catch it because testPrisma connects as
  the `sms` superuser which bypasses RLS unconditionally.

fix: (not applied — goal=find_root_cause_only; see suggestions at end)
verification:
files_changed: []

## RLS Pattern Audit (Extended Scope)

Goal: find every site in apps/api/src that shares the OrgAdminGuard bug pattern —
raw PrismaService (no extension) querying a FORCE-RLS table without wrapping the
call in a `$transaction` that first calls `set_config('app.current_org_id', …)`
or `set_config('app.is_superuser', 'true')`. Diagnose only; no fixes applied.

### RLS-Enforced Tables

Tables with both `ENABLE ROW LEVEL SECURITY` AND `FORCE ROW LEVEL SECURITY`.
Superuser_bypass for each was made positive-signal by migration
`rls_superuser_bypass_positive_signal` (commit 1bc7e51, 2026-04-19).

Tenancy + membership (rls_policies/migration.sql, rls.policies.sql):
  - Member
  - Invitation
  - UserPermissionOverride

Phase 2 core (rls_phase02/migration.sql, rls_apply_all/migration.sql):
  - Camera
  - Project
  - Site
  - StreamProfile
  - PlaybackSession
  - Policy

Phase 3+ (rls_apply_all/migration.sql):
  - ApiKey
  - WebhookSubscription
  - OrgSettings
  - Recording
  - RecordingSegment
  - RecordingSchedule

Phase 5 dashboard + monitoring (rls.policies.sql:81-109):
  - AuditLog
  - Notification
  - NotificationPreference

Tables explicitly NOT under RLS (verified against schema + migrations):
  - Organization, User, Account, Session, Package, ApiKeyUsage,
    WebhookDelivery, SystemSettings, SrsNode

### Sites Inspected

Complete sweep of apps/api/src for every file that injects `PrismaService`,
`TENANCY_CLIENT`, or `SystemPrismaService`, every `*.guard.ts` / `*.middleware.ts`
/ `*.interceptor.ts`, plus all BullMQ processors. Also grep-audited every
`this.prisma.{model}` access across the codebase for tables under FORCE RLS,
and every `$queryRaw` / `$executeRaw` invocation.

Tally:
  - 12 files inject raw `PrismaService`
  - 18 files inject `TENANCY_CLIENT` (extension-wrapped)
  - 13 files inject `SystemPrismaService` (sms superuser, BYPASSRLS)
  - 5 guards/interceptors/middleware examined
  - 6 BullMQ processors examined
  - 5 `$queryRaw` / `$executeRaw` call sites examined

### Confirmed Broken (same bug pattern as OrgAdminGuard)

**1. apps/api/src/auth/guards/org-admin.guard.ts:70-76**
     Already documented above. `this.prisma.member.findFirst` on raw PrismaService
     without set_config → `!member` → 403 for every Org Admin. Controller mount:
     `UsersController @UseGuards(OrgAdminGuard)` — protects all
     `/api/organizations/:orgId/users*` routes.
     User-facing impact: Org Admins cannot create, list, invite, promote, or
     remove team members in their own org.

**2. apps/api/src/admin/admin-dashboard.service.ts — ENTIRE SERVICE**
     Injects raw `rawPrisma: PrismaService`. Mounted via
     `AdminDashboardController` under `@UseGuards(SuperAdminGuard)`.
     SuperAdminGuard.canActivate (super-admin.guard.ts:41) sets
     `cls.set('IS_SUPERUSER', 'true')`, but CLS signals only propagate to
     queries made through the TENANCY_CLIENT extension — `rawPrisma` is plain
     PrismaService, so NO set_config ever runs. Every query below hits
     `app_user` + FORCE RLS with no matching policy → zero rows / empty aggregates.

     RLS-enforced queries (line : table : method):
       - :59   Camera        .findMany         (getPlatformStats)
       - :139  Camera        .groupBy          (getOrgSummary)
       - :210  Camera        .count            (getRecordingsActive)
       - :263  Camera        .groupBy          (getPlatformIssues org-offline-rate check)
       - :324  RecordingSegment $queryRaw      (getStorageForecast time series)
       - :413  AuditLog      .findMany         (getRecentAuditHighlights)
       - :471  Camera        .groupBy          (getOrgHealthOverview)
       - :490  RecordingSegment .groupBy       (getOrgHealthOverview storage)
       - :502  ApiKey        .findMany         (getOrgHealthOverview bandwidth)

     User-facing impact (super-admin dashboard):
       - "Total Cameras", "Cameras Online/Offline", "Total Viewers" → 0
       - Recording-active count → 0
       - Platform issues "org-offline-rate" → never fires
       - Storage forecast chart → empty, no forecast
       - Recent audit highlights → empty
       - Org Health table → every row shows 0 cameras / 0 storage / 0 bandwidth
       - Super-admin sees a platform that looks empty even when it isn't.

     Note: `SrsNode.findMany` (:237), `Organization.findMany/count` (:55, :134,
     :258, :435, :459), `Package.aggregate` (:343), `User.findMany` (:429),
     `ApiKeyUsage.findMany` (:507) are NOT on RLS-enforced tables — those
     queries work. The service is PARTIALLY functional (anything that leans on
     Organization/SrsNode/Package is fine).

### Suspicious — Needs Closer Look

**S1. apps/api/src/cameras/cameras.service.ts:318 (bulkImport)**
     `this.prisma.$transaction(dto.cameras.map(cam => this.tenancy.camera.create(...)))`
     Mixes raw PrismaService's `$transaction` with tenancy-client-issued
     promises. Disambiguation: trace what `this.tenancy.camera.create` returns
     — the extension's `$allOperations` wraps each call in its own
     `prisma.$transaction(stmts)`, so each element is already a running
     transaction. Feeding those into an outer `$transaction([...])` either
     (a) throws at runtime because the elements aren't plain PrismaPromises,
     or (b) silently degrades to sequential execution without atomic-rollback
     semantics, or (c) the outer rawPrisma transaction ignores CLS entirely
     and writes fail because RLS denies the INSERT (the writes happen in
     rawPrisma's session, not a tenancy-extended one).
     What would disambiguate: run one bulkImport end-to-end as an Org Admin
     and observe whether `Camera` rows actually land. If this worked before
     76005c2, it may have worked by the same accident OrgAdminGuard did (old
     superuser_bypass matched when app.current_org_id was unset).

**S2. apps/api/src/prisma/seed.ts + seed-uat-users.ts**
     `new PrismaClient()` with no datasourceUrl override → inherits
     `DATABASE_URL` (`app_user`). `prisma.member.upsert` / `prisma.member.create`
     targets a FORCE-RLS table without CLS. If the seed is run with
     `DATABASE_URL` still pointing at `app_user`, these writes will silently
     fail (RLS WITH CHECK denies the INSERT). If it's run with DATABASE_URL
     swapped to the sms superuser URL for the seed run, it works.
     What would disambiguate: run `pnpm --filter @sms-platform/api seed` in
     the current dev env and check whether the super-admin member row appears
     in `Member`. If the seed currently works, some harness is swapping
     DATABASE_URL out-of-band. Either way, this is fragile and should be
     explicit (use SystemPrismaService pattern or read DATABASE_URL_MIGRATE).

**S3. apps/api/src/auth/permissions.ts (checkPermission)**
     Takes a `PrismaClient` argument and queries `UserPermissionOverride`
     (FORCE RLS). Nothing calls it today (Grep confirmed zero call-sites),
     so it's effectively dead code — but the API shape encourages a future
     caller to pass raw PrismaService and hit the same bug. Either delete it
     or change the signature to require TENANCY_CLIENT.

### Safe (explicitly verified)

Each entry verified by reading the file and confirming the table is
non-RLS, the client is `TENANCY_CLIENT` / `SystemPrismaService`, or the
raw call is wrapped in `$transaction(async tx => { $executeRaw set_config; … })`.

Raw PrismaService, only hits NON-RLS tables:
  - apps/api/src/packages/packages.service.ts — Package only
  - apps/api/src/organizations/organizations.service.ts — Organization only
  - apps/api/src/features/features.service.ts — Organization + Package only
  - apps/api/src/cluster/cluster.service.ts — SrsNode only
  - apps/api/src/cluster/cluster-health.service.ts — SrsNode only
  - apps/api/src/cluster/cluster.controller.ts:107 — SystemSettings;
    :119 — SrsNode (no RLS either)

Raw PrismaService queries RLS table but wraps in `$transaction` with inline
`set_config('app.is_superuser','true', TRUE)`:
  - apps/api/src/api-keys/api-keys.service.ts:108-111 (findByHash)
  - apps/api/src/api-keys/api-keys.service.ts:143-149 (updateLastUsed)
  - Note: :189 .apiKeyUsage.upsert and :220 .apiKeyUsage.findMany — ApiKeyUsage
    is NOT RLS-enforced, so these are SAFE even without set_config.

Raw PrismaService queries only Organization (non-RLS) inside otherwise
tenancy-clean services:
  - apps/api/src/cameras/cameras.service.ts:364, :383 (enforceMaxCamerasLimit*)
  - apps/api/src/recordings/recordings.service.ts:49, :275 (checkAndAlert/checkStorageQuota)

TENANCY_CLIENT (extension-wrapped, driven by AuthGuard/OrgAdminGuard/ApiKeyGuard
CLS signals — SAFE when any upstream guard sets ORG_ID or IS_SUPERUSER):
  - apps/api/src/users/users.service.ts
  - apps/api/src/cameras/cameras.service.ts (tenancy path)
  - apps/api/src/api-keys/api-keys.service.ts (tenancy path)
  - apps/api/src/notifications/notifications.service.ts (HTTP path)
  - apps/api/src/webhooks/webhooks.service.ts (HTTP path)
  - apps/api/src/audit/audit.service.ts
  - apps/api/src/dashboard/dashboard.service.ts
  - apps/api/src/account/plan-usage/plan-usage.service.ts
  - apps/api/src/account/plan-usage/plan-usage.controller.ts (Member guard)
  - apps/api/src/playback/playback.service.ts (HTTP path)
  - apps/api/src/policies/policies.service.ts
  - apps/api/src/admin/admin-audit-log.service.ts (explicit comment confirms
    SuperAdminGuard+TENANCY_CLIENT is the correct combo)
  - apps/api/src/settings/settings.service.ts (HTTP path)
  - apps/api/src/recordings/manifest.service.ts
  - apps/api/src/recordings/recordings.service.ts (tenancy path)
  - apps/api/src/streams/streams.service.ts
  - apps/api/src/streams/stream-profile.service.ts

SystemPrismaService (sms superuser, BYPASSRLS, intentional for worker/bootstrap):
  - apps/api/src/notifications/notifications.service.ts (worker path)
  - apps/api/src/webhooks/webhooks.service.ts (worker path)
  - apps/api/src/webhooks/webhook-delivery.processor.ts
  - apps/api/src/status/status.service.ts
  - apps/api/src/status/processors/notify-dispatch.processor.ts
  - apps/api/src/streams/processors/stream-probe.processor.ts
  - apps/api/src/recordings/retention.processor.ts
  - apps/api/src/recordings/schedule.processor.ts
  - apps/api/src/recordings/recordings.service.ts (worker path)
  - apps/api/src/resilience/camera-health.service.ts
  - apps/api/src/resilience/boot-recovery.service.ts
  - apps/api/src/resilience/srs-restart-detector.ts
  - apps/api/src/playback/playback.service.ts (SRS callback path)
  - apps/api/src/settings/settings.service.ts (boot path)

Guards / middleware / interceptors — no DB query OR uses correct client:
  - auth/guards/auth.guard.ts — no DB query (CLS-only)
  - auth/guards/super-admin.guard.ts — no DB query (CLS-only)
  - api-keys/api-key.guard.ts — delegates to ApiKeysService.findByHash which
    wraps in $transaction with set_config (SAFE)
  - api-keys/auth-or-apikey.guard.ts — delegates to ApiKeyGuard or AuthGuard
  - features/features.guard.ts — delegates to FeaturesService (Organization/
    Package only, non-RLS)
  - api-keys/api-key-usage.middleware.ts — delegates to
    ApiKeysService.recordUsage (Redis, no DB)
  - audit/audit.interceptor.ts — delegates to AuditService on TENANCY_CLIENT

### Recommended Unified Fix

Two sites are confirmed broken; two+ are suspicious. A single consistent
approach beats a patchwork of Options 1/2/3. Prefer **Option A** below; fall
back to Option B only if Option A requires DI changes that are out of scope
for the current branch.

**Option A — Make the raw guard query run through TENANCY_CLIENT (and
promote AdminDashboardService to TENANCY_CLIENT the same way).**

Rationale: TENANCY_CLIENT + CLS is already the project's declared pattern
(confirmed by the comment in apps/api/src/admin/admin-audit-log.service.ts:9-12,
which is the correct reference implementation). Every consumer of
TENANCY_CLIENT emits set_config in-transaction; every consumer of raw
PrismaService against RLS tables has broken at least once since 1bc7e51.

  1. **OrgAdminGuard**: before the guard can query Member, it must first
     know *which* CLS signal to set. The route's `:orgId` is already parsed
     at guard entry (line 51-55). Change the order:
       a. `cls.set('ORG_ID', orgId)` and (for super admin) `cls.set('IS_SUPERUSER','true')`
          BEFORE the findFirst.
       b. Swap `PrismaService` injection → `@Inject(TENANCY_CLIENT) prisma: any`.
       c. The existing findFirst code stays identical; the extension now
          emits set_config('app.current_org_id', orgId) per transaction, so
          `tenant_isolation_member` matches for Org Admins and the row is
          returned.
     Risk: guard now depends on the TenancyModule graph being bootstrapped
     before AuthModule. The existing `TenancyModule` is `@Global()` so this
     is already true.

  2. **AdminDashboardService**: rename `rawPrisma` → `prisma`, swap
     `private readonly rawPrisma: PrismaService` → `@Inject(TENANCY_CLIENT)
     private readonly prisma: any`. SuperAdminGuard already sets IS_SUPERUSER
     in CLS, so every query through the extension will emit
     set_config('app.is_superuser','true') and hit `superuser_bypass_*`
     policies. The single `$queryRaw` on RecordingSegment (line 324) has to
     be moved inside a `$transaction(async tx => { await tx.$executeRaw
     SELECT set_config('app.is_superuser','true', TRUE); return
     tx.$queryRaw`…`; })` — the extension does NOT cover $queryRaw.

  3. **CamerasService.bulkImport (S1)**: drop the outer
     `this.prisma.$transaction([...])` wrapper. Either loop sequentially
     through `this.tenancy.camera.create(...)` (each call is already its
     own transaction via the extension), or use
     `this.tenancy.$transaction(async tx => …)` with explicit per-row
     creates on `tx`. The current mixed pattern is fragile either way.

  4. **permissions.ts (S3)**: change the parameter type to the
     extension-wrapped client (`ReturnType<typeof createTenancyExtension>`)
     or delete the file (no callers).

  5. **seed.ts / seed-uat-users.ts (S2)**: construct PrismaClient with
     `datasourceUrl: process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL`
     — mirroring the SystemPrismaService pattern. Seeds run outside any
     request, so BYPASSRLS via the sms superuser is the correct choice.

  6. **Tests**: the existing `testPrisma` harness connects as sms superuser
     (tests/setup.ts:17, helpers/tenancy.ts:59-61). That is why the bug
     evaded unit tests in the first place. Add an integration-style harness
     that constructs a second PrismaClient bound to `DATABASE_URL` (app_user)
     and exercises OrgAdminGuard, AdminDashboardService, and
     CamerasService.bulkImport against it. Any future RLS regression will
     fail fast.

**Option B — Wrap every offending raw query in an inline
`$transaction(async tx => { $executeRaw set_config; await tx.{model}…; })`,
mirroring the existing ApiKeysService.findByHash / updateLastUsed pattern.**

Smaller blast radius (no DI changes) but introduces a new copy of the
same prologue in two+ files, and would still leave a sharp edge in
AdminDashboardService where *every* query needs the wrapper. Use only if
Option A's DI swap is blocked.

**Do NOT adopt**: a third approach that grants `app_user` rolbypassrls, or
that disables FORCE RLS on any of the listed tables. Both regress the
tenancy-isolation threat model 1bc7e51 was designed to close.

## Impact & Risk Analysis

Scope: evaluate the risk of applying Option A end-to-end. No code changed.
All citations below are verified against the current tree (HEAD = 1febe91).

### Behavior Changes (by user role)

| Role | Before fix | After fix | Risk |
|------|-----------|-----------|------|
| Org Admin (Member.role='admin', User.role='user') | 403 on EVERY OrgAdminGuard route (`POST/GET/PATCH/DELETE /api/organizations/:orgId/users*` — users.controller.ts:25-27). "Add Team Member" toast is the user-visible symptom; list/invite/promote/remove are equally broken. | 200 — guard's findFirst returns the real Member row via `tenant_isolation_member` (org-admin.guard.ts:70-76 now routed through TENANCY_CLIENT with CLS.ORG_ID already set before the query). | LOW. Restores intended behaviour. No new permissions granted — the Member row + role='admin' check is unchanged; only the RLS transport path changes. |
| Regular Member (operator/developer/viewer) | 403 (same guard, same findFirst — no row matches role='admin'). | 403 — findFirst still returns null because role filter still excludes them. | NONE. Deny path is table-filter-based, not RLS-based, so behaviour is identical. |
| Super Admin (User.role='admin') | 200 — guard's super-admin branch at org-admin.guard.ts:62-68 returns true WITHOUT hitting DB. No regression from the bug. | 200 — same code path, unchanged. | NONE. |
| Super Admin on /api/admin/* (SuperAdminGuard → AdminDashboardService) | Dashboard silently returns zeros for Cameras, Viewers, Recordings, Org Health table, Storage Forecast, Recent Audit, Platform Issues "org-offline-rate". Organization counts, SRS node list, Package totals still work. | Real numbers return. Platform Health/Org Health pages change from "looks empty" to populated. | MEDIUM — user-visible UI changes (zeros → real numbers). Anyone who has been demoing or screenshotting the Super Admin dashboard in the "zeros" state will see different data. Not a bug, but worth announcing. Confirmed scope: RLS queries at admin-dashboard.service.ts lines 59, 139, 210, 263, 324, 413, 471, 490, 502 (per audit). |
| API consumers via X-API-Key | No change — ApiKeyGuard path is already TENANCY_CLIENT-correct (audit confirms api-keys.service.ts findByHash/updateLastUsed wrap $transaction with set_config). | No change. | NONE. |
| Unauthenticated | 401 (guard throws UnauthorizedException before DB query). | 401 — unchanged. | NONE. |

### Test Fallout

**Will continue to pass but still provide false confidence (same pre-existing problem):**
- `apps/api/tests/users/org-admin-guard.test.ts:110-158` — constructs `new OrgAdminGuard(testPrisma as any, cls as any)`. testPrisma connects as the sms superuser (tests/setup.ts:17, DATABASE_URL in test env = sms role per globalSetup), which has rolbypassrls=true. After the fix, if the guard takes TENANCY_CLIENT, the test still passes `testPrisma` directly (the extension is never constructed in the unit test), and RLS is still bypassed at connection level. The tests will continue to pass green but will NOT exercise the new code path. This is Step 6 of Option A's rationale — the test harness itself is inadequate, not the tests themselves.
- `apps/api/tests/admin/admin-dashboard.test.ts:16-77` — fully mocks Prisma (`makeMockPrisma()` returns a plain vi.fn() object). The service constructor signature change from `rawPrisma: PrismaService` to `@Inject(TENANCY_CLIENT) prisma: any` is invisible to these tests because they inject `mockPrisma as any` positionally. ALL existing admin-dashboard tests continue to pass unchanged.
- `apps/api/tests/cameras/bulk-import.test.ts:22-28` — constructs CamerasService with `testPrisma as any, testPrisma as any` (same client for both TENANCY_CLIENT and PrismaService positions). After bulk-import refactor (Step 3), if the outer `this.prisma.$transaction([...])` is dropped in favour of sequential `this.tenancy.camera.create(...)` calls, the test at line 113-135 ("should bulk import cameras with status offline") still asserts `imported: 3` and finds rows via `testPrisma.camera.findMany` — unchanged.

**No tests are expected to FAIL from Option A**, because:
1. Every existing test that touches these services uses either testPrisma-as-superuser (RLS bypassed) or fully mocked Prisma. No test currently exercises app_user + FORCE RLS for OrgAdminGuard or AdminDashboardService.
2. This is exactly why the bug shipped undetected. The test suite is load-bearing in the wrong place.

**Tests that SHOULD be added (Step 6 of Option A; none exist today):**
- Integration test that constructs a second PrismaClient bound to the app_user DATABASE_URL and exercises OrgAdminGuard.canActivate end-to-end. It would have failed red before 1bc7e51 and would guard against future regressions.
- Parallel coverage for AdminDashboardService.getPlatformStats / getOrgHealthOverview / getStorageForecast on app_user.
- `apps/api/tests/tenancy/rls-isolation.test.ts` exists and does SET ROLE app_user inside transactions — adding guard-level coverage there would be the lowest-friction path.

### Runtime Regression Risks (per step)

**Step 1 — OrgAdminGuard (swap PrismaService → TENANCY_CLIENT, move cls.set before findFirst):**
- TENANCY_CLIENT is a singleton provider constructed once at bootstrap (tenancy.module.ts:11-18); it reads `cls.get('ORG_ID'/'IS_SUPERUSER')` on every `$allOperations` call. CLS itself is request-scoped: app.module.ts:33 uses `ClsModule.forRoot({ global: true, middleware: { mount: true } })`, which mounts the nestjs-cls Express middleware per request → each HTTP request runs inside its own AsyncLocalStorage context → guard's `cls.set('ORG_ID', orgId)` in request A cannot leak to request B. **No sibling-request leak risk.**
- `set_config(name, value, TRUE)` uses the is_local=TRUE argument (prisma-tenancy.extension.ts:24,29), which scopes the GUC to the *current transaction*. Since the extension wraps each query in its own `prisma.$transaction([set_config, query])`, the setting lifetime == one transaction == one query. **No cross-query leak inside the same Prisma pool connection.**
- DI graph: OrgAdminGuard is registered in `AuthModule`; to inject `TENANCY_CLIENT` (provided by `@Global() TenancyModule` — tenancy.module.ts:9), no explicit import is needed. Ordering: TenancyModule depends on PrismaService (via `inject: [PrismaService, ClsService]`), which is provided by PrismaModule (imported in AppModule). NestJS resolves globals at AppModule bootstrap, so by the time any request hits AuthGuard or OrgAdminGuard, TENANCY_CLIENT is already constructed. **No bootstrap-order risk.**
- Query semantics: the underlying findFirst SQL is identical. The only change is that it now runs inside an extension-emitted transaction with set_config prologue. No new joins, no added WHERE clauses. **Zero risk of "breaks something currently working"** — the only thing currently working for this code path is the super-admin branch, which doesn't touch the DB.

**Step 2 — AdminDashboardService (swap rawPrisma → TENANCY_CLIENT, wrap $queryRaw manually):**
- Extension coverage: `createTenancyExtension` only wraps `query.$allModels.$allOperations` (prisma-tenancy.extension.ts:7-10). `$queryRaw` and `$executeRaw` are NOT intercepted — VERIFIED. So the single `$queryRaw` at admin-dashboard.service.ts:324 must be wrapped manually: `this.prisma.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('app.is_superuser', 'true', TRUE)`; return tx.$queryRaw\`…\`; })`. Missing this wrap = getStorageForecast silently returns `[]` forever (same bug class as today).
- `$transaction` around a read-only aggregate: the additional transaction changes nothing about isolation because (a) it's a single statement after set_config, and (b) PostgreSQL default is READ COMMITTED and a read-only single-query transaction at READ COMMITTED sees the same snapshot it would have seen auto-committed. **No isolation regression.** Only observable difference: one extra round-trip per forecast call (negligible, forecasts are not hot-path).
- SuperAdminGuard already sets `IS_SUPERUSER=true` (super-admin.guard.ts:41). Once AdminDashboardService uses TENANCY_CLIENT, every model call hits `superuser_bypass_*` policies and returns rows platform-wide. **Intended behaviour.** Risk: if some query in AdminDashboardService was deliberately relying on the "zero rows" defect as a feature (e.g. to hide something), it will now return real data. No such case found in the audit.
- No new filters are injected by the extension; it only calls `set_config`. Queries on non-RLS tables (Organization, SrsNode, Package, User, ApiKeyUsage) are unaffected.

**Step 3 — CamerasService.bulkImport (drop outer $transaction, use sequential tenancy.camera.create):**
- Semantic change: loses all-or-nothing atomicity. Current code passes `this.prisma.$transaction(promiseArray)` which, per Prisma docs, is a "sequential array transaction" — all creates roll back if any single one fails. After the fix, sequential `await this.tenancy.camera.create(...)` in a loop means camera N+1 creation does NOT roll back cameras 1..N if it fails.
- Severity: the current mixed form is almost certainly broken already (audit S1 lists three failure modes: throws, silent downgrade, or RLS denies the INSERT). So the "atomicity" being lost was probably never actually enforced. But this should be CALLED OUT to the user because the route documentation (if any) may imply atomicity.
- Alternative to preserve atomicity: `this.tenancy.$transaction(async tx => { for (const cam of dto.cameras) await tx.camera.create(...); })`. This restores atomicity AND emits set_config once. The audit suggests either sequential-no-atomicity or tenancy-$transaction; the second is safer and should be the recommended form.
- Test impact: `bulk-import.test.ts:113-135` does not test partial-failure atomicity, only happy path and limit enforcement. So tests won't reveal the semantic change. A dedicated "rollback on mid-loop failure" test should be added alongside the fix if atomicity matters.

**Step 4 — permissions.ts (change signature or delete):**
- Audit confirmed ZERO callers (Grep across apps/api). Deletion has no runtime impact.
- If kept and signature changed to require TENANCY_CLIENT, still no runtime impact because no caller exists to break. Risk is purely code-smell / future-caller-foot-gun. LOWEST risk step.

**Step 5 — seed.ts / seed-uat-users.ts (datasourceUrl override):**
- Risk depends on whether seeds CURRENTLY work in dev. Two scenarios per audit S2:
  (a) Seeds currently fail silently on Member writes — fix is strictly additive.
  (b) Some out-of-band harness (Makefile, package.json script, Docker entrypoint) swaps DATABASE_URL to the sms URL for seed runs — fix formalises that swap and the behaviour is identical.
- Either way, moving to explicit `datasourceUrl: process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL` makes the seed self-documenting and removes dependency on out-of-band env munging.
- Dev/test only — no production impact. Cannot regress live users because production doesn't run seeds.

**Step 6 — integration test harness (second PrismaClient on app_user):**
- Pure addition. New file, new beforeAll/afterAll. Does not modify existing tests.
- Risk: if the harness hits connection limits (Postgres default `max_connections = 100`, plus app_user pool + sms pool + new app_user pool), CI could flake. Mitigate with explicit `$disconnect()` in afterAll and connection_limit=5 on the URL.
- Will likely reveal at least one additional bug the current audit didn't enumerate, because it exercises a real code path nobody has tested before. This is a feature, not a risk — but the first run may require follow-up fixes before it's green.

### Deployment / Migration

- **No schema changes.** Audit is explicit: "Both regress the tenancy-isolation threat model 1bc7e51 was designed to close" — we're staying within the existing RLS policies. No Prisma migrate / no migration.sql touched.
- **No session re-auth needed.** Better Auth sessions are cookie-based and carry `session.user` only. The fix changes server-side DB access path, not session shape. A user logged in before the deploy will be unblocked on their very next request.
- **Rollback plan:** revert the Option A commits. Because no schema change, revert = instant, no data recovery needed. The only caveat: if Step 3 changed bulk-import atomicity semantics, a revert restores the old (also-broken) behaviour; a forward fix is safer than rollback for that specific endpoint.
- **No feature flag needed.** The fix is behavioural-correctness restoration, not a gated capability. Shipping behind a flag would leave Org Admins blocked for flag-disabled users.

### Can Steps Ship Independently?

Dependency graph:

```
Step 1 (OrgAdminGuard)             ── ships alone. Unblocks team-member management. HIGH priority.
Step 2 (AdminDashboardService)     ── ships alone. Unblocks super-admin dashboard correctness. MEDIUM priority.
Step 3 (CamerasService.bulkImport) ── ships alone. Only affects bulk-import endpoint. LOW urgency (suspect-only, not confirmed broken).
Step 4 (permissions.ts)            ── ships alone or with Step 1. Dead code — can delete in a follow-up cleanup commit.
Step 5 (seed scripts)              ── ships alone. Dev/test only. Can be on its own branch, zero coupling to runtime.
Step 6 (integration test harness)  ── SHOULD ship BEFORE Steps 1-3, to provide a red → green verification signal. If shipped after, Steps 1-3 remain untested against the real RLS posture.
```

**Minimum viable ship = Step 1 alone.** It resolves the user-facing symptom (cannot add team member). Everything else is incremental hardening.

**Recommended sequence:**
1. Step 6 first (establish failing tests on main).
2. Step 1 (turn Org Admin tests green).
3. Step 2 (turn admin-dashboard tests green). Ship as a separate commit for clean revert surface.
4. Step 3, then Step 4, then Step 5 as independent cleanup PRs.

No step depends on another landing first from a correctness standpoint (Step 6 is strictly preferred-first, not blocking).

### Observability

**Pre-merge:**
- Grep for remaining raw-PrismaService queries on RLS tables: the audit already enumerated these. Add a lint/grep check to CI that fails if any new `this.prisma.{member,invitation,camera,project,site,streamProfile,playbackSession,policy,apiKey,webhookSubscription,orgSettings,recording,recordingSegment,recordingSchedule,auditLog,notification,notificationPreference,userPermissionOverride}.` appears without TENANCY_CLIENT or explicit `$transaction` wrap.

**Post-merge canary signals:**
- Watch server logs for `ForbiddenException: Org admin access required` frequency. Pre-fix: high (every Org Admin team-member action). Post-fix: should drop to near-zero (only genuine non-admin attempts).
- Watch for new error classes: if the extension's `$transaction([set_config, query])` fails (e.g. pool exhaustion under load because every query now runs in a transaction), it would surface as `PrismaClientKnownRequestError` with transaction-related codes. Current codebase already uses this pattern for all TENANCY_CLIENT consumers, so the throughput characteristic is already known in production.
- Watch Platform Health dashboard numbers: `totalCameras`, `camerasOnline`, `storageForecast.points.length`, `orgHealth[].camerasUsed`. Pre-fix all show 0. Post-fix should match `SELECT COUNT(*) FROM "Camera"` run as sms superuser (sanity query).
- Postgres logs at `log_min_duration_statement` will show extra `set_config` statements — expected, not a regression. If log volume doubles, consider raising that threshold.

**Alerting:**
- If a `ForbiddenException` spike is observed on `/api/organizations/:orgId/*` post-deploy, it means the fix went wrong somewhere — e.g. CLS.ORG_ID not being set before the findFirst (Step 1a ordering). That would be the canary for a bad deploy.

### Explicit "Safe to Ignore" from the Suspicious list

Re-evaluating S1-S3 now that we have the risk picture:

- **S1 (bulkImport outer $transaction):** NOT safe to ignore — but de-prioritised. The current code is almost certainly broken in prod for Org Admin bulk imports (same failure mode as the original bug). If nobody has reported it, either (a) bulk import is rarely used, or (b) it's being called by super admins whose IS_SUPERUSER flag lets the RLS pass on the tenancy.camera.create path but fails on the rawPrisma $transaction wrapper. Worth fixing, but can follow Step 1 by a day rather than shipping simultaneously.
- **S2 (seed scripts):** SAFE TO IGNORE for production. Affects dev/test only. Fix when convenient; does not block user-facing work. One caveat: if CI uses the seed to bootstrap a clean DB before tests, and the seed has been silently producing an incomplete Member table, some tests may have been testing against malformed fixtures. Worth a manual check of the seed output in dev, but not blocking.
- **S3 (permissions.ts):** SAFE TO IGNORE — zero callers, pure dead code. Delete in a cleanup PR or leave indefinitely; neither affects users.

Nothing else in the Suspicious list. Every entry in the Safe list of the audit has been re-verified by reading the underlying files; they remain safe.

### Bottom Line

Option A is **safe to apply** with very low blast radius. The only confirmed user-visible change for non-super-admin users is "broken → works" (Org Admin can manage team members). For super admins, dashboard metrics change from "all zeros" to "real numbers" — a correctness win but a visible UI delta worth announcing. No schema migration, no session invalidation, trivial rollback.

The one thing to know before saying "go": **the existing test suite cannot verify the fix is correct.** Every test that touches the affected guards/services uses either the sms superuser (bypasses RLS) or a fully-mocked Prisma. So all six steps can be landed and every existing test will stay green whether the fix works or not. Ship Step 6 (integration harness on app_user) FIRST so Steps 1-3 have a red-then-green verification trail; otherwise you're shipping a behavioural fix on trust. If Step 6 is out of scope for this branch, at minimum do a manual end-to-end smoke test as a non-admin Org Admin against a real dev DB before merging — the unit tests alone are not proof.

## Post-Fix Followup

Second investigation opened 2026-04-22T13:00Z after user reported the same toast
("You do not have permission to add team members.") persisting in the browser
after the fix commits 749cbb6/e0a4c8e/a677253/41b79df/a1e8348 landed. Goal:
find_and_fix.

### Root cause of the post-fix failure

**Operator-level staleness, not a code bug.** The dev backend the browser is
hitting at `http://localhost:3003` is a long-running Node process that was
started from the `dist/` build produced *before* the fix commits landed, and
it is not running in watch mode. The fix files were recompiled on disk by a
subsequent build but the Node process never reloaded them — Node does not
hot-swap `require`d modules from the filesystem on its own.

Exact timeline (UTC+07, from `ps`, `lsof`, `stat`, `date`):

| When                  | What                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| 2026-04-21 15:06:35   | Node process PID 37991 started: `node --enable-source-maps .../apps/api/dist/main` |
| 2026-04-21 15:06:54   | `dist/main.js` mtime — the build the running process loaded          |
| 2026-04-22 ~10:14     | Fix commits landed on `main` (e0a4c8e, a677253, 41b79df)             |
| 2026-04-22 10:19:44   | `dist/auth/guards/org-admin.guard.js` rebuilt (now contains `TENANCY_CLIENT` injection — confirmed by grep line 92) |
| 2026-04-22 10:22:56   | `dist/admin/admin-dashboard.service.js` rebuilt                      |
| 2026-04-22 13:05:45   | User reports post-fix UAT failure. PID 37991 has run continuously for 21h58m, still serving the Apr 21 in-memory code |

The running process is `node dist/main` (i.e. the production-style
`start:prod` script, `apps/api/package.json:12`), not `nest start --watch`
(`start:dev`, line 10). No tsx-watch / nest-watch for this app is present in
`ps` (the watchers visible belong to the unrelated
`/Users/suraboonsung/Documents/Programming/sms-app/apps/api-control/` project).
So disk rebuilds have no effect on the running server.

### Evidence

- timestamp: 2026-04-22T13:00Z
  checked: Identity of process on port 3003
  found: `lsof -i :3003 -sTCP:LISTEN` → PID 37991. `ps -p 37991 -o lstart=` → `Tue Apr 21 15:06:35 2026`. `ps -p 37991 -o command=` → `node --enable-source-maps /Users/suraboonsung/Documents/Programming/DMASS/gsd/sms-app/apps/api/dist/main`. `lsof -p 37991 | grep cwd` → cwd is the correct sms-app api directory.
  implication: The browser IS hitting this project's API (not a different port / different project), and this process loaded its code at 15:06 on Apr 21 — before any fix commit landed.

- timestamp: 2026-04-22T13:00Z
  checked: Whether the dist on disk contains the fix
  found: `stat` `dist/auth/guards/org-admin.guard.js` mtime = Apr 22 10:19:44. `grep -n TENANCY_CLIENT dist/auth/guards/org-admin.guard.js` → `92: _ts_param(0, (0, _common.Inject)(_prismatenancyextension.TENANCY_CLIENT))`. The compiled JavaScript on disk IS the fixed version with the TENANCY_CLIENT injection.
  implication: If this dist file were actually loaded by the running process, the guard would work. The process holds its own in-memory copy from the Apr 21 build.

- timestamp: 2026-04-22T13:00Z
  checked: Whether any watch mode is wired for this project's API
  found: `ps -ax | grep -E "(nest|tsx.*api)"` shows several tsx watchers, but all point at `/Users/suraboonsung/Documents/Programming/sms-app/apps/api-control/` (different project). None targets the DMASS/gsd/sms-app/apps/api directory.
  implication: There is no reloader. The process will keep running pre-fix code until it is killed and restarted.

- timestamp: 2026-04-22T13:00Z
  checked: HTTP reachability and error shape
  found: `curl -X POST http://localhost:3003/api/organizations/<id>/users -H 'Content-Type: application/json' -d '{...}'` (no cookie) → `status=401`, body `{"message":"Not authenticated","error":"Unauthorized","statusCode":401}`.
  implication: Confirms port 3003 IS the sms-app API (route exists, unauthenticated path fires correctly). With a valid Org Admin cookie, the pre-fix in-memory guard would then return 403 via the broken raw-PrismaService path described in the original root cause.

- timestamp: 2026-04-22T13:00Z
  checked: Frontend toast source (re-verified)
  found: `grep "You do not have permission to add team members"` in `apps/web/src/` → exactly one source-file hit: `apps/web/src/app/app/team/components/add-team-member-dialog.tsx:111`, inside the `if (res.status === 403)` branch (line 110). Additional hits are all `.next/` build artifacts compiled from the same source.
  implication: No client-side pre-flight gate exists. The toast only fires when the backend returns 403. This re-confirms the Eliminated entry from the first investigation.

- timestamp: 2026-04-22T13:00Z
  checked: Committed guard source shape
  found: `apps/api/src/auth/guards/org-admin.guard.ts` — constructor injects `@Inject(TENANCY_CLIENT)` at line 40; `cls.set('ORG_ID', orgId)` at line 88; `this.prisma.member.findFirst` at line 90. Sequencing is correct: CLS is populated BEFORE the query, so the tenancy extension emits `set_config('app.current_org_id', orgId, TRUE)` inside the same transaction as the findFirst, and `tenant_isolation_member` matches. Super-admin branch at 74-80 sets IS_SUPERUSER + ORG_ID before returning, so any later TENANCY_CLIENT call fired by the controller/service is also RLS-authorized.
  implication: The code fix is structurally correct. Nothing to change in source.

### Hypotheses eliminated this round

- hypothesis: Real bug in the committed guard code (ordering, DI, extension wiring)
  evidence: Source inspection at org-admin.guard.ts:39-96 shows the correct
    shape; the compiled dist at the same path (mtime Apr 22 10:19:44) also
    contains `_common.Inject(_prismatenancyextension.TENANCY_CLIENT)` at line
    92. Integration test in apps/api/tests/users/org-admin-guard.app-user.test.ts
    (which exercises the real app_user + FORCE RLS path) is green after the fix.
  timestamp: 2026-04-22

- hypothesis: Frontend pre-flight permission gate fires before HTTP
  evidence: Single source-file hit for the toast string, gated exclusively on
    `res.status === 403`. No client-side role check, cached ability map, or
    session-based gate exists in the dialog or its parents.
  timestamp: 2026-04-22

- hypothesis: Wrong 403 source (CASL / ability check / validation masquerading)
  evidence: UsersController has exactly one guard `@UseGuards(OrgAdminGuard)`
    at line 25. No CASL / ability layer exists in the codebase. The handler
    (`createUser`, line 61-71) only runs after the guard — and only throws
    BadRequest (zod) or whatever UsersService raises. UsersService throws
    BadRequestException/NotFoundException/ForbiddenException but the
    Forbidden paths are deeper (e.g. "Cannot remove the last admin") and
    don't apply to the create path.
  timestamp: 2026-04-22

- hypothesis: Session role mismatch (caller not actually Org Admin)
  evidence: Even if the caller had Member.role='admin' in Test Org, the
    pre-fix in-memory code still returns 403 via the raw-PrismaService query
    with no set_config. So the symptom is explained without needing a
    role-mismatch explanation. And the fix is validated for both the Org
    Admin (tenant_isolation) and Super Admin (superuser_bypass) paths by the
    integration test suite.
  timestamp: 2026-04-22

### Resolution (post-fix followup)

root_cause_post_fix: |
  The long-running Node process serving port 3003 was started on 2026-04-21
  at 15:06:35 from a pre-fix `dist/` build and is not in watch mode
  (`node dist/main`, the `start:prod` script, not `start:dev`). The fix
  commits rebuilt the `dist/` files on Apr 22 10:19-10:22, but the process
  never reloaded them. The code on disk is correct; the code in memory is
  22 hours old.

fix_post_fix: |
  No source change required. Operator action: kill PID 37991 and start
  the API fresh. Recommended commands (either works; option A is strictly
  sufficient for the UAT, option B also hot-reloads future code changes):

    # Option A — minimal restart of the production-style server:
    kill 37991
    pnpm --filter @sms-platform/api build   # rebuild dist to be safe
    pnpm --filter @sms-platform/api start:prod
    # (or: node apps/api/dist/main, matching the pre-existing command)

    # Option B — switch to watch mode so future fixes don't need a manual restart:
    kill 37991
    pnpm --filter @sms-platform/api start:dev

  After restart, repeat the user's original UAT:
    1. Sign in as Org Admin in Test Org
    2. /app/team → Add Team Member → fill valid form → Create user
    3. Expected: toast "User created. They can sign in now." (success path
       at add-team-member-dialog.tsx:123). A Member row is written; the
       team table refreshes.

verification_post_fix: |
  Not runnable autonomously — requires killing the user's running server
  process and re-clicking the dialog. Routed to the user with a precise
  repro. The structural verification (psql Smokes 1-3 in SUMMARY.md and the
  integration test at apps/api/tests/users/org-admin-guard.app-user.test.ts)
  already proves the fix works against app_user + FORCE RLS; the only
  remaining unknown is whether the browser's HTTP hop actually lands on a
  process that has loaded the new code.

files_changed_post_fix: []  # no code changes

### Why this was not caught in verification

VERIFICATION.md explicitly flagged this: "Smoke 5 (Org Admin HTTP routes) —
NOT RUN" with the reason "The running dev server on port 3003 was a stale
dist build. Starting a fresh `pnpm start:dev` would need interactive
coordination outside the autonomous scope." The verifier correctly routed
the test to human UAT with `status: human_needed`. The human UAT then
failed because the user didn't restart the server before re-testing — a
fair assumption from the user's side (the fix landed, so the running app
should reflect it), but the verifier's note already warned the server was
stale.

### Preventive recommendations (not applied — out of scope)

1. **Watch-mode default for local dev.** Documenting in project README
   (or CLAUDE.md) that `pnpm --filter @sms-platform/api start:dev` is the
   correct local command, and `start:prod` should only be used when
   deliberately testing production behaviour. Would reduce the chance of
   a developer starting `start:prod` once and forgetting about it for a
   day.

2. **Server-side version/hash echo.** Add a response header (e.g.
   `X-Server-Version: <git-sha>`) that the Nest main.ts reads from
   `process.env.GIT_SHA` (injected at build time). The verifier script
   could then `curl -I /health` and compare the SHA against `git HEAD` to
   instantly detect a stale process before any UAT runs. This would turn
   the exact failure mode seen here into a one-second check.

3. **UAT runbook: "restart API first".** Add a standard preamble to any
   human-verification checklist that instructs the tester to kill/restart
   the local API before clicking. A simple bullet in the VERIFICATION.md
   template would cover it.

None of these are bug fixes; they are future-failure-prevention hygiene.
The original RLS fix (commits 749cbb6..a1e8348) is correct and complete
in source and in the dist on disk; nothing about the debugged pattern
needs revision.
