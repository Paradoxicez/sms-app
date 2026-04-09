import { PrismaClient } from '@prisma/client';
import { ROLE_PERMISSIONS } from './roles';

/**
 * Check if a user has a specific permission within an organization.
 * Implements D-02: role provides default permissions, then per-user overrides
 * (grant/deny) are applied on top.
 *
 * @param prisma - PrismaClient instance
 * @param userId - The user's ID
 * @param orgId - The organization ID
 * @param memberRole - The user's role in the organization (from Member table)
 * @param permission - Permission string in "resource:action" format (e.g. "camera:create")
 * @returns boolean - Whether the user has the permission
 */
export async function checkPermission(
  prisma: PrismaClient,
  userId: string,
  orgId: string,
  memberRole: string,
  permission: string,
): Promise<boolean> {
  // Step 1: Get default permissions from role
  const rolePerms = ROLE_PERMISSIONS[memberRole];
  if (!rolePerms) return false;
  const hasRoleDefault = rolePerms.has(permission);

  // Step 2: Check for per-user override
  const override = await prisma.userPermissionOverride.findUnique({
    where: {
      userId_orgId_permission: { userId, orgId, permission },
    },
  });

  // Step 3: Apply override logic
  if (override) {
    return override.action === 'grant';
  }

  // No override -- use role default
  return hasRoleDefault;
}
