import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { RecordingsModule } from '../recordings/recordings.module';
import { StatusModule } from '../status/status.module';
import { AvatarController } from './avatar/avatar.controller';
import { AvatarService } from './avatar/avatar.service';
import { PlanUsageController } from './plan-usage/plan-usage.controller';
import { PlanUsageService } from './plan-usage/plan-usage.service';

/**
 * AccountModule — user self-service surface:
 *   - POST/DELETE /api/users/me/avatar      (AvatarController)
 *   - GET         /api/organizations/:orgId/plan-usage (PlanUsageController)
 *
 * Depends on RecordingsModule (re-exports MinioService), StatusModule
 * (re-exports StatusService globally), and ApiKeysModule (re-exports
 * REDIS_CLIENT). PrismaModule is @Global() so no explicit import needed.
 * AuthModule is required so AuthGuard's getAuth() resolver works.
 */
@Module({
  imports: [AuthModule, RecordingsModule, StatusModule, ApiKeysModule],
  controllers: [AvatarController, PlanUsageController],
  providers: [AvatarService, PlanUsageService],
})
export class AccountModule {}
