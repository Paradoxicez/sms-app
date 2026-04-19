import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SystemPrismaService } from '../prisma/system-prisma.service';
import { MinioService } from './minio.service';

@Processor('recording-retention')
@Injectable()
export class RetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionProcessor.name);

  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly minioService: MinioService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log('Running retention cleanup...');

    // 1. Get all orgs with recordings
    const orgs = await this.prisma.recording.findMany({
      distinct: ['orgId'],
      select: { orgId: true },
    });

    for (const { orgId } of orgs) {
      await this.cleanupOrg(orgId);
    }
  }

  async cleanupOrg(orgId: string): Promise<void> {
    // Get org default retention
    const orgSettings = await this.prisma.orgSettings.findUnique({
      where: { orgId },
    });
    const defaultRetention = orgSettings?.defaultRetentionDays ?? 30;

    // Get all cameras with recordings in this org
    const cameras = await this.prisma.recordingSegment.findMany({
      distinct: ['cameraId'],
      where: { orgId },
      select: { cameraId: true },
    });

    for (const { cameraId } of cameras) {
      const camera = await this.prisma.camera.findUnique({
        where: { id: cameraId },
        select: { retentionDays: true },
      });

      const retentionDays = camera?.retentionDays ?? defaultRetention;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // Find expired segments
      const expiredSegments = await this.prisma.recordingSegment.findMany({
        where: {
          orgId,
          cameraId,
          timestamp: { lt: cutoffDate },
        },
        select: { id: true, objectPath: true, recordingId: true, size: true },
      });

      if (expiredSegments.length === 0) continue;

      // Delete from MinIO
      const objectPaths = expiredSegments.map((s: any) => s.objectPath);
      try {
        await this.minioService.removeObjects(orgId, objectPaths);
      } catch (err: any) {
        this.logger.error(`Failed to remove MinIO objects for org=${orgId}: ${err.message}`);
        continue; // Skip DB cleanup if MinIO fails -- retry next hour
      }

      // Delete DB records
      const segmentIds = expiredSegments.map((s: any) => s.id);
      await this.prisma.recordingSegment.deleteMany({
        where: { id: { in: segmentIds } },
      });

      // Update recording totalSize
      const recordingIds = [...new Set(expiredSegments.map((s: any) => s.recordingId))];
      for (const recordingId of recordingIds) {
        const remaining = await this.prisma.recordingSegment.aggregate({
          where: { recordingId },
          _sum: { size: true },
          _count: true,
        });

        if (remaining._count === 0) {
          // All segments deleted -- remove the recording
          await this.prisma.recording.delete({ where: { id: recordingId } });
        } else {
          await this.prisma.recording.update({
            where: { id: recordingId },
            data: { totalSize: remaining._sum.size || 0n },
          });
        }
      }

      this.logger.log(
        `Cleaned ${expiredSegments.length} expired segments for camera=${cameraId}, org=${orgId}`,
      );
    }
  }
}
