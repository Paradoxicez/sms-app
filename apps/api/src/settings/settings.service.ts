import { Inject, Injectable, Logger } from '@nestjs/common';
import { TENANCY_CLIENT } from '../tenancy/prisma-tenancy.extension';
import { UpdateOrgSettingsDto } from './dto/update-org-settings.dto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @Inject(TENANCY_CLIENT) private readonly tenantPrisma: any,
  ) {}

  // ─── Org Settings ─────────────────────────────

  async getOrgSettings(orgId: string) {
    let settings = await this.tenantPrisma.orgSettings.findUnique({
      where: { orgId },
    });
    if (!settings) {
      settings = await this.tenantPrisma.orgSettings.create({
        data: { orgId },
      });
      this.logger.log(`Created default org settings for ${orgId}`);
    }
    return settings;
  }

  async updateOrgSettings(orgId: string, dto: UpdateOrgSettingsDto) {
    return this.tenantPrisma.orgSettings.upsert({
      where: { orgId },
      update: dto,
      create: { orgId, ...dto },
    });
  }
}
