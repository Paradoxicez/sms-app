import { Body, Controller, Logger, Post } from '@nestjs/common';
import { StatusService } from '../status/status.service';
import { StatusGateway } from '../status/status.gateway';

@Controller('api/srs/callbacks')
export class SrsCallbackController {
  private readonly logger = new Logger(SrsCallbackController.name);

  constructor(
    private readonly statusService: StatusService,
    private readonly statusGateway: StatusGateway,
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
    if (orgId && cameraId) {
      const count = this.statusService.incrementViewers(cameraId);
      this.statusGateway.broadcastViewerCount(orgId, cameraId, count);
      this.logger.debug(`Viewer joined: camera=${cameraId}, count=${count}`);
    }
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
