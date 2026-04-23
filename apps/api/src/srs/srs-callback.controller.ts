import { Body, Controller, Inject, Logger, Post, forwardRef } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';
import { StatusService } from '../status/status.service';
import { StatusGateway } from '../status/status.gateway';
import { PlaybackService } from '../playback/playback.service';
import { RecordingsService } from '../recordings/recordings.service';
import { onHlsCallbackSchema } from '../recordings/dto/on-hls-callback.dto';
import { CamerasService } from '../cameras/cameras.service';
import { OnForwardSchema } from './dto/on-forward.dto';
import { AuditService } from '../audit/audit.service';
import { streamKeyPrefix } from '../cameras/stream-key.util';

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
    // Phase 19 (D-02): on-publish enqueues a refresh probe with
    // source: 'srs-api'. forwardRef breaks the CamerasModule ↔ SrsModule
    // import cycle at DI resolution time.
    @Inject(forwardRef(() => CamerasService))
    private readonly camerasService: CamerasService,
    // Phase 19.1 (D-21): push-rejected + first-publish audit events.
    // Optional in type (via `?`) so pre-19.1 unit tests that construct the
    // controller with 5 positional args still compile. Push-branch code
    // paths guard with `this.auditService?.log(...)` before invoking.
    private readonly auditService?: AuditService,
  ) {}

  @Post('on-publish')
  async onPublish(@Body() body: any) {
    const app = body?.app ?? '';
    const stream = body?.stream ?? '';
    const clientIp = body?.ip ?? undefined;

    const parsed = this.parseStreamKey(stream, app);

    // Phase 19.1 (D-15): push branch — DB-resolved stream key.
    if (parsed.mode === 'push') {
      const camera = await this.camerasService.findByStreamKey(parsed.streamKey);

      if (!camera) {
        // D-21: unknown key → audit (system org sentinel) + 403.
        // NEVER log the full key — only the 4-char prefix.
        try {
          await this.auditService?.log({
            orgId: 'system',
            action: 'camera.push.publish_rejected',
            resource: 'camera',
            method: 'POST',
            path: '/api/srs/callbacks/on-publish',
            ip: clientIp,
            details: {
              streamKeyPrefix: streamKeyPrefix(parsed.streamKey),
              reason: 'unknown_key',
            },
          });
        } catch (err) {
          this.logger.warn(
            `Audit publish_rejected failed: ${(err as Error).message}`,
          );
        }
        this.logger.warn(
          `Push publish rejected — unknown key prefix=${streamKeyPrefix(parsed.streamKey)} ip=${clientIp ?? '?'}`,
        );
        return { code: 403 };
      }

      this.logger.log(
        `Push publish: camera=${camera.id} org=${camera.orgId} keyPrefix=${streamKeyPrefix(parsed.streamKey)}`,
      );

      // D-23: maintenance does not block publish — StatusService gate handles
      // notification/webhook suppression downstream.
      //
      // State machine invariant: offline cameras must pass through `connecting`
      // before reaching `online` (see StatusService.validTransitions). Pull
      // cameras hit `connecting` when FFmpeg starts the pull; push cameras have
      // no equivalent pre-publish phase, so we bridge offline→connecting here
      // before the real transition to online. notify dispatch is debounced by
      // jobId, so the pair collapses to a single `online` notification.
      if (camera.status === 'offline') {
        await this.statusService.transition(camera.id, camera.orgId, 'connecting');
      }
      await this.statusService.transition(camera.id, camera.orgId, 'online');

      // D-02 pitfall: delay 1000ms so SRS /api/v1/streams reflects the new publisher.
      try {
        await this.camerasService.enqueueProbeFromSrs(camera.id, camera.orgId, {
          delay: 1000,
        });
      } catch (err) {
        this.logger.warn(
          `Failed to enqueue SRS refresh probe for ${camera.id}: ${(err as Error).message}`,
        );
      }

      // D-21: first_publish audit — idempotent via CamerasService flip.
      try {
        const wasFirst = await this.camerasService.markFirstPublishIfNeeded(
          camera.id,
          camera.orgId,
          { clientIp },
        );
        if (wasFirst) {
          await this.auditService?.log({
            orgId: camera.orgId,
            action: 'camera.push.first_publish',
            resource: 'camera',
            resourceId: camera.id,
            method: 'POST',
            path: '/api/srs/callbacks/on-publish',
            ip: clientIp,
            details: {},
          });
        }
      } catch (err) {
        this.logger.warn(
          `markFirstPublishIfNeeded failed for ${camera.id}: ${(err as Error).message}`,
        );
      }

      return { code: 0 };
    }

    // Live branch — preserve existing behavior exactly.
    if (parsed.mode === 'live' && parsed.orgId && parsed.cameraId) {
      this.logger.log(
        `Stream published: camera=${parsed.cameraId}, org=${parsed.orgId}`,
      );
      await this.statusService.transition(
        parsed.cameraId,
        parsed.orgId,
        'online',
      );

      // D-02: refresh codecInfo from SRS /api/v1/streams as ground truth.
      try {
        await this.camerasService.enqueueProbeFromSrs(
          parsed.cameraId,
          parsed.orgId,
          { delay: 1000 },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to enqueue SRS refresh probe for ${parsed.cameraId}: ${(err as Error).message}`,
        );
      }
    }
    return { code: 0 };
  }

  @Post('on-unpublish')
  async onUnpublish(@Body() body: any) {
    const parsed = this.parseStreamKey(body?.stream ?? '', body?.app ?? '');
    if (parsed.mode === 'live' && parsed.orgId && parsed.cameraId) {
      this.logger.log(
        `Stream unpublished: camera=${parsed.cameraId}, org=${parsed.orgId}`,
      );
      // Reconnect is handled by BullMQ — do not transition status here
    } else if (parsed.mode === 'push') {
      // Push cameras don't need per-play-event handling here — HLS is
      // served from the forwarded live/{orgId}/{cameraId} path and those
      // unpublish events flow through the live branch above.
      this.logger.debug(
        `on-unpublish push keyPrefix=${streamKeyPrefix(parsed.streamKey)} — no-op`,
      );
    }
    return { code: 0 };
  }

  @Post('on-play')
  async onPlay(@Body() body: any) {
    const parsed = this.parseStreamKey(body?.stream ?? '', body?.app ?? '');

    // Push mode on on_play is unexpected (viewers always hit live/...), but
    // if SRS ever does hand us the push app here we pass through — the
    // authoritative auth chokepoint is on_publish, and on_play tokens are
    // bound to live/{orgId}/{cameraId}.
    if (parsed.mode === 'push') {
      this.logger.debug(
        `on-play push keyPrefix=${streamKeyPrefix(parsed.streamKey)} — no-op`,
      );
      return { code: 0 };
    }

    const { orgId, cameraId } =
      parsed.mode === 'live' ? parsed : { orgId: undefined, cameraId: undefined };

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
    const parsed = this.parseStreamKey(body?.stream ?? '', body?.app ?? '');
    if (parsed.mode === 'live' && parsed.orgId && parsed.cameraId) {
      const count = this.statusService.decrementViewers(parsed.cameraId);
      this.statusGateway.broadcastViewerCount(
        parsed.orgId,
        parsed.cameraId,
        count,
      );
      this.logger.debug(
        `Viewer left: camera=${parsed.cameraId}, count=${count}`,
      );
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

    const parsedKey = this.parseStreamKey(parsed.data.stream, parsed.data.app);
    if (parsedKey.mode !== 'live' || !parsedKey.orgId || !parsedKey.cameraId) {
      return { code: 0 }; // Internal stream or push — skip
    }
    const { orgId, cameraId } = parsedKey;

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
   * Phase 19.1 (D-18): SRS v6 forward backend hook. SRS asks where to forward
   * a publish; we respond with { code: 0, data: { urls: [...] } }.
   *
   * Routing matrix:
   *   app=push + needsTranscode=false → forward to rtmp://127.0.0.1:1935/live/{orgId}/{cameraId}
   *   app=push + needsTranscode=true  → empty urls (FFmpeg-transcode path handles forward)
   *   app=live (internal)             → empty urls (RECURSION GUARD — RESEARCH Pitfall 3)
   *   app=push + unknown key          → empty urls (on_publish is the auth chokepoint; on_forward trusts it)
   *
   * MUST return { code: 0 } for SRS to treat the hook as successful. Non-zero
   * codes abort the publish even though on_publish already allowed it.
   */
  @Post('on-forward')
  async onForward(@Body() body: any) {
    const parsed = OnForwardSchema.safeParse(body);
    if (!parsed.success) {
      this.logger.warn(`on-forward: invalid body ${JSON.stringify(body)}`);
      return { code: 0, data: { urls: [] } };
    }

    // Recursion guard — ignore non-push apps (RESEARCH Pitfall 3).
    if (parsed.data.app !== 'push') {
      return { code: 0, data: { urls: [] } };
    }

    const streamKey = parsed.data.stream;
    let target: { orgId: string; cameraId: string; needsTranscode: boolean } | null = null;
    try {
      target = await this.camerasService.resolveForwardTarget(streamKey);
    } catch (err) {
      this.logger.warn(
        `resolveForwardTarget failed: ${(err as Error).message}`,
      );
    }

    // Unknown key or transcode path → empty urls.
    if (!target || target.needsTranscode) {
      return { code: 0, data: { urls: [] } };
    }

    // Zero-transcode passthrough: forward push/<key> → live/{orgId}/{cameraId}.
    // SRS_HOST default '127.0.0.1' works in Docker Compose (same network).
    const srsHost = process.env.SRS_HOST ?? '127.0.0.1';
    const url = `rtmp://${srsHost}:1935/live/${target.orgId}/${target.cameraId}`;
    this.logger.log(
      `Forward push/${streamKeyPrefix(streamKey)}… → ${url}`,
    );
    return { code: 0, data: { urls: [url] } };
  }

  /**
   * Parse stream key from SRS callback data.
   *
   * Returns a discriminated union:
   *   - { mode: 'push', streamKey } — app='push', stream IS the canonical key.
   *       Extension-strip is NOT applied to push keys (on_publish always
   *       receives the canonical key; extension-strip is an on_play concern
   *       that does not apply here — see RESEARCH anti-pattern #3).
   *   - { mode: 'live', orgId?, cameraId? } — app='live' or empty.
   *       Handles existing formats:
   *         app="live" stream="{orgId}/{cameraId}"
   *         app="live/{orgId}" stream="{cameraId}"
   *         app="" stream="live/{orgId}/{cameraId}"
   */
  private parseStreamKey(
    stream: string,
    app: string,
  ):
    | { mode: 'push'; streamKey: string }
    | { mode: 'live'; orgId?: string; cameraId?: string } {
    // Phase 19.1 (D-15): push branch.
    if (app === 'push') {
      return { mode: 'push', streamKey: stream };
    }

    // Existing live-branch logic — preserve exactly.
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
      return { mode: 'live', orgId: parts[0], cameraId };
    }
    return { mode: 'live' };
  }
}
