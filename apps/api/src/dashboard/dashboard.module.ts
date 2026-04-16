import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { SrsModule } from '../srs/srs.module';
import { REDIS_CLIENT } from '../api-keys/api-keys.service';

@Module({
  imports: [SrsModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
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
})
export class DashboardModule {}
