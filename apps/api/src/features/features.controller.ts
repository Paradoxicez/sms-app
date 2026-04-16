import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import type { Request } from 'express';
import { AuthGuard } from '../auth/guards/auth.guard';
import { FeaturesService } from './features.service';

/**
 * Endpoint to retrieve org features for frontend consumption.
 * AuthGuard + active-org check: any authenticated Member of the org may read
 * their org's features (needed by TenantNav feature filtering).
 * Super admins may read any org's features.
 */
@ApiExcludeController()
@Controller('api/organizations/:orgId/features')
export class FeaturesController {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly cls: ClsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async getOrgFeatures(
    @Param('orgId') orgId: string,
    @Req() req: Request,
  ) {
    const user = (req as unknown as { user?: { role?: string } }).user;
    const activeOrgId = this.cls.get<string>('ORG_ID');
    if (user?.role !== 'admin' && activeOrgId !== orgId) {
      throw new ForbiddenException('Cannot read features of a different org');
    }
    const features = await this.featuresService.getOrgFeatures(orgId);
    return { features };
  }
}

/**
 * Feature check endpoint for authenticated users.
 * Uses CLS to get orgId from session — users can only check their own org's features.
 */
@ApiExcludeController()
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
