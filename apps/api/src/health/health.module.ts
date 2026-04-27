import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * HealthModule registers the public liveness endpoint.
 * No providers, no imports — pure controller declaration.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
