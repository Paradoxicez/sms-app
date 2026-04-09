import { Global, Module } from '@nestjs/common';
import { FeaturesService } from './features.service';
import { FeatureGuard } from './features.guard';
import { FeaturesController } from './features.controller';

@Global()
@Module({
  controllers: [FeaturesController],
  providers: [FeaturesService, FeatureGuard],
  exports: [FeaturesService, FeatureGuard],
})
export class FeaturesModule {}
