import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreateSiteDto } from './dto/create-site.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { UpdateCameraDto } from './dto/update-camera.dto';

@Injectable()
export class CamerasService {
  constructor(
    @Inject(TENANCY_CLIENT) private readonly tenancy: any,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Projects ──────────────────────────────────

  async createProject(orgId: string, dto: CreateProjectDto) {
    return this.tenancy.project.create({
      data: {
        orgId,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAllProjects() {
    return this.tenancy.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { sites: true } } },
    });
  }

  async findProjectById(id: string) {
    const project = await this.tenancy.project.findUnique({
      where: { id },
      include: { sites: { include: { _count: { select: { cameras: true } } } } },
    });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project;
  }

  async deleteProject(id: string) {
    await this.findProjectById(id);
    return this.tenancy.project.delete({ where: { id } });
  }

  // ─── Sites ──────────────────────────────────────

  async createSite(orgId: string, projectId: string, dto: CreateSiteDto) {
    // Verify project exists
    const project = await this.tenancy.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    return this.tenancy.site.create({
      data: {
        orgId,
        projectId,
        name: dto.name,
        description: dto.description,
        location: dto.location ?? undefined,
      },
    });
  }

  async findSitesByProject(projectId: string) {
    return this.tenancy.site.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { cameras: true } } },
    });
  }

  async deleteSite(id: string) {
    const site = await this.tenancy.site.findUnique({ where: { id } });
    if (!site) {
      throw new NotFoundException(`Site ${id} not found`);
    }
    return this.tenancy.site.delete({ where: { id } });
  }

  // ─── Cameras ────────────────────────────────────

  async createCamera(orgId: string, siteId: string, dto: CreateCameraDto) {
    // Verify site exists
    const site = await this.tenancy.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }

    // Check maxCameras package limit
    await this.enforceMaxCamerasLimit(orgId);

    return this.tenancy.camera.create({
      data: {
        orgId,
        siteId,
        name: dto.name,
        streamUrl: dto.streamUrl,
        description: dto.description,
        location: dto.location ?? undefined,
        tags: dto.tags ?? [],
        thumbnail: dto.thumbnail,
        streamProfileId: dto.streamProfileId,
        status: 'offline',
        needsTranscode: false,
      },
    });
  }

  async findAllCameras() {
    return this.tenancy.camera.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        site: {
          include: { project: true },
        },
      },
    });
  }

  async findCameraById(id: string) {
    const camera = await this.tenancy.camera.findUnique({
      where: { id },
      include: {
        site: {
          include: { project: true },
        },
        streamProfile: true,
      },
    });
    if (!camera) {
      throw new NotFoundException(`Camera ${id} not found`);
    }
    return camera;
  }

  async updateCamera(id: string, dto: UpdateCameraDto) {
    await this.findCameraById(id);
    return this.tenancy.camera.update({
      where: { id },
      data: dto,
    });
  }

  async deleteCamera(id: string) {
    await this.findCameraById(id);
    return this.tenancy.camera.delete({ where: { id } });
  }

  async updateCameraCodecInfo(
    id: string,
    data: { needsTranscode: boolean; codecInfo: Record<string, any> },
  ) {
    return this.tenancy.camera.update({
      where: { id },
      data: {
        needsTranscode: data.needsTranscode,
        codecInfo: data.codecInfo,
      },
    });
  }

  // ─── Helpers ────────────────────────────────────

  private async enforceMaxCamerasLimit(orgId: string) {
    // Query the organization's package to get maxCameras (use raw prisma, not tenancy)
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { package: true },
    });

    if (!org?.package) {
      // No package assigned — allow (no limit)
      return;
    }

    const maxCameras = org.package.maxCameras;
    const currentCount = await this.tenancy.camera.count({
      where: { orgId },
    });

    if (currentCount >= maxCameras) {
      throw new ForbiddenException(
        `Camera limit reached. Your plan allows ${maxCameras} cameras. Current: ${currentCount}.`,
      );
    }
  }
}
