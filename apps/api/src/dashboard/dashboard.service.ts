import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { SrsApiService } from '../srs/srs-api.service';
import { StatusService } from '../status/status.service';
import { REDIS_CLIENT } from '../api-keys/api-keys.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    private readonly srsApiService: SrsApiService,
    private readonly statusService: StatusService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getStats(orgId: string) {
    const cameras = await this.prisma.camera.findMany({
      where: { orgId },
      select: { id: true, status: true },
    });

    const camerasOnline = cameras.filter(
      (c: any) => c.status === 'online',
    ).length;
    const camerasOffline = cameras.filter(
      (c: any) => c.status === 'offline',
    ).length;
    const totalCameras = cameras.length;

    let totalViewers = 0;
    for (const camera of cameras) {
      totalViewers += this.statusService.getViewerCount(camera.id);
    }

    // Bandwidth: aggregate from ApiKeyUsage for today
    let bandwidth = BigInt(0);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const usageResult = await this.prisma.apiKeyUsage.aggregate({
        where: {
          date: { gte: today },
          apiKey: { orgId },
        },
        _sum: { bandwidth: true },
      });
      bandwidth = usageResult._sum.bandwidth || BigInt(0);
    } catch {
      // ApiKeyUsage may not be accessible via tenancy client
    }

    // Stream bandwidth from SRS (live kbps)
    let streamBandwidth = 0;
    try {
      const srsResult = await this.srsApiService.getStreams();
      const streams: any[] = srsResult?.streams || [];
      const orgCameraIds = new Set(cameras.map((c: any) => c.id));
      for (const stream of streams) {
        // SRS stream path: app=live, name={orgId}/{cameraId} or app=live/{orgId}, name={cameraId}
        const fullPath = `${stream.app || ''}/${stream.name || ''}`;
        const prefixA = `live/${orgId}/`;
        if (fullPath.startsWith(prefixA)) {
          const cameraId = fullPath.slice(prefixA.length);
          if (orgCameraIds.has(cameraId)) {
            streamBandwidth += stream.kbps?.send_30s || 0;
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to fetch SRS streams for bandwidth: ${err.message}`);
    }

    return {
      camerasOnline,
      camerasOffline,
      totalCameras,
      totalViewers,
      bandwidth: bandwidth.toString(),
      streamBandwidth,
    };
  }

  async getSystemMetrics() {
    try {
      const data = await this.srsApiService.getSummaries();
      const selfData = data?.data?.self || {};
      const systemData = data?.data?.system || {};

      return {
        cpuPercent: selfData.cpu_percent ?? 0,
        memPercent: selfData.mem_percent ?? 0,
        memKbyte: selfData.mem_kbyte ?? 0,
        srsUptime: selfData.srs_uptime ?? 0,
        systemCpu: systemData.cpu_percent ?? 0,
        systemMemPercent: systemData.mem_ram_percent ?? 0,
        load1m: systemData.load_1m ?? 0,
        load5m: systemData.load_5m ?? 0,
      };
    } catch (err: any) {
      this.logger.warn(`Failed to fetch SRS metrics: ${err.message}`);
      return {
        cpuPercent: 0,
        memPercent: 0,
        memKbyte: 0,
        srsUptime: 0,
        systemCpu: 0,
        systemMemPercent: 0,
        load1m: 0,
        load5m: 0,
      };
    }
  }

  async getUsageTimeSeries(
    orgId: string,
    range: '24h' | '7d' | '30d',
  ) {
    const now = new Date();
    let fromDate: Date;

    switch (range) {
      case '24h':
        fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    try {
      const usage = await this.prisma.apiKeyUsage.findMany({
        where: {
          date: { gte: fromDate },
          apiKey: { orgId },
        },
        orderBy: { date: 'asc' },
      });

      // Group by date
      const grouped = new Map<string, { requests: number; bandwidth: string }>();
      for (const record of usage) {
        const dateKey = record.date.toISOString().split('T')[0];
        const existing = grouped.get(dateKey) || {
          requests: 0,
          bandwidth: '0',
        };
        existing.requests += record.requests;
        existing.bandwidth = (
          BigInt(existing.bandwidth) + (record.bandwidth || BigInt(0))
        ).toString();
        grouped.set(dateKey, existing);
      }

      // Supplement with today's Redis data (not yet flushed to PostgreSQL)
      const today = new Date().toISOString().slice(0, 10);
      try {
        const orgKeys = await this.prisma.apiKey.findMany({
          where: { orgId },
          select: { id: true },
        });
        const orgKeyIds = new Set(orgKeys.map((k: any) => k.id));

        const requestKeys = await this.redis.keys(`apikey:usage:*:${today}:requests`);
        let todayRequests = 0;
        let todayBandwidth = BigInt(0);

        for (const rKey of requestKeys) {
          // Extract keyId from pattern apikey:usage:{keyId}:{date}:requests
          const parts = rKey.split(':');
          const keyId = parts[2];
          if (!orgKeyIds.has(keyId)) continue;

          const reqVal = await this.redis.get(rKey);
          todayRequests += parseInt(reqVal || '0', 10);

          const bwKey = rKey.replace(':requests', ':bandwidth');
          const bwVal = await this.redis.get(bwKey);
          todayBandwidth += BigInt(bwVal || '0');
        }

        if (todayRequests > 0 || todayBandwidth > BigInt(0)) {
          const existing = grouped.get(today);
          if (existing) {
            existing.requests += todayRequests;
            existing.bandwidth = (
              BigInt(existing.bandwidth) + todayBandwidth
            ).toString();
          } else {
            grouped.set(today, {
              requests: todayRequests,
              bandwidth: todayBandwidth.toString(),
            });
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to fetch Redis usage for today: ${err.message}`);
      }

      const data = Array.from(grouped.entries()).map(([date, values]) => ({
        date,
        requests: values.requests,
        bandwidth: values.bandwidth,
      }));

      return { data };
    } catch {
      return { data: [] };
    }
  }

  async getCameraStatusList(orgId: string) {
    const cameras = await this.prisma.camera.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        status: true,
        lastOnlineAt: true,
      },
    });

    // Build per-camera SRS bandwidth map
    const srsStreamMap = new Map<string, { bandwidth: number; viewers: number }>();
    try {
      const srsResult = await this.srsApiService.getStreams();
      const streams: any[] = srsResult?.streams || [];
      for (const stream of streams) {
        const fullPath = `${stream.app || ''}/${stream.name || ''}`;
        const prefixA = `live/${orgId}/`;
        if (fullPath.startsWith(prefixA)) {
          const cameraId = fullPath.slice(prefixA.length);
          srsStreamMap.set(cameraId, {
            bandwidth: stream.kbps?.send_30s || 0,
            viewers: stream.clients || 0,
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to fetch SRS streams for camera list: ${err.message}`);
    }

    // Enrich with viewer counts, bandwidth, and sort by status priority
    const statusOrder: Record<string, number> = {
      offline: 0,
      degraded: 1,
      reconnecting: 2,
      connecting: 3,
      online: 4,
    };

    return cameras
      .map((camera: any) => ({
        ...camera,
        viewerCount: this.statusService.getViewerCount(camera.id),
        bandwidth: Math.round(((srsStreamMap.get(camera.id)?.bandwidth || 0) * 1000) / 8),
      }))
      .sort(
        (a: any, b: any) =>
          (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5),
      );
  }
}
