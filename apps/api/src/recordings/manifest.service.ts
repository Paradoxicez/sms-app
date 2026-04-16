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

    // 3. Build proxy URLs that route through the API (same origin as manifest)
    // This avoids CORS issues with direct MinIO presigned URLs
    const initUrl = recording.initSegment
      ? `/api/recordings/${recordingId}/init-segment`
      : null;

    const segmentUrls = segments.map((seg: any) => ({
      duration: seg.duration,
      url: `/api/recordings/segments/${seg.id}/proxy`,
    }));

    // 4. Build m3u8
    return this.buildManifest(segmentUrls, initUrl);
  }

  buildManifest(
    segments: { duration: number; url: string }[],
    initSegmentUrl: string | null,
  ): string {
    const maxDuration = Math.ceil(Math.max(...segments.map(s => s.duration)));

    let m3u8 = '#EXTM3U\n';
    m3u8 += '#EXT-X-VERSION:3\n';
    m3u8 += `#EXT-X-TARGETDURATION:${maxDuration}\n`;
    m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
    m3u8 += '#EXT-X-PLAYLIST-TYPE:VOD\n';

    if (initSegmentUrl) {
      m3u8 += `#EXT-X-MAP:URI="${initSegmentUrl}"\n`;
    }

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

  async getSegmentsForDate(
    cameraId: string,
    orgId: string,
    date: string,
  ): Promise<{ hour: number; hasData: boolean }[]> {
    const dayStart = new Date(`${date}T00:00:00Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const segments = await this.prisma.recordingSegment.findMany({
      where: {
        cameraId,
        orgId,
        timestamp: { gte: dayStart, lte: dayEnd },
      },
      select: { timestamp: true },
    });

    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, hasData: false }));
    for (const seg of segments) {
      const hour = new Date(seg.timestamp).getUTCHours();
      hours[hour].hasData = true;
    }
    return hours;
  }

  async getDaysWithRecordings(
    cameraId: string,
    orgId: string,
    year: number,
    month: number,
  ): Promise<number[]> {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const segments = await this.prisma.recordingSegment.groupBy({
      by: ['timestamp'],
      where: {
        cameraId,
        orgId,
        timestamp: { gte: monthStart, lte: monthEnd },
      },
    });

    const days = new Set<number>();
    for (const seg of segments) {
      days.add(new Date(seg.timestamp).getDate());
    }
    return Array.from(days).sort((a, b) => a - b);
  }
}
