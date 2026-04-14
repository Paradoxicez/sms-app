import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
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

/**
 * Feature check endpoint for authenticated users.
 * Uses CLS to get orgId from session — users can only check their own org's features.
 */
@Controller('api/features')
export class FeatureCheckController {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly cls: ClsService,
  ) {}

  @Get('check')
  @UseGuards(AuthGuard)
  async checkFeature(@Query('key') key: string): Promise<{ enabled: boolean }> {
    const orgId = this.cls.get('ORG_ID');
    if (!orgId) {
      return { enabled: false };
    }
    const enabled = await this.featuresService.checkFeature(orgId, key);
    return { enabled };
  }
}
