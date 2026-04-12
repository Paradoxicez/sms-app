import { Inject, Injectable, Logger } from '@nestjs/common';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { SrsApiService } from '../srs/srs-api.service';
import { StatusService } from '../status/status.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    private readonly srsApiService: SrsApiService,
    private readonly statusService: StatusService,
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

    return {
      camerasOnline,
      camerasOffline,
      totalCameras,
      totalViewers,
      bandwidth: bandwidth.toString(),
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

    // Enrich with viewer counts and sort by status priority
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
        viewers: this.statusService.getViewerCount(camera.id),
      }))
      .sort(
        (a: any, b: any) =>
          (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5),
      );
  }
}
