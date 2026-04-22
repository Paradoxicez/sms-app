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
    const res = await fetch(`${url}/api/v1/streams`);
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

  async getClients(nodeApiUrl?: string): Promise<any> {
    const url = nodeApiUrl || this.baseUrl;
    const res = await fetch(`${url}/api/v1/clients`);
    return res.json();
  }

  async reloadConfig(nodeApiUrl?: string): Promise<void> {
    const url = nodeApiUrl || this.baseUrl;
    await fetch(`${url}/api/v1/raw?rpc=reload`);
    this.logger.log(`SRS configuration reloaded on ${url}`);
  }
}
