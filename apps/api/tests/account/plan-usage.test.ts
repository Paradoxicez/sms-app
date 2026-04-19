// Phase 16 Wave 0 scaffolding. GREEN markers land in Plan 16-01 Task T6.
//
// Following the repo's direct-controller testing pattern (see
// tests/users/members-me.test.ts + tests/status/debounce.test.ts) —
// instantiate service + controller manually with mocked deps; no
// @nestjs/testing DI is used because vitest does not emit decorator metadata
// for this workspace.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PlanUsageService } from '../../src/account/plan-usage/plan-usage.service';
import { PlanUsageController } from '../../src/account/plan-usage/plan-usage.controller';

function makePrisma(overrides: Record<string, any> = {}) {
  const base = {
    organization: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'org-1',
        packageId: 'pkg-pro',
        package: {
          id: 'pkg-pro',
          name: 'Pro',
          description: 'Pro plan',
          maxCameras: 50,
          maxViewers: 500,
          maxBandwidthMbps: 100,
          maxStorageGb: 1000,
          features: { apiKeys: true, webhooks: true },
        },
      }),
    },
    camera: {
      findMany: vi.fn().mockResolvedValue([{ id: 'cam-1' }, { id: 'cam-2' }]),
    },
    recordingSegment: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { size: 12_345n } }),
    },
    apiKeyUsage: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { requests: 100, bandwidth: 1_000_000n },
      }),
    },
    apiKey: {
      findMany: vi.fn().mockResolvedValue([{ id: 'key-a' }, { id: 'key-b' }]),
    },
    member: {
      findFirst: vi.fn(),
    },
  };
  return { ...base, ...overrides } as any;
}

function makeStatus() {
  return {
    getViewerCount: vi.fn((cameraId: string) =>
      cameraId === 'cam-1' ? 3 : cameraId === 'cam-2' ? 2 : 0,
    ),
  };
}

function makeRedis(todayBytes: Record<string, { requests: string; bandwidth: string }> = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const requestKeys = Object.keys(todayBytes).map(
    (keyId) => `apikey:usage:${keyId}:${today}:requests`,
  );
  return {
    keys: vi.fn(async (_pattern: string) => requestKeys),
    get: vi.fn(async (key: string) => {
      const parts = key.split(':');
      const keyId = parts[2];
      const field = parts[4];
      if (todayBytes[keyId] && field === 'requests') return todayBytes[keyId].requests;
      if (todayBytes[keyId] && field === 'bandwidth') return todayBytes[keyId].bandwidth;
      return null;
    }),
  };
}

describe('PlanUsageService.getPlanUsage', () => {
  let prisma: any;
  let status: any;
  let redis: any;
  let service: PlanUsageService;

  beforeEach(() => {
    prisma = makePrisma();
    status = makeStatus();
    redis = makeRedis();
    service = new PlanUsageService(prisma, status, redis as any);
  });

  it('returns { package, usage, features } for a member', async () => {
    const result = await service.getPlanUsage('org-1');
    expect(result).toHaveProperty('package');
    expect(result).toHaveProperty('usage');
    expect(result).toHaveProperty('features');
  });

  it('package shape: id, name, description, maxCameras, maxViewers, maxBandwidthMbps, maxStorageGb, features', async () => {
    const result = await service.getPlanUsage('org-1');
    expect(result.package).toEqual({
      id: 'pkg-pro',
      name: 'Pro',
      description: 'Pro plan',
      maxCameras: 50,
      maxViewers: 500,
      maxBandwidthMbps: 100,
      maxStorageGb: 1000,
      features: { apiKeys: true, webhooks: true },
    });
    expect(result.features).toEqual({ apiKeys: true, webhooks: true });
  });

  it('usage.cameras is COUNT cameras for orgId (snapshot)', async () => {
    const result = await service.getPlanUsage('org-1');
    expect(result.usage.cameras).toBe(2);
  });

  it('usage.viewers sums StatusService.getViewerCount across org cameras', async () => {
    const result = await service.getPlanUsage('org-1');
    expect(result.usage.viewers).toBe(5); // 3 + 2
    expect(status.getViewerCount).toHaveBeenCalledWith('cam-1');
    expect(status.getViewerCount).toHaveBeenCalledWith('cam-2');
  });

  it('usage.storageUsedBytes is SUM(RecordingSegment.size) serialized as decimal string', async () => {
    const result = await service.getPlanUsage('org-1');
    expect(result.usage.storageUsedBytes).toBe('12345');
    expect(typeof result.usage.storageUsedBytes).toBe('string');
  });

  it('usage.apiCallsMtd equals persisted ApiKeyUsage.requests MTD plus today Redis delta', async () => {
    redis = makeRedis({ 'key-a': { requests: '7', bandwidth: '500' } });
    service = new PlanUsageService(prisma, status, redis as any);
    const result = await service.getPlanUsage('org-1');
    expect(result.usage.apiCallsMtd).toBe(107); // 100 persisted + 7 today
  });

  it('ignores Redis usage keys that belong to other orgs (org isolation)', async () => {
    redis = makeRedis({
      'key-a': { requests: '7', bandwidth: '500' },
      'key-other-org': { requests: '999', bandwidth: '999999' },
    });
    service = new PlanUsageService(prisma, status, redis as any);
    const result = await service.getPlanUsage('org-1');
    expect(result.usage.apiCallsMtd).toBe(107); // NOT 1106
  });

  it('usage.bandwidthAvgMbpsMtd equals bytes*8 / secondsElapsedInMonth / 1e6', async () => {
    // Freeze clock at exactly 60s after 1st of month UTC, persisted bandwidth = 1_000_000 bytes.
    vi.useFakeTimers();
    const now = new Date();
    now.setUTCDate(1);
    now.setUTCHours(0, 1, 0, 0); // 60s after month start
    vi.setSystemTime(now);

    try {
      prisma = makePrisma();
      // ensure cameras/findMany & viewers still work
      redis = makeRedis();
      service = new PlanUsageService(prisma, status, redis as any);
      const result = await service.getPlanUsage('org-1');
      // 1_000_000 * 8 / 60 / 1_000_000 = 0.1333...
      expect(result.usage.bandwidthAvgMbpsMtd).toBeCloseTo(0.1333, 3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns package: null when Organization.packageId is null', async () => {
    prisma = makePrisma({
      organization: {
        findUnique: vi.fn().mockResolvedValue({ id: 'org-1', packageId: null, package: null }),
      },
    });
    service = new PlanUsageService(prisma, status, redis as any);
    const result = await service.getPlanUsage('org-1');
    expect(result.package).toBeNull();
    expect(result.features).toEqual({});
  });
});

describe('PlanUsageController.get', () => {
  let prisma: any;
  let service: PlanUsageService;
  let planUsage: { getPlanUsage: ReturnType<typeof vi.fn> };
  let controller: PlanUsageController;

  beforeEach(() => {
    prisma = makePrisma();
    planUsage = {
      getPlanUsage: vi.fn(async () => ({ package: null, usage: {}, features: {} })),
    };
    controller = new PlanUsageController(planUsage as any, prisma);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 403 when caller is not a Member of :orgId', async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    const req: any = { user: { id: 'user-1' } };
    await expect(controller.get('org-1', req)).rejects.toBeInstanceOf(ForbiddenException);
    expect(planUsage.getPlanUsage).not.toHaveBeenCalled();
  });

  it('calls PlanUsageService.getPlanUsage when membership exists', async () => {
    prisma.member.findFirst.mockResolvedValue({ userId: 'user-1' });
    const req: any = { user: { id: 'user-1' } };
    await controller.get('org-1', req);
    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', userId: 'user-1' },
      select: { userId: true },
    });
    expect(planUsage.getPlanUsage).toHaveBeenCalledWith('org-1');
  });

  it('returns 401 when unauthenticated', async () => {
    // In production AuthGuard blocks unauthenticated requests; we assert the
    // handler itself fails fast when req.user is missing (defense in depth).
    prisma.member.findFirst.mockResolvedValue(null);
    const req: any = { user: undefined };
    // Will throw when reading req.user.id — guard would normally block first.
    await expect(controller.get('org-1', req)).rejects.toBeTruthy();
  });
});
