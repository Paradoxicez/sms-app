import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from './minio.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class RecordingsService {
  private readonly logger = new Logger(RecordingsService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    private readonly rawPrisma: PrismaService,
    private readonly minioService: MinioService,
  ) {}

  async checkAndAlertStorageQuota(orgId: string): Promise<void> {
    const quota = await this.checkStorageQuota(orgId);

    if (quota.usagePercent < 80) return;

    // Check if alert was already sent within the last hour to avoid spam
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentAlert = await this.rawPrisma.notification.findFirst({
      where: {
        orgId,
        type: 'system.alert',
        title: { contains: 'Storage' },
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentAlert) return;

    // Get org package for display
    const org = await this.rawPrisma.organization.findUnique({
      where: { id: orgId },
      include: { package: true },
    });
    const maxGb = org?.package?.maxStorageGb ?? 0;

    if (quota.usagePercent >= 90) {
      // Get org admin users for notification
      const adminMembers = await this.rawPrisma.member.findMany({
        where: { organizationId: orgId, role: { in: ['owner', 'admin'] } },
        select: { userId: true },
      });

      for (const member of adminMembers) {
        await this.rawPrisma.notification.create({
          data: {
            orgId,
            userId: member.userId,
            type: 'system.alert',
            title: 'Storage nearly full',
            body: `Storage usage is at ${quota.usagePercent}% of your ${maxGb} GB quota. New recordings may be blocked.`,
            data: { usagePercent: quota.usagePercent, maxStorageGb: maxGb },
          },
        });
      }
    } else if (quota.usagePercent >= 80) {
      const adminMembers = await this.rawPrisma.member.findMany({
        where: { organizationId: orgId, role: { in: ['owner', 'admin'] } },
        select: { userId: true },
      });

      for (const member of adminMembers) {
        await this.rawPrisma.notification.create({
          data: {
            orgId,
            userId: member.userId,
            type: 'system.alert',
            title: 'Storage usage high',
            body: `Storage usage is at ${quota.usagePercent}% of your ${maxGb} GB quota. Consider adjusting retention policies.`,
            data: { usagePercent: quota.usagePercent, maxStorageGb: maxGb },
          },
        });
      }
    }
  }

  async startRecording(cameraId: string, orgId: string) {
    // Check camera exists and is online
    const camera = await this.prisma.camera.findUnique({
      where: { id: cameraId },
    });
    if (!camera) {
      throw new NotFoundException(`Camera ${cameraId} not found`);
    }
    if (camera.status === 'offline') {
      throw new BadRequestException(
        `Camera ${cameraId} is offline, cannot start recording`,
      );
    }
    if (camera.isRecording) {
      throw new BadRequestException(
        `Camera ${cameraId} is already recording`,
      );
    }

    // Check storage quota
    const quota = await this.checkStorageQuota(orgId);
    if (!quota.allowed) {
      throw new BadRequestException(
        'Storage quota exceeded, cannot start recording',
      );
    }

    // Create recording
    const recording = await this.prisma.recording.create({
      data: {
        orgId,
        cameraId,
        status: 'recording',
      },
    });

    // Set camera recording flag
    await this.prisma.camera.update({
      where: { id: cameraId },
      data: { isRecording: true },
    });

    // Ensure MinIO bucket exists
    await this.minioService.ensureBucket(orgId);

    this.logger.log(
      `Recording started: recording=${recording.id}, camera=${cameraId}`,
    );
    return recording;
  }

  async stopRecording(cameraId: string, orgId: string) {
    const recording = await this.prisma.recording.findFirst({
      where: { cameraId, orgId, status: 'recording' },
    });
    if (!recording) {
      throw new NotFoundException(
        `No active recording found for camera ${cameraId}`,
      );
    }

    const updated = await this.prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: 'complete',
        stoppedAt: new Date(),
      },
    });

    await this.prisma.camera.update({
      where: { id: cameraId },
      data: { isRecording: false },
    });

    this.logger.log(
      `Recording stopped: recording=${recording.id}, camera=${cameraId}`,
    );
    return updated;
  }

  async getActiveRecording(cameraId: string, orgId: string) {
    return this.rawPrisma.recording.findFirst({
      where: { cameraId, orgId, status: 'recording' },
    });
  }

  async archiveSegment(
    recordingId: string,
    orgId: string,
    cameraId: string,
    data: {
      filePath: string;
      duration: number;
      seqNo: number;
      url: string;
      m3u8Path: string;
    },
  ): Promise<void> {
    // T-07-01: Path validation - prevent path traversal
    const hlsMountPath = process.env.SRS_HLS_PATH || '/srs-hls';
    if (data.filePath.includes('..')) {
      throw new BadRequestException(
        'Invalid file path: path traversal detected',
      );
    }
    if (!data.filePath.startsWith(hlsMountPath)) {
      throw new BadRequestException(
        `Invalid file path: must start with ${hlsMountPath}`,
      );
    }

    // Read segment file
    const buffer = await fs.readFile(data.filePath);
    const size = buffer.length;

    // Check if this is the first segment - archive init segment if needed
    const existingSegments = await this.rawPrisma.recordingSegment.count({
      where: { recordingId },
    });

    if (existingSegments === 0 && data.m3u8Path) {
      await this.archiveInitSegment(recordingId, orgId, cameraId, data.m3u8Path);
    }

    // Generate object path: {cameraId}/{YYYY-MM-DD}/{HH-MM-SS}_{seqNo}.m4s
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '-'); // HH-MM-SS
    const objectPath = `${cameraId}/${dateStr}/${timeStr}_${data.seqNo}.m4s`;

    // Upload to MinIO
    await this.minioService.uploadSegment(orgId, objectPath, buffer, size);

    // Create segment record
    await this.rawPrisma.recordingSegment.create({
      data: {
        orgId,
        recordingId,
        cameraId,
        objectPath,
        duration: data.duration,
        size: BigInt(size),
        seqNo: data.seqNo,
        timestamp: now,
      },
    });

    // Update recording totals
    await this.rawPrisma.recording.update({
      where: { id: recordingId },
      data: {
        totalSize: { increment: BigInt(size) },
        totalDuration: { increment: data.duration },
      },
    });

    this.logger.debug(
      `Archived segment: recording=${recordingId}, seq=${data.seqNo}, size=${size}`,
    );

    // Check storage quota and send alerts if needed
    this.checkAndAlertStorageQuota(orgId).catch((err) => {
      this.logger.warn(`Failed to check storage quota alert for org=${orgId}: ${(err as Error).message}`);
    });
  }

  async checkStorageQuota(orgId: string): Promise<{
    allowed: boolean;
    usageBytes: bigint;
    limitBytes: bigint;
    usagePercent: number;
  }> {
    // Get org package for storage limit
    const org = await this.rawPrisma.organization.findUnique({
      where: { id: orgId },
      include: { package: true },
    });

    if (!org?.package) {
      // No package assigned - allow but log warning
      this.logger.warn(`No package assigned for org=${orgId}, allowing recording`);
      return {
        allowed: true,
        usageBytes: 0n,
        limitBytes: 0n,
        usagePercent: 0,
      };
    }

    const limitBytes =
      BigInt(org.package.maxStorageGb) * BigInt(1024 * 1024 * 1024);

    const result = await this.rawPrisma.recordingSegment.aggregate({
      where: { orgId },
      _sum: { size: true },
    });

    const usageBytes = result._sum.size ?? 0n;
    const usagePercent =
      limitBytes > 0n
        ? Number((usageBytes * 100n) / limitBytes)
        : 0;

    return {
      allowed: usagePercent < 100,
      usageBytes,
      limitBytes,
      usagePercent,
    };
  }

  async getSegment(segmentId: string, orgId: string) {
    const segment = await this.prisma.recordingSegment.findFirst({
      where: { id: segmentId, orgId },
    });
    if (!segment) {
      throw new NotFoundException(`Segment ${segmentId} not found`);
    }
    return segment;
  }

  async listSchedules(cameraId: string, orgId: string) {
    return this.prisma.recordingSchedule.findMany({
      where: { cameraId, orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSchedule(orgId: string, data: any) {
    return this.prisma.recordingSchedule.create({
      data: {
        orgId,
        cameraId: data.cameraId,
        scheduleType: data.scheduleType,
        config: data.config,
        enabled: data.enabled ?? true,
      },
    });
  }

  async updateSchedule(id: string, orgId: string, data: any) {
    const schedule = await this.prisma.recordingSchedule.findFirst({
      where: { id, orgId },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }
    return this.prisma.recordingSchedule.update({
      where: { id },
      data: {
        ...(data.scheduleType !== undefined && { scheduleType: data.scheduleType }),
        ...(data.config !== undefined && { config: data.config }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
      },
    });
  }

  async deleteSchedule(id: string, orgId: string) {
    const schedule = await this.prisma.recordingSchedule.findFirst({
      where: { id, orgId },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule ${id} not found`);
    }
    await this.prisma.recordingSchedule.delete({ where: { id } });
  }

  async updateRetention(cameraId: string, orgId: string, retentionDays: number | null) {
    const camera = await this.prisma.camera.findFirst({
      where: { id: cameraId, orgId },
    });
    if (!camera) {
      throw new NotFoundException(`Camera ${cameraId} not found`);
    }
    return this.prisma.camera.update({
      where: { id: cameraId },
      data: { retentionDays },
    });
  }

  async listRecordings(cameraId: string, orgId: string, date?: string) {
    const where: any = { cameraId, orgId };
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(`${date}T23:59:59.999Z`);
      where.startedAt = { gte: start, lte: end };
    }
    return this.prisma.recording.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      include: { _count: { select: { segments: true } } },
    });
  }

  async getRecording(id: string, orgId: string) {
    const recording = await this.prisma.recording.findUnique({
      where: { id },
      include: { _count: { select: { segments: true } } },
    });
    if (!recording) {
      throw new NotFoundException(`Recording ${id} not found`);
    }
    return recording;
  }

  async deleteRecording(id: string, orgId: string) {
    const recording = await this.prisma.recording.findUnique({
      where: { id },
      include: { segments: true },
    });
    if (!recording) {
      throw new NotFoundException(`Recording ${id} not found`);
    }

    // Delete segments from MinIO
    if (recording.segments.length > 0) {
      const objectPaths = recording.segments.map(
        (s: any) => s.objectPath,
      );
      await this.minioService.removeObjects(orgId, objectPaths);
    }

    // Delete init segment from MinIO if exists
    if (recording.initSegment) {
      await this.minioService.removeObject(orgId, recording.initSegment);
    }

    // Delete recording (cascade deletes segments from DB)
    await this.prisma.recording.delete({ where: { id } });

    this.logger.log(`Deleted recording: ${id}`);
  }

  private async archiveInitSegment(
    recordingId: string,
    orgId: string,
    cameraId: string,
    m3u8Path: string,
  ): Promise<void> {
    try {
      const m3u8Content = await fs.readFile(m3u8Path, 'utf-8');
      const mapMatch = m3u8Content.match(
        /#EXT-X-MAP:URI="([^"]+)"/,
      );
      if (!mapMatch) {
        this.logger.warn(
          `No EXT-X-MAP found in m3u8 for recording=${recordingId}`,
        );
        return;
      }

      const initFileName = mapMatch[1];
      const initFilePath = path.join(
        path.dirname(m3u8Path),
        initFileName,
      );
      const initBuffer = await fs.readFile(initFilePath);

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const initObjectPath = `${cameraId}/${dateStr}/init.mp4`;

      await this.minioService.uploadSegment(
        orgId,
        initObjectPath,
        initBuffer,
        initBuffer.length,
      );

      await this.rawPrisma.recording.update({
        where: { id: recordingId },
        data: { initSegment: initObjectPath },
      });

      this.logger.debug(
        `Archived init segment for recording=${recordingId}`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to archive init segment for recording=${recordingId}: ${(err as Error).message}`,
      );
    }
  }
}
