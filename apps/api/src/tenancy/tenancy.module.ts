import { Global, Module } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import {
  TENANCY_CLIENT,
  createTenancyExtension,
} from './prisma-tenancy.extension';
import { createTagNormalizationExtension } from '../cameras/camera-tag.extension';

@Global()
@Module({
  providers: [
    {
      provide: TENANCY_CLIENT,
      inject: [PrismaService, ClsService],
      useFactory: (prisma: PrismaService, cls: ClsService) => {
        // Order matters: tenancy extension first applies RLS via set_config
        // on $allOperations; the tag-normalization extension then mutates
        // `args.data` BEFORE Prisma emits SQL, so tagsNormalized stays in
        // sync with tags on every Camera write (D-06). Phase 22 Plan 22-01.
        const tenant = createTenancyExtension(prisma, cls);
        return createTagNormalizationExtension(tenant);
      },
    },
  ],
  exports: [TENANCY_CLIENT],
})
export class TenancyModule {}
