import { Controller, Get, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';

/**
 * AdminController provides shared admin endpoints.
 * Individual resource controllers (packages, organizations) handle their own routes.
 */
@Controller('api/admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  @Get('health')
  health() {
    return { status: 'ok', role: 'super-admin' };
  }
}
