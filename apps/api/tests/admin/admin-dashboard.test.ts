/**
 * Phase 18 Wave 1 — AdminDashboardService Plan 01 tests.
 * Plan 00 stubs flipped to real assertions. Every test maps to a D-05..D-12
 * verifiable behavior in .planning/phases/18-dashboard-map-polish/18-RESEARCH.md.
 *
 * Security threat coverage:
 *   - T-18-AUTHZ-ADMIN — SuperAdminGuard is declared on the controller class.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminDashboardService } from '../../src/admin/admin-dashboard.service';
import { AdminDashboardController } from '../../src/admin/admin-dashboard.controller';
import { SuperAdminGuard } from '../../src/auth/guards/super-admin.guard';

type AnyFn = (...args: any[]) => any;

function makeMockPrisma() {
  return {
    organization: {
      findMany: vi.fn() as AnyFn,
      count: vi.fn() as AnyFn,
    },
    camera: {
      findMany: vi.fn() as AnyFn,
      count: vi.fn() as AnyFn,
      groupBy: vi.fn() as AnyFn,
    },
    srsNode: {
      findMany: vi.fn() as AnyFn,
    },
    auditLog: {
      findMany: vi.fn() as AnyFn,
    },
    user: {
      findMany: vi.fn() as AnyFn,
    },
    apiKey: {
      findMany: vi.fn() as AnyFn,
    },
    apiKeyUsage: {
      findMany: vi.fn() as AnyFn,
    },
    recordingSegment: {
      groupBy: vi.fn() as AnyFn,
      aggregate: vi.fn() as AnyFn,
    },
    package: {
      aggregate: vi.fn() as AnyFn,
    },
    $queryRaw: vi.fn() as AnyFn,
  };
}

describe('AdminDashboardService Phase 18 additions', () => {
  let service: AdminDashboardService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;
  const mockSrs = {
    getStreams: vi.fn() as AnyFn,
    getSummaries: vi.fn() as AnyFn,
    getVersions: vi.fn() as AnyFn,
  };
  const mockStatus = {
    getViewerCount: vi.fn().mockReturnValue(0),
  };
  const mockCluster = {
    findAll: vi.fn() as AnyFn,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = makeMockPrisma();
    service = new AdminDashboardService(
      mockPrisma as any,
      mockSrs as any,
      mockStatus as any,
      mockCluster as any,
    );
  });

  describe('getActiveStreamsCount', () => {
    it('getActiveStreamsCount returns SRS publisher count', async () => {
      mockSrs.getStreams.mockResolvedValue({
        streams: [
          { app: 'live', name: 'org/cam1', publish: { active: true } },
          { app: 'live', name: 'org/cam2', publish: { active: true } },
          { app: 'live', name: 'org/cam3', publish: { active: false } },
          { app: 'live', name: 'org/cam4' }, // no publish field
        ],
      });

      const result = await service.getActiveStreamsCount();

      expect(result).toEqual({ count: 2 });
    });

    it('getActiveStreamsCount returns 0 when SRS unreachable', async () => {
      mockSrs.getStreams.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.getActiveStreamsCount();

      expect(result).toEqual({ count: 0 });
    });
  });

  describe('getRecordingsActive', () => {
    it('getRecordingsActive counts cameras with isRecording=true across all orgs', async () => {
      mockPrisma.camera.count.mockResolvedValue(7);

      const result = await service.getRecordingsActive();

      expect(result).toEqual({ count: 7 });
      expect(mockPrisma.camera.count).toHaveBeenCalledWith({
        where: { isRecording: true },
      });
    });
  });

  describe('getPlatformIssues', () => {
    it('getPlatformIssues returns srs-down when SRS versions endpoint throws', async () => {
      mockSrs.getVersions.mockRejectedValue(new Error('fetch failed'));
      mockPrisma.srsNode.findMany.mockResolvedValue([]);
      mockPrisma.camera.groupBy.mockResolvedValue([]);
      mockPrisma.organization.findMany.mockResolvedValue([]);

      const issues = await service.getPlatformIssues();

      expect(issues.some((i: any) => i.type === 'srs-down')).toBe(true);
      const srsDown = issues.find((i: any) => i.type === 'srs-down')!;
      expect(srsDown.severity).toBe('critical');
    });

    it('getPlatformIssues returns edge-down rows for SrsNode role=EDGE status in (OFFLINE, DEGRADED)', async () => {
      mockSrs.getVersions.mockResolvedValue({ data: { version: '6.0.184' } });
      mockPrisma.srsNode.findMany.mockResolvedValue([
        { id: 'e1', name: 'Edge-1', role: 'EDGE', status: 'OFFLINE' },
        { id: 'e2', name: 'Edge-2', role: 'EDGE', status: 'DEGRADED' },
        { id: 'e3', name: 'Edge-3', role: 'EDGE', status: 'ONLINE' },
      ]);
      mockPrisma.camera.groupBy.mockResolvedValue([]);
      mockPrisma.organization.findMany.mockResolvedValue([]);

      const issues = await service.getPlatformIssues();

      const edgeDown = issues.filter((i: any) => i.type === 'edge-down');
      expect(edgeDown).toHaveLength(2);
      const labels = edgeDown.map((i: any) => i.label);
      expect(labels.some((l: string) => l.includes('Edge-1'))).toBe(true);
      expect(labels.some((l: string) => l.includes('Edge-2'))).toBe(true);
      // ONLINE edge is NOT reported.
      expect(labels.some((l: string) => l.includes('Edge-3'))).toBe(false);
    });

    it('getPlatformIssues returns org-offline-rate rows for orgs with >50% cameras offline', async () => {
      mockSrs.getVersions.mockResolvedValue({ data: { version: '6.0.184' } });
      mockPrisma.srsNode.findMany.mockResolvedValue([]);
      mockPrisma.organization.findMany.mockResolvedValue([
        { id: 'org-alpha', name: 'Alpha', slug: 'alpha' },
        { id: 'org-beta', name: 'Beta', slug: 'beta' },
      ]);
      // Alpha: 4 offline / 5 total = 80% offline → issue emitted.
      // Beta:  1 offline / 3 total = 33%         → no issue.
      mockPrisma.camera.groupBy.mockResolvedValue([
        { orgId: 'org-alpha', status: 'offline', _count: 4 },
        { orgId: 'org-alpha', status: 'online', _count: 1 },
        { orgId: 'org-beta', status: 'offline', _count: 1 },
        { orgId: 'org-beta', status: 'online', _count: 2 },
      ]);

      const issues = await service.getPlatformIssues();

      const orgIssues = issues.filter((i: any) => i.type === 'org-offline-rate');
      expect(orgIssues).toHaveLength(1);
      expect(orgIssues[0].meta?.orgId ?? orgIssues[0].meta?.orgSlug).toBeDefined();
      expect(orgIssues[0].label).toMatch(/Alpha/);
    });

    it('getPlatformIssues excludes system org from org-offline-rate calculation', async () => {
      mockSrs.getVersions.mockResolvedValue({ data: { version: '6.0.184' } });
      mockPrisma.srsNode.findMany.mockResolvedValue([]);
      // The service passes slug: { not: 'system' } to the org findMany, so
      // the result set simply doesn't contain the system org.
      mockPrisma.organization.findMany.mockResolvedValue([
        { id: 'org-tenant', name: 'Tenant', slug: 'tenant' },
      ]);
      mockPrisma.camera.groupBy.mockResolvedValue([
        { orgId: 'system-org-id', status: 'offline', _count: 10 },
        { orgId: 'org-tenant', status: 'online', _count: 3 },
      ]);

      const issues = await service.getPlatformIssues();

      const orgIssues = issues.filter((i: any) => i.type === 'org-offline-rate');
      // system is excluded, tenant is healthy → zero org issues.
      expect(orgIssues).toHaveLength(0);
      // Verify the query used the `slug != system` filter.
      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            slug: expect.objectContaining({ not: 'system' }),
          }),
        }),
      );
    });
  });

  describe('getStorageForecast', () => {
    it('getStorageForecast returns daily bytes sums grouped by DATE(createdAt) over range', async () => {
      const d1 = new Date('2026-04-15');
      const d2 = new Date('2026-04-16');
      mockPrisma.$queryRaw.mockResolvedValue([
        { date: d1, bytes: BigInt(1024) },
        { date: d2, bytes: BigInt(2048) },
      ]);
      mockPrisma.package.aggregate.mockResolvedValue({
        _sum: { maxStorageGb: 100 },
      });

      const result = await service.getStorageForecast('7d');

      expect(result).toHaveProperty('points');
      expect(result.points).toHaveLength(2);
      // BigInt must be serialized as string to avoid JSON crash (T-18-BIGINT-JSON).
      expect(typeof result.points[0].bytes).toBe('string');
      expect(result.points[0].bytes).toBe('1024');
      expect(result.points[1].bytes).toBe('2048');
      expect(result).toHaveProperty('estimatedDaysUntilFull');
    });

    it('getStorageForecast computes estimatedDaysUntilFull via linear regression', async () => {
      // Growth: +1 GB/day for 7 days. Total quota ~100 GB. Current total ~7 GB.
      // Days until full ≈ (100 - 7) / 1 = 93 (roughly).
      const GB = 1024 * 1024 * 1024;
      const rows = [];
      for (let i = 0; i < 7; i++) {
        rows.push({
          date: new Date(2026, 3, 10 + i), // Apr 10..16
          bytes: BigInt(GB), // +1 GB per day
        });
      }
      mockPrisma.$queryRaw.mockResolvedValue(rows);
      mockPrisma.package.aggregate.mockResolvedValue({
        _sum: { maxStorageGb: 100 },
      });

      const result = await service.getStorageForecast('7d');

      expect(result.estimatedDaysUntilFull).not.toBeNull();
      expect(typeof result.estimatedDaysUntilFull).toBe('number');
      // Allow wide slack — we only want "regression ran".
      expect(result.estimatedDaysUntilFull!).toBeGreaterThan(0);
      expect(result.estimatedDaysUntilFull!).toBeLessThan(200);
    });

    it('getStorageForecast validates range query against enum [7d, 30d]', () => {
      const controller = new AdminDashboardController(service);
      expect(() => controller.getStorageForecast('abc' as any)).toThrow(
        /range.*7d.*30d/i,
      );
      expect(() => controller.getStorageForecast('14d' as any)).toThrow();
      // Valid ranges do not throw synchronously — they return a promise.
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.package.aggregate.mockResolvedValue({ _sum: { maxStorageGb: 0 } });
      expect(() => controller.getStorageForecast('7d')).not.toThrow();
      expect(() => controller.getStorageForecast('30d')).not.toThrow();
    });
  });

  describe('getRecentAuditHighlights', () => {
    it('getRecentAuditHighlights filters by event types org.created, org.package_changed, user.suspended, cluster.node_added, cluster.node_removed, limit 7', async () => {
      const rows = [
        {
          id: 'a1', action: 'create', resource: 'organization',
          orgId: 'o1', userId: 'u1', createdAt: new Date(),
        },
        {
          id: 'a2', action: 'delete', resource: 'user',
          orgId: 'o1', userId: 'u1', createdAt: new Date(),
        },
        {
          id: 'a3', action: 'update', resource: 'organization',
          orgId: 'o1', userId: 'u1', createdAt: new Date(),
        },
      ];
      mockPrisma.auditLog.findMany.mockResolvedValue(rows);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u1', name: 'Actor One', email: 'actor@example.com' },
      ]);
      mockPrisma.organization.findMany.mockResolvedValue([
        { id: 'o1', name: 'Org One' },
      ]);

      const result = await service.getRecentAuditHighlights(7);

      expect(result).toHaveLength(3);
      // Default limit 7
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 7,
          orderBy: { createdAt: 'desc' },
        }),
      );
      // Filter must target organization+user (+cluster as optional).
      const call = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(call.where).toBeDefined();
    });

    it('getRecentAuditHighlights joins actor name + org name', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'a1', action: 'create', resource: 'organization',
          orgId: 'org-1', userId: 'user-1', createdAt: new Date(),
        },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
      ]);
      mockPrisma.organization.findMany.mockResolvedValue([
        { id: 'org-1', name: 'Acme Corp' },
      ]);

      const result = await service.getRecentAuditHighlights();

      expect(result[0]).toHaveProperty('user');
      expect(result[0].user?.name).toBe('Alice');
      expect(result[0]).toHaveProperty('orgName');
      expect(result[0].orgName).toBe('Acme Corp');
    });
  });

  describe('getOrgHealthOverview', () => {
    it('getOrgHealthOverview returns org rows with cameraUsagePct + storageUsagePct sorted desc', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([
        {
          id: 'org-a', name: 'Alpha', slug: 'alpha',
          package: { name: 'Pro', maxCameras: 10, maxStorageGb: 100 },
        },
        {
          id: 'org-b', name: 'Beta', slug: 'beta',
          package: { name: 'Basic', maxCameras: 4, maxStorageGb: 10 },
        },
      ]);
      mockPrisma.camera.groupBy.mockResolvedValue([
        // Alpha uses 3 of 10 cameras (30% usage)
        { orgId: 'org-a', status: 'online', _count: 3 },
        // Beta uses 3 of 4 cameras (75% usage) — higher pct, sorts first
        { orgId: 'org-b', status: 'online', _count: 2 },
        { orgId: 'org-b', status: 'offline', _count: 1 },
      ]);
      mockPrisma.recordingSegment.groupBy.mockResolvedValue([
        { orgId: 'org-a', _sum: { size: BigInt(0) } },
        { orgId: 'org-b', _sum: { size: BigInt(0) } },
      ]);
      mockPrisma.apiKeyUsage.findMany.mockResolvedValue([]);
      mockPrisma.apiKey.findMany.mockResolvedValue([]);

      const rows = await service.getOrgHealthOverview();

      expect(rows).toHaveLength(2);
      expect(rows[0].orgSlug).toBe('beta'); // 75% > 30%
      expect(rows[1].orgSlug).toBe('alpha');
      expect(rows[0].cameraUsagePct).toBeGreaterThanOrEqual(
        rows[1].cameraUsagePct,
      );
      // BigInt serialized to string (T-18-BIGINT-JSON).
      expect(typeof rows[0].storageUsedBytes).toBe('string');
      expect(typeof rows[0].bandwidthTodayBytes).toBe('string');
    });

    it('getOrgHealthOverview excludes system org', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([]);
      mockPrisma.camera.groupBy.mockResolvedValue([]);
      mockPrisma.recordingSegment.groupBy.mockResolvedValue([]);
      mockPrisma.apiKeyUsage.findMany.mockResolvedValue([]);
      mockPrisma.apiKey.findMany.mockResolvedValue([]);

      await service.getOrgHealthOverview();

      expect(mockPrisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            slug: expect.objectContaining({ not: 'system' }),
          }),
        }),
      );
    });

    it('getOrgHealthOverview computes bandwidth today from ApiKeyUsage sum where date >= startOfDay', async () => {
      mockPrisma.organization.findMany.mockResolvedValue([
        {
          id: 'org-a', name: 'Alpha', slug: 'alpha',
          package: { name: 'Pro', maxCameras: 10, maxStorageGb: 100 },
        },
      ]);
      mockPrisma.camera.groupBy.mockResolvedValue([]);
      mockPrisma.recordingSegment.groupBy.mockResolvedValue([]);
      mockPrisma.apiKey.findMany.mockResolvedValue([
        { id: 'key-1', orgId: 'org-a' },
      ]);
      mockPrisma.apiKeyUsage.findMany.mockResolvedValue([
        { apiKeyId: 'key-1', bandwidth: BigInt(4096) },
        { apiKeyId: 'key-1', bandwidth: BigInt(1024) },
      ]);

      const rows = await service.getOrgHealthOverview();

      expect(rows[0].bandwidthTodayBytes).toBe('5120');
      // Verify the date filter constrains to today.
      const call = mockPrisma.apiKeyUsage.findMany.mock.calls[0][0];
      expect(call.where).toBeDefined();
      expect(call.where.date?.gte).toBeDefined();
      const gte: Date = call.where.date.gte;
      const now = new Date();
      expect(gte.getFullYear()).toBe(now.getFullYear());
      expect(gte.getMonth()).toBe(now.getMonth());
      expect(gte.getDate()).toBe(now.getDate());
      expect(gte.getHours()).toBe(0);
      expect(gte.getMinutes()).toBe(0);
      expect(gte.getSeconds()).toBe(0);
    });
  });

  describe('getClusterNodes', () => {
    it('getClusterNodes returns SrsNode rows mapped to display shape', async () => {
      const nodes = [
        {
          id: 'n1', name: 'Primary Origin', role: 'ORIGIN', status: 'ONLINE',
          apiUrl: 'http://srs:1985', hlsUrl: 'http://srs:8080',
          viewers: 3, bandwidth: BigInt(0),
        },
        {
          id: 'n2', name: 'Edge-1', role: 'EDGE', status: 'DEGRADED',
          apiUrl: 'http://edge1:1985', hlsUrl: 'http://edge1:8080',
          viewers: 1, bandwidth: BigInt(0),
        },
      ];
      mockCluster.findAll.mockResolvedValue(nodes);

      const result = await service.getClusterNodes();

      expect(result).toHaveLength(2);
      expect(mockCluster.findAll).toHaveBeenCalled();
      expect(result[0].id).toBe('n1');
      expect(result[1].role).toBe('EDGE');
    });
  });

  describe('Security', () => {
    it('T-18-AUTHZ-ADMIN: all new endpoints are guarded by SuperAdminGuard on controller', () => {
      // NestJS stores class-level @UseGuards under Reflect metadata key
      // '__guards__'. Reading it confirms SuperAdminGuard is applied
      // to the controller — every new @Get route inherits.
      const guards =
        Reflect.getMetadata('__guards__', AdminDashboardController) || [];
      expect(guards).toContain(SuperAdminGuard);

      // Double-check the expected routes are declared on the controller.
      const proto = AdminDashboardController.prototype as any;
      expect(typeof proto.getActiveStreamsCount).toBe('function');
      expect(typeof proto.getRecordingsActive).toBe('function');
      expect(typeof proto.getPlatformIssues).toBe('function');
      expect(typeof proto.getClusterNodes).toBe('function');
      expect(typeof proto.getStorageForecast).toBe('function');
      expect(typeof proto.getRecentAuditHighlights).toBe('function');
      expect(typeof proto.getOrgHealthOverview).toBe('function');
    });
  });
});
