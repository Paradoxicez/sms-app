import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { FfprobeService } from '../../cameras/ffprobe.service';
import { SystemPrismaService } from '../../prisma/system-prisma.service';
import { SrsApiService } from '../../srs/srs-api.service';
import { StatusGateway } from '../../status/status.gateway';
import { ProbeJobData, CodecInfo } from '../../cameras/types/codec-info';

/**
 * StreamProbeProcessor — runs ffprobe (or pulls SRS /api/v1/streams) against
 * newly-imported cameras to populate `Camera.codecInfo` for transcode/
 * passthrough decisions AND to drive the UI's 4-state codec cell
 * (pending → success | failed, see Phase 19 UI-SPEC).
 *
 * Background worker, no CLS context → uses SystemPrismaService (RLS-bypass).
 * Lookup by primary key (cameraId from job, originally produced by an
 * org-scoped call).
 *
 * Phase 19 (D-01, D-02, D-04, D-07):
 *   - Writes the shared `CodecInfo` tagged-union shape (status + source).
 *   - Writes `status: 'pending'` FIRST so the UI spinner appears immediately.
 *   - Branches on `job.data.source`: 'ffprobe' (default — pull-via-RTSP) or
 *     'srs-api' (after on-publish — ground truth from SRS registry).
 *   - Normalizes FFmpeg stderr through a 9-pattern dictionary BEFORE writing
 *     to `codecInfo.error` (T-19-04 info-disclosure mitigation — no raw host
 *     or network detail reaches the UI).
 *   - Defensive guard refuses jobs with empty cameraId or streamUrl (mirror of
 *     stream.processor.ts:47-56, MEMORY.md 260421-g9o precedent).
 *
 * Concurrency=5: probe is short (15s timeout in FfprobeService); 5 parallel
 * ffprobe children are cheap and let bulk imports of ~50 cameras finish
 * within ~2 min worst case.
 *
 * Best-effort: probe failures (unreachable camera, bad creds) record a
 * normalized error string in `codecInfo.error` and do NOT throw — worker
 * stays alive, BullMQ does not retry needlessly.
 */
@Processor('stream-probe', { concurrency: 5 })
export class StreamProbeProcessor extends WorkerHost {
  private readonly logger = new Logger(StreamProbeProcessor.name);

  constructor(
    private readonly ffprobeService: FfprobeService,
    private readonly prisma: SystemPrismaService,
    private readonly srsApi: SrsApiService,
    // Phase 19 follow-up: push codecInfo updates over WebSocket so the
    // 4-state codec cell auto-transitions without a page refresh.
    // StatusModule is @Global() and exports StatusGateway, so direct inject
    // works without adding StatusModule to imports.
    private readonly statusGateway: StatusGateway,
  ) {
    super();
  }

  /**
   * Persist + broadcast codecInfo in one helper. Keeps WS emission inseparable
   * from the DB write so the UI stays in sync with the source of truth.
   */
  private async writeCodecInfo(
    cameraId: string,
    orgId: string,
    codecInfo: CodecInfo,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.camera.update({
      where: { id: cameraId },
      data: {
        ...(extra ?? {}),
        codecInfo: codecInfo as any, // Prisma Json column
      },
    });
    this.statusGateway.broadcastCodecInfo(orgId, cameraId, codecInfo);
  }

  async process(job: Job<ProbeJobData>): Promise<void> {
    const { cameraId, streamUrl, orgId, source = 'ffprobe' } = job.data ?? ({} as ProbeJobData);

    // D-01 + MEMORY.md defensive guard — mirror stream.processor.ts:47-56.
    // BullMQ has been observed enqueuing jobs with empty data; refuse at the
    // choke point so we never corrupt codecInfo with a null-keyed update.
    if (!cameraId || !streamUrl) {
      this.logger.error(
        `StreamProbeProcessor: refusing job with empty data cameraId=${cameraId ?? '<undefined>'} streamUrl=${streamUrl ? 'set' : 'empty'}`,
      );
      return;
    }

    // Mark pending so the UI spinner appears immediately (D-07 tagged union).
    const nowIso = new Date().toISOString();
    await this.writeCodecInfo(cameraId, orgId, {
      status: 'pending',
      probedAt: nowIso,
      source,
    });

    try {
      if (source === 'srs-api') {
        // D-02: pull ground-truth {video, audio} from SRS /api/v1/streams.
        const info = await this.srsApi.getStream(`${orgId}/${cameraId}`);
        if (!info) {
          // SRS didn't know about the stream — normalize to "Stream path not found".
          throw new Error('Stream not found');
        }
        await this.writeCodecInfo(cameraId, orgId, {
          status: 'success',
          video: info.video
            ? {
                codec: info.video.codec,
                width: info.video.width,
                height: info.video.height,
                profile: info.video.profile,
                level: info.video.level,
              }
            : undefined,
          audio: info.audio
            ? {
                codec: info.audio.codec,
                sampleRate: info.audio.sample_rate,
                channels: info.audio.channel,
              }
            : undefined,
          probedAt: new Date().toISOString(),
          source: 'srs-api',
        });
        this.logger.log(
          `Probed (srs-api) camera ${cameraId}: codec=${info.video?.codec ?? 'n/a'}`,
        );
      } else {
        // ffprobe path — existing behavior preserved but rewritten to the
        // new tagged-union shape.
        const result = await this.ffprobeService.probeCamera(streamUrl);
        await this.writeCodecInfo(
          cameraId,
          orgId,
          {
            status: 'success',
            video: {
              codec: result.codec,
              width: result.width,
              height: result.height,
              fps: result.fps,
            },
            audio:
              result.audioCodec && result.audioCodec !== 'none'
                ? { codec: result.audioCodec }
                : undefined,
            probedAt: new Date().toISOString(),
            source: 'ffprobe',
          },
          { needsTranscode: result.needsTranscode },
        );
        this.logger.log(
          `Probed (ffprobe) camera ${cameraId}: codec=${result.codec}, transcode=${result.needsTranscode}`,
        );
      }
    } catch (err) {
      const rawMessage = (err as Error).message ?? String(err);
      const normalizedError = this.normalizeError(rawMessage);
      this.logger.warn(
        `Probe failed for camera ${cameraId} (source=${source}): ${normalizedError}`,
      );
      // Best-effort: record error but do not throw. We don't want BullMQ to
      // retry probes against unreachable cameras 20× per import.
      try {
        await this.writeCodecInfo(cameraId, orgId, {
          status: 'failed',
          error: normalizedError,
          probedAt: new Date().toISOString(),
          source,
        });
      } catch (updateErr) {
        this.logger.error(
          `Failed to record probe error for camera ${cameraId}: ${(updateErr as Error).message}`,
        );
      }
    }
  }

  /**
   * normalizeError — maps raw FFmpeg / SRS / system errno strings to a fixed
   * set of user-friendly phrases.
   *
   * T-19-04 mitigation: raw internal command lines, ffprobe flags, internal
   * IP/port pairs, file-system paths, and stack traces NEVER reach the UI
   * tooltip. Anything that doesn't match a known pattern returns a generic
   * safe message rather than truncating raw stderr (which used to leak the
   * "ffprobe -v quiet ..." command line into the UI).
   *
   * Patterns are anchored on the underlying error keyword/errno (which can
   * appear anywhere in the stderr blob), not on a wrapper prefix, so the
   * "Command failed: ffprobe ... [error here]" wrapper doesn't defeat the
   * regex match.
   */
  private normalizeError(raw: string): string {
    const patterns: Array<[RegExp, string]> = [
      // — connection refused: server reachable, port closed —
      [/Connection refused|ECONNREFUSED/i, "Camera refused the connection — check the port and that the camera is on"],
      // — host route problems —
      [
        /Network is unreachable|ENETUNREACH|EHOSTUNREACH|No route to host/i,
        "Can't reach the camera on the network — check the IP address and that the camera is online",
      ],
      [/Host is down|EHOSTDOWN/i, 'Camera appears to be offline'],
      // — DNS —
      [
        /unable to resolve host|ENOTFOUND|getaddrinfo|Name or service not known/i,
        "Can't find the camera by that hostname — check the URL",
      ],
      // — auth —
      [
        /401 Unauthorized|authorization required|Authentication failed|403 Forbidden/i,
        'Wrong username or password',
      ],
      // — timeouts —
      [
        /timed out|ETIMEDOUT|Timeout|Operation timed out/i,
        "Camera didn't respond in time — try again or check the network",
      ],
      // — stream path —
      [
        /404 Not Found|Stream not found|Server returned 404/i,
        'No stream at that URL path',
      ],
      // — codec / format —
      [
        /Invalid data found when processing input|moov atom not found/i,
        "Stream format isn't recognized",
      ],
      [/Unsupported codec|No decoder for codec/i, 'This camera uses a video codec we don\'t support'],
      // — TLS / RTMPS —
      [/SSL handshake|TLS error|certificate verify failed|SSL_ERROR/i, 'Secure connection (TLS) failed'],
      // — protocol-level —
      [/Protocol not found|Unknown protocol/i, "URL protocol isn't supported"],
      [
        /Server returned 5\d\d|Internal Server Error/i,
        'Camera reported an internal error',
      ],
      // — connection reset mid-stream —
      [
        /Connection reset by peer|ECONNRESET|Broken pipe|EPIPE/i,
        'Connection to the camera was interrupted',
      ],
    ];
    for (const [rx, msg] of patterns) {
      if (rx.test(raw)) return msg;
    }
    // Generic fallback — never leak raw stderr (T-19-04). Used to be
    // raw.slice(0, 80) which exposed the ffprobe command line.
    return "Couldn't reach the camera — check the URL and that the camera is online";
  }
}
