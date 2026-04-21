import { Module } from '@nestjs/common';
import { PackagesModule } from '../packages/packages.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SrsModule } from '../srs/srs.module';
import { ClusterModule } from '../cluster/cluster.module';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminAuditLogController } from './admin-audit-log.controller';
import { AdminAuditLogService } from './admin-audit-log.service';

/**
 * AdminModule is an umbrella module that imports all admin-related modules.
 * Super admin endpoints are organized under /api/admin/*.
 *
 * ClusterModule exports ClusterService so AdminDashboardService can delegate
 * getClusterNodes() to the same source of truth used by /admin/cluster.
 */
@Module({
  imports: [PackagesModule, OrganizationsModule, SrsModule, ClusterModule],
  controllers: [AdminDashboardController, AdminAuditLogController],
  providers: [AdminDashboardService, AdminAuditLogService],
})
export class AdminModule {}
