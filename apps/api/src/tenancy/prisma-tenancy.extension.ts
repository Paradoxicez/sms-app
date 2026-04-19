import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

export const TENANCY_CLIENT = Symbol('TENANCY_CLIENT');

export function createTenancyExtension(prisma: PrismaClient, cls: ClsService) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const orgId = cls.get<string | undefined>('ORG_ID');
          const isSuperuser = cls.get<string | undefined>('IS_SUPERUSER');

          // No signals at all -- system/seed/bootstrap context. Skip set_config
          // so Postgres session inherits nothing; RLS will close everything by
          // default (positive-signal policy).
          if (!orgId && !isSuperuser) {
            return query(args);
          }

          const stmts: any[] = [];
          if (orgId) {
            stmts.push(
              prisma.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, TRUE)`,
            );
          }
          if (isSuperuser) {
            stmts.push(
              prisma.$executeRaw`SELECT set_config('app.is_superuser', 'true', TRUE)`,
            );
          }
          stmts.push(query(args));

          const results = await prisma.$transaction(stmts);
          return results[results.length - 1];
        },
      },
    },
  });
}
