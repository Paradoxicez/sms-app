import { describe, it, beforeEach, vi } from 'vitest';
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

    service = new RecordingsService(
      tenancyClient,
      rawPrisma,
      minioService as MinioService,
    );
  });

  it.todo('returns camera include: payload contains camera.id, camera.name, camera.site.name, camera.site.project.name');
  it.todo('cross-org 404: getRecording with id from another org throws NotFoundException (not Forbidden, not the recording)');
  it.todo('preserves existing _count.segments include');
  it.todo('throws NotFoundException when recording id does not exist in any org');
});
