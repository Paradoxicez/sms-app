import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { StatusService } from '../../status/status.service';
import { REDIS_CLIENT } from '../../api-keys/api-keys.service';

/**
 * PlanUsageResponse — composite shape returned by GET /api/organizations/:orgId/plan-usage.
 * BigInt fields are serialized as decimal strings at the boundary (no BigInt.prototype.toJSON mutation).
 */
export interface PlanUsageResponse {
  package: null | {
    id: string;
    name: string;
    description: string | null;
    maxCameras: number;
    maxViewers: number;
    maxBandwidthMbps: number;
    maxStorageGb: number;
    features: Record<string, boolean>;
  };
  usage: {
    cameras: number;
    viewers: number;
    bandwidthAvgMbpsMtd: number; // ORCHESTRATOR-CLARIFIED: avg Mbps MTD
    storageUsedBytes: string; // BigInt decimal string
    apiCallsMtd: number;
  };
  features: Record<string, boolean>;
}

/**
 * PlanUsageService — composes org package + live usage from PrismaService (raw),
 * StatusService (in-memory viewer snapshot), and Redis (today's API usage delta).
 *
 * Mitigates T-16-05 (cross-org leakage) by filtering Redis usage keys to the
 * calling org's apiKey IDs only — see aggregateApiUsage below.
 */
@Injectable()
export class PlanUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly status: StatusService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getPlanUsage(orgId: string): Promise<PlanUsageResponse> {
    const firstOfMonth = new Date();
    firstOfMonth.setUTCDate(1);
    firstOfMonth.setUTCHours(0, 0, 0, 0);
    // Clamp min 1s to avoid divide-by-zero at month rollover.
    const secondsElapsedInMonth = Math.max(
      1,
      Math.floor((Date.now() - firstOfMonth.getTime()) / 1000),
    );

    const [org, cameras] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: orgId },
        include: { package: true },
      }),
      this.prisma.camera.findMany({ where: { orgId }, select: { id: true } }),
    ]);

    const viewers = cameras.reduce(
      (sum: number, c: { id: string }) => sum + this.status.getViewerCount(c.id),
      0,
    );

    const storage = await this.prisma.recordingSegment.aggregate({
      where: { orgId },
      _sum: { size: true },
    });
    const storageUsedBytes = storage._sum.size ?? 0n;

    const { apiCallsMtd, bandwidthBytesMtd } = await this.aggregateApiUsage(
      orgId,
      firstOfMonth,
    );

    const bandwidthAvgMbpsMtd =
      (Number(bandwidthBytesMtd) * 8) / secondsElapsedInMonth / 1_000_000;

    const pkg = (org as any)?.package ?? null;
    const features =
      pkg && typeof pkg.features === 'object' && pkg.features !== null
        ? (pkg.features as Record<string, boolean>)
        : {};

    return {
      package: pkg
        ? {
            id: pkg.id,
            name: pkg.name,
            description: pkg.description,
            maxCameras: pkg.maxCameras,
            maxViewers: pkg.maxViewers,
            maxBandwidthMbps: pkg.maxBandwidthMbps,
            maxStorageGb: pkg.maxStorageGb,
            features,
          }
        : null,
      usage: {
        cameras: cameras.length,
        viewers,
        bandwidthAvgMbpsMtd,
        storageUsedBytes: storageUsedBytes.toString(),
        apiCallsMtd,
      },
      features,
    };
  }

  private async aggregateApiUsage(
    orgId: string,
    since: Date,
  ): Promise<{ apiCallsMtd: number; bandwidthBytesMtd: bigint }> {
    const persisted = await this.prisma.apiKeyUsage.aggregate({
      where: {
        date: { gte: since },
        apiKey: { orgId },
      },
      _sum: { requests: true, bandwidth: true },
    });

    const orgKeys = await this.prisma.apiKey.findMany({
      where: { orgId },
      select: { id: true },
    });
    const orgKeyIds = new Set(orgKeys.map((k: { id: string }) => k.id));
    const today = new Date().toISOString().slice(0, 10);

    let todayRequests = 0;
    let todayBandwidth = 0n;
    const requestKeys = await this.redis.keys(
      `apikey:usage:*:${today}:requests`,
    );
    for (const rKey of requestKeys) {
      const keyId = rKey.split(':')[2];
      if (!orgKeyIds.has(keyId)) continue;
      const [reqStr, bwStr] = await Promise.all([
        this.redis.get(rKey),
        this.redis.get(rKey.replace(':requests', ':bandwidth')),
      ]);
      todayRequests += parseInt(reqStr ?? '0', 10);
      todayBandwidth += BigInt(bwStr ?? '0');
    }

    return {
      apiCallsMtd: (persisted._sum.requests ?? 0) + todayRequests,
      bandwidthBytesMtd: (persisted._sum.bandwidth ?? 0n) + todayBandwidth,
    };
  }
}
