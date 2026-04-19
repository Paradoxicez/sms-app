-- ─────────────────────────────────────────────────────────────
-- Apply ALL RLS policies for tenant-scoped tables
-- This migration consolidates all RLS policies that were
-- previously split across multiple migration files but were
-- not applied to the database.
-- ─────────────────────────────────────────────────────────────

-- Phase 2 tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_camera') THEN
    ALTER TABLE "Camera" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Camera" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_camera ON "Camera"
      USING ("orgId" = current_setting('app.current_org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_camera ON "Camera"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_project') THEN
    ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_project ON "Project"
      USING ("orgId" = current_setting('app.current_org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_project ON "Project"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_site') THEN
    ALTER TABLE "Site" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Site" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_site ON "Site"
      USING ("orgId" = current_setting('app.current_org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_site ON "Site"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_streamprofile') THEN
    ALTER TABLE "StreamProfile" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "StreamProfile" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_streamprofile ON "StreamProfile"
      USING ("orgId" = current_setting('app.current_org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_streamprofile ON "StreamProfile"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_playbacksession') THEN
    ALTER TABLE "PlaybackSession" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "PlaybackSession" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_playbacksession ON "PlaybackSession"
      USING ("orgId" = current_setting('app.current_org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_playbacksession ON "PlaybackSession"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_policy') THEN
    ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Policy" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_policy ON "Policy"
      USING ("orgId" = current_setting('app.current_org_id', true)::text OR "orgId" IS NULL)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_policy ON "Policy"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;

-- New tables (Phase 3+)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_apikey') THEN
    ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "ApiKey" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_apikey ON "ApiKey"
      USING ("orgId" = current_setting('app.current_org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_apikey ON "ApiKey"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_webhook') THEN
    ALTER TABLE "WebhookSubscription" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "WebhookSubscription" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_webhook ON "WebhookSubscription"
      USING ("orgId" = current_setting('app.current_org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_webhook ON "WebhookSubscription"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_orgsettings') THEN
    ALTER TABLE "OrgSettings" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "OrgSettings" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_orgsettings ON "OrgSettings"
      USING ("orgId" = current_setting('app.current_org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_orgsettings ON "OrgSettings"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_recording') THEN
    ALTER TABLE "Recording" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Recording" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_recording ON "Recording"
      USING ("orgId" = current_setting('app.current_org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_recording ON "Recording"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_recordingsegment') THEN
    ALTER TABLE "RecordingSegment" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "RecordingSegment" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_recordingsegment ON "RecordingSegment"
      USING ("orgId" = current_setting('app.current_org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_recordingsegment ON "RecordingSegment"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_recordingschedule') THEN
    ALTER TABLE "RecordingSchedule" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "RecordingSchedule" FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_recordingschedule ON "RecordingSchedule"
      USING ("orgId" = current_setting('app.current_org_id', true)::text)
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true)::text);
    CREATE POLICY superuser_bypass_recordingschedule ON "RecordingSchedule"
      USING (current_setting('app.is_superuser', true) = 'true');
  END IF;
END $$;
