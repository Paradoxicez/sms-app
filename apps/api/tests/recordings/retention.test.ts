import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetentionProcessor } from '../../src/recordings/retention.processor';

describe('RetentionProcessor - Retention Cleanup (REC-04)', () => {
  let processor: RetentionProcessor;
  let mockPrisma: any;
  let mockMinioService: any;

  beforeEach(() => {
    mockPrisma = {
      recording: {
        findMany: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      },
      recordingSegment: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        aggregate: vi.fn(),
      },
      orgSettings: {
        findUnique: vi.fn(),
      },
      camera: {
        findUnique: vi.fn(),
      },
    };

    mockMinioService = {
      removeObjects: vi.fn(),
    };

    processor = new RetentionProcessor(mockPrisma, mockMinioService);
  });

  it('deletes segments older than camera-level retention period', async () => {
    mockPrisma.recording.findMany.mockResolvedValue([{ orgId: 'org-1' }]);
    mockPrisma.orgSettings.findUnique.mockResolvedValue({ defaultRetentionDays: 30 });
    mockPrisma.recordingSegment.findMany
      .mockResolvedValueOnce([{ cameraId: 'cam-1' }]) // distinct cameras
      .mockResolvedValueOnce([ // expired segments
        { id: 's1', objectPath: 'cam-1/old/seg1.m4s', recordingId: 'rec-1', size: 1000n },
      ]);
    mockPrisma.camera.findUnique.mockResolvedValue({ retentionDays: 7 });
    mockMinioService.removeObjects.mockResolvedValue(undefined);
    mockPrisma.recordingSegment.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.recordingSegment.aggregate.mockResolvedValue({ _sum: { size: 5000n }, _count: 2 });
    mockPrisma.recording.update.mockResolvedValue({});

    await processor.cleanupOrg('org-1');

    // Should use camera's retentionDays (7), not org default (30)
    const findManyCall = mockPrisma.recordingSegment.findMany.mock.calls[1][0];
    expect(findManyCall.where.cameraId).toBe('cam-1');
    expect(findManyCall.where.timestamp.lt).toBeInstanceOf(Date);

    // Verify cutoff is ~7 days ago (within 1 day tolerance)
    const cutoff = findManyCall.where.timestamp.lt;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    expect(Math.abs(cutoff.getTime() - sevenDaysAgo.getTime())).toBeLessThan(86400000);
  });

  it('falls back to org default retention when camera has no override', async () => {
    mockPrisma.recording.findMany.mockResolvedValue([{ orgId: 'org-1' }]);
    mockPrisma.orgSettings.findUnique.mockResolvedValue({ defaultRetentionDays: 14 });
    mockPrisma.recordingSegment.findMany
      .mockResolvedValueOnce([{ cameraId: 'cam-1' }])
      .mockResolvedValueOnce([]);
    mockPrisma.camera.findUnique.mockResolvedValue({ retentionDays: null });

    await processor.cleanupOrg('org-1');

    // Should use org default (14 days)
    const findManyCall = mockPrisma.recordingSegment.findMany.mock.calls[1][0];
    const cutoff = findManyCall.where.timestamp.lt;
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    expect(Math.abs(cutoff.getTime() - fourteenDaysAgo.getTime())).toBeLessThan(86400000);
  });

  it('removes MinIO objects for expired segments', async () => {
    mockPrisma.recording.findMany.mockResolvedValue([{ orgId: 'org-1' }]);
    mockPrisma.orgSettings.findUnique.mockResolvedValue({ defaultRetentionDays: 30 });
    mockPrisma.recordingSegment.findMany
      .mockResolvedValueOnce([{ cameraId: 'cam-1' }])
      .mockResolvedValueOnce([
        { id: 's1', objectPath: 'cam-1/old/seg1.m4s', recordingId: 'rec-1', size: 1000n },
        { id: 's2', objectPath: 'cam-1/old/seg2.m4s', recordingId: 'rec-1', size: 2000n },
      ]);
    mockPrisma.camera.findUnique.mockResolvedValue({ retentionDays: 1 });
    mockMinioService.removeObjects.mockResolvedValue(undefined);
    mockPrisma.recordingSegment.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.recordingSegment.aggregate.mockResolvedValue({ _sum: { size: 0n }, _count: 0 });
    mockPrisma.recording.delete.mockResolvedValue({});

    await processor.cleanupOrg('org-1');

    expect(mockMinioService.removeObjects).toHaveBeenCalledWith('org-1', [
      'cam-1/old/seg1.m4s',
      'cam-1/old/seg2.m4s',
    ]);
  });

  it('removes DB records for expired segments', async () => {
    mockPrisma.recording.findMany.mockResolvedValue([{ orgId: 'org-1' }]);
    mockPrisma.orgSettings.findUnique.mockResolvedValue({ defaultRetentionDays: 30 });
    mockPrisma.recordingSegment.findMany
      .mockResolvedValueOnce([{ cameraId: 'cam-1' }])
      .mockResolvedValueOnce([
        { id: 's1', objectPath: 'path1', recordingId: 'rec-1', size: 1000n },
      ]);
    mockPrisma.camera.findUnique.mockResolvedValue({ retentionDays: 1 });
    mockMinioService.removeObjects.mockResolvedValue(undefined);
    mockPrisma.recordingSegment.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.recordingSegment.aggregate.mockResolvedValue({ _sum: { size: 5000n }, _count: 3 });
    mockPrisma.recording.update.mockResolvedValue({});

    await processor.cleanupOrg('org-1');

    expect(mockPrisma.recordingSegment.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1'] } },
    });
  });

  it('updates recording totalSize after segment deletion', async () => {
    mockPrisma.recording.findMany.mockResolvedValue([{ orgId: 'org-1' }]);
    mockPrisma.orgSettings.findUnique.mockResolvedValue({ defaultRetentionDays: 30 });
    mockPrisma.recordingSegment.findMany
      .mockResolvedValueOnce([{ cameraId: 'cam-1' }])
      .mockResolvedValueOnce([
        { id: 's1', objectPath: 'path1', recordingId: 'rec-1', size: 1000n },
      ]);
    mockPrisma.camera.findUnique.mockResolvedValue({ retentionDays: 1 });
    mockMinioService.removeObjects.mockResolvedValue(undefined);
    mockPrisma.recordingSegment.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.recordingSegment.aggregate.mockResolvedValue({ _sum: { size: 5000n }, _count: 2 });
    mockPrisma.recording.update.mockResolvedValue({});

    await processor.cleanupOrg('org-1');

    expect(mockPrisma.recording.update).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
      data: { totalSize: 5000n },
    });
  });

  it('deletes empty Recording records after all segments removed', async () => {
    mockPrisma.recording.findMany.mockResolvedValue([{ orgId: 'org-1' }]);
    mockPrisma.orgSettings.findUnique.mockResolvedValue({ defaultRetentionDays: 30 });
    mockPrisma.recordingSegment.findMany
      .mockResolvedValueOnce([{ cameraId: 'cam-1' }])
      .mockResolvedValueOnce([
        { id: 's1', objectPath: 'path1', recordingId: 'rec-1', size: 1000n },
      ]);
    mockPrisma.camera.findUnique.mockResolvedValue({ retentionDays: 1 });
    mockMinioService.removeObjects.mockResolvedValue(undefined);
    mockPrisma.recordingSegment.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.recordingSegment.aggregate.mockResolvedValue({ _sum: { size: null }, _count: 0 });
    mockPrisma.recording.delete.mockResolvedValue({});

    await processor.cleanupOrg('org-1');

    expect(mockPrisma.recording.delete).toHaveBeenCalledWith({
      where: { id: 'rec-1' },
    });
  });
});
