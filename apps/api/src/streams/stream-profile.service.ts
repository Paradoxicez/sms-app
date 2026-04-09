import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateStreamProfileDto } from './dto/create-stream-profile.dto';
import { UpdateStreamProfileDto } from './dto/update-stream-profile.dto';

@Injectable()
export class StreamProfileService {
  private readonly logger = new Logger(StreamProfileService.name);

  constructor(
    @Inject('TENANCY_CLIENT') private readonly prisma: PrismaClient,
  ) {}

  async create(orgId: string, dto: CreateStreamProfileDto) {
    // If isDefault, unset other defaults in same org first
    if (dto.isDefault) {
      await this.prisma.streamProfile.updateMany({
        where: { orgId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.streamProfile.create({
      data: {
        orgId,
        name: dto.name,
        codec: dto.codec,
        preset: dto.preset,
        resolution: dto.resolution,
        fps: dto.fps,
        videoBitrate: dto.videoBitrate,
        audioCodec: dto.audioCodec,
        audioBitrate: dto.audioBitrate,
        isDefault: dto.isDefault,
      },
    });
  }

  async findAll() {
    return this.prisma.streamProfile.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.streamProfile.findUnique({
      where: { id },
    });
  }

  async update(id: string, dto: UpdateStreamProfileDto) {
    // If setting as default, unset other defaults first
    if (dto.isDefault) {
      const existing = await this.prisma.streamProfile.findUnique({
        where: { id },
      });
      if (existing) {
        await this.prisma.streamProfile.updateMany({
          where: { orgId: existing.orgId, isDefault: true },
          data: { isDefault: false },
        });
      }
    }

    return this.prisma.streamProfile.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    // Camera.streamProfileId set null via onDelete: SetNull in Prisma schema
    return this.prisma.streamProfile.delete({
      where: { id },
    });
  }

  /**
   * Validates profile settings and returns an array of warning messages.
   * Does not block creation, just warns about potentially problematic settings.
   */
  validate(dto: Partial<CreateStreamProfileDto>): string[] {
    const warnings: string[] = [];

    if (dto.resolution) {
      const [width, height] = dto.resolution.split('x').map(Number);
      if (width > 1920 || height > 1080) {
        warnings.push(
          `High resolution (${dto.resolution}): transcoding above 1080p requires significant CPU resources`,
        );
      }
    }

    if (dto.videoBitrate) {
      const bitrate = parseInt(dto.videoBitrate, 10);
      if (bitrate > 8000) {
        warnings.push(
          `High video bitrate (${dto.videoBitrate}): values above 8000k may cause bandwidth issues`,
        );
      }
    }

    if (dto.fps && dto.fps > 30) {
      warnings.push(
        `High frame rate (${dto.fps} FPS): most surveillance cameras operate at 15-30 FPS`,
      );
    }

    return warnings;
  }
}
