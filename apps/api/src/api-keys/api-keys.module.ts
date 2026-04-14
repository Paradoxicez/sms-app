import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService, REDIS_CLIENT } from './api-keys.service';
import { ApiKeyGuard } from './api-key.guard';
import { AuthOrApiKeyGuard } from './auth-or-apikey.guard';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyUsageProcessor } from './api-key-usage.processor';
import { ApiKeyUsageMiddleware } from './api-key-usage.middleware';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'api-key-usage' }),
    AuthModule,
  ],
  controllers: [ApiKeysController],
  providers: [
    ApiKeysService,
    ApiKeyGuard,
    AuthOrApiKeyGuard,
    ApiKeyUsageProcessor,
    ApiKeyUsageMiddleware,
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
        });
      },
    },
  ],
  exports: [ApiKeysService, ApiKeyGuard, AuthOrApiKeyGuard],
})
export class ApiKeysModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiKeyUsageMiddleware).forRoutes('api/*');
  }
}
