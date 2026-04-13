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

@ApiTags('Recordings')
@Controller('api/recordings')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature(FeatureKey.RECORDINGS)
export class RecordingsController {
  constructor(
    private readonly recordingsService: RecordingsService,
    private readonly manifestService: ManifestService,
    private readonly minioService: MinioService,
    private readonly cls: ClsService,
  ) {}

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
  ) {
    const orgId = this.cls.get('ORG_ID');
    return this.recordingsService.listRecordings(cameraId, orgId, date);
  }

  @Get('camera/:cameraId/timeline')
  async getTimeline(
    @Param('cameraId') cameraId: string,
    @Query('date') date: string,
  ) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Query param "date" is required in YYYY-MM-DD format');
    }
    const orgId = this.cls.get('ORG_ID');
    const hours = await this.manifestService.getSegmentsForDate(cameraId, orgId, date);
    return { hours };
  }

  @Get('camera/:cameraId/calendar')
  async getCalendar(
    @Param('cameraId') cameraId: string,
    @Query('year') yearStr: string,
    @Query('month') monthStr: string,
  ) {
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new BadRequestException('Query params "year" and "month" are required (month 1-12)');
    }
    const orgId = this.cls.get('ORG_ID');
    const days = await this.manifestService.getDaysWithRecordings(cameraId, orgId, year, month);
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

    res.setHeader('Content-Type', 'video/iso.segment');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  }
}
