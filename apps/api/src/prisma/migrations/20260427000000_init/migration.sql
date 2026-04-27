-- ============================================================================
-- 0_init: v1.2 schema baseline (Phase 23 DEBT-05 squash)
-- Generated 2026-04-27 from apps/api/src/prisma/schema.prisma via:
--   prisma migrate diff --from-empty --to-schema-datamodel <path> --script
-- Then APPENDED with the consolidated RLS policies + grants from:
--   - rls.policies.sql               (app_user role + grants + Member/Invitation RLS)
--   - rls-phase5.sql                 (AuditLog/Notification/NotificationPreference RLS)
--   - migrations/rls_phase02/        (UserPermissionOverride RLS)
--   - migrations/rls_apply_all/      (Camera/Project/Site/StreamProfile/PlaybackSession/Policy/ApiKey/WebhookSubscription/OrgSettings/Recording/RecordingSegment/RecordingSchedule RLS)
--   - migrations/rls_superuser_bypass_positive_signal/  (positive-signal bypass replaces older NULL-bypass)
-- And data backfills:
--   - migrations/camera_push_fields/        (UPDATE Camera SET ingestMode='pull' WHERE NULL — no-op on fresh DB)
--   - migrations/camera_stream_url_unique/  (pre-dedup before unique index — no-op on fresh DB)
--   - migrations/recording_segment_has_keyframe/  (RecordingSegment data backfill — no-op on fresh DB)
--   - migrations/drop_org_settings_dead_fields/   (dead-field DROP — no-op on fresh DB; column already absent)
--
-- RLS section locked. New RLS = NEW migration directory. Prisma's
-- `migrate diff` does NOT detect RLS divergence (Pitfall 2 in 23-RESEARCH.md);
-- runtime regression gate is tests/tenancy/rls-isolation.test.ts.
-- ============================================================================

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PolicyLevel" AS ENUM ('SYSTEM', 'PROJECT', 'SITE', 'CAMERA');

-- CreateEnum
CREATE TYPE "NodeRole" AS ENUM ('ORIGIN', 'EDGE');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DEGRADED', 'CONNECTING');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT DEFAULT 'viewer',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,
    "impersonatedBy" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" TEXT,
    "packageId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "inviterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxCameras" INTEGER NOT NULL,
    "maxViewers" INTEGER NOT NULL,
    "maxBandwidthMbps" INTEGER NOT NULL,
    "maxStorageGb" INTEGER NOT NULL,
    "features" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'grant',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "streamUrl" TEXT NOT NULL,
    "ingestMode" TEXT NOT NULL DEFAULT 'pull',
    "streamKey" TEXT,
    "firstPublishAt" TIMESTAMP(3),
    "description" TEXT,
    "location" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tagsNormalized" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thumbnail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "needsTranscode" BOOLEAN NOT NULL DEFAULT false,
    "codecInfo" JSONB,
    "streamProfileId" TEXT,
    "lastOnlineAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "retentionDays" INTEGER,
    "isRecording" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceEnteredAt" TIMESTAMP(3),
    "maintenanceEnteredBy" TEXT,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamProfile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "codec" TEXT NOT NULL DEFAULT 'auto',
    "preset" TEXT DEFAULT 'veryfast',
    "resolution" TEXT,
    "fps" INTEGER,
    "videoBitrate" TEXT,
    "audioCodec" TEXT NOT NULL DEFAULT 'aac',
    "audioBitrate" TEXT DEFAULT '128k',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "defaultRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "hlsFragment" INTEGER NOT NULL DEFAULT 2,
    "hlsWindow" INTEGER NOT NULL DEFAULT 10,
    "hlsEncryption" BOOLEAN NOT NULL DEFAULT false,
    "rtmpPort" INTEGER NOT NULL DEFAULT 1935,
    "srtPort" INTEGER NOT NULL DEFAULT 10080,
    "webrtcPort" INTEGER NOT NULL DEFAULT 8000,
    "httpPort" INTEGER NOT NULL DEFAULT 8080,
    "apiPort" INTEGER NOT NULL DEFAULT 1985,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "level" "PolicyLevel" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ttlSeconds" INTEGER,
    "maxViewers" INTEGER,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowNoReferer" BOOLEAN,
    "rateLimit" INTEGER,
    "cameraId" TEXT,
    "siteId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybackSession" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "hlsUrl" TEXT NOT NULL,
    "ttlSeconds" INTEGER NOT NULL,
    "maxViewers" INTEGER NOT NULL,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowNoReferer" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybackSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKeyUsage" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "bandwidth" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKeyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ip" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SrsNode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "NodeRole" NOT NULL,
    "status" "NodeStatus" NOT NULL DEFAULT 'CONNECTING',
    "apiUrl" TEXT NOT NULL,
    "hlsUrl" TEXT NOT NULL,
    "hlsPort" INTEGER NOT NULL DEFAULT 8080,
    "cpu" DOUBLE PRECISION,
    "memory" DOUBLE PRECISION,
    "bandwidth" BIGINT DEFAULT 0,
    "viewers" INTEGER NOT NULL DEFAULT 0,
    "srsVersion" TEXT,
    "uptime" INTEGER,
    "missedChecks" INTEGER NOT NULL DEFAULT 0,
    "lastHealthAt" TIMESTAMP(3),
    "configVersion" INTEGER NOT NULL DEFAULT 0,
    "isLocal" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SrsNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recording',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "totalSize" BIGINT NOT NULL DEFAULT 0,
    "totalDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "initSegment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingSegment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "objectPath" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "size" BIGINT NOT NULL,
    "seqNo" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "hasKeyframe" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordingSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingSchedule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "scheduleType" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordingSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionOverride_userId_orgId_permission_key" ON "UserPermissionOverride"("userId", "orgId", "permission");

-- CreateIndex
CREATE INDEX "Project_orgId_idx" ON "Project"("orgId");

-- CreateIndex
CREATE INDEX "Site_orgId_idx" ON "Site"("orgId");

-- CreateIndex
CREATE INDEX "Site_projectId_idx" ON "Site"("projectId");

-- CreateIndex
CREATE INDEX "Camera_orgId_idx" ON "Camera"("orgId");

-- CreateIndex
CREATE INDEX "Camera_siteId_idx" ON "Camera"("siteId");

-- CreateIndex
CREATE INDEX "Camera_status_idx" ON "Camera"("status");

-- CreateIndex
CREATE INDEX "Camera_maintenanceMode_idx" ON "Camera"("maintenanceMode");

-- CreateIndex
CREATE INDEX "Camera_ingestMode_idx" ON "Camera"("ingestMode");

-- CreateIndex
CREATE INDEX "camera_tagsnormalized_idx" ON "Camera" USING GIN ("tagsNormalized" array_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Camera_orgId_name_key" ON "Camera"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Camera_orgId_streamUrl_key" ON "Camera"("orgId", "streamUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Camera_streamKey_key" ON "Camera"("streamKey");

-- CreateIndex
CREATE INDEX "StreamProfile_orgId_idx" ON "StreamProfile"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgSettings_orgId_key" ON "OrgSettings"("orgId");

-- CreateIndex
CREATE INDEX "OrgSettings_orgId_idx" ON "OrgSettings"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_cameraId_key" ON "Policy"("cameraId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_siteId_key" ON "Policy"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_projectId_key" ON "Policy"("projectId");

-- CreateIndex
CREATE INDEX "Policy_orgId_idx" ON "Policy"("orgId");

-- CreateIndex
CREATE INDEX "Policy_level_idx" ON "Policy"("level");

-- CreateIndex
CREATE UNIQUE INDEX "PlaybackSession_token_key" ON "PlaybackSession"("token");

-- CreateIndex
CREATE INDEX "PlaybackSession_orgId_idx" ON "PlaybackSession"("orgId");

-- CreateIndex
CREATE INDEX "PlaybackSession_cameraId_idx" ON "PlaybackSession"("cameraId");

-- CreateIndex
CREATE INDEX "PlaybackSession_token_idx" ON "PlaybackSession"("token");

-- CreateIndex
CREATE INDEX "PlaybackSession_expiresAt_idx" ON "PlaybackSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_orgId_idx" ON "ApiKey"("orgId");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_scopeId_idx" ON "ApiKey"("scopeId");

-- CreateIndex
CREATE INDEX "ApiKeyUsage_apiKeyId_idx" ON "ApiKeyUsage"("apiKeyId");

-- CreateIndex
CREATE INDEX "ApiKeyUsage_date_idx" ON "ApiKeyUsage"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKeyUsage_apiKeyId_date_key" ON "ApiKeyUsage"("apiKeyId", "date");

-- CreateIndex
CREATE INDEX "WebhookSubscription_orgId_idx" ON "WebhookSubscription"("orgId");

-- CreateIndex
CREATE INDEX "WebhookSubscription_isActive_idx" ON "WebhookSubscription"("isActive");

-- CreateIndex
CREATE INDEX "WebhookDelivery_subscriptionId_idx" ON "WebhookDelivery"("subscriptionId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_eventType_idx" ON "WebhookDelivery"("eventType");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_userId_idx" ON "AuditLog"("orgId", "userId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_resource_idx" ON "AuditLog"("orgId", "resource");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_action_idx" ON "AuditLog"("orgId", "action");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_orgId_createdAt_idx" ON "Notification"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_orgId_eventType_key" ON "NotificationPreference"("userId", "orgId", "eventType");

-- CreateIndex
CREATE INDEX "SrsNode_role_idx" ON "SrsNode"("role");

-- CreateIndex
CREATE INDEX "SrsNode_status_idx" ON "SrsNode"("status");

-- CreateIndex
CREATE INDEX "Recording_orgId_idx" ON "Recording"("orgId");

-- CreateIndex
CREATE INDEX "Recording_cameraId_idx" ON "Recording"("cameraId");

-- CreateIndex
CREATE INDEX "Recording_orgId_cameraId_startedAt_idx" ON "Recording"("orgId", "cameraId", "startedAt");

-- CreateIndex
CREATE INDEX "Recording_status_idx" ON "Recording"("status");

-- CreateIndex
CREATE INDEX "RecordingSegment_orgId_idx" ON "RecordingSegment"("orgId");

-- CreateIndex
CREATE INDEX "RecordingSegment_recordingId_idx" ON "RecordingSegment"("recordingId");

-- CreateIndex
CREATE INDEX "RecordingSegment_cameraId_timestamp_idx" ON "RecordingSegment"("cameraId", "timestamp");

-- CreateIndex
CREATE INDEX "RecordingSegment_orgId_cameraId_timestamp_idx" ON "RecordingSegment"("orgId", "cameraId", "timestamp");

-- CreateIndex
CREATE INDEX "RecordingSchedule_orgId_idx" ON "RecordingSchedule"("orgId");

-- CreateIndex
CREATE INDEX "RecordingSchedule_cameraId_idx" ON "RecordingSchedule"("cameraId");

-- CreateIndex
CREATE INDEX "RecordingSchedule_enabled_idx" ON "RecordingSchedule"("enabled");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_streamProfileId_fkey" FOREIGN KEY ("streamProfileId") REFERENCES "StreamProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKeyUsage" ADD CONSTRAINT "ApiKeyUsage_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingSegment" ADD CONSTRAINT "RecordingSegment_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---- camera_stream_url_unique (dedup before unique index; no-op on fresh DB) ----
-- Phase 19 / D-10c: pre-constraint dedup for Camera.streamUrl
-- MUST run BEFORE `prisma db push` adds @@unique([orgId, streamUrl]).
-- Strategy: keep-oldest per (orgId, streamUrl) tuple (A3 in 19-RESEARCH).
-- Safe to re-run: idempotent — the second run finds zero rows whose
-- createdAt is strictly greater than another row's with the same
-- (orgId, streamUrl), so DELETE is a no-op.
--
-- Tenant isolation: the composite key starts with orgId, so orgA and orgB
-- holding the same streamUrl are not considered duplicates (T-19-05).

DELETE FROM "Camera" c
USING "Camera" c2
WHERE c."orgId" = c2."orgId"
  AND c."streamUrl" = c2."streamUrl"
  AND c."createdAt" > c2."createdAt";

-- ---- camera_push_fields (data backfill ingestMode='pull' for legacy NULLs; no-op on fresh DB) ----
-- Phase 19.1 / D-06: seed ingestMode='pull' for all existing Camera rows.
-- MUST run BEFORE `prisma db push` in apps/api/package.json db:push chain.
-- Idempotent: the UPDATE only touches rows where ingestMode IS NULL, so
-- repeated runs after prisma db push has added the column are no-ops.
-- Safe on an empty table (UPDATE of zero rows).
--
-- The column does not exist yet on first run (Prisma adds it via db push),
-- so we guard with information_schema. This keeps the migration chain
-- compatible with fresh test DBs that get schema via prisma db push only.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Camera' AND column_name = 'ingestMode'
  ) THEN
    UPDATE "Camera" SET "ingestMode" = 'pull' WHERE "ingestMode" IS NULL;
  END IF;
END $$;

-- ---- recording_segment_has_keyframe (RecordingSegment backfill; no-op on fresh DB) ----
-- Phase 19.1 / layer-7: add RecordingSegment.hasKeyframe for RTMP push
-- preview fix. Populated at archive time by the H.264 NAL scanner in
-- h264-utils.ts; used by manifest.service + download-playlist.util to
-- drop leading mid-GOP fragments that jam hls.js playback.
--
-- Idempotent: Prisma `db push` adds the column for us on fresh schemas;
-- this script is safe to run before OR after the push because it guards
-- on information_schema. Existing rows stay NULL ("not probed") which
-- the application treats as "trust it" to preserve prior RTSP behaviour.
--
-- NULL vs FALSE semantics are load-bearing here — do NOT default this
-- column to FALSE. That would retro-actively hide every legacy RTSP
-- recording until a backfill job ran.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RecordingSegment' AND column_name = 'hasKeyframe'
  ) THEN
    -- Column already exists (Prisma db push ran). No-op.
    RAISE NOTICE 'RecordingSegment.hasKeyframe already present — skipping';
  ELSE
    -- Column missing (partial/legacy environment). Add it nullable so we
    -- don't force a backfill for recordings that predate the fix.
    ALTER TABLE "RecordingSegment"
      ADD COLUMN "hasKeyframe" BOOLEAN;
    RAISE NOTICE 'Added RecordingSegment.hasKeyframe';
  END IF;
END $$;

-- ---- drop_org_settings_dead_fields (dead-column drop; no-op if columns already absent) ----
-- Drop 4 dead OrgSettings columns (defaultProfileId, maxReconnectAttempts,
-- autoStartOnBoot, defaultRecordingMode). None of them were consumed in
-- code — UI wrote to them, no reader enforced the policy. See
-- /admin/stream-engine "Organization Defaults" audit, 2026-04-20.

ALTER TABLE "OrgSettings" DROP COLUMN IF EXISTS "defaultProfileId";
ALTER TABLE "OrgSettings" DROP COLUMN IF EXISTS "maxReconnectAttempts";
ALTER TABLE "OrgSettings" DROP COLUMN IF EXISTS "autoStartOnBoot";
ALTER TABLE "OrgSettings" DROP COLUMN IF EXISTS "defaultRecordingMode";

-- ============================================================================
-- RLS SECTION (locked — new policies = new migration directory)
-- ============================================================================

-- ---- rls.policies.sql (app_user role + grants + Member/Invitation/UPO/AuditLog/Notification/NotificationPreference RLS + positive-signal bypass) ----
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

-- ---- rls-phase5.sql (Phase 5 supplementary AuditLog/Notification RLS — IF NOT EXISTS guards) ----
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

-- ---- migrations/rls_phase02 (UserPermissionOverride RLS) ----
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

-- ---- migrations/rls_apply_all (broad app-data RLS: Camera/Project/Site/StreamProfile/PlaybackSession/Policy/ApiKey/WebhookSubscription/OrgSettings/Recording/RecordingSegment/RecordingSchedule) ----
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

-- ---- migrations/rls_superuser_bypass_positive_signal (replaces older NULL-bypass with positive-signal version; idempotent DROP IF EXISTS) ----
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

-- ---- final grant backfill (matches setup-test-db.sh:97 behavior — newly created tables inherit privileges) ----
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
