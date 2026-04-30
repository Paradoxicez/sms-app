import { Injectable, Logger } from '@nestjs/common';

/**
 * Shape of a single stream's video/audio info as extracted from SRS
 * `/api/v1/streams` response. Phase 19 (D-07) — consumed by the
 * `StreamProbeProcessor` srs-api branch and written to
 * `Camera.codecInfo.video` / `.audio`.
 */
export interface SrsStreamInfo {
  video?: {
    codec: string;
    profile?: string;
    level?: string;
    width: number;
    height: number;
  };
  audio?: {
    codec: string;
    sample_rate?: number;
    channel?: number;
    profile?: string;
  };
}

@Injectable()
export class SrsApiService {
  private readonly logger = new Logger(SrsApiService.name);
  private readonly baseUrl =
    process.env.SRS_API_URL || 'http://localhost:1985';

  async getVersions(nodeApiUrl?: string): Promise<any> {
    const url = nodeApiUrl || this.baseUrl;
    const res = await fetch(`${url}/api/v1/versions`);
    return res.json();
  }

  async getStreams(nodeApiUrl?: string): Promise<any> {
    const url = nodeApiUrl || this.baseUrl;
    // SRS /api/v1/streams paginates with default count=10. With >10 active
    // publishers the trailing entries silently disappear from the response —
    // CameraHealthService then sees those cameras as srs=false and kills
    // their FFmpeg in a tight loop. Pass a large count to disable pagination.
    // 9999 comfortably exceeds any single-host SaaS scenario.
    const res = await fetch(`${url}/api/v1/streams?count=9999`);
    return res.json();
  }

  async getClients(nodeApiUrl?: string): Promise<any> {
    const url = nodeApiUrl || this.baseUrl;
    // Same pagination caveat as getStreams — pass count=9999.
    const res = await fetch(`${url}/api/v1/clients?count=9999`);
    return res.json();
  }

  /**
   * Phase 19 (D-02) — fetch a specific stream's {video, audio} from the SRS
   * `/api/v1/streams` list. Caller passes `${orgId}/${cameraId}` (matches the
   * key StreamProcessor pushes to on `rtmp://.../live/${orgId}/${cameraId}`).
   *
   * Handles BOTH SRS name formats (see Pitfall 3 in 19-RESEARCH.md):
   *   - `app="live"`, `name="${orgId}/${cameraId}"`
   *   - `app="live/${orgId}"`, `name="${cameraId}"`
   *
   * Returns `null` on:
   *   - stream not present in SRS registry (normal — stream not published yet)
   *   - SRS API unreachable / non-2xx (caller treats as 'failed' probe)
   */
  async getStream(streamKey: string): Promise<SrsStreamInfo | null> {
    try {
      const result = await this.getStreams();
      const streams: any[] = result?.streams || [];
      const match = streams.find((s: any) => {
        const app = s.app ?? '';
        const name = s.name ?? '';
        // Strip leading "live/" so both formats collapse to "${orgId}/${cameraId}".
        const fullPath = `${app}/${name}`.replace(/^live\//, '');
        // Match either exact key or any trailing "/${streamKey}" variant (Pitfall 3).
        return fullPath === streamKey || fullPath.endsWith(`/${streamKey}`);
      });
      if (!match) {
        this.logger.debug(`SRS stream not found: ${streamKey}`);
        return null;
      }
      return { video: match.video, audio: match.audio };
    } catch (err) {
      this.logger.warn(
        `SrsApiService.getStream failed for ${streamKey}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  async getSummaries(nodeApiUrl?: string): Promise<any> {
    const url = nodeApiUrl || this.baseUrl;
    const res = await fetch(`${url}/api/v1/summaries`);
    return res.json();
  }


  async reloadConfig(nodeApiUrl?: string): Promise<void> {
    const url = nodeApiUrl || this.baseUrl;
    await fetch(`${url}/api/v1/raw?rpc=reload`);
    this.logger.log(`SRS configuration reloaded on ${url}`);
  }

  /**
   * Phase 19.1 D-22 + D-20: find the SRS client_id publishing to a given
   * stream path. `streamPath` is `push/<key>` or `live/<orgId>/<cameraId>`.
   * Returns null when no matching publisher is present or when the SRS API
   * is unreachable (caller decides how to react).
   */
  async findPublisherClientId(streamPath: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/clients`);
      if (!res.ok) return null;
      const result = (await res.json()) as {
        clients?: Array<{ id: string; url?: string; type?: string }>;
      };
      const clients = result.clients ?? [];
      // SRS v6 client.url includes the full /app/stream path.
      // Match on endsWith to tolerate leading scheme/host variations.
      const match = clients.find(
        (c) =>
          typeof c.url === 'string' &&
          c.url.endsWith(`/${streamPath}`) &&
          (c.type === 'fmle-publish' ||
            c.type === 'publish' ||
            c.type === 'rtmp-publish'),
      );
      return match?.id ?? null;
    } catch (err) {
      this.logger.warn(
        `findPublisherClientId failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Phase 19.1 D-20 + D-22: kick an SRS publisher by client_id via
   * DELETE /api/v1/clients/{id}. Throws on non-2xx so callers can decide
   * whether to swallow.
   */
  async kickPublisher(clientId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/clients/${clientId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(`SRS kick failed: ${res.status} ${res.statusText}`);
    }
    this.logger.log(`Kicked SRS client ${clientId}`);
  }
}
