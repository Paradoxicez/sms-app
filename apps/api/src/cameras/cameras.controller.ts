import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  NotFoundException,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CamerasService } from './cameras.service';
import { FfprobeService } from './ffprobe.service';
import { ModuleRef } from '@nestjs/core';
// PlaybackService is resolved lazily via ModuleRef to avoid the module
// import cycle Cameras → Playback → Cluster → Srs → Playback. The value
// import is safe (no module-level cycle); we just skip the Nest module
// registration and resolve from the global container at request time.
import { PlaybackService } from '../playback/playback.service';
import { CreateProjectSchema } from './dto/create-project.dto';
import { CreateSiteSchema } from './dto/create-site.dto';
import { CreateCameraSchema } from './dto/create-camera.dto';
import { UpdateCameraSchema } from './dto/update-camera.dto';
import { BulkImportSchema } from './dto/bulk-import.dto';
import { enterMaintenanceBodySchema } from './dto/maintenance.dto';
import { serializeCamera } from './serialize-camera.util';

@ApiTags('Cameras')
@Controller('api')
@UseGuards(AuthGuard)
export class CamerasController {
  constructor(
    private readonly camerasService: CamerasService,
    private readonly ffprobeService: FfprobeService,
    private readonly cls: ClsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private playbackRef: PlaybackService | null = null;
  private getPlaybackService(): PlaybackService {
    if (!this.playbackRef) {
      // Lazy resolve from the DI container — strict=false walks up to the
      // global scope so PlaybackService is found via PlaybackModule's exports
      // without needing CamerasModule to import that module directly.
      this.playbackRef = this.moduleRef.get(PlaybackService, { strict: false });
    }
    return this.playbackRef;
  }

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

  @Get('sites')
  @ApiOperation({ summary: 'List all sites' })
  @ApiResponse({ status: 200, description: 'List of sites' })
  async findAllSites() {
    return this.camerasService.findAllSites();
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
  @ApiQuery({ name: 'siteId', required: false, description: 'Filter by site ID' })
  async findAllCameras(@Query('siteId') siteId?: string) {
    // Phase 19.1 D-07: route every outbound camera through serializeCamera
    // so future non-owner surfaces only need to flip the perspective flag.
    // Tenancy already scoped to the caller's org, so 'owner' is correct.
    const cameras = await this.camerasService.findAllCameras(siteId);
    return cameras.map((c: any) => serializeCamera(c, { perspective: 'owner' }));
  }

  @Get('cameras/:id')
  @ApiOperation({ summary: 'Get a camera by ID' })
  @ApiResponse({ status: 200, description: 'Camera details' })
  @ApiParam({ name: 'id', description: 'Camera ID' })
  async findCameraById(@Param('id') id: string) {
    // Phase 19.1 D-07: same chokepoint as findAllCameras — owner perspective
    // because the tenancy client has already proven cross-org calls return 404.
    const camera = await this.camerasService.findCameraById(id);
    return serializeCamera(camera, { perspective: 'owner' });
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

  // ─── Maintenance Mode ───────────────────────────

  @Post('cameras/:id/maintenance')
  @ApiOperation({
    summary:
      'Put camera into maintenance mode (stops stream, suppresses notifications/webhooks per 15-01 gate); optional reason string persisted to audit trail',
  })
  @ApiResponse({ status: 200, description: 'Camera placed in maintenance mode' })
  @ApiResponse({ status: 400, description: 'Validation error (reason > 200 chars or wrong type)' })
  @ApiResponse({ status: 404, description: 'Camera not found' })
  @ApiParam({ name: 'id', description: 'Camera ID' })
  async enterMaintenance(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    // AuthGuard attaches the authenticated user to the request (see
    // apps/api/src/auth/guards/auth.guard.ts). CLS carries ORG_ID but NOT
    // USER_ID in the current codebase — sourcing userId from req.user
    // matches the existing UsersController pattern.
    const userId = (req as any).user?.id;
    if (!userId) {
      throw new BadRequestException('No authenticated user in request context');
    }
    // Phase 20 D-07 / Research A2 — reason is optional, ≤200 chars, captured
    // in audit via AuditInterceptor's request.body snapshot. Reject malformed
    // bodies (T-20-01, T-20-04, T-20-07).
    const parsed = enterMaintenanceBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0].message);
    }
    return this.camerasService.enterMaintenance(id, userId, parsed.data.reason);
  }

  @Delete('cameras/:id/maintenance')
  @ApiOperation({
    summary:
      'Exit camera maintenance mode (does NOT auto-restart stream — operator must call Start Stream per D-14)',
  })
  @ApiResponse({ status: 200, description: 'Camera exited maintenance mode' })
  @ApiResponse({ status: 404, description: 'Camera not found' })
  @ApiParam({ name: 'id', description: 'Camera ID' })
  async exitMaintenance(@Param('id') id: string) {
    return this.camerasService.exitMaintenance(id);
  }

  // ─── Push Stream Key Rotation (Phase 19.1 D-19, D-20) ───

  @Post('cameras/:id/rotate-key')
  @ApiOperation({
    summary:
      'Rotate the push stream key — force-disconnects active publisher and reveals new URL',
  })
  @ApiResponse({ status: 200, description: 'New streamUrl' })
  @ApiResponse({ status: 400, description: 'Camera is not push mode' })
  @ApiResponse({ status: 404, description: 'Camera not found' })
  @ApiParam({ name: 'id', description: 'Camera ID' })
  async rotateKey(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<{ streamUrl: string }> {
    // AuthGuard attaches req.user. Source userId here (not CLS) to match
    // the enterMaintenance + retryProbe patterns in this controller.
    const userId = (req as any).user?.id;
    if (!userId) {
      throw new BadRequestException('No authenticated user in request context');
    }
    // findCameraById uses tenancy — cross-org lookups throw 404.
    // This is the T-19.1-KICK-UNAUTH mitigation: rotateStreamKey is only
    // reachable once tenancy has confirmed the camera belongs to the caller.
    await this.camerasService.findCameraById(id);
    return this.camerasService.rotateStreamKey(id, userId);
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

  // ─── Probe Retry (D-06) ─────────────────────────

  /**
   * Phase 19 (D-06): async retry hit by the UI's failed-probe retry icon.
   *
   * NOT a pre-save URL test (D-18 forbids that — that's what
   * POST cameras/:id/test-connection stays for, post-save). This endpoint
   * re-enqueues a probe job for a camera that already exists in the DB.
   *
   * Returns 202 Accepted immediately — the worker runs async and the UI
   * observes the transition via a camera list refetch. BullMQ
   * jobId: probe-{cameraId} deduplicates rapid double-clicks (T-19-03).
   */
  @Post('cameras/:id/probe')
  @HttpCode(202)
  @ApiOperation({ summary: 'Async retry probe for an existing camera (D-06 UI retry)' })
  @ApiResponse({ status: 202, description: 'Probe enqueued' })
  @ApiResponse({ status: 404, description: 'Camera not found' })
  @ApiParam({ name: 'id', description: 'Camera ID' })
  async retryProbe(@Param('id') cameraId: string): Promise<{ accepted: true }> {
    const orgId = this.getOrgId();
    // findCameraById throws NotFoundException via tenancy client → cross-org
    // lookups return null → 404. Matches the controller's existing auth
    // pattern so we never leak camera existence across orgs.
    const camera = await this.camerasService.findCameraById(cameraId);
    if (!camera) {
      throw new NotFoundException(`Camera ${cameraId} not found`);
    }
    await this.camerasService.enqueueProbeRetry(cameraId, camera.streamUrl, orgId);
    return { accepted: true };
  }

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

  private previewTokenCache = new Map<string, { token: string; expiresAt: number }>();

  /**
   * Per-browser SRS hls_ctx session cache.
   *
   * SRS issues a fresh `hls_ctx` UUID every time the master playlist is
   * fetched. Without caching, every hls.js playlist poll (~2s cadence)
   * spawned a new SRS session, exploding the viewer counter and never
   * letting on_play/on_stop pair up cleanly.
   *
   * Keyed by `${browserId}:${cameraId}`; value is the relative inner
   * playlist URL returned by SRS (it embeds the ctxId path component).
   * Subsequent playlist polls hit the cached inner URL directly, so SRS
   * sees one session per browser per camera until the session naturally
   * expires (then we refetch the master and replace the entry).
   */
  private hlsSessionCache = new Map<
    string,
    { innerPath: string; lastUsed: number }
  >();

  /**
   * Read the persistent `srs_browser_id` cookie or mint one. The cookie is
   * scoped to `/api/cameras` so it travels with both the playlist proxy
   * and segment proxy on the same origin (Next.js rewrites preserve it).
   */
  private getOrSetBrowserId(req: Request, res: Response): string {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/(?:^|;\s*)srs_browser_id=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);

    const id = randomUUID();
    res.setHeader(
      'Set-Cookie',
      `srs_browser_id=${id}; Path=/api/cameras; Max-Age=86400; SameSite=Lax; HttpOnly`,
    );
    return id;
  }

  @Get('cameras/:id/preview/playlist.m3u8')
  @ApiExcludeEndpoint()
  async proxyPlaylist(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const camera = await this.camerasService.findCameraById(id);
    if (!camera) {
      throw new NotFoundException('Camera not found');
    }

    const orgId = this.getOrgId();
    const cacheKey = `${orgId}:${camera.id}`;

    // Cache playback token to avoid creating DB sessions on every hls.js poll
    let token: string;
    const cached = this.previewTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      token = cached.token;
    } else {
      this.previewTokenCache.delete(cacheKey);
      try {
        const session = await this.getPlaybackService().createSession(
          camera.id,
          orgId,
        );
        const match = session.hlsUrl.match(/[?&]token=([^&]+)/);
        if (!match) throw new Error('Minted session has no token in hlsUrl');
        token = decodeURIComponent(match[1]);
        this.previewTokenCache.set(cacheKey, {
          token,
          expiresAt: Date.now() + 30 * 60 * 1000,
        });
      } catch (err) {
        this.logger.warn(`Preview session create failed for camera ${id}: ${err}`);
        res.status(502).send('Stream not available');
        return;
      }
    }

    const browserId = this.getOrSetBrowserId(req, res);
    const sessionKey = `${browserId}:${camera.id}`;

    try {
      // Fast path: reuse the cached inner URL so SRS sees the SAME hls_ctx
      // session for this browser + camera. No new on_play, no counter churn.
      const cached = this.hlsSessionCache.get(sessionKey);
      if (cached) {
        const inner = await fetch(`${this.srsBaseUrl}${cached.innerPath}`);
        if (inner.ok) {
          cached.lastUsed = Date.now();
          const m3u8 = this.rewritePlaylistSegments(await inner.text(), id);
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'no-cache');
          res.send(m3u8);
          return;
        }
        // SRS expired the session (hls_dispose). Drop the cache entry and
        // fall through to refetch the master playlist.
        this.hlsSessionCache.delete(sessionKey);
      }

      // Slow path: mint a fresh hls_ctx session by hitting the master URL.
      const masterUrl = `${this.srsBaseUrl}/live/${orgId}/${camera.id}.m3u8?token=${encodeURIComponent(token)}`;
      const upstream = await fetch(masterUrl);
      if (!upstream.ok) {
        res.status(upstream.status).send('Stream not available');
        return;
      }

      let m3u8 = await upstream.text();

      // hls_ctx on: SRS returns master playlist → follow to inner. Cache the
      // inner path so all subsequent polls from this browser hit the fast
      // path above (no more new sessions for the same hls.js instance).
      if (m3u8.includes('#EXT-X-STREAM-INF') && !m3u8.includes('#EXTINF')) {
        const innerLine = m3u8.split('\n').find((l) => l.startsWith('/'));
        if (innerLine) {
          const innerPath = innerLine.trim();
          const inner = await fetch(`${this.srsBaseUrl}${innerPath}`);
          if (inner.ok) {
            m3u8 = await inner.text();
            this.hlsSessionCache.set(sessionKey, {
              innerPath,
              lastUsed: Date.now(),
            });
          }
        }
      }

      m3u8 = this.rewritePlaylistSegments(m3u8, id);

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(m3u8);
    } catch (err) {
      this.logger.warn(`HLS proxy error for camera ${id}: ${err}`);
      res.status(502).send('Stream engine unavailable');
    }
  }

  /**
   * Rewrite SRS-relative segment URLs to flow back through this proxy.
   * Pattern preserves any query suffix (`?token=...`).
   */
  private rewritePlaylistSegments(m3u8: string, cameraId: string): string {
    return m3u8.replace(
      /^(?!#)(.+\.(ts|m4s|mp4)(?:\?.*)?)$/gm,
      `/api/cameras/${cameraId}/preview/$1`,
    );
  }

  @Get('cameras/:id/preview/:segment')
  @ApiExcludeEndpoint()
  async proxySegment(
    @Param('id') id: string,
    @Param('segment') segment: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const camera = await this.camerasService.findCameraById(id);
    if (!camera) {
      throw new NotFoundException('Camera not found');
    }

    const orgId = this.getOrgId();
    const cached = this.previewTokenCache.get(`${orgId}:${camera.id}`);
    const params = new URLSearchParams(req.query as Record<string, string>);
    if (cached?.token && !params.has('token')) params.set('token', cached.token);
    const qs = params.toString();
    const srsUrl = `${this.srsBaseUrl}/live/${orgId}/${segment}${qs ? '?' + qs : ''}`;

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
