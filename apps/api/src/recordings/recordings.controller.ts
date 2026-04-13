import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { FeatureGuard, RequireFeature } from '../features/features.guard';
import { FeatureKey } from '../features/feature-key.enum';
import { RecordingsService } from './recordings.service';
import { startRecordingSchema } from './dto/start-recording.dto';

@ApiTags('Recordings')
@Controller('api/recordings')
@UseGuards(AuthGuard, FeatureGuard)
@RequireFeature(FeatureKey.RECORDINGS)
export class RecordingsController {
  constructor(
    private readonly recordingsService: RecordingsService,
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
}
