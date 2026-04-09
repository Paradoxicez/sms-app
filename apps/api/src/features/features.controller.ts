import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { FeaturesService } from './features.service';

/**
 * Endpoint to retrieve org features for frontend consumption.
 * Protected by SuperAdminGuard for now (admin panel only).
 * When org-level auth is added, this should use an OrgMemberGuard instead.
 */
@Controller('api/organizations/:orgId/features')
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  @Get()
  @UseGuards(SuperAdminGuard)
  async getOrgFeatures(@Param('orgId') orgId: string) {
    const features = await this.featuresService.getOrgFeatures(orgId);
    return { features };
  }
}
