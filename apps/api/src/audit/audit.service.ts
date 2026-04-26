import { Inject, Injectable, Logger } from '@nestjs/common';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { AuditQueryDto } from './dto/audit-query.dto';

const SENSITIVE_KEYS_PATTERN = /password|secret|token|apiKey|keyHash/i;

function sanitizeDetails(details: any): any {
  if (!details || typeof details !== 'object') return details;
  if (Array.isArray(details)) return details.map(sanitizeDetails);

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SENSITIVE_KEYS_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeDetails(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
  ) {}

  async log(data: {
    orgId: string;
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    method: string;
    path: string;
    ip?: string;
    details?: any;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          orgId: data.orgId,
          userId: data.userId || null,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId || null,
          method: data.method,
          path: data.path,
          ip: data.ip || null,
          details: data.details ? sanitizeDetails(data.details) : null,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to write audit log: ${err.message}`);
    }
  }

  async findAll(
    orgId: string,
    query: AuditQueryDto,
  ): Promise<{ items: any[]; totalCount: number }> {
    const where: any = { orgId };

    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;
    if (query.resource) where.resource = query.resource;
    // Narrow to a single resource instance (e.g. one camera's Activity tab).
    // Applied BEFORE the `search` OR-clause so a camera-scoped query doesn't
    // get widened by an unrelated free-text `search` term — Prisma AND-merges
    // top-level fields with `OR`, which is the desired behavior here.
    if (query.resourceId) where.resourceId = query.resourceId;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    if (query.search) {
      // Free-text search across user-meaningful columns. `resource` is a type
      // literal ("camera", "policy", …); `resourceId` carries UUIDs so users
      // can paste an entity id; `path` lets ops grep by URL fragment; `ip`
      // supports IP-based forensics.
      where.OR = [
        { resource: { contains: query.search, mode: 'insensitive' } },
        { resourceId: { contains: query.search, mode: 'insensitive' } },
        { path: { contains: query.search, mode: 'insensitive' } },
        { ip: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;

    const [items, totalCount] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.pageSize,
        skip,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // AuditLog has no FK relation to User (userId is a plain String), so we
    // hand-hydrate the actor by batching distinct userIds and merging.
    const userIds = Array.from(
      new Set(items.map((i: any) => i.userId).filter(Boolean)),
    ) as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userById = new Map(users.map((u: any) => [u.id, u]));
    const hydrated = items.map((item: any) => ({
      ...item,
      user: item.userId ? userById.get(item.userId) ?? null : null,
    }));

    return { items: hydrated, totalCount };
  }
}
