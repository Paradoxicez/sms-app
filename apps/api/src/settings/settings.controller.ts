import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { SettingsService } from './settings.service';
import { UpdateSystemSettingsSchema } from './dto/update-system-settings.dto';
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

  // ─── System Settings (Super Admin) ─────────────

  @Get('admin/settings/stream-engine')
  @UseGuards(SuperAdminGuard)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Get system-wide stream engine settings (super admin)' })
  @ApiResponse({ status: 200, description: 'System settings' })
  async getSystemSettings() {
    return this.settingsService.getSystemSettings();
  }

  @Patch('admin/settings/stream-engine')
  @UseGuards(SuperAdminGuard)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Update system-wide stream engine settings (super admin)' })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async updateSystemSettings(@Body() body: unknown) {
    const result = UpdateSystemSettingsSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.settingsService.updateSystemSettings(result.data);
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
