import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingsService } from '../../src/recordings/recordings.service';
import { MinioService } from '../../src/recordings/minio.service';

describe('RecordingsService - Recording Lifecycle (REC-03)', () => {
  let service: RecordingsService;
  let minioService: Partial<MinioService>;
  let tenantPrisma: any;
  let systemPrisma: any;
  let rawPrisma: any;

  beforeEach(() => {
    minioService = {
      ensureBucket: vi.fn().mockResolvedValue(undefined),
      uploadSegment: vi.fn().mockResolvedValue(undefined),
      removeObject: vi.fn().mockResolvedValue(undefined),
      removeObjects: vi.fn().mockResolvedValue(undefined),
    };

    // tenantPrisma is now used only for HTTP-CRUD methods (getRecording etc.)
    // Recording lifecycle methods (startRecording, stopRecording) route through
    // systemPrisma after this plan (260420-oid).
    tenantPrisma = {
      recording: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
      },
    };

    systemPrisma = {
      camera: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cam-1',
          orgId: 'org-1',
          status: 'online',
          isRecording: false,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      recording: {
        create: vi.fn().mockResolvedValue({
          id: 'rec-1',
          orgId: 'org-1',
          cameraId: 'cam-1',
          status: 'recording',
          startedAt: new Date(),
        }),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      recordingSegment: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { size: 0n } }),
      },
    };

    rawPrisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'org-1',
          package: { maxStorageGb: 100 },
        }),
      },
    };

    service = new RecordingsService(
      tenantPrisma,
      systemPrisma,
      rawPrisma,
      minioService as MinioService,
    );
  });

  it('starts recording: creates Recording record with status=recording', async () => {
    const result = await service.startRecording('cam-1', 'org-1');

    expect(systemPrisma.recording.create).toHaveBeenCalledWith({
      data: {
        orgId: 'org-1',
        cameraId: 'cam-1',
        status: 'recording',
      },
    });
    expect(result.status).toBe('recording');
  });

  it('starts recording: sets camera isRecording flag to true', async () => {
    await service.startRecording('cam-1', 'org-1');

    expect(systemPrisma.camera.update).toHaveBeenCalledWith({
      where: { id: 'cam-1' },
      data: { isRecording: true },
    });
  });

  it('stops recording: sets Recording status to complete and stoppedAt timestamp', async () => {
    systemPrisma.recording.findFirst.mockResolvedValue({
      id: 'rec-1',
      status: 'recording',
    });
    systemPrisma.recording.update.mockResolvedValue({
      id: 'rec-1',
      status: 'complete',
      stoppedAt: new Date(),
    });

    const result = await service.stopRecording('cam-1', 'org-1');

    expect(systemPrisma.recording.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: {
        status: 'complete',
        stoppedAt: expect.any(Date),
      },
    });
    expect(result.status).toBe('complete');
    expect(result.stoppedAt).toBeDefined();
  });

  it('stops recording: clears camera isRecording flag', async () => {
    systemPrisma.recording.findFirst.mockResolvedValue({
      id: 'rec-1',
      status: 'recording',
    });
    systemPrisma.recording.update.mockResolvedValue({
      id: 'rec-1',
      status: 'complete',
      stoppedAt: new Date(),
    });

    await service.stopRecording('cam-1', 'org-1');

    expect(systemPrisma.camera.update).toHaveBeenCalledWith({
      where: { id: 'cam-1' },
      data: { isRecording: false },
    });
  });

  it('rejects start when camera is already recording', async () => {
    systemPrisma.camera.findFirst.mockResolvedValue({
      id: 'cam-1',
      orgId: 'org-1',
      status: 'online',
      isRecording: true,
    });

    await expect(service.startRecording('cam-1', 'org-1')).rejects.toThrow(
      'already recording',
    );
  });

  it('rejects start when camera is offline', async () => {
    systemPrisma.camera.findFirst.mockResolvedValue({
      id: 'cam-1',
      orgId: 'org-1',
      status: 'offline',
      isRecording: false,
    });

    await expect(service.startRecording('cam-1', 'org-1')).rejects.toThrow(
      'offline',
    );
  });

  it('rejects start when storage quota is exceeded', async () => {
    // Set up quota exceeded scenario — checkStorageQuota uses systemPrisma now
    systemPrisma.recordingSegment.aggregate.mockResolvedValue({
      _sum: { size: BigInt(100) * BigInt(1024 * 1024 * 1024) }, // 100 GB used
    });

    await expect(service.startRecording('cam-1', 'org-1')).rejects.toThrow(
      'quota exceeded',
    );
  });
});
