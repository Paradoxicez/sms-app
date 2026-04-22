import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { SrsApiService } from '../srs/srs-api.service';
import { StatusService } from '../status/status.service';
import { ClusterService } from '../cluster/cluster.service';

export type PlatformIssue = {
  type: string;
  severity: 'critical' | 'warning';
  label: string;
  meta?: Record<string, unknown>;
};

export type StorageForecastRange = '7d' | '30d';

export type StorageForecastResult = {
  points: Array<{ date: string; bytes: string }>;
  estimatedDaysUntilFull: number | null;
};

export type OrgHealth = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  packageName: string | null;
  camerasUsed: number;
  camerasLimit: number | null;
  cameraUsagePct: number;
  storageUsedBytes: string;
  storageLimitGb: number | null;
  storageUsagePct: number;
  bandwidthTodayBytes: string;
  issuesCount: number;
};

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  /**
   * Migrated from raw PrismaService to `TENANCY_CLIENT` on
   * 2026-04-22 (quick 260422-ds9). SuperAdminGuard sets CLS.IS_SUPERUSER
   * upstream, so every model operation through the tenancy extension emits
   * `set_config('app.is_superuser', 'true', TRUE)` and hits the
   * `superuser_bypass_*` RLS policies. Without this the raw PrismaService
   * connection (app_user, FORCE RLS) silently returned zero rows on every
   * dashboard query. See .planning/debug/org-admin-cannot-add-team-members.md.
   *
   * NOTE: the extension only wraps `$allModels.$allOperations`. `$queryRaw`
   * and `$executeRaw` are NOT intercepted — see `getStorageForecast` below
   * for the manual `$transaction` + `set_config` prologue it needs.
   */
  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    private readonly srsApiService: SrsApiService,
    private readonly statusService: StatusService,
    private readonly clusterService: ClusterService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────
  // Existing methods (unchanged)
  // ────────────────────────────────────────────────────────────────────────

  async getPlatformStats() {
    // The "System" org is platform-internal (super admins are members of it
    // per D-08); count only real tenant organisations.
    const totalOrgs = await this.prisma.organization.count({
      where: { slug: { not: 'system' } },
    });

    const cameras = await this.prisma.camera.findMany({
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
    const orgs = await this.prisma.organization.findMany({
      where: { slug: { not: 'system' } },
      select: { id: true, name: true, slug: true },
    });

    const cameraGroups = await this.prisma.camera.groupBy({
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

  // ────────────────────────────────────────────────────────────────────────
  // Phase 18 additions (Plan 01)
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Count of SRS streams with an active publisher — fuels the tenant-less
   * "Active Streams" stat card on the super-admin dashboard (D-05).
   * Fails open with 0 so an SRS outage doesn't crash the page; a separate
   * "srs-down" platform issue row surfaces the outage itself.
   */
  async getActiveStreamsCount(): Promise<{ count: number }> {
    try {
      const result = await this.srsApiService.getStreams();
      const streams: any[] = result?.streams || [];
      const count = streams.filter((s) => s?.publish?.active === true).length;
      return { count };
    } catch (err: any) {
      this.logger.warn(`getActiveStreamsCount: SRS unreachable — ${err.message}`);
      return { count: 0 };
    }
  }

  /**
   * Platform-wide count of cameras currently recording. Uses the tenancy
   * client — SuperAdminGuard set IS_SUPERUSER upstream so the extension's
   * set_config prologue lets this query see rows across all orgs.
   */
  async getRecordingsActive(): Promise<{ count: number }> {
    const count = await this.prisma.camera.count({
      where: { isRecording: true },
    });
    return { count };
  }

  /**
   * Compose the Platform Issues panel (D-09). Each subsystem check is wrapped
   * in try/catch so a single failure never hides the others.
   */
  async getPlatformIssues(): Promise<PlatformIssue[]> {
    const issues: PlatformIssue[] = [];

    // 1. SRS reachability — hit the cheapest endpoint.
    try {
      await this.srsApiService.getVersions();
    } catch (err: any) {
      issues.push({
        type: 'srs-down',
        severity: 'critical',
        label: 'SRS origin unreachable',
        meta: { error: err?.message ?? 'unknown' },
      });
    }

    // 2. Edge nodes OFFLINE or DEGRADED.
    try {
      const nodes: any[] = await this.prisma.srsNode.findMany({
        where: {
          role: 'EDGE',
          status: { in: ['OFFLINE', 'DEGRADED'] as any },
        },
      });
      for (const node of nodes) {
        issues.push({
          type: 'edge-down',
          severity: node.status === 'OFFLINE' ? 'critical' : 'warning',
          label: `Edge node "${node.name}" is ${String(node.status).toLowerCase()}`,
          meta: { nodeId: node.id, status: node.status },
        });
      }
    } catch (err: any) {
      this.logger.warn(`getPlatformIssues edge check failed: ${err.message}`);
    }

    // 3. Org offline-rate — any tenant org (slug != 'system') with >50% of
    // its cameras offline AND at least 3 cameras total.
    try {
      const orgs: any[] = await this.prisma.organization.findMany({
        where: { slug: { not: 'system' } },
        select: { id: true, name: true, slug: true },
      });
      const orgById = new Map(orgs.map((o) => [o.id, o]));
      const groups: any[] = await this.prisma.camera.groupBy({
        by: ['orgId', 'status'],
        _count: true,
      });
      const perOrg = new Map<string, { offline: number; total: number }>();
      for (const g of groups) {
        if (!orgById.has(g.orgId)) continue; // skip system + unknown
        const entry = perOrg.get(g.orgId) ?? { offline: 0, total: 0 };
        const count = typeof g._count === 'number' ? g._count : g._count?._all ?? 0;
        entry.total += count;
        if (g.status === 'offline') entry.offline += count;
        perOrg.set(g.orgId, entry);
      }
      for (const [orgId, { offline, total }] of perOrg.entries()) {
        if (total >= 3 && offline / total > 0.5) {
          const org = orgById.get(orgId);
          const pct = Math.round((offline / total) * 100);
          issues.push({
            type: 'org-offline-rate',
            severity: 'warning',
            label: `${org?.name ?? 'Org'}: ${pct}% of cameras offline (${offline}/${total})`,
            meta: {
              orgId,
              orgSlug: org?.slug,
              offlinePct: pct,
              offline,
              total,
            },
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`getPlatformIssues org-rate check failed: ${err.message}`);
    }

    return issues;
  }

  /**
   * Delegate to ClusterService (Phase 6) so origin/edge shape stays
   * consistent with the Cluster admin page.
   */
  async getClusterNodes() {
    return this.clusterService.findAll();
  }

  /**
   * Storage growth forecast for the Platform Health page (D-10).
   *
   * Uses Prisma.sql parameter binding — NEVER string concat (T-18-SQLI-FORECAST).
   * Range is validated by the controller against z.enum(['7d', '30d']).
   */
  async getStorageForecast(
    range: StorageForecastRange,
  ): Promise<StorageForecastResult> {
    const days = range === '30d' ? 30 : 7;
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    // The tenancy extension wraps $allModels.$allOperations only — $queryRaw
    // is NOT intercepted. Wrap manually so `set_config('app.is_superuser',
    // 'true', TRUE)` is emitted in the same transaction as the query;
    // otherwise RecordingSegment (FORCE RLS) returns zero rows on app_user.
    const rows: Array<{ date: Date; bytes: bigint }> = await this.prisma.$transaction(
      async (tx: any) => {
        await tx.$executeRaw`SELECT set_config('app.is_superuser', 'true', TRUE)`;
        return tx.$queryRaw(Prisma.sql`
          SELECT DATE("createdAt") AS date, SUM(size) AS bytes
          FROM "RecordingSegment"
          WHERE "createdAt" >= ${since}
          GROUP BY DATE("createdAt")
          ORDER BY date ASC
        `) as Promise<Array<{ date: Date; bytes: bigint }>>;
      },
    );

    const points = rows.map((r) => ({
      date: (r.date instanceof Date ? r.date : new Date(r.date as any))
        .toISOString()
        .slice(0, 10),
      bytes: (r.bytes ?? BigInt(0)).toString(),
    }));

    // Total quota = SUM(package.maxStorageGb) across all orgs holding packages.
    // We use the Package table aggregate; orgs without packages don't consume.
    let totalQuotaBytes = BigInt(0);
    try {
      const agg = await this.prisma.package.aggregate({
        _sum: { maxStorageGb: true },
      });
      const gb = agg._sum?.maxStorageGb ?? 0;
      totalQuotaBytes = BigInt(gb) * BigInt(1024 * 1024 * 1024);
    } catch (err: any) {
      this.logger.warn(
        `getStorageForecast quota aggregate failed: ${err.message}`,
      );
    }

    const estimatedDaysUntilFull = this.estimateDaysUntilFull(
      rows,
      totalQuotaBytes,
    );

    return { points, estimatedDaysUntilFull };
  }

  private estimateDaysUntilFull(
    rows: Array<{ date: Date; bytes: bigint }>,
    totalQuotaBytes: bigint,
  ): number | null {
    if (rows.length < 2 || totalQuotaBytes <= BigInt(0)) return null;

    // Build cumulative series: (dayIndex, cumulativeBytes).
    const points: Array<{ x: number; y: number }> = [];
    let cumulative = BigInt(0);
    rows.forEach((r, i) => {
      cumulative += r.bytes ?? BigInt(0);
      points.push({ x: i, y: Number(cumulative) });
    });

    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.x, 0);
    const sumY = points.reduce((a, p) => a + p.y, 0);
    const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
    const sumX2 = points.reduce((a, p) => a + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    if (slope <= 0) return null;

    const lastCumulative = points[points.length - 1].y;
    const quota = Number(totalQuotaBytes);
    if (lastCumulative >= quota) return 0;

    return Math.ceil((quota - lastCumulative) / slope);
  }

  /**
   * Recent platform-level audit events for the super-admin dashboard (D-11).
   * Filters to cross-tenant structural changes (org/user/cluster) and joins
   * actor + org names.
   */
  async getRecentAuditHighlights(
    limitInput: number = 7,
  ): Promise<Array<any>> {
    const limit = Math.max(1, Math.min(10, Math.floor(limitInput || 7)));

    // AuditLog stores (resource, action) pairs. The plan calls out event types
    // like 'organization.create', 'user.delete' etc. — we translate those to
    // the row-level filter below.
    const where: Prisma.AuditLogWhereInput = {
      OR: [
        { resource: 'organization', action: { in: ['create', 'update', 'delete'] } },
        { resource: 'user', action: { in: ['delete', 'update'] } },
      ],
    };

    const items: any[] = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Hand-join actor + org name (AuditLog has no FK relations to either).
    const userIds = Array.from(
      new Set(items.map((i: any) => i.userId).filter(Boolean)),
    ) as string[];
    const orgIds = Array.from(
      new Set(items.map((i: any) => i.orgId).filter(Boolean)),
    ) as string[];

    const [users, orgs] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
      orgIds.length
        ? this.prisma.organization.findMany({
            where: { id: { in: orgIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const userById = new Map((users as any[]).map((u: any) => [u.id, u]));
    const orgById = new Map((orgs as any[]).map((o: any) => [o.id, o.name]));

    return items.map((item: any) => ({
      ...item,
      user: item.userId ? userById.get(item.userId) ?? null : null,
      orgName: orgById.get(item.orgId) ?? null,
    }));
  }

  /**
   * Cross-tenant org-health table (D-12). Composes: package limits, camera
   * counts by status, storage usage, today's bandwidth, issue count.
   * Sorted by max(cameraUsagePct, storageUsagePct) descending so problem
   * orgs float to the top.
   */
  async getOrgHealthOverview(): Promise<OrgHealth[]> {
    const orgs: any[] = await this.prisma.organization.findMany({
      where: { slug: { not: 'system' } },
      include: { package: true },
    });

    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length === 0) return [];

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // 1. Camera counts grouped by (org, status).
    const cameraGroups: any[] = await this.prisma.camera.groupBy({
      by: ['orgId', 'status'],
      _count: true,
      where: { orgId: { in: orgIds } },
    });
    const cameraByOrg = new Map<
      string,
      { used: number; offline: number; degraded: number }
    >();
    for (const g of cameraGroups) {
      const entry = cameraByOrg.get(g.orgId) ?? { used: 0, offline: 0, degraded: 0 };
      const count = typeof g._count === 'number' ? g._count : g._count?._all ?? 0;
      entry.used += count;
      if (g.status === 'offline') entry.offline += count;
      if (g.status === 'degraded') entry.degraded += count;
      cameraByOrg.set(g.orgId, entry);
    }

    // 2. Storage usage per org (sum over RecordingSegment).
    const storageGroups: any[] = await this.prisma.recordingSegment.groupBy({
      by: ['orgId'],
      _sum: { size: true },
      where: { orgId: { in: orgIds } },
    });
    const storageByOrg = new Map<string, bigint>();
    for (const g of storageGroups) {
      storageByOrg.set(g.orgId, (g._sum?.size as bigint) ?? BigInt(0));
    }

    // 3. Today's bandwidth — API key usage since startOfDay, mapped back to
    // the owning org via ApiKey.
    const apiKeys: any[] = await this.prisma.apiKey.findMany({
      where: { orgId: { in: orgIds } },
      select: { id: true, orgId: true },
    });
    const keyToOrg = new Map(apiKeys.map((k) => [k.id, k.orgId as string]));
    const usages: any[] = await this.prisma.apiKeyUsage.findMany({
      where: {
        date: { gte: startOfDay },
        apiKeyId: { in: apiKeys.map((k) => k.id) },
      },
      select: { apiKeyId: true, bandwidth: true },
    });
    const bandwidthByOrg = new Map<string, bigint>();
    for (const u of usages) {
      const orgId = keyToOrg.get(u.apiKeyId);
      if (!orgId) continue;
      const prev = bandwidthByOrg.get(orgId) ?? BigInt(0);
      bandwidthByOrg.set(
        orgId,
        prev + ((u.bandwidth as bigint) ?? BigInt(0)),
      );
    }

    const rows: OrgHealth[] = orgs.map((org) => {
      const cam = cameraByOrg.get(org.id) ?? { used: 0, offline: 0, degraded: 0 };
      const storageUsed = storageByOrg.get(org.id) ?? BigInt(0);
      const bandwidthToday = bandwidthByOrg.get(org.id) ?? BigInt(0);

      const camerasLimit = org.package?.maxCameras ?? null;
      const cameraUsagePct =
        camerasLimit && camerasLimit > 0
          ? Math.min(100, Math.round((cam.used / camerasLimit) * 100))
          : 0;

      const storageLimitGb = org.package?.maxStorageGb ?? null;
      const storageLimitBytes = storageLimitGb
        ? BigInt(storageLimitGb) * BigInt(1024 * 1024 * 1024)
        : BigInt(0);
      const storageUsagePct =
        storageLimitBytes > BigInt(0)
          ? Math.min(
              100,
              Number((storageUsed * BigInt(100)) / storageLimitBytes),
            )
          : 0;

      return {
        orgId: org.id,
        orgName: org.name,
        orgSlug: org.slug,
        packageName: org.package?.name ?? null,
        camerasUsed: cam.used,
        camerasLimit,
        cameraUsagePct,
        storageUsedBytes: storageUsed.toString(),
        storageLimitGb,
        storageUsagePct,
        bandwidthTodayBytes: bandwidthToday.toString(),
        issuesCount: cam.offline + cam.degraded,
      };
    });

    // Sort by max(cameraUsagePct, storageUsagePct) desc.
    rows.sort((a, b) => {
      const aMax = Math.max(a.cameraUsagePct, a.storageUsagePct);
      const bMax = Math.max(b.cameraUsagePct, b.storageUsagePct);
      return bMax - aMax;
    });

    return rows;
  }
}
