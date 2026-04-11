import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService, REDIS_CLIENT } from './api-keys.service';
import { ApiKeyGuard } from './api-key.guard';
import { AuthOrApiKeyGuard } from './auth-or-apikey.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { ApiKeyUsageProcessor } from './api-key-usage.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'api-key-usage' }),
  ],
  controllers: [ApiKeysController],
  providers: [
    ApiKeysService,
    ApiKeyGuard,
    AuthOrApiKeyGuard,
    AuthGuard,
    ApiKeyUsageProcessor,
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6380', 10),
        });
      },
    },
  ],
  exports: [ApiKeysService, ApiKeyGuard, AuthOrApiKeyGuard],
})
export class ApiKeysModule {}
