import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

export const TENANCY_CLIENT = Symbol('TENANCY_CLIENT');

export function createTenancyExtension(prisma: PrismaClient, cls: ClsService) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const orgId = cls.get('ORG_ID');
          if (!orgId) {
            // No org context -- super admin or system operations
            return query(args);
          }
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}
