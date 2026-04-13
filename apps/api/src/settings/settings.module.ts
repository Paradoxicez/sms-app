import { Module } from '@nestjs/common';
import { SrsModule } from '../srs/srs.module';
import { ClusterModule } from '../cluster/cluster.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [SrsModule, ClusterModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
