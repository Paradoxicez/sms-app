-- Phase 5: Dashboard & Monitoring RLS Policies

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audit_log_org_isolation') THEN
    CREATE POLICY audit_log_org_isolation ON "AuditLog"
      USING ("orgId" = current_setting('app.current_org_id', true))
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'superuser_bypass_audit_log') THEN
    CREATE POLICY superuser_bypass_audit_log ON "AuditLog"
      USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');
  END IF;
END $$;

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notification_org_isolation') THEN
    CREATE POLICY notification_org_isolation ON "Notification"
      USING ("orgId" = current_setting('app.current_org_id', true))
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'superuser_bypass_notification') THEN
    CREATE POLICY superuser_bypass_notification ON "Notification"
      USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');
  END IF;
END $$;

ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notification_pref_org_isolation') THEN
    CREATE POLICY notification_pref_org_isolation ON "NotificationPreference"
      USING ("orgId" = current_setting('app.current_org_id', true))
      WITH CHECK ("orgId" = current_setting('app.current_org_id', true));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'superuser_bypass_notification_pref') THEN
    CREATE POLICY superuser_bypass_notification_pref ON "NotificationPreference"
      USING (current_setting('app.current_org_id', true) IS NULL OR current_setting('app.current_org_id', true) = '');
  END IF;
END $$;
