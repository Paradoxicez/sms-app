import { PrismaClient, Prisma } from '@prisma/client';
import { ROLE_PERMISSIONS } from './roles';

/**
 * Check if a user has a specific permission within an organization.
 * Implements D-02: role provides default permissions, then per-user overrides
 * (grant/deny) are applied on top.
 *
 * RLS caveat: `UserPermissionOverride` is under FORCE ROW LEVEL SECURITY.
 * Callers MUST either:
 *   (a) wrap the call in a transaction that first emits
 *       `SELECT set_config('app.current_org_id', orgId, TRUE)` (or
 *       `app.is_superuser`), passing the resulting `tx` in (this is how
 *       tests/auth/rbac.test.ts exercises the function), OR
 *   (b) pass a tenancy-extended client driven by CLS signals upstream.
 * Passing a raw PrismaClient without either context will silently return
 * zero rows from the override lookup and fall back to the role default.
 *
 * History: signature narrowed on 2026-04-22 (quick 260422-ds9) after
 * .planning/debug/org-admin-cannot-add-team-members.md flagged that a raw
 * PrismaService could be passed here and the UserPermissionOverride read
 * would silently return zero rows.
 *
 * @param prisma - Full PrismaClient or Prisma.TransactionClient
 * @param userId - The user's ID
 * @param orgId - The organization ID
 * @param memberRole - The user's role in the organization (from Member table)
 * @param permission - Permission string in "resource:action" format (e.g. "camera:create")
 * @returns boolean - Whether the user has the permission
 */
export async function checkPermission(
  prisma: PrismaClient | Prisma.TransactionClient,
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
