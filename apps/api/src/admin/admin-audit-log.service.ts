import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditQueryDto } from '../audit/dto/audit-query.dto';

@Injectable()
export class AdminAuditLogService {
  private readonly logger = new Logger(AdminAuditLogService.name);

  constructor(private readonly rawPrisma: PrismaService) {}

  async findAll(
    query: AuditQueryDto,
  ): Promise<{ items: any[]; nextCursor: string | null }> {
    const where: any = {};

    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;
    if (query.resource) where.resource = query.resource;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const take = query.take ?? 50;

    const items = await this.rawPrisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
    });

    let nextCursor: string | null = null;
    if (items.length > take) {
      const nextItem = items.pop();
      nextCursor = nextItem!.id;
    }

    // Join user info (AuditLog has no Prisma relation to User)
    const userIds = [
      ...new Set(items.map((i: any) => i.userId).filter(Boolean)),
    ];
    const userMap = new Map<string, { name: string | null; email: string }>();
    if (userIds.length > 0) {
      const users = await this.rawPrisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      });
      for (const u of users) {
        userMap.set(u.id, { name: u.name, email: u.email });
      }
    }

    // Join org names (AuditLog has no Prisma relation to Organization)
    const orgIds = [
      ...new Set(items.map((i: any) => i.orgId).filter(Boolean)),
    ];
    const orgMap = new Map<string, string>();
    if (orgIds.length > 0) {
      const orgs = await this.rawPrisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true },
      });
      for (const o of orgs) {
        orgMap.set(o.id, o.name);
      }
    }

    const enrichedItems = items.map((item: any) => ({
      ...item,
      user: item.userId ? userMap.get(item.userId) || null : null,
      orgName: orgMap.get(item.orgId) || 'Unknown',
    }));

    return { items: enrichedItems, nextCursor };
  }
}
