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
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiExcludeEndpoint } from '@nestjs/swagger';
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

@ApiTags('Cameras')
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
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, description: 'Project created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async createProject(@Body() body: unknown) {
    const result = CreateProjectSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.camerasService.createProject(this.getOrgId(), result.data);
  }

  @Get('projects')
  @ApiOperation({ summary: 'List all projects' })
  @ApiResponse({ status: 200, description: 'List of projects' })
  async findAllProjects() {
    return this.camerasService.findAllProjects();
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'Get a project by ID' })
  @ApiResponse({ status: 200, description: 'Project details' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  async findProjectById(@Param('id') id: string) {
    return this.camerasService.findProjectById(id);
  }

  @Patch('projects/:id')
  @ApiOperation({ summary: 'Update a project' })
  @ApiResponse({ status: 200, description: 'Project updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  async updateProject(@Param('id') id: string, @Body() body: unknown) {
    const result = CreateProjectSchema.partial().safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.camerasService.updateProject(id, result.data);
  }

  @Delete('projects/:id')
  @ApiOperation({ summary: 'Delete a project' })
  @ApiResponse({ status: 200, description: 'Project deleted' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @ApiParam({ name: 'id', description: 'Project ID' })
  async deleteProject(@Param('id') id: string) {
    return this.camerasService.deleteProject(id);
  }

  // ─── Sites ──────────────────────────────────────

  @Post('projects/:projectId/sites')
  @ApiOperation({ summary: 'Create a site within a project' })
  @ApiResponse({ status: 201, description: 'Site created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
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
  @ApiOperation({ summary: 'List sites in a project' })
  @ApiResponse({ status: 200, description: 'List of sites' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  async findSitesByProject(@Param('projectId') projectId: string) {
    return this.camerasService.findSitesByProject(projectId);
  }

  @Patch('sites/:id')
  @ApiOperation({ summary: 'Update a site' })
  @ApiResponse({ status: 200, description: 'Site updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiParam({ name: 'id', description: 'Site ID' })
  async updateSite(@Param('id') id: string, @Body() body: unknown) {
    const result = CreateSiteSchema.partial().safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.camerasService.updateSite(id, result.data);
  }

  @Delete('sites/:id')
  @ApiOperation({ summary: 'Delete a site' })
  @ApiResponse({ status: 200, description: 'Site deleted' })
  @ApiResponse({ status: 404, description: 'Site not found' })
  @ApiParam({ name: 'id', description: 'Site ID' })
  async deleteSite(@Param('id') id: string) {
    return this.camerasService.deleteSite(id);
  }

  // ─── Cameras ────────────────────────────────────

  @Post('sites/:siteId/cameras')
  @ApiOperation({ summary: 'Add a camera to a site' })
  @ApiResponse({ status: 201, description: 'Camera created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiParam({ name: 'siteId', description: 'Site ID' })
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
  @ApiOperation({ summary: 'List all cameras' })
  @ApiResponse({ status: 200, description: 'List of cameras' })
  async findAllCameras() {
    return this.camerasService.findAllCameras();
  }

  @Get('cameras/:id')
  @ApiOperation({ summary: 'Get a camera by ID' })
  @ApiResponse({ status: 200, description: 'Camera details' })
  @ApiParam({ name: 'id', description: 'Camera ID' })
  async findCameraById(@Param('id') id: string) {
    return this.camerasService.findCameraById(id);
  }

  @Patch('cameras/:id')
  @ApiOperation({ summary: 'Update a camera' })
  @ApiResponse({ status: 200, description: 'Camera updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiParam({ name: 'id', description: 'Camera ID' })
  async updateCamera(@Param('id') id: string, @Body() body: unknown) {
    const result = UpdateCameraSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.camerasService.updateCamera(id, result.data);
  }

  @Delete('cameras/:id')
  @ApiOperation({ summary: 'Delete a camera' })
  @ApiResponse({ status: 200, description: 'Camera deleted' })
  @ApiResponse({ status: 404, description: 'Camera not found' })
  @ApiParam({ name: 'id', description: 'Camera ID' })
  async deleteCamera(@Param('id') id: string) {
    return this.camerasService.deleteCamera(id);
  }

  // ─── Bulk Import ────────────────────────────────

  @Post('cameras/bulk-import')
  @ApiOperation({ summary: 'Bulk import cameras from CSV/JSON data' })
  @ApiResponse({ status: 201, description: 'Import results with success/failure counts' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async bulkImport(@Body() body: unknown) {
    const parsed = BulkImportSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.camerasService.bulkImport(this.getOrgId(), parsed.data);
  }

  // ─── Test Connection ────────────────────────────

  @Post('cameras/:id/test-connection')
  @ApiOperation({ summary: 'Test camera RTSP/SRT connection and detect codecs' })
  @ApiResponse({ status: 200, description: 'Connection test results with codec info' })
  @ApiResponse({ status: 404, description: 'Camera not found' })
  @ApiParam({ name: 'id', description: 'Camera ID' })
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
  @ApiExcludeEndpoint()
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
  @ApiExcludeEndpoint()
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
