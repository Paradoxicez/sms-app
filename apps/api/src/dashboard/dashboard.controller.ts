import {
  Controller,
  Get,
  Query,
  UseGuards,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { AuthGuard } from '../auth/guards/auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@Controller('api/dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly cls: ClsService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics for current org' })
  async getStats() {
    const orgId = this.cls.get('ORG_ID');
    return this.dashboardService.getStats(orgId);
  }

  @Get('system-metrics')
  @ApiOperation({ summary: 'Get SRS system metrics (super admin only)' })
  async getSystemMetrics(@Req() req: any) {
    // Super admin check: user must have 'admin' role
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException(
        'System metrics are restricted to super admins',
      );
    }

    return this.dashboardService.getSystemMetrics();
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get usage time series data' })
  async getUsage(@Query('range') range?: string) {
    const orgId = this.cls.get('ORG_ID');
    const validRanges = ['24h', '7d', '30d'];
    const selectedRange = validRanges.includes(range as string)
      ? (range as '24h' | '7d' | '30d')
      : '7d';
    return this.dashboardService.getUsageTimeSeries(orgId, selectedRange);
  }

  @Get('cameras')
  @ApiOperation({ summary: 'Get camera status list for dashboard' })
  async getCameras() {
    const orgId = this.cls.get('ORG_ID');
    return this.dashboardService.getCameraStatusList(orgId);
  }
}
