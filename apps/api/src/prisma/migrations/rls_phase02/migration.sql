-- RLS Policies for Phase 02 Tenant-Scoped Tables

-- Enable RLS on tenant-scoped tables
ALTER TABLE "Camera" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Site" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StreamProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaybackSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (important: Prisma connects as owner)
ALTER TABLE "Camera" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Site" FORCE ROW LEVEL SECURITY;
ALTER TABLE "StreamProfile" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PlaybackSession" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Policy" FORCE ROW LEVEL SECURITY;

-- Policy for Camera table (uses "orgId" column)
CREATE POLICY tenant_isolation_camera ON "Camera"
  USING ("orgId" = current_setting('app.current_org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);

-- Policy for Project table (uses "orgId" column)
CREATE POLICY tenant_isolation_project ON "Project"
  USING ("orgId" = current_setting('app.current_org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);

-- Policy for Site table (uses "orgId" column)
CREATE POLICY tenant_isolation_site ON "Site"
  USING ("orgId" = current_setting('app.current_org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);

-- Policy for StreamProfile table (uses "orgId" column)
CREATE POLICY tenant_isolation_streamprofile ON "StreamProfile"
  USING ("orgId" = current_setting('app.current_org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);

-- Policy for PlaybackSession table (uses "orgId" column)
CREATE POLICY tenant_isolation_playbacksession ON "PlaybackSession"
  USING ("orgId" = current_setting('app.current_org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);

-- Policy for Policy table (uses nullable "orgId" column)
-- SYSTEM-level policies (orgId IS NULL) must remain visible to all orgs
CREATE POLICY tenant_isolation_policy ON "Policy"
  USING ("orgId" = current_setting('app.current_org_id', true)::text OR "orgId" IS NULL)
  WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);

-- Superuser/migration bypass: allow unrestricted access when app.current_org_id is not set
CREATE POLICY superuser_bypass_camera ON "Camera"
  USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');

CREATE POLICY superuser_bypass_project ON "Project"
  USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');

CREATE POLICY superuser_bypass_site ON "Site"
  USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');

CREATE POLICY superuser_bypass_streamprofile ON "StreamProfile"
  USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');

CREATE POLICY superuser_bypass_playbacksession ON "PlaybackSession"
  USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');

CREATE POLICY superuser_bypass_policy ON "Policy"
  USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');
