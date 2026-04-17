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
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    if (query.search) {
      where.OR = [
        { resource: { contains: query.search, mode: 'insensitive' } },
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

    return { items, totalCount };
  }
}
