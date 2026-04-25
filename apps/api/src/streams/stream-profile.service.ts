import { ConflictException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { CreateStreamProfileDto } from './dto/create-stream-profile.dto';
import { UpdateStreamProfileDto } from './dto/update-stream-profile.dto';
import { fingerprintProfile } from './profile-fingerprint.util';
import { StreamsService } from './streams.service';

@Injectable()
export class StreamProfileService {
  private readonly logger = new Logger(StreamProfileService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    // Phase 21 D-01: profile-side trigger of hot-reload restart fan-out.
    // Optional so unit tests that exercise pure profile CRUD (no restart) can
    // omit it; manual harness in stream-profile-restart.test.ts passes a real
    // StreamsService instance constructed in-test.
    @Optional() private readonly streamsService?: StreamsService,
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

  async update(
    id: string,
    dto: UpdateStreamProfileDto,
    triggeredBy: { userId: string; userEmail: string } | { system: true } = {
      system: true,
    },
  ): Promise<any> {
    // Phase 21 D-01: read pre-image so we can compute the old fingerprint
    // and compare against the post-update row. The pre-image also gives us
    // orgId for the isDefault unset.
    const pre = await this.prisma.streamProfile.findUnique({ where: { id } });
    if (!pre) {
      // Caller (controller) raises NotFoundException; service stays minimal.
      throw new Error(`Stream profile ${id} not found`);
    }

    if (dto.isDefault) {
      await this.prisma.streamProfile.updateMany({
        where: { orgId: pre.orgId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.streamProfile.update({
      where: { id },
      data: dto,
    });

    // D-01 fingerprint diff. Identical seven fields ⇒ no restart.
    const oldFp = fingerprintProfile(pre);
    const newFp = fingerprintProfile(updated);
    if (oldFp === newFp) {
      return { ...updated, affectedCameras: 0 };
    }

    let affectedCameras = 0;
    if (this.streamsService) {
      const result = await this.streamsService.enqueueProfileRestart({
        profileId: id,
        oldFingerprint: oldFp,
        newFingerprint: newFp,
        triggeredBy,
        originPath: `/api/stream-profiles/${id}`,
        originMethod: 'PATCH',
      });
      affectedCameras = result.affectedCameras;
    }

    return { ...updated, affectedCameras };
  }

  async delete(id: string) {
    // Phase 21 D-10: pre-delete check (Option B per 21-RESEARCH.md §4 — service-
    // layer guard, no schema change). The tenancy client scopes findMany to the
    // requester's org via RLS, so cross-org camera names never leak (T-21-02).
    // Schema-level `onDelete: SetNull` is preserved as defense-in-depth for the
    // T-21-RACE-DELETE-PATCH window between findMany and delete.
    const usedBy = await this.prisma.camera.findMany({
      where: { streamProfileId: id },
      select: { id: true, name: true },
    });

    if (usedBy.length > 0) {
      throw new ConflictException({
        message:
          'Stream profile is in use by one or more cameras. Reassign before deleting.',
        usedBy: usedBy.map((c: { id: string; name: string }) => ({
          cameraId: c.id,
          name: c.name,
        })),
      });
    }

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
