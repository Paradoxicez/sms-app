import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiExcludeController,
} from '@nestjs/swagger';
import { z } from 'zod';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import {
  AdminDashboardService,
  StorageForecastRange,
} from './admin-dashboard.service';

// Zod schemas enforce T-18-DOS-FORECAST + T-18-DOS-AUDIT input bounds.
const storageRangeSchema = z.enum(['7d', '30d']);
const auditLimitSchema = z.coerce.number().int().min(1).max(10).default(7);

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

  // ────────────────────────────────────────────────────────────────────────
  // Phase 18 additions (Plan 01)
  // ────────────────────────────────────────────────────────────────────────

  @Get('active-streams')
  @ApiOperation({ summary: 'Active SRS publisher count (D-05)' })
  @ApiResponse({ status: 200, description: '{ count }' })
  getActiveStreamsCount() {
    return this.adminDashboardService.getActiveStreamsCount();
  }

  @Get('recordings-active')
  @ApiOperation({ summary: 'Platform-wide count of cameras recording (D-05)' })
  @ApiResponse({ status: 200, description: '{ count }' })
  getRecordingsActive() {
    return this.adminDashboardService.getRecordingsActive();
  }

  @Get('platform-issues')
  @ApiOperation({ summary: 'Critical/warning platform issues feed (D-09)' })
  @ApiResponse({ status: 200, description: 'PlatformIssue[]' })
  getPlatformIssues() {
    return this.adminDashboardService.getPlatformIssues();
  }

  @Get('cluster-nodes')
  @ApiOperation({ summary: 'Origin + edge cluster nodes (D-08)' })
  @ApiResponse({ status: 200, description: 'SrsNode[]' })
  getClusterNodes() {
    return this.adminDashboardService.getClusterNodes();
  }

  @Get('storage-forecast')
  @ApiOperation({ summary: 'Storage growth forecast (D-10)' })
  @ApiResponse({ status: 200, description: '{ points, estimatedDaysUntilFull }' })
  getStorageForecast(@Query('range') rangeRaw?: string) {
    // T-18-DOS-FORECAST: reject anything outside the small enum.
    const parsed = storageRangeSchema.safeParse(rangeRaw ?? '7d');
    if (!parsed.success) {
      throw new BadRequestException(
        'range must be one of 7d or 30d',
      );
    }
    return this.adminDashboardService.getStorageForecast(
      parsed.data as StorageForecastRange,
    );
  }

  @Get('recent-audit')
  @ApiOperation({ summary: 'Recent structural audit highlights (D-11)' })
  @ApiResponse({ status: 200, description: 'AuditLog[] (max 10)' })
  getRecentAuditHighlights(@Query('limit') limitRaw?: string) {
    // T-18-DOS-AUDIT: clamp limit to 10.
    const parsed = auditLimitSchema.safeParse(limitRaw ?? 7);
    if (!parsed.success) {
      throw new BadRequestException('limit must be an integer between 1 and 10');
    }
    return this.adminDashboardService.getRecentAuditHighlights(parsed.data);
  }

  @Get('org-health')
  @ApiOperation({ summary: 'Per-org health overview (D-12)' })
  @ApiResponse({ status: 200, description: 'OrgHealth[] sorted by max usage' })
  getOrgHealthOverview() {
    return this.adminDashboardService.getOrgHealthOverview();
  }
}
