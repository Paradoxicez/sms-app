import { Module } from '@nestjs/common';
import { PackagesModule } from '../packages/packages.module';
import { OrganizationsModule } from '../organizations/organizations.module';

/**
 * AdminModule is an umbrella module that imports all admin-related modules.
 * Super admin endpoints are organized under /api/admin/*.
 */
@Module({
  imports: [PackagesModule, OrganizationsModule],
})
export class AdminModule {}
