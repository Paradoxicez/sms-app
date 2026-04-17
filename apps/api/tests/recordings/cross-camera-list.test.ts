import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingsService } from '../../src/recordings/recordings.service';
import { MinioService } from '../../src/recordings/minio.service';

describe('RecordingsService - Cross-Camera List (REC-01, REC-02)', () => {
  let service: RecordingsService;
  let minioService: Partial<MinioService>;
  let tenancyClient: any;
  let rawPrisma: any;

  const mockRecordings = [
    {
      id: 'rec-1',
      cameraId: 'cam-1',
      orgId: 'org-1',
      status: 'complete',
      startedAt: new Date('2026-04-10T08:00:00Z'),
      stoppedAt: new Date('2026-04-10T09:00:00Z'),
      totalSize: BigInt(1024 * 1024 * 500), // 500 MB
      totalDuration: 3600,
      initSegment: 'cam-1/2026-04-10/init.mp4',
      camera: {
        id: 'cam-1',
        name: 'Front Door',
        site: { id: 'site-1', name: 'HQ', project: { id: 'proj-1', name: 'Office' } },
      },
    },
    {
      id: 'rec-2',
      cameraId: 'cam-2',
      orgId: 'org-1',
      status: 'recording',
      startedAt: new Date('2026-04-10T10:00:00Z'),
      stoppedAt: null,
      totalSize: BigInt(0),
      totalDuration: 0,
      initSegment: null,
      camera: {
        id: 'cam-2',
        name: 'Parking Lot',
        site: { id: 'site-1', name: 'HQ', project: { id: 'proj-1', name: 'Office' } },
      },
    },
  ];

  beforeEach(() => {
    minioService = {
      ensureBucket: vi.fn().mockResolvedValue(undefined),
      removeObject: vi.fn().mockResolvedValue(undefined),
      removeObjects: vi.fn().mockResolvedValue(undefined),
    };

    tenancyClient = {
      recording: {
        findMany: vi.fn().mockResolvedValue(mockRecordings),
        count: vi.fn().mockResolvedValue(2),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      camera: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    rawPrisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'org-1',
          package: { maxStorageGb: 100 },
        }),
      },
      recording: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      recordingSegment: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0n } }),
      },
    };

    service = new RecordingsService(
      tenancyClient,
      rawPrisma,
      minioService as MinioService,
    );
  });

  it('returns paginated response shape { data, total, page, pageSize }', async () => {
    const result = await service.findAllRecordings('org-1', { page: 1, pageSize: 10 });

    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('total', 2);
    expect(result).toHaveProperty('page', 1);
    expect(result).toHaveProperty('pageSize', 10);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('converts BigInt totalSize to Number in response', async () => {
    const result = await service.findAllRecordings('org-1', { page: 1, pageSize: 10 });

    expect(typeof result.data[0].totalSize).toBe('number');
    expect(result.data[0].totalSize).toBe(1024 * 1024 * 500);
    // null totalSize stays null
    expect(result.data[1].totalSize).toBeNull();
  });

  it('applies cameraId filter to where clause', async () => {
    await service.findAllRecordings('org-1', { page: 1, pageSize: 10, cameraId: 'cam-1' });

    expect(tenancyClient.recording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cameraId: 'cam-1' }),
      }),
    );
  });

  it('applies status filter with comma-separated values', async () => {
    await service.findAllRecordings('org-1', { page: 1, pageSize: 10, status: 'complete,error' });

    expect(tenancyClient.recording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['complete', 'error'] } }),
      }),
    );
  });

  it('applies single status filter as string', async () => {
    await service.findAllRecordings('org-1', { page: 1, pageSize: 10, status: 'complete' });

    expect(tenancyClient.recording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'complete' }),
      }),
    );
  });

  it('applies date range filter with startDate and endDate', async () => {
    await service.findAllRecordings('org-1', {
      page: 1,
      pageSize: 10,
      startDate: '2026-04-01',
      endDate: '2026-04-15',
    });

    const callArgs = tenancyClient.recording.findMany.mock.calls[0][0];
    expect(callArgs.where.startedAt).toBeDefined();
    expect(callArgs.where.startedAt.gte).toEqual(new Date('2026-04-01'));
    expect(callArgs.where.startedAt.lte).toBeDefined();
  });

  it('calculates correct skip for pagination', async () => {
    await service.findAllRecordings('org-1', { page: 3, pageSize: 25 });

    expect(tenancyClient.recording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 50,
        take: 25,
      }),
    );
  });

  it('includes camera -> site -> project join in query', async () => {
    await service.findAllRecordings('org-1', { page: 1, pageSize: 10 });

    expect(tenancyClient.recording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          camera: expect.objectContaining({
            select: expect.objectContaining({
              id: true,
              name: true,
              site: expect.objectContaining({
                select: expect.objectContaining({
                  id: true,
                  name: true,
                  project: expect.objectContaining({
                    select: expect.objectContaining({ id: true, name: true }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('orders by startedAt descending', async () => {
    await service.findAllRecordings('org-1', { page: 1, pageSize: 10 });

    expect(tenancyClient.recording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { startedAt: 'desc' },
      }),
    );
  });
});
