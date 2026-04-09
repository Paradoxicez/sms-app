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
import { Request, Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PlaybackService } from './playback.service';

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
  @UseGuards(AuthGuard)
  async createSession(@Param('cameraId') cameraId: string) {
    return this.playbackService.createSession(cameraId, this.getOrgId());
  }

  /**
   * Get session info (public endpoint for embed page).
   * No AuthGuard -- accessible without authentication.
   */
  @Get('playback/sessions/:id')
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
    const srsUrl = `http://srs:8080/live/${orgId}/${cameraId}.m3u8`;
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
