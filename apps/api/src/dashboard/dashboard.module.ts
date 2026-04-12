import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { SrsModule } from '../srs/srs.module';

@Module({
  imports: [SrsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
