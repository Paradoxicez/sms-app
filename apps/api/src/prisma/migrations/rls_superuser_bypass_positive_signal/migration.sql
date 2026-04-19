-- ─────────────────────────────────────────────────────────────
-- Gap 15.1 fix — Close tenancy RLS bypass with positive-signal
-- superuser flag. The previous superuser_bypass_* policies
-- matched when app.current_org_id was unset (NULL/empty) — any
-- authenticated user whose session had no activeOrganizationId
-- would bypass tenant isolation.
--
-- New contract: bypass ONLY when current_setting('app.is_superuser', true) = 'true'.
-- AuthGuard sets this flag in CLS (derived from session.user.role === 'admin'),
-- the Prisma tenancy extension calls set_config('app.is_superuser', 'true', TRUE)
-- per transaction. All other callers see zero rows by default.
--
-- Each table pair is wrapped in DO $$ ... END $$ blocks that
-- drop the old policy (old USING expression) and create the new
-- one. Idempotent: uses DROP POLICY IF EXISTS so it can re-run.
-- ─────────────────────────────────────────────────────────────

-- Phase 2 tables

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_camera ON "Camera";
  CREATE POLICY superuser_bypass_camera ON "Camera"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_project ON "Project";
  CREATE POLICY superuser_bypass_project ON "Project"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_site ON "Site";
  CREATE POLICY superuser_bypass_site ON "Site"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_streamprofile ON "StreamProfile";
  CREATE POLICY superuser_bypass_streamprofile ON "StreamProfile"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_playbacksession ON "PlaybackSession";
  CREATE POLICY superuser_bypass_playbacksession ON "PlaybackSession"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_policy ON "Policy";
  CREATE POLICY superuser_bypass_policy ON "Policy"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

-- Phase 3+ tables

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_apikey ON "ApiKey";
  CREATE POLICY superuser_bypass_apikey ON "ApiKey"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_webhook ON "WebhookSubscription";
  CREATE POLICY superuser_bypass_webhook ON "WebhookSubscription"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_orgsettings ON "OrgSettings";
  CREATE POLICY superuser_bypass_orgsettings ON "OrgSettings"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_recording ON "Recording";
  CREATE POLICY superuser_bypass_recording ON "Recording"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_recordingsegment ON "RecordingSegment";
  CREATE POLICY superuser_bypass_recordingsegment ON "RecordingSegment"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_recordingschedule ON "RecordingSchedule";
  CREATE POLICY superuser_bypass_recordingschedule ON "RecordingSchedule"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

-- Tenancy + membership tables (from rls.policies.sql)

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_member ON "Member";
  CREATE POLICY superuser_bypass_member ON "Member"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_invitation ON "Invitation";
  CREATE POLICY superuser_bypass_invitation ON "Invitation"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_permission_override ON "UserPermissionOverride";
  CREATE POLICY superuser_bypass_permission_override ON "UserPermissionOverride"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

-- Phase 5: Dashboard + Monitoring tables

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_audit_log ON "AuditLog";
  CREATE POLICY superuser_bypass_audit_log ON "AuditLog"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_notification ON "Notification";
  CREATE POLICY superuser_bypass_notification ON "Notification"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS superuser_bypass_notification_pref ON "NotificationPreference";
  CREATE POLICY superuser_bypass_notification_pref ON "NotificationPreference"
    USING (current_setting('app.is_superuser', true) = 'true');
END $$;
