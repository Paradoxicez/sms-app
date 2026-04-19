-- ─────────────────────────────────────────────────────────────
-- RLS Infrastructure Setup
-- Phase 1: Creates roles and grants. RLS policies will be
-- added per-table as tenant-scoped tables are created in
-- future phases.
-- ─────────────────────────────────────────────────────────────

-- Create application user role (non-superuser, RLS enforced)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'sms_app_user_password';
  END IF;
END
$$;

-- Grant schema access to app_user
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

-- Grant sequence access (needed for auto-increment/serial columns)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- ─────────────────────────────────────────────────────────────
-- RLS Policies on Tenant-Scoped Tables
-- ─────────────────────────────────────────────────────────────
--
-- The Package table is NOT org-scoped (super admin manages globally),
-- so no RLS policy is needed on Package.
--
-- The Organization table itself has no RLS -- super admin needs to
-- list all orgs. Organization isolation happens via the Member table
-- (users can only see orgs they're members of).
--
-- The set_config('app.current_org_id', ..., TRUE) call is made via
-- Prisma Client Extension in prisma-tenancy.extension.ts.
-- ─────────────────────────────────────────────────────────────

-- Enable + Force RLS on tenant-scoped tables
ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Member" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "UserPermissionOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserPermissionOverride" FORCE ROW LEVEL SECURITY;

-- Tenant isolation policies (filter rows by app.current_org_id)
CREATE POLICY tenant_isolation_member ON "Member"
  USING ("organizationId" = current_setting('app.current_org_id', true)::text)
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true)::text);

CREATE POLICY tenant_isolation_invitation ON "Invitation"
  USING ("organizationId" = current_setting('app.current_org_id', true)::text)
  WITH CHECK ("organizationId" = current_setting('app.current_org_id', true)::text);

CREATE POLICY tenant_isolation_permission_override ON "UserPermissionOverride"
  USING ("orgId" = current_setting('app.current_org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);

-- Superuser bypass: positive-signal only. Allow access when the caller has
-- explicitly flagged themselves via set_config('app.is_superuser', 'true', TRUE).
-- AuthGuard sets this flag in CLS when session.user.role === 'admin'. Any
-- authenticated user without this flag (and without an active org) sees 0 rows.
CREATE POLICY superuser_bypass_member ON "Member"
  USING (current_setting('app.is_superuser', true) = 'true');

CREATE POLICY superuser_bypass_invitation ON "Invitation"
  USING (current_setting('app.is_superuser', true) = 'true');

CREATE POLICY superuser_bypass_permission_override ON "UserPermissionOverride"
  USING (current_setting('app.is_superuser', true) = 'true');

-- ─────────────────────────────────────────────────────────────
-- Phase 5: Dashboard & Monitoring RLS Policies
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_log_org_isolation ON "AuditLog"
  USING ("orgId" = current_setting('app.current_org_id', true))
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true));

CREATE POLICY superuser_bypass_audit_log ON "AuditLog"
  USING (current_setting('app.is_superuser', true) = 'true');

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_org_isolation ON "Notification"
  USING ("orgId" = current_setting('app.current_org_id', true))
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true));

CREATE POLICY superuser_bypass_notification ON "Notification"
  USING (current_setting('app.is_superuser', true) = 'true');

ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_pref_org_isolation ON "NotificationPreference"
  USING ("orgId" = current_setting('app.current_org_id', true))
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true));

CREATE POLICY superuser_bypass_notification_pref ON "NotificationPreference"
  USING (current_setting('app.is_superuser', true) = 'true');
