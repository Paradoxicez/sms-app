import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingsService } from '../../src/recordings/recordings.service';

describe('RecordingsService - Storage Quota (REC-05)', () => {
  let service: RecordingsService;
  let mockTenantPrisma: any;
  let mockSystemPrisma: any;
  let mockRawPrisma: any;
  let mockMinioService: any;

  beforeEach(() => {
    // tenantPrisma is unused in storage-quota path after 260420-oid; keep empty
    mockTenantPrisma = {};

    // systemPrisma carries the worker-context calls: notification CRUD, member
    // lookups, and recordingSegment aggregation.
    mockSystemPrisma = {
      notification: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      member: {
        findMany: vi.fn(),
      },
      recordingSegment: {
        aggregate: vi.fn(),
      },
    };

    // rawPrisma still owns the Organization/package read (no RLS on Organization).
    mockRawPrisma = {
      organization: {
        findUnique: vi.fn(),
      },
    };

    mockMinioService = {};

    service = new RecordingsService(
      mockTenantPrisma,
      mockSystemPrisma,
      mockRawPrisma,
      mockMinioService,
    );
  });

  it('blocks new recordings when storage usage reaches 100% of maxStorageGb', async () => {
    mockRawPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      package: { maxStorageGb: 10 },
    });
    // 10 GB = 10 * 1024 * 1024 * 1024 = 10737418240 bytes
    mockSystemPrisma.recordingSegment.aggregate.mockResolvedValue({
      _sum: { size: BigInt(10737418240) },
    });

    const result = await service.checkStorageQuota('org-1');

    expect(result.allowed).toBe(false);
    expect(result.usagePercent).toBe(100);
  });

  it('allows recording when storage usage is below quota', async () => {
    mockRawPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      package: { maxStorageGb: 10 },
    });
    // 5 GB usage out of 10 GB
    mockSystemPrisma.recordingSegment.aggregate.mockResolvedValue({
      _sum: { size: BigInt(5 * 1024 * 1024 * 1024) },
    });

    const result = await service.checkStorageQuota('org-1');

    expect(result.allowed).toBe(true);
    expect(result.usagePercent).toBe(50);
  });

  it('sends notification alert at 80% storage threshold', async () => {
    // Mock checkStorageQuota dependencies
    mockRawPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      package: { maxStorageGb: 100 },
    });
    // 85 GB out of 100 GB = 85%
    mockSystemPrisma.recordingSegment.aggregate.mockResolvedValue({
      _sum: { size: BigInt(85 * 1024 * 1024 * 1024) },
    });
    // No recent alert
    mockSystemPrisma.notification.findFirst.mockResolvedValue(null);
    mockSystemPrisma.member.findMany.mockResolvedValue([{ userId: 'user-1' }]);
    mockSystemPrisma.notification.create.mockResolvedValue({});

    await service.checkAndAlertStorageQuota('org-1');

    expect(mockSystemPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: 'org-1',
          type: 'system.alert',
          title: 'Storage usage high',
        }),
      }),
    );
  });

  it('sends notification alert at 90% storage threshold', async () => {
    mockRawPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      package: { maxStorageGb: 100 },
    });
    // 95 GB out of 100 GB = 95%
    mockSystemPrisma.recordingSegment.aggregate.mockResolvedValue({
      _sum: { size: BigInt(95 * 1024 * 1024 * 1024) },
    });
    mockSystemPrisma.notification.findFirst.mockResolvedValue(null);
    mockSystemPrisma.member.findMany.mockResolvedValue([{ userId: 'user-1' }]);
    mockSystemPrisma.notification.create.mockResolvedValue({});

    await service.checkAndAlertStorageQuota('org-1');

    expect(mockSystemPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: 'org-1',
          type: 'system.alert',
          title: 'Storage nearly full',
        }),
      }),
    );
  });

  it('calculates storage usage from DB segment size aggregation', async () => {
    mockRawPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      package: { maxStorageGb: 50 },
    });
    mockSystemPrisma.recordingSegment.aggregate.mockResolvedValue({
      _sum: { size: BigInt(25 * 1024 * 1024 * 1024) },
    });

    const result = await service.checkStorageQuota('org-1');

    expect(mockSystemPrisma.recordingSegment.aggregate).toHaveBeenCalledWith({
      where: { orgId: 'org-1' },
      _sum: { size: true },
    });
    expect(result.usageBytes).toBe(BigInt(25 * 1024 * 1024 * 1024));
    expect(result.limitBytes).toBe(BigInt(50 * 1024 * 1024 * 1024));
    expect(result.usagePercent).toBe(50);
  });
});
