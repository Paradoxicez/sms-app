import { Global, Module } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import {
  TENANCY_CLIENT,
  createTenancyExtension,
} from './prisma-tenancy.extension';

@Global()
@Module({
  providers: [
    {
      provide: TENANCY_CLIENT,
      inject: [PrismaService, ClsService],
      useFactory: (prisma: PrismaService, cls: ClsService) => {
        return createTenancyExtension(prisma, cls);
      },
    },
  ],
  exports: [TENANCY_CLIENT],
})
export class TenancyModule {}
