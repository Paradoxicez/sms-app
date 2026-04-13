import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingsService } from '../../src/recordings/recordings.service';

describe('RecordingsService - Storage Quota (REC-05)', () => {
  let service: RecordingsService;
  let mockPrisma: any;
  let mockRawPrisma: any;
  let mockMinioService: any;

  beforeEach(() => {
    mockPrisma = {};

    mockRawPrisma = {
      organization: {
        findUnique: vi.fn(),
      },
      recordingSegment: {
        aggregate: vi.fn(),
      },
      notification: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      member: {
        findMany: vi.fn(),
      },
    };

    mockMinioService = {};

    service = new RecordingsService(mockPrisma, mockRawPrisma, mockMinioService);
  });

  it('blocks new recordings when storage usage reaches 100% of maxStorageGb', async () => {
    mockRawPrisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      package: { maxStorageGb: 10 },
    });
    // 10 GB = 10 * 1024 * 1024 * 1024 = 10737418240 bytes
    mockRawPrisma.recordingSegment.aggregate.mockResolvedValue({
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
    mockRawPrisma.recordingSegment.aggregate.mockResolvedValue({
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
    mockRawPrisma.recordingSegment.aggregate.mockResolvedValue({
      _sum: { size: BigInt(85 * 1024 * 1024 * 1024) },
    });
    // No recent alert
    mockRawPrisma.notification.findFirst.mockResolvedValue(null);
    mockRawPrisma.member.findMany.mockResolvedValue([{ userId: 'user-1' }]);
    mockRawPrisma.notification.create.mockResolvedValue({});

    await service.checkAndAlertStorageQuota('org-1');

    expect(mockRawPrisma.notification.create).toHaveBeenCalledWith(
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
    mockRawPrisma.recordingSegment.aggregate.mockResolvedValue({
      _sum: { size: BigInt(95 * 1024 * 1024 * 1024) },
    });
    mockRawPrisma.notification.findFirst.mockResolvedValue(null);
    mockRawPrisma.member.findMany.mockResolvedValue([{ userId: 'user-1' }]);
    mockRawPrisma.notification.create.mockResolvedValue({});

    await service.checkAndAlertStorageQuota('org-1');

    expect(mockRawPrisma.notification.create).toHaveBeenCalledWith(
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
    mockRawPrisma.recordingSegment.aggregate.mockResolvedValue({
      _sum: { size: BigInt(25 * 1024 * 1024 * 1024) },
    });

    const result = await service.checkStorageQuota('org-1');

    expect(mockRawPrisma.recordingSegment.aggregate).toHaveBeenCalledWith({
      where: { orgId: 'org-1' },
      _sum: { size: true },
    });
    expect(result.usageBytes).toBe(BigInt(25 * 1024 * 1024 * 1024));
    expect(result.limitBytes).toBe(BigInt(50 * 1024 * 1024 * 1024));
    expect(result.usagePercent).toBe(50);
  });
});
