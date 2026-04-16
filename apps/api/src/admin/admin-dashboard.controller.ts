import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeController } from '@nestjs/swagger';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { AdminDashboardService } from './admin-dashboard.service';

@ApiExcludeController()
@ApiTags('Admin Dashboard')
@Controller('api/admin/dashboard')
@UseGuards(SuperAdminGuard)
export class AdminDashboardController {
  constructor(
    private readonly adminDashboardService: AdminDashboardService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get platform-wide dashboard stats (super admin only)' })
  @ApiResponse({ status: 200, description: 'Platform stats' })
  getStats() {
    return this.adminDashboardService.getPlatformStats();
  }

  @Get('system-metrics')
  @ApiOperation({ summary: 'Get SRS system metrics (super admin only)' })
  @ApiResponse({ status: 200, description: 'System metrics' })
  getSystemMetrics() {
    return this.adminDashboardService.getSystemMetrics();
  }

  @Get('orgs')
  @ApiOperation({ summary: 'Get per-org camera summary (super admin only)' })
  @ApiResponse({ status: 200, description: 'Organization summary list' })
  getOrgSummary() {
    return this.adminDashboardService.getOrgSummary();
  }
}
