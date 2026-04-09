-- ─────────────────────────────────────────────────────────────
-- RLS Policies for Tenant-Scoped Tables
-- Phase 01 Plan 05: Gap closure for SC-3 (tenant isolation)
-- ─────────────────────────────────────────────────────────────

-- Enable RLS on tenant-scoped tables
ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserPermissionOverride" ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (important: Prisma connects as owner)
ALTER TABLE "Member" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "UserPermissionOverride" FORCE ROW LEVEL SECURITY;

-- Policy for Member table (uses "organizationId" column)
CREATE POLICY tenant_isolation_member ON "Member"
  USING ("organizationId" = current_setting('app.current_org_id', true)::text)
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true)::text);

-- Policy for Invitation table (uses "organizationId" column)
CREATE POLICY tenant_isolation_invitation ON "Invitation"
  USING ("organizationId" = current_setting('app.current_org_id', true)::text)
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true)::text);

-- Policy for UserPermissionOverride table (uses "orgId" column)
CREATE POLICY tenant_isolation_permission_override ON "UserPermissionOverride"
  USING ("orgId" = current_setting('app.current_org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);

-- Superuser/migration bypass: allow unrestricted access when app.current_org_id is not set
-- The second parameter `true` in current_setting() returns NULL instead of error when not set.
-- When NULL, the USING clause evaluates to NULL (falsy), so we need a bypass policy.
CREATE POLICY superuser_bypass_member ON "Member"
  USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');

CREATE POLICY superuser_bypass_invitation ON "Invitation"
  USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');

CREATE POLICY superuser_bypass_permission_override ON "UserPermissionOverride"
  USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');
