import { Body, Controller, Logger, Post } from '@nestjs/common';
import { StatusService } from '../status/status.service';
import { StatusGateway } from '../status/status.gateway';
import { PlaybackService } from '../playback/playback.service';

@Controller('api/srs/callbacks')
export class SrsCallbackController {
  private readonly logger = new Logger(SrsCallbackController.name);

  constructor(
    private readonly statusService: StatusService,
    private readonly statusGateway: StatusGateway,
    private readonly playbackService: PlaybackService,
  ) {}

  @Post('on-publish')
  async onPublish(@Body() body: any) {
    const { orgId, cameraId } = this.parseStreamKey(body.stream, body.app);
    if (orgId && cameraId) {
      this.logger.log(`Stream published: camera=${cameraId}, org=${orgId}`);
      await this.statusService.transition(cameraId, orgId, 'online');
    }
    return { code: 0 };
  }

  @Post('on-unpublish')
  async onUnpublish(@Body() body: any) {
    const { orgId, cameraId } = this.parseStreamKey(body.stream, body.app);
    if (orgId && cameraId) {
      this.logger.log(`Stream unpublished: camera=${cameraId}, org=${orgId}`);
      // Reconnect is handled by BullMQ — do not transition status here
    }
    return { code: 0 };
  }

  @Post('on-play')
  async onPlay(@Body() body: any) {
    const { orgId, cameraId } = this.parseStreamKey(body.stream, body.app);

    // Internal streams (no orgId/cameraId) pass through without verification
    if (!orgId || !cameraId) {
      return { code: 0 };
    }

    // Extract token from SRS param field
    // SRS sends query params in 'param' field, may or may not have leading '?'
    const paramStr = (body.param || '').replace(/^\?/, '');
    const params = new URLSearchParams(paramStr);
    const token = params.get('token');

    if (!token) {
      this.logger.warn(`Playback rejected: no token for camera=${cameraId}`);
      return { code: 403 };
    }

    // Verify JWT token
    const session = await this.playbackService.verifyToken(token, cameraId, orgId);
    if (!session) {
      this.logger.warn(`Playback rejected: invalid token for camera=${cameraId}`);
      return { code: 403 };
    }

    // Verify domain from pageUrl (D-13)
    const pageUrl = body.pageUrl || '';
    if (!this.playbackService.matchDomain(pageUrl, session.domains, session.allowNoReferer)) {
      this.logger.warn(`Playback rejected: domain not allowed for camera=${cameraId}, pageUrl=${pageUrl}`);
      return { code: 403 };
    }

    // Check viewer limit (D-05: per camera, not per token)
    const currentViewers = this.statusService.getViewerCount(cameraId);
    if (session.maxViewers > 0 && currentViewers >= session.maxViewers) {
      this.logger.warn(`Playback rejected: viewer limit ${session.maxViewers} reached for camera=${cameraId}`);
      return { code: 403 };
    }

    // Allow playback + increment viewers
    const count = this.statusService.incrementViewers(cameraId);
    this.statusGateway.broadcastViewerCount(orgId, cameraId, count);
    this.logger.debug(`Viewer joined: camera=${cameraId}, count=${count}`);
    return { code: 0 };
  }

  @Post('on-stop')
  async onStop(@Body() body: any) {
    const { orgId, cameraId } = this.parseStreamKey(body.stream, body.app);
    if (orgId && cameraId) {
      const count = this.statusService.decrementViewers(cameraId);
      this.statusGateway.broadcastViewerCount(orgId, cameraId, count);
      this.logger.debug(`Viewer left: camera=${cameraId}, count=${count}`);
    }
    return { code: 0 };
  }

  @Post('on-hls')
  async onHls(@Body() body: any) {
    this.logger.debug(`HLS segment: ${JSON.stringify(body)}`);
    return { code: 0 };
  }

  @Post('on-dvr')
  async onDvr(@Body() body: any) {
    this.logger.debug(`DVR event: ${JSON.stringify(body)}`);
    return { code: 0 };
  }

  /**
   * Parse stream key from SRS callback data.
   * Handles multiple formats:
   * - app="live" stream="{orgId}/{cameraId}"
   * - app="live/{orgId}" stream="{cameraId}"
   * - app="" stream="live/{orgId}/{cameraId}"
   */
  private parseStreamKey(
    stream: string,
    app: string,
  ): { orgId?: string; cameraId?: string } {
    const fullPath = app ? `${app}/${stream}` : stream;
    const parts = fullPath.replace(/^live\//, '').split('/');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return { orgId: parts[0], cameraId: parts[1] };
    }
    return {};
  }
}
