import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeController } from '@nestjs/swagger';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';

/**
 * AdminController provides shared admin endpoints.
 * Individual resource controllers (packages, organizations) handle their own routes.
 */
@ApiExcludeController()
@ApiTags('Admin')
@Controller('api/admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  @Get('health')
  @ApiOperation({ summary: 'Admin health check (super admin only)' })
  @ApiResponse({ status: 200, description: 'Admin health status' })
  health() {
    return { status: 'ok', role: 'super-admin' };
  }
}
