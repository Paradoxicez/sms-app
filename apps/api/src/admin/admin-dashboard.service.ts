import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SrsApiService } from '../srs/srs-api.service';
import { StatusService } from '../status/status.service';

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(
    private readonly rawPrisma: PrismaService,
    private readonly srsApiService: SrsApiService,
    private readonly statusService: StatusService,
  ) {}

  async getPlatformStats() {
    // The "System" org is platform-internal (super admins are members of it
    // per D-08); count only real tenant organisations.
    const totalOrgs = await this.rawPrisma.organization.count({
      where: { slug: { not: 'system' } },
    });

    const cameras = await this.rawPrisma.camera.findMany({
      select: { id: true, status: true, orgId: true },
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

    // Stream bandwidth from SRS (live kbps across all streams)
    let streamBandwidth = 0;
    try {
      const srsResult = await this.srsApiService.getStreams();
      const streams: any[] = srsResult?.streams || [];
      for (const stream of streams) {
        streamBandwidth += stream.kbps?.send_30s || 0;
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to fetch SRS streams for bandwidth: ${err.message}`,
      );
    }

    return {
      totalOrgs,
      totalCameras,
      camerasOnline,
      camerasOffline,
      totalViewers,
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

  async getOrgSummary() {
    // Exclude the platform-internal "System" org — it exists only so super
    // admins have a membership row, never hosts real cameras.
    const orgs = await this.rawPrisma.organization.findMany({
      where: { slug: { not: 'system' } },
      select: { id: true, name: true, slug: true },
    });

    const cameraGroups = await this.rawPrisma.camera.groupBy({
      by: ['orgId', 'status'],
      _count: true,
    });

    // Build a map of orgId -> { online, offline, total }
    const orgCameraMap = new Map<
      string,
      { camerasOnline: number; camerasOffline: number; totalCameras: number }
    >();

    for (const group of cameraGroups) {
      const existing = orgCameraMap.get(group.orgId) || {
        camerasOnline: 0,
        camerasOffline: 0,
        totalCameras: 0,
      };
      const count = group._count;
      existing.totalCameras += count;
      if (group.status === 'online') {
        existing.camerasOnline += count;
      } else {
        existing.camerasOffline += count;
      }
      orgCameraMap.set(group.orgId, existing);
    }

    return orgs
      .map((org: any) => {
        const cameras = orgCameraMap.get(org.id) || {
          camerasOnline: 0,
          camerasOffline: 0,
          totalCameras: 0,
        };
        return {
          orgId: org.id,
          orgName: org.name,
          orgSlug: org.slug,
          ...cameras,
        };
      })
      .sort((a: any, b: any) => b.totalCameras - a.totalCameras);
  }
}
