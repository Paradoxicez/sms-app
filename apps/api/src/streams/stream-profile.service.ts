import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
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
    // Quick task 260426-29p: auto-mark the first profile in an org as
    // default — guarantees ≥1 default exists for every org with profiles.
    // Eliminates the "0 default" gap that the runtime fallback (Phase
    // quick 260426-07r) would otherwise have to cover. Silent server-side
    // override; if the create-profile dialog shipped isDefault=false on
    // the very first profile, the backend overrides to true (positive
    // surprise — see feedback_ui_pro_minimal.md, infer reasonable
    // defaults instead of forcing explicit controls).
    const existingCount = await this.prisma.streamProfile.count({
      where: { orgId },
    });
    let effectiveDto: CreateStreamProfileDto = dto;
    if (existingCount === 0) {
      if (!dto.isDefault) {
        this.logger.log(
          `auto-marked first profile "${dto.name}" as isDefault=true for org ${orgId}`,
        );
      }
      effectiveDto = { ...dto, isDefault: true };
    }

    // If isDefault, unset other defaults in same org first
    if (effectiveDto.isDefault) {
      await this.prisma.streamProfile.updateMany({
        where: { orgId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.streamProfile.create({
      data: {
        orgId,
        name: effectiveDto.name,
        codec: effectiveDto.codec,
        preset: effectiveDto.preset,
        resolution: effectiveDto.resolution,
        fps: effectiveDto.fps,
        videoBitrate: effectiveDto.videoBitrate,
        audioCodec: effectiveDto.audioCodec,
        audioBitrate: effectiveDto.audioBitrate,
        isDefault: effectiveDto.isDefault,
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
    // Phase quick-260426-07r (Edge Case A3, choice 3B): pre-fetch the
    // target row so we can run the isDefault precondition BEFORE the
    // existing usedBy check. The two checks throw distinct
    // ConflictException shapes (plain string vs object with usedBy[])
    // so the frontend can disambiguate the failure mode.
    const target = await this.prisma.streamProfile.findUnique({
      where: { id },
      select: { id: true, orgId: true, isDefault: true },
    });

    if (!target) {
      throw new NotFoundException('Stream profile not found');
    }

    // Block deleting an isDefault profile while OTHER profiles exist in
    // the same org — preserves the org invariant that a populated org
    // always has exactly one default. When isDefault is the ONLY
    // profile (otherCount === 0), the delete is allowed: the org
    // returns to a 0-profile state and the runtime hardcoded fallback
    // in streams.service.ts handles cameras until a new profile is
    // created.
    if (target.isDefault) {
      const otherCount = await this.prisma.streamProfile.count({
        where: { orgId: target.orgId, id: { not: target.id } },
      });
      if (otherCount > 0) {
        throw new ConflictException(
          'Set another profile as default before deleting this one. Run PATCH /api/stream-profiles/:id with isDefault=true on the profile you want to promote, then retry delete.',
        );
      }
    }

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
