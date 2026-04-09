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
-- RLS Policy Notes
-- ─────────────────────────────────────────────────────────────
--
-- The Package table is NOT org-scoped (super admin manages globally),
-- so no RLS policy is needed on Package.
--
-- RLS policies will be added per-table as tenant-scoped tables are
-- created in future phases. Phase 1 establishes the infrastructure:
--   - app_user role (RLS-enforced)
--   - Schema grants
--
-- Pattern for future phases:
--   ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation_<table> ON <table_name>
--     USING (org_id = current_setting('app.current_org_id')::uuid)
--     WITH CHECK (org_id = current_setting('app.current_org_id')::uuid);
--
-- The set_config('app.current_org_id', ..., TRUE) call is made via
-- Prisma Client Extension in prisma-tenancy.extension.ts (Phase 1 Plan 3).
-- ─────────────────────────────────────────────────────────────
