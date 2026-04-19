import { Body, Controller, Logger, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { StatusService } from '../status/status.service';
import { StatusGateway } from '../status/status.gateway';
import { PlaybackService } from '../playback/playback.service';
import { RecordingsService } from '../recordings/recordings.service';
import { onHlsCallbackSchema } from '../recordings/dto/on-hls-callback.dto';

@ApiExcludeController()
@SkipThrottle()
@Controller('api/srs/callbacks')
export class SrsCallbackController {
  private readonly logger = new Logger(SrsCallbackController.name);

  constructor(
    private readonly statusService: StatusService,
    private readonly statusGateway: StatusGateway,
    private readonly playbackService: PlaybackService,
    private readonly recordingsService: RecordingsService,
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

    this.logger.debug(
      `on_play: body.param="${body.param}", body.stream="${body.stream}", parsed token="${token ? token.slice(0, 20) + '...len=' + token.length : 'null'}"`,
    );

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
    const parsed = onHlsCallbackSchema.safeParse(body);
    if (!parsed.success) {
      this.logger.warn(`Invalid on_hls callback: ${JSON.stringify(parsed.error.issues)}`);
      return { code: 0 };
    }

    const { orgId, cameraId } = this.parseStreamKey(parsed.data.stream, parsed.data.app);
    if (!orgId || !cameraId) {
      return { code: 0 }; // Internal stream, skip
    }

    try {
      const recording = await this.recordingsService.getActiveRecording(cameraId, orgId);
      if (!recording) {
        return { code: 0 }; // Not recording, skip
      }

      const quota = await this.recordingsService.checkStorageQuota(orgId);
      if (!quota.allowed) {
        this.logger.warn(`Storage quota exceeded for org=${orgId}, skipping archive`);
        return { code: 0 };
      }

      // Resolve file path for the API container
      // SRS sends relative path like ./objs/nginx/html/live/...
      // Map to the mount point the API container uses
      const hlsMountPath = process.env.SRS_HLS_PATH || '/srs-hls';
      const segmentFile = parsed.data.file.replace(/^\.\/objs\/nginx\/html/, hlsMountPath);
      const m3u8File = parsed.data.m3u8.replace(/^\.\/objs\/nginx\/html/, hlsMountPath);

      // T-07-01: Path validation - reject path traversal
      if (segmentFile.includes('..') || m3u8File.includes('..')) {
        this.logger.warn(`Path traversal attempt detected in on_hls callback`);
        return { code: 0 };
      }

      await this.recordingsService.archiveSegment(recording.id, orgId, cameraId, {
        filePath: segmentFile,
        duration: parsed.data.duration,
        seqNo: parsed.data.seq_no,
        url: parsed.data.url,
        m3u8Path: m3u8File,
      });
    } catch (err) {
      // Fire-and-forget pattern: log error but don't block SRS
      this.logger.error(`Failed to archive segment: ${(err as Error).message}`, (err as Error).stack);
    }

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
      // SRS passes stream with HLS/segment extensions on play events:
      //   - playlist: "{cameraId}.m3u8"
      //   - segment:  "{cameraId}-{seq}.ts" / ".m4s"
      // Strip the extension first, then only strip the segment `-{seq}`
      // suffix when an extension was actually present. Without this guard a
      // legitimate cameraId like "cam-1" would be mangled to "cam" on
      // publish/play events that pass the canonical key.
      let cameraId = parts[1];
      const extMatch = cameraId.match(/\.(m3u8|ts|m4s|mp4|flv)$/);
      if (extMatch) {
        cameraId = cameraId.slice(0, -extMatch[0].length).replace(/-\d+$/, '');
      }
      return { orgId: parts[0], cameraId };
    }
    return {};
  }
}
