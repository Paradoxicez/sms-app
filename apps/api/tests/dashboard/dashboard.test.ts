import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { testPrisma } from '../setup';
import { cleanupTestData } from '../helpers/tenancy';
import { DashboardService } from '../../src/dashboard/dashboard.service';

describe('DashboardService', () => {
  describe('getStats', () => {
    it.todo('returns camera counts (online, offline, total) for the calling org');
    it.todo('returns total viewer count aggregated from StatusService');
    it.todo('returns bandwidth data from ApiKeyUsage or SRS streams');
    it.todo('scopes all queries to the calling org via TENANCY_CLIENT');
  });

  describe('getCameraStatusList', () => {
    it.todo('returns cameras sorted by status (offline first, then degraded, then online)');
    it.todo('enriches cameras with viewer counts from StatusService');
  });

  describe('getUsageTimeSeries', () => {
    it.todo('returns time series data for 7d range grouped by date');
    it.todo('returns time series data for 30d range grouped by date');
    it.todo('returns single data point for 24h range');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 18 enrichments — Plan 01 (flipped from it.todo → it).
// Maps to 18-RESEARCH.md §Validation Architecture (lines 849-907).
// Threat coverage: T-18-TENANCY-ISSUES (cross-tenant leak), Phase-15 field
// spelling (maintenanceEnteredBy/At, NOT maintenanceEnabledBy/At).
// ────────────────────────────────────────────────────────────────────────────
describe('DashboardService Phase 18 enrichments', () => {
  // Use the test DB directly as the TENANCY_CLIENT substitute — the service
  // only hits the `camera`/`apiKeyUsage` delegates so PrismaClient satisfies
  // the shape. RLS is bypassed because testPrisma connects as the `sms`
  // superuser (see tests/setup.ts).
  const mockSrsApiService = {
    getStreams: vi.fn(),
    getSummaries: vi.fn(),
    getVersions: vi.fn(),
  };

  const mockStatusService = {
    getViewerCount: vi.fn().mockReturnValue(0),
  };

  const mockRedis = {
    keys: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
  };

  let service: DashboardService;

  async function seedOrg(slug: string): Promise<{ orgId: string; siteId: string }> {
    const org = await testPrisma.organization.create({
      data: {
        id: randomUUID(),
        name: `Org ${slug}`,
        slug,
      },
    });
    const project = await testPrisma.project.create({
      data: {
        orgId: org.id,
        name: `${slug}-project`,
      },
    });
    const site = await testPrisma.site.create({
      data: {
        orgId: org.id,
        projectId: project.id,
        name: `${slug}-site`,
      },
    });
    return { orgId: org.id, siteId: site.id };
  }

  async function seedCamera(
    orgId: string,
    siteId: string,
    overrides: Partial<{
      name: string;
      status: string;
      isRecording: boolean;
      maintenanceMode: boolean;
      maintenanceEnteredBy: string | null;
      maintenanceEnteredAt: Date | null;
      retentionDays: number | null;
    }> = {},
  ) {
    return testPrisma.camera.create({
      data: {
        orgId,
        siteId,
        name: overrides.name ?? 'cam',
        streamUrl: 'rtsp://example/stream',
        status: overrides.status ?? 'offline',
        isRecording: overrides.isRecording ?? false,
        maintenanceMode: overrides.maintenanceMode ?? false,
        maintenanceEnteredBy: overrides.maintenanceEnteredBy ?? null,
        maintenanceEnteredAt: overrides.maintenanceEnteredAt ?? null,
        retentionDays: overrides.retentionDays ?? null,
      },
    });
  }

  beforeEach(async () => {
    await cleanupTestData(testPrisma);
    vi.clearAllMocks();
    mockStatusService.getViewerCount.mockReturnValue(0);
    mockSrsApiService.getStreams.mockResolvedValue({ streams: [] });

    service = new DashboardService(
      testPrisma as any,
      mockSrsApiService as any,
      mockStatusService as any,
      mockRedis as any,
    );
  });

  afterEach(async () => {
    await cleanupTestData(testPrisma);
  });

  describe('getCameraStatusList — Phase 18 fields', () => {
    it('getCameraStatusList includes isRecording, maintenanceMode, maintenanceEnteredBy, maintenanceEnteredAt, retentionDays', async () => {
      const { orgId, siteId } = await seedOrg('acme');
      const enteredAt = new Date('2026-04-20T12:00:00Z');
      await seedCamera(orgId, siteId, {
        name: 'cam-a',
        status: 'online',
        isRecording: true,
        maintenanceMode: true,
        maintenanceEnteredBy: 'user-42',
        maintenanceEnteredAt: enteredAt,
        retentionDays: 7,
      });
      await seedCamera(orgId, siteId, {
        name: 'cam-b',
        status: 'offline',
      });

      const rows = await service.getCameraStatusList(orgId);

      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toHaveProperty('isRecording');
        expect(row).toHaveProperty('maintenanceMode');
        expect(row).toHaveProperty('maintenanceEnteredBy');
        expect(row).toHaveProperty('maintenanceEnteredAt');
        expect(row).toHaveProperty('retentionDays');
      }

      const camA = rows.find((r: any) => r.name === 'cam-a')!;
      expect(camA.isRecording).toBe(true);
      expect(camA.maintenanceMode).toBe(true);
      expect(camA.maintenanceEnteredBy).toBe('user-42');
      expect(camA.maintenanceEnteredAt).toBe(enteredAt.toISOString());
      expect(camA.retentionDays).toBe(7);

      const camB = rows.find((r: any) => r.name === 'cam-b')!;
      expect(camB.isRecording).toBe(false);
      expect(camB.maintenanceMode).toBe(false);
      expect(camB.maintenanceEnteredBy).toBeNull();
      expect(camB.maintenanceEnteredAt).toBeNull();
      expect(camB.retentionDays).toBeNull();
    });

    it('getCameraStatusList scopes to org (TENANCY_CLIENT no cross-tenant leak) — T-18-TENANCY-ISSUES', async () => {
      const orgA = await seedOrg('tenant-a');
      const orgB = await seedOrg('tenant-b');

      await seedCamera(orgA.orgId, orgA.siteId, { name: 'cam-a-only' });
      await seedCamera(orgB.orgId, orgB.siteId, { name: 'cam-b-only' });

      const rowsForA = await service.getCameraStatusList(orgA.orgId);
      expect(rowsForA).toHaveLength(1);
      expect(rowsForA[0].name).toBe('cam-a-only');

      // And orgB is likewise isolated.
      const rowsForB = await service.getCameraStatusList(orgB.orgId);
      expect(rowsForB).toHaveLength(1);
      expect(rowsForB[0].name).toBe('cam-b-only');
    });
  });

  describe('getStats — Phase 18 counters', () => {
    it('getStats adds camerasRecording (count where isRecording=true) and camerasInMaintenance (count where maintenanceMode=true)', async () => {
      const { orgId, siteId } = await seedOrg('counters');
      // 3 recording, 2 in maintenance (one overlap — recording+maintenance),
      // 1 neither.
      await seedCamera(orgId, siteId, { name: 'r1', isRecording: true });
      await seedCamera(orgId, siteId, { name: 'r2', isRecording: true });
      await seedCamera(orgId, siteId, {
        name: 'rm',
        isRecording: true,
        maintenanceMode: true,
      });
      await seedCamera(orgId, siteId, {
        name: 'm',
        maintenanceMode: true,
      });
      await seedCamera(orgId, siteId, { name: 'idle' });

      const stats = await service.getStats(orgId);

      expect(stats).toHaveProperty('camerasRecording');
      expect(stats).toHaveProperty('camerasInMaintenance');
      expect(stats.camerasRecording).toBe(3);
      expect(stats.camerasInMaintenance).toBe(2);
      // Existing counters still correct.
      expect(stats.totalCameras).toBe(5);
    });
  });
});
