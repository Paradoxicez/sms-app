import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import Redis from 'ioredis';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(TENANCY_CLIENT) private readonly tenancy: any,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Generate a new API key with sk_live_ prefix.
   * Returns { rawKey, keyHash, prefix, lastFour }.
   */
  private generateKey() {
    const rawSecret = randomBytes(32).toString('hex');
    const rawKey = `sk_live_${rawSecret}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const prefix = 'sk_live_';
    const lastFour = rawSecret.slice(-4);
    return { rawKey, keyHash, prefix, lastFour };
  }

  /**
   * Create a new API key scoped to a project or site.
   * Returns the raw key ONLY on creation -- it is never stored.
   */
  async create(orgId: string, dto: CreateApiKeyDto) {
    // Validate that scopeId belongs to the org
    if (dto.scope === 'PROJECT') {
      const project = await this.tenancy.project.findFirst({
        where: { id: dto.scopeId, orgId },
      });
      if (!project) {
        throw new BadRequestException(`Project ${dto.scopeId} not found in organization`);
      }
    } else if (dto.scope === 'SITE') {
      const site = await this.tenancy.site.findFirst({
        where: { id: dto.scopeId, orgId },
      });
      if (!site) {
        throw new BadRequestException(`Site ${dto.scopeId} not found in organization`);
      }
    }

    const { rawKey, keyHash, prefix, lastFour } = this.generateKey();

    const apiKey = await this.tenancy.apiKey.create({
      data: {
        orgId,
        name: dto.name,
        keyHash,
        prefix,
        lastFour,
        scope: dto.scope,
        scopeId: dto.scopeId,
      },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      rawKey, // Returned ONLY on creation
      prefix: apiKey.prefix,
      lastFour: apiKey.lastFour,
      scope: apiKey.scope,
      scopeId: apiKey.scopeId,
      createdAt: apiKey.createdAt,
    };
  }

  /**
   * List all API keys for an organization.
   * Never returns keyHash.
   */
  async findAll(orgId: string) {
    return this.tenancy.apiKey.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastFour: true,
        scope: true,
        scopeId: true,
        revokedAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find an API key by its SHA-256 hash (for guard authentication).
   */
  async findByHash(keyHash: string) {
    return this.prisma.apiKey.findUnique({
      where: { keyHash },
    });
  }

  /**
   * Revoke an API key by setting revokedAt.
   */
  async revoke(id: string, orgId: string) {
    const key = await this.tenancy.apiKey.findFirst({
      where: { id, orgId },
    });
    if (!key) {
      throw new NotFoundException(`API key ${id} not found`);
    }

    return this.tenancy.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastFour: true,
        revokedAt: true,
      },
    });
  }

  /**
   * Update lastUsedAt timestamp (fire-and-forget from guard).
   */
  async updateLastUsed(id: string) {
    await this.prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  /**
   * Record usage via Redis INCR (O(1), fire-and-forget).
   * Tracks requests count and bandwidth bytes per key per day.
   */
  async recordUsage(keyId: string, bytes: number) {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const pipeline = this.redis.pipeline();
    pipeline.incr(`apikey:usage:${keyId}:${date}:requests`);
    pipeline.incrby(`apikey:usage:${keyId}:${date}:bandwidth`, bytes);
    // Set TTL of 3 days to auto-cleanup if aggregation fails
    pipeline.expire(`apikey:usage:${keyId}:${date}:requests`, 259200);
    pipeline.expire(`apikey:usage:${keyId}:${date}:bandwidth`, 259200);
    await pipeline.exec();
  }

  /**
   * Aggregate daily usage from Redis to PostgreSQL.
   * Called by BullMQ repeatable job at 00:05 UTC.
   */
  async aggregateDaily() {
    const keys = await this.redis.keys('apikey:usage:*:requests');

    for (const redisKey of keys) {
      // Parse: apikey:usage:{keyId}:{date}:requests
      const parts = redisKey.split(':');
      const keyId = parts[2];
      const date = parts[3];

      const [requestsStr, bandwidthStr] = await Promise.all([
        this.redis.get(redisKey),
        this.redis.get(`apikey:usage:${keyId}:${date}:bandwidth`),
      ]);

      const requests = parseInt(requestsStr || '0', 10);
      const bandwidth = BigInt(bandwidthStr || '0');

      // Upsert into PostgreSQL
      await this.prisma.apiKeyUsage.upsert({
        where: {
          apiKeyId_date: {
            apiKeyId: keyId,
            date: new Date(date),
          },
        },
        update: {
          requests: { increment: requests },
          bandwidth: { increment: bandwidth },
        },
        create: {
          apiKeyId: keyId,
          date: new Date(date),
          requests,
          bandwidth,
        },
      });

      // Delete processed Redis keys
      await this.redis.del(redisKey, `apikey:usage:${keyId}:${date}:bandwidth`);
    }
  }

  /**
   * Get usage stats for a key over the last N days.
   */
  async getUsageStats(keyId: string, days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.apiKeyUsage.findMany({
      where: {
        apiKeyId: keyId,
        date: { gte: since },
      },
      select: {
        date: true,
        requests: true,
        bandwidth: true,
      },
      orderBy: { date: 'asc' },
    });
  }
}
