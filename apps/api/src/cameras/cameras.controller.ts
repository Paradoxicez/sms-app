import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CamerasService } from './cameras.service';
import { FfprobeService } from './ffprobe.service';
import { CreateProjectSchema } from './dto/create-project.dto';
import { CreateSiteSchema } from './dto/create-site.dto';
import { CreateCameraSchema } from './dto/create-camera.dto';
import { UpdateCameraSchema } from './dto/update-camera.dto';

@Controller('api')
@UseGuards(AuthGuard)
export class CamerasController {
  constructor(
    private readonly camerasService: CamerasService,
    private readonly ffprobeService: FfprobeService,
    private readonly cls: ClsService,
  ) {}

  private getOrgId(): string {
    const orgId = this.cls.get('ORG_ID');
    if (!orgId) {
      throw new BadRequestException('No active organization');
    }
    return orgId;
  }

  // ─── Projects ──────────────────────────────────

  @Post('projects')
  async createProject(@Body() body: unknown) {
    const result = CreateProjectSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.camerasService.createProject(this.getOrgId(), result.data);
  }

  @Get('projects')
  async findAllProjects() {
    return this.camerasService.findAllProjects();
  }

  @Get('projects/:id')
  async findProjectById(@Param('id') id: string) {
    return this.camerasService.findProjectById(id);
  }

  @Delete('projects/:id')
  async deleteProject(@Param('id') id: string) {
    return this.camerasService.deleteProject(id);
  }

  // ─── Sites ──────────────────────────────────────

  @Post('projects/:projectId/sites')
  async createSite(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    const result = CreateSiteSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.camerasService.createSite(this.getOrgId(), projectId, result.data);
  }

  @Get('projects/:projectId/sites')
  async findSitesByProject(@Param('projectId') projectId: string) {
    return this.camerasService.findSitesByProject(projectId);
  }

  @Delete('sites/:id')
  async deleteSite(@Param('id') id: string) {
    return this.camerasService.deleteSite(id);
  }

  // ─── Cameras ────────────────────────────────────

  @Post('sites/:siteId/cameras')
  async createCamera(
    @Param('siteId') siteId: string,
    @Body() body: unknown,
  ) {
    const result = CreateCameraSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.camerasService.createCamera(this.getOrgId(), siteId, result.data);
  }

  @Get('cameras')
  async findAllCameras() {
    return this.camerasService.findAllCameras();
  }

  @Get('cameras/:id')
  async findCameraById(@Param('id') id: string) {
    return this.camerasService.findCameraById(id);
  }

  @Patch('cameras/:id')
  async updateCamera(@Param('id') id: string, @Body() body: unknown) {
    const result = UpdateCameraSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.camerasService.updateCamera(id, result.data);
  }

  @Delete('cameras/:id')
  async deleteCamera(@Param('id') id: string) {
    return this.camerasService.deleteCamera(id);
  }

  // ─── Test Connection ────────────────────────────

  @Post('cameras/:id/test-connection')
  async testConnection(@Param('id') id: string) {
    const camera = await this.camerasService.findCameraById(id);
    if (!camera) {
      throw new NotFoundException('Camera not found');
    }

    const result = await this.ffprobeService.probeCamera(camera.streamUrl);

    // Update camera with codec info and needsTranscode flag
    await this.camerasService.updateCameraCodecInfo(id, {
      needsTranscode: result.needsTranscode,
      codecInfo: {
        video: result.codec,
        audio: result.audioCodec,
        width: result.width,
        height: result.height,
        fps: result.fps,
      },
    });

    return result;
  }
}
