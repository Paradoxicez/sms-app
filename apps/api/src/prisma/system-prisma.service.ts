import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * SystemPrismaService — a PrismaClient that connects as the DB superuser
 * (rolbypassrls=true), used by background jobs, schedulers, and system
 * bootstrap code that must read/write across tenants without going through
 * the request-scoped CLS tenancy context.
 *
 * Connects via `SYSTEM_DATABASE_URL` if set, otherwise falls back to
 * `DATABASE_URL_MIGRATE` (the sms superuser). Never use this for code that
 * can be reached from a tenant request — those must go through the tenancy
 * extension so tenant_isolation RLS policies actually enforce scope.
 */
@Injectable()
export class SystemPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      datasourceUrl:
        process.env.SYSTEM_DATABASE_URL ||
        process.env.DATABASE_URL_MIGRATE ||
        process.env.DATABASE_URL,
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
