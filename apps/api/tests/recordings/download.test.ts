import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingsService } from '../../src/recordings/recordings.service';
import { MinioService } from '../../src/recordings/minio.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('Recording Download (REC-04)', () => {
  let service: RecordingsService;
  let minioService: Partial<MinioService>;
  let tenancyClient: any;
  let rawPrisma: any;

  beforeEach(() => {
    minioService = {
      ensureBucket: vi.fn().mockResolvedValue(undefined),
      getPresignedUrl: vi.fn().mockResolvedValue('https://minio.example.com/presigned-url'),
      removeObject: vi.fn().mockResolvedValue(undefined),
      removeObjects: vi.fn().mockResolvedValue(undefined),
    };

    tenancyClient = {
      recording: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        delete: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
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

  it('getRecording returns recording with initSegment when it exists', async () => {
    tenancyClient.recording.findFirst.mockResolvedValue({
      id: 'rec-1',
      orgId: 'org-1',
      initSegment: 'cam-1/2026-04-10/init.mp4',
      _count: { segments: 5 },
      camera: {
        id: 'cam-1',
        name: 'Cam',
        site: { id: 's', name: 'S', project: { id: 'p', name: 'P' } },
      },
    });

    const recording = await service.getRecording('rec-1', 'org-1');

    expect(recording.initSegment).toBe('cam-1/2026-04-10/init.mp4');
    // After Phase 17 plan 02 (T-17-V4): getRecording uses findFirst with {id, orgId}
    expect(tenancyClient.recording.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rec-1', orgId: 'org-1' },
        include: expect.objectContaining({
          _count: { select: { segments: true } },
        }),
      }),
    );
  });

  it('getRecording throws NotFoundException for non-existent recording', async () => {
    tenancyClient.recording.findFirst.mockResolvedValue(null);

    await expect(service.getRecording('rec-missing', 'org-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('getRecording verifies org ownership via TENANCY_CLIENT (IDOR prevention T-12-04 / T-17-V4)', async () => {
    tenancyClient.recording.findFirst.mockResolvedValue({
      id: 'rec-1',
      orgId: 'org-1',
      initSegment: 'cam-1/2026-04-10/init.mp4',
      _count: { segments: 5 },
      camera: {
        id: 'cam-1',
        name: 'Cam',
        site: { id: 's', name: 'S', project: { id: 'p', name: 'P' } },
      },
    });

    await service.getRecording('rec-1', 'org-1');

    // T-17-V4: findFirst is now called with {id, orgId} so cross-org access returns null → 404
    expect(tenancyClient.recording.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rec-1', orgId: 'org-1' } }),
    );
  });

  it('MinioService.getPresignedUrl generates URL with correct params', async () => {
    const url = await (minioService as MinioService).getPresignedUrl!(
      'org-1',
      'cam-1/2026-04-10/init.mp4',
      14400,
    );

    expect(url).toBe('https://minio.example.com/presigned-url');
    expect(minioService.getPresignedUrl).toHaveBeenCalledWith(
      'org-1',
      'cam-1/2026-04-10/init.mp4',
      14400,
    );
  });
});
