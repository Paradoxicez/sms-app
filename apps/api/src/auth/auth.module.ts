import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './guards/auth.guard';
import { OrgAdminGuard } from './guards/org-admin.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthGuard, OrgAdminGuard],
  exports: [AuthGuard, OrgAdminGuard],
})
export class AuthModule {}
