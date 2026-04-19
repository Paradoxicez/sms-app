import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanUsageService, PlanUsageResponse } from './plan-usage.service';

/**
 * PlanUsageController — GET /api/organizations/:orgId/plan-usage.
 *
 * Enforces T-16-05 (cross-org leakage) via explicit Member.findFirst check.
 * Any authenticated user calling with an orgId they do NOT belong to gets 403,
 * never the package/usage payload.
 */
@ApiExcludeController()
@UseGuards(AuthGuard)
@Controller('api/organizations/:orgId/plan-usage')
export class PlanUsageController {
  constructor(
    private readonly planUsage: PlanUsageService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async get(
    @Param('orgId') orgId: string,
    @Req() req: Request,
  ): Promise<PlanUsageResponse> {
    const userId = (req as any).user.id;
    const membership = await this.prisma.member.findFirst({
      where: { organizationId: orgId, userId },
      select: { userId: true },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this organization');
    }
    return this.planUsage.getPlanUsage(orgId);
  }
}
