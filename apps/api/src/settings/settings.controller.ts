import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { SettingsService } from './settings.service';
import { UpdateSystemSettingsSchema } from './dto/update-system-settings.dto';
import { UpdateOrgSettingsSchema } from './dto/update-org-settings.dto';

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
  async getSystemSettings() {
    return this.settingsService.getSystemSettings();
  }

  @Patch('admin/settings/stream-engine')
  @UseGuards(SuperAdminGuard)
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
  async getOrgSettings() {
    return this.settingsService.getOrgSettings(this.getOrgId());
  }

  @Patch('settings/org')
  @UseGuards(AuthGuard)
  async updateOrgSettings(@Body() body: unknown) {
    const result = UpdateOrgSettingsSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.settingsService.updateOrgSettings(this.getOrgId(), result.data);
  }
}
