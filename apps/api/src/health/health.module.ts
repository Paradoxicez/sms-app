import { Module, forwardRef } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SrsModule } from '../srs/srs.module';

/**
 * HealthModule registers the public liveness endpoint plus the deep
 * readiness check (`/api/health/deep`, added 2026-04-30 task H).
 *
 * Imports SrsModule via forwardRef because SrsModule re-exports
 * SrsApiService and the existing module graph already routes through
 * forwardRef wherever the SRS surface is touched (CamerasModule,
 * StreamsModule). PrismaModule is @Global so SystemPrismaService
 * resolves without an explicit import; same for the StreamHealthModule
 * that exports StreamHealthMetricsService.
 */
@Module({
  imports: [forwardRef(() => SrsModule)],
  controllers: [HealthController],
})
export class HealthModule {}
