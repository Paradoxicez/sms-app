import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Res,
  UseGuards,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CamerasService } from './cameras.service';
import { FfprobeService } from './ffprobe.service';
import { CreateProjectSchema } from './dto/create-project.dto';
import { CreateSiteSchema } from './dto/create-site.dto';
import { CreateCameraSchema } from './dto/create-camera.dto';
import { UpdateCameraSchema } from './dto/update-camera.dto';
import { BulkImportSchema } from './dto/bulk-import.dto';

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

  // ─── Bulk Import ────────────────────────────────

  @Post('cameras/bulk-import')
  async bulkImport(@Body() body: unknown) {
    const parsed = BulkImportSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.camerasService.bulkImport(this.getOrgId(), parsed.data);
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

  // ─── HLS Preview Proxy (D-14: internal preview via backend proxy) ────

  private readonly logger = new Logger(CamerasController.name);
  private readonly srsBaseUrl = process.env.SRS_HTTP_URL || 'http://localhost:8080';

  @Get('cameras/:id/preview/playlist.m3u8')
  async proxyPlaylist(@Param('id') id: string, @Res() res: Response) {
    const camera = await this.camerasService.findCameraById(id);
    if (!camera) {
      throw new NotFoundException('Camera not found');
    }

    const orgId = this.getOrgId();
    const srsUrl = `${this.srsBaseUrl}/live/${orgId}/${camera.id}.m3u8`;

    try {
      const upstream = await fetch(srsUrl);
      if (!upstream.ok) {
        res.status(upstream.status).send('Stream not available');
        return;
      }

      let m3u8 = await upstream.text();
      // Rewrite segment URLs to go through proxy
      m3u8 = m3u8.replace(
        /^(?!#)(.+\.(ts|m4s|mp4))$/gm,
        `/api/cameras/${id}/preview/$1`,
      );

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(m3u8);
    } catch (err) {
      this.logger.warn(`HLS proxy error for camera ${id}: ${err}`);
      res.status(502).send('Stream engine unavailable');
    }
  }

  @Get('cameras/:id/preview/:segment')
  async proxySegment(
    @Param('id') id: string,
    @Param('segment') segment: string,
    @Res() res: Response,
  ) {
    const camera = await this.camerasService.findCameraById(id);
    if (!camera) {
      throw new NotFoundException('Camera not found');
    }

    const orgId = this.getOrgId();
    const srsUrl = `${this.srsBaseUrl}/live/${orgId}/${segment}`;

    try {
      const upstream = await fetch(srsUrl);
      if (!upstream.ok) {
        res.status(upstream.status).send('Segment not available');
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'video/mp2t';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=30');

      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      this.logger.warn(`HLS segment proxy error for camera ${id}: ${err}`);
      res.status(502).send('Stream engine unavailable');
    }
  }
}
