import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { MinioService } from './minio.service';

@Injectable()
export class ManifestService {
  constructor(
    @Inject(TENANCY_CLIENT) private readonly prisma: any,
    private readonly minioService: MinioService,
  ) {}

  async generateManifest(
    recordingId: string,
    orgId: string,
    startTime?: Date,
    endTime?: Date,
  ): Promise<string> {
    // 1. Get recording with initSegment path
    const recording = await this.prisma.recording.findFirst({
      where: { id: recordingId, orgId },
    });
    if (!recording) throw new NotFoundException('Recording not found');

    // 2. Query segments within time range
    const whereClause: any = { recordingId, orgId };
    if (startTime || endTime) {
      whereClause.timestamp = {};
      if (startTime) whereClause.timestamp.gte = startTime;
      if (endTime) whereClause.timestamp.lte = endTime;
    }
    const segments = await this.prisma.recordingSegment.findMany({
      where: whereClause,
      orderBy: { seqNo: 'asc' },
    });

    if (segments.length === 0) {
      return this.buildEmptyManifest();
    }

    // 3. Skip leading non-keyframe segments (Phase 19.1 layer-7).
    //
    //    RTMP push recordings can begin mid-GOP — the first few segments
    //    then carry only non-IDR P-frames with no SPS/PPS, which hls.js
    //    cannot use to initialise its decoder (RFC 8216bis §4.3.2.4 says
    //    such frames "will be downloaded but possibly discarded", and
    //    hls.js 1.6.x escalates this to a fatal fragment-parsing error on
    //    the very first fragment).
    //
    //    `hasKeyframe` is populated at archive time by the H.264 NAL
    //    scanner (see h264-utils.ts). Legacy rows predate the column and
    //    are stored as `null`; we treat null as "trust it" so RTSP
    //    recordings (which have always started on a keyframe via our
    //    FFmpeg pull pipeline) continue to play unchanged.
    const firstPlayable = segments.findIndex(
      (s: any) => s.hasKeyframe !== false,
    );
    const playableSegments =
      firstPlayable < 0 ? [] : segments.slice(firstPlayable);

    if (playableSegments.length === 0) {
      return this.buildEmptyManifest();
    }

    // 4. Build proxy URLs that route through the API (same origin as manifest)
    // This avoids CORS issues with direct MinIO presigned URLs.
    // `recording.initSegment` may still be populated on rows created before the
    // MPEG-TS switch, but SRS v6 never produces one so we ignore it when
    // building the manifest (EXT-X-MAP is invalid for MPEG-TS segments).
    const segmentUrls = playableSegments.map((seg: any) => ({
      duration: seg.duration,
      url: `/api/recordings/segments/${seg.id}/proxy`,
    }));

    // 5. Build m3u8
    return this.buildManifest(segmentUrls);
  }

  buildManifest(
    segments: { duration: number; url: string }[],
  ): string {
    const maxDuration = Math.ceil(Math.max(...segments.map(s => s.duration)));

    let m3u8 = '#EXTM3U\n';
    // HLS v3 for MPEG-TS VOD manifests. Do NOT bump to v7 / add EXT-X-MAP —
    // that requires fMP4 segments which SRS v6 cannot produce (fmp4 landed in
    // v7.0.51 via PR #4159). Adding EXT-X-MAP with .ts segments breaks
    // playback in every mainstream player.
    m3u8 += '#EXT-X-VERSION:3\n';
    m3u8 += `#EXT-X-TARGETDURATION:${maxDuration}\n`;
    m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
    m3u8 += '#EXT-X-PLAYLIST-TYPE:VOD\n';

    for (const seg of segments) {
      m3u8 += `#EXTINF:${seg.duration.toFixed(6)},\n`;
      m3u8 += `${seg.url}\n`;
    }

    m3u8 += '#EXT-X-ENDLIST\n';
    return m3u8;
  }

  buildEmptyManifest(): string {
    return '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:3\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-ENDLIST\n';
  }

  /**
   * Bucket a camera's segments into 24 hour-slots over an explicit UTC window.
   *
   * The window is supplied by the caller (frontend) as the UTC instants
   * representing local-midnight-to-local-midnight of the user's selected date.
   * Buckets are computed as `floor((timestamp - windowStart) / 1h)` so the
   * server stays timezone-agnostic — `hours[0]` is "the first hour of the
   * client's local day" regardless of where the API process runs.
   *
   * Background: pre-fix this method assumed the date string named a UTC day
   * and bucketed via `getUTCHours()`, while the recordings-list table on the
   * frontend rendered `format(...)` (browser-local). For a Bangkok user
   * (UTC+7) a 17:45 local recording landed at hour 10 on the timeline →
   * 7-hour visual offset between timeline and table. See debug session
   * `recordings-detail-timeline-timezone-mismatch.md` for full analysis.
   */
  async getSegmentsForDate(
    cameraId: string,
    orgId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<{ hour: number; hasData: boolean }[]> {
    const segments = await this.prisma.recordingSegment.findMany({
      where: {
        cameraId,
        orgId,
        timestamp: { gte: windowStart, lte: windowEnd },
      },
      select: { timestamp: true },
    });

    const startMs = windowStart.getTime();
    const HOUR_MS = 60 * 60 * 1000;
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, hasData: false }));
    for (const seg of segments) {
      const offsetMs = new Date(seg.timestamp).getTime() - startMs;
      const hour = Math.floor(offsetMs / HOUR_MS);
      // Defensive clamp — DB rows sit inside [windowStart, windowEnd] thanks
      // to the gte/lte filter, but we still bound to 0..23 to harden against
      // any future caller passing a non-24h window.
      if (hour >= 0 && hour < 24) hours[hour].hasData = true;
    }
    return hours;
  }

  /**
   * Days-of-month (1..31) within the supplied UTC window that contain at
   * least one segment. The window is the user's local-month boundary
   * expressed as UTC instants, and day numbers are computed relative to
   * the window start so the result lines up with the calendar the user
   * sees in their browser timezone.
   */
  async getDaysWithRecordings(
    cameraId: string,
    orgId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<number[]> {
    const segments = await this.prisma.recordingSegment.groupBy({
      by: ['timestamp'],
      where: {
        cameraId,
        orgId,
        timestamp: { gte: windowStart, lte: windowEnd },
      },
    });

    const startMs = windowStart.getTime();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const days = new Set<number>();
    for (const seg of segments) {
      const offsetMs = new Date(seg.timestamp).getTime() - startMs;
      const day = Math.floor(offsetMs / DAY_MS) + 1;
      if (day >= 1 && day <= 31) days.add(day);
    }
    return Array.from(days).sort((a, b) => a - b);
  }
}
