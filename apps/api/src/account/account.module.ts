import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { AuthModule } from '../auth/auth.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { REDIS_CLIENT } from '../api-keys/api-keys.service';
import { RecordingsModule } from '../recordings/recordings.module';
import { StatusModule } from '../status/status.module';
import { AvatarController } from './avatar/avatar.controller';
import { AvatarService } from './avatar/avatar.service';
import { PlanUsageController } from './plan-usage/plan-usage.controller';
import { PlanUsageService } from './plan-usage/plan-usage.service';

@Module({
  imports: [AuthModule, RecordingsModule, StatusModule, ApiKeysModule],
  controllers: [AvatarController, PlanUsageController],
  providers: [
    AvatarService,
    PlanUsageService,
    {
      provide: REDIS_CLIENT,
      useFactory: () =>
        new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        }),
    },
  ],
})
export class AccountModule {}
