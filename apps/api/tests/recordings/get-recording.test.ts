import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecordingsService } from '../../src/recordings/recordings.service';
import { MinioService } from '../../src/recordings/minio.service';

describe('RecordingsService.getRecording (Phase 17 — REC-01, T-17-V4)', () => {
  let service: RecordingsService;
  let minioService: Partial<MinioService>;
  let tenancyClient: any;
  let rawPrisma: any;

  beforeEach(() => {
    minioService = {
      ensureBucket: vi.fn().mockResolvedValue(undefined),
      removeObject: vi.fn().mockResolvedValue(undefined),
      removeObjects: vi.fn().mockResolvedValue(undefined),
    };

    tenancyClient = {
      recording: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        delete: vi.fn(),
      },
      camera: {
        findUnique: vi.fn(),
      },
    };

    rawPrisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({ id: 'org-1', package: { maxStorageGb: 100 } }),
      },
      recording: {
        findFirst: vi.fn(),
      },
      recordingSegment: {
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0n } }),
      },
    };

    // After 260420-oid: dual-injection. systemPrisma not used by getRecording
    // (T-17-V4 mitigation kept on tenantPrisma) — empty mock is sufficient here.
    const systemPrisma: any = {};

    service = new RecordingsService(
      tenancyClient,
      systemPrisma,
      rawPrisma,
      minioService as MinioService,
    );
  });

  it('returns camera include: payload contains camera.id, camera.name, camera.site.name, camera.site.project.name', async () => {
    const mockRec = {
      id: 'rec-1',
      cameraId: 'cam-1',
      orgId: 'org-1',
      status: 'complete',
      startedAt: new Date('2026-04-10T08:00:00Z'),
      stoppedAt: new Date('2026-04-10T09:00:00Z'),
      totalSize: BigInt(500),
      totalDuration: 3600,
      initSegment: 'cam-1/2026-04-10/init.mp4',
      _count: { segments: 30 },
      camera: {
        id: 'cam-1',
        name: 'Front Door',
        tags: [],
        description: null,
        site: {
          id: 'site-1',
          name: 'HQ',
          project: { id: 'proj-1', name: 'Office' },
        },
      },
    };
    tenancyClient.recording.findFirst.mockResolvedValue(mockRec);

    const result = await service.getRecording('rec-1', 'org-1');

    expect(tenancyClient.recording.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rec-1', orgId: 'org-1' },
        include: expect.objectContaining({
          camera: expect.objectContaining({
            select: expect.objectContaining({
              id: true,
              name: true,
              tags: true,
              description: true,
              site: expect.any(Object),
            }),
          }),
          _count: { select: { segments: true } },
        }),
      }),
    );
    expect(result.camera.name).toBe('Front Door');
    expect(result.camera.site.name).toBe('HQ');
    expect(result.camera.site.project.name).toBe('Office');
  });

  it('includes camera.tags + camera.description in response (Phase 23 DEBT-04)', async () => {
    // Arrange: camera with non-empty tags + description (the populated state)
    const mockRec = {
      id: 'rec-1',
      cameraId: 'cam-1',
      orgId: 'org-1',
      status: 'complete',
      startedAt: new Date('2026-04-10T08:00:00Z'),
      stoppedAt: new Date('2026-04-10T09:00:00Z'),
      _count: { segments: 5 },
      camera: {
        id: 'cam-1',
        name: 'Front Door',
        tags: ['entrance', 'outdoor'],
        description: 'North entrance camera',
        site: {
          id: 'site-1',
          name: 'HQ',
          project: { id: 'proj-1', name: 'Main' },
        },
      },
    };
    tenancyClient.recording.findFirst.mockResolvedValue(mockRec);

    const result = await service.getRecording('rec-1', 'org-1');

    expect(result.camera.tags).toEqual(['entrance', 'outdoor']);
    expect(result.camera.description).toBe('North entrance camera');
    // Confirm Prisma include extension was applied
    expect(tenancyClient.recording.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          camera: expect.objectContaining({
            select: expect.objectContaining({
              tags: true,
              description: true,
            }),
          }),
        }),
      }),
    );
  });

  it('handles empty tags array and null description (Phase 23 DEBT-04)', async () => {
    const mockRec = {
      id: 'rec-2',
      cameraId: 'cam-2',
      orgId: 'org-1',
      _count: { segments: 0 },
      camera: {
        id: 'cam-2',
        name: 'Test',
        tags: [],
        description: null,
        site: {
          id: 'site-1',
          name: 'HQ',
          project: { id: 'proj-1', name: 'Main' },
        },
      },
    };
    tenancyClient.recording.findFirst.mockResolvedValue(mockRec);

    const result = await service.getRecording('rec-2', 'org-1');

    expect(result.camera.tags).toEqual([]);
    expect(result.camera.description).toBeNull();
  });

  it('cross-org 404: getRecording with id from another org throws NotFoundException (not Forbidden, not the recording)', async () => {
    // Prisma findFirst with {id, orgId} returns null when record belongs to a different org
    tenancyClient.recording.findFirst.mockResolvedValue(null);

    await expect(service.getRecording('rec-from-org2', 'org-1')).rejects.toThrow(
      /not found/i,
    );

    expect(tenancyClient.recording.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rec-from-org2', orgId: 'org-1' },
      }),
    );
  });

  it('preserves existing _count.segments include', async () => {
    tenancyClient.recording.findFirst.mockResolvedValue({
      id: 'rec-1',
      cameraId: 'cam-1',
      orgId: 'org-1',
      _count: { segments: 42 },
      camera: {
        id: 'cam-1',
        name: 'Cam',
        site: { id: 's', name: 'S', project: { id: 'p', name: 'P' } },
      },
    });

    const result = await service.getRecording('rec-1', 'org-1');
    expect(result._count.segments).toBe(42);
  });

  it('throws NotFoundException when recording id does not exist in any org', async () => {
    tenancyClient.recording.findFirst.mockResolvedValue(null);
    await expect(service.getRecording('does-not-exist', 'org-1')).rejects.toThrow(
      /Recording does-not-exist not found/,
    );
  });
});
