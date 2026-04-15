import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiSecurity, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ClsService } from 'nestjs-cls';
import { AuthOrApiKeyGuard } from '../api-keys/auth-or-apikey.guard';
import { PlaybackService } from './playback.service';
import { BatchSessionsSchema } from './dto/batch-sessions.dto';

@ApiTags('Playback')
@Controller('api')
export class PlaybackController {
  constructor(
    private readonly playbackService: PlaybackService,
    private readonly cls: ClsService,
  ) {}

  private getOrgId(): string {
    const orgId = this.cls.get('ORG_ID');
    if (!orgId) {
      throw new BadRequestException('No active organization');
    }
    return orgId;
  }

  /**
   * Create a new playback session for a camera.
   * Returns { sessionId, hlsUrl, expiresAt }
   */
  @Post('cameras/:cameraId/sessions')
  @UseGuards(AuthOrApiKeyGuard)
  @ApiOperation({ summary: 'Create a playback session for a camera' })
  @ApiResponse({ status: 201, description: 'Playback session created with HLS URL' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Camera not found' })
  @ApiSecurity('api-key')
  @ApiParam({ name: 'cameraId', description: 'Camera ID' })
  async createSession(@Param('cameraId') cameraId: string) {
    return this.playbackService.createSession(cameraId, this.getOrgId());
  }

  /**
   * Create playback sessions for multiple cameras in one call.
   * Returns { sessions: [...], errors: [...] }
   */
  @Post('playback/sessions/batch')
  @UseGuards(AuthOrApiKeyGuard)
  @ApiOperation({ summary: 'Create playback sessions for multiple cameras in one call' })
  @ApiResponse({ status: 201, description: 'Batch sessions created with results and errors' })
  @ApiResponse({ status: 400, description: 'Validation error or batch too large' })
  @ApiSecurity('api-key')
  async createBatchSessions(@Req() req: Request) {
    const parsed = BatchSessionsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.playbackService.createBatchSessions(
      parsed.data.cameraIds,
      this.getOrgId(),
    );
  }

  /**
   * List playback sessions for a camera.
   * Declared BEFORE `/playback/sessions/:id` so Nest does not match
   * `?cameraId=...` against the `:id` param route.
   */
  @Get('playback/sessions')
  @UseGuards(AuthOrApiKeyGuard)
  @ApiOperation({ summary: 'List playback sessions for a camera' })
  @ApiResponse({ status: 200, description: 'Array of session summaries ordered createdAt DESC' })
  @ApiResponse({ status: 400, description: 'cameraId query param required' })
  @ApiResponse({ status: 404, description: 'Camera not found' })
  @ApiSecurity('api-key')
  async listSessions(
    @Query('cameraId') cameraId: string,
    @Query('limit') limit?: string,
  ) {
    if (!cameraId) {
      throw new BadRequestException('cameraId query parameter is required');
    }
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const safe = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
    return this.playbackService.listSessionsByCamera(cameraId, this.getOrgId(), safe);
  }

  /**
   * Get session info (public endpoint for embed page).
   * No AuthGuard -- accessible without authentication.
   */
  @Get('playback/sessions/:id')
  @ApiOperation({ summary: 'Get session info (public, for embed page)' })
  @ApiResponse({ status: 200, description: 'Session details' })
  @ApiResponse({ status: 404, description: 'Session not found or expired' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  async getSession(@Param('id') id: string) {
    const session = await this.playbackService.getSession(id);
    if (!session) {
      throw new NotFoundException('Session not found or expired');
    }
    return session;
  }

  /**
   * Serve HLS encryption key files.
   * Requires valid JWT token as query param.
   * Key URL pattern: /api/playback/keys/{app}/{orgId}/{cameraId}-{seq}.key
   */
  @Get('playback/keys/*')
  @ApiExcludeEndpoint()
  async serveHlsKey(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const token = req.query.token as string;
    if (!token) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify JWT token (minimal -- signature + expiry only)
    const session = await this.playbackService.verifyTokenMinimal(token);
    if (!session) {
      return res.status(403).json({ error: 'Invalid or expired session' });
    }

    // Extract key path from wildcard
    const keyPath = req.params[0];

    // Read key file from SRS key directory
    const keyFilePath = join(
      process.env.SRS_HLS_PATH || '/usr/local/srs/objs/nginx/html',
      'keys',
      keyPath,
    );

    try {
      const keyData = readFileSync(keyFilePath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache, no-store');
      return res.send(keyData);
    } catch {
      return res.status(404).json({ error: 'Key not found' });
    }
  }

  /**
   * Proxy m3u8 playlist from SRS, rewriting #EXT-X-KEY URIs to include
   * the viewer's token so hls.js can fetch decryption keys with authentication.
   */
  @Get('playback/stream/:orgId/:cameraId.m3u8')
  @ApiExcludeEndpoint()
  async proxyM3u8(
    @Param('orgId') orgId: string,
    @Param('cameraId') cameraId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify token
    const session = await this.playbackService.verifyTokenMinimal(token);
    if (!session) {
      return res.status(403).json({ error: 'Invalid or expired session' });
    }

    // Fetch m3u8 from SRS internal
    const srsUrl = `http://${process.env.SRS_HOST || 'localhost'}:8080/live/${orgId}/${cameraId}.m3u8`;
    try {
      const srsRes = await fetch(srsUrl);
      if (!srsRes.ok) {
        return res.status(502).json({ error: 'Stream not available' });
      }

      let m3u8Content = await srsRes.text();

      // Rewrite #EXT-X-KEY URI to include token for authenticated key fetching
      // SRS writes: #EXT-X-KEY:METHOD=AES-128,URI="/keys/live/orgId/cameraId-seq.key"
      // Rewrite to: #EXT-X-KEY:METHOD=AES-128,URI="/api/playback/keys/live/orgId/cameraId-seq.key?token=XXX"
      m3u8Content = m3u8Content.replace(
        /URI="([^"]*\.key)"/g,
        `URI="/api/playback/keys$1?token=${token}"`,
      );

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(m3u8Content);
    } catch {
      return res.status(502).json({ error: 'Stream not available' });
    }
  }
}
