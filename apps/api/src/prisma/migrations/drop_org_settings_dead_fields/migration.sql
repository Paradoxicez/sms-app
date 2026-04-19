-- Drop 4 dead OrgSettings columns (defaultProfileId, maxReconnectAttempts,
-- autoStartOnBoot, defaultRecordingMode). None of them were consumed in
-- code — UI wrote to them, no reader enforced the policy. See
-- /admin/stream-engine "Organization Defaults" audit, 2026-04-20.

ALTER TABLE "OrgSettings" DROP COLUMN IF EXISTS "defaultProfileId";
ALTER TABLE "OrgSettings" DROP COLUMN IF EXISTS "maxReconnectAttempts";
ALTER TABLE "OrgSettings" DROP COLUMN IF EXISTS "autoStartOnBoot";
ALTER TABLE "OrgSettings" DROP COLUMN IF EXISTS "defaultRecordingMode";
