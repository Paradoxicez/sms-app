import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SettingsService } from './settings.service';
import { UpdateOrgSettingsSchema } from './dto/update-org-settings.dto';

@ApiTags('Settings')
@Controller('api')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly cls: ClsService,
  ) {}

  private getOrgId(): string {
    const orgId = this.cls.get('ORG_ID');
    if (!orgId) {
      throw new BadRequestException('No active organization');
    }
    return orgId;
  }

  // ─── Org Settings ─────────────────────────────

  @Get('settings/org')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get organization settings' })
  @ApiResponse({ status: 200, description: 'Organization settings' })
  async getOrgSettings() {
    return this.settingsService.getOrgSettings(this.getOrgId());
  }

  @Patch('settings/org')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Update organization settings' })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async updateOrgSettings(@Body() body: unknown) {
    const result = UpdateOrgSettingsSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.settingsService.updateOrgSettings(this.getOrgId(), result.data);
  }
}
