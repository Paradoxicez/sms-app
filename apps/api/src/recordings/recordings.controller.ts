import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  BadRequestException,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { Response } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { FeatureGuard, RequireFeature } from '../features/features.guard';
import { FeatureKey } from '../features/feature-key.enum';
import { RecordingsService } from './recordings.service';
import { ManifestService } from './manifest.service';
import { MinioService } from './minio.service';
import { startRecordingSchema } from './dto/start-recording.dto';
import { createScheduleSchema } from './dto/create-schedule.dto';
import { updateRetentionSchema } from './dto/update-retention.dto';
import { recordingQuerySchema } from './dto/recording-query.dto';
import { BulkDownloadService } from './bulk-download.service';
import {
  buildDownloadPlaylist,
  buildRemuxArgs,
  PlaylistSegment,
  skipLeadingNonKeyframeSegments,
} from './download-playlist.util';
import { resolveDayWindow, resolveMonthWindow } from './timeline-window.util';

@ApiTags('Recordings')
@Controller('api/recordings')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature(FeatureKey.RECORDINGS)
export class RecordingsController {
  constructor(
    private readonly recordingsService: RecordingsService,
    private readonly manifestService: ManifestService,
    private readonly minioService: MinioService,
    private readonly bulkDownloadService: BulkDownloadService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  async findAllRecordings(@Query() query: any) {
    const parsed = recordingQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const orgId = this.cls.get('ORG_ID');
    return this.recordingsService.findAllRecordings(orgId, parsed.data);
  }

  @Delete('bulk')
  async bulkDeleteRecordings(@Body() body: { ids: string[] }) {
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      throw new BadRequestException('ids must be a non-empty array of recording IDs');
    }
    if (body.ids.length > 100) {
      throw new BadRequestException('Cannot delete more than 100 recordings at once');
    }
    const orgId = this.cls.get('ORG_ID');
    return this.recordingsService.bulkDeleteRecordings(body.ids, orgId);
  }

  @Post('bulk-download')
  async bulkDownload(@Body() body: { ids: string[] }, @Res() res: Response) {
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      throw new BadRequestException('ids must be a non-empty array of recording IDs');
    }
    if (body.ids.length > 20) {
      throw new BadRequestException('Cannot download more than 20 recordings at once');
    }

    const orgId = this.cls.get('ORG_ID');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await this.bulkDownloadService.processJob(
        body.ids,
        orgId,
        (current, total, name) => {
          sendEvent({ type: 'progress', current, total, name });
        },
      );

      sendEvent({
        type: 'ready',
        jobId: result.jobId,
        filename: result.filename,
        size: result.size,
      });
    } catch {
      sendEvent({ type: 'error', message: 'Failed to create download' });
    }

    res.end();
  }

  @Get('bulk-download/:jobId')
  async downloadBulkZip(@Param('jobId') jobId: string, @Res() res: Response) {
    const job = this.bulkDownloadService.getJob(jobId);
    if (!job) {
      throw new BadRequestException('Download not found or expired');
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);
    res.setHeader('Content-Length', job.size);

    const { createReadStream } = await import('fs');
    const stream = createReadStream(job.zipPath);
    stream.pipe(res);

    stream.on('end', () => {
      this.bulkDownloadService.cleanupJob(jobId);
    });
  }

  @Post('start')
  async startRecording(@Body() body: any) {
    const parsed = startRecordingSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const orgId = this.cls.get('ORG_ID');
    return this.recordingsService.startRecording(parsed.data.cameraId, orgId);
  }

  @Post('stop')
  async stopRecording(@Body() body: any) {
    const parsed = startRecordingSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const orgId = this.cls.get('ORG_ID');
    return this.recordingsService.stopRecording(parsed.data.cameraId, orgId);
  }

  @Get('camera/:cameraId')
  async listRecordings(
    @Param('cameraId') cameraId: string,
    @Query('date') date?: string,
    @Query('startUtc') startUtc?: string,
    @Query('endUtc') endUtc?: string,
  ) {
    const orgId = this.cls.get('ORG_ID');
    const window = resolveDayWindow(date, startUtc, endUtc);
    return this.recordingsService.listRecordings(cameraId, orgId, window);
  }

  // Timeline / calendar / list endpoints accept an explicit UTC window
  // (`startUtc`/`endUtc`) computed by the client from the user's selected
  // local-day or local-month. The legacy `date`/`year`+`month` params are
  // still accepted for backward compatibility but are interpreted as UTC
  // boundaries (which silently mis-buckets recordings for any non-UTC user
  // — see debug session recordings-detail-timeline-timezone-mismatch.md).
  // New callers should always pass `startUtc`/`endUtc`.
  @Get('camera/:cameraId/timeline')
  async getTimeline(
    @Param('cameraId') cameraId: string,
    @Query('date') date?: string,
    @Query('startUtc') startUtc?: string,
    @Query('endUtc') endUtc?: string,
  ) {
    const orgId = this.cls.get('ORG_ID');
    const window = resolveDayWindow(date, startUtc, endUtc);
    if (!window) {
      throw new BadRequestException(
        'Either (startUtc + endUtc) ISO timestamps or "date" in YYYY-MM-DD format is required',
      );
    }
    const hours = await this.manifestService.getSegmentsForDate(
      cameraId,
      orgId,
      window.start,
      window.end,
    );
    return { hours };
  }

  @Get('camera/:cameraId/calendar')
  async getCalendar(
    @Param('cameraId') cameraId: string,
    @Query('year') yearStr?: string,
    @Query('month') monthStr?: string,
    @Query('startUtc') startUtc?: string,
    @Query('endUtc') endUtc?: string,
  ) {
    const orgId = this.cls.get('ORG_ID');
    const window = resolveMonthWindow(yearStr, monthStr, startUtc, endUtc);
    if (!window) {
      throw new BadRequestException(
        'Either (startUtc + endUtc) ISO timestamps or ("year" + "month" 1-12) is required',
      );
    }
    const days = await this.manifestService.getDaysWithRecordings(
      cameraId,
      orgId,
      window.start,
      window.end,
    );
    return { days };
  }

  @Get('camera/:cameraId/schedules')
  async listSchedules(@Param('cameraId') cameraId: string) {
    const orgId = this.cls.get('ORG_ID');
    return this.recordingsService.listSchedules(cameraId, orgId);
  }

  @Post('schedules')
  async createSchedule(@Body() body: any) {
    const parsed = createScheduleSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const orgId = this.cls.get('ORG_ID');
    return this.recordingsService.createSchedule(orgId, parsed.data);
  }

  @Put('schedules/:id')
  async updateSchedule(@Param('id') id: string, @Body() body: any) {
    const parsed = createScheduleSchema.partial().safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const orgId = this.cls.get('ORG_ID');
    return this.recordingsService.updateSchedule(id, orgId, parsed.data);
  }

  @Delete('schedules/:id')
  async deleteSchedule(@Param('id') id: string) {
    const orgId = this.cls.get('ORG_ID');
    await this.recordingsService.deleteSchedule(id, orgId);
    return { success: true };
  }

  @Put('camera/:cameraId/retention')
  async updateRetention(
    @Param('cameraId') cameraId: string,
    @Body() body: any,
  ) {
    const parsed = updateRetentionSchema.safeParse({ ...body, cameraId });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues);
    }
    const orgId = this.cls.get('ORG_ID');
    return this.recordingsService.updateRetention(cameraId, orgId, parsed.data.retentionDays);
  }

  @Get('storage')
  async getStorageQuota() {
    const orgId = this.cls.get('ORG_ID');
    const quota = await this.recordingsService.checkStorageQuota(orgId);
    return {
      usageBytes: quota.usageBytes.toString(),
      limitBytes: quota.limitBytes.toString(),
      usagePercent: quota.usagePercent,
      allowed: quota.allowed,
    };
  }

  @Get(':id/download')
  async downloadRecording(@Param('id') id: string, @Res() res: Response) {
    const orgId = this.cls.get('ORG_ID');
    const recording = await this.recordingsService.getRecordingWithSegments(id, orgId);

    if (recording.segments.length === 0) {
      throw new BadRequestException('Recording has no downloadable file');
    }

    const cameraName = (recording.camera?.name ?? 'recording').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date(recording.startedAt).toISOString().slice(0, 10);
    const filename = `${cameraName}-${dateStr}.mp4`;

    // Build presigned URLs for segments and create an in-memory m3u8.
    // See download-playlist.util.ts for why TARGETDURATION is dynamic and why
    // `-bsf:a aac_adtstoasc` is required — both are RTMP-push-specific fixes.
    const sortedSegments = recording.segments.sort((a: any, b: any) => a.seqNo - b.seqNo);

    // Phase 19.1 layer-7: drop leading segments we verified contain no IDR.
    // FFmpeg would skip them at decode time anyway, but trimming here keeps
    // the produced MP4 aligned with the hls.js preview (same starting frame)
    // and shaves a few MB off the download for push recordings that began
    // mid-GOP. Legacy rows (hasKeyframe=null) are preserved by the helper.
    const playableSegments = skipLeadingNonKeyframeSegments(
      sortedSegments.map((s: any) => ({
        duration: s.duration ?? 2.56,
        url: '', // filled in below
        hasKeyframe: s.hasKeyframe,
        __row: s,
      })),
    );
    if (playableSegments.length === 0) {
      throw new BadRequestException(
        'Recording has no segments with a decodable keyframe',
      );
    }
    const playlistSegments: PlaylistSegment[] = [];
    for (const entry of playableSegments) {
      const row = (entry as any).__row;
      const segUrl = await this.minioService.getPresignedUrl(
        orgId,
        row.objectPath,
        3600,
      );
      playlistSegments.push({
        duration: entry.duration,
        url: segUrl,
      });
    }
    const m3u8 = buildDownloadPlaylist(playlistSegments);

    // Write m3u8 to temp file (FFmpeg needs seekable input for HLS)
    const { writeFile, unlink } = await import('fs/promises');
    const { join } = await import('path');
    const { randomUUID } = await import('crypto');
    const tmpPath = join('/tmp', `download-${randomUUID()}.m3u8`);
    await writeFile(tmpPath, m3u8);

    const { spawn } = await import('child_process');
    const ffmpeg = spawn('ffmpeg', buildRemuxArgs(tmpPath, 'pipe:1'), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    ffmpeg.stdout.pipe(res);

    // Capture stderr tail for diagnostics if FFmpeg exits with a non-zero code.
    // We intentionally keep it small (last 4KB) to avoid memory pressure on
    // long recordings while preserving enough context for error reporting.
    const stderrBuf: Buffer[] = [];
    let stderrBytes = 0;
    const MAX_STDERR = 4096;
    ffmpeg.stderr.on('data', (chunk: Buffer) => {
      stderrBuf.push(chunk);
      stderrBytes += chunk.length;
      while (stderrBytes > MAX_STDERR && stderrBuf.length > 1) {
        const head = stderrBuf.shift()!;
        stderrBytes -= head.length;
      }
    });

    ffmpeg.on('close', async (code) => {
      await unlink(tmpPath).catch(() => {});
      if (code !== 0) {
        const stderrTail = Buffer.concat(stderrBuf).toString('utf8').slice(-MAX_STDERR);
        // NestJS Logger isn't injected here; use console.error to surface the
        // tail in the API container log for future regressions (e.g. a new
        // ingest format lands that our `-c copy` pipeline can't handle).
        console.error(
          `[downloadRecording] FFmpeg exit=${code} recording=${id} tail=\n${stderrTail}`,
        );
      }
    });

    ffmpeg.on('error', async () => {
      await unlink(tmpPath).catch(() => {});
      if (!res.headersSent) {
        res.status(500).json({ message: 'Download failed' });
      }
    });
  }

  @Get(':id/manifest')
  async getManifest(
    @Param('id') id: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Res() res?: Response,
  ) {
    const orgId = this.cls.get('ORG_ID');
    const startTime = start ? new Date(start) : undefined;
    const endTime = end ? new Date(end) : undefined;

    const manifest = await this.manifestService.generateManifest(
      id,
      orgId,
      startTime,
      endTime,
    );

    res!.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res!.send(manifest);
  }

  @Get(':id/init-segment')
  @ApiExcludeEndpoint()
  async proxyInitSegment(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    // Retained for forward-compat: when SRS is upgraded to v7.0.51+ and
    // hls_use_fmp4 is re-enabled, manifest.service will start emitting
    // EXT-X-MAP pointing here. Today (SRS v6 MPEG-TS) no recording has an
    // initSegment, so serve the row's value if present or return 400.
    const orgId = this.cls.get('ORG_ID');
    const recording = await this.recordingsService.getRecording(id, orgId);
    if (!recording.initSegment) {
      throw new BadRequestException('Recording has no init segment');
    }
    const stream = await this.minioService.getObjectStream(orgId, recording.initSegment);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  }

  @Get(':id')
  async getRecording(@Param('id') id: string) {
    const orgId = this.cls.get('ORG_ID');
    return this.recordingsService.getRecording(id, orgId);
  }

  @Delete(':id')
  async deleteRecording(@Param('id') id: string) {
    const orgId = this.cls.get('ORG_ID');
    await this.recordingsService.deleteRecording(id, orgId);
    return { success: true };
  }

  @Get('segments/:segmentId/proxy')
  @ApiExcludeEndpoint()
  async proxySegment(
    @Param('segmentId') segmentId: string,
    @Res() res: Response,
  ) {
    const orgId = this.cls.get('ORG_ID');
    const segment = await this.recordingsService.getSegment(segmentId, orgId);
    const stream = await this.minioService.getObjectStream(orgId, segment.objectPath);

    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  }
}
