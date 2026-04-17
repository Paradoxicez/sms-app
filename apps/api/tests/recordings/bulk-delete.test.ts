import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingsService } from '../../src/recordings/recordings.service';
import { MinioService } from '../../src/recordings/minio.service';

describe('RecordingsService - Bulk Delete (REC-03)', () => {
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
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          if (where.id === 'rec-missing') return Promise.resolve(null);
          return Promise.resolve({
            id: where.id,
            orgId: 'org-1',
            segments: [],
            initSegment: null,
          });
        }),
        delete: vi.fn().mockResolvedValue({}),
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

  it('deletes all recordings and returns correct count', async () => {
    const result = await service.bulkDeleteRecordings(['rec-1', 'rec-2', 'rec-3'], 'org-1');

    expect(result.deleted).toBe(3);
    expect(result.failed).toBe(0);
    expect(tenancyClient.recording.delete).toHaveBeenCalledTimes(3);
  });

  it('handles partial failure and returns both deleted and failed counts', async () => {
    // rec-missing will throw NotFoundException
    const result = await service.bulkDeleteRecordings(['rec-1', 'rec-missing', 'rec-3'], 'org-1');

    expect(result.deleted).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('returns zero deleted and zero failed for empty processing', async () => {
    // This tests the service method directly -- controller validates non-empty
    const result = await service.bulkDeleteRecordings([], 'org-1');

    expect(result.deleted).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('calls deleteRecording for each ID sequentially', async () => {
    const deleteSpy = vi.spyOn(service, 'deleteRecording');

    await service.bulkDeleteRecordings(['rec-1', 'rec-2'], 'org-1');

    expect(deleteSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy).toHaveBeenCalledWith('rec-1', 'org-1');
    expect(deleteSpy).toHaveBeenCalledWith('rec-2', 'org-1');
  });
});
